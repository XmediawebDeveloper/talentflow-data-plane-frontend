'use client';

import { useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { toISODateIST } from '@/lib/utils/dateUtils';
import { useQuota } from '@/contexts/QuotaContext';

/**
 * Shared by the Team Usage and Team Analytics tabs: the date range and the
 * Actions / Units choice. Both tabs read and write the same session values,
 * so switching tabs keeps the range you picked (they used to reset each other).
 */

// ─── Dates (IST, YYYY-MM-DD) ──────────────────────────────────────────────────

const DAY_MS = 86_400_000;
export const todayIST = () => toISODateIST(new Date());
const daysAgoIST = (days: number) => toISODateIST(new Date(Date.now() - days * DAY_MS));
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** First / last day of a month offset from the current IST month, as YYYY-MM-DD. */
function monthBoundsIST(offset: number) {
  const [y, m] = todayIST().split('-').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  const first = new Date(Date.UTC(y, m - 1 + offset, 1));
  const last = new Date(Date.UTC(y, m + offset, 0));
  const fmt = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  return { first: fmt(first), last: fmt(last) };
}

export type RangePreset = { id: string; label: string; range: () => { from: string; to: string } };

export const RANGE_PRESETS: RangePreset[] = [
  // "Last N days" includes today, so it starts N-1 days back (it was N+1 days long).
  { id: '7d', label: 'Last 7 days', range: () => ({ from: daysAgoIST(6), to: todayIST() }) },
  { id: '30d', label: 'Last 30 days', range: () => ({ from: daysAgoIST(29), to: todayIST() }) },
  { id: '90d', label: 'Last 90 days', range: () => ({ from: daysAgoIST(89), to: todayIST() }) },
  { id: 'this-month', label: 'This month', range: () => ({ from: monthBoundsIST(0).first, to: todayIST() }) },
  { id: 'last-month', label: 'Last month', range: () => ({ from: monthBoundsIST(-1).first, to: monthBoundsIST(-1).last }) },
];

// ─── Session-backed state ─────────────────────────────────────────────────────

/* v2: only a range the user picked is saved now (the default is no longer
   written), so ranges auto-saved under the old key — the 30-day default — are
   left behind instead of overriding the billing-period default. */
const RANGE_KEY = 'team-report:range:v2';

function readSession<T>(key: string, valid: (v: unknown) => v is T): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    return valid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
function writeSession(key: string, value: unknown) {
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

/** State that starts at `initial` (same on server and client), picks up the
 *  saved session value after mount, and saves every change after that. */
export function useSessionState<T>(key: string, initial: T, valid: (v: unknown) => v is T) {
  const [value, setValue] = useState<T>(initial);
  const restored = useRef(false);
  useEffect(() => {
    const saved = readSession(key, valid);
    if (saved !== null) setValue(saved);
    restored.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    if (restored.current) writeSession(key, value);
  }, [key, value]);
  return [value, setValue] as const;
}

type Range = { from: string; to: string };
const isRange = (v: unknown): v is Range => {
  if (!v || typeof v !== 'object') return false;
  const { from, to } = v as Range;
  return typeof from === 'string' && typeof to === 'string' && ISO_DATE.test(from) && ISO_DATE.test(to)
    && from <= to && to <= todayIST();
};

/** Saves a preset as the shared range before switching tabs. */
export function rememberRangePreset(id: string) {
  const preset = RANGE_PRESETS.find((p) => p.id === id);
  if (preset) writeSession(RANGE_KEY, preset.range());
}

/** Before switching tabs: drop any picked range, so the report tabs open on
 *  their default — the current billing period. The Teams list's Units links
 *  use this, since their numbers cover that same period. */
export function rememberBillingPeriod() {
  writeSession(RANGE_KEY, null);
}

/**
 * The period the Teams list's units cover, matching the report tabs' default:
 * the current billing period, or the last 30 days when there is none.
 * `ready` is false while the quota status is still loading, so callers don't
 * fetch the fallback range just before the billing period arrives.
 */
export function useTeamUnitsPeriod(): { range: Range; label: string; ready: boolean } {
  const { quotaData, loading } = useQuota();
  const billing = billingRangeIST(quotaData?.billing_period);
  if (billing) return { range: billing, label: 'billing period', ready: true };
  return { range: RANGE_PRESETS[1].range(), label: 'last 30 days', ready: !loading };
}

const isPickedRange = (v: unknown): v is Range | null => v === null || isRange(v);

/** The current billing period as an IST date range (to: today at the latest),
 *  from the quota status's `billing_period` — the same period Usage History,
 *  the Usage dashboard and Upgrade Plans show. Null until it's known. */
function billingRangeIST(period: { start?: string; end?: string } | undefined): Range | null {
  if (!period?.start) return null;
  const startDate = new Date(period.start);
  if (Number.isNaN(startDate.getTime())) return null;
  const today = todayIST();
  const from = toISODateIST(startDate);
  const endDate = period.end ? new Date(period.end) : null;
  const end = endDate && !Number.isNaN(endDate.getTime()) ? toISODateIST(endDate) : today;
  const to = end < today ? end : today;
  return from <= to ? { from, to } : null;
}

/**
 * The date range shared by both report tabs.
 *
 * Default: the current billing period, so Team Usage / Analytics open on the
 * same days as Usage History and the plan's quota. Until the billing period
 * is known (first load), or if there isn't one, the last 30 days. Only a
 * range the user picks is saved for the session; the default isn't, so it
 * keeps following the billing period.
 */
export function useTeamReportRange() {
  const { quotaData } = useQuota();
  const billing = billingRangeIST(quotaData?.billing_period);
  const [picked, setPicked] = useSessionState<Range | null>(RANGE_KEY, null, isPickedRange);
  const range: Range = picked ?? billing ?? RANGE_PRESETS[1].range();

  // "Current billing period" leads the presets once the period is known.
  const presets: RangePreset[] = billing
    ? [{ id: 'billing', label: 'Current billing period', range: () => billing }, ...RANGE_PRESETS]
    : RANGE_PRESETS;
  const activePresetId = presets.find((p) => {
    const r = p.range();
    return r.from === range.from && r.to === range.to;
  })?.id;

  return {
    fromDate: range.from,
    toDate: range.to,
    // The picker's Clear sends '' — a range needs both ends, so that's ignored
    // (it used to crash the tab). A From after To (or To before From) moves the
    // other end along instead of sending an inverted range.
    setFromDate: (from: string) => {
      if (!ISO_DATE.test(from)) return;
      setPicked({ from, to: from > range.to ? from : range.to });
    },
    setToDate: (to: string) => {
      if (!ISO_DATE.test(to)) return;
      setPicked({ from: to < range.from ? to : range.from, to });
    },
    // Picking "Current billing period" goes back to following the default.
    applyPreset: (p: RangePreset) => setPicked(p.id === 'billing' ? null : p.range()),
    activePresetId,
    presets,
  };
}

/** Units are the only measure shown: every unit type costs 1 unit per action
 *  (Assessment now charges like AI Interview — 1 unit when the candidate starts),
 *  so a separate Actions view added nothing. Kept as a type for the formatters. */
export type Measure = 'actions' | 'units';

// ─── Unit stat cards ──────────────────────────────────────────────────────────

/** Grid for the five unit cards — the same on Team Usage and Analytics. */
export const UNIT_STAT_GRID = 'tf-grid-stats-5';

/**
 * One unit total (Resume Units … Total Units). Team Usage and Analytics both use
 * it, so the cards have one size, layout and icon set. With `onClick` it's a
 * button (Team Usage sorts its table by the card's column).
 */
export function UnitStatCard({ label, value, icon: Icon, strong = false, loading = false, onClick, active = false, title }: {
  label: string;
  value: string;
  icon: LucideIcon;
  /** The Total card's filled icon tile. */
  strong?: boolean;
  loading?: boolean;
  onClick?: () => void;
  active?: boolean;
  /** Tooltip for the clickable card; defaults to "Sort teams by …". */
  title?: string;
}) {
  const tile = strong ? 'bg-brand-blue text-white' : 'bg-brand-blue/10 text-brand-blue';
  const body = (
    // Compact on every screen: icon · label · value. The change vs the previous
    // period lives in its own section (PeriodComparison), not on the card.
    <span className="flex items-center gap-2.5">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-brand-blue/15 ${tile}`}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate tf-meta">{label}</span>
        {loading
          ? <span className="mt-1 block h-5 w-10 animate-pulse rounded bg-gray-100 dark:bg-slate-800" />
          : <span className="block tf-section-title max-sm:text-base leading-tight tracking-tight tabular-nums">{value}</span>}
      </span>
    </span>
  );
  const base = 'block w-full rounded-xl border text-left shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] px-3 py-2.5';
  const idle = 'border-gray-100 bg-white dark:border-slate-700/60 dark:bg-slate-900';
  if (!onClick) return <div className={`${base} ${idle}`}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      aria-pressed={active}
      title={title ?? `Sort teams by ${label}`}
      className={`${base} transition-colors disabled:cursor-default ${
        active ? 'border-brand-blue/40 bg-brand-blue/[0.04] dark:bg-brand-blue/10' : `${idle} hover:border-brand-blue/30`
      }`}
    >
      {body}
    </button>
  );
}

// ─── Controls ─────────────────────────────────────────────────────────────────

export function RangePresets({ activeId, onPick, presets = RANGE_PRESETS, className = '' }: {
  activeId?: string;
  onPick: (p: RangePreset) => void;
  /** useTeamReportRange's list (leads with "Current billing period"). */
  presets?: RangePreset[];
  className?: string;
}) {
  return (
    <div className={`flex gap-1.5 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0 ${className}`} role="group" aria-label="Date range presets">
      {presets.map((preset) => {
        const active = activeId === preset.id;
        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => onPick(preset)}
            aria-pressed={active}
            className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors ${
              active
                ? 'bg-brand-blue text-white ring-brand-blue'
                : 'bg-white text-gray-600 ring-gray-200 hover:text-brand-blue hover:ring-brand-blue/30 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700'
            }`}
          >
            {preset.label}
          </button>
        );
      })}
    </div>
  );
}

/** Plain-language charging rules for the four unit types, shown on the Team
 *  Usage and Analytics tabs so the numbers can be read correctly. */
export function UnitRulesHelp({ className = '' }: { className?: string }) {
  const rules: [string, string][] = [
    ['Resume Units (RU)', '1 unit per uploaded resume. Duplicates you discard are not charged; overwriting or saving a new version is. Deleting a resume or cancelling an upload gives its unit back to your quota, but usage here keeps counting it: Resume Units only ever goes up.'],
    ['Resume Scoring (RS)', '1 unit per resume scored, charged only when scoring succeeds. Re-scoring a resume charges again.'],
    ['AI Assessment (AS)', '1 unit is reserved when the invite is sent and charged when the candidate starts the assessment. It is released if the link expires unused.'],
    ['AI Interview (AIU)', '1 unit is reserved when the invite is sent and charged when the candidate starts the interview. It is released if the link expires unused.'],
  ];
  return (
    <details className={`group rounded-lg bg-white text-xs ring-1 ring-gray-100 dark:bg-slate-900 dark:ring-slate-700/60 ${className}`}>
      <summary className="cursor-pointer select-none list-none px-3 py-2 font-medium text-gray-600 hover:text-brand-blue dark:text-slate-300 [&::-webkit-details-marker]:hidden">
        <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span>
        How units are counted
      </summary>
      <dl className="grid gap-x-6 gap-y-2 border-t border-gray-100 px-3 py-2.5 sm:grid-cols-2 dark:border-slate-700/60">
        {rules.map(([term, text]) => (
          <div key={term}>
            <dt className="font-semibold text-gray-800 dark:text-slate-100">{term}</dt>
            <dd className="text-gray-500 dark:text-slate-400">{text}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}


// ─── Reporting scope badge ────────────────────────────────────────────────────

/**
 * Says whose usage the tab is showing, so nobody mistakes their own team's
 * numbers for the whole tenant's (or the reverse). Tenant admins get every
 * team (tenant-level); everyone else gets only the teams they belong to
 * (team-level). Follows the same `isTenantAdmin` gate that picks the endpoint.
 */
export function ReportScopeBadge({
  isTenantAdmin,
  teamNames,
  loading = false,
  className = '',
}: {
  isTenantAdmin: boolean;
  /** Names of the teams in the loaded report. */
  teamNames: string[];
  loading?: boolean;
  className?: string;
}) {
  const count = teamNames.length;
  let detail: string;
  if (loading) detail = 'Loading…';
  else if (isTenantAdmin) detail = count === 1 ? 'All teams (1 team)' : `All teams (${count} teams)`;
  else if (count === 0) detail = 'No team assigned';
  else if (count === 1) detail = teamNames[0];
  else detail = `Your ${count} teams`;

  const title = isTenantAdmin
    ? 'Tenant-level report: usage for every team in your organization.'
    : `Team-level report: usage for only the team${count === 1 ? '' : 's'} you belong to${count > 1 ? ` (${teamNames.join(', ')})` : ''}. Other teams' usage is not shown.`;

  return (
    <div
      className={`inline-flex max-w-full items-center gap-2 rounded-lg px-2.5 py-1 text-xs ring-1 ${
        isTenantAdmin
          ? 'bg-brand-blue/[0.06] text-brand-blue ring-brand-blue/20 dark:bg-brand-blue/10'
          : 'bg-gray-100 text-gray-700 ring-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700'
      } ${className}`}
      title={title}
      aria-label={`Reporting scope: ${isTenantAdmin ? 'Tenant-level' : 'Team-level'} — ${detail}`}
    >
      <span className="shrink-0 font-semibold">{isTenantAdmin ? 'Tenant-level' : 'Team-level'}</span>
      <span aria-hidden className="shrink-0 opacity-50">·</span>
      <span className="min-w-0 truncate">{detail}</span>
    </div>
  );
}
