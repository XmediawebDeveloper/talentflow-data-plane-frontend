'use client';

import { Fragment, useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Archive, ArchiveRestore, Briefcase, Download, Eye, Layers, Lightbulb, Loader2, Lock, Mail, Search, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { SourceIcon } from './inviteSources';
import InviteFolderTree, { flattenTree, isArchivedFolder, isRootFolder } from './InviteFolderTree';
import ResumeRowMenu, { type ResumeRowAction } from './ResumeRowMenu';
import DeleteResumeDialog from '@/components/resumes/DeleteResumeDialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { ExtraMode } from './ExtraCandidatesInput';
import { useAuth } from '@/lib/hooks/useAuth';
import FilterSelect from '@/components/ui/filter-select';
import ResumeTextPreviewModal from '@/components/ResumeTextPreviewModal';
import ResumeVersionsModal from '@/components/ResumeVersionsModal';
import UploadModal from '@/components/UploadModal';
import { uploadResumeFiles } from '@/lib/utils/uploadResumeFiles';
import { convertApiFolderToTree } from '@/lib/utils/resumeMappers';
import { friendlyErrorMessage } from '@/lib/utils/friendlyError';
import { FOLDER_NAME_MAX_LENGTH } from '@/components/FolderTree';
import { archiveResumeToArchivedFolder, folderService, resumeService, type Folder } from '@/lib/services/resumeService';
import { aiMatchService } from '@/lib/services/aiMatchService';
import { jdService } from '@/lib/services/jdService';
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

type ListParams = InviteCandidateFilters & {
  source: InviteCandidateSourceTab;
  kind: BulkInviteKind;
  version_id?: string | null;
  page?: number;
  page_size?: number;
};
type ListPage = Awaited<ReturnType<typeof bulkInviteService.listCandidates>>;

const sortRows = (rows: ServerInviteCandidate[], sort: InviteCandidateSort | undefined) => {
  const byName = (a: ServerInviteCandidate, b: ServerInviteCandidate) => a.name.localeCompare(b.name);
  const at = (r: ServerInviteCandidate) => (r.score?.scored_at ? Date.parse(r.score.scored_at) || 0 : 0);
  const pct = (r: ServerInviteCandidate) => r.score?.percent ?? -1;
  return rows.slice().sort(
    sort === 'name' ? byName
      : sort === 'recent' ? (a, b) => at(b) - at(a) || byName(a, b)
      : (a, b) => pct(b) - pct(a) || (b.rating ?? 0) - (a.rating ?? 0) || byName(a, b),
  );
};

/** Every page of a server list, page 1 first and the rest in parallel. */
const loadServerAll = async (jdId: string, p: ListParams, signal?: AbortSignal): Promise<{ items: ServerInviteCandidate[]; counts: ListPage['counts'] }> => {
  const first = await bulkInviteService.listCandidates(jdId, { ...p, page: 1, page_size: PAGE_SIZE }, signal);
  const pages = Math.ceil(first.total / PAGE_SIZE);
  const rest = await Promise.all(Array.from({ length: Math.max(0, pages - 1) }, (_, i) =>
    bulkInviteService.listCandidates(jdId, { ...p, page: i + 2, page_size: PAGE_SIZE }, signal)));
  return { items: [first, ...rest].flatMap((x) => x.items), counts: first.counts };
};

/** Every resume scored against the job — the list Job Details' Scored Resumes tab shows. */
const loadJobScored = async (jdId: string): Promise<ServerInviteCandidate[]> => {
  const SIZE = 100;
  const first = await jdService.getScoredResumes(jdId, { page_size: SIZE, page: 1, sort_by: 'latest' });
  const pages = Math.ceil((first?.total ?? 0) / SIZE);
  const rest = await Promise.all(Array.from({ length: Math.max(0, pages - 1) }, (_, i) =>
    jdService.getScoredResumes(jdId, { page_size: SIZE, page: i + 2, sort_by: 'latest' })));
  const status = (m?: string): ServerMatchStatus =>
    m === 'exact_match' || m === 'excellent' ? 'exact_match' : m === 'partial_match' || m === 'partial' ? 'partial_match' : 'no_match';
  /* A scored resume as `/jd/{id}/scored-resumes` returns it (the fields read here). */
  type ScoredItem = { resume_id?: string; candidate_name?: string; candidate_email?: string; phone?: string; overall_score?: number; match_status?: string; created_at?: string; resume_version?: number; is_archived?: boolean };
  return [first, ...rest].flatMap((r: { items?: ScoredItem[] }) => r?.items ?? [])
    .filter((it) => it?.resume_id)
    .map((it) => ({
      resume_id: it.resume_id!,
      name: it.candidate_name || 'Unknown',
      email: it.candidate_email || '',
      phone: it.phone || '',
      source: 'score-resume' as const,
      rating: null,
      match_score: null,
      score: { percent: Number(Number(it.overall_score || 0).toFixed(1)), match_status: status(it.match_status), scored_at: it.created_at ?? null },
      // Not known from this list; the Review step checks it and skips them.
      already_invited: false,
      // This list — unlike the job's other sources — still lists a resume
      // after it's archived, so it's the only place that needs to say so.
      archived: !!it.is_archived,
      version: it.resume_version ?? null,
    }));
};

/* The server's Scored Resumes source leaves out resumes Job Details counts
   (those also in AI Talent Match, and others it does not list), so the tab
   is the job's own scored list — the page's count, every row shown — with
   the server's row used where it has one (it knows "already invited"). Read
   whole and filtered here: one page, no more to load. */
const loadScoredTab = async (jdId: string, p: ListParams, signal?: AbortSignal): Promise<ListPage> => {
  const [{ items: own, counts: serverCounts }, scored] = await Promise.all([
    loadServerAll(jdId, { ...p, search: undefined, match_status: undefined, min_score: undefined, exclude_invited: undefined, scored: undefined }, signal),
    loadJobScored(jdId),
  ]);
  const ownById = new Map(own.map((r) => [r.resume_id, r]));
  const byId = new Map<string, ServerInviteCandidate>();
  // Latest score first: a resume scored more than once is listed once.
  for (const r of scored) if (!byId.has(r.resume_id)) byId.set(r.resume_id, ownById.get(r.resume_id) ?? r);
  for (const r of own) if (!byId.has(r.resume_id)) byId.set(r.resume_id, r);
  const q = p.search?.trim().toLowerCase();
  const items = sortRows([...byId.values()].filter((r) =>
    p.scored !== false
    && (!q || r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q))
    && (!p.match_status || r.score?.match_status === p.match_status)
    && (!p.min_score || (r.score?.percent ?? 0) >= p.min_score)
    && (!p.exclude_invited || !r.already_invited)), p.sort);
  const counts = { ...serverCounts, 'score-resume': byId.size };
  return { items, total: items.length, page: 1, page_size: items.length, counts };
};

/** Every AI Talent Match candidate for the job, unfiltered — unlike the job's
    own `talent-match` list (which the server drops an archived resume out of
    entirely, same as every source), this still lists one. Used only to
    recover archived rows, same role `loadJobScored` plays for Scored Resumes. */
const loadJdMatched = async (jdId: string): Promise<ServerInviteCandidate[]> => {
  const { candidates } = await aiMatchService.listJdCandidates(jdId, 5000);
  return candidates
    .filter((c) => c.resumeId)
    .map((c) => ({
      resume_id: c.resumeId,
      name: c.name || 'Unknown',
      email: c.email || '',
      phone: c.phone || '',
      source: 'talent-match' as const,
      rating: c.rank ?? null,
      match_score: c.matchScore ?? null,
      // Not known from this list; the job's own list (merged in below) has
      // it for any resume that was also scored.
      score: null,
      already_invited: false,
      archived: !!c.isArchived,
      version: c.resumeVersion ?? null,
    }));
};

/* AI Talent Match, same shape as loadScoredTab: the job's own talent-match
   list (authoritative, but archived resumes never reach it) unioned with the
   unfiltered match list (only used to recover those archived rows, greyed
   out same as Scored Resumes). */
const loadTalentMatchTab = async (jdId: string, p: ListParams, signal?: AbortSignal): Promise<ListPage> => {
  const [{ items: own, counts: serverCounts }, matched] = await Promise.all([
    loadServerAll(jdId, { ...p, search: undefined, match_status: undefined, min_rating: undefined, min_score: undefined, exclude_invited: undefined, scored: undefined }, signal),
    loadJdMatched(jdId),
  ]);
  const ownById = new Map(own.map((r) => [r.resume_id, r]));
  const byId = new Map<string, ServerInviteCandidate>();
  for (const r of matched) if (!byId.has(r.resume_id)) byId.set(r.resume_id, ownById.get(r.resume_id) ?? r);
  for (const r of own) if (!byId.has(r.resume_id)) byId.set(r.resume_id, r);
  const q = p.search?.trim().toLowerCase();
  const items = sortRows([...byId.values()].filter((r) =>
    (!q || r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q))
    && (p.scored === undefined || (p.scored ? !!r.score : !r.score))
    && (!p.match_status || r.score?.match_status === p.match_status)
    && (!p.min_rating || (r.rating ?? 0) >= p.min_rating)
    && (!p.min_score || (r.score?.percent ?? 0) >= p.min_score)
    && (!p.exclude_invited || !r.already_invited)), p.sort);
  const counts = { ...serverCounts, 'talent-match': byId.size };
  return { items, total: items.length, page: 1, page_size: items.length, counts };
};

/** One page of a tab — AI Talent Match and Scored Resumes read whole, from
    the job's own lists merged with their unfiltered counterpart. */
const loadListPage = (jdId: string, p: ListParams, signal?: AbortSignal): Promise<ListPage> =>
  p.source === 'score-resume' ? loadScoredTab(jdId, p, signal)
    : p.source === 'talent-match' ? loadTalentMatchTab(jdId, p, signal)
    : bulkInviteService.listCandidates(jdId, p, signal);

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
   lists, then the resume database — one tab, as on the Resume Database page,
   with My Resumes / Shared DB toggled inside it. */
const ADD_TAB_LABEL: Record<ExtraMode, string> = { manual: 'Manual', excel: 'Upload Excel' };
const DB_TAB = 'resume-db' as const;
type TabKey = ExtraMode | InviteCandidateSourceTab | typeof DB_TAB;
const TAB_GROUPS: { label: string; tabs: TabKey[] }[] = [
  { label: 'Add new people', tabs: ['manual', 'excel'] },
  { label: 'From this job', tabs: ['talent-match', 'score-resume'] },
  { label: 'Saved resumes', tabs: [DB_TAB] },
];
const DB_SOURCES = ['my-resumes', 'internal-db'] as const;
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

/* Where an archived resume lived before it was archived — the Resume
   Database page stashes it on archive (MyResumesView handleArchiveResumes),
   and Unarchive puts the resume back there (else in root), as the page does. */
const PREV_FOLDER_KEY = 'archivedResumePrevFolder';
const readPrevFolders = (): Record<string, string> => {
  try { return JSON.parse(localStorage.getItem(PREV_FOLDER_KEY) || '{}'); } catch { return {}; }
};
const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;

/** A resume in Archived Resumes, as the folder lists it. */
interface ArchivedRow { id: string; name: string; email: string }

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
  initialSource,
  selectedTotal = 0,
  onClearSelection,
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
  /** The list tab to open on (the Resume Database's side the popup was
   *  opened from); omitted: AI Talent Match. */
  initialSource?: InviteCandidateSourceTab;
  /** Everyone selected in the popup (every tab, typed in and Excel too). */
  selectedTotal?: number;
  /** Clear selection, beside Select all: empties every tab's picks. */
  onClearSelection?: () => void;
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
  /** Manual / Upload Excel, shown in the same tab row ahead of the lists:
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
  const [source, setSource] = useState<InviteCandidateSourceTab>(initialSource ?? 'talent-match');
  /* The database tabs follow the resume list's own permissions (the share
     step's rule): locked tabs stay visible, greyed, with the reason. */
  const { user, tenant, isTenantAdmin, hasPermissionCode, permissionsVerified } = useAuth();
  const perms = user?.permissions;
  // The Resume Database page's own rule for Archive / Unarchive.
  const canUnarchive = !!isTenantAdmin || hasPermissionCode('my_resumes:archive');
  const canUploadMyResumes = !!isTenantAdmin || hasPermissionCode('my_resumes:upload') || hasPermissionCode('my_resumes:create');
  // Folders: created with the upload permission, renamed with update — the page's rules.
  const canUpdateMyResumes = !!isTenantAdmin || hasPermissionCode('my_resumes:update');
  const canDeleteMyResumes = !!isTenantAdmin || hasPermissionCode('my_resumes:delete');
  const tabAccess: Record<InviteCandidateSourceTab, boolean> = {
    'talent-match': true,
    'score-resume': true,
    // Tenant admin sees everything — same rule as usePermissions' menu
    // visibility — so it never depends on the per-flag values being loaded.
    'my-resumes': !!(isTenantAdmin || perms?.canUploadResumes || perms?.canViewResumes || perms?.canUpdateResumes || perms?.canDeleteResumes),
    'internal-db': !!(isTenantAdmin || perms?.canAccessInternalDB || perms?.canViewInternalDB),
  };
  /* My Resumes' folders, read once the tab is first opened. */
  const [folders, setFolders] = useState<Folder[] | null>(null);
  const flatFolders = useMemo(() => flattenTree(folders ?? []), [folders]);
  const archivedFolderId = flatFolders.find(isArchivedFolder)?.id ?? null;
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
  /* Resumes just uploaded: ticked once the list they land in is read. */
  const tickOnLoad = useRef<string[] | null>(null);
  const [uploadedRows, setUploadedRows] = useState<{ ids: string[]; items: ServerInviteCandidate[] } | null>(null);
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
      .then((list) => { if (!cancelled) setFolders(list); })
      .catch(() => { if (!cancelled) setFolders([]); });
    return () => { cancelled = true; };
  }, [source, folders]);

  /* One request per (tab, filters, version, page). Page 1 replaces the list;
     later pages append. A newer request cancels an older one. */
  /* Bumped after an upload: the same tab and filters read again. */
  const [reloadTick, setReloadTick] = useState(0);
  const keyOf = (f: InviteCandidateFilters) => JSON.stringify({ source, filters: f, versionId, reloadTick });
  const filterKey = keyOf(filters);
  const page = pageState.key === filterKey ? pageState.page : 1;
  const loading = loaded?.key !== filterKey;
  const loadingMore = !loading && (loaded?.page ?? 0) < page;
  const nextPage = () => setPageState((p) => ({ key: filterKey, page: (p.key === filterKey ? p.page : 1) + 1 }));
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    loadListPage(jdId, {
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
        if (page === 1 && source === 'my-resumes' && tickOnLoad.current) {
          setUploadedRows({ ids: tickOnLoad.current, items: res.items });
          tickOnLoad.current = null;
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
    // filterKey stands for source + filters + versionId (+ the reload count).
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

  /* The job's two tab counts, read the way Job Details reads its own tab
     badges (distinct AI Talent Match total; every scored resume), so the
     popup and the page always show the same numbers. A resume both matched
     and scored counts on both tabs. Falls back to the server's counts. */
  const [jobCounts, setJobCounts] = useState<{ jdId: string } & Partial<Record<InviteCandidateSourceTab, number>>>({ jdId });
  useEffect(() => {
    let cancelled = false;
    const put = (t: InviteCandidateSourceTab, n: number) => {
      if (!cancelled) setJobCounts((c) => ({ ...(c.jdId === jdId ? c : {}), jdId, [t]: n }));
    };
    void aiMatchService.listJdCandidates(jdId, 1).then(({ total }) => put('talent-match', total)).catch(() => {});
    void jdService.getScoredResumes(jdId, { page_size: 1 })
      .then((res) => put('score-resume', res?.total ?? (res?.items ?? []).length))
      .catch(() => {});
    return () => { cancelled = true; };
  }, [jdId]);
  const tabCount = (t: InviteCandidateSourceTab): number | null =>
    (jobCounts.jdId === jdId ? jobCounts[t] : undefined) ?? counts?.[t] ?? null;

  /* First open: a job with no AI Talent Match candidates opens on Manual. */
  const defaulted = useRef(false);
  useEffect(() => {
    if (defaulted.current || !counts) return;
    defaulted.current = true;
    if (!initialSource && counts['talent-match'] === 0 && addTab === null && selectionCount(selection) === 0) onAddTabChange('manual');
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
    !pickingDisabled && !!r.email && !r.already_invited && !r.archived && (selection.mode === 'ids' || selection.source === source)
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
  const [selectingAll, setSelectingAll] = useState(false);
  const selectAllMatching = async () => {
    if (pickingDisabled || total === 0 || (listRoom !== null && total > listRoom) || selectingAll) return;
    // "Select all matching" never includes rows the send would skip anyway.
    const f: InviteCandidateFilters = { ...filters, exclude_invited: true };
    const params: ListParams = { source, kind, version_id: versionId, ...f };
    if (source !== 'score-resume') {
      onSelectionChange({ mode: 'filter', source, filters: f, total, excluded: {} });
      if (!filters.exclude_invited) setFilters(f);
      return;
    }
    /* Scored Resumes is read from the job's own scored list, which a server
       filter selection cannot name: every matching row is picked by id. */
    setSelectingAll(true);
    try {
      const { items: all } = await loadScoredTab(jdId, params);
      const picked: Record<string, PickedCandidate> = {};
      for (const r of all) {
        if (!r.email || r.already_invited || r.archived || addedDirectly(r)) continue;
        picked[r.resume_id] = { resumeId: r.resume_id, name: r.name, email: r.email, source: 'score-resume' };
      }
      onSelectionChange({ mode: 'ids', picked });
      if (!filters.exclude_invited) setFilters(f);
    } catch (err) {
      toast.error((err as Error)?.message || 'Could not select the candidates.');
    } finally {
      setSelectingAll(false);
    }
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
    !r.email ? 'No email' : r.archived ? 'Archived — unarchive this resume (Resume Database) to invite them'
      : r.already_invited ? 'Already invited to this version'
      : pickingDisabled ? 'Pick a version first'
      : inFilterMode && !filterModeHere ? 'Clear “Select all matching” to pick here'
      : !isOn(r) && addedDirectly(r) ? 'Already added in Manual / Upload Excel'
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

  /* Archived Resumes: the invite list leaves archived resumes out, so the
     folder is listed here the way the Resume Database lists it (archived rows
     included), each with Unarchive. Unarchived, a resume goes back to its
     folder and can be invited from there. */
  const archivedHere = source === 'my-resumes' && !!archivedFolderId && filters.folder_id === archivedFolderId;
  const archivedKey = archivedHere ? JSON.stringify({ id: archivedFolderId, q: filters.search ?? '' }) : null;
  const [archived, setArchived] = useState<{ key: string; rows: ArchivedRow[]; total: number; error: string | null } | null>(null);
  const [archivedReload, setArchivedReload] = useState(0);
  const archivedLoading = !!archivedKey && archived?.key !== archivedKey;
  useEffect(() => {
    if (!archivedKey || !archivedFolderId) return;
    let cancelled = false;
    resumeService.list({ source: 'my-resumes', folder_id: archivedFolderId, include_archived: true, page: 1, page_size: 100, search: filters.search })
      .then((res) => {
        if (cancelled) return;
        const rows = (res.items ?? []).map((r) => ({ id: r.id, name: r.candidate_name || 'Unknown', email: r.candidate_email || r.email || '' }));
        setArchived({ key: archivedKey, rows, total: res.total ?? rows.length, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) setArchived({ key: archivedKey, rows: [], total: 0, error: (err as Error)?.message || 'Could not load the archived resumes.' });
      });
    return () => { cancelled = true; };
    // archivedKey stands for the folder and the search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archivedKey, archivedReload]);
  const [unarchiving, setUnarchiving] = useState<Set<string>>(new Set());
  /* Archived rows ticked to unarchive together — only those still listed count. */
  const [archivedPicks, setArchivedPicks] = useState<Set<string>>(new Set());
  const archivedTicked = (archived?.key === archivedKey ? archived?.rows ?? [] : []).filter((r) => archivedPicks.has(r.id)).map((r) => r.id);
  /* Upload into My Resumes — the Resume Database page's own upload popup and
     rules. The new resumes are then listed (All Resumes, newest first) and
     ticked, so they can be invited straight away; a duplicate's "Use Existing
     Resume" ticks the resume already there. */
  const [uploading, setUploading] = useState(false);
  /* The folder the upload saves into: the ⋮ menu's folder, else the one open. */
  const [uploadFolder, setUploadFolder] = useState<string | undefined>(undefined);
  const closeUpload = () => { setUploading(false); setUploadFolder(undefined); onOverlayChange?.(null); };
  const openUpload = (folderId?: string) => {
    if (!canUploadMyResumes) return;
    setUploadFolder(folderId);
    setUploading(true);
    onOverlayChange?.(closeUpload);
  };
  const onUploaded = (list: { id: string; candidateName: string }[]) => {
    closeUpload();
    if (list.length === 0) return;
    tickOnLoad.current = list.map((u) => u.id);
    if (source !== 'my-resumes') { setLastDb('my-resumes'); switchTab('my-resumes'); }
    setSearchInput('');
    setFilters((f) => ({ ...f, folder_id: undefined, search: undefined, sort: 'best' }));
    setReloadTick((n) => n + 1);
    setFolders(null);
  };
  const tickUploaded = useEffectEvent((items: ServerInviteCandidate[], ids: string[]) => {    const found = items.filter((r) => ids.includes(r.resume_id));
    const tickable = found.filter((r) => r.email && !r.already_invited && !addedDirectly(r));
    const noEmail = found.filter((r) => !r.email).length;
    const what = ids.length === 1 ? 'Resume uploaded' : `${fmt(ids.length)} resumes uploaded`;
    if (pickingDisabled) {
      toast.success(`${what}. Pick a version to select ${ids.length === 1 ? 'it' : 'them'}.`);
      return;
    }
    if (selection.mode !== 'ids') {
      toast.success(`${what}. Clear “Select all matching” to tick ${ids.length === 1 ? 'it' : 'them'}.`);
      return;
    }
    const picked = { ...selection.picked };
    let left = room === null ? Infinity : room;
    let ticked = 0;
    for (const r of tickable) {
      if (pickedByBase[r.resume_id]) { ticked += 1; continue; }
      if (left <= 0) continue;
      picked[r.resume_id] = { resumeId: r.resume_id, name: r.name, email: r.email, source: 'my-resumes' };
      left -= 1;
      ticked += 1;
    }
    if (ticked > 0) onSelectionChange({ mode: 'ids', picked });
    const notes = [
      noEmail > 0 && `${fmt(noEmail)} without an email cannot be invited`,
      tickable.length > ticked && 'no units left for the rest',
      found.length < ids.length && `${fmt(ids.length - found.length)} still processing — refresh in a moment`,
    ].filter(Boolean);
    const msg = `${what}${ticked > 0 ? ` and ${fmt(ticked)} selected` : ''}.${notes.length ? ` ${notes.join('; ')}.` : ''}`;
    if (ticked > 0) toast.success(msg); else toast.info(msg);
  });
  const handledUpload = useRef<object | null>(null);
  useEffect(() => {
    if (!uploadedRows || handledUpload.current === uploadedRows) return;
    handledUpload.current = uploadedRows;
    tickUploaded(uploadedRows.items, uploadedRows.ids);
  }, [uploadedRows]);
  /* My Folders' "+ New" and ⋮ menu — the Resume Database page's checks: no
     markup, the length cap, Archived Resumes keeps its name, and no two
     folders of one parent share a name. The tree is read again after. */
  const reloadFolders = async () => {
    try { setFolders(await folderService.list()); } catch { setFolders(null); }
  };
  const folderNameProblem = (name: string, parentId: string | undefined, selfId?: string): string | null => {
    if (/<[^>]+>/.test(name) || /javascript:|data:|vbscript:/i.test(name)) return 'Folder name must not contain HTML or script content';
    if (name.length > FOLDER_NAME_MAX_LENGTH) return `Folder name must be ${FOLDER_NAME_MAX_LENGTH} characters or fewer`;
    if (!parentId && (name.toLowerCase() === 'root' || name === 'Archived Resumes')) return `"${name}" is a system folder name`;
    const clash = flatFolders.find((f) => f.id !== selfId
      && (f.parent_id || undefined) === parentId
      && f.name.trim().toLowerCase() === name.toLowerCase());
    if (!clash) return null;
    const parentName = parentId ? flatFolders.find((f) => f.id === parentId)?.name : undefined;
    return parentName ? `"${name}" already exists inside "${parentName}"` : `Folder "${name}" already exists`;
  };
  const createFolder = async (name: string, parentId?: string): Promise<boolean> => {
    if (!canUploadMyResumes) return false;
    const problem = folderNameProblem(name, parentId);
    if (problem) { toast.error(problem); return false; }
    try {
      await folderService.create(name, parentId);
      await reloadFolders();
      toast.success('Folder created');
      return true;
    } catch (err) {
      toast.error(`Couldn't create folder. ${friendlyErrorMessage(err, 'Please try again.')}`);
      return false;
    }
  };
  const renameFolder = async (id: string, name: string): Promise<boolean> => {
    if (!canUpdateMyResumes) return false;
    const target = flatFolders.find((f) => f.id === id);
    if (!target) return false;
    if (isArchivedFolder(target) || isRootFolder(target)) { toast.error(`${target.name} cannot be renamed`); return false; }
    if (name === target.name) return true;
    const problem = folderNameProblem(name, target.parent_id || undefined, id);
    if (problem) { toast.error(problem); return false; }
    try {
      await folderService.update(id, { name });
      await reloadFolders();
      toast.success('Folder renamed');
      return true;
    } catch (err) {
      toast.error(`Couldn't rename folder. ${friendlyErrorMessage(err, 'Please try again.')}`);
      return false;
    }
  };
  /* ── a resume row's ⋮ — the Resume Database page's row actions. My Resumes:
     Download, Archive, Delete; Shared Database: Download (it is the org's
     list, not one managed here); Archived Resumes: Download, Unarchive,
     Delete. Archive and Delete ask first, as on the page. ── */
  const [archiveAsk, setArchiveAsk] = useState<{ id: string; name: string } | null>(null);
  const [deleteAsk, setDeleteAsk] = useState<{ id: string; name: string; archived: boolean } | null>(null);
  const askFor = <T,>(set: (v: T | null) => void) => (v: T) => {
    set(v);
    onOverlayChange?.(() => { set(null); onOverlayChange?.(null); });
  };
  const doneAsking = <T,>(set: (v: T | null) => void) => { set(null); onOverlayChange?.(null); };
  /* A resume gone from the list (archived / deleted) leaves the picks too. */
  const unpick = (id: string) => {
    if (selection.mode !== 'ids') return;
    const had = pickedByBase[id];
    if (!had) return;
    const picked = { ...selection.picked };
    delete picked[had.resumeId];
    onSelectionChange({ mode: 'ids', picked });
  };
  const downloadResume = async (id: string, name: string) => {
    const ext: Record<string, string> = {
      'application/pdf': 'pdf',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/rtf': 'rtf',
      'text/rtf': 'rtf',
      'text/plain': 'txt',
    };
    try {
      toast.loading('Downloading resume...', { id: 'download' });
      const blob = await resumeService.download(id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name || 'resume'}.${ext[blob.type] ?? 'pdf'}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Resume downloaded', { id: 'download' });
    } catch {
      toast.error('Failed to download resume', { id: 'download' });
    }
  };
  const archiveResume = async (id: string) => {
    try {
      // Where it lived, so Unarchive can put it back (the page's stash).
      let from: string | undefined = filters.folder_id || undefined;
      if (!from) { try { from = (await resumeService.get(id)).folder_id; } catch { /* unknown: unarchive goes to root */ } }
      await archiveResumeToArchivedFolder(id, from, archivedFolderId ?? undefined);
      unpick(id);
      toast.success('Resume archived successfully');
    } catch (err) {
      toast.error(`Couldn't archive resume. ${friendlyErrorMessage(err, 'Please try again.')}`);
    } finally {
      setReloadTick((n) => n + 1);
      void reloadFolders();
    }
  };
  const deleteResume = async (id: string, archived: boolean) => {
    try {
      await resumeService.delete(id);
      unpick(id);
      toast.success('Resume deleted');
    } catch (err) {
      toast.error(`Couldn't delete resume. ${friendlyErrorMessage(err, 'Please try again.')}`);
    } finally {
      if (archived) setArchivedReload((n) => n + 1); else setReloadTick((n) => n + 1);
      void reloadFolders();
    }
  };
  const rowActions = (id: string, name: string, where: 'my-resumes' | 'internal-db' | 'archived'): ResumeRowAction[] => [
    { key: 'download', label: 'Download Resume', icon: <Download className="w-4 h-4 text-menu-icon-download" />, onSelect: () => void downloadResume(id, name) },
    ...(where === 'archived' ? [{
      key: 'unarchive',
      label: 'Unarchive Resume',
      icon: <ArchiveRestore className="w-4 h-4 text-menu-icon-archive" />,
      disabledReason: !canUnarchive ? 'You do not have permission to unarchive resumes' : unarchiving.has(id) ? 'Unarchiving…' : null,
      onSelect: () => void unarchive([id]),
    }] : []),
    ...(where === 'my-resumes' ? [{
      key: 'archive',
      label: 'Archive Resume',
      icon: <Archive className="w-4 h-4 text-menu-icon-archive" />,
      disabledReason: canUnarchive ? null : 'You do not have permission to archive resumes',
      onSelect: () => askFor(setArchiveAsk)({ id, name }),
    }] : []),
    ...(where !== 'internal-db' ? [{
      key: 'delete',
      label: 'Delete Resume',
      icon: <Trash2 className="w-4 h-4" />,
      danger: true,
      disabledReason: canDeleteMyResumes ? null : 'You do not have permission to delete resumes',
      onSelect: () => askFor(setDeleteAsk)({ id, name, archived: where === 'archived' }),
    }] : []),
  ];
  const unarchive = async (ids: string[]) => {
    if (!canUnarchive || ids.length === 0) return;
    const rootId = flatFolders.find(isRootFolder)?.id;
    const valid = new Set(flatFolders.map((f) => f.id));
    const stash = readPrevFolders();
    const target = (id: string) => {
      const prev = stash[id];
      return prev && valid.has(prev) && prev !== archivedFolderId ? prev : rootId;
    };
    setUnarchiving((s) => new Set([...s, ...ids]));
    try {
      // skipAudit on the move: the archive call itself logs "Resume unarchived".
      await Promise.all(ids.map(async (id) => {
        await resumeService.archive(id, false);
        const to = target(id);
        if (to) await resumeService.move(id, to, true);
      }));
      const restored = ids.filter((id) => target(id) !== rootId).length;
      try {
        ids.forEach((id) => { delete stash[id]; });
        localStorage.setItem(PREV_FOLDER_KEY, JSON.stringify(stash));
      } catch { /* best effort */ }
      toast.success(restored === ids.length
        ? `${plural(ids.length, 'resume')} unarchived and restored to ${ids.length === 1 ? 'its' : 'their'} original folder`
        : `${plural(ids.length, 'resume')} unarchived${restored ? ` (${restored} restored, ${ids.length - restored} to root)` : ' (moved to root)'}`);
    } catch (err) {
      toast.error((err as Error)?.message || 'Failed to unarchive resumes');
    } finally {
      setUnarchiving((s) => { const next = new Set(s); ids.forEach((id) => next.delete(id)); return next; });
      setArchivedPicks((s) => { const next = new Set(s); ids.forEach((id) => next.delete(id)); return next; });
      // Folder counts and the archived list read again.
      setFolders(null);
      setArchivedReload((n) => n + 1);
    }
  };

  const folderTicked = (id: string) =>
    selection.mode === 'filter' && selection.source === 'my-resumes' && (selection.filters.folder_id ?? '') === id;
  const tickFolder = (id: string, on: boolean) => {
    if (pickingDisabled) return;
    if (!on) { if (folderTicked(id)) onSelectionChange(EMPTY_SELECTION); return; }
    const f: InviteCandidateFilters = { ...filters, folder_id: id || undefined, exclude_invited: true };
    const key = keyOf(f);
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

  const tabButton = (t: TabKey) => {
    if (t === DB_TAB) return dbTabButton();
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
        {!add && !locked && <span className="tabular-nums font-normal text-gray-500 dark:text-slate-500">({tabCount(t) !== null ? fmt(tabCount(t)!) : '…'})</span>}
        {picked > 0 && (
          <span className="inline-flex items-center px-1.5 rounded-full bg-brand-blue/10 text-brand-blue text-2xs font-semibold tabular-nums">✓ {fmt(picked)}</span>
        )}
      </button>
    );
  };

  /* Resume Database: one tab for both lists — its count and picks are the
     two together; it opens on the side last used (My Resumes first). */
  const dbOpen = DB_SOURCES.filter((d) => tabAccess[d]);
  const [lastDb, setLastDb] = useState<'my-resumes' | 'internal-db'>(initialSource === 'internal-db' ? 'internal-db' : 'my-resumes');
  const dbSum = (n: (d: InviteCandidateSourceTab) => number | null) => {
    const parts = dbOpen.map(n);
    return parts.some((x) => x === null) ? null : parts.reduce<number>((a, b) => a + (b ?? 0), 0);
  };
  const switchDb = (d: 'my-resumes' | 'internal-db') => { setLastDb(d); switchTab(d); };
  const dbTabButton = () => {
    // While the cached (localStorage) permissions are still being re-validated
    // against /auth/me, "no access" may just be stale — show a neutral
    // "checking" state instead of the lock, so the tab doesn't flash locked
    // and then turn clickable a moment later.
    const checking = dbOpen.length === 0 && !permissionsVerified;
    const locked = dbOpen.length === 0 && permissionsVerified;
    const unavailable = locked || checking;
    const on = !addTab && isDbTab(source);
    const count = dbSum(tabCount);
    const picked = dbSum((d) => pickedBySource[d]) ?? 0;
    return (
      <button
        key={DB_TAB}
        type="button"
        role="tab"
        aria-selected={on}
        aria-disabled={unavailable}
        aria-busy={checking || undefined}
        onClick={() => { if (!unavailable) switchDb(tabAccess[lastDb] ? lastDb : dbOpen[0]); }}
        title={checking ? 'Checking your access…' : locked ? 'You do not have permission to access the Resume Database' : 'My Resumes and the Shared Database'}
        className={`-mb-px shrink-0 inline-flex items-center gap-1.5 whitespace-nowrap rounded-t-md px-2 pt-1.5 pb-2 text-[13px] font-medium border-b-2 transition-colors ${on
          ? 'border-brand-blue text-brand-blue font-semibold'
          : checking ? 'border-transparent text-gray-500 dark:text-slate-400 cursor-wait'
          : locked ? 'border-transparent text-gray-400 dark:text-slate-600 cursor-not-allowed'
          : 'border-transparent text-gray-600 dark:text-slate-400 hover:text-gray-900 hover:bg-gray-50 dark:hover:text-slate-100 dark:hover:bg-slate-800/60'}`}
      >
        {locked ? <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> : <SourceIcon source="internal-db" className="w-3.5 h-3.5" />}
        Resume Database
        {checking && <span className="tabular-nums font-normal text-gray-500 dark:text-slate-500">(…)</span>}
        {!unavailable && <span className="tabular-nums font-normal text-gray-500 dark:text-slate-500">({count !== null ? fmt(count) : '…'})</span>}
        {picked > 0 && (
          <span className="inline-flex items-center px-1.5 rounded-full bg-brand-blue/10 text-brand-blue text-2xs font-semibold tabular-nums">✓ {fmt(picked)}</span>
        )}
      </button>
    );
  };

  /* Select loaded / Select all matching — after Upload resumes on the
     Resume Database tab, beside the heading on the job's lists. Hidden
     while browsing Archived Resumes: that folder's rows are never
     invite-eligible, so these must never add them to the selection. */
  const pickControls = archivedHere ? null : (
    <>
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
        disabled={pickingDisabled || total === 0 || filterModeHere || selectingAll || (listRoom !== null && total > listRoom)}
        title={pickingDisabled ? 'Pick a version first'
          : listRoom !== null && total > listRoom && !filterModeHere ? `${fmt(total)} matching — only ${fmt(listRoom)} ${listRoom === 1 ? 'unit' : 'units'} left` : undefined}
        className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border border-brand-blue/30 bg-brand-blue/10 text-brand-blue hover:bg-brand-blue/15 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {selectingAll && <Loader2 className="w-3 h-3 mr-1 animate-spin" aria-hidden="true" />}
        {filterModeHere ? `All ${fmt(selection.total)} matching selected` : `Select all ${fmt(total)} matching`}
      </button>
      {onClearSelection && selectedTotal > 0 && (
        <button
          type="button"
          onClick={onClearSelection}
          title={`Untick all ${fmt(selectedTotal)} selected, on every tab`}
          className="text-xs font-medium text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 hover:underline underline-offset-2"
        >
          Clear selection
        </button>
      )}
    </>
  );

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
        className="flex items-end gap-x-4 sm:flex-wrap sm:gap-y-1 max-sm:overflow-x-auto border-b border-gray-200 dark:border-slate-700 px-2 sm:px-3 pt-2"
      >
        {TAB_GROUPS.map((g, i) => (
          <Fragment key={g.label}>
            {/* A hairline between the groups, from the label down to just above the tab underline. */}
            {i > 0 && <span aria-hidden="true" className="shrink-0 self-stretch w-px my-1.5 mb-2.5 bg-gray-200 dark:bg-slate-700" />}
            <div role="group" aria-label={g.label} className="flex shrink-0 flex-col gap-0.5">
              <span className="pl-2 text-2xs font-semibold text-gray-400 dark:text-slate-500 whitespace-nowrap">{g.label}</span>
              <div className="flex gap-0.5">{g.tabs.map(tabButton)}</div>
            </div>
          </Fragment>
        ))}
      </div>
      {tabsMore && (
        <span aria-hidden="true" className="sm:hidden pointer-events-none absolute right-0 top-0 bottom-px w-10 rounded-tr-xl bg-gradient-to-l from-white dark:from-slate-900 to-transparent" />
      )}
      </div>

      <div className="p-3 sm:p-4">
      {/* Manual / Upload Excel: always mounted, so its rows stay. */}
      <div className={addTab ? '' : 'hidden'}>{addPanel}</div>
      <div className={addTab ? 'hidden' : 'space-y-3'}>
      {/* Resume Database: My Resumes / Shared DB, as the Resume Database
          page's own tabs — each with its count and its picks — and Upload
          resumes at the right. One side only (permissions): no toggle. */}
      {isDbTab(source) && (
      <div className="flex flex-wrap items-center justify-between gap-2">
      {dbOpen.length > 1 ? (
        <div role="radiogroup" aria-label="Resume Database" className="inline-flex rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/60 p-0.5">
          {DB_SOURCES.map((d) => {
            const here = source === d;
            const n = tabCount(d);
            return (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={here}
                onClick={() => switchDb(d)}
                title={TAB_HINT[d]}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${here
                  ? 'bg-white dark:bg-slate-900 text-brand-blue font-semibold shadow-sm'
                  : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100'}`}
              >
                <SourceIcon source={d} className="w-3.5 h-3.5" />
                {TAB_LABEL[d]}
                <span className="tabular-nums font-normal text-gray-500 dark:text-slate-500">({n !== null ? fmt(n) : '…'})</span>
                {pickedBySource[d] > 0 && (
                  <span className="inline-flex items-center px-1.5 rounded-full bg-brand-blue/10 text-brand-blue text-2xs font-semibold tabular-nums">✓ {fmt(pickedBySource[d])}</span>
                )}
              </button>
            );
          })}
        </div>
      ) : <span />}
        <div className="flex flex-wrap items-center justify-end gap-2">
        {/* Uploads go to My Resumes (and open it), from either side. */}
        <button
          type="button"
          onClick={() => openUpload()}
          disabled={!canUploadMyResumes}
          title={canUploadMyResumes ? 'Upload resumes to My Resumes — they are selected once uploaded' : 'You do not have permission to upload resumes'}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Upload className="w-3.5 h-3.5 text-brand-blue" aria-hidden="true" />Upload resumes
        </button>
        {pickControls}
        </div>
      </div>
      )}
      {/* The list's heading (the Resume Database toggle row carries its own
          picking controls, after Upload resumes). */}
      {!isDbTab(source) && (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className={SECTION}>{LIST_HEADING[source]}</h3>
        <div className="flex flex-wrap items-center gap-2">{pickControls}</div>
      </div>
      )}

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
          select everyone in it) from laptop width — the tree needs ~15rem for
          its names; tablets and phones: the tree sits above the list. */}
      <div className={source === 'my-resumes' ? 'grid grid-cols-1 lg:grid-cols-[15rem_minmax(0,1fr)] gap-3 items-start' : ''}>
      {source === 'my-resumes' && (
        <InviteFolderTree
          folders={folders}
          allCount={counts?.['my-resumes'] ?? 0}
          openId={filters.folder_id ?? ''}
          onOpen={openFolder}
          isTicked={folderTicked}
          isPartly={(id) => folderTicked(id) && selection.mode === 'filter' && Object.keys(selection.excluded).length > 0}
          tickDisabledReason={(id, count) => (pickingDisabled ? 'Pick a version first'
            : count === 0 ? 'No resumes in this folder'
            : !folderTicked(id) && listRoom !== null && count > listRoom ? `${fmt(count)} in this folder — only ${fmt(listRoom)} ${listRoom === 1 ? 'unit' : 'units'} left`
            : null)}
          onTick={tickFolder}
          actions={{
            canCreate: canUploadMyResumes,
            canRename: canUpdateMyResumes,
            canUpload: canUploadMyResumes,
            onCreate: createFolder,
            onRename: renameFolder,
            onUploadTo: (id) => { openFolder(id); openUpload(id); },
          }}
          onOverlayChange={onOverlayChange}
        />
      )}
      <div className="min-w-0 space-y-2">
      {/* The list: only the loaded rows are in the DOM; 50 more on scroll. */}
      {archivedHere ? (
        archivedLoading ? (
          <div className="flex items-center justify-center py-10 rounded-lg border border-dashed border-gray-200 dark:border-slate-700">
            <Loader2 className="w-5 h-5 animate-spin text-brand-blue" />
          </div>
        ) : archived?.error ? (
          <p className="rounded-lg border border-destructive-line bg-destructive-subtle px-3 py-3 text-sm text-destructive">{archived.error}</p>
        ) : !archived || archived.rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 dark:border-slate-700 px-3 py-4 text-center tf-card-desc">
            {filters.search ? 'No archived resumes match this search.' : 'No archived resumes.'}
          </div>
        ) : (
          <ul className="rounded-lg border border-gray-200 dark:border-slate-700 divide-y divide-gray-100 dark:divide-slate-700/60 max-h-72 overflow-y-auto">
            <li className="sticky top-0 z-[1] flex items-center justify-between gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-800 text-2xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
              <label className="inline-flex items-center gap-2 min-w-0 cursor-not-allowed">
                <input
                  type="checkbox"
                  checked={false}
                  disabled
                  title="Archived resumes can't be selected here — unarchive a resume (⋮ menu) to invite it"
                  aria-label="Archived resumes cannot be selected for invite"
                  className="m-0 shrink-0 rounded border-gray-300 cursor-not-allowed"
                />
                <span className="truncate">Archived Resumes</span>
              </label>
              <span className="shrink-0 inline-flex items-center gap-2">
                <span className="tabular-nums">{fmt(archived.rows.length)} of {fmt(archived.total)}</span>
                <button
                  type="button"
                  onClick={() => void unarchive(archivedTicked)}
                  disabled={!canUnarchive || unarchiving.size > 0 || archivedTicked.length === 0}
                  title={!canUnarchive ? 'You do not have permission to unarchive resumes'
                    : archivedTicked.length === 0 ? 'Tick the resumes to unarchive'
                    : 'Back to their original folders — then they can be invited'}
                  className="normal-case tracking-normal inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-2xs font-semibold border border-brand-blue/30 bg-brand-blue/10 text-brand-blue hover:bg-brand-blue/15 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ArchiveRestore className="w-3 h-3" aria-hidden="true" />
                  Unarchive selected{archivedTicked.length > 0 ? ` (${fmt(archivedTicked.length)})` : ''}
                </button>
              </span>
            </li>
            {archived.rows.map((r) => {
              const busy = unarchiving.has(r.id);
              const ticked = archivedPicks.has(r.id);
              return (
                <li key={r.id} className={`flex items-center gap-2.5 px-3 py-2 ${ticked ? 'bg-amber-50/60 dark:bg-amber-500/5' : ''}`}>
                  {/* Archived resumes are never invite-eligible, so this stays
                      disabled here — unarchive is still one click away via
                      the ⋮ menu below, outside the invite-selection flow. */}
                  <input
                    type="checkbox"
                    checked={ticked}
                    disabled
                    onChange={() => setArchivedPicks((s) => { const next = new Set(s); if (next.has(r.id)) next.delete(r.id); else next.add(r.id); return next; })}
                    title="Archived resumes can't be selected here — unarchive it (⋮ menu) to invite it"
                    aria-label={`${r.name} is archived and cannot be selected for invite`}
                    className="m-0 shrink-0 rounded border-gray-300 cursor-not-allowed"
                  />
                  <span aria-hidden="true" className="max-sm:hidden shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-500/10 text-2xs font-semibold text-amber-700 dark:text-amber-400">
                    {initials(r.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-gray-900 dark:text-slate-50 truncate" title={r.name}>{kind === 'interview' ? formatCandidateFirstName(r.name) : r.name}</span>
                    <span className="flex items-center gap-1 min-w-0 tf-meta">
                      {r.email
                        ? <><Mail className="w-3 h-3 shrink-0" aria-hidden="true" /><span className="truncate" title={r.email}>{r.email}</span></>
                        : <span className="font-medium text-warning-strong">No email</span>}
                    </span>
                  </span>
                  <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-2xs font-medium border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400">
                    <Archive className="w-3 h-3" aria-hidden="true" />Archived
                  </span>
                  {busy && <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-brand-blue" aria-label="Unarchiving" />}
                  <button
                    type="button"
                    onClick={() => openPreview({ resume_id: r.id, name: r.name, email: r.email, phone: '', source: 'my-resumes', rating: null, match_score: null, score: null, already_invited: false })}
                    aria-label={`View resume of ${r.name}`}
                    title="View resume"
                    className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md text-gray-400 hover:text-brand-blue hover:bg-brand-blue/10"
                  >
                    <Eye className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <ResumeRowMenu name={r.name} actions={rowActions(r.id, r.name, 'archived')} onOverlayChange={onOverlayChange} />
                </li>
              );
            })}
          </ul>
        )
      ) : error ? (

        <p className="rounded-lg border border-destructive-line bg-destructive-subtle px-3 py-3 text-sm text-destructive">{error}</p>
      ) : loading ? (
        <div className="flex items-center justify-center py-10 rounded-lg border border-dashed border-gray-200 dark:border-slate-700">
          <Loader2 className="w-5 h-5 animate-spin text-brand-blue" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 dark:border-slate-700 px-3 py-4 text-center tf-card-desc">
          {tabCount(source) === 0
            ? (source === 'talent-match' ? 'No AI Talent Match candidates for this job yet.'
              : source === 'score-resume' ? 'No scored resumes for this job yet.'
              : source === 'my-resumes' ? 'You have not uploaded any resumes yet.'
              : 'No resumes in the Shared Database yet.')
            : 'No candidates match these filters.'}
          {tabCount(source) === 0 && (source === 'talent-match' || source === 'score-resume') && (
            <span className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <button type="button" onClick={() => onAddTabChange('manual')} className="h-8 inline-flex items-center gap-1.5 px-3 rounded-lg text-xs font-medium border border-brand-blue/30 text-brand-blue bg-brand-blue/5 hover:bg-brand-blue/10">
                <SourceIcon source="manual" className="w-3.5 h-3.5" />Add manually
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
              {source === 'my-resumes' && filters.folder_id ? ` · ${flatFolders.find((f) => f.id === filters.folder_id)?.name ?? ''}` : ''}
            </span>
            <span className="shrink-0 tabular-nums">{fmt(rows.length)} of {fmt(total)}</span>
          </li>
          {rows.map((r) => {
            const on = isOn(r) && !!r.email && !r.already_invited && !r.archived;
            const tickable = canTick(r);
            const picked = pickedOf(r);
            const why = tickBlockReason(r) ?? undefined;
            const shownName = kind === 'interview' ? formatCandidateFirstName(r.name) : r.name;
            return (
              <li key={r.resume_id}>
                <label title={why} className={`flex items-center gap-2.5 px-3 py-2 ${tickable ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800' : 'cursor-not-allowed'} ${on ? 'bg-blue-50 dark:bg-slate-800/50' : ''} ${r.archived ? 'opacity-60' : ''}`}>
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={!tickable}
                    onChange={() => toggle(r)}
                    aria-label={r.archived ? `${r.name} is archived and cannot be selected for invite` : `Invite ${r.name}`}
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
                    <span className="flex items-center gap-1 min-w-0 tf-meta">
                      {/* Phones: the email only — both were cut to a few letters. */}
                      {r.title && (
                        <span className="max-sm:hidden contents">
                          <Briefcase className="w-3 h-3 shrink-0" aria-hidden="true" />
                          <span className="truncate max-w-[45%]" title={r.title}>{r.title}</span>
                          <span aria-hidden="true" className="px-0.5">•</span>
                        </span>
                      )}
                      {r.email
                        ? <><Mail className="w-3 h-3 shrink-0" aria-hidden="true" /><span className="truncate" title={r.email}>{r.email}</span></>
                        : <span className="font-medium text-warning-strong">No email</span>}
                    </span>
                  </span>
                  {r.already_invited && (
                    <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-md text-2xs font-medium border bg-gray-50 dark:bg-slate-800/50 text-gray-500 dark:text-slate-400 border-gray-200 dark:border-slate-700">Invited</span>
                  )}
                  {r.archived && (
                    <span title="Archived — unarchive it (Resume Database) to invite this candidate" className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-2xs font-medium border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400">
                      <Archive className="w-3 h-3" aria-hidden="true" />Archived
                    </span>
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
                  {isDbTab(source) && (
                    <ResumeRowMenu name={r.name} actions={rowActions(r.resume_id, r.name, source as 'my-resumes' | 'internal-db')} onOverlayChange={onOverlayChange} />
                  )}
                </label>
              </li>
            );
          })}
          {hasMore && (
            <li ref={sentinelRef} className="flex items-center justify-center gap-2 px-3 py-2.5 tf-meta">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading more…
            </li>
          )}
        </ul>
      )}
      </div>
      </div>

      {filterModeHere && (
        <p role="note" className="tf-meta-strong">
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
      {uploading && typeof document !== 'undefined' && createPortal(
        <UploadModal
          folders={flatFolders.map(convertApiFolderToTree)}
          tenant={tenant}
          uploadSection="my-resumes"
          targetFolder={uploadFolder ?? (filters.folder_id && filters.folder_id !== archivedFolderId ? filters.folder_id : undefined)}
          /* From a folder's ⋮ Upload to Folder: only that folder and its subfolders. */
          scopeFolderId={uploadFolder}
          onClose={closeUpload}
          onUpload={(files, folderId) => uploadResumeFiles(files, folderId)}
          onScoreResume={(id, candidateName) => onUploaded([{ id, candidateName }])}
          onScoreResumes={onUploaded}
          onViewResume={(id) => { closeUpload(); openPreview({ resume_id: id, name: 'Resume', email: '', phone: '', source: 'my-resumes', rating: null, match_score: null, score: null, already_invited: false }); }}
          duplicateProceedLabel="Use Existing Resume"
        />,
        document.body,
      )}
      <AlertDialog open={!!archiveAsk} onOpenChange={(open) => { if (!open) doneAsking(setArchiveAsk); }}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><Archive className="w-5 h-5 text-amber-600" />Archive Resume</AlertDialogTitle>
            <AlertDialogDescription>
              Archive {archiveAsk?.name ? <b className="font-semibold">{archiveAsk.name}</b> : 'this resume'}? It moves to Archived Resumes and cannot be invited until it is unarchived.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { const a = archiveAsk; doneAsking(setArchiveAsk); if (a) void archiveResume(a.id); }}>
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <DeleteResumeDialog
        open={!!deleteAsk}
        names={deleteAsk ? [deleteAsk.name] : []}
        onCancel={() => doneAsking(setDeleteAsk)}
        onConfirm={() => { const d = deleteAsk; doneAsking(setDeleteAsk); if (d) void deleteResume(d.id, d.archived); }}
      />
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
