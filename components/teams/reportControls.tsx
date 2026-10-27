'use client';

import { useEffect, useRef, useState } from 'react';
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

/** The same-length range just before [from, to] — for "vs previous period".
 *  Plain calendar arithmetic on the YYYY-MM-DD values (UTC, so no DST/time-zone drift). */
export function previousRange(from: string, to: string) {
  const parse = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const fmt = (ms: number) => new Date(ms).toISOString().split('T')[0];
  const start = parse(from);
  const days = Math.round((parse(to) - start) / DAY_MS) + 1;
  const prevTo = start - DAY_MS;
  return { from: fmt(prevTo - (days - 1) * DAY_MS), to: fmt(prevTo), days };
}

/** "▲ 18% vs previous 30 days" for a current / previous pair. null = nothing worth saying. */
export function periodDelta(current: number, previous: number, days: number, formatValue: (v: number) => string) {
  const hint = `Previous ${days} days: ${formatValue(previous)}`;
  if (previous === 0) return current > 0 ? { text: `New vs previous ${days} days`, tone: 'up' as const, hint } : null;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return { text: `No change vs previous ${days} days`, tone: 'flat' as const, hint };
  return { text: `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}% vs previous ${days} days`, tone: pct > 0 ? ('up' as const) : ('down' as const), hint };
}
export type PeriodDelta = NonNullable<ReturnType<typeof periodDelta>>;

export type RangePreset = { id: string; label: string; range: () => { from: string; to: string } };

export const RANGE_PRESETS: RangePreset[] = [
  { id: '7d', label: 'Last 7 days', range: () => ({ from: daysAgoIST(7), to: todayIST() }) },
  { id: '30d', label: 'Last 30 days', range: () => ({ from: daysAgoIST(30), to: todayIST() }) },
  { id: '90d', label: 'Last 90 days', range: () => ({ from: daysAgoIST(90), to: todayIST() }) },
  { id: 'this-month', label: 'This month', range: () => ({ from: monthBoundsIST(0).first, to: todayIST() }) },
  { id: 'last-month', label: 'Last month', range: () => ({ from: monthBoundsIST(-1).first, to: monthBoundsIST(-1).last }) },
];

// ─── Session-backed state ─────────────────────────────────────────────────────

const RANGE_KEY = 'team-report:range';
const MEASURE_KEY = 'team-report:measure';

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
function useSessionState<T>(key: string, initial: T, valid: (v: unknown) => v is T) {
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
    setFromDate: (from: string) => setRange((r) => ({ ...r, from })),
    setToDate: (to: string) => setRange((r) => ({ ...r, to })),
    applyPreset: (p: RangePreset) => setRange(p.range()),
    activePresetId,
  };
}

export type Measure = 'actions' | 'units';
const isMeasure = (v: unknown): v is Measure => v === 'actions' || v === 'units';

/** Actions / Units, shared by both report tabs. */
export function useReportMeasure(initial: Measure = 'actions') {
  return useSessionState<Measure>(MEASURE_KEY, initial, isMeasure);
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

export function MeasureToggle({ value, onChange, className = '' }: { value: Measure; onChange: (m: Measure) => void; className?: string }) {
  return (
    <div role="group" aria-label="Show actions or units" className={`inline-flex rounded-lg bg-gray-100 p-0.5 dark:bg-slate-800 ${className}`}>
      {(['actions', 'units'] as const).map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={value === m}
          onClick={() => onChange(m)}
          title={m === 'actions' ? 'How many times each feature was used' : 'How many units were consumed'}
          className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
            value === m ? 'bg-white text-gray-900 shadow-sm dark:bg-slate-900 dark:text-slate-50' : 'text-gray-500 hover:text-gray-900 dark:text-slate-400'
          }`}
        >
          {m}
        </button>
      ))}
    </div>
  );
}
