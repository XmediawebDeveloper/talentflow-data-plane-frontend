'use client';

/**
 * One resume selection shared by both tabs of the Resume Database page.
 *
 * My Resumes and Shared Database are separate views that mount/unmount as the
 * tab changes, so each used to hold its own `selectedResumes` state — ticking
 * 2 in My Resumes and switching to Shared Database dropped them. The page
 * now owns the selection (and a cache of every row either tab has shown, so
 * bulk actions can read resumes that are no longer on screen) and both views
 * read it through `useResumeSelection`.
 *
 * Without a provider (a view rendered on its own) the hook falls back to
 * local state, i.e. the old per-view behaviour.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import type { Resume } from '@/lib/types/types';

interface ResumeSelectionContextValue {
  selected: string[];
  setSelected: Dispatch<SetStateAction<string[]>>;
  rows: Map<string, Resume>;
}

const ResumeSelectionContext = createContext<ResumeSelectionContextValue | null>(null);

export function ResumeSelectionProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<string[]>([]);
  // A stable Map (never replaced), so the views can add rows to it.
  const [rows] = useState<Map<string, Resume>>(() => new Map());
  const value = useMemo(
    () => ({ selected, setSelected, rows }),
    [selected, rows],
  );
  return <ResumeSelectionContext.Provider value={value}>{children}</ResumeSelectionContext.Provider>;
}

/**
 * @param visibleRows the rows this view currently has loaded; they are
 *   remembered so a selection made here can still be acted on from the
 *   other tab (or another page / folder of this one).
 */
export function useResumeSelection(visibleRows: readonly Resume[]) {
  const ctx = useContext(ResumeSelectionContext);
  const [localSelected, setLocalSelected] = useState<string[]>([]);
  const [localRows] = useState<Map<string, Resume>>(() => new Map());

  const selectedResumes = ctx ? ctx.selected : localSelected;
  const setSelectedResumes = ctx ? ctx.setSelected : setLocalSelected;
  const rowMap = ctx ? ctx.rows : localRows;

  // Latest copy wins, so a row refreshed on screen (archived, renamed, …)
  // replaces the stale one.
  visibleRows.forEach((r) => rowMap.set(r.id, r));

  const rowById = useCallback((id: string): Resume | undefined => rowMap.get(id), [rowMap]);
  /** Remember rows that were fetched but never shown (e.g. "Select all
   *  resumes" across every page), so bulk actions can still read them. */
  const rememberRows = useCallback((rows: readonly Resume[]) => {
    rows.forEach((r) => rowMap.set(r.id, r));
  }, [rowMap]);
  const selectedRows: Resume[] = selectedResumes
    .map((id) => rowMap.get(id))
    .filter((r): r is Resume => !!r);

  return { selectedResumes, setSelectedResumes, rowById, selectedRows, rememberRows };
}
