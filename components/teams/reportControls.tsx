'use client';

import { useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { toISODateIST } from '@/lib/utils/dateUtils';

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

const RANGE_KEY = 'team-report:range';

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

/** Saves a preset as the shared range before switching tabs — e.g. the Teams
 *  list's "Units (last 30 days)" opens Team Usage on that same range. */
export function rememberRangePreset(id: string) {
  const preset = RANGE_PRESETS.find((p) => p.id === id);
  if (preset) writeSession(RANGE_KEY, preset.range());
}

/** The date range shared by both report tabs (default: last 30 days). */
export function useTeamReportRange() {
  const [range, setRange] = useSessionState<Range>(RANGE_KEY, RANGE_PRESETS[1].range(), isRange);
  const activePresetId = RANGE_PRESETS.find((p) => {
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
      setRange((r) => ({ from, to: from > r.to ? from : r.to }));
    },
    setToDate: (to: string) => {
      if (!ISO_DATE.test(to)) return;
      setRange((r) => ({ from: to < r.from ? to : r.from, to }));
    },
    applyPreset: (p: RangePreset) => setRange(p.range()),
    activePresetId,
  };
}

/** Units are the only measure shown: every unit type costs 1 unit per action
 *  (Assessment now charges like AI Interview — 1 unit when the candidate starts),
 *  so a separate Actions view added nothing. Kept as a type for the formatters. */
export type Measure = 'actions' | 'units';

// ─── Unit stat cards ──────────────────────────────────────────────────────────

/** Grid for the five unit cards — the same on Team Usage and Analytics. */
export const UNIT_STAT_GRID = 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3';

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
        <span className="block truncate text-xs text-gray-600 dark:text-slate-400">{label}</span>
        {loading
          ? <span className="mt-1 block h-5 w-10 animate-pulse rounded bg-gray-100 dark:bg-slate-800" />
          : <span className="block text-lg max-sm:text-base font-semibold leading-tight tracking-tight tabular-nums text-gray-900 dark:text-slate-50">{value}</span>}
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

export function RangePresets({ activeId, onPick, className = '' }: { activeId?: string; onPick: (p: RangePreset) => void; className?: string }) {
  return (
    <div className={`flex gap-1.5 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0 ${className}`} role="group" aria-label="Date range presets">
      {RANGE_PRESETS.map((preset) => {
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
    ['Resume Units (RU)', '1 unit per uploaded resume. Duplicates you discard are not charged; overwriting or saving a new version is. Units come back when a resume is deleted or an upload is cancelled.'],
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
