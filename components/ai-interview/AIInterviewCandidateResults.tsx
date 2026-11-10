'use client';

import { SCORE_CELL_TEXT } from '@/lib/utils/score';
import { ListBulkActions } from '@/components/ui/list-toolbar-slot';
import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import Dropdown from '@/components/ui/filter-select'; // aliased: ColumnFilterFields' FilterSelect is also imported
import { createPortal } from 'react-dom';
import { useListSearch } from '@/lib/hooks/useListSearch';
import { useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import ResultRowActions, { isPhoneWidth, useCanDownloadAIReports, AI_REPORT_DOWNLOAD_DENIED, isForbiddenError } from './ResultRowActions';
import ListEmptyState from '@/components/ui/list-empty-state';
import TimelineStamps from '@/components/ui/timeline-stamps';
import { capitalizedCase } from '@/lib/utils/candidateNameDisplay';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import {
  ChevronLeft, ChevronRight, Users, CheckCircle, XCircle,
  FileDown, FileText, FileSpreadsheet, Download, X, ChevronDown, Loader2,
  Square, CheckSquare, Mail, Briefcase,
} from 'lucide-react';
import ExportColumnsModal from '@/components/ExportColumnsModal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { downloadSessionReports } from './evaluation-dashboard/downloadSessionReport';
import { toast } from 'sonner';
import ListToolbar from '@/components/ui/list-toolbar';
import ListViewToggle, { ListDisplayMode } from '@/components/ui/list-view-toggle';
import GridCardSelect, { gridCardSelectedClass } from '@/components/ui/grid-card-select';
import { Skeleton, CardGridSkeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import type { AIInterviewResponse, AICandidateResultRow, AICandidateResultsFilters, AICandidateResultsFilterOptions, AICandidateResultsQuery, AICandidateResultsStats } from '@/lib/services/aiInterviewService';
import { usePagedList } from '@/lib/hooks/usePagedList';
import { formatIST } from '@/lib/utils/dateUtils';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { MobileRecordList, MobileRecordCard, DESKTOP_TABLE_ONLY } from '@/components/ui/mobile-record-card';
import {
  getStatusLabel,
  SessionStatusChip,
  getProctoringRisk,
  formatDuration,
} from './AIInterviewResults';
import { InviteSourceValue, inviteSourceLabel, displayInviteScore, inviteResult, InviteTimelineLines } from '@/components/AIInterviewInviteTable';
import SearchableSelect from '@/components/ui/searchable-select';
import {
  FilterSelect,
  FilterDateRange,
  INVITE_SOURCE_FILTER_OPTIONS,
  RESULT_FILTER_OPTIONS,
} from './ColumnFilterFields';

/** One filter per filterable column; '' means any. */
const EMPTY_CANDIDATE_FILTERS = {
  job: '',
  jobVersion: '',
  interviewVersion: '',
  inviteSource: '',
  status: '',
  result: '',
  risk: '',
  completedFrom: '',
  completedTo: '',
};
type CandidateFilters = typeof EMPTY_CANDIDATE_FILTERS;

const RISK_FILTER_OPTIONS = ['High', 'Medium', 'Low', 'None'].map((level) => ({ value: level, label: level }));

/**
 * Candidate Results — every candidate session across every AI interview, in one
 * table. The AI Interview counterpart of the Assessments page's tab of the same
 * name, and the same table the per-interview results view shows, widened with
 * an Interview column because rows here span configs.
 *
 * Row rendering imports the per-interview view's helpers rather than copying
 * them, so a status colour or risk rule only ever has to change in one place.
 */

/* Toggleable table columns (Actions always shows) — same Customize Columns
 * modal the resume scoring All Resumes tab uses. */
const CANDIDATE_COLUMNS = [
  { id: 'candidate', label: 'Candidate' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'status', label: 'Status' },
  { id: 'score', label: 'Score' },
  { id: 'result', label: 'Result' },
  { id: 'proctoring', label: 'Proctoring Risk' },
  { id: 'inviteSource', label: 'Invite Source' },
  { id: 'cid', label: 'CID' },
  { id: 'jobId', label: 'JD ID' },
  { id: 'jobTitle', label: 'Job Title' },
  { id: 'jobVersion', label: 'Job Version' },
  { id: 'interviewVersion', label: 'Interview Version' },
] as const;
type CandidateColumnId = (typeof CANDIDATE_COLUMNS)[number]['id'];

/** A session plus the interview it belongs to — rows here span configs. The
 *  server (GET /ai-interview/candidate-results) joins the labels on. */
type CandidateSessionRow = AICandidateResultRow;

/* Job versions blue, interview versions cyan — same two colours the All
 * Interviews table and the Interview/Assessment Version History panels use
 * for the same roles, so a V3 means the same thing wherever it's read. */
function VersionPill({ kind, version }: { kind: 'job' | 'interview'; version: number }) {
  return (
    <span
      className={`inline-flex items-center justify-center min-w-[2.25rem] px-1.5 py-0.5 rounded-md text-xs font-semibold tabular-nums ring-1 ${
        kind === 'job'
          ? 'text-brand-blue bg-brand-blue/10 ring-brand-blue/20 dark:bg-brand-blue/20 dark:text-blue-300 dark:ring-brand-blue/35'
          : 'text-brand-cyan bg-brand-cyan/10 ring-brand-cyan/20 dark:bg-brand-cyan/20 dark:text-cyan-200 dark:ring-brand-cyan/35'
      }`}
    >
      V{version}
    </span>
  );
}

const PAGE_SIZE = 10;
/** The "Show N per page" choices. */
const PAGE_SIZE_OPTIONS = [10, 15, 25, 50, 100];

/** The AI Interview rule: Must-Have Skills 60% or above is a Pass. Score is
 *  the MHS% the invite trackers show (displayInviteScore), and Result is the
 *  same Pass/Fail their badge shows (backend `final_result`, else that 60%
 *  mark), so a candidate reads the same on every tab. null = not scored. */
const mhsScore = (row: AIInterviewResponse) => displayInviteScore(row);
const sessionResult = (row: AIInterviewResponse) => inviteResult(row, mhsScore(row));

function PassFailBadge({ result }: { result: 'Pass' | 'Fail' }) {
  const passed = result === 'Pass';
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-medium ring-1 ${
        passed
          ? 'bg-success-subtle text-success ring-success-line'
          : 'bg-destructive-subtle text-destructive ring-destructive-line'
      }`}
    >
      {passed ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {passed ? 'Pass' : 'Fail'}
    </span>
  );
}

export interface AIInterviewCandidateResultsProps {
  /** The host's Sort by: rows load newest first, `oldest` reverses them. */
  sortOrder?: 'newest' | 'oldest';
  /**
   * DOM node the search/filter toolbar portals into, so it renders in the
   * shared slot above the tab pills (AIInterview.tsx) instead of its own
   * default spot inline above the table — every tab's toolbar then sits in
   * the same place regardless of which tab owns the fields. Falls back to
   * rendering inline when unset.
   */
  toolbarSlot?: HTMLDivElement | null;
  /**
   * Bumped by the host's Refresh button (AIInterview.tsx) to force a
   * reload — this table otherwise only refetches on mount.
   */
  refreshSignal?: number;
  /**
   * The AI Interviews page's one List/Card choice, shared by every tab. When
   * both are passed the host owns the view; otherwise this list keeps its own.
   */
  displayMode?: ListDisplayMode;
  onDisplayModeChange?: (mode: ListDisplayMode) => void;
}

export default function AIInterviewCandidateResults({ sortOrder = 'newest', toolbarSlot, refreshSignal, displayMode: hostDisplayMode, onDisplayModeChange }: AIInterviewCandidateResultsProps = {}) {
  const router = useRouter();
  // Export is RBAC-gated (`ai_interview:export`, enforced server-side by the
  // audit endpoint too) — greyed with the reason when missing, never hidden.
  const { isTenantAdmin, hasPermissionCode } = useAuth();
  const canExport = isTenantAdmin || hasPermissionCode('ai_interview:export');

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [localDisplayMode, setLocalDisplayMode] = useState<ListDisplayMode>('list');
  const hostOwnsView = hostDisplayMode !== undefined && !!onDisplayModeChange;
  const displayMode: ListDisplayMode = (hostOwnsView && hostDisplayMode) || localDisplayMode;
  const setDisplayMode = (hostOwnsView && onDisplayModeChange) || setLocalDisplayMode;

  // Search state lives in the shared hook: typed vs applied query, plus a
  // reset. No status filter — the fetch itself is scoped to Completed only
  // (on the server), so there is nothing left to filter by. `onChange`
  // returns to page 1 — narrowing from page 3 would otherwise strand the
  // user on a page that no longer exists.
  const [showFilters, setShowFilters] = useState(false);
  const search = useListSearch<CandidateFilters>({
    initialFilters: EMPTY_CANDIDATE_FILTERS,
    onChange: () => setCurrentPage(1),
    // The completed-on range is one filter however many ends are set.
    countFilters: (f) =>
      // Result isn't counted — it's the toolbar dropdown, not a More Filters pick.
      (['job', 'jobVersion', 'interviewVersion', 'inviteSource', 'status', 'risk'] as const)
        .filter((key) => !!f[key]).length
      + (f.completedFrom || f.completedTo ? 1 : 0),
  });

  /* Opening a candidate or job and coming back (breadcrumb or browser Back)
     remounts this list — restore its page, search, filters and view so the
     user lands where they left off, not on page 1. Page is applied last:
     restoring the search and filters calls onChange, which resets it to 1. */
  // Phones open on the cards — the table only scrolls sideways there.
  // Before the restore below, which still wins on larger screens.
  useEffect(() => {
    if (isPhoneWidth()) setLocalDisplayMode('grid');
  }, []);
  const listStateRestored = useListStatePersistence(
    'ai-interview-candidate-results',
    { currentPage, pageSize, query: search.query, filters: search.filters, displayMode },
    (s) => {
      if (typeof s.query === 'string' && s.query) search.setQuery(s.query);
      if (s.filters && typeof s.filters === 'object') search.setFilters({ ...EMPTY_CANDIDATE_FILTERS, ...s.filters });
      if ((s.displayMode === 'list' || s.displayMode === 'grid') && !isPhoneWidth()) setLocalDisplayMode(s.displayMode);
      if (typeof s.pageSize === 'number' && PAGE_SIZE_OPTIONS.includes(s.pageSize)) setPageSize(s.pageSize);
      if (typeof s.currentPage === 'number' && s.currentPage >= 1) setCurrentPage(s.currentPage);
    },
  );

  /* ── Rows: ONE page from the server, plus the counts, in parallel ──
     GET /ai-interview/candidate-results (+ /stats) with the tab's search,
     filters and sort. The server builds both from one filter function, so the
     total always matches. The tab used to download every finished session of
     the tenant (full rows) and every config, then filter, sort and page here.
     Waits for the restore and for a typed search to settle, so a return to
     this tab asks once, for the state on screen. */
  const f = search.filters;
  const resultFilters: AICandidateResultsFilters = {
    search: search.appliedQuery.trim() || undefined,
    job: f.job || undefined,
    jd_version: f.jobVersion ? Number(f.jobVersion) : undefined,
    interview_version: f.interviewVersion ? Number(f.interviewVersion) : undefined,
    invite_source: f.inviteSource || undefined,
    status: f.status || undefined,
    result: (f.result || undefined) as AICandidateResultsFilters['result'],
    risk: (f.risk || undefined) as AICandidateResultsFilters['risk'],
    completed_from: f.completedFrom || undefined,
    completed_to: f.completedTo || undefined,
  };
  const sortBy: 'newest' | 'oldest' = sortOrder === 'oldest' ? 'oldest' : 'newest';
  const resultsQuery: AICandidateResultsQuery = { ...resultFilters, sort_by: sortBy, page: currentPage, page_size: pageSize };
  const paged = usePagedList<CandidateSessionRow, AICandidateResultsStats, AICandidateResultsQuery>({
    name: 'ai-candidate-results',
    query: resultsQuery,
    fetchPage: (q) => aiInterviewService.listCandidateResults(q),
    fetchStats: (filters) => aiInterviewService.getCandidateResultsStats(filters),
    enabled: listStateRestored && search.query === search.appliedQuery,
  });
  const pageRows = paged.items;
  const total = paged.total;
  /* Nothing on screen yet — also while the request is held for the restore or
     a restored search, so that wait draws the skeleton, not "no results". */
  const isLoading = paged.loading || (pageRows.length === 0 && (!listStateRestored || search.query !== search.appliedQuery));
  const error = paged.error ? ((paged.error as Error)?.message || 'Failed to load candidate results') : null;

  /* Host's Refresh button — skips the mount value (the list loads itself). */
  const skippedFirstRefreshSignal = useRef(false);
  useEffect(() => {
    if (refreshSignal === undefined) return;
    if (!skippedFirstRefreshSignal.current) {
      skippedFirstRefreshSignal.current = true;
      return;
    }
    paged.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  /* Filter options — the values that occur in the result rows, from the
     server, when the panel first opens (not on landing). */
  const [filterOptions, setFilterOptions] = useState<AICandidateResultsFilterOptions | null>(null);
  useEffect(() => {
    if (!showFilters || filterOptions) return;
    let alive = true;
    aiInterviewService.getCandidateResultsFilterOptions()
      .then((opts) => { if (alive) setFilterOptions(opts); })
      .catch(() => { /* the panel keeps its "All" choices */ });
    return () => { alive = false; };
  }, [showFilters, filterOptions]);
  const jobOptions = useMemo(() => (filterOptions?.jobs || [])
    .slice()
    .sort((a, b) => a.value.localeCompare(b.value, undefined, { numeric: true }))
    .map(({ value, title }) => ({ value, label: title ? `${value} · ${title}` : value })), [filterOptions]);
  const jobVersionOptions = useMemo(() => (filterOptions?.job_versions || []).map((v) => ({ value: String(v), label: `V${v}` })), [filterOptions]);
  const interviewVersionOptions = useMemo(() => (filterOptions?.interview_versions || []).map((v) => ({ value: String(v), label: `V${v}` })), [filterOptions]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  /* A page past the end (rows gone, or a restored page) steps back once the
     total is known. */
  useEffect(() => {
    if (!paged.refreshing && total > 0 && currentPage > totalPages) setCurrentPage(totalPages);
  }, [paged.refreshing, total, currentPage, totalPages]);

  // Local text so a partial edit doesn't get clobbered by safePage until Enter/blur commits it.
  const [goToPage, setGoToPage] = useState(String(safePage));
  useEffect(() => {
    setGoToPage(String(safePage));
  }, [safePage]);
  const commitGoToPage = () => {
    const page = Math.round(Number(goToPage));
    if (Number.isFinite(page) && page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    } else {
      setGoToPage(String(safePage));
    }
  };

  /* The table always shows every column; which ones go into a file is picked
     in the Export popup (the Score Resume tab's pattern). */
  const exportColumns = CANDIDATE_COLUMNS.map((c) => ({ id: c.id as string, label: c.label as string }));

  // Row selection for Export — rows span configs, so key by config + session.
  const rowKey = (row: CandidateSessionRow) => `${row._config_id}-${row.id}`;
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const toggleSelected = (row: CandidateSessionRow) =>
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      const key = rowKey(row);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  /* Every row ticked is remembered as it was seen — selection survives paging,
     and Export / Download act on the rows themselves. */
  const [knownRows, setKnownRows] = useState<Record<string, CandidateSessionRow>>({});
  useEffect(() => {
    if (pageRows.length === 0) return;
    setKnownRows((prev) => {
      const next = { ...prev };
      for (const row of pageRows) next[rowKey(row)] = row;
      return next;
    });
  }, [pageRows]);
  /* "Select all N" — every row matching the search / filters, across pages:
     their ids from GET /candidate-results/ids, and the rows not seen yet by id
     (Export and Download PDF Reports need the rows). */
  const [selectingAll, setSelectingAll] = useState(false);
  const selectAllMatching = async () => {
    setSelectingAll(true);
    try {
      const refs = await aiInterviewService.getCandidateResultIds({ ...resultFilters, sort_by: sortBy });
      const keyOf = (r: { id: string; config_id: string }) => `${r.config_id}-${r.id}`;
      const missing = refs.filter((r) => !knownRows[keyOf(r)]).map((r) => r.id);
      const fetched = missing.length ? await aiInterviewService.getCandidateResultsByIds(missing) : [];
      setKnownRows((prev) => {
        const next = { ...prev };
        for (const row of fetched) next[rowKey(row)] = row;
        return next;
      });
      setSelectedKeys(new Set(refs.map(keyOf)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not select every result');
    } finally {
      setSelectingAll(false);
    }
  };
  const allOnPageSelected = pageRows.length > 0 && pageRows.every((row) => selectedKeys.has(rowKey(row)));
  const toggleAllOnPage = () =>
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) pageRows.forEach((row) => next.delete(rowKey(row)));
      else pageRows.forEach((row) => next.add(rowKey(row)));
      return next;
    });
  const selectedRows = useMemo(
    () => [...selectedKeys].map((key) => knownRows[key]).filter((row): row is CandidateSessionRow => !!row),
    [selectedKeys, knownRows],
  );

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<'csv' | 'xls'>('csv');

  // One export cell per column; Timeline splits into its three parts so each
  // lands in its own spreadsheet column.
  const pickColumns = (ids: string[]) => exportColumns.filter((c) => ids.includes(c.id));
  const exportHeaders = (ids: string[]): string[] =>
    pickColumns(ids).flatMap((c) => (
      c.id === 'timeline' ? ['Started At', 'Completed At', 'Duration']
      // Email lives under the name on screen, but stays its own spreadsheet column.
      : c.id === 'candidate' ? ['Candidate', 'Email']
      : [c.label]
    ));
  const exportRow = (row: CandidateSessionRow, ids: string[]): string[] =>
    pickColumns(ids).flatMap((c): string[] => {
      switch (c.id) {
        case 'cid': return [row.candidate_cid || ''];
        case 'candidate': return [row.candidate_name || '', row.candidate_email || ''];
        case 'jobId': return [row._job_id || ''];
        case 'jobTitle': return [row._config_title || ''];
        case 'jobVersion': return [`V${row._job_version}`];
        case 'interviewVersion': return [`V${row._interview_version}`];
        case 'inviteSource': return [inviteSourceLabel(row) || ''];
        case 'status': return [getStatusLabel(row.status)];
        case 'score': { const score = mhsScore(row); return [score != null ? `${score}%` : '']; }
        case 'result': return [sessionResult(row) || ''];
        case 'timeline': return [
          row.started_at ? formatIST(row.started_at) : '',
          row.completed_at ? formatIST(row.completed_at) : '',
          row.started_at ? formatDuration(row) : '',
        ];
        case 'proctoring': return [(row.status === 'completed' || row.status === 'terminated') ? getProctoringRisk(row).level : ''];
        default: return [''];
      }
    });

  // Exports the ticked rows (Export lives in the Actions menu, which only
  // shows once a row is ticked), with the columns picked in the popup.
  const handleExport = (ids: string[]) => {
    if (!canExport) return;
    const exportRows = selectedRows;
    if (exportRows.length === 0) {
      toast.warning('No candidates to export');
      return;
    }
    const headers = exportHeaders(ids);
    const data = exportRows.map((row) => exportRow(row, ids));
    const baseName = `AI_Interview_Candidate_Results_${new Date().toISOString().slice(0, 10)}`;
    let blob: Blob;
    let fileName: string;
    if (exportFormat === 'csv') {
      const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
      const csv = [headers.map(q).join(','), ...data.map((cells) => cells.map(q).join(','))].join('\n');
      blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
      fileName = `${baseName}.csv`;
    } else {
      const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"><style>table{border-collapse:collapse}th,td{border:1px solid #000;padding:8px;text-align:left}th{background:#f0f0f0;font-weight:bold}</style></head><body><table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${data.map((cells) => `<tr>${cells.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`;
      blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
      fileName = `${baseName}.xls`;
    }
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    // Audit trail: the file is built here, so record the export server-side.
    void aiInterviewService.logListExport({
      format: exportFormat,
      recordCount: exportRows.length,
      tab: 'candidate-results',
      ids: exportRows.map((row) => row.id),
      exportType: 'ai_interview_candidate_results',
    });
    toast.success(`Exported ${exportRows.length} records to ${exportFormat === 'csv' ? 'CSV' : 'Excel'}`);
    setShowExportModal(false);
  };

  /* Download PDF Reports — an item in the Actions menu (as on the per-interview
     results view), so it uses downloadSessionReports directly rather than the
     standalone DownloadPdfsButton. */
  const [downloadingPdfs, setDownloadingPdfs] = useState<{ done: number; total: number } | null>(null);
  const canDownloadReports = useCanDownloadAIReports();
  const handleDownloadSelectedPdfs = async () => {
    if (!canDownloadReports) return;
    setDownloadingPdfs({ done: 0, total: 0 });
    try {
      const zipName = `AI_Interview_Candidate_Reports_${new Date().toISOString().slice(0, 10)}.zip`;
      const { downloaded, skipped, failed } = await downloadSessionReports(
        selectedRows, zipName, (done, total) => setDownloadingPdfs({ done, total }),
      );
      if (downloaded === 0 && failed === 0) {
        toast.warning('No evaluated candidates to download — reports are available once an interview is evaluated.');
      } else if (failed > 0) {
        toast.error(`Downloaded ${downloaded} report${downloaded === 1 ? '' : 's'}; ${failed} could not be generated.`);
      } else if (skipped > 0) {
        toast.success(`Downloaded ${downloaded} report${downloaded === 1 ? '' : 's'}. ${skipped} candidate${skipped === 1 ? ' has' : 's have'} no report yet.`);
      }
    } catch (err) {
      console.error('[AIInterviewCandidateResults] Bulk PDF download failed:', err);
      toast.error(isForbiddenError(err) ? AI_REPORT_DOWNLOAD_DENIED : 'Could not download the reports. Please try again.');
    } finally {
      setDownloadingPdfs(null);
    }
  };

  /**
   * Opens that candidate's result view. Seeds the same nav list key the details
   * route reads for Previous/Next, scoped to rows from the SAME interview —
   * paging across configs would land on sessions the route can't resolve.
   *
   * `from=candidate-results` tells the details page the recruiter arrived from
   * this tab, not from an interview's own Results page, so its breadcrumb and
   * Back both point back here instead of through a page never visited.
   */
  const openSession = async (row: CandidateSessionRow) => {
    /* Every candidate in the current (filtered, sorted) list — across all
       pages and interviews — each carrying its own interview, so Previous /
       Next walk the Candidate Results list rather than stopping at the rows
       of one interview on one page (which read "1 / 1"). The list is on the
       server now: its ids (one light call); the page on screen if that fails. */
    let navList = pageRows.map((r) => ({ id: r.id, configId: r._config_id }));
    try {
      const refs = await aiInterviewService.getCandidateResultIds({ ...resultFilters, sort_by: sortBy });
      if (refs.length) navList = refs.map((r) => ({ id: r.id, configId: r.config_id }));
    } catch { /* keep the page's rows */ }
    try {
      sessionStorage.setItem('aiInterviewResultNavList', JSON.stringify(navList));
    } catch { /* ignore storage failures */ }
    /* Stamp this page's own entry with the tab first (no navigation), so the
       browser's Back from the result lands on Candidate Results itself. */
    try {
      window.history.replaceState(window.history.state, '', '/recruitment/ai-interviews?tab=candidate-results');
    } catch { /* ignore */ }
    router.push(
      `/recruitment/ai-interviews/${row._config_id}/results/details?session_id=${row.id}&from=candidate-results`
    );
  };

  const toolbar = (
    <>

      {/* Search + Filter bar — same toolbar as the per-interview results view. */}
      <ListToolbar
        searchValue={search.query}
        onSearchChange={search.setQuery}
        // The hook debounces into `appliedQuery`, so the toolbar passes
        // keystrokes straight through.
        searchDebounceMs={0}
        searchPlaceholder="Search by name, email, CID, or interview..."
        // Many controls beside the search — lay out by the toolbar's own width.
        fitToContainer
        onToggleFilters={() => setShowFilters((open) => !open)}
        filtersOpen={showFilters}
        activeFilterCount={search.activeFilterCount}
        filtersApplied={search.filtersApplied}
        onClearFilters={search.reset}
        leadingActions={
          /* Result (Pass / Fail) first, ahead of More Filters — the same
             toolbar order as the per-interview results view. */
          <div className="tf-jobs-filter-pills contents">
          <Dropdown
            value={search.filters.result}
            onChange={(v) => search.setFilter('result', v)}
            ariaLabel="Result"
            className="w-auto sm:w-auto px-3 sm:px-3 py-2 sm:py-2 rounded-lg sm:rounded-lg border-gray-300 text-black dark:text-slate-100"
            options={[
              { value: '', label: 'All Results' },
              ...RESULT_FILTER_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label })),
            ]}
          />
          </div>
        }
        filterPanel={
          /* One filter per column that has a fixed set of values; name,
             email and CID are what the search box is for. Picks are drafts
             until Done, as on the Activity Logs tab. */
          <div className="rounded-xl border border-gray-100 dark:border-slate-700/60 bg-slate-50/60 dark:bg-slate-800/30 p-3 sm:p-4">
            <div className="tf-grid-4">
              <SearchableSelect
                label="Job"
                value={search.draftFilters.job}
                onChange={(v) => search.setDraftFilter('job', v)}
                options={jobOptions}
                placeholder="All jobs"
                searchPlaceholder="Search job ID or title..."
                allLabel="All jobs"
                emptyMessage="No jobs match"
              />
              <FilterSelect id="cr-job-version" label="Job Version" anyLabel="All versions"
                value={search.draftFilters.jobVersion} onChange={(v) => search.setDraftFilter('jobVersion', v)}
                options={jobVersionOptions} />
              <FilterSelect id="cr-interview-version" label="Interview Version" anyLabel="All versions"
                value={search.draftFilters.interviewVersion} onChange={(v) => search.setDraftFilter('interviewVersion', v)}
                options={interviewVersionOptions} />
              <FilterSelect id="cr-invite-source" label="Invite Source" anyLabel="All sources"
                value={search.draftFilters.inviteSource} onChange={(v) => search.setDraftFilter('inviteSource', v)}
                options={INVITE_SOURCE_FILTER_OPTIONS} />
              <FilterSelect id="cr-risk" label="Proctoring Risk" anyLabel="Any risk"
                value={search.draftFilters.risk} onChange={(v) => search.setDraftFilter('risk', v)}
                options={RISK_FILTER_OPTIONS} />
              <FilterDateRange idPrefix="cr-completed" label="Completed On"
                from={search.draftFilters.completedFrom} to={search.draftFilters.completedTo}
                onFromChange={(v) => search.setDraftFilter('completedFrom', v)}
                onToChange={(v) => search.setDraftFilter('completedTo', v)} />
            </div>
            <div className="mt-4 pt-3 border-t border-gray-200 dark:border-slate-700/60 flex items-center justify-end gap-2">
              <Button variant="primary" size="sm" onClick={() => { search.applyFilters(); setShowFilters(false); }}>
                Done
              </Button>
            </div>
          </div>
        }
      >
        {/* Actions — the Resume Scoring pill: appears once a row is ticked and
            holds Export (format + columns picked in its popup) and Download
            PDF Reports. Clear unticks everything. */}
        {selectedRows.length > 0 && (
          <ListBulkActions>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="relative h-9 px-3 rounded-lg font-medium text-sm whitespace-nowrap inline-flex items-center justify-center gap-2 transition-all bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200 hover:border-gray-300 data-[state=open]:bg-gray-200 shadow-sm animate-in fade-in zoom-in-95 duration-300"
                  aria-label={`Actions for ${selectedRows.length} selected`}
                >
                  <span aria-hidden className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-brand-orange opacity-75 animate-ping [animation-iteration-count:4]" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-brand-orange ring-2 ring-white" />
                  </span>
                  {downloadingPdfs ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Actions ({selectedRows.length})
                  <ChevronDown className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64 overflow-hidden !rounded-lg !bg-white !pt-0 !pb-1 !px-0 !shadow-xl [&_[role=menuitem][data-highlighted]]:!bg-gray-100 [&_[role=menuitem]:hover]:!bg-gray-100">
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-2xs font-semibold uppercase tracking-wide text-gray-500 flex items-center justify-between gap-2">
                  <span>{selectedRows.length.toLocaleString()} selected</span>
                  {/* Select every row matching the search / filters, across pages. */}
                  {selectedKeys.size < total && (
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); void selectAllMatching(); }}
                      disabled={selectingAll}
                      className="normal-case font-medium text-brand-blue hover:underline disabled:opacity-50"
                    >
                      {selectingAll ? 'Selecting…' : `Select all ${total.toLocaleString()}`}
                    </button>
                  )}
                </div>
                <DropdownMenuItem
                  className={`flex items-center gap-2.5 px-4 py-2.5 text-sm ${canExport ? 'cursor-pointer' : 'text-gray-400 cursor-not-allowed opacity-60'}`}
                  aria-disabled={!canExport || undefined}
                  title={canExport ? undefined : 'You do not have permission to export AI interviews'}
                  onSelect={(e) => {
                    if (!canExport) { e.preventDefault(); return; }
                    setShowExportModal(true);
                  }}
                >
                  <FileDown className={`w-4 h-4 ${canExport ? 'text-menu-icon-download' : 'text-gray-300'}`} />
                  <span>Export</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className={`flex items-center gap-2.5 px-4 py-2.5 text-sm ${canDownloadReports ? 'cursor-pointer' : 'cursor-not-allowed opacity-60 text-gray-400'}`}
                  disabled={!!downloadingPdfs}
                  aria-disabled={!canDownloadReports || undefined}
                  title={canDownloadReports ? undefined : AI_REPORT_DOWNLOAD_DENIED}
                  onSelect={(e) => {
                    if (!canDownloadReports) { e.preventDefault(); return; }
                    void handleDownloadSelectedPdfs();
                  }}
                >
                  <Download className={`w-4 h-4 ${canDownloadReports ? 'text-menu-icon-download' : 'text-gray-300'}`} />
                  <span>
                    {downloadingPdfs
                      ? (downloadingPdfs.total > 1 ? `Preparing ${downloadingPdfs.done}/${downloadingPdfs.total}…` : 'Preparing…')
                      : 'Download PDF Reports'}
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSelectedKeys(new Set())}
              icon={<X className="w-4 h-4" />}
              className="whitespace-nowrap !h-9 !text-sm"
            >
              Clear
            </Button>
          </ListBulkActions>
        )}
        <ListViewToggle value={displayMode} onChange={setDisplayMode} />
      </ListToolbar>
    </>
  );

  /* Loading / error / never-any-results states. Rendered BELOW the real
     toolbar (see the return further down) rather than returned early: the
     toolbar lives in the page's shared slot, and returning before it was
     built left that slot empty — the search bar vanished on every load and
     Refresh, then popped back in. */
  let stateBody: ReactNode = null;
  if (isLoading) {
    // Card view loads as card skeletons, not a table.
    stateBody = displayMode === 'grid' ? <CardGridSkeleton count={8} className="xl:grid-cols-4" /> : (
      <div>
        {/* Table mirror — same columns/order as the real candidate results table */}
        <div className="tf-card-soft overflow-hidden">
          <div className="overflow-x-auto tf-table-shell">
            <table className="w-full text-sm">
              <thead className="bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-700">
                <tr>
                  <th className="tf-th-cell text-left"><Skeleton className="h-3 w-20" /></th>
                  <th className="tf-th-cell text-left"><Skeleton className="h-3 w-20" /></th>
                  <th className="tf-th-cell text-left"><Skeleton className="h-3 w-20" /></th>
                  <th className="tf-th-cell text-left"><Skeleton className="h-3 w-20" /></th>
                  <th className="tf-th-cell text-left"><Skeleton className="h-3 w-20" /></th>
                  <th className="tf-th-cell text-left"><Skeleton className="h-3 w-20" /></th>
                  <th className="tf-th-cell text-left"><Skeleton className="h-3 w-20" /></th>
                  <th className="tf-th-cell text-left"><Skeleton className="h-3 w-20" /></th>
                  <th className="tf-th-cell text-left"><Skeleton className="h-3 w-20" /></th>
                  <th className="tf-th-cell text-left"><Skeleton className="h-3 w-20" /></th>
                  <th className="tf-th-cell text-left"><Skeleton className="h-3 w-20" /></th>
                  <th className="tf-th-cell text-left"><Skeleton className="h-3 w-20" /></th>
                  <th className="tf-th-cell text-right tf-sticky-col"><Skeleton className="h-3 w-20 ml-auto" /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                {Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td className="tf-td"><Skeleton className="h-5 w-14 rounded-md" /></td>
                    <td className="tf-td">
                      <div className="flex items-center gap-2">
                        <Skeleton className="w-7 h-7 rounded-full" />
                        <Skeleton className="h-4 w-28" />
                      </div>
                    </td>
                    <td className="tf-td"><Skeleton className="h-4 w-32" /></td>
                    <td className="tf-td"><Skeleton className="h-5 w-16 rounded" /></td>
                    <td className="tf-td"><Skeleton className="h-4 w-28" /></td>
                    <td className="tf-td"><Skeleton className="h-5 w-9 rounded-md" /></td>
                    <td className="tf-td"><Skeleton className="h-5 w-9 rounded-md" /></td>
                    <td className="tf-td"><Skeleton className="h-4 w-24" /></td>
                    <td className="tf-td"><Skeleton className="h-5 w-20 rounded-full" /></td>
                    <td className="tf-td">
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-1.5 w-16 rounded-full" />
                        <Skeleton className="h-4 w-8" />
                      </div>
                    </td>
                    <td className="tf-td">
                      <div className="flex flex-col gap-1">
                        <Skeleton className="h-3 w-28" />
                        <Skeleton className="h-3 w-28" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    </td>
                    <td className="tf-td"><Skeleton className="h-5 w-16 rounded-full" /></td>
                    <td className="tf-td text-right"><Skeleton className="h-7 w-24 rounded-md ml-auto" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  } else if (error) {
    stateBody = (
      <div className="p-6 text-center">
        <p className="text-sm text-destructive mb-3">{error}</p>
        <Button variant="primary" size="md" onClick={() => paged.refresh()}>
          Retry
        </Button>
      </div>
    );
  } else if (total === 0 && !search.isNarrowed) {
    stateBody = (
      <ListEmptyState
        icon={Users}
        isNarrowed={false}
        entityLabel="candidate result"
        emptyTitle="No candidate results yet"
        emptyDescription="Results appear here once a candidate completes an AI interview."
      />
    );
  }

  if (stateBody) {
    return (
      <div>
        {toolbarSlot ? createPortal(toolbar, toolbarSlot) : toolbar}
        {stateBody}
      </div>
    );
  }

  return (
    <div>
      {toolbarSlot ? createPortal(toolbar, toolbarSlot) : toolbar}

      <div className="tf-card-soft overflow-hidden">
        {pageRows.length === 0 ? (
          <ListEmptyState
            icon={Users}
            isNarrowed
            query={search.appliedQuery}
            entityLabel="candidate result"
            emptyTitle="No candidate results yet"
            onReset={search.reset}
          />
        ) : displayMode === 'grid' ? (
          <>
            <div className="tf-grid-4 p-4">
              {pageRows.map((row) => {
                const risk = getProctoringRisk(row);
                const isSelected = selectedKeys.has(rowKey(row));
                return (
                  /* A div, not a <button>: the card carries the row's own View /
                     Download buttons, which can't nest inside a button. */
                  <div
                    key={`${row._config_id}-${row.id}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => openSession(row)}
                    onKeyDown={(e) => { if (e.key === 'Enter') openSession(row); }}
                    className={`group relative text-left cursor-pointer bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 hover:shadow-md hover:border-brand-blue/20 hover:-translate-y-0.5 transition-all p-4 flex flex-col gap-3 ${gridCardSelectedClass(isSelected)}`}
                  >
                    <GridCardSelect
                      selected={isSelected}
                      onToggle={() => toggleSelected(row)}
                      label={row.candidate_name || 'candidate'}
                      selectionActive={selectedKeys.size > 0}
                    />
                    <div className="flex items-start gap-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900 dark:text-slate-50 truncate">
                          {capitalizedCase(row.candidate_name) || 'Unknown'}
                        </p>
                        <p className="tf-meta truncate">
                          {row.candidate_email || '—'}
                        </p>
                      </div>
                      {row.candidate_cid && (
                        <span className="text-2xs font-mono font-medium text-brand-blue bg-brand-blue/5 ring-1 ring-brand-blue/20 px-1.5 py-0.5 rounded shrink-0">
                          {row.candidate_cid}
                        </span>
                      )}
                    </div>

                    <p className="tf-meta truncate" title={row._config_title}>
                      {row._config_title}
                    </p>

                    {inviteSourceLabel(row) && (
                      <p className="tf-meta">
                        <InviteSourceValue inv={row} iconClassName="w-3 h-3" />
                      </p>
                    )}

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <SessionStatusChip session={row} />
                      {row.status === 'in_progress' && (
                        <span className="tf-badge flex bg-destructive text-white text-2xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                          LIVE
                        </span>
                      )}
                      {(row.status === 'completed' || row.status === 'terminated') && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${risk.badge}`}>
                          {risk.level} risk
                        </span>
                      )}
                    </div>

                    {mhsScore(row) != null && (
                      <div className="flex items-center gap-1.5">
                        <span className={`font-medium text-xs ${mhsScore(row)! >= 60 ? 'text-success' : 'text-destructive'}`}>
                          {mhsScore(row)}%
                        </span>
                        {sessionResult(row) && <PassFailBadge result={sessionResult(row)!} />}
                      </div>
                    )}

                    <TimelineStamps
                      className="text-gray-500 dark:text-slate-500 pt-2 border-t border-gray-100 dark:border-slate-800"
                      startedAt={row.started_at} completedAt={row.completed_at} format={formatIST} duration={formatDuration(row)}
                    />

                    {/* Same View / Download Report pair as the table row's Actions. */}
                    <div className="flex justify-end">
                      <ResultRowActions session={row} onView={() => openSession(row)} />
                    </div>
                  </div>
                );
              })}
            </div>
            {total > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/50">
                <div className="flex flex-wrap items-center gap-3 tf-body-muted">
                  {/* Show N per page — back to page 1 on change. */}
                  <label className="inline-flex items-center gap-2">
                    <span>Show</span>
                    <Dropdown
                      value={String(pageSize)}
                      onChange={(v) => { setPageSize(Number(v)); setCurrentPage(1); }}
                      ariaLabel="Rows per page"
                      className="w-auto sm:w-auto data-[size=default]:h-8 sm:data-[size=default]:h-8 py-0 sm:py-0 px-2 sm:px-2 rounded-lg sm:rounded-lg text-gray-900 dark:text-slate-100"
                      options={PAGE_SIZE_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
                    />
                    <span>per page</span>
                  </label>
                  <span>Showing {((safePage - 1) * pageSize) + 1}–{Math.min(safePage * pageSize, total)} of {total}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="tf-body-muted whitespace-nowrap">Go to</span>
                    <input
                      type="number"
                      min={1}
                      max={totalPages}
                      value={goToPage}
                      onChange={(e) => setGoToPage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.currentTarget.blur();
                          commitGoToPage();
                        }
                      }}
                      onBlur={commitGoToPage}
                      aria-label="Go to page"
                      className="tf-input w-14 h-8 px-2 text-center"
                    />
                  </div>
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={safePage === 1}
                    className="p-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-brand-blue font-semibold px-2 tabular-nums">
                    {safePage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage === totalPages}
                    className="p-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className={`overflow-x-auto tf-table-shell ${DESKTOP_TABLE_ONLY}`}>
              <table className="w-full text-sm">
                <thead className="bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-700">
                  <tr>
<th className="tf-th-cell text-left w-12 tf-sticky-col-left tf-th">
                      <button
                        type="button"
                        onClick={toggleAllOnPage}
                        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-800"
                        aria-label={allOnPageSelected ? 'Deselect all on this page' : 'Select all on this page'}
                        title={allOnPageSelected ? 'Deselect all on this page' : 'Select all on this page'}
                      >
                        {allOnPageSelected ? (
                          <CheckSquare className="w-4 h-4 text-brand-blue" />
                        ) : (
                          <Square className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                    </th>
                    <th className="tf-th-cell text-left tf-th"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">Candidate</span></th>
                    <th className="tf-th-cell text-left tf-th"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">Timeline</span></th>
                    <th className="tf-th-cell text-left tf-th"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">Status</span></th>
                    <th className="tf-th-cell text-left tf-th"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">Score</span></th>
                    <th className="tf-th-cell text-left tf-th"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">Result</span></th>
                    <th className="tf-th-cell text-left tf-th"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">Proctoring Risk</span></th>
                    <th className="tf-th-cell text-left tf-th"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">Invite Source</span></th>
                    <th className="tf-th-cell text-left tf-th"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">CID</span></th>
                    <th className="tf-th-cell text-left tf-th"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">JD ID</span></th>
                    <th className="tf-th-cell text-left tf-th"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">Job Title</span></th>
                    <th className="tf-th-cell text-left tf-th"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">Job Version</span></th>
                    <th className="tf-th-cell text-left tf-th"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">Interview Version</span></th>
                    <th className="tf-th-cell text-right tf-th tf-sticky-col"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                  {pageRows.map((row) => {
                    const risk = getProctoringRisk(row);
                    /* Each enabled column's cell, rendered in the row. */
                    const cells: Record<CandidateColumnId, { className: string; content: ReactNode }> = {
                      candidate: {
                        className: 'px-4 py-3',
                        content: (
                          <>
                            <div className="flex items-center gap-2">
                              {/* Email under the name, as on Track Invites,
                                  rather than a column of its own. */}
                              <div className="min-w-0 max-w-[220px]">
                                <p className="font-medium text-gray-900 dark:text-slate-50 truncate" title={capitalizedCase(row.candidate_name) || 'Unknown'}>
                                  {capitalizedCase(row.candidate_name) || 'Unknown'}
                                </p>
                                <p className="tf-meta truncate" title={row.candidate_email || undefined}>
                                  {row.candidate_email || '—'}
                                </p>
                              </div>
                            </div>
                          </>
                        ),
                      },
                      timeline: {
                        className: 'px-4 py-3 align-top whitespace-nowrap text-gray-600 dark:text-slate-400',
                        content: (
                          <>
                            {/* The Track Invites timeline (Invited, System Check,
                                Started, Completed) plus this table's Duration. */}
                            <InviteTimelineLines inv={row} duration={formatDuration(row)} />
                          </>
                        ),
                      },
                      status: {
                        className: 'px-4 py-3 whitespace-nowrap',
                        content: (
                          <>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <SessionStatusChip session={row} />
                              {row.status === 'in_progress' && (
                                <span className="tf-badge flex bg-destructive text-white text-2xs">
                                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                  LIVE
                                </span>
                              )}
                            </div>
                          </>
                        ),
                      },
                      score: {
                        className: 'px-4 py-3 whitespace-nowrap',
                        content: (
                          <>
                            {mhsScore(row) != null ? (
                              <span className={`${SCORE_CELL_TEXT} ${mhsScore(row)! >= 60 ? 'text-success' : 'text-destructive'}`}>
                                {mhsScore(row)}%
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </>
                        ),
                      },
                      result: {
                        className: 'px-4 py-3 whitespace-nowrap',
                        content: (
                          <>
                            {sessionResult(row) ? <PassFailBadge result={sessionResult(row)!} /> : <span className="text-gray-400">—</span>}
                          </>
                        ),
                      },
                      proctoring: {
                        className: 'px-4 py-3 whitespace-nowrap',
                        content: (
                          <>
                            {(row.status === 'completed' || row.status === 'terminated') ? (
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${risk.badge}`}>
                                {risk.level}
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </>
                        ),
                      },
                      inviteSource: {
                        className: 'px-4 py-3 whitespace-nowrap text-gray-700 dark:text-slate-300',
                        content: (
                          <>
                            {inviteSourceLabel(row)
                              ? <InviteSourceValue inv={row} iconClassName="w-3.5 h-3.5" />
                              : <span className="text-gray-400">—</span>}
                          </>
                        ),
                      },
                      cid: {
                        className: 'px-4 py-3 whitespace-nowrap',
                        content: (
                          <>
                            {row.candidate_cid ? (
                              <span className="text-xs font-mono font-medium text-brand-blue bg-brand-blue/5 ring-1 ring-brand-blue/20 px-2 py-1 rounded">
                                {row.candidate_cid}
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </>
                        ),
                      },
                      jobId: {
                        className: 'px-4 py-3 whitespace-nowrap',
                        content: (
                          <>
                            {row._job_id ? (
                              <JobIdBadge>{row._job_id}</JobIdBadge>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </>
                        ),
                      },
                      jobTitle: {
                        className: 'px-4 py-3',
                        content: (
                          <>
                            <span className="text-gray-700 dark:text-slate-300 truncate max-w-[180px] block">
                              {row._config_title}
                            </span>
                          </>
                        ),
                      },
                      jobVersion: {
                        className: 'px-4 py-3 whitespace-nowrap',
                        content: (
                          <>
                            <VersionPill kind="job" version={row._job_version} />
                          </>
                        ),
                      },
                      interviewVersion: {
                        className: 'px-4 py-3 whitespace-nowrap',
                        content: (
                          <>
                            <VersionPill kind="interview" version={row._interview_version} />
                          </>
                        ),
                      },
                    };
                    const key = rowKey(row);
                    return (
                      <tr
                        key={key}
                        /* Clicking anywhere on the row acts as View; the checkbox,
                           links and action buttons keep their own behaviour.
                           Clicks inside a portal (menu / download dialog) bubble
                           through React but are not in this row's DOM — ignored. */
                        onClick={(e) => {
                          const t = e.target as HTMLElement;
                          if (!e.currentTarget.contains(t)) return;
                          if (t.closest('a, button, input, select, label, [role="button"], [role="menuitem"]')) return;
                          if (window.getSelection()?.toString()) return; // selecting text, not opening
                          openSession(row);
                        }}
                        className="transition-colors cursor-pointer hover:bg-brand-blue/5"
                      >
                        <td className="tf-td w-12 tf-sticky-col-left">
                          <button
                            type="button"
                            onClick={() => toggleSelected(row)}
                            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-700"
                            aria-label={selectedKeys.has(rowKey(row)) ? 'Deselect candidate' : 'Select candidate'}
                          >
                            {selectedKeys.has(rowKey(row)) ? (
                              <CheckSquare className="w-4 h-4 text-brand-blue" />
                            ) : (
                              <Square className="w-4 h-4 text-gray-400" />
                            )}
                          </button>
                        </td>
                        {CANDIDATE_COLUMNS.map((c) => (
                          <td key={c.id} className={cells[c.id].className}>{cells[c.id].content}</td>
                        ))}
                        <td className="tf-td text-right whitespace-nowrap tf-sticky-col">
                          <div className="flex items-center justify-end gap-1.5">
                            <ResultRowActions session={row} onView={() => openSession(row)} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <MobileRecordList className="p-3">
              {pageRows.map((row) => {
                const risk = getProctoringRisk(row);
                const isSelected = selectedKeys.has(rowKey(row));
                return (
                  <MobileRecordCard
                    key={rowKey(row)}
                    selected={isSelected}
                    select={
                      <button
                        type="button"
                        onClick={() => toggleSelected(row)}
                        className="p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-700"
                        aria-label={isSelected ? 'Deselect candidate' : 'Select candidate'}
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-brand-blue" />
                        ) : (
                          <Square className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                    }
                    idBadge={
                      (row.candidate_cid || row._job_id) ? (
                        <>
                          {row.candidate_cid && (
                            <span className="text-xs font-mono font-medium text-brand-blue bg-brand-blue/5 ring-1 ring-brand-blue/20 px-2 py-1 rounded">
                              {row.candidate_cid}
                            </span>
                          )}
                          {row._job_id && <JobIdBadge>{row._job_id}</JobIdBadge>}
                        </>
                      ) : undefined
                    }
                    badges={
                      <>
                        <SessionStatusChip session={row} />
                        {row.status === 'in_progress' && (
                          <span className="tf-badge flex bg-destructive text-white text-2xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                            LIVE
                          </span>
                        )}
                      </>
                    }
                    title={capitalizedCase(row.candidate_name) || 'Unknown'}
                    actions={<ResultRowActions session={row} onView={() => openSession(row)} />}
                    meta={[
                      { icon: <Mail className="w-3.5 h-3.5" />, label: row.candidate_email || '—' },
                      { icon: <Briefcase className="w-3.5 h-3.5" />, label: row._config_title },
                      { label: inviteSourceLabel(row) ? <InviteSourceValue inv={row} iconClassName="w-3.5 h-3.5" /> : null },
                    ]}
                    fields={[
                      {
                        label: 'Score',
                        value: mhsScore(row) != null ? (
                          <span className={`${SCORE_CELL_TEXT} ${mhsScore(row)! >= 60 ? 'text-success' : 'text-destructive'}`}>
                            {mhsScore(row)}%
                          </span>
                        ) : '—',
                      },
                      { label: 'Result', value: sessionResult(row) ? <PassFailBadge result={sessionResult(row)!} /> : '—' },
                      {
                        label: 'Proctoring Risk',
                        value: (row.status === 'completed' || row.status === 'terminated') ? (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${risk.badge}`}>{risk.level}</span>
                        ) : '—',
                      },
                      { label: 'Job Version', value: <VersionPill kind="job" version={row._job_version} /> },
                      { label: 'Interview Version', value: <VersionPill kind="interview" version={row._interview_version} /> },
                    ]}
                  >
                    <div className="text-xs text-gray-600 dark:text-slate-400">
                      <InviteTimelineLines inv={row} duration={formatDuration(row)} />
                    </div>
                  </MobileRecordCard>
                );
              })}
            </MobileRecordList>

            {total > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/50">
                <div className="flex flex-wrap items-center gap-3 tf-body-muted">
                  {/* Show N per page — back to page 1 on change. */}
                  <label className="inline-flex items-center gap-2">
                    <span>Show</span>
                    <Dropdown
                      value={String(pageSize)}
                      onChange={(v) => { setPageSize(Number(v)); setCurrentPage(1); }}
                      ariaLabel="Rows per page"
                      className="w-auto sm:w-auto data-[size=default]:h-8 sm:data-[size=default]:h-8 py-0 sm:py-0 px-2 sm:px-2 rounded-lg sm:rounded-lg text-gray-900 dark:text-slate-100"
                      options={PAGE_SIZE_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
                    />
                    <span>per page</span>
                  </label>
                  <span>Showing {((safePage - 1) * pageSize) + 1}–{Math.min(safePage * pageSize, total)} of {total}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="tf-body-muted whitespace-nowrap">Go to</span>
                    <input
                      type="number"
                      min={1}
                      max={totalPages}
                      value={goToPage}
                      onChange={(e) => setGoToPage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.currentTarget.blur();
                          commitGoToPage();
                        }
                      }}
                      onBlur={commitGoToPage}
                      aria-label="Go to page"
                      className="tf-input w-14 h-8 px-2 text-center"
                    />
                  </div>
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={safePage === 1}
                    className="p-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-brand-blue font-semibold px-2 tabular-nums">
                    {safePage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage === totalPages}
                    className="p-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

    {/* Export — the Score Resume tab's popup: format, then the columns to
        include (all ticked to start), then Cancel / Export. */}
    {showExportModal && (
      <ExportColumnsModal<'csv' | 'xls'>
        title="Export Candidate Results"
        recordCount={selectedRows.length}
        formats={[
          { key: 'csv', title: 'CSV Format', description: 'Compatible with Excel, Google Sheets, and most spreadsheet apps.', Icon: FileText, iconWrap: 'bg-success-subtle', iconColor: 'text-success' },
          { key: 'xls', title: 'Excel Format (.xls)', description: 'Native Excel format with formatting and styling.', Icon: FileSpreadsheet, iconWrap: 'bg-blue-100', iconColor: 'text-blue-700' },
        ]}
        format={exportFormat}
        onFormatChange={setExportFormat}
        columns={exportColumns}
        initialColumnIds={exportColumns.map((c) => c.id)}
        onExport={handleExport}
        onClose={() => setShowExportModal(false)}
      />
    )}
    </div>
  );
}
