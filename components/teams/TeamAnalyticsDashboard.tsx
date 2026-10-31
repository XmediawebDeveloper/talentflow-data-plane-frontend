'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  BarChart3,
  AlertCircle,
  Download,
  ImageDown,
  ChartLine,
  Loader2,
  Info,
} from 'lucide-react';
import {
  exportData,
  formatTeamUsageForExport,
  TEAM_USAGE_COLUMNS,
  type ExportFileFormat,
} from '@/lib/utils/exportUtils';
import { Button } from '@/components/ui/button';
import ExportFormatModal from '@/components/ExportFormatModal';
import ToolbarFilterSelect from '@/components/ui/toolbar-filter-select';
import { DateField } from '@/components/ui/date-field';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts';
import teamService, { AllTeamsUsageSummary, TeamUsageSummary } from '@/lib/services/teamService';
import { unitPoolService, type ConsumptionLogEntry } from '@/lib/services/unitPoolService';
import NameAvatar from '@/components/ui/name-avatar';
import { useAllMembersUsage } from './TeamUsageAnalytics';
import { toISODateIST } from '@/lib/utils/dateUtils';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/components/providers/AuthProvider';
import { useIsMobile } from '@/components/ui/use-mobile';
import { useTeamReportRange, RangePresets, todayIST, UnitStatCard, UNIT_STAT_GRID, ReportScopeBadge, type Measure } from './reportControls';
import { UNIT_KEYS, UNIT_LABELS, UNIT_CHART_COLOR, UNIT_TEXT_CLASS, UNIT_ICON, TOTAL_UNITS_ICON, type UnitKey } from '@/lib/constants/unitColors';

interface TeamAnalyticsDashboardProps {
  userRole: string;
  /** Opens a team in the Team Usage tab (bar / list click). Omitted = not clickable. */
  onOpenTeam?: (teamId: string) => void;
}

/** Bars shown before "Show all" — beyond ~10 the labels squeeze together. */
const CHART_TEAM_LIMIT = 10;

/** Units as shown everywhere on this tab: whole numbers stay whole, fractions
 *  get one decimal — so the cards add up to the Total card. */
const formatUnits = (units: number) => (Number.isInteger(units) ? units.toLocaleString() : units.toFixed(1));

const formatMeasure = (v: number, m: Measure) => (m === 'units' ? formatUnits(v) : v.toLocaleString());

// Theme-aware chart chrome (the tooltip used to be hard-coded white).
const TOOLTIP_STYLE = {
  backgroundColor: 'var(--popover)',
  color: 'var(--popover-foreground)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
};
const AXIS_TICK = { fill: 'var(--muted-foreground)' };

/** Recharts 3 sorts tooltip rows by name and legend items by label (A–Z), which put
 *  AI Assessment first. Keep Resume Units, Resume Scoring, AI Assessment, AI Interview, Total. */
const SERIES_ORDER = [...UNIT_KEYS.map((k) => UNIT_LABELS[k]), 'Total'];
const bySeriesOrder = (item: { name?: unknown }) => SERIES_ORDER.indexOf(String(item.name));

/** Totals across a set of teams: units, action counts, and what was created. */
function aggregate(teams: TeamUsageSummary[] | undefined) {
  const totals = { RS: 0, AS: 0, AIU: 0, RU: 0, total: 0 };
  const actionCounts = { RS: 0, AS: 0, AIU: 0, RU: 0, total: 0 };
  const creationCounts = { jds: 0, assessments: 0 };
  for (const team of teams ?? []) {
    for (const k of UNIT_KEYS) {
      totals[k] += team.by_type?.[k]?.total_consumed || 0;
      actionCounts[k] += team.by_type?.[k]?.consumption_count || 0;
    }
    creationCounts.jds += team.jds_created || 0;
    creationCounts.assessments += team.assessments_created || 0;
  }
  totals.total = totals.RS + totals.AS + totals.AIU + totals.RU;
  actionCounts.total = actionCounts.RS + actionCounts.AS + actionCounts.AIU + actionCounts.RU;
  return { totals, actionCounts, creationCounts };
}


// ─── Daily trend (built from the consumption history) ────────────────────────

/** Entries read for the trend; beyond this the chart notes it's partial. */
const TREND_LIMIT = 5000;
type TrendRow = { date: string; label: string } & Record<`${UnitKey | 'total'}` | `${UnitKey | 'total'}_u`, number>;
type TrendStep = 'day' | 'week';

/** Days rolled up into 7-day buckets from the range start, labelled by their first day. */
function toWeeks(rows: TrendRow[]): TrendRow[] {
  const out: TrendRow[] = [];
  for (let i = 0; i < rows.length; i += 7) {
    const chunk = rows.slice(i, i + 7);
    const week = { date: chunk[0].date, label: `${chunk[0].label} – ${chunk[chunk.length - 1].label}` } as TrendRow;
    for (const k of [...UNIT_KEYS, 'total'] as const) {
      week[k] = chunk.reduce((sum, r) => sum + r[k], 0);
      week[`${k}_u`] = chunk.reduce((sum, r) => sum + r[`${k}_u`], 0);
    }
    out.push(week);
  }
  return out;
}

/** Every IST day in [from, to] as YYYY-MM-DD. */
function daysInRange(from: string, to: string) {
  const parse = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const out: string[] = [];
  for (let t = parse(from); t <= parse(to); t += 86_400_000) out.push(new Date(t).toISOString().split('T')[0]);
  return out;
}

/** Successful entries bucketed per day: actions under RS…, units under RS_u…. */
// The request asks for status=SUCCESS, but the server has been seen ignoring that
// filter, so failed / blocked entries are dropped here as well.
function bucketByDay(entries: ConsumptionLogEntry[], from: string, to: string): TrendRow[] {
  const rows = daysInRange(from, to).map((date) => {
    const [, m, d] = date.split('-').map(Number);
    const label = new Date(Date.UTC(2000, m - 1, d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    const row = { date, label } as TrendRow;
    for (const k of [...UNIT_KEYS, 'total'] as const) { row[k] = 0; row[`${k}_u`] = 0; }
    return row;
  });
  const index = new Map(rows.map((r, i) => [r.date, i]));
  for (const e of entries) {
    if (e.status !== 'SUCCESS') continue;
    const k = e.unit_type as UnitKey;
    if (!UNIT_KEYS.includes(k)) continue;
    const i = index.get(toISODateIST(e.created_at));
    if (i === undefined) continue;
    rows[i][k] += 1;
    rows[i][`${k}_u`] += e.units_consumed || 0;
    rows[i].total += 1;
    rows[i].total_u += e.units_consumed || 0;
  }
  return rows;
}

// ─── Chart → PNG ──────────────────────────────────────────────────────────────

/** "2026-10-01" → "1 Oct 2026" (the date as picked, no timezone shift). */
function formatRangeDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** An SVG as an image, with colours and fonts copied in as computed values —
 *  CSS variables don't resolve once the SVG leaves the page. */
async function svgToImage(svg: SVGSVGElement, width: number, height: number) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const src = [svg, ...svg.querySelectorAll('*')];
  const dst = [clone, ...clone.querySelectorAll('*')];
  src.forEach((el, i) => {
    const cs = getComputedStyle(el);
    const target = dst[i] as SVGElement;
    for (const prop of ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'font-size', 'font-family', 'font-weight']) {
      target.style.setProperty(prop, cs.getPropertyValue(prop));
    }
  });
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(); img.src = url; });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Saves a chart as a PNG laid out like its card: the card's title and `subtitle`
 *  on top, then everything inside `root` where it sits on screen — the chart SVG,
 *  Recharts' legend (HTML, so not part of the SVG), and any HTML marked
 *  `data-export-text` (single-line text) or `data-export-swatch` (a colour dot). */
async function downloadChartPng(root: HTMLElement | null, filename: string, subtitle: string) {
  if (!root) return;
  const card = root.closest('[data-chart-card]') as HTMLElement | null;
  const box = root.getBoundingClientRect();
  if (!box.width || !box.height) return;

  const pad = 24;
  const titleEl = card?.querySelector('h4') as HTMLElement | null;
  const title = titleEl?.textContent?.trim() ?? '';
  const headerH = title ? 52 : 0;
  const width = box.width + pad * 2;
  const height = box.height + headerH + pad * 2;
  const at = (el: Element) => {
    const r = el.getBoundingClientRect();
    return { x: pad + r.left - box.left, y: pad + headerH + r.top - box.top, w: r.width, h: r.height };
  };

  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(scale, scale);
  ctx.fillStyle = (card && getComputedStyle(card).backgroundColor) || '#ffffff';
  ctx.fillRect(0, 0, width, height);

  if (titleEl) {
    const cs = getComputedStyle(titleEl);
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = cs.color;
    ctx.font = `600 16px ${cs.fontFamily}`;
    ctx.fillText(title, pad, pad + 16);
    ctx.fillStyle = getComputedStyle(root).getPropertyValue('--muted-foreground').trim() || '#6b7280';
    ctx.font = `400 12px ${cs.fontFamily}`;
    ctx.fillText(subtitle, pad, pad + 36);
  }

  // Every outermost SVG: the chart itself and the legend's little icons.
  const svgs = [...root.querySelectorAll('svg')].filter((el) => !el.parentElement?.closest('svg'));
  for (const svg of svgs) {
    const p = at(svg);
    if (!p.w || !p.h) continue;
    try {
      ctx.drawImage(await svgToImage(svg, p.w, p.h), p.x, p.y, p.w, p.h);
    } catch {
      // One icon failing shouldn't cost the whole image.
    }
  }

  root.querySelectorAll<HTMLElement>('[data-export-swatch]').forEach((el) => {
    const p = at(el);
    ctx.fillStyle = getComputedStyle(el).backgroundColor;
    ctx.beginPath();
    ctx.arc(p.x + p.w / 2, p.y + p.h / 2, Math.min(p.w, p.h) / 2, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  root.querySelectorAll<HTMLElement>('.recharts-legend-item-text, [data-export-text]').forEach((el) => {
    const p = at(el);
    const cs = getComputedStyle(el);
    ctx.fillStyle = cs.color;
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    ctx.fillText(el.textContent ?? '', p.x, p.y + p.h / 2);
  });

  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${filename}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, 'image/png');
}

function ChartDownloadButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Download as PNG"
      aria-label="Download chart as PNG"
      className="shrink-0 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-brand-blue dark:hover:bg-slate-800"
    >
      <ImageDown className="h-4 w-4" />
    </button>
  );
}

/** The five members who used the most units in the range (admin only). */
function TopMembersCard({ teams, fromDate, toDate }: { teams: TeamUsageSummary[]; fromDate: string; toDate: string }) {
  const { rows, loading } = useAllMembersUsage(teams, fromDate, toDate);
  const top = [...rows].filter((r) => r.total > 0).sort((a, b) => b.total - a.total).slice(0, 5);
  const max = top[0]?.total ?? 0;
  return (
    <div className={`${CARD_CLASS} p-6 max-sm:p-3`}>
      <h4 className="text-base max-sm:text-sm font-semibold text-gray-900 dark:text-slate-50 mb-3 sm:mb-4">Top Members</h4>
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
        </div>
      ) : top.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400 dark:text-slate-500">No member usage in this range.</p>
      ) : (
        <ul className="space-y-2 sm:space-y-3">
          {top.map((m, i) => (
            <li key={m.id} className="flex items-center gap-3 rounded-xl bg-gray-50 p-2.5 sm:p-3 ring-1 ring-gray-100 dark:bg-slate-800/50 dark:ring-slate-700/60">
              <span className="w-4 shrink-0 text-center text-xs font-semibold tabular-nums text-gray-400 dark:text-slate-500">{i + 1}</span>
              <NameAvatar name={m.name} fallback={m.email} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm max-sm:text-[13px] font-medium text-gray-900 dark:text-slate-50">{m.name}</p>
                <p className="truncate text-xs text-gray-500 dark:text-slate-400" title={m.teams.join(', ')}>{m.teams.join(', ')}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm sm:text-base font-semibold tabular-nums text-gray-900 dark:text-slate-50">{m.total.toLocaleString()}</p>
                {/* Relative to the top member, so the list reads as a ranking. */}
                <div className="mt-1 h-1 w-16 overflow-hidden rounded-full bg-gray-200 dark:bg-slate-700">
                  <div className="h-full rounded-full bg-brand-blue" style={{ width: `${max > 0 ? Math.max((m.total / max) * 100, 4) : 0}%` }} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Same cards, labels and icons as Team Usage. */
const USAGE_CARDS = [
  { key: 'RU', label: 'Resume Units', Icon: UNIT_ICON.RU },
  { key: 'RS', label: 'Resume Scoring', Icon: UNIT_ICON.RS },
  { key: 'AS', label: 'AI Assessment', Icon: UNIT_ICON.AS },
  { key: 'AIU', label: 'AI Interview', Icon: UNIT_ICON.AIU },
  { key: 'total', label: 'Total Units', Icon: TOTAL_UNITS_ICON },
] as const;

const CARD_CLASS =
  'rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]';

export default function TeamAnalyticsDashboard({ userRole, onOpenTeam }: TeamAnalyticsDashboardProps) {
  const { isTenantAdmin: authIsTenantAdmin, hasPermissionCode } = useAuth();
  const canExport = authIsTenantAdmin || hasPermissionCode('teams:export');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamsUsage, setTeamsUsage] = useState<AllTeamsUsageSummary | null>(null);
  // Daily trend — loaded with the page, right after the totals.
  const [trend, setTrend] = useState<{ status: 'idle' | 'loading' | 'ready' | 'error'; rows: TrendRow[]; partial: { read: number; total: number } | null }>({ status: 'idle', rows: [], partial: null });
  const barChartRef = useRef<HTMLDivElement>(null);
  const pieChartRef = useRef<HTMLDivElement>(null);
  const trendChartRef = useRef<HTMLDivElement>(null);
  // Range and Actions / Units are shared with the Team Usage tab.
  const { fromDate, toDate, setFromDate, setToDate, applyPreset, activePresetId } = useTeamReportRange();
  // Units only — every unit type is 1 unit per action, so Actions showed the same numbers.
  const measure: Measure = 'units';
  const [showAllTeams, setShowAllTeams] = useState(false);
  // Unit Type Distribution: all teams ('') or one team.
  const [pieTeamId, setPieTeamId] = useState('');
  // null = automatic: weekly once the range is longer than a month.
  const [trendStepChoice, setTrendStepChoice] = useState<TrendStep | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const isMobile = useIsMobile();

  // Must match the backend's actual gate (current_user.is_tenant_admin) for the
  // all-teams-usage endpoint — a raw role-string comparison drifts from the
  // backend (e.g. 'admin' is no longer an automatic tenant_admin bypass there).
  const isTenantAdmin = authIsTenantAdmin;

  // Each fetch gets a number; a response for an older range (dates changed
  // quickly) is dropped instead of overwriting the newer one.
  const fetchSeq = useRef(0);
  // The trend reads up to TREND_LIMIT raw entries — wait for the range to settle.
  const trendTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (trendTimer.current) clearTimeout(trendTimer.current); }, []);

  // Daily trend from the raw history. `seq` drops a result for an old range.
  const fetchTrend = useCallback(async (seq: number, from: string, to: string) => {
    setTrend({ status: 'loading', rows: [], partial: null });
    try {
      const res = await unitPoolService.getConsumptionHistory({ start_date: from, end_date: to, status: 'SUCCESS', limit: TREND_LIMIT });
      if (seq !== fetchSeq.current) return; // range changed meanwhile
      const items: ConsumptionLogEntry[] = Array.isArray(res) ? res : res.items ?? [];
      const total = Array.isArray(res) ? items.length : res.total ?? items.length;
      setTrend({ status: 'ready', rows: bucketByDay(items, from, to), partial: total > items.length ? { read: items.length, total } : null });
    } catch {
      if (seq === fetchSeq.current) setTrend({ status: 'error', rows: [], partial: null });
    }
  }, []);

  const fetchAnalyticsData = useCallback(async () => {
    const seq = ++fetchSeq.current;
    setIsLoading(true);
    setError(null);
    setTrend({ status: 'idle', rows: [], partial: null });


    try {
      const data = isTenantAdmin
        ? await teamService.getAllTeamsUsage(fromDate, toDate)
        : ((await teamService.getMyTeamsUsage(fromDate, toDate)) as unknown as AllTeamsUsageSummary);
      if (seq !== fetchSeq.current) return;
      setTeamsUsage(data);
      // Daily trend by default (was behind a button); never holds up the page.
      if (trendTimer.current) clearTimeout(trendTimer.current);
      if (data?.teams?.length) trendTimer.current = setTimeout(() => fetchTrend(seq, fromDate, toDate), 500);
    } catch (err: unknown) {
      if (seq !== fetchSeq.current) return;
      console.error('Error fetching analytics:', err);
      if (typeof err === 'object' && err !== null && 'response' in err) {
        const response = (err as { response?: { data?: { detail?: { message?: string } } } }).response;
        setError(response?.data?.detail?.message || 'Failed to load analytics');
      } else {
        setError('Failed to load analytics');
      }
    } finally {
      if (seq === fetchSeq.current) setIsLoading(false);
    }
  }, [fromDate, toDate, isTenantAdmin, fetchTrend]);

  useEffect(() => {
    fetchAnalyticsData();
  }, [fetchAnalyticsData, userRole]);

  // Per-team rows for the bar chart and the most-active list. Keyed by team_id —
  // two teams named "Unknown" used to collide as React keys.
  const teamComparisonData = useMemo(() => {
    if (!teamsUsage?.teams) return [];

    // Values follow the Actions / Units toggle; sorted busiest first.
    return teamsUsage.teams
      .map((team) => {
        const value = (k: UnitKey) =>
          (measure === 'units' ? team.by_type?.[k]?.total_consumed : team.by_type?.[k]?.consumption_count) || 0;
        return {
          id: team.team_id,
          name: team.team_name || 'Unknown',
          RS: value('RS'),
          AS: value('AS'),
          AIU: value('AIU'),
          RU: value('RU'),
          total: UNIT_KEYS.reduce((sum, k) => sum + value(k), 0),
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [teamsUsage, measure]);
  const chartTeams = showAllTeams ? teamComparisonData : teamComparisonData.slice(0, CHART_TEAM_LIMIT);
  // Taller chart when every team is shown, so bars don't squeeze.
  const chartHeight = Math.max(isMobile ? 260 : 300, chartTeams.length * (isMobile ? 26 : 30) + 70);

  // Totals (units) and action counts across all teams.
  const { totals, actionCounts } = useMemo(() => aggregate(teamsUsage?.teams), [teamsUsage]);

  const shown = measure === 'units' ? totals : actionCounts;
  // Unit type distribution (pie) — all teams, or the team picked in its filter.
  const pieTeam = pieTeamId ? teamComparisonData.find((t) => t.id === pieTeamId) : undefined;
  const pieValues: Record<UnitKey | 'total', number> = pieTeam ?? shown;
  const unitDistributionData = useMemo(
    () =>
      UNIT_KEYS.filter((k) => pieValues[k] > 0).map((k) => ({
        name: UNIT_LABELS[k],
        value: parseFloat(pieValues[k].toFixed(2)),
        color: UNIT_CHART_COLOR[k],
      })),
    [pieValues],
  );

  // Most active teams — up to 5 that used something, and always at least 3
  // rows (topped up with the next teams, at 0) when there are 3+ teams.
  const topTeams = useMemo(() => {
    const active = teamComparisonData.filter((t) => t.total > 0);
    if (active.length >= 3) return active.slice(0, 5);
    return [...active, ...teamComparisonData.filter((t) => t.total === 0)].slice(0, 3);
  }, [teamComparisonData]);

  // Export handler — runs from the format picker
  const handleExport = async (format: ExportFileFormat) => {
    if (!teamsUsage?.teams) return;

    const formattedData = formatTeamUsageForExport(teamsUsage.teams);
    await exportData(format, formattedData, TEAM_USAGE_COLUMNS, `team-analytics-${fromDate}-to-${toDate}`, {
      sheetName: 'Team Analytics',
    });
  };

  const loadTrend = () => fetchTrend(fetchSeq.current, fromDate, toDate);
  // Shown under the title in downloaded chart images.
  const rangeLabel = `${formatRangeDate(fromDate)} – ${formatRangeDate(toDate)}`;

  const hasTeams = !!teamsUsage?.teams && teamsUsage.teams.length > 0;
  const trendStep: TrendStep = trendStepChoice ?? (trend.rows.length > 31 ? 'week' : 'day');
  const trendRows = trendStep === 'week' ? toWeeks(trend.rows) : trend.rows;
  // Teams that used nothing in the range — worth a nudge.
  const idleTeams = teamComparisonData.filter((t) => t.total === 0);
  const measureNoun = measure === 'units' ? 'units' : 'actions';

  // ── Content below the header. The header (with the date fields) stays put
  //    while loading or after an error, so the range can still be changed —
  //    it used to be swapped out for a skeleton / the error box. ──
  // The summary cards sit at the top of the tab, above the date controls;
  // `content` is everything below the controls.
  let cards: React.ReactNode = null;
  let content: React.ReactNode;
  if (isLoading) {
    cards = (
      <div className={UNIT_STAT_GRID}>
        {USAGE_CARDS.map(({ key, label, Icon }) => (
          <UnitStatCard key={key} label={label} value="" icon={Icon} strong={key === 'total'} loading />
        ))}
      </div>
    );
    content = (
      <>
        {/* Charts Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className={`${CARD_CLASS} p-6`}>
            <Skeleton className="h-5 w-32 mb-4" />
            <Skeleton className="h-[300px] w-full rounded-lg" />
          </div>
          <div className={`${CARD_CLASS} p-6`}>
            <Skeleton className="h-5 w-40 mb-4" />
            <Skeleton className="h-[300px] w-full rounded-lg" />
          </div>
        </div>
      </>
    );
  } else if (error) {
    content = (
      <div className="bg-destructive-subtle border border-destructive-line rounded-xl p-6 text-center">
        <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
        <h3 className="text-base max-sm:text-sm font-semibold text-destructive-strong mb-2">Error Loading Analytics</h3>
        <p className="text-sm max-sm:text-[13px] text-destructive">{error}</p>
        <p className="mt-1 text-xs text-destructive/80">Retry, or pick a different date range above.</p>
        <Button variant="primary" onClick={fetchAnalyticsData} className="mt-4">
          Retry
        </Button>
      </div>
    );
  } else {
    // Units used per module.
    cards = (
      <div className={UNIT_STAT_GRID}>
        {USAGE_CARDS.map(({ key, label, Icon }) => (
          <UnitStatCard
            key={key}
            label={label}
            value={formatMeasure((measure === 'units' ? totals : actionCounts)[key], measure)}
            icon={Icon}
            strong={key === 'total'}
          />
        ))}
      </div>
    );
    content = (
      <>
        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Team Comparison Bar Chart */}
          {teamComparisonData.length > 0 && (
            <div data-chart-card className={`${CARD_CLASS} p-6 max-sm:p-3`}>
              <div className="mb-3 sm:mb-4 flex items-center justify-between gap-2">
                <h4 className="text-base max-sm:text-sm font-semibold text-gray-900 dark:text-slate-50">
                  Usage by Team
                </h4>
                <div className="flex shrink-0 items-center gap-2">
                  {teamComparisonData.length > CHART_TEAM_LIMIT && (
                    <button
                      type="button"
                      onClick={() => setShowAllTeams((v) => !v)}
                      className="text-xs font-semibold text-brand-blue hover:underline"
                    >
                      {showAllTeams ? `Top ${CHART_TEAM_LIMIT}` : `Show all ${teamComparisonData.length}`}
                    </button>
                  )}
                  <ChartDownloadButton onClick={() => downloadChartPng(barChartRef.current, `usage-by-team-${fromDate}-to-${toDate}`, rangeLabel)} />
                </div>
              </div>
              <div ref={barChartRef} className="w-full" style={{ height: chartHeight }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartTeams}
                    layout="vertical"
                    style={onOpenTeam ? { cursor: 'pointer' } : undefined}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis type="number" tick={{ ...AXIS_TICK, fontSize: isMobile ? 10 : 12 }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={isMobile ? 72 : 100}
                      tick={{ ...AXIS_TICK, fontSize: isMobile ? 10 : 12 }}
                      tickFormatter={(value) => value.length > 15 ? `${value.slice(0, 15)}...` : value}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      labelStyle={{ color: 'var(--popover-foreground)' }}
                      cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
                      formatter={(value: number) => formatMeasure(value, measure)}
                      itemSorter={bySeriesOrder}
                    />
                    <Legend wrapperStyle={isMobile ? { fontSize: 11 } : undefined} itemSorter={null} />
                    {UNIT_KEYS.map((k) => (
                      <Bar
                        key={k}
                        dataKey={k}
                        name={UNIT_LABELS[k]}
                        fill={UNIT_CHART_COLOR[k]}
                        stackId="stack"
                        // Clicking a team's bar opens it in Team Usage.
                        onClick={onOpenTeam ? (bar) => {
                          const id = (bar as { payload?: { id?: string } }).payload?.id;
                          if (id) onOpenTeam(id);
                        } : undefined}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {onOpenTeam && <p className="mt-2 text-2xs text-gray-400 dark:text-slate-500">Click a bar to open that team in Team Usage.</p>}
            </div>
          )}

          {/* Unit Distribution Pie Chart */}
          {(unitDistributionData.length > 0 || pieTeam) && (
            <div data-chart-card className={`${CARD_CLASS} p-6 max-sm:p-3`}>
              <div className="mb-3 sm:mb-4 flex items-center justify-between gap-2">
                <h4 className="text-base max-sm:text-sm font-semibold text-gray-900 dark:text-slate-50">
                  Unit Type Distribution
                </h4>
                <div className="flex min-w-0 items-center gap-2">
                  {teamComparisonData.length > 1 && (
                    <ToolbarFilterSelect ariaLabel="Team for unit type distribution" value={pieTeamId} onChange={setPieTeamId} className="max-w-[11rem]">
                      <option value="">All teams</option>
                      {teamComparisonData.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </ToolbarFilterSelect>
                  )}
                  <ChartDownloadButton
                    onClick={() => downloadChartPng(pieChartRef.current, `unit-distribution-${pieTeam ? pieTeam.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'all-teams'}-${fromDate}-to-${toDate}`, `${pieTeam ? pieTeam.name : 'All teams'} · ${rangeLabel}`)}
                  />
                </div>
              </div>
              {/* The ref wraps the donut and its legend so both land in the downloaded image. */}
              <div ref={pieChartRef}>
              <div className="relative h-[220px] sm:h-[300px] w-full text-gray-900 dark:text-slate-50">
                {/* Total in the donut's hole */}
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span data-export-text className="text-lg sm:text-2xl font-semibold tabular-nums text-gray-900 dark:text-slate-50">{formatMeasure(pieValues.total, measure)}</span>
                  <span data-export-text className="text-2xs sm:text-xs text-gray-500 dark:text-slate-400">total {measureNoun}</span>
                </div>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={unitDistributionData}
                      cx="50%"
                      cy="50%"
                      innerRadius={isMobile ? 50 : 60}
                      outerRadius={isMobile ? 85 : 100}
                      paddingAngle={2}
                      dataKey="value"
                      // Clockwise from 12 o'clock: slices follow the legend order
                      // (Resume Units, Resume Scoring, AI Assessment, AI Interview).
                      startAngle={90}
                      endAngle={-270}
                      // Phones: outside labels would clip; the legend below names the slices.
                      label={isMobile ? false : ({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      labelLine={false}
                    >
                      {unitDistributionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      itemStyle={{ color: 'var(--popover-foreground)' }}
                      formatter={(value: number) => [`${formatMeasure(value, measure)} ${measureNoun}`, '']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Legend */}
              <div className="flex flex-wrap justify-center gap-x-4 sm:gap-x-6 gap-y-2 mt-3 sm:mt-4">
                {unitDistributionData.map((item) => (
                  <div key={item.name} className="flex items-center gap-2">
                    <div
                      data-export-swatch
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span data-export-text className="text-sm max-sm:text-[13px] text-gray-600 dark:text-slate-400">{item.name}</span>
                  </div>
                ))}
              </div>
              </div>
            </div>
          )}
        </div>

        {/* Daily trend — from the raw history; loads with the page. */}
        {hasTeams && (
          <div data-chart-card className={`${CARD_CLASS} p-6 max-sm:p-3`}>
            <div className="mb-3 sm:mb-4 flex items-center justify-between gap-2">
              <h4 className="text-base max-sm:text-sm font-semibold text-gray-900 dark:text-slate-50">
                {trendStep === 'week' ? 'Weekly Trend' : 'Daily Trend'}
              </h4>
              {trend.status === 'ready' && (
                <div className="flex shrink-0 items-center gap-2">
                  {/* Day / Week — only worth offering past two weeks. */}
                  {trend.rows.length > 14 && (
                    <div role="group" aria-label="Trend interval" className="inline-flex rounded-lg bg-gray-100 p-0.5 dark:bg-slate-800">
                      {(['day', 'week'] as const).map((step) => (
                        <button
                          key={step}
                          type="button"
                          onClick={() => setTrendStepChoice(step)}
                          aria-pressed={trendStep === step}
                          className={`h-6 rounded-md px-2.5 text-xs font-medium transition-colors ${
                            trendStep === step ? 'bg-white text-brand-blue shadow-sm dark:bg-slate-900' : 'text-gray-600 hover:text-brand-blue dark:text-slate-400'
                          }`}
                        >
                          {step === 'day' ? 'Daily' : 'Weekly'}
                        </button>
                      ))}
                    </div>
                  )}
                  <ChartDownloadButton onClick={() => downloadChartPng(trendChartRef.current, `${trendStep === 'week' ? 'weekly' : 'daily'}-trend-${fromDate}-to-${toDate}`, rangeLabel)} />
                </div>
              )}
            </div>
            {trend.status === 'error' ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <ChartLine className="h-8 w-8 text-gray-300 dark:text-slate-600" />
                <p className="text-sm max-sm:text-[13px] text-gray-500 dark:text-slate-400">Could not load the daily trend.</p>
                <Button variant="secondary" size="sm" onClick={loadTrend}>Try again</Button>
              </div>
            ) : trend.status === 'idle' || trend.status === 'loading' ? (
              <div className="flex h-[260px] items-center justify-center gap-2 text-sm text-gray-500 dark:text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading daily trend…
              </div>
            ) : (
              <>
                <div ref={trendChartRef} className="h-[240px] sm:h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendRows}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="label" tick={{ ...AXIS_TICK, fontSize: isMobile ? 10 : 12 }} minTickGap={16} />
                      <YAxis tick={{ ...AXIS_TICK, fontSize: isMobile ? 10 : 12 }} width={isMobile ? 32 : 44} allowDecimals={measure === 'units'} />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        labelStyle={{ color: 'var(--popover-foreground)' }}
                        formatter={(value: number) => formatMeasure(value, measure)}
                        itemSorter={bySeriesOrder}
                      />
                      <Legend wrapperStyle={isMobile ? { fontSize: 11 } : undefined} itemSorter={null} />
                      {UNIT_KEYS.map((k) => (
                        <Line
                          key={k}
                          type="monotone"
                          dataKey={measure === 'units' ? `${k}_u` : k}
                          name={UNIT_LABELS[k]}
                          stroke={UNIT_CHART_COLOR[k]}
                          strokeWidth={2}
                          dot={false}
                        />
                      ))}
                      {/* All four together, dashed so it doesn't read as a fifth module. */}
                      <Line
                        type="monotone"
                        dataKey={measure === 'units' ? 'total_u' : 'total'}
                        name="Total"
                        stroke="var(--muted-foreground)"
                        strokeWidth={2}
                        strokeDasharray="5 4"
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 flex items-start gap-2 rounded-lg bg-brand-blue/[0.04] px-3 py-2 text-xs text-gray-600 ring-1 ring-brand-blue/10 dark:bg-slate-800/50 dark:text-slate-400 dark:ring-slate-700">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-blue" />
                  <span>
                    {isTenantAdmin ? (
                      <>Successful usage by <strong className="font-semibold text-gray-900 dark:text-slate-100">everyone in the organisation</strong>, not only team members — so it can be higher than the totals above.</>
                    ) : (
                      <>Successful usage from the history <strong className="font-semibold text-gray-900 dark:text-slate-100">you have access to</strong> — it isn’t split by team, so it can differ from the totals above.</>
                    )}
                    {trend.partial && ` Based on the latest ${trend.partial.read.toLocaleString()} of ${trend.partial.total.toLocaleString()} entries.`}
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        <div className={`grid grid-cols-1 gap-4 sm:gap-6 ${isTenantAdmin && hasTeams ? 'lg:grid-cols-2' : ''}`}>
        {/* Most active teams */}
        {topTeams.length > 0 && (
          <div className={`${CARD_CLASS} p-6 max-sm:p-3`}>
            <h4 className="text-base max-sm:text-sm font-semibold text-gray-900 dark:text-slate-50 mb-3 sm:mb-4">Most Active Teams</h4>
            <div className="space-y-2 sm:space-y-3">
              {topTeams.map((team, index) => {
                const share = shown.total > 0 ? Math.round((team.total / shown.total) * 100) : 0;
                // Filler rows (fewer than 3 active teams) used nothing: no rank, no share.
                const idle = team.total === 0;
                const Row = onOpenTeam ? 'button' : 'div';
                return (
                <Row
                  key={team.id}
                  {...(onOpenTeam ? { type: 'button' as const, onClick: () => onOpenTeam(team.id), title: 'Open in Team Usage' } : {})}
                  className={`flex w-full items-center gap-3 sm:flex-wrap sm:gap-4 rounded-xl bg-gray-50 dark:bg-slate-800/50 p-2.5 sm:p-3 text-left ring-1 ring-gray-100 dark:ring-slate-700/60 ${onOpenTeam ? 'transition-colors hover:ring-brand-blue/30' : ''}`}
                >
                  <div className={`flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full text-xs sm:text-sm font-semibold ${idle ? 'bg-gray-200 text-gray-400 dark:bg-slate-700 dark:text-slate-500' : 'bg-brand-blue text-white'}`}>
                    {idle ? '–' : index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm max-sm:text-[13px] font-medium text-gray-900 dark:text-slate-50 truncate">{team.name}</p>
                    {idle ? (
                      <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">No usage in this range</p>
                    ) : (
                    <div className="flex flex-wrap gap-x-2.5 sm:gap-x-4 gap-y-0.5 sm:gap-y-1 mt-1">
                      {UNIT_KEYS.map((k) => (
                        <span key={k} className={`text-xs ${UNIT_TEXT_CLASS[k]}`}>
                          {UNIT_LABELS[k]}: {formatMeasure(team[k], measure)}
                        </span>
                      ))}
                    </div>
                    )}
                  </div>
                  {!idle && (
                  <div className="shrink-0 text-right">
                    <p className="text-base max-sm:text-sm sm:text-lg font-semibold tracking-tight tabular-nums text-gray-900 dark:text-slate-50">{formatMeasure(team.total, measure)}</p>
                    <p className="text-xs text-gray-500 dark:text-slate-500">total {measureNoun}</p>
                    {/* This team's share of all usage in the range */}
                    <div className="mt-1 flex items-center justify-end gap-1.5" title={`${share}% of all ${measureNoun}`}>
                      <div className="h-1 w-16 overflow-hidden rounded-full bg-gray-200 dark:bg-slate-700">
                        <div className="h-full rounded-full bg-brand-blue" style={{ width: `${Math.max(share, 2)}%` }} />
                      </div>
                      <span className="text-2xs tabular-nums text-gray-500 dark:text-slate-400">{share < 1 ? '<1' : share}%</span>
                    </div>
                  </div>
                  )}
                </Row>
                );
              })}
            </div>
          </div>
        )}

        {/* Top members — member usage is admin-only, like Team Usage's Members view. */}
        {isTenantAdmin && hasTeams && teamsUsage?.teams && (
          <TopMembersCard teams={teamsUsage.teams} fromDate={fromDate} toDate={toDate} />
        )}
        </div>

        {/* Teams that used nothing in this range */}
        {hasTeams && idleTeams.length > 0 && (
          <div className={`${CARD_CLASS} p-6 max-sm:p-3`}>
            <h4 className="text-base max-sm:text-sm font-semibold text-gray-900 dark:text-slate-50">
              Teams With No Usage <span className="ml-1 text-sm font-normal text-gray-400 dark:text-slate-500">{idleTeams.length}</span>
            </h4>
            <p className="mt-0.5 mb-3 text-xs text-gray-500 dark:text-slate-400">No units used by these teams in the selected range.</p>
            <div className="flex flex-wrap gap-2">
              {idleTeams.map((t) => {
                const Chip = onOpenTeam ? 'button' : 'span';
                return (
                  <Chip
                    key={t.id}
                    {...(onOpenTeam ? { type: 'button' as const, onClick: () => onOpenTeam(t.id), title: 'Open in Team Usage' } : {})}
                    className={`rounded-full bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700 ring-1 ring-gray-200 dark:bg-slate-800/50 dark:text-slate-300 dark:ring-slate-700 ${onOpenTeam ? 'transition-colors hover:text-brand-blue hover:ring-brand-blue/30' : ''}`}
                  >
                    {t.name}
                  </Chip>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!hasTeams && (
          <div className="rounded-xl border border-dashed border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 p-8 text-center">
            <BarChart3 className="w-12 h-12 text-gray-400 dark:text-slate-500 mx-auto mb-4" />
            <h3 className="text-base max-sm:text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">No Usage Data</h3>
            <p className="text-sm max-sm:text-[13px] text-gray-600 dark:text-slate-400">
              No team usage data available for the selected period.
            </p>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Whose usage this is: every team (tenant admin) or only the viewer's teams. */}
      {!error && (
        <ReportScopeBadge
          isTenantAdmin={isTenantAdmin}
          teamNames={(teamsUsage?.teams ?? []).map((t) => t.team_name || 'Unknown')}
          loading={isLoading}
        />
      )}
      {cards}

      {/* Controls — always shown, so the range stays editable while loading or after an
          error: quick ranges on the left, custom dates + Export on the right. */}
      <div className="flex flex-col gap-3 rounded-xl border border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 p-3 sm:p-4 ring-1 ring-black/[0.02] dark:ring-white/[0.02] lg:flex-row lg:items-center lg:justify-between">
        <RangePresets activeId={activePresetId} onPick={applyPreset} />
        <div className="flex flex-col gap-2 sm:gap-3 sm:flex-row sm:items-center">
          {/* Phones: From – to – To on one row. */}
          <div className="flex flex-col gap-2 min-w-0 lg:flex-row lg:items-center max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] max-sm:items-center">
            <DateField
              aria-label="Analytics date from"
              value={fromDate}
              max={toDate}
              onChange={(v) => setFromDate(v)}
              className="w-full lg:w-[150px] max-sm:px-2 max-sm:!text-xs"
            />
            <span className="shrink-0 text-xs font-medium text-gray-400 dark:text-slate-500 self-start lg:self-auto max-sm:self-center">to</span>
            <DateField
              aria-label="Analytics date to"
              value={toDate}
              min={fromDate}
              max={todayIST()}
              onChange={(v) => setToDate(v)}
              className="w-full lg:w-[150px] max-sm:px-2 max-sm:!text-xs"
            />
          </div>
          {!isLoading && !error && hasTeams && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                if (!canExport) return;
                setShowExportModal(true);
              }}
              aria-disabled={!canExport}
              className={`max-sm:w-full ${!canExport ? 'opacity-50 cursor-not-allowed' : ''}`}
              title={!canExport ? 'You do not have permission to export team analytics' : ''}
              icon={<Download className="w-4 h-4" />}
            >
              Export
            </Button>
          )}
          <ExportFormatModal
            open={showExportModal}
            onClose={() => setShowExportModal(false)}
            title="Export Team Analytics"
            recordCount={teamsUsage?.teams?.length ?? 0}
            columns={TEAM_USAGE_COLUMNS.map((c) => c.header)}
            onExport={handleExport}
          />
        </div>
      </div>

      {content}
    </div>
  );
}
