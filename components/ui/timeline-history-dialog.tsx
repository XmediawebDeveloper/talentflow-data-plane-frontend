'use client';

import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { History, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatIST, parseIST } from '@/lib/utils/dateUtils';

/** How many timeline events a results row shows before "View History" —
 *  the Job Details Assessment Result and AI Interview Result tabs. */
export const RESULTS_TIMELINE_LIMIT = 2;

/** One event of an invitation's full trail, as the history table shows it.
 *  Each module builds these from its own timeline builder + audit API. */
export type TimelineHistoryRow = {
  label: string;
  at: string;
  Icon: LucideIcon;
  tone: string;
  /** The event moved the invitation to a new status (vs. an edit / email signal). */
  isStatus: boolean;
  description?: string;
  /** The candidate email the audit row recorded, when the API sent one. */
  email?: string;
};

/** The results tabs' "View History" trigger, under the compact timeline. */
export function ViewHistoryButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="inline-flex w-fit items-center gap-1 text-2xs font-medium text-brand-blue hover:underline"
    >
      <History className="w-3 h-3 shrink-0" /> View History
    </button>
  );
}

/**
 * The complete timeline of one candidate's invitation, oldest first (latest
 * update last), as a table (Event · Date & Time · Status · Details); stacked cards on phones.
 * Mounted only while open, so each opening fetches afresh via `load`.
 */
export function TimelineHistoryDialog({
  candidateName,
  candidateEmail,
  load,
  onClose,
}: {
  candidateName?: string | null;
  candidateEmail?: string | null;
  /** Resolves the full trail, oldest first. */
  load: () => Promise<TimelineHistoryRow[]>;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<TimelineHistoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    load()
      /* Ascending by the events' own timestamps; a stable sort, so events at
         the same instant keep the builder's order. */
      .then((r) => { if (live) setRows([...r].sort((a, b) => parseIST(a.at).getTime() - parseIST(b.at).getTime())); })
      .catch((err: unknown) => { if (live) setError(err instanceof Error && err.message ? err.message : 'Failed to load history'); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // The current status: the latest event that is a status (the last one).
  let currentIndex = -1;
  rows?.forEach((r, i) => { if (r.isStatus) currentIndex = i; });
  const statusCell = (row: TimelineHistoryRow, i: number) =>
    i === currentIndex ? (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-medium whitespace-nowrap bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20">
        Current status
      </span>
    ) : row.isStatus ? (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-medium whitespace-nowrap bg-gray-50 text-gray-600 ring-1 ring-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
        Previous status
      </span>
    ) : (
      <span className="text-xs text-gray-500 dark:text-slate-500 whitespace-nowrap">Activity</span>
    );
  const details = (row: TimelineHistoryRow) => (
    <>
      {row.description && <span className="block">{row.description}</span>}
      {row.email && <span className="block text-gray-500 dark:text-slate-500 [overflow-wrap:anywhere]">{row.email}</span>}
      {!row.description && !row.email && <span className="text-gray-400 dark:text-slate-500">—</span>}
    </>
  );

  return (
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-6" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] w-full max-w-[95vw] sm:max-w-2xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="timeline-history-title"
      >
        <div className="shrink-0 flex items-center gap-3 p-4 sm:p-5 border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50">
          <div className="w-10 h-10 shrink-0 rounded-xl bg-brand-blue shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 flex items-center justify-center">
            <History className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h3 id="timeline-history-title" className="text-base sm:text-lg font-medium text-gray-900 dark:text-slate-50 tracking-tight">Timeline History</h3>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 mt-0.5 truncate" title={[candidateName, candidateEmail].filter(Boolean).join(' · ')}>
              {candidateName || 'Candidate'}
              {candidateEmail && <span className="text-gray-400 dark:text-slate-500"> · {candidateEmail}</span>}
            </p>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5">
          {!rows && !error ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 text-brand-blue animate-spin" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive py-6 text-center">{error}</p>
          ) : rows && rows.length > 0 ? (
            <>
              {/* Phones: one card per event. */}
              <ol className="sm:hidden space-y-2">
                {rows.map((row, i) => (
                  <li key={`${row.label}-${row.at}-${i}`} className={`rounded-lg border p-3 ${i === currentIndex ? 'border-brand-blue/30 bg-brand-blue/5' : 'border-gray-200 dark:border-slate-700'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={`flex min-w-0 items-center gap-2 text-sm font-medium ${row.tone}`}>
                        <row.Icon className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{row.label}</span>
                      </span>
                      <span className="shrink-0">{statusCell(row, i)}</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">{formatIST(row.at)}</p>
                    <div className="mt-1 text-xs text-gray-700 dark:text-slate-300">{details(row)}</div>
                  </li>
                ))}
              </ol>

              {/* Tablet and up: the table. */}
              <div className="hidden sm:block overflow-x-auto rounded-lg border border-gray-200 dark:border-slate-700">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700">
                    <tr>
                      {['Event', 'Date & Time', 'Status', 'Details'].map((h) => (
                        <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                    {rows.map((row, i) => (
                      <tr key={`${row.label}-${row.at}-${i}`} className={i === currentIndex ? 'bg-brand-blue/5' : ''}>
                        <td className="px-3 py-2.5 align-top">
                          <span className={`flex items-center gap-2 font-medium whitespace-nowrap ${row.tone}`}>
                            <row.Icon className="w-3.5 h-3.5 shrink-0" />
                            {row.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 align-top text-xs text-gray-600 dark:text-slate-400 whitespace-nowrap">{formatIST(row.at)}</td>
                        <td className="px-3 py-2.5 align-top">{statusCell(row, i)}</td>
                        <td className="px-3 py-2.5 align-top text-xs text-gray-700 dark:text-slate-300 min-w-[10rem]">{details(row)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-500 dark:text-slate-500 py-6 text-center">No history recorded yet.</p>
          )}
        </div>

        <div className="shrink-0 flex flex-wrap items-center justify-end gap-3 p-4 sm:p-5 border-t border-gray-100 dark:border-slate-700/60">
          <Button variant="secondary" size="md" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
