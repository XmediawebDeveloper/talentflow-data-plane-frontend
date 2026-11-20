'use client';

import { Layers } from 'lucide-react';
import FilterSelect from '@/components/ui/filter-select';
import type { FilterChip } from '@/components/ui/filter-chips';

/**
 * The Resume Database "Versions" dropdown (My Resumes and Shared Database).
 *
 * GET /resumes has no version filter, but every row carries `version_count`,
 * so a narrowed view loads every row the rest of the request matches
 * (fetchAllRows) and keeps the ones asked for: resumes re-uploaded at least
 * once (v2+) or still on their first upload (v1).
 */
export type ResumeVersionFilter = 'all' | 'with-versions' | 'single';

export const RESUME_VERSION_FILTER_OPTIONS: { value: ResumeVersionFilter; label: string }[] = [
  { value: 'all', label: 'All versions' },
  { value: 'with-versions', label: 'Has versions (v2+)' },
  { value: 'single', label: 'Single version (v1)' },
];

/** Rows matching the Versions choice (all rows for 'all'). */
export function keepByVersion<T extends { version_count?: number | null }>(rows: T[], filter: ResumeVersionFilter): T[] {
  if (filter === 'all') return rows;
  return rows.filter((r) => (filter === 'with-versions' ? (r.version_count || 1) > 1 : (r.version_count || 1) <= 1));
}

/** The Versions choice as a filter tag — counts on the Filter badge, and Reset
 *  (which removes every tag it is handed) sets it back to All versions. */
export function versionFilterChips(filter: ResumeVersionFilter, onClear: () => void): FilterChip[] {
  if (filter === 'all') return [];
  return [{
    key: 'version-filter',
    label: 'Versions',
    value: RESUME_VERSION_FILTER_OPTIONS.find((o) => o.value === filter)?.label ?? filter,
    onRemove: onClear,
  }];
}

/** The dropdown itself, styled as the toolbar's other filter selects. */
export function ResumeVersionFilterSelect({
  value,
  onChange,
  compact = false,
}: {
  value: ResumeVersionFilter;
  onChange: (value: ResumeVersionFilter) => void;
  /** h-9 (Shared Database's bar) instead of h-10 (My Resumes'). */
  compact?: boolean;
}) {
  const isActive = value !== 'all';
  return (
    <label title="Versions" className="relative min-w-0 flex-1 sm:min-w-[180px] sm:flex-none">
      <span className="sr-only">Versions</span>
      <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-gray-500">
        <Layers className="h-4 w-4" />
      </span>
      <FilterSelect
        value={value}
        onChange={(v) => onChange(v as ResumeVersionFilter)}
        ariaLabel="Versions"
        options={RESUME_VERSION_FILTER_OPTIONS}
        className={`w-full sm:w-full ${compact ? 'data-[size=default]:h-9 sm:data-[size=default]:h-9' : 'data-[size=default]:h-10 sm:data-[size=default]:h-10'} py-0 sm:py-0 pl-9 sm:pl-9 pr-3 sm:pr-3 rounded-lg sm:rounded-lg transition-all ${
          isActive
            ? 'border-brand-blue/40 dark:border-brand-blue/40 bg-brand-blue/5 text-brand-blue'
            : 'border-gray-300 bg-gray-50 hover:bg-white'
        }`}
      />
    </label>
  );
}
