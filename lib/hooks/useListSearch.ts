'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDebounce } from './useDebounce';

/**
 * One search-and-filter state machine for every list in the app.
 *
 * Each list had been re-implementing the same six things by hand — the typed
 * query, the applied query, staged-vs-committed filters, the active-filter
 * count, resetting the page on change, and a reset that actually clears
 * everything. Doing it six different ways is what let the pages drift apart, so
 * this owns the whole shape and pages just render it.
 *
 * Two query values, deliberately:
 *   `query`        — what the user typed. Bind the input to this.
 *   `appliedQuery` — settled after `debounceMs`. Filter or fetch with this, and
 *                    use it for highlighting, so highlights match the results
 *                    on screen instead of the half-typed word.
 *
 * Two filter values, also deliberately:
 *   `draftFilters` — what the panel shows while the user picks.
 *   `filters`      — committed on `applyFilters()`. The list reads these, so
 *                    opening a panel and changing your mind costs nothing.
 * Panels that apply instantly can ignore the draft pair and call `setFilter`.
 */
export interface UseListSearchOptions<F extends Record<string, unknown>> {
  /** Filter values for an unfiltered list. Also what `reset()` restores. */
  initialFilters: F;
  /** Quiet period before `appliedQuery` updates. 0 applies each keystroke. */
  debounceMs?: number;
  /**
   * How many filters are active. Default counts keys differing from
   * `initialFilters`. Override when several fields are one logical filter — a
   * min/max range should read as 1, not 2.
   */
  countFilters?: (filters: F, initial: F) => number;
  /**
   * Fired whenever the applied query or committed filters change. Almost always
   * `() => setPage(1)` — narrowing a list while on page 3 strands the user on a
   * page that no longer exists.
   */
  onChange?: () => void;
}

export interface UseListSearch<F extends Record<string, unknown>> {
  query: string;
  setQuery: (value: string) => void;
  appliedQuery: string;
  filters: F;
  setFilter: <K extends keyof F>(key: K, value: F[K]) => void;
  setFilters: (filters: F) => void;
  draftFilters: F;
  setDraftFilter: <K extends keyof F>(key: K, value: F[K]) => void;
  /** Commits the draft. Call from the panel's "Done". */
  applyFilters: () => void;
  /** Drops uncommitted edits — for a panel dismissed without applying. */
  discardDraft: () => void;
  /** True once filters have been committed at least once and some are active. */
  filtersApplied: boolean;
  activeFilterCount: number;
  /** True when a search or any filter is narrowing the list. */
  isNarrowed: boolean;
  /** Clears the query and every filter, committed and draft alike. */
  reset: () => void;
}

export function useListSearch<F extends Record<string, unknown>>({
  initialFilters,
  debounceMs = 300,
  countFilters,
  onChange,
}: UseListSearchOptions<F>): UseListSearch<F> {
  const [query, setQueryState] = useState('');
  const [filters, setFiltersState] = useState<F>(initialFilters);
  const [draftFilters, setDraftFiltersState] = useState<F>(initialFilters);
  const [filtersConfirmed, setFiltersConfirmed] = useState(false);

  const appliedQuery = useDebounce(query, debounceMs);

  // Ref, not a dependency: callers routinely pass an inline arrow, and taking
  // it as a dep would rebuild every callback on each render. Assigned in an
  // effect — writing to a ref during render is not allowed.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // `initialFilters` is an object literal at most call sites, so a fresh
  // identity every render. Held in state rather than a ref: this is read during
  // render, which refs are not for.
  const [initial] = useState(initialFilters);

  const notify = useCallback(() => {
    onChangeRef.current?.();
  }, []);

  const setQuery = useCallback((value: string) => {
    setQueryState(value);
    notify();
  }, [notify]);

  const setFilter = useCallback(<K extends keyof F>(key: K, value: F[K]) => {
    setFiltersState((current) => ({ ...current, [key]: value }));
    setDraftFiltersState((current) => ({ ...current, [key]: value }));
    setFiltersConfirmed(true);
    notify();
  }, [notify]);

  const setFilters = useCallback((next: F) => {
    setFiltersState(next);
    setDraftFiltersState(next);
    setFiltersConfirmed(true);
    notify();
  }, [notify]);

  const setDraftFilter = useCallback(<K extends keyof F>(key: K, value: F[K]) => {
    setDraftFiltersState((current) => ({ ...current, [key]: value }));
  }, []);

  const applyFilters = useCallback(() => {
    setFiltersState(draftFilters);
    setFiltersConfirmed(true);
    notify();
  }, [draftFilters, notify]);

  const discardDraft = useCallback(() => {
    setDraftFiltersState(filters);
  }, [filters]);

  const reset = useCallback(() => {
    setQueryState('');
    setFiltersState(initial);
    setDraftFiltersState(initial);
    setFiltersConfirmed(false);
    notify();
  }, [initial, notify]);

  const activeFilterCount = useMemo(() => {
    if (countFilters) return countFilters(filters, initial);
    return Object.keys(initial).filter((key) => {
      const current = filters[key];
      const base = initial[key];
      if (Array.isArray(current) && Array.isArray(base)) return current.length !== base.length;
      return current !== base;
    }).length;
  }, [filters, initial, countFilters]);

  return {
    query,
    setQuery,
    appliedQuery,
    filters,
    setFilter,
    setFilters,
    draftFilters,
    setDraftFilter,
    applyFilters,
    discardDraft,
    filtersApplied: filtersConfirmed && activeFilterCount > 0,
    activeFilterCount,
    isNarrowed: appliedQuery.trim() !== '' || activeFilterCount > 0,
    reset,
  };
}
