'use client';

import { useEffect, useState } from 'react';
import { Eye, Loader2, Search } from 'lucide-react';
import ListPagination from '@/components/ListPagination';
import { MobileRecordList, MobileRecordCard, DESKTOP_TABLE_ONLY } from '@/components/ui/mobile-record-card';
import ResumeTextPreviewModal from '@/components/ResumeTextPreviewModal';
import {
  bulkInviteService,
  type BulkInviteReviewPage,
  type BulkInviteReviewRequest,
  type BulkInviteReviewRow,
  type BulkInviteReviewStatus,
} from '@/lib/services/bulkInviteService';
import { formatCandidateFirstName } from '@/lib/utils/candidateNameDisplay';
import { SourceIcon, sourceFromLabel } from './inviteSources';
import { InviteSourceValue } from '@/components/AIInterviewInviteTable';
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
 * Needs attention, a chip per source, one flat table (each row names its
 * source), 10 a page. Unticking adds the row's key to
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
  /* Select all / Deselect all reading every matching key. */
  const [bulkBusy, setBulkBusy] = useState(false);
  const [previewing, setPreviewing] = useState<BulkInviteReviewRow | null>(null);
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

  /* Every row matching the current view, source chip and search, read page
     by page — then ticked or unticked together. */
  const setAll = async (on: boolean) => {
    if (bulkBusy) return;
    setBulkBusy(true);
    try {
      const rows: BulkInviteReviewRow[] = [];
      for (let p = 1; ; p += 1) {
        const res = await bulkInviteService.review(jdId, {
          ...request,
          left_out: Object.keys(leftOut),
          view,
          group: group || undefined,
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

  /* The header box ticks / unticks this page's rows (skipped rows stay as they are). */
  const tickable = items.filter((r) => r.status !== 'skipped');
  const pageAllIn = tickable.length > 0 && tickable.every(isIn);
  const togglePage = () => {
    const next = { ...leftOut };
    for (const r of tickable) {
      if (pageAllIn) next[r.key] = r.origin; else delete next[r.key];
    }
    onLeftOut(next);
  };

  if (data && data.counts.all === 0) {
    return (
      <div className="tf-panel border-dashed px-4 py-10 text-center space-y-3">
        <p className="tf-body-secondary">
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
            className="tf-input pl-8 pr-2"
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
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 tf-body tabular-nums">
          <span>
            <b className="font-semibold text-gray-900 dark:text-slate-50">{selectedCount.toLocaleString()} of {counts.all.toLocaleString()} selected</b>
            {counts.skipped > 0 && <span className="text-gray-500 dark:text-slate-400"> · {counts.skipped.toLocaleString()} will be skipped</span>}
          </span>
          <span className="flex items-center gap-2">
            <button type="button" onClick={() => void setAll(true)} disabled={busy || matching === 0} className="tf-btn tf-btn-secondary h-8 px-2.5 text-xs border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 whitespace-normal gap-0">
              Select all {matching.toLocaleString()}
            </button>
            <button type="button" onClick={() => void setAll(false)} disabled={busy || matching === 0} className="tf-btn tf-btn-secondary h-8 px-2.5 text-xs border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 whitespace-normal gap-0">
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
          <p className="tf-body-muted">No candidates match these filters.</p>
          <button
            type="button"
            onClick={() => { setSearchInput(''); setSearch(''); setGroup(''); setView('all'); setPage(1); }}
            className="tf-btn tf-btn-secondary h-8 px-3 text-xs border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 whitespace-normal gap-0"
          >
            Clear search and filters
          </button>
        </div>
      ) : (
        <>
        <div className={`tf-panel relative overflow-hidden ${DESKTOP_TABLE_ONLY}`}>
          {busy && <div className="absolute inset-0 z-[1] bg-white/50 dark:bg-slate-900/50" aria-hidden="true" />}
          <table className="w-full table-fixed text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 tf-meta">
              <tr>
                <th className="tf-th-cell w-10 text-left">
                  <input
                    type="checkbox"
                    checked={pageAllIn}
                    disabled={tickable.length === 0 || busy}
                    ref={(el) => { if (el) el.indeterminate = !pageAllIn && tickable.some(isIn); }}
                    onChange={togglePage}
                    aria-label="Select everyone on this page"
                    className="m-0 rounded border-gray-300 cursor-pointer disabled:cursor-not-allowed"
                  />
                </th>
                <th className="tf-th-cell text-left font-semibold">Name</th>
                <th className="tf-th-cell hidden md:table-cell text-left font-semibold">Email</th>
                <th className="tf-th-cell hidden md:table-cell w-40 text-left font-semibold">Invite Source</th>
                <th className="tf-th-cell w-32 sm:w-48 text-left font-semibold">Status</th>
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
                  className={`${skipped ? '' : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800/60'} ${on || skipped ? '' : 'text-gray-400 dark:text-slate-500'}`}
                >
                  <td className="tf-td">
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
                  <td className="tf-td">
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
                    <span className="block truncate tf-meta md:hidden">{r.email || 'No email'}</span>
                  </td>
                  <td className="tf-td hidden md:table-cell"><span className="block truncate" title={r.email}>{r.email || '—'}</span></td>
                  <td className="tf-td hidden md:table-cell">
                    <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-1.5 py-0.5 tf-micro-hint">
                      <InviteSourceValue inv={{ invite_source: r.resume_id ? 'resume' : 'email' }} iconClassName="w-3 h-3" />
                    </span>
                  </td>
                  <td className="tf-td">
                    {skipped ? (
                      <span title={r.reason ?? undefined} className="tf-badge max-w-full border border-warning-line bg-warning-subtle text-2xs text-warning-strong">
                        <span className="truncate">{r.reason ? `${r.reason} · skipped` : 'Skipped'}</span>
                      </span>
                    ) : on ? (
                      <span className="text-xs font-medium text-success-strong">Will be invited</span>
                    ) : (
                      <span className="text-xs">Not selected</span>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="relative lg:hidden">
          {busy && <div className="absolute inset-0 z-[1] bg-white/50 dark:bg-slate-900/50" aria-hidden="true" />}
          <MobileRecordList>
            <div className="flex items-center gap-2.5 min-w-0 px-1 pt-1">
              <input
                type="checkbox"
                checked={pageAllIn}
                disabled={tickable.length === 0 || busy}
                ref={(el) => { if (el) el.indeterminate = !pageAllIn && tickable.some(isIn); }}
                onChange={togglePage}
                aria-label="Select everyone on this page"
                className="m-0 rounded border-gray-300 cursor-pointer disabled:cursor-not-allowed"
              />
              <span className="tf-meta">Select this page</span>
            </div>
                  {items.map((r) => {
                    const skipped = r.status === 'skipped';
                    const on = !skipped && isIn(r);
                    return (
                      <MobileRecordCard
                        key={r.key}
                        selected={on}
                        onClick={skipped ? undefined : () => toggle(r)}
                        className={on || skipped ? '' : 'text-gray-400 dark:text-slate-500'}
                        select={
                          <input
                            type="checkbox"
                            checked={on}
                            disabled={skipped}
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => toggle(r)}
                            aria-label={`Select ${r.name}`}
                            className="m-0 rounded border-gray-300 cursor-pointer disabled:cursor-not-allowed"
                          />
                        }
                        badges={
                          <>
                            <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-1.5 py-0.5 tf-micro-hint">
                              <InviteSourceValue inv={{ invite_source: r.resume_id ? 'resume' : 'email' }} iconClassName="w-3 h-3" />
                            </span>
                            {skipped ? (
                              <span title={r.reason ?? undefined} className="tf-badge max-w-full border border-warning-line bg-warning-subtle text-2xs text-warning-strong">
                                <span className="truncate">{r.reason ? `${r.reason} · skipped` : 'Skipped'}</span>
                              </span>
                            ) : on ? (
                              <span className="text-xs font-medium text-success-strong">Will be invited</span>
                            ) : (
                              <span className="text-xs">Not selected</span>
                            )}
                          </>
                        }
                        title={<span className={`truncate ${on ? 'text-gray-900 dark:text-slate-50' : ''}`} title={`${r.name}${r.email ? ` · ${r.email}` : ''}`}>{showName(r.name)}</span>}
                        actions={r.resume_id ? (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setPreviewing(r); onOverlayChange?.(closePreview); }}
                            aria-label={`View resume of ${r.name}`}
                            title="View resume"
                            className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-md text-gray-400 hover:text-brand-blue hover:bg-brand-blue/10"
                          >
                            <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        ) : undefined}
                        fields={[{ label: 'Email', value: <span className="break-all" title={r.email}>{r.email || 'No email'}</span> }]}
                      />
                    );
                  })}
          </MobileRecordList>
        </div>
        </>
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
