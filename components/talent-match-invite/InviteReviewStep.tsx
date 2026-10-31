'use client';

import { Fragment, useEffect, useState } from 'react';
import { ChevronDown, Eye, Loader2, Search } from 'lucide-react';
import ListPagination from '@/components/ListPagination';
import ResumeTextPreviewModal from '@/components/ResumeTextPreviewModal';
import {
  bulkInviteService,
  type BulkInviteReviewPage,
  type BulkInviteReviewRequest,
  type BulkInviteReviewRow,
  type BulkInviteReviewStatus,
} from '@/lib/services/bulkInviteService';
import { formatCandidateFirstName } from '@/lib/utils/candidateNameDisplay';
import { useIsMobile } from '@/components/ui/use-mobile';
import { SOURCE_META, SourceIcon, sourceFromLabel } from './inviteSources';
import type { InviteKind } from './inviteVersions';

export type ReviewCounts = BulkInviteReviewPage['counts'];
/** A row unticked in the review: which side of the request it leaves. */
export type LeftOut = Record<string, 'list' | 'extra'>;

type View = BulkInviteReviewStatus | 'all';
/* Selected = will be invited; Not selected = unticked here; Needs attention =
   ticked but skipped at send (already invited, same email, …). */
const VIEWS: { value: View; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'invite', label: 'Selected' },
  { value: 'left_out', label: 'Not selected' },
  { value: 'skipped', label: 'Needs attention' },
];
const PAGE_SIZE = 10;
/* "Select all / Deselect all" read every matching row's key, this many a request. */
const KEY_PAGE = 200;

/**
 * The invite popup's Review step: everyone the send names, as the server
 * plans it (POST /jd/{id}/bulk-invites/review) — who is invited, who is
 * skipped and why, who was unticked here. Server-paged, so a selection of
 * thousands reviews like one of ten: search, All / Selected / Not selected /
 * Needs attention, a chip per source, rows grouped by source (a group can be
 * ticked whole, or hidden), 10 a page. Unticking adds the row's key to
 * `leftOut`, which the send applies.
 */
export default function InviteReviewStep({
  jdId,
  kind,
  request,
  leftOut,
  onLeftOut,
  onCounts,
  onAddCandidates,
  onOverlayChange,
}: {
  jdId: string;
  kind: InviteKind;
  /** The send as it stands, without the review's own fields. */
  request: Omit<BulkInviteReviewRequest, 'left_out' | 'view' | 'group' | 'search' | 'page' | 'page_size'>;
  leftOut: LeftOut;
  onLeftOut: (next: LeftOut) => void;
  onCounts: (counts: ReviewCounts | null) => void;
  /** No one added yet: back to the Add candidates step. */
  onAddCandidates?: () => void;
  /** A popup of its own opened over the list (resume, versions): hands the
   *  invite popup its closer, so Esc closes that first; null when it closed. */
  onOverlayChange?: (close: (() => void) | null) => void;
}) {
  const [view, setView] = useState<View>('all');
  const [group, setGroup] = useState<string>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<BulkInviteReviewPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  /* The request the shown page answers; anything newer is still loading. */
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  /* Sources hidden on the page (their header row stays). */
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  /* Select all / Deselect all (or a whole source) reading every matching key. */
  const [bulkBusy, setBulkBusy] = useState(false);
  const [previewing, setPreviewing] = useState<BulkInviteReviewRow | null>(null);
  /* Under `md` the Email and Source columns are hidden: a source's header row spans what is left. */
  const narrow = useIsMobile();
  const closePreview = () => { setPreviewing(null); onOverlayChange?.(null); };

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const requestKey = JSON.stringify({ request, leftOut: Object.keys(leftOut).sort(), view, group, search, page });
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
      page_size: PAGE_SIZE,
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

  /* Every row matching the current view + search (and one source, when
     given), read page by page — then ticked or unticked together. */
  const setAll = async (on: boolean, onlyGroup?: string) => {
    if (bulkBusy) return;
    setBulkBusy(true);
    try {
      const rows: BulkInviteReviewRow[] = [];
      for (let p = 1; ; p += 1) {
        const res = await bulkInviteService.review(jdId, {
          ...request,
          left_out: Object.keys(leftOut),
          view,
          group: (onlyGroup ?? group) || undefined,
          search: search || undefined,
          page: p,
          page_size: KEY_PAGE,
        });
        rows.push(...res.items);
        if (res.items.length < KEY_PAGE || rows.length >= res.total) break;
      }
      const next = { ...leftOut };
      for (const r of rows) {
        if (r.status === 'skipped') continue;
        if (on) delete next[r.key]; else next[r.key] = r.origin;
      }
      onLeftOut(next);
    } catch (err) {
      setError((err as Error)?.message || 'Could not update the selection.');
    } finally {
      setBulkBusy(false);
    }
  };

  const busy = loadedKey !== requestKey || bulkBusy;
  const items = data?.items ?? [];
  const counts = data?.counts;
  const showName = (n: string) => (kind === 'interview' ? formatCandidateFirstName(n) : n);
  const selectedCount = counts ? counts.all - counts.left_out : 0;
  const matching = data?.total ?? 0;

  /* The page's rows by source, in the order they arrive. */
  const groups: { label: string; rows: BulkInviteReviewRow[] }[] = [];
  for (const r of items) {
    const g = groups.find((x) => x.label === r.group);
    if (g) g.rows.push(r); else groups.push({ label: r.group, rows: [r] });
  }
  const groupTotal = (label: string) => data?.groups.find((g) => g.label === label)?.count ?? 0;

  if (data && data.counts.all === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-10 text-center space-y-3">
        <p className="text-sm text-gray-600 dark:text-slate-400">
          <b className="font-semibold text-gray-900 dark:text-slate-50">No candidates yet.</b> Go back to add them by typing, uploading a sheet, or picking from your lists.
        </p>
        {onAddCandidates && (
          <button type="button" onClick={onAddCandidates} className="inline-flex items-center h-9 px-4 rounded-lg text-sm font-medium border border-brand-blue/30 text-brand-blue bg-brand-blue/5 hover:bg-brand-blue/10">
            Add candidates
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex-1 min-w-[12rem]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" aria-hidden="true" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name or email"
            aria-label="Search selected candidates"
            className="h-9 w-full pl-8 pr-2 text-sm border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-blue/40"
          />
        </label>
        <div role="group" aria-label="Show" className="inline-flex flex-wrap gap-0.5 rounded-lg bg-gray-100 dark:bg-slate-800 p-0.5">
          {VIEWS.map((v) => {
            const n = counts && v.value === 'skipped' ? counts.skipped : null;
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
                {v.label}{n ? <span className="ml-1 tabular-nums">({n.toLocaleString()})</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      {data && data.groups.length > 0 && (
        <div role="group" aria-label="Source" className="flex flex-wrap gap-1.5">
          {[{ label: '', count: data.counts.all }, ...data.groups].map((g) => (
            <button
              key={g.label || 'all'}
              type="button"
              aria-pressed={group === g.label}
              onClick={() => { setGroup(g.label); setPage(1); }}
              className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-medium border whitespace-nowrap ${
                group === g.label
                  ? 'border-brand-blue bg-brand-blue/10 text-brand-blue'
                  : 'border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800'
              }`}
            >
              {g.label && <SourceIcon source={sourceFromLabel(g.label)} />}
              {g.label || 'All sources'}<span className="tabular-nums text-gray-400">{g.count.toLocaleString()}</span>
            </button>
          ))}
        </div>
      )}

      {counts && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-sm text-gray-700 dark:text-slate-300 tabular-nums">
          <span>
            <b className="font-semibold text-gray-900 dark:text-slate-50">{selectedCount.toLocaleString()} of {counts.all.toLocaleString()} selected</b>
            {counts.skipped > 0 && <span className="text-gray-500 dark:text-slate-400"> · {counts.skipped.toLocaleString()} will be skipped</span>}
          </span>
          <span className="flex items-center gap-2">
            <button type="button" onClick={() => void setAll(true)} disabled={busy || matching === 0} className="h-8 px-2.5 rounded-lg text-xs font-medium border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50">
              Select all {matching.toLocaleString()}
            </button>
            <button type="button" onClick={() => void setAll(false)} disabled={busy || matching === 0} className="h-8 px-2.5 rounded-lg text-xs font-medium border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50">
              Deselect all {matching.toLocaleString()}
            </button>
            {bulkBusy && <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-blue" aria-label="Updating" />}
          </span>
        </div>
      )}

      {error ? (
        <p className="rounded-lg border border-destructive-line bg-destructive-subtle px-3 py-3 text-sm text-destructive">{error}</p>
      ) : !data ? (
        <div className="flex items-center justify-center py-12 rounded-lg border border-dashed border-gray-200 dark:border-slate-700">
          <Loader2 className="w-5 h-5 animate-spin text-brand-blue" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 dark:border-slate-700 px-3 py-8 text-center space-y-3">
          <p className="text-sm text-gray-500 dark:text-slate-400">No candidates match these filters.</p>
          <button
            type="button"
            onClick={() => { setSearchInput(''); setSearch(''); setGroup(''); setView('all'); setPage(1); }}
            className="h-8 px-3 rounded-lg text-xs font-medium border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800"
          >
            Clear search and filters
          </button>
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          {busy && <div className="absolute inset-0 z-[1] bg-white/50 dark:bg-slate-900/50" aria-hidden="true" />}
          <table className="w-full table-fixed text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-xs text-gray-500 dark:text-slate-400">
              <tr>
                <th className="w-10 px-3 py-2 text-left"><span className="sr-only">Select</span></th>
                <th className="px-3 py-2 text-left font-semibold">Name</th>
                <th className="hidden md:table-cell px-3 py-2 text-left font-semibold">Email</th>
                <th className="hidden md:table-cell w-40 px-3 py-2 text-left font-semibold">Source</th>
                <th className="w-32 sm:w-48 px-3 py-2 text-left font-semibold">Status</th>
              </tr>
            </thead>
            {groups.map((g) => {
              const src = sourceFromLabel(g.label);
              const tickable = g.rows.filter((r) => r.status !== 'skipped');
              const allIn = tickable.length > 0 && tickable.every(isIn);
              const someIn = tickable.some(isIn);
              const hidden = !!collapsed[g.label];
              return (
                <tbody key={g.label} className="divide-y divide-gray-100 dark:divide-slate-700/60 border-t border-gray-200 dark:border-slate-700 first-of-type:border-t-0">
                  <tr className="bg-slate-50/70 dark:bg-slate-800/40">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={allIn}
                        disabled={tickable.length === 0 || busy}
                        ref={(el) => { if (el) el.indeterminate = !allIn && someIn; }}
                        onChange={() => void setAll(!allIn, g.label)}
                        aria-label={`Select all from ${g.label}`}
                        className="m-0 rounded border-gray-300 cursor-pointer disabled:cursor-not-allowed"
                      />
                    </td>
                    <td colSpan={narrow ? 2 : 4} className="px-3 py-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <SourceIcon source={src} className="w-4 h-4" />
                        <span className="truncate text-sm font-semibold text-gray-900 dark:text-slate-50">{src ? SOURCE_META[src].label : g.label}</span>
                        <span className="shrink-0 text-xs text-gray-500 dark:text-slate-400 tabular-nums">{groupTotal(g.label).toLocaleString()} {groupTotal(g.label) === 1 ? 'candidate' : 'candidates'}</span>
                        <button
                          type="button"
                          onClick={() => setCollapsed((c) => ({ ...c, [g.label]: !c[g.label] }))}
                          aria-expanded={!hidden}
                          className="ml-auto shrink-0 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-slate-100"
                        >
                          {hidden ? 'Show' : 'Hide'}
                          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${hidden ? '-rotate-90' : ''}`} aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {!hidden && g.rows.map((r) => {
                    const skipped = r.status === 'skipped';
                    const on = !skipped && isIn(r);
                    return (
                      <Fragment key={r.key}>
                        <tr
                          onClick={() => { if (!skipped) toggle(r); }}
                          className={`${skipped ? '' : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800/60'} ${on || skipped ? '' : 'text-gray-400 dark:text-slate-500'}`}
                        >
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={on}
                              disabled={skipped}
                              onClick={(e) => e.stopPropagation()}
                              onChange={() => toggle(r)}
                              aria-label={`Select ${r.name}`}
                              className="m-0 rounded border-gray-300 cursor-pointer disabled:cursor-not-allowed"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <span className="flex items-center gap-1 min-w-0">
                              <span className={`truncate font-medium ${on ? 'text-gray-900 dark:text-slate-50' : ''}`} title={`${r.name}${r.email ? ` · ${r.email}` : ''}`}>{showName(r.name)}</span>
                              {r.resume_id && (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setPreviewing(r); onOverlayChange?.(closePreview); }}
                                  aria-label={`View resume of ${r.name}`}
                                  title="View resume"
                                  className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-md text-gray-400 hover:text-brand-blue hover:bg-brand-blue/10"
                                >
                                  <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                                </button>
                              )}
                            </span>
                            <span className="block truncate text-xs text-gray-500 dark:text-slate-400 md:hidden">{r.email || 'No email'}</span>
                          </td>
                          <td className="hidden md:table-cell px-3 py-2"><span className="block truncate" title={r.email}>{r.email || '—'}</span></td>
                          <td className="hidden md:table-cell px-3 py-2">
                            <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-1.5 py-0.5 text-2xs text-gray-600 dark:text-slate-300" title={r.group}>
                              <SourceIcon source={src} className="w-3 h-3" />
                              <span className="truncate">{src ? SOURCE_META[src].label : r.group}</span>
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            {skipped ? (
                              <span title={r.reason ?? undefined} className="inline-flex max-w-full items-center rounded-full border border-warning-line bg-warning-subtle px-2 py-0.5 text-2xs font-medium text-warning-strong">
                                <span className="truncate">{r.reason ? `${r.reason} · skipped` : 'Skipped'}</span>
                              </span>
                            ) : on ? (
                              <span className="text-xs font-medium text-success-strong">Will be invited</span>
                            ) : (
                              <span className="text-xs">Not selected</span>
                            )}
                          </td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              );
            })}
          </table>
        </div>
      )}

      {data && data.total > 0 && (
        <ListPagination
          currentPage={data.page}
          itemsPerPage={PAGE_SIZE}
          totalItems={data.total}
          onPageChange={setPage}
          onItemsPerPageChange={() => setPage(1)}
          pageSizeOptions={[PAGE_SIZE]}
          itemLabel="candidates"
          compact
          attached
          minimalOnMobile
          alwaysShow
        />
      )}

      {previewing?.resume_id && (
        <ResumeTextPreviewModal
          resumeId={previewing.resume_id}
          title={previewing.name}
          subtitle={previewing.email || undefined}
          zIndexClassName="z-[60]"
          onClose={closePreview}
        />
      )}
    </div>
  );
}
