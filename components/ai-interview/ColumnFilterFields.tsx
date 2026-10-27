'use client';

import type { ReactNode } from 'react';
import type { SearchableSelectOption } from '@/components/ui/searchable-select';
import { DateField } from '@/components/ui/date-field';
// Aliased: this module exports its own FilterSelect field wrapper.
import Dropdown from '@/components/ui/filter-select';

/**
 * The fields the Invitation Status and Candidate Results filter panels are
 * built from — one per filterable table column — so the two tabs' panels
 * look and behave the same. Values are always strings, '' meaning "any".
 */

export const FILTER_FIELD_CLASS =
  'w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-black dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40';

const LABEL_CLASS = 'block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5';

export function FilterField({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={LABEL_CLASS}>{label}</label>
      {children}
    </div>
  );
}

export function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
  anyLabel,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  anyLabel: string;
}) {
  return (
    <FilterField id={id} label={label}>
      <Dropdown
        id={id}
        value={value}
        onChange={(v) => onChange(v)}
        className="w-full sm:w-full px-3 sm:px-3 py-2 sm:py-2 rounded-lg sm:rounded-lg text-black dark:text-slate-100"
        options={[
          { value: '', label: anyLabel },
          ...options.map((option) => ({ value: option.value, label: option.label })),
        ]}
      />
    </FilterField>
  );
}

/** A from–to date pair; either end may be left open. */
export function FilterDateRange({
  idPrefix,
  label,
  from,
  to,
  onFromChange,
  onToChange,
}: {
  idPrefix: string;
  label: string;
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}) {
  return (
    <FilterField id={`${idPrefix}-from`} label={label}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <DateField
          id={`${idPrefix}-from`}
          aria-label={`${label} from`}
          value={from}
          max={to || undefined}
          onChange={onFromChange}
          className="sm:flex-1 sm:min-w-0"
        />
        <span className="text-xs text-gray-400 text-center sm:text-left sm:flex-shrink-0">to</span>
        <DateField
          aria-label={`${label} to`}
          value={to}
          min={from || undefined}
          onChange={onToChange}
          className="sm:flex-1 sm:min-w-0"
        />
      </div>
    </FilterField>
  );
}

/** Job options — one per job id, labelled with its title, searchable by both. */
export function jobFilterOptions<T>(
  rows: T[],
  jobId: (row: T) => string | null | undefined,
  jobTitle: (row: T) => string | null | undefined,
): SearchableSelectOption[] {
  const byId = new Map<string, string>();
  rows.forEach((row) => {
    const id = jobId(row);
    if (id && !byId.has(id)) byId.set(id, jobTitle(row) || '');
  });
  return [...byId.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([id, title]) => ({ value: id, label: title ? `${id} · ${title}` : id }));
}

/** V1, V2, … — the version numbers that actually occur in the rows. */
export function versionFilterOptions<T>(rows: T[], version: (row: T) => number | null | undefined) {
  const seen = new Set<number>();
  rows.forEach((row) => {
    const v = version(row);
    if (typeof v === 'number') seen.add(v);
  });
  return [...seen].sort((a, b) => a - b).map((v) => ({ value: String(v), label: `V${v}` }));
}

export const INVITE_SOURCE_FILTER_OPTIONS = [
  { value: 'email', label: 'From Email' },
  { value: 'resume', label: 'From Resume' },
];

/** The Score column's Pass / Fail badge, as a filter. 60% is the pass mark
 *  both tables' Score cells use. */
export const RESULT_PASS_MARK = 60;
export const RESULT_FILTER_OPTIONS = [
  { value: 'pass', label: 'Pass' },
  { value: 'fail', label: 'Fail' },
  { value: 'unscored', label: 'Not scored' },
];
export const matchesResultFilter = (score: number | null | undefined, filter: string): boolean => {
  if (!filter) return true;
  if (filter === 'unscored') return score == null;
  if (score == null) return false;
  return filter === 'pass' ? score >= RESULT_PASS_MARK : score < RESULT_PASS_MARK;
};

/** Inclusive of the whole `to` day — picking today means today's rows. */
export const matchesDateRange = (at: string | null | undefined, from: string, to: string): boolean => {
  if (!from && !to) return true;
  if (!at) return false;
  const time = new Date(at).getTime();
  if (Number.isNaN(time)) return false;
  if (from && time < new Date(`${from}T00:00:00`).getTime()) return false;
  if (to && time > new Date(`${to}T23:59:59.999`).getTime()) return false;
  return true;
};
