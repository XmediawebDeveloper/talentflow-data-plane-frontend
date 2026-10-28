'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  BarChart3,
  TrendingUp,
  Users,
  FileText,
  ClipboardCheck,
  Upload,
  Briefcase,
  AlertCircle,
  Download,
  ImageDown,
  TriangleAlert,
  Gauge,
  ChartLine,
  Loader2,
} from 'lucide-react';
import {
  exportData,
  formatTeamUsageForExport,
  TEAM_USAGE_COLUMNS,
  type ExportFileFormat,
} from '@/lib/utils/exportUtils';
import { Button } from '@/components/ui/button';
import ExportFormatModal from '@/components/ExportFormatModal';
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
import { toISODateIST } from '@/lib/utils/dateUtils';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/components/providers/AuthProvider';
import { useIsMobile } from '@/components/ui/use-mobile';
import { useTeamReportRange, useReportMeasure, RangePresets, MeasureToggle, todayIST, previousRange, periodDelta, type Measure, type PeriodDelta } from './reportControls';
import { UNIT_KEYS, UNIT_LABELS, UNIT_CHART_COLOR, UNIT_TEXT_CLASS, type UnitKey } from '@/lib/constants/unitColors';

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

/** Units per action, one decimal — "—" when nothing was used. */
const formatPerAction = (units: number, actions: number) => (actions > 0 ? (units / actions).toFixed(1) : '—');

// ─── Daily trend (built from the consumption history) ────────────────────────

/** Entries read for the trend; beyond this the chart notes it's partial. */
const TREND_LIMIT = 5000;
type TrendRow = { date: string; label: string } & Record<`${UnitKey}` | `${UnitKey}_u`, number>;

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
function bucketByDay(entries: ConsumptionLogEntry[], from: string, to: string): TrendRow[] {
  const rows = daysInRange(from, to).map((date) => {
    const [, m, d] = date.split('-').map(Number);
    const label = new Date(Date.UTC(2000, m - 1, d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    const row = { date, label } as TrendRow;
    for (const k of UNIT_KEYS) { row[k] = 0; row[`${k}_u`] = 0; }
    return row;
  });
  const index = new Map(rows.map((r, i) => [r.date, i]));
  for (const e of entries) {
    const k = e.unit_type as UnitKey;
    if (!UNIT_KEYS.includes(k)) continue;
    const i = index.get(toISODateIST(e.created_at));
    if (i === undefined) continue;
    rows[i][k] += 1;
    rows[i][`${k}_u`] += e.units_consumed || 0;
  }
  return rows;
}

// ─── Chart → PNG ──────────────────────────────────────────────────────────────

/** Saves the chart's SVG as a PNG. Colours are copied in as computed values —
 *  CSS variables don't resolve once the SVG leaves the page. `centerText` is
 *  drawn in the middle (the donut's total is HTML, not part of the SVG). */
async function downloadChartPng(container: HTMLElement | null, filename: string, centerText?: [string, string]) {
  const svg = container?.querySelector('svg.recharts-surface') as SVGSVGElement | null;
  if (!svg) return;
  const { width, height } = svg.getBoundingClientRect();
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const src = svg.querySelectorAll('*');
  const dst = clone.querySelectorAll('*');
  src.forEach((el, i) => {
    const cs = getComputedStyle(el);
    const target = dst[i] as SVGElement;
    for (const prop of ['fill', 'stroke', 'stroke-width', 'opacity', 'font-size', 'font-family', 'font-weight']) {
      target.style.setProperty(prop, cs.getPropertyValue(prop));
    }
  });
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));

  const card = container?.closest('[data-chart-card]') as HTMLElement | null;
  const background = (card && getComputedStyle(card).backgroundColor) || '#ffffff';
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(); img.src = url; });
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(scale, scale);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    if (centerText) {
      ctx.textAlign = 'center';
      ctx.fillStyle = getComputedStyle(container!).color || '#111827';
      ctx.font = '600 20px sans-serif';
      ctx.fillText(centerText[0], width / 2, height / 2 + 2);
      ctx.font = '12px sans-serif';
      ctx.fillText(centerText[1], width / 2, height / 2 + 20);
    }
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${filename}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, 'image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
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

const CARD_CLASS =
  'rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]';

export default function TeamAnalyticsDashboard({ userRole, onOpenTeam }: TeamAnalyticsDashboardProps) {
  const { isTenantAdmin: authIsTenantAdmin, hasPermissionCode } = useAuth();
  const canExport = authIsTenantAdmin || hasPermissionCode('teams:export');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamsUsage, setTeamsUsage] = useState<AllTeamsUsageSummary | null>(null);
  // Same-length period just before the range — for the "vs previous" lines.
  const [prevUsage, setPrevUsage] = useState<AllTeamsUsageSummary | null>(null);
  // Failed / blocked action counts in the range (null = not loaded).
  const [failures, setFailures] = useState<{ insufficient: number; failed: number; blocked: number } | null>(null);
  // Daily trend — loaded on request (it reads the raw history, which is heavy).
  const [trend, setTrend] = useState<{ status: 'idle' | 'loading' | 'ready' | 'error'; rows: TrendRow[]; partial: { read: number; total: number } | null }>({ status: 'idle', rows: [], partial: null });
  const barChartRef = useRef<HTMLDivElement>(null);
  const pieChartRef = useRef<HTMLDivElement>(null);
  const trendChartRef = useRef<HTMLDivElement>(null);
  // Range and Actions / Units are shared with the Team Usage tab.
  const { fromDate, toDate, setFromDate, setToDate, applyPreset, activePresetId } = useTeamReportRange();
  const [measure, setMeasure] = useReportMeasure();
  const [showAllTeams, setShowAllTeams] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const isMobile = useIsMobile();

  // Must match the backend's actual gate (current_user.is_tenant_admin) for the
  // all-teams-usage endpoint — a raw role-string comparison drifts from the
  // backend (e.g. 'admin' is no longer an automatic tenant_admin bypass there).
  const isTenantAdmin = authIsTenantAdmin;

  // Each fetch gets a number; a response for an older range (dates changed
  // quickly) is dropped instead of overwriting the newer one.
  const fetchSeq = useRef(0);

  const fetchAnalyticsData = useCallback(async () => {
    const seq = ++fetchSeq.current;
    setIsLoading(true);
    setError(null);
    setFailures(null);
    setTrend({ status: 'idle', rows: [], partial: null });

    const load = async (from: string, to: string) =>
      isTenantAdmin
        ? teamService.getAllTeamsUsage(from, to)
        : ((await teamService.getMyTeamsUsage(from, to)) as unknown as AllTeamsUsageSummary);
    const prev = previousRange(fromDate, toDate);

    // Failed / blocked actions: counts only — limit 1, read `total`. Best
    // effort; it never holds up or fails the page.
    const countStatus = (status: string) =>
      unitPoolService
        .getConsumptionHistory({ status, start_date: fromDate, end_date: toDate, limit: 1 })
        .then((r) => (Array.isArray(r) ? (r as unknown[]).length : r.total ?? 0));
    Promise.all([countStatus('INSUFFICIENT_UNITS'), countStatus('FAILED'), countStatus('BLOCKED')])
      .then(([insufficient, failed, blocked]) => {
        if (seq === fetchSeq.current) setFailures({ insufficient, failed, blocked });
      })
      .catch(() => { /* card shows "—" */ });

    try {
      // The previous period only feeds the "vs previous" lines; its failure hides them.
      const [data, prevData] = await Promise.all([load(fromDate, toDate), load(prev.from, prev.to).catch(() => null)]);
      if (seq !== fetchSeq.current) return;
      setTeamsUsage(data);
      setPrevUsage(prevData);
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
  }, [fromDate, toDate, isTenantAdmin]);

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
          JDs: team.jds_created || 0,
          Assessments: team.assessments_created || 0,
          total: UNIT_KEYS.reduce((sum, k) => sum + value(k), 0),
          perAction: formatPerAction(
            UNIT_KEYS.reduce((sum, k) => sum + (team.by_type?.[k]?.total_consumed || 0), 0),
            UNIT_KEYS.reduce((sum, k) => sum + (team.by_type?.[k]?.consumption_count || 0), 0),
          ),
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [teamsUsage, measure]);
  const chartTeams = showAllTeams ? teamComparisonData : teamComparisonData.slice(0, CHART_TEAM_LIMIT);
  // Taller chart when every team is shown, so bars don't squeeze.
  const chartHeight = Math.max(isMobile ? 260 : 300, chartTeams.length * (isMobile ? 26 : 30) + 70);

  // Totals (units) and action counts across all teams — now and in the previous period.
  const { totals, actionCounts, creationCounts } = useMemo(() => aggregate(teamsUsage?.teams), [teamsUsage]);
  const prevAgg = useMemo(() => (prevUsage ? aggregate(prevUsage.teams) : null), [prevUsage]);
  const prevDays = previousRange(fromDate, toDate).days;

  // Unit type distribution (pie)
  const shown = measure === 'units' ? totals : actionCounts;
  const unitDistributionData = useMemo(
    () =>
      UNIT_KEYS.filter((k) => shown[k] > 0).map((k) => ({
        name: UNIT_LABELS[k],
        value: parseFloat(shown[k].toFixed(2)),
        color: UNIT_CHART_COLOR[k],
      })),
    [shown],
  );

  // Most active teams — only teams that used something (a list of zeros
  // used to be ranked 1–5).
  const topTeams = useMemo(
    () => teamComparisonData.filter((t) => t.total > 0).slice(0, 5),
    [teamComparisonData],
  );

  // Export handler — runs from the format picker
  const handleExport = async (format: ExportFileFormat) => {
    if (!teamsUsage?.teams) return;

    const formattedData = formatTeamUsageForExport(teamsUsage.teams);
    await exportData(format, formattedData, TEAM_USAGE_COLUMNS, `team-analytics-${fromDate}-to-${toDate}`, {
      sheetName: 'Team Analytics',
    });
  };

  const loadTrend = async () => {
    const seq = fetchSeq.current;
    setTrend((t) => ({ ...t, status: 'loading' }));
    try {
      const res = await unitPoolService.getConsumptionHistory({ start_date: fromDate, end_date: toDate, status: 'SUCCESS', limit: TREND_LIMIT });
      if (seq !== fetchSeq.current) return; // range changed meanwhile
      const items: ConsumptionLogEntry[] = Array.isArray(res) ? res : res.items ?? [];
      const total = Array.isArray(res) ? items.length : res.total ?? items.length;
      setTrend({ status: 'ready', rows: bucketByDay(items, fromDate, toDate), partial: total > items.length ? { read: items.length, total } : null });
    } catch {
      if (seq === fetchSeq.current) setTrend({ status: 'error', rows: [], partial: null });
    }
  };

  const hasTeams = !!teamsUsage?.teams && teamsUsage.teams.length > 0;
  const measureNoun = measure === 'units' ? 'units' : 'actions';

  // ── Content below the header. The header (with the date fields) stays put
  //    while loading or after an error, so the range can still be changed —
  //    it used to be swapped out for a skeleton / the error box. ──
  let content: React.ReactNode;
  if (isLoading) {
    content = (
      <>
        {/* Summary Cards Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className={`${CARD_CLASS} p-5`}>
              <Skeleton className="w-10 h-10 rounded-lg mb-3" />
              <Skeleton className="h-8 w-20 mb-1" />
              <Skeleton className="h-4 w-32" />
            </div>
          ))}
        </div>

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
    content = (
      <>
        {/* Summary cards in two groups: usage (follows Actions / Units) and what was created. */}
        {(() => {
          const other = (k: UnitKey | 'total') =>
            measure === 'units' ? `${actionCounts[k].toLocaleString()} actions` : `${formatUnits(totals[k])} units`;
          const usageCards = [
            { key: 'RS', label: 'Resume Scoring', Icon: FileText },
            { key: 'AS', label: 'Assessment', Icon: ClipboardCheck },
            { key: 'AIU', label: 'AI Interview', Icon: Users },
            { key: 'RU', label: 'Resume Storage', Icon: Upload },
            { key: 'total', label: measure === 'units' ? 'Total Units Used' : 'Total Actions', Icon: BarChart3 },
          ] as const;
          const current = measure === 'units' ? totals : actionCounts;
          const previous = prevAgg ? (measure === 'units' ? prevAgg.totals : prevAgg.actionCounts) : null;
          const usageDelta = (k: UnitKey | 'total') =>
            previous ? periodDelta(current[k], previous[k], prevDays, (v) => formatMeasure(v, measure)) : null;
          const createdDelta = (k: 'jds' | 'assessments') =>
            prevAgg ? periodDelta(creationCounts[k], prevAgg.creationCounts[k], prevDays, (v) => v.toLocaleString()) : null;
          const failedTotal = failures ? failures.insufficient + failures.failed + failures.blocked : null;
          const card = (key: string, label: string, value: string, sub: string, Icon: typeof FileText, strong = false, delta: PeriodDelta | null = null, warn = false) => {
            const iconBg = warn
              ? 'bg-brand-orange/10 ring-1 ring-brand-orange/20'
              : strong ? 'bg-brand-blue ring-1 ring-brand-blue/15' : 'bg-brand-blue/10 ring-1 ring-brand-blue/15';
            const iconColor = warn ? 'text-brand-orange-deep' : strong ? 'text-white' : 'text-brand-blue';
            const deltaLine = delta && (
              <p
                title={delta.hint}
                className={`truncate text-2xs font-medium ${delta.tone === 'up' ? 'text-success' : delta.tone === 'down' ? 'text-brand-orange-deep' : 'text-gray-400 dark:text-slate-500'}`}
              >
                {delta.text}
              </p>
            );
            return (
              <div key={key} className={`text-left ${CARD_CLASS} px-3 py-2.5 sm:p-5`}>
                {/* Phones: icon · label/sub · value on one line. */}
                <div className="flex items-center gap-3 sm:hidden">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
                    <Icon className={`w-4 h-4 ${iconColor}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm max-sm:text-[13px] text-gray-700 dark:text-slate-300">{label}</p>
                    {sub && <p className="truncate text-2xs text-gray-500 dark:text-slate-500">{sub}</p>}
                    {deltaLine}
                  </div>
                  <p className="shrink-0 text-lg max-sm:text-base font-semibold tracking-tight tabular-nums text-gray-900 dark:text-slate-50">{value}</p>
                </div>
                <div className="hidden sm:block">
                  <div className="flex items-center justify-between mb-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconBg}`}>
                      <Icon className={`w-5 h-5 ${iconColor}`} />
                    </div>
                  </div>
                  <p className="text-2xl max-sm:text-xl font-semibold tracking-tight tabular-nums text-gray-900 dark:text-slate-50">{value}</p>
                  <p className="text-sm max-sm:text-[13px] text-gray-600 dark:text-slate-400">{label}</p>
                  {sub && <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">{sub}</p>}
                  {deltaLine && <div className="mt-1">{deltaLine}</div>}
                </div>
              </div>
            );
          };
          const groupTitle = 'mb-2 text-2xs font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500';
          return (
            <div className="space-y-4">
              <section>
                <h4 className={groupTitle}>Usage · {measureNoun}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-4">
                  {usageCards.map(({ key, label, Icon }) =>
                    card(key, label, formatMeasure(current[key], measure), other(key), Icon, key === 'total', usageDelta(key)),
                  )}
                </div>
              </section>
              <section>
                <h4 className={groupTitle}>Activity & health</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
                  {card('JDS', 'JDs Created', creationCounts.jds.toLocaleString(), '', Briefcase, false, createdDelta('jds'))}
                  {card('ASSESSED', 'Assessments Created', creationCounts.assessments.toLocaleString(), '', ClipboardCheck, false, createdDelta('assessments'))}
                  {/* How much each use costs on average — higher means heavier usage per action. */}
                  {card('PER_ACTION', 'Units per Action', formatPerAction(totals.total, actionCounts.total), `across ${actionCounts.total.toLocaleString()} actions`, Gauge)}
                  {/* Early warning: actions that didn't go through (out of units, errors, blocked). */}
                  {card(
                    'FAILED',
                    'Failed Actions',
                    failedTotal === null ? '—' : failedTotal.toLocaleString(),
                    failures
                      ? `${failures.insufficient} out of units · ${failures.failed} failed · ${failures.blocked} blocked`
                      : 'Counts unavailable',
                    TriangleAlert,
                    false,
                    null,
                    !!failures && failures.insufficient > 0,
                  )}
                </div>
              </section>
            </div>
          );
        })()}

        {/* justify-end, not justify-between: the Back to overview button that
            used to hold the left slot is gone, and the tally belongs on the
            right. */}
        <div className="flex items-center justify-end gap-2">
          <span className="text-xs text-gray-500 dark:text-slate-400">
            {teamsUsage?.teams?.length ?? 0} {(teamsUsage?.teams?.length ?? 0) === 1 ? 'team' : 'teams'}
          </span>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Team Comparison Bar Chart */}
          {teamComparisonData.length > 0 && (
            <div data-chart-card className={`${CARD_CLASS} p-6 max-sm:p-3`}>
              <div className="mb-3 sm:mb-4 flex items-center justify-between gap-2">
                <h4 className="text-base max-sm:text-sm font-semibold text-gray-900 dark:text-slate-50">
                  Usage by Team <span className="text-xs font-normal text-gray-400 dark:text-slate-500">({measureNoun})</span>
                </h4>
                <ChartDownloadButton onClick={() => downloadChartPng(barChartRef.current, `usage-by-team-${measureNoun}-${fromDate}-to-${toDate}`)} />
                {teamComparisonData.length > CHART_TEAM_LIMIT && (
                  <button
                    type="button"
                    onClick={() => setShowAllTeams((v) => !v)}
                    className="shrink-0 text-xs font-semibold text-brand-blue hover:underline"
                  >
                    {showAllTeams ? `Top ${CHART_TEAM_LIMIT}` : `Show all ${teamComparisonData.length}`}
                  </button>
                )}
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
                    />
                    <Legend wrapperStyle={isMobile ? { fontSize: 11 } : undefined} />
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
          {unitDistributionData.length > 0 && (
            <div data-chart-card className={`${CARD_CLASS} p-6 max-sm:p-3`}>
              <div className="mb-3 sm:mb-4 flex items-center justify-between gap-2">
                <h4 className="text-base max-sm:text-sm font-semibold text-gray-900 dark:text-slate-50">
                  Unit Type Distribution <span className="text-xs font-normal text-gray-400 dark:text-slate-500">({measureNoun})</span>
                </h4>
                <ChartDownloadButton
                  onClick={() => downloadChartPng(pieChartRef.current, `unit-distribution-${measureNoun}-${fromDate}-to-${toDate}`, [formatMeasure(shown.total, measure), `total ${measureNoun}`])}
                />
              </div>
              <div ref={pieChartRef} className="relative h-[220px] sm:h-[300px] w-full text-gray-900 dark:text-slate-50">
                {/* Total in the donut's hole */}
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-lg sm:text-2xl font-semibold tabular-nums text-gray-900 dark:text-slate-50">{formatMeasure(shown.total, measure)}</span>
                  <span className="text-2xs sm:text-xs text-gray-500 dark:text-slate-400">total {measureNoun}</span>
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
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-sm max-sm:text-[13px] text-gray-600 dark:text-slate-400">{item.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Daily trend — from the raw history, so loaded only when asked for. */}
        {hasTeams && (
          <div data-chart-card className={`${CARD_CLASS} p-6 max-sm:p-3`}>
            <div className="mb-3 sm:mb-4 flex items-center justify-between gap-2">
              <h4 className="text-base max-sm:text-sm font-semibold text-gray-900 dark:text-slate-50">
                Daily Trend <span className="text-xs font-normal text-gray-400 dark:text-slate-500">({measureNoun})</span>
              </h4>
              {trend.status === 'ready' && (
                <ChartDownloadButton onClick={() => downloadChartPng(trendChartRef.current, `daily-trend-${measureNoun}-${fromDate}-to-${toDate}`)} />
              )}
            </div>
            {trend.status === 'idle' || trend.status === 'error' ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <ChartLine className="h-8 w-8 text-gray-300 dark:text-slate-600" />
                <p className="text-sm max-sm:text-[13px] text-gray-500 dark:text-slate-400">
                  {trend.status === 'error' ? 'Could not load the daily trend.' : 'See how usage moved day by day in this range.'}
                </p>
                <Button variant="secondary" size="sm" onClick={loadTrend}>
                  {trend.status === 'error' ? 'Try again' : 'Show daily trend'}
                </Button>
              </div>
            ) : trend.status === 'loading' ? (
              <div className="flex h-[260px] items-center justify-center gap-2 text-sm text-gray-500 dark:text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading daily trend…
              </div>
            ) : (
              <>
                <div ref={trendChartRef} className="h-[240px] sm:h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trend.rows}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="label" tick={{ ...AXIS_TICK, fontSize: isMobile ? 10 : 12 }} minTickGap={16} />
                      <YAxis tick={{ ...AXIS_TICK, fontSize: isMobile ? 10 : 12 }} width={isMobile ? 32 : 44} allowDecimals={measure === 'units'} />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        labelStyle={{ color: 'var(--popover-foreground)' }}
                        formatter={(value: number) => formatMeasure(value, measure)}
                      />
                      <Legend wrapperStyle={isMobile ? { fontSize: 11 } : undefined} />
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
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-2 text-2xs text-gray-400 dark:text-slate-500">
                  Successful actions only, across all usage in the range (not split by team).
                  {trend.partial && ` Based on the latest ${trend.partial.read.toLocaleString()} of ${trend.partial.total.toLocaleString()} entries.`}
                </p>
              </>
            )}
          </div>
        )}

        {/* Most active teams */}
        {topTeams.length > 0 && (
          <div className={`${CARD_CLASS} p-6 max-sm:p-3`}>
            <h4 className="text-base max-sm:text-sm font-semibold text-gray-900 dark:text-slate-50 mb-3 sm:mb-4">Most Active Teams</h4>
            <div className="space-y-2 sm:space-y-3">
              {topTeams.map((team, index) => {
                const share = shown.total > 0 ? Math.round((team.total / shown.total) * 100) : 0;
                const Row = onOpenTeam ? 'button' : 'div';
                return (
                <Row
                  key={team.id}
                  {...(onOpenTeam ? { type: 'button' as const, onClick: () => onOpenTeam(team.id), title: 'Open in Team Usage' } : {})}
                  className={`flex w-full items-center gap-3 sm:flex-wrap sm:gap-4 rounded-xl bg-gray-50 dark:bg-slate-800/50 p-2.5 sm:p-3 text-left ring-1 ring-gray-100 dark:ring-slate-700/60 ${onOpenTeam ? 'transition-colors hover:ring-brand-blue/30' : ''}`}
                >
                  <div className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full bg-brand-blue text-xs sm:text-sm font-semibold text-white">
                    {index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm max-sm:text-[13px] font-medium text-gray-900 dark:text-slate-50 truncate">{team.name}</p>
                    <div className="flex flex-wrap gap-x-2.5 sm:gap-x-4 gap-y-0.5 sm:gap-y-1 mt-1">
                      {UNIT_KEYS.map((k) => (
                        <span key={k} title={UNIT_LABELS[k]} className={`text-xs ${UNIT_TEXT_CLASS[k]}`}>
                          {k}: {formatMeasure(team[k], measure)}
                        </span>
                      ))}
                      <span className="text-xs text-gray-500 dark:text-slate-400">JDs created: {team.JDs}</span>
                      <span className="text-xs text-gray-500 dark:text-slate-400">Assessments created: {team.Assessments}</span>
                      <span className="text-xs text-gray-500 dark:text-slate-400" title="Average units consumed per action">{team.perAction} units / action</span>
                    </div>
                  </div>
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
                </Row>
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
      {/* Header with Period Selector — always shown, so the range stays editable. */}
      <div className="flex flex-col gap-3 sm:gap-4 rounded-xl border border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 p-3 sm:p-5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 shadow-sm shadow-brand-blue/10">
            <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue" />
          </div>
          <div>
            <h3 className="text-base max-sm:text-sm font-semibold text-gray-900 dark:text-slate-50">Team Analytics</h3>
            <p className="hidden sm:block text-sm max-sm:text-[13px] text-gray-600 dark:text-slate-400">
              {isTenantAdmin ? 'Organization-wide usage analytics' : 'Your team usage analytics'}
            </p>
          </div>
        </div>
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

      {/* Quick ranges + Actions / Units — both shared with Team Usage. */}
      <div className="-mt-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <RangePresets activeId={activePresetId} onPick={applyPreset} />
        <MeasureToggle value={measure} onChange={setMeasure} className="self-start sm:self-auto" />
      </div>

      {content}
    </div>
  );
}
