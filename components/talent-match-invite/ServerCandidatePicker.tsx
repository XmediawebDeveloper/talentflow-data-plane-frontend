'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Loader2, Lock, Search, X } from 'lucide-react';
import { useAuth } from '@/lib/hooks/useAuth';
import { folderService, type Folder } from '@/lib/services/resumeService';
import {
  bulkInviteService,
  SERVER_MATCH_LABEL,
  type BulkInviteKind,
  type BulkInviteSelection,
  type InviteCandidateFilters,
  type InviteCandidateSort,
  type InviteCandidateSourceTab,
  type ServerInviteCandidate,
  type ServerMatchStatus,
} from '@/lib/services/bulkInviteService';
import { formatCandidateFirstName } from '@/lib/utils/candidateNameDisplay';

const PAGE_SIZE = 50;

/* The tabs: the job's two lists, then the resume database — the share
   step's "Select From" (My Resumes / Shared Database), here as server-paged
   tabs so the bulk path keeps it. */
const TABS: InviteCandidateSourceTab[] = ['talent-match', 'score-resume', 'my-resumes', 'internal-db'];
export const TAB_LABEL: Record<InviteCandidateSourceTab, string> = {
  'talent-match': 'AI Talent Match',
  'score-resume': 'Score Resume',
  'my-resumes': 'My Resumes',
  'internal-db': 'Shared Database',
};
const LIST_HEADING: Record<InviteCandidateSourceTab, string> = {
  'talent-match': 'AI Talent Match Candidates',
  'score-resume': 'Score Resume Candidates',
  'my-resumes': 'My Resumes',
  'internal-db': 'Shared Database',
};
const isDbTab = (s: InviteCandidateSourceTab) => s === 'my-resumes' || s === 'internal-db';

interface FolderOption { id: string; name: string; depth: number; count: number }
const flattenFolders = (list: Folder[], depth = 0): FolderOption[] =>
  list.flatMap((f) => [{ id: f.id, name: f.name, depth, count: f.resume_count ?? 0 }, ...flattenFolders(f.children ?? [], depth + 1)]);

/** A ticked (or, in filter mode, unticked) row, remembered across tabs and pages. */
export interface PickedCandidate {
  resumeId: string;
  name: string;
  email: string;
  source: InviteCandidateSourceTab;
}

/**
 * What the popup sends: rows ticked one by one, or "every row matching this
 * tab's filter" minus the ones unticked afterwards. Resolved again on the
 * server at send time — the selection is the rule, not a copy of the rows.
 */
export type PickerSelection =
  | { mode: 'ids'; picked: Record<string, PickedCandidate> }
  | { mode: 'filter'; source: InviteCandidateSourceTab; filters: InviteCandidateFilters; total: number; excluded: Record<string, PickedCandidate> };

export const EMPTY_SELECTION: PickerSelection = { mode: 'ids', picked: {} };

/** How many candidates the selection names. */
export const selectionCount = (s: PickerSelection): number =>
  s.mode === 'ids' ? Object.keys(s.picked).length : Math.max(0, s.total - Object.keys(s.excluded).length);

/** The selection as the backend takes it. */
export const toRequestSelection = (s: PickerSelection): BulkInviteSelection =>
  s.mode === 'ids'
    ? { mode: 'ids', resume_ids: Object.keys(s.picked) }
    : { mode: 'filter', source: s.source, ...s.filters, exclude_ids: Object.keys(s.excluded) };

/** A one-line description of a filter-mode selection, for the footer. */
export const describeFilters = (f: InviteCandidateFilters): string => {
  const parts: string[] = [];
  if (f.search) parts.push(`“${f.search}”`);
  if (f.match_status) parts.push(SERVER_MATCH_LABEL[f.match_status]);
  if (f.scored === true) parts.push('scored');
  if (f.scored === false) parts.push('not scored');
  if (f.min_rating) parts.push(`rating ≥ ${f.min_rating}`);
  if (f.min_score) parts.push(`score ≥ ${f.min_score}%`);
  if (f.exclude_invited) parts.push('not yet invited');
  if (f.folder_id) parts.push('in the chosen folder');
  return parts.join(' · ');
};

/* The AI Talent Match tab's rating badge tones (SendToPanel's). */
const ratingTone = (rank: number) =>
  rank >= 7 ? 'bg-success-subtle text-success-strong border-success-line'
    : rank >= 4 ? 'bg-warning-subtle text-warning-strong border-warning-line'
    : rank >= 1 ? 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 border-gray-300 dark:border-slate-700'
    : 'bg-gray-50 dark:bg-slate-800/50 text-gray-400 dark:text-slate-500 border-gray-200 dark:border-slate-700';

const matchTone = (status: ServerMatchStatus) =>
  status === 'exact_match' ? 'bg-success-subtle text-success-strong border-success-line'
    : status === 'partial_match' ? 'bg-warning-subtle text-warning-strong border-warning-line'
    : 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 border-gray-300 dark:border-slate-700';

const SECTION = 'text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-500';
const CONTROL = 'text-xs border border-gray-200 dark:border-slate-700 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-blue/40';

const fmt = (n: number) => n.toLocaleString();

/**
 * The Create / Send popup's candidate list for a whole job: the server's
 * paged, filtered list (API 1) in place of every row loaded into the browser.
 * Four tabs (the job's two lists, My Resumes, Shared Database) with server
 * counts, search and filters, 50 rows at a time loaded
 * on scroll, ticking by row or "Select all N matching"; the selection is
 * kept as ids or as the filter, never as the rows.
 */
export default function ServerCandidatePicker({
  jdId,
  kind,
  versionId,
  selection,
  onSelectionChange,
  pickingDisabled = false,
}: {
  jdId: string;
  kind: BulkInviteKind;
  /** The version being sent — fills "already invited". */
  versionId: string | null;
  selection: PickerSelection;
  onSelectionChange: (next: PickerSelection) => void;
  /** No version picked yet, or no permission: rows list but cannot be ticked. */
  pickingDisabled?: boolean;
}) {
  const [source, setSource] = useState<InviteCandidateSourceTab>('talent-match');
  /* The database tabs follow the resume list's own permissions (the share
     step's rule): locked tabs stay visible, greyed, with the reason. */
  const { user } = useAuth();
  const perms = user?.permissions;
  const tabAccess: Record<InviteCandidateSourceTab, boolean> = {
    'talent-match': true,
    'score-resume': true,
    'my-resumes': !!(perms?.canUploadResumes || perms?.canViewResumes),
    'internal-db': !!(perms?.canAccessInternalDB || perms?.canViewInternalDB),
  };
  /* My Resumes' folders, read once the tab is first opened. */
  const [folders, setFolders] = useState<FolderOption[] | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState<InviteCandidateFilters>({ sort: 'best' });
  const [rows, setRows] = useState<ServerInviteCandidate[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<InviteCandidateSourceTab, number> | null>(null);
  /* The page belongs to one (tab, filters, version): any change of those
     reads as page 1 again, with no reset effect. */
  const [pageState, setPageState] = useState<{ key: string; page: number }>({ key: '', page: 1 });
  /* What has been fulfilled: nothing of the current filter yet = loading;
     an earlier page of it = loading more. Derived, not set from the effect. */
  const [loaded, setLoaded] = useState<{ key: string; page: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const sentinelRef = useRef<HTMLLIElement | null>(null);

  /* Search is typed; the filter it feeds is applied 300ms after the last key. */
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.search === (searchInput.trim() || undefined) ? f : { ...f, search: searchInput.trim() || undefined }));
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (source !== 'my-resumes' || folders !== null) return;
    let cancelled = false;
    folderService.list()
      .then((list) => { if (!cancelled) setFolders(flattenFolders(list)); })
      .catch(() => { if (!cancelled) setFolders([]); });
    return () => { cancelled = true; };
  }, [source, folders]);

  /* One request per (tab, filters, version, page). Page 1 replaces the list;
     later pages append. A newer request cancels an older one. */
  const filterKey = JSON.stringify({ source, filters, versionId });
  const page = pageState.key === filterKey ? pageState.page : 1;
  const loading = loaded?.key !== filterKey;
  const loadingMore = !loading && (loaded?.page ?? 0) < page;
  const nextPage = () => setPageState((p) => ({ key: filterKey, page: (p.key === filterKey ? p.page : 1) + 1 }));
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    bulkInviteService.listCandidates(jdId, {
      source, kind, version_id: versionId, ...filters, page, page_size: PAGE_SIZE,
    }, controller.signal)
      .then((res) => {
        if (cancelled) return;
        setRows((prev) => (page === 1 ? res.items : [...prev, ...res.items]));
        setTotal(res.total);
        setCounts(res.counts);
        setError(null);
        setLoaded({ key: filterKey, page });
      })
      .catch((err: unknown) => {
        if (cancelled || controller.signal.aborted) return;
        setError((err as Error)?.message || 'Could not load the candidates.');
      });
    return () => { cancelled = true; controller.abort(); };
    // filterKey stands for source + filters + versionId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jdId, kind, filterKey, page]);

  /* Load the next 50 when the end of the list scrolls into view. */
  const hasMore = rows.length < total;
  useEffect(() => {
    const el = sentinelRef.current;
    const root = listRef.current;
    if (!el || !root || !hasMore || loading || loadingMore) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) nextPage();
    }, { root, rootMargin: '120px' });
    io.observe(el);
    return () => io.disconnect();
    // nextPage closes over filterKey: re-arm when the key changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loading, loadingMore, rows.length, filterKey]);

  /* ── selection helpers ── */
  const inFilterMode = selection.mode === 'filter';
  const filterModeHere = selection.mode === 'filter' && selection.source === source;
  const isOn = (r: ServerInviteCandidate) =>
    selection.mode === 'ids' ? !!selection.picked[r.resume_id]
      : selection.source === source && !selection.excluded[r.resume_id];
  const canTick = (r: ServerInviteCandidate) =>
    !pickingDisabled && !!r.email && !r.already_invited && (selection.mode === 'ids' || selection.source === source);
  const toggle = (r: ServerInviteCandidate) => {
    if (!canTick(r)) return;
    const entry: PickedCandidate = { resumeId: r.resume_id, name: r.name, email: r.email, source: r.source };
    if (selection.mode === 'ids') {
      const picked = { ...selection.picked };
      if (picked[r.resume_id]) delete picked[r.resume_id]; else picked[r.resume_id] = entry;
      onSelectionChange({ mode: 'ids', picked });
    } else {
      const excluded = { ...selection.excluded };
      if (excluded[r.resume_id]) delete excluded[r.resume_id]; else excluded[r.resume_id] = entry;
      onSelectionChange({ ...selection, excluded });
    }
  };
  const selectAllMatching = () => {
    if (pickingDisabled || total === 0) return;
    // "Select all matching" never includes rows the send would skip anyway.
    const f: InviteCandidateFilters = { ...filters, exclude_invited: true };
    onSelectionChange({ mode: 'filter', source, filters: f, total, excluded: {} });
    if (!filters.exclude_invited) setFilters(f);
  };
  const clearSelection = () => onSelectionChange(EMPTY_SELECTION);
  const tickLoaded = () => {
    if (selection.mode !== 'ids') return;
    const picked = { ...selection.picked };
    const eligible = rows.filter(canTick);
    const allOn = eligible.length > 0 && eligible.every((r) => picked[r.resume_id]);
    for (const r of eligible) {
      if (allOn) delete picked[r.resume_id];
      else picked[r.resume_id] = { resumeId: r.resume_id, name: r.name, email: r.email, source: r.source };
    }
    onSelectionChange({ mode: 'ids', picked });
  };

  const pickedBySource = useMemo(() => {
    const out: Record<InviteCandidateSourceTab, number> = { 'talent-match': 0, 'score-resume': 0, 'my-resumes': 0, 'internal-db': 0 };
    if (selection.mode === 'ids') for (const p of Object.values(selection.picked)) out[p.source] += 1;
    else out[selection.source] = selectionCount(selection);
    return out;
  }, [selection]);
  const selectedTotal = selectionCount(selection);
  const loadedEligible = rows.filter(canTick);
  const loadedAllOn = loadedEligible.length > 0 && loadedEligible.every(isOn);
  const noEmailLoaded = rows.filter((r) => !r.email).length;

  const setFilter = <K extends keyof InviteCandidateFilters>(key: K, value: InviteCandidateFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));
  const switchTab = (s: InviteCandidateSourceTab) => {
    if (!tabAccess[s] || s === source) return;
    setSource(s);
    // The folder belongs to My Resumes; the rating to AI Talent Match.
    if (s !== 'my-resumes' && filters.folder_id) setFilter('folder_id', undefined);
    if (s !== 'talent-match' && filters.min_rating) setFilter('min_rating', undefined);
  };

  return (
    <section aria-labelledby="server-send-to-heading" className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h3 id="server-send-to-heading" className={SECTION}>
          Candidates · {fmt(selectedTotal)} selected
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {selectedTotal > 0 && (
            <button type="button" onClick={clearSelection} className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100">
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          )}
          {!inFilterMode && (
            <label className={`inline-flex items-center gap-1.5 text-xs font-medium ${pickingDisabled || loadedEligible.length === 0 ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 dark:text-slate-300 cursor-pointer'}`}>
              <input
                type="checkbox"
                checked={loadedAllOn}
                disabled={pickingDisabled || loadedEligible.length === 0}
                ref={(el) => { if (el) el.indeterminate = !loadedAllOn && loadedEligible.some(isOn); }}
                onChange={tickLoaded}
                className="m-0 rounded border-gray-300 cursor-pointer disabled:cursor-not-allowed"
              />
              Select loaded ({fmt(rows.length)})
            </label>
          )}
          <button
            type="button"
            onClick={selectAllMatching}
            disabled={pickingDisabled || total === 0 || filterModeHere}
            title={pickingDisabled ? 'Pick a version first' : undefined}
            className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border border-brand-blue/30 bg-brand-blue/10 text-brand-blue hover:bg-brand-blue/15 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {filterModeHere ? `All ${fmt(selection.total)} matching selected` : `Select all ${fmt(total)} matching`}
          </button>
        </div>
      </div>

      {/* Tabs with the server's counts and this tab's picks. */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-slate-700" role="tablist" aria-label="Candidate source">
        {TABS.map((s) => {
          const locked = !tabAccess[s];
          return (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={source === s}
              aria-disabled={locked}
              onClick={() => switchTab(s)}
              title={locked ? `You do not have permission to access ${TAB_LABEL[s]}` : undefined}
              className={`-mb-px px-3 py-2 text-xs font-medium border-b-2 transition-colors ${source === s
                ? 'border-brand-blue text-brand-blue'
                : locked ? 'border-transparent text-gray-400 dark:text-slate-600 cursor-not-allowed'
                : 'border-transparent text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100'}`}
            >
              {locked && <Lock className="inline w-3 h-3 mr-1 -mt-px" aria-hidden="true" />}
              {TAB_LABEL[s]}
              {!locked && <span className="ml-1 tabular-nums text-gray-500 dark:text-slate-500">({counts ? fmt(counts[s]) : '…'})</span>}
              {pickedBySource[s] > 0 && (
                <span className="ml-1.5 inline-flex items-center px-1.5 rounded-full bg-brand-blue/10 text-brand-blue text-2xs font-semibold tabular-nums">✓ {fmt(pickedBySource[s])}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" aria-hidden="true" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search name or email"
            aria-label="Search candidates"
            className={`${CONTROL} w-full pl-8`}
          />
        </div>
        {source === 'my-resumes' && (
          <select aria-label="Folder" value={filters.folder_id ?? ''} onChange={(e) => setFilter('folder_id', e.target.value || undefined)} className={CONTROL}>
            <option value="">All folders</option>
            {(folders ?? []).map((f) => (
              <option key={f.id} value={f.id}>{'\u00a0\u00a0'.repeat(f.depth)}{f.name} ({f.count})</option>
            ))}
          </select>
        )}
        <select aria-label="Match status" value={filters.match_status ?? ''} onChange={(e) => setFilter('match_status', (e.target.value || undefined) as ServerMatchStatus | undefined)} className={CONTROL}>
          <option value="">Any match status</option>
          <option value="exact_match">Exact Match</option>
          <option value="partial_match">Partial Match</option>
          <option value="no_match">No Match</option>
        </select>
        <select aria-label="Scored" value={filters.scored === undefined ? '' : filters.scored ? 'yes' : 'no'} onChange={(e) => setFilter('scored', e.target.value === '' ? undefined : e.target.value === 'yes')} className={CONTROL}>
          <option value="">Scored or not</option>
          <option value="yes">Scored</option>
          <option value="no">Not scored</option>
        </select>
        {source === 'talent-match' && (
          <select aria-label="Minimum rating" value={filters.min_rating ?? ''} onChange={(e) => setFilter('min_rating', e.target.value ? Number(e.target.value) : undefined)} className={CONTROL}>
            <option value="">Any rating</option>
            {[9, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>Rating ≥ {n}</option>)}
          </select>
        )}
        <select aria-label="Minimum score" value={filters.min_score ?? ''} onChange={(e) => setFilter('min_score', e.target.value ? Number(e.target.value) : undefined)} className={CONTROL}>
          <option value="">Any score</option>
          {[90, 80, 70, 60, 50, 40].map((n) => <option key={n} value={n}>Score ≥ {n}%</option>)}
        </select>
        <select aria-label="Sort" value={filters.sort ?? 'best'} onChange={(e) => setFilter('sort', e.target.value as InviteCandidateSort)} className={CONTROL}>
          <option value="best">{isDbTab(source) ? 'Newest first' : 'Best first'}</option>
          <option value="score">Score</option>
          {source === 'talent-match' && <option value="rating">Rating</option>}
          {!isDbTab(source) && <option value="recent">Recently scored</option>}
          <option value="name">Name</option>
        </select>
        <label className="inline-flex items-center gap-1.5 text-xs text-gray-700 dark:text-slate-300 cursor-pointer">
          <input type="checkbox" checked={!!filters.exclude_invited} onChange={(e) => setFilter('exclude_invited', e.target.checked || undefined)} disabled={!versionId} className="m-0 rounded border-gray-300" />
          Hide already invited
        </label>
      </div>

      {/* The list: only the loaded rows are in the DOM; 50 more on scroll. */}
      {error ? (
        <p className="rounded-lg border border-destructive-line bg-destructive-subtle px-3 py-3 text-sm text-destructive">{error}</p>
      ) : loading ? (
        <div className="flex items-center justify-center py-10 rounded-lg border border-dashed border-gray-200 dark:border-slate-700">
          <Loader2 className="w-5 h-5 animate-spin text-brand-blue" />
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-200 dark:border-slate-700 px-3 py-4 text-center text-sm text-gray-600 dark:text-slate-400">
          {counts && counts[source] === 0
            ? (source === 'talent-match' ? 'No AI Talent Match candidates for this job yet.'
              : source === 'score-resume' ? 'No scored resumes for this job outside AI Talent Match.'
              : source === 'my-resumes' ? 'You have not uploaded any resumes yet.'
              : 'No resumes in the Shared Database yet.')
            : 'No candidates match these filters.'}
        </p>
      ) : (
        <ul ref={listRef} className="rounded-lg border border-gray-200 dark:border-slate-700 divide-y divide-gray-100 dark:divide-slate-700/60 max-h-72 overflow-y-auto">
          <li className="sticky top-0 z-[1] flex items-center justify-between gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-800 text-2xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
            <span className="truncate">{LIST_HEADING[source]}</span>
            <span className="shrink-0 tabular-nums">{fmt(rows.length)} of {fmt(total)}</span>
          </li>
          {rows.map((r) => {
            const on = isOn(r) && !!r.email && !r.already_invited;
            const tickable = canTick(r);
            const why = !r.email ? 'No email' : r.already_invited ? 'Already invited to this version'
              : pickingDisabled ? 'Pick a version first'
              : inFilterMode && !filterModeHere ? 'Clear “Select all matching” to pick here' : undefined;
            return (
              <li key={r.resume_id}>
                <label title={why} className={`flex items-center gap-2.5 px-3 py-2 ${tickable ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800' : 'cursor-not-allowed'} ${on ? 'bg-blue-50 dark:bg-slate-800/50' : ''}`}>
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={!tickable}
                    onChange={() => toggle(r)}
                    aria-label={`Invite ${r.name}`}
                    className="m-0 shrink-0 rounded border-gray-300 cursor-pointer disabled:cursor-not-allowed"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-gray-900 dark:text-slate-50 truncate" title={r.name}>
                      {kind === 'interview' ? formatCandidateFirstName(r.name) : r.name}
                    </span>
                    <span className="block text-xs text-gray-500 dark:text-slate-400 truncate">
                      {r.email ? r.email : <span className="font-medium text-warning-strong">No email</span>}
                      {r.phone ? ` · ${r.phone}` : ''}
                      {r.title ? ` · ${r.title}` : ''}
                    </span>
                  </span>
                  {r.already_invited && (
                    <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-md text-2xs font-medium border bg-gray-50 dark:bg-slate-800/50 text-gray-500 dark:text-slate-400 border-gray-200 dark:border-slate-700">Invited</span>
                  )}
                  {r.score ? (
                    <span title={`Resume score ${r.score.percent}% · ${SERVER_MATCH_LABEL[r.score.match_status]}`} className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-md text-2xs font-semibold border tabular-nums ${matchTone(r.score.match_status)}`}>
                      {r.score.percent}%<span className="hidden sm:inline font-medium">&nbsp;· {SERVER_MATCH_LABEL[r.score.match_status]}</span>
                    </span>
                  ) : (
                    <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-md text-2xs font-medium border bg-gray-50 dark:bg-slate-800/50 text-gray-500 dark:text-slate-400 border-gray-200 dark:border-slate-700">Not scored</span>
                  )}
                  {(r.rating || !r.score) && r.source === 'talent-match' && (
                    <span title="Match rating" className={`shrink-0 inline-flex items-center justify-center min-w-[1.75rem] px-1.5 py-0.5 rounded-md text-xs font-bold border ${ratingTone(r.rating || 0)}`}>
                      {r.rating || '-'}
                    </span>
                  )}
                </label>
              </li>
            );
          })}
          {hasMore && (
            <li ref={sentinelRef} className="flex items-center justify-center gap-2 px-3 py-2.5 text-xs text-gray-500 dark:text-slate-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading more…
            </li>
          )}
        </ul>
      )}

      {filterModeHere && (
        <p role="note" className="text-xs text-gray-600 dark:text-slate-400">
          Every candidate matching {describeFilters(selection.filters) || 'this tab'} is selected ({fmt(selectionCount(selection))}). Untick a row to leave them out; the list is re-checked when you send.
        </p>
      )}
      {noEmailLoaded > 0 && (
        <p role="note" className="flex items-start gap-1.5 rounded-lg bg-warning-subtle border border-warning-line px-3 py-2 text-xs text-warning-strong">
          <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />
          <span>Candidates without an email address are listed but cannot be invited. Add an email to their resume to include them.</span>
        </p>
      )}
    </section>
  );
}
