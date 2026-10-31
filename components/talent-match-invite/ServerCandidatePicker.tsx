'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Briefcase, Eye, Folder as FolderIcon, Layers, Lightbulb, Loader2, Lock, Mail, Search } from 'lucide-react';
import { toast } from 'sonner';
import { SourceIcon } from './inviteSources';
import type { ExtraMode } from './ExtraCandidatesInput';
import { useAuth } from '@/lib/hooks/useAuth';
import FilterSelect from '@/components/ui/filter-select';
import ResumeTextPreviewModal from '@/components/ResumeTextPreviewModal';
import ResumeVersionsModal from '@/components/ResumeVersionsModal';
import { folderService, resumeService, type Folder } from '@/lib/services/resumeService';
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

/* The list tabs: the job's two lists, then the resume database — the share
   step's "Select From" (My Resumes / Shared Database), here as server-paged
   tabs so the bulk path keeps it. */
export const TAB_LABEL: Record<InviteCandidateSourceTab, string> = {
  'talent-match': 'AI Talent Match',
  'score-resume': 'Scored Resumes',
  'my-resumes': 'My Resumes',
  'internal-db': 'Shared Database',
};
const LIST_HEADING: Record<InviteCandidateSourceTab, string> = {
  'talent-match': 'AI Talent Match Candidates',
  'score-resume': 'Scored Resumes',
  'my-resumes': 'My Resumes',
  'internal-db': 'Shared Database',
};
const isDbTab = (s: InviteCandidateSourceTab) => s === 'my-resumes' || s === 'internal-db';

/* The one tab row, grouped: adding people yourself, then the job's two
   lists, then the resume database. */
const ADD_TAB_LABEL: Record<ExtraMode, string> = { manual: 'Type in', excel: 'Upload Excel' };
const TAB_GROUPS: { label: string; tabs: (ExtraMode | InviteCandidateSourceTab)[] }[] = [
  { label: 'Add new people', tabs: ['manual', 'excel'] },
  { label: 'From this job', tabs: ['talent-match', 'score-resume'] },
  { label: 'Resume database', tabs: ['my-resumes', 'internal-db'] },
];
const TAB_HINT: Record<ExtraMode | InviteCandidateSourceTab, string> = {
  manual: 'Add a candidate by name and email',
  excel: 'Add many candidates from a sheet with Name and Email columns',
  'talent-match': 'Candidates AI Talent Match found for this job',
  'score-resume': 'Resumes scored against this job',
  'my-resumes': 'Resumes you uploaded',
  'internal-db': 'Every resume in the Shared Database',
};
/* The tab buttons' shorter names. */
const TAB_BUTTON_LABEL: Record<InviteCandidateSourceTab, string> = { ...TAB_LABEL, 'internal-db': 'Shared DB' };
const isAddTab = (t: ExtraMode | InviteCandidateSourceTab): t is ExtraMode => t === 'manual' || t === 'excel';

interface FolderOption { id: string; name: string; depth: number; count: number }
const flattenFolders = (list: Folder[], depth = 0): FolderOption[] =>
  list.flatMap((f) => [{ id: f.id, name: f.name, depth, count: f.resume_count ?? 0 }, ...flattenFolders(f.children ?? [], depth + 1)]);

/** A ticked (or, in filter mode, unticked) row, remembered across tabs and pages. */
export interface PickedCandidate {
  resumeId: string;
  name: string;
  email: string;
  source: InviteCandidateSourceTab;
  /** A version other than the listed (latest) one was chosen: the listed
   *  row's id, and the chosen version's number of how many. `resumeId` is
   *  then the chosen version's own record — a version is a resume. */
  baseResumeId?: string;
  version?: number;
  versionCount?: number;
}

/** A resume version as `GET /resumes/{id}/versions` returns it. */
interface ResumeVersionRow { id: string; version: number; file_name?: string; created_at: string; uploaded_by_name?: string; file_size_kb?: number }

const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';

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

/* The AI Talent Match tab's rating badge tones. */
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
/* FilterSelect trigger sized to match CONTROL. */
const SELECT_CONTROL = 'w-auto sm:w-auto text-xs px-2 sm:pl-2 sm:pr-2 py-1.5 sm:py-1.5 rounded-lg sm:rounded-lg text-gray-700 dark:text-slate-300';

const fmt = (n: number) => n.toLocaleString();

/**
 * The Create / Send popup's candidate list for a whole job: the server's
 * paged, filtered list (API 1) in place of every row loaded into the browser.
 * Four tabs (the job's two lists, My Resumes, Shared Database) with server
 * counts, search and filters — the database tabs are plain resume lists
 * (no score filters or chips; the resume permissions alone gate them) —
 * 50 rows at a time loaded
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
  onOverlayChange,
  addTab,
  onAddTabChange,
  addCounts,
  room = null,
  addedEmails,
  addPanel,
  footer,
}: {
  jdId: string;
  kind: BulkInviteKind;
  /** The version being sent — fills "already invited". */
  versionId: string | null;
  selection: PickerSelection;
  onSelectionChange: (next: PickerSelection) => void;
  /** No version picked yet, or no permission: rows list but cannot be ticked. */
  pickingDisabled?: boolean;
  /** A popup of its own opened over the list (resume, versions): hands the
   *  invite popup its closer, so Esc closes that first; null when it closed. */
  onOverlayChange?: (close: (() => void) | null) => void;
  /** Type in / Upload Excel, shown in the same tab row ahead of the lists:
   *  the one open (null = a list tab), its picks, and its panel — kept
   *  mounted, so what was added stays while another tab is open. */
  addTab: ExtraMode | null;
  onAddTabChange: (tab: ExtraMode | null) => void;
  addCounts: Record<ExtraMode, number>;
  /** How many more the units allow (null = no limit). At 0 nothing more
   *  can be ticked — ticked rows can still be unticked. */
  room?: number | null;
  /** Emails typed in or uploaded: a row with one is already selected there. */
  addedEmails?: Set<string>;
  addPanel: ReactNode;
  /** Below every tab: the selection summary. */
  footer?: ReactNode;
}) {
  const [source, setSource] = useState<InviteCandidateSourceTab>('talent-match');
  /* The database tabs follow the resume list's own permissions (the share
     step's rule): locked tabs stay visible, greyed, with the reason. */
  const { user } = useAuth();
  const perms = user?.permissions;
  const tabAccess: Record<InviteCandidateSourceTab, boolean> = {
    'talent-match': true,
    'score-resume': true,
    'my-resumes': !!(perms?.canUploadResumes || perms?.canViewResumes || perms?.canUpdateResumes || perms?.canDeleteResumes),
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
  /* The units: room for one more, and room for this list's whole selection
     ("Select all matching" and a folder tick replace it). */
  const canAdd = room === null || room > 0;
  const listRoom = room === null ? null : room + selectionCount(selection);
  const listRef = useRef<HTMLUListElement | null>(null);
  const sentinelRef = useRef<HTMLLIElement | null>(null);
  /* A folder ticked before its list was loaded: selected once it is. */
  const selectOnLoad = useRef<string | null>(null);

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
        if (page === 1 && selection.mode === 'filter' && selection.source === source
          && selection.total !== res.total && JSON.stringify(selection.filters) === JSON.stringify(filters)) {
          onSelectionChange({ ...selection, total: res.total });
        }
        if (page === 1 && selectOnLoad.current === filterKey) {
          selectOnLoad.current = null;
          if (listRoom !== null && res.total > listRoom) toast.warning(`This folder has ${fmt(res.total)} candidates — only ${fmt(listRoom)} ${listRoom === 1 ? 'unit' : 'units'} left.`);
          else onSelectionChange({ mode: 'filter', source, filters, total: res.total, excluded: {} });
        }
      })
      .catch((err: unknown) => {
        if (cancelled || controller.signal.aborted) return;
        setError((err as Error)?.message || 'Could not load the candidates.');
      });
    return () => { cancelled = true; controller.abort(); };
    // filterKey stands for source + filters + versionId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jdId, kind, filterKey, page]);

  /* Phones: is part of the tab row off to the right? */
  const tabsRef = useRef<HTMLDivElement | null>(null);
  const [tabsMore, setTabsMore] = useState(false);
  const updateTabsMore = () => {
    const el = tabsRef.current;
    setTabsMore(!!el && el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
  };
  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;
    el.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    updateTabsMore();
    window.addEventListener('resize', updateTabsMore);
    return () => window.removeEventListener('resize', updateTabsMore);
  }, [addTab, source, counts]);

  /* First open: a job with no AI Talent Match candidates opens on Type in. */
  const defaulted = useRef(false);
  useEffect(() => {
    if (defaulted.current || !counts) return;
    defaulted.current = true;
    if (counts['talent-match'] === 0 && addTab === null && selectionCount(selection) === 0) onAddTabChange('manual');
    // Once, when the first counts arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counts]);

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
  /* A row picked with another version is kept under that version's id;
     this finds it from the listed row. */
  const pickedByBase = useMemo(() => {
    const out: Record<string, PickedCandidate> = {};
    if (selection.mode === 'ids') for (const p of Object.values(selection.picked)) out[p.baseResumeId ?? p.resumeId] = p;
    return out;
  }, [selection]);
  const pickedOf = (r: ServerInviteCandidate): PickedCandidate | undefined =>
    selection.mode === 'ids' ? pickedByBase[r.resume_id] : undefined;
  const isOn = (r: ServerInviteCandidate) =>
    selection.mode === 'ids' ? !!pickedOf(r)
      : selection.source === source && !selection.excluded[r.resume_id];
  /* Could be ticked, units aside; and can be ticked (or unticked) now. */
  const addedDirectly = (r: ServerInviteCandidate) => !!r.email && !!addedEmails?.has(r.email.trim().toLowerCase());
  const canTickBase = (r: ServerInviteCandidate) =>
    !pickingDisabled && !!r.email && !r.already_invited && (selection.mode === 'ids' || selection.source === source)
    && (isOn(r) || !addedDirectly(r));
  const canTick = (r: ServerInviteCandidate) => canTickBase(r) && (isOn(r) || canAdd);
  const toggle = (r: ServerInviteCandidate) => {
    if (!canTick(r)) return;
    const entry: PickedCandidate = { resumeId: r.resume_id, name: r.name, email: r.email, source: r.source };
    if (selection.mode === 'ids') {
      const picked = { ...selection.picked };
      const had = pickedOf(r);
      if (had) delete picked[had.resumeId]; else picked[r.resume_id] = entry;
      onSelectionChange({ mode: 'ids', picked });
    } else {
      const excluded = { ...selection.excluded };
      if (excluded[r.resume_id]) delete excluded[r.resume_id]; else excluded[r.resume_id] = entry;
      onSelectionChange({ ...selection, excluded });
    }
  };
  const selectAllMatching = () => {
    if (pickingDisabled || total === 0 || (listRoom !== null && total > listRoom)) return;
    // "Select all matching" never includes rows the send would skip anyway.
    const f: InviteCandidateFilters = { ...filters, exclude_invited: true };
    onSelectionChange({ mode: 'filter', source, filters: f, total, excluded: {} });
    if (!filters.exclude_invited) setFilters(f);
  };
  const tickLoaded = () => {
    if (selection.mode !== 'ids') return;
    const picked = { ...selection.picked };
    const eligible = rows.filter(canTickBase);
    const allOn = eligible.length > 0 && eligible.every((r) => pickedOf(r));
    // Ticking stops at the units left.
    let left = room === null ? Infinity : room;
    let notAdded = 0;
    for (const r of eligible) {
      const had = pickedOf(r);
      if (allOn) { if (had) delete picked[had.resumeId]; }
      else if (!had) {
        if (left <= 0) { notAdded += 1; continue; }
        picked[r.resume_id] = { resumeId: r.resume_id, name: r.name, email: r.email, source: r.source };
        left -= 1;
      }
    }
    onSelectionChange({ mode: 'ids', picked });
    if (notAdded > 0) {
      toast.warning(room !== null && room > 0
        ? `Only ${fmt(room)} ${room === 1 ? 'unit' : 'units'} left — ${fmt(notAdded)} not selected.`
        : 'No units left. Remove someone to add more.');
    }
  };

  /** Why this row cannot be ticked now, or null when it can. */
  const tickBlockReason = (r: ServerInviteCandidate): string | null =>
    !r.email ? 'No email' : r.already_invited ? 'Already invited to this version'
      : pickingDisabled ? 'Pick a version first'
      : inFilterMode && !filterModeHere ? 'Clear “Select all matching” to pick here'
      : !isOn(r) && addedDirectly(r) ? 'Already added in Type in / Upload Excel'
      : !isOn(r) && !canAdd ? 'No units left. Remove someone to add more.' : null;

  /* ── a row's resume: 👁 opens it (AI Talent Match / Scored Resumes send the
     matched / scored version) or its versions (My Resumes / Shared Database,
     where another version can be chosen). ── */
  const [previewing, setPreviewing] = useState<ServerInviteCandidate | null>(null);
  const [versionsOf, setVersionsOf] = useState<{ row: ServerInviteCandidate; list: ResumeVersionRow[]; loading: boolean } | null>(null);
  /* How many versions a resume has, once its versions were read here. */
  const [versionCounts, setVersionCounts] = useState<Record<string, number>>({});
  const closePreview = () => { setPreviewing(null); onOverlayChange?.(null); };
  const closeVersions = () => { setVersionsOf(null); onOverlayChange?.(null); };
  const openPreview = (r: ServerInviteCandidate) => { setPreviewing(r); onOverlayChange?.(closePreview); };
  const openVersions = (r: ServerInviteCandidate) => {
    if (!canTick(r) || selection.mode !== 'ids') {
      const reason = tickBlockReason(r)
        ?? (selection.mode === 'filter' ? 'Clear “Select all matching” (or the folder tick) to choose a version.' : null);
      if (reason) toast.info(`${reason} — versions open to view only.`);
    }
    onOverlayChange?.(closeVersions);
    setVersionsOf({ row: r, list: [], loading: true });
    resumeService.getVersions(r.resume_id)
      .then((res: unknown) => {
        const raw = res as ResumeVersionRow[] | { versions?: ResumeVersionRow[]; items?: ResumeVersionRow[] } | null;
        const found = Array.isArray(raw) ? raw : raw?.versions ?? raw?.items ?? [];
        const list = found.slice().sort((a, b) => (b.version || 0) - (a.version || 0));
        const versions = list.length ? list : [{ id: r.resume_id, version: 1, created_at: new Date().toISOString() }];
        setVersionCounts((c) => ({ ...c, [r.resume_id]: versions.length }));
        setVersionsOf((v) => (v && v.row.resume_id === r.resume_id ? { ...v, list: versions, loading: false } : v));
      })
      .catch(() => setVersionsOf((v) => (v && v.row.resume_id === r.resume_id ? { ...v, list: [{ id: r.resume_id, version: 1, created_at: new Date().toISOString() }], loading: false } : v)));
  };
  /* "Use this version": the row is sent with that version, and ticked. */
  const chooseVersion = (r: ServerInviteCandidate, v: ResumeVersionRow, count: number) => {
    if (selection.mode !== 'ids' || !r.email || r.already_invited || pickingDisabled) return;
    const picked = { ...selection.picked };
    const had = pickedOf(r);
    if (!had && !canAdd) return;
    if (had) delete picked[had.resumeId];
    const latest = v.id === r.resume_id;
    picked[v.id] = {
      resumeId: v.id, name: r.name, email: r.email, source: had?.source ?? r.source,
      ...(latest ? {} : { baseResumeId: r.resume_id, version: v.version, versionCount: count }),
    };
    onSelectionChange({ mode: 'ids', picked });
  };
  /** "v2 of 3" — the version that will be sent, of how many — once known. */
  const versionChip = (r: ServerInviteCandidate) => {
    const p = pickedOf(r);
    const count = p?.versionCount ?? versionCounts[r.resume_id] ?? r.version_count ?? null;
    if (!count || count < 2) return null;
    const v = p?.version ?? r.version ?? count;
    const old = v < count;
    return (
      <span
        title={old ? 'Not the latest version' : 'The latest version'}
        className={`shrink-0 inline-flex items-center gap-1 px-1.5 py-px rounded-md text-2xs font-semibold border tabular-nums ${old ? 'border-warning-line bg-warning-subtle text-warning-strong' : 'border-brand-blue/20 bg-brand-blue/10 text-brand-blue'}`}
      >
        <Layers className="w-3 h-3" aria-hidden="true" />v{v}<span className="font-normal opacity-80">of {count}</span>
      </span>
    );
  };

  /* ── My Resumes: the folder tree. Clicking a folder lists it; ticking it
     selects everyone in it (every row matching that folder). ── */
  const openFolder = (id: string) => setFilter('folder_id', id || undefined);
  const folderTicked = (id: string) =>
    selection.mode === 'filter' && selection.source === 'my-resumes' && (selection.filters.folder_id ?? '') === id;
  const tickFolder = (id: string, on: boolean) => {
    if (pickingDisabled) return;
    if (!on) { if (folderTicked(id)) onSelectionChange(EMPTY_SELECTION); return; }
    const f: InviteCandidateFilters = { ...filters, folder_id: id || undefined, exclude_invited: true };
    const key = JSON.stringify({ source, filters: f, versionId });
    if (key === filterKey && !loading) {
      onSelectionChange({ mode: 'filter', source: 'my-resumes', filters: f, total, excluded: {} });
      return;
    }
    // The folder's count arrives with its first page; it is selected then.
    selectOnLoad.current = key;
    setFilters(f);
  };

  const pickedBySource = useMemo(() => {
    const out: Record<InviteCandidateSourceTab, number> = { 'talent-match': 0, 'score-resume': 0, 'my-resumes': 0, 'internal-db': 0 };
    if (selection.mode === 'ids') for (const p of Object.values(selection.picked)) out[p.source] += 1;
    else out[selection.source] = selectionCount(selection);
    return out;
  }, [selection]);
  const loadedEligible = rows.filter(canTickBase);
  const loadedAllOn = loadedEligible.length > 0 && loadedEligible.every(isOn);
  const noEmailLoaded = rows.filter((r) => !r.email).length;

  const setFilter = <K extends keyof InviteCandidateFilters>(key: K, value: InviteCandidateFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));
  const switchTab = (s: InviteCandidateSourceTab) => {
    if (!tabAccess[s]) return;
    if (addTab) onAddTabChange(null);
    if (s === source) return;
    setSource(s);
    // The folder belongs to My Resumes; the rating to AI Talent Match.
    if (s !== 'my-resumes' && filters.folder_id) setFilter('folder_id', undefined);
    if (s !== 'talent-match' && filters.min_rating) setFilter('min_rating', undefined);
    if (isDbTab(s)) {
      setFilters((f) => ({
        ...f,
        match_status: undefined, scored: undefined, min_score: undefined, min_rating: undefined,
        sort: f.sort === 'name' ? 'name' : 'best',
      }));
    }
  };

  const tabButton = (t: ExtraMode | InviteCandidateSourceTab) => {
    const add = isAddTab(t);
    const locked = !add && !tabAccess[t];
    const on = add ? addTab === t : !addTab && source === t;
    const picked = add ? addCounts[t] : pickedBySource[t];
    const label = add ? ADD_TAB_LABEL[t] : TAB_BUTTON_LABEL[t];
    return (
      <button
        key={t}
        type="button"
        role="tab"
        aria-selected={on}
        aria-disabled={locked}
        onClick={() => (add ? onAddTabChange(t) : switchTab(t))}
        title={locked ? `You do not have permission to access ${TAB_LABEL[t as InviteCandidateSourceTab]}` : TAB_HINT[t]}
        className={`-mb-px shrink-0 inline-flex items-center gap-1.5 whitespace-nowrap rounded-t-md px-2 pt-1.5 pb-2 text-[13px] font-medium border-b-2 transition-colors ${on
          ? 'border-brand-blue text-brand-blue font-semibold'
          : locked ? 'border-transparent text-gray-400 dark:text-slate-600 cursor-not-allowed'
          : 'border-transparent text-gray-600 dark:text-slate-400 hover:text-gray-900 hover:bg-gray-50 dark:hover:text-slate-100 dark:hover:bg-slate-800/60'}`}
      >
        {locked ? <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> : <SourceIcon source={t} className="w-3.5 h-3.5" />}
        {label}
        {!add && !locked && <span className="tabular-nums font-normal text-gray-500 dark:text-slate-500">({counts ? fmt(counts[t]) : '…'})</span>}
        {picked > 0 && (
          <span className="inline-flex items-center px-1.5 rounded-full bg-brand-blue/10 text-brand-blue text-2xs font-semibold tabular-nums">✓ {fmt(picked)}</span>
        )}
      </button>
    );
  };

  return (
    <section aria-label="Add candidates" className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900">
      {/* One tab row, grouped: add people yourself, the job's lists, the
          resume database — each with its count and its picks. Groups wrap
          to a second line when the popup is narrow; phones scroll sideways. */}
      <div className="relative">
      <div
        ref={tabsRef}
        onScroll={updateTabsMore}
        role="tablist"
        aria-label="Where candidates come from"
        className="flex items-end gap-x-6 sm:flex-wrap sm:gap-y-1 max-sm:overflow-x-auto border-b border-gray-200 dark:border-slate-700 px-2 sm:px-3 pt-2"
      >
        {TAB_GROUPS.map((g) => (
          <div key={g.label} role="group" aria-label={g.label} className="flex shrink-0 flex-col gap-0.5">
            <span className="pl-2 text-2xs font-semibold text-gray-400 dark:text-slate-500 whitespace-nowrap">{g.label}</span>
            <div className="flex gap-0.5">{g.tabs.map(tabButton)}</div>
          </div>
        ))}
      </div>
      {tabsMore && (
        <span aria-hidden="true" className="sm:hidden pointer-events-none absolute right-0 top-0 bottom-px w-10 rounded-tr-xl bg-gradient-to-l from-white dark:from-slate-900 to-transparent" />
      )}
      </div>

      <div className="p-3 sm:p-4">
      {/* Type in / Upload Excel: always mounted, so its rows stay. */}
      <div className={addTab ? '' : 'hidden'}>{addPanel}</div>
      <div className={addTab ? 'hidden' : 'space-y-3'}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className={SECTION}>{LIST_HEADING[source]}</h3>
        <div className="flex flex-wrap items-center gap-2">
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
            disabled={pickingDisabled || total === 0 || filterModeHere || (listRoom !== null && total > listRoom)}
            title={pickingDisabled ? 'Pick a version first'
              : listRoom !== null && total > listRoom && !filterModeHere ? `${fmt(total)} matching — only ${fmt(listRoom)} ${listRoom === 1 ? 'unit' : 'units'} left` : undefined}
            className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border border-brand-blue/30 bg-brand-blue/10 text-brand-blue hover:bg-brand-blue/15 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {filterModeHere ? `All ${fmt(selection.total)} matching selected` : `Select all ${fmt(total)} matching`}
          </button>
        </div>
      </div>

      {/* Above the search: how to send another version of a resume. */}
      {isDbTab(source) && (
        <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50/70 dark:bg-amber-500/10 px-3 py-2 text-xs text-gray-700 dark:text-slate-300">
          <Lightbulb className="w-3.5 h-3.5 mt-px shrink-0 text-amber-500" aria-hidden="true" />
          <span>
            <b className="font-semibold">Tip:</b> For multi-version resumes, the latest version is selected by default. Click the{' '}
            <Eye className="inline w-3.5 h-3.5 -mt-px" aria-label="eye" /> icon to switch versions.
          </span>
        </p>
      )}
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
        {!isDbTab(source) && (<>
        <FilterSelect
          ariaLabel="Match status"
          value={filters.match_status ?? ''}
          onChange={(v) => setFilter('match_status', (v || undefined) as ServerMatchStatus | undefined)}
          options={[
            { value: '', label: 'Any match status' },
            { value: 'exact_match', label: 'Exact Match' },
            { value: 'partial_match', label: 'Partial Match' },
            { value: 'no_match', label: 'No Match' },
          ]}
          className={SELECT_CONTROL}
        />
        <FilterSelect
          ariaLabel="Scored"
          value={filters.scored === undefined ? '' : filters.scored ? 'yes' : 'no'}
          onChange={(v) => setFilter('scored', v === '' ? undefined : v === 'yes')}
          options={[
            { value: '', label: 'Scored or not' },
            { value: 'yes', label: 'Scored' },
            { value: 'no', label: 'Not scored' },
          ]}
          className={SELECT_CONTROL}
        />
        {source === 'talent-match' && (
          <FilterSelect
            ariaLabel="Minimum rating"
            value={filters.min_rating != null ? String(filters.min_rating) : ''}
            onChange={(v) => setFilter('min_rating', v ? Number(v) : undefined)}
            options={[
              { value: '', label: 'Any rating' },
              ...[9, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `Rating ≥ ${n}` })),
            ]}
            className={SELECT_CONTROL}
          />
        )}
        <FilterSelect
          ariaLabel="Minimum score"
          value={filters.min_score != null ? String(filters.min_score) : ''}
          onChange={(v) => setFilter('min_score', v ? Number(v) : undefined)}
          options={[
            { value: '', label: 'Any score' },
            ...[90, 80, 70, 60, 50, 40].map((n) => ({ value: String(n), label: `Score ≥ ${n}%` })),
          ]}
          className={SELECT_CONTROL}
        />
        </>)}
        <FilterSelect
          ariaLabel="Sort"
          value={filters.sort ?? 'best'}
          onChange={(v) => setFilter('sort', v as InviteCandidateSort)}
          options={[
            { value: 'best', label: isDbTab(source) ? 'Newest first' : 'Best first' },
            ...(!isDbTab(source) ? [{ value: 'score', label: 'Score' }] : []),
            ...(source === 'talent-match' ? [{ value: 'rating', label: 'Rating' }] : []),
            ...(!isDbTab(source) ? [{ value: 'recent', label: 'Recently scored' }] : []),
            { value: 'name', label: 'Name' },
          ]}
          className={SELECT_CONTROL}
        />
        <label className="inline-flex items-center gap-1.5 text-xs text-gray-700 dark:text-slate-300 cursor-pointer">
          <input type="checkbox" checked={!!filters.exclude_invited} onChange={(e) => setFilter('exclude_invited', e.target.checked || undefined)} disabled={!versionId} className="m-0 rounded border-gray-300" />
          Hide already invited
        </label>
      </div>

      {/* My Resumes: the folder tree beside the list (click to open, tick to
          select everyone in it). Phones: the tree sits above the list. */}
      <div className={source === 'my-resumes' ? 'grid grid-cols-1 sm:grid-cols-[12.5rem_minmax(0,1fr)] gap-3 items-start' : ''}>
      {source === 'my-resumes' && (
        <nav aria-label="Folders" className="flex flex-col max-h-72 max-sm:max-h-56 rounded-lg border border-gray-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 py-2">
          <p className="shrink-0 px-3 pb-1.5 text-2xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">Folders</p>
          {/* The folders scroll; the title and the hint stay put. */}
          <ul className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            {[{ id: '', name: 'All resumes', depth: 0, count: counts?.['my-resumes'] ?? 0 }, ...(folders ?? []).map((f) => ({ ...f, depth: f.depth + 1 }))].map((f) => {
              const here = (filters.folder_id ?? '') === f.id;
              const ticked = folderTicked(f.id);
              const someOut = ticked && selection.mode === 'filter' && Object.keys(selection.excluded).length > 0;
              return (
                <li key={f.id || 'all'} className={`flex items-center gap-1.5 pr-2 ${here ? 'bg-brand-blue/10' : ''}`} style={{ paddingLeft: `${8 + f.depth * 14}px` }}>
                  <input
                    type="checkbox"
                    checked={ticked && !someOut}
                    ref={(el) => { if (el) el.indeterminate = someOut; }}
                    disabled={pickingDisabled || f.count === 0 || (!ticked && listRoom !== null && f.count > listRoom)}
                    title={!ticked && listRoom !== null && f.count > listRoom ? `${fmt(f.count)} in this folder — only ${fmt(listRoom)} ${listRoom === 1 ? 'unit' : 'units'} left` : undefined}
                    onChange={(e) => tickFolder(f.id, e.target.checked)}
                    aria-label={`Select everyone in ${f.name}`}
                    className="m-0 shrink-0 rounded border-gray-300 cursor-pointer disabled:cursor-not-allowed"
                  />
                  <button
                    type="button"
                    onClick={() => openFolder(f.id)}
                    aria-current={here || undefined}
                    className={`flex-1 min-w-0 flex items-center gap-1.5 py-1.5 text-left text-xs ${here ? 'font-semibold text-brand-blue' : 'text-gray-700 dark:text-slate-300 hover:text-gray-900 dark:hover:text-slate-100'}`}
                  >
                    <FolderIcon className={`w-3.5 h-3.5 shrink-0 ${here ? 'text-brand-blue' : 'text-brand-orange'}`} aria-hidden="true" />
                    <span className="truncate" title={f.name}>{f.name}</span>
                    <span className="ml-auto shrink-0 tabular-nums text-gray-400">{fmt(f.count)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {folders === null && <p className="px-3 py-1.5 text-xs text-gray-400 inline-flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" />Loading folders…</p>}
          <p className="shrink-0 px-3 pt-1.5 border-t border-gray-200/70 dark:border-slate-700/60 text-2xs text-gray-500 dark:text-slate-400">Tick a folder to select everyone in it.</p>
        </nav>
      )}
      <div className="min-w-0 space-y-2">
      {/* The list: only the loaded rows are in the DOM; 50 more on scroll. */}
      {error ? (
        <p className="rounded-lg border border-destructive-line bg-destructive-subtle px-3 py-3 text-sm text-destructive">{error}</p>
      ) : loading ? (
        <div className="flex items-center justify-center py-10 rounded-lg border border-dashed border-gray-200 dark:border-slate-700">
          <Loader2 className="w-5 h-5 animate-spin text-brand-blue" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 dark:border-slate-700 px-3 py-4 text-center text-sm text-gray-600 dark:text-slate-400">
          {counts && counts[source] === 0
            ? (source === 'talent-match' ? 'No AI Talent Match candidates for this job yet.'
              : source === 'score-resume' ? 'No scored resumes for this job outside AI Talent Match.'
              : source === 'my-resumes' ? 'You have not uploaded any resumes yet.'
              : 'No resumes in the Shared Database yet.')
            : 'No candidates match these filters.'}
          {counts && counts[source] === 0 && (source === 'talent-match' || source === 'score-resume') && (
            <span className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <button type="button" onClick={() => onAddTabChange('manual')} className="h-8 inline-flex items-center gap-1.5 px-3 rounded-lg text-xs font-medium border border-brand-blue/30 text-brand-blue bg-brand-blue/5 hover:bg-brand-blue/10">
                <SourceIcon source="manual" className="w-3.5 h-3.5" />Type in candidates
              </button>
              <button type="button" onClick={() => onAddTabChange('excel')} className="h-8 inline-flex items-center gap-1.5 px-3 rounded-lg text-xs font-medium border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800">
                <SourceIcon source="excel" className="w-3.5 h-3.5" />Upload Excel
              </button>
            </span>
          )}
        </div>
      ) : (
        <ul ref={listRef} className="rounded-lg border border-gray-200 dark:border-slate-700 divide-y divide-gray-100 dark:divide-slate-700/60 max-h-72 overflow-y-auto">
          <li className="sticky top-0 z-[1] flex items-center justify-between gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-800 text-2xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
            <span className="truncate">
              {LIST_HEADING[source]}
              {source === 'my-resumes' && filters.folder_id ? ` · ${(folders ?? []).find((f) => f.id === filters.folder_id)?.name ?? ''}` : ''}
            </span>
            <span className="shrink-0 tabular-nums">{fmt(rows.length)} of {fmt(total)}</span>
          </li>
          {rows.map((r) => {
            const on = isOn(r) && !!r.email && !r.already_invited;
            const tickable = canTick(r);
            const picked = pickedOf(r);
            const why = tickBlockReason(r) ?? undefined;
            const shownName = kind === 'interview' ? formatCandidateFirstName(r.name) : r.name;
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
                  <span aria-hidden="true" className="max-sm:hidden shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-brand-blue/10 text-2xs font-semibold text-brand-blue">
                    {initials(r.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sm font-medium text-gray-900 dark:text-slate-50 truncate" title={r.name}>{shownName}</span>
                      {isDbTab(source) && versionChip(r)}
                    </span>
                    <span className="flex items-center gap-1 min-w-0 text-xs text-gray-500 dark:text-slate-400">
                      {r.title && (
                        <>
                          <Briefcase className="w-3 h-3 shrink-0" aria-hidden="true" />
                          <span className="truncate max-w-[45%]" title={r.title}>{r.title}</span>
                          <span aria-hidden="true" className="px-0.5">•</span>
                        </>
                      )}
                      {r.email
                        ? <><Mail className="w-3 h-3 shrink-0" aria-hidden="true" /><span className="truncate" title={r.email}>{r.email}</span></>
                        : <span className="font-medium text-warning-strong">No email</span>}
                    </span>
                  </span>
                  {r.already_invited && (
                    <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-md text-2xs font-medium border bg-gray-50 dark:bg-slate-800/50 text-gray-500 dark:text-slate-400 border-gray-200 dark:border-slate-700">Invited</span>
                  )}
                  {on && picked && picked.source !== source && (
                    <span title="Ticked once; it counts for every tab it appears in" className="max-md:hidden shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-md text-2xs font-medium border border-brand-blue/20 bg-brand-blue/5 text-brand-blue">
                      Picked in {TAB_LABEL[picked.source]}
                    </span>
                  )}
                  {isDbTab(source) ? null : r.score ? (
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
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (isDbTab(source)) openVersions(r); else openPreview(r); }}
                    aria-label={isDbTab(source) ? `View resume versions of ${r.name}` : `View resume of ${r.name}`}
                    title={isDbTab(source) ? 'View resume versions' : 'View resume'}
                    className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md text-gray-400 hover:text-brand-blue hover:bg-brand-blue/10"
                  >
                    <Eye className="w-4 h-4" aria-hidden="true" />
                  </button>
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
      </div>
      </div>

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
      </div>
      </div>
      {footer}
      {previewing && (
        <ResumeTextPreviewModal
          resumeId={previewing.resume_id}
          title={previewing.name}
          subtitle={previewing.title || previewing.email || undefined}
          zIndexClassName="z-[60]"
          onClose={closePreview}
        />
      )}
      {versionsOf && (
        <ResumeVersionsModal
          candidate={{ id: versionsOf.row.resume_id, name: versionsOf.row.name, resumeId: versionsOf.row.resume_id }}
          versions={versionsOf.list}
          loading={versionsOf.loading}
          onClose={closeVersions}
          selectedVersionId={pickedOf(versionsOf.row)?.resumeId ?? versionsOf.row.resume_id}
          onSelectVersion={canTick(versionsOf.row) && selection.mode === 'ids'
            ? (v) => chooseVersion(versionsOf.row, v as ResumeVersionRow, versionsOf.list.length)
            : undefined}
        />
      )}
    </section>
  );
}
