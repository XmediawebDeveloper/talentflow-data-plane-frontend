'use client';

import { useEffect, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import ListPagination from '@/components/ListPagination';
import {
  bulkInviteService,
  type BulkInviteReviewPage,
  type BulkInviteReviewRequest,
  type BulkInviteReviewRow,
  type BulkInviteReviewStatus,
} from '@/lib/services/bulkInviteService';
import { formatCandidateFirstName } from '@/lib/utils/candidateNameDisplay';
import type { InviteKind } from './inviteVersions';

export type ReviewCounts = BulkInviteReviewPage['counts'];
/** A row unticked in the review: which side of the request it leaves. */
export type LeftOut = Record<string, 'list' | 'extra'>;

type View = BulkInviteReviewStatus | 'all';
const VIEWS: { value: View; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'invite', label: 'Will be invited' },
  { value: 'skipped', label: 'Skipped' },
  { value: 'left_out', label: 'Left out' },
];

/**
 * The invite popup's Review step: everyone the send names, as the server
 * plans it (POST /jd/{id}/bulk-invites/review) — who is invited, who is
 * skipped and why, who was unticked here. Server-paged, so a selection of
 * thousands reviews like one of ten. Unticking adds the row's key to
 * `leftOut`, which the send applies.
 */
export default function InviteReviewStep({
  jdId,
  kind,
  request,
  leftOut,
  onLeftOut,
  onCounts,
}: {
  jdId: string;
  kind: InviteKind;
  /** The send as it stands, without the review's own fields. */
  request: Omit<BulkInviteReviewRequest, 'left_out' | 'view' | 'group' | 'search' | 'page' | 'page_size'>;
  leftOut: LeftOut;
  onLeftOut: (next: LeftOut) => void;
  onCounts: (counts: ReviewCounts | null) => void;
}) {
  const [view, setView] = useState<View>('all');
  const [group, setGroup] = useState<string>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [data, setData] = useState<BulkInviteReviewPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  /* The request the shown page answers; anything newer is still loading. */
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const requestKey = JSON.stringify({ request, leftOut: Object.keys(leftOut).sort(), view, group, search, page, pageSize });
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    bulkInviteService.review(jdId, {
      ...request,
      left_out: Object.keys(leftOut),
      view,
      group: group || undefined,
      search: search || undefined,
      page,
      page_size: pageSize,
    }, controller.signal)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setError(null);
        setLoadedKey(requestKey);
        onCounts(res.counts);
      })
      .catch((err: unknown) => {
        if (cancelled || controller.signal.aborted) return;
        setError((err as Error)?.message || 'Could not load the review.');
        setLoadedKey(requestKey);
        onCounts(null);
      });
    return () => { cancelled = true; controller.abort(); };
    // requestKey stands for every input above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jdId, requestKey]);

  const isIn = (r: BulkInviteReviewRow) => !leftOut[r.key];
  const toggle = (r: BulkInviteReviewRow) => {
    const next = { ...leftOut };
    if (next[r.key]) delete next[r.key]; else next[r.key] = r.origin;
    onLeftOut(next);
  };
  const busy = loadedKey !== requestKey;
  const items = data?.items ?? [];
  const tickable = items.filter((r) => r.status !== 'skipped');
  const pageAllIn = tickable.length > 0 && tickable.every(isIn);
  const togglePage = () => {
    const next = { ...leftOut };
    for (const r of tickable) {
      if (pageAllIn) next[r.key] = r.origin; else delete next[r.key];
    }
    onLeftOut(next);
  };
  const counts = data?.counts;
  const showName = (n: string) => (kind === 'interview' ? formatCandidateFirstName(n) : n);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex-1 min-w-[12rem]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" aria-hidden="true" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search name or email"
            aria-label="Search candidates"
            className="h-9 w-full pl-8 pr-2 text-sm border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-blue/40"
          />
        </label>
        <div role="group" aria-label="Show" className="inline-flex flex-wrap gap-0.5 rounded-lg bg-gray-100 dark:bg-slate-800 p-0.5">
          {VIEWS.map((v) => {
            const n = counts ? counts[v.value] : null;
            if (v.value !== 'all' && n === 0 && view !== v.value) return null;
            return (
              <button
                key={v.value}
                type="button"
                aria-pressed={view === v.value}
                onClick={() => { setView(v.value); setPage(1); }}
                className={`h-8 px-2.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                  view === v.value
                    ? 'bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-50 shadow-sm'
                    : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100'
                }`}
              >
                {v.label}{n !== null && <span className="ml-1 tabular-nums text-gray-400">{n.toLocaleString()}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {data && data.groups.length > 1 && (
        <div role="group" aria-label="Source" className="flex flex-wrap gap-1.5">
          {[{ label: '', count: data.counts.all }, ...data.groups].map((g) => (
            <button
              key={g.label || 'all'}
              type="button"
              aria-pressed={group === g.label}
              onClick={() => { setGroup(g.label); setPage(1); }}
              className={`h-7 px-2.5 rounded-full text-xs font-medium border whitespace-nowrap ${
                group === g.label
                  ? 'border-brand-blue bg-brand-blue/10 text-brand-blue'
                  : 'border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800'
              }`}
            >
              {g.label || 'All sources'}<span className="ml-1 tabular-nums text-gray-400">{g.count.toLocaleString()}</span>
            </button>
          ))}
        </div>
      )}

      {error ? (
        <p className="rounded-lg border border-destructive-line bg-destructive-subtle px-3 py-3 text-sm text-destructive">{error}</p>
      ) : !data ? (
        <div className="flex items-center justify-center py-12 rounded-lg border border-dashed border-gray-200 dark:border-slate-700">
          <Loader2 className="w-5 h-5 animate-spin text-brand-blue" />
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-lg border border-gray-200 dark:border-slate-700">
          {busy && <div className="absolute inset-0 z-[1] bg-white/50 dark:bg-slate-900/50" aria-hidden="true" />}
          <table className="w-full table-fixed text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-xs text-gray-500 dark:text-slate-400">
              <tr>
                <th className="w-10 px-3 py-2 text-left">
                  <input
                    type="checkbox"
                    checked={pageAllIn}
                    disabled={tickable.length === 0}
                    ref={(el) => { if (el) el.indeterminate = !pageAllIn && tickable.some(isIn); }}
                    onChange={togglePage}
                    aria-label="Include everyone on this page"
                    className="m-0 rounded border-gray-300 cursor-pointer disabled:cursor-not-allowed"
                  />
                </th>
                <th className="px-3 py-2 text-left font-semibold">Name</th>
                <th className="hidden sm:table-cell px-3 py-2 text-left font-semibold">Email</th>
                <th className="hidden md:table-cell w-36 px-3 py-2 text-left font-semibold">Source</th>
                <th className="w-40 sm:w-48 px-3 py-2 text-left font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
              {items.map((r) => {
                const skipped = r.status === 'skipped';
                const on = !skipped && isIn(r);
                return (
                  <tr
                    key={r.key}
                    onClick={() => { if (!skipped) toggle(r); }}
                    className={`${skipped ? '' : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800/60'} ${on ? '' : 'text-gray-400 dark:text-slate-500'}`}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={skipped}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggle(r)}
                        aria-label={`Invite ${r.name}`}
                        className="m-0 rounded border-gray-300 cursor-pointer disabled:cursor-not-allowed"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <span className={`block truncate font-medium ${on ? 'text-gray-900 dark:text-slate-50' : ''}`} title={r.name}>{showName(r.name)}</span>
                      <span className="block truncate text-xs text-gray-500 dark:text-slate-400 sm:hidden">{r.email || 'No email'}</span>
                    </td>
                    <td className="hidden sm:table-cell px-3 py-2"><span className="block truncate" title={r.email}>{r.email || '—'}</span></td>
                    <td className="hidden md:table-cell px-3 py-2"><span className="block truncate text-xs" title={r.group}>{r.group}</span></td>
                    <td className="px-3 py-2">
                      {skipped ? (
                        <span title={r.reason ?? undefined} className="inline-flex max-w-full items-center rounded-full border border-warning-line bg-warning-subtle px-2 py-0.5 text-2xs font-medium text-warning-strong">
                          <span className="truncate">{r.reason}</span>
                        </span>
                      ) : on ? (
                        <span className="text-xs font-medium text-success-strong">Will be invited</span>
                      ) : (
                        <span className="text-xs">Left out</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-sm text-gray-500 dark:text-slate-400">
                    {data.counts.all === 0 ? 'No candidates added yet.' : 'No one matches these filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > 10 && (
        <ListPagination
          currentPage={data.page}
          itemsPerPage={pageSize}
          totalItems={data.total}
          onPageChange={setPage}
          onItemsPerPageChange={(n) => { setPageSize(n); setPage(1); }}
          pageSizeOptions={[25, 50, 100]}
          itemLabel="candidates"
          compact
          attached
          minimalOnMobile
        />
      )}
    </div>
  );
}
