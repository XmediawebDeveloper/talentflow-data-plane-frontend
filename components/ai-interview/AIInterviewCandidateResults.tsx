'use client';

import { SCORE_CELL_TEXT } from '@/lib/utils/score';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useListSearch } from '@/lib/hooks/useListSearch';
import { useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import ResultRowActions, { DownloadPdfsButton, isPhoneWidth } from './ResultRowActions';
import ListEmptyState from '@/components/ui/list-empty-state';
import TimelineStamps from '@/components/ui/timeline-stamps';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft, ChevronRight, Eye, Users, CheckCircle, XCircle,
  SlidersHorizontal, FileDown, FileText, FileSpreadsheet, Info, Download, X,
  Square, CheckSquare,
} from 'lucide-react';
import ColumnCustomizationModal from '@/components/ColumnCustomizationModal';
import { toast } from 'sonner';
import ListToolbar from '@/components/ui/list-toolbar';
import ListCountBadge from '@/components/ui/list-count-badge';
import ListViewToggle, { ListDisplayMode } from '@/components/ui/list-view-toggle';
import GridCardSelect, { gridCardSelectedClass } from '@/components/ui/grid-card-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import type { AIInterviewResponse } from '@/lib/services/aiInterviewService';
import { formatIST } from '@/lib/utils/dateUtils';
import { Badge } from '@/components/ui/badge';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import {
  getStatusVariant,
  getStatusLabel,
  getProctoringRisk,
  formatDuration,
} from './AIInterviewResults';
import { InviteSourceValue, inviteSourceLabel, displayInviteScore, inviteResult, matchesInviteResultFilter } from '@/components/AIInterviewInviteTable';
import SearchableSelect from '@/components/ui/searchable-select';
import {
  FilterSelect,
  FilterDateRange,
  jobFilterOptions,
  versionFilterOptions,
  INVITE_SOURCE_FILTER_OPTIONS,
  RESULT_FILTER_OPTIONS,
  matchesDateRange,
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
  { id: 'cid', label: 'CID' },
  { id: 'candidate', label: 'Candidate' },
  { id: 'email', label: 'Email' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'status', label: 'Status' },
  { id: 'score', label: 'Score' },
  { id: 'result', label: 'Result' },
  { id: 'proctoring', label: 'Proctoring Risk' },
  { id: 'inviteSource', label: 'Invite Source' },
  { id: 'jobId', label: 'Job ID' },
  { id: 'jobTitle', label: 'Job Title' },
  { id: 'jobVersion', label: 'Job Version' },
  { id: 'interviewVersion', label: 'Interview Version' },
] as const;
type CandidateColumnId = (typeof CANDIDATE_COLUMNS)[number]['id'];

/** A session plus the interview it belongs to — rows here span configs. */
type CandidateSessionRow = AIInterviewResponse & {
  _config_id: string;
  _config_title: string;
  _job_id: string;
  _job_version: number;
  _interview_version: number;
};

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
}

export default function AIInterviewCandidateResults({ toolbarSlot, refreshSignal }: AIInterviewCandidateResultsProps = {}) {
  const router = useRouter();

  const [rows, setRows] = useState<CandidateSessionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [displayMode, setDisplayMode] = useState<ListDisplayMode>('list');

  // Search state lives in the shared hook: typed vs applied query, plus a
  // reset. No status filter — the fetch itself is scoped to Completed only
  // (see loadAllSessions), so there is nothing left to filter by. `onChange`
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
    if (isPhoneWidth()) setDisplayMode('grid');
  }, []);
  useListStatePersistence(
    'ai-interview-candidate-results',
    { currentPage, pageSize, query: search.query, filters: search.filters, displayMode },
    (s) => {
      if (typeof s.query === 'string' && s.query) search.setQuery(s.query);
      if (s.filters && typeof s.filters === 'object') search.setFilters({ ...EMPTY_CANDIDATE_FILTERS, ...s.filters });
      if ((s.displayMode === 'list' || s.displayMode === 'grid') && !isPhoneWidth()) setDisplayMode(s.displayMode);
      if (typeof s.pageSize === 'number' && PAGE_SIZE_OPTIONS.includes(s.pageSize)) setPageSize(s.pageSize);
      if (typeof s.currentPage === 'number' && s.currentPage >= 1) setCurrentPage(s.currentPage);
    },
  );

  /**
   * One tenant-wide call (paginated), not one request per config per status.
   * This used to fan out `configs.length × 2` unthrottled requests — hundreds
   * on a tenant with many AI-interview configs — because there was no
   * cross-config sessions endpoint. `GET /ai-interview` (`aiInterviewService
   * .list`) already covers every session tenant-wide, so asking it once for
   * `status=completed,terminated` returns the same rows the old per-config
   * loop assembled by hand.
   *
   * Completed AND Terminated — the two states with a result to show (a
   * terminated interview has its partial evaluation).
   */
  const loadAllSessions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const configsResp = await aiInterviewService.listConfigs({ page: 1, page_size: 500, compact: true });
      const configs = configsResp.items ?? [];
      if (configs.length === 0) {
        setRows([]);
        return;
      }
      const configById = new Map(configs.map((c) => [c.id, c]));

      /* Interview version — the Nth config created against a given job
       * version (jd_id), oldest first. Same derivation as the All Interviews
       * table's own column, computed once over the WHOLE fetched set so a
       * version's number doesn't shift depending on which configs happen to
       * have completed sessions. */
      const ordinalByConfigId = new Map<string, number>();
      const byJobVersion = new Map<string, AIInterviewResponse[]>();
      for (const config of configs) {
        if (!config.jd_id) continue;
        const bucket = byJobVersion.get(config.jd_id);
        if (bucket) bucket.push(config);
        else byJobVersion.set(config.jd_id, [config]);
      }
      for (const bucket of byJobVersion.values()) {
        bucket
          .slice()
          .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime())
          .forEach((config, index) => ordinalByConfigId.set(config.id, index + 1));
      }

      // Paginated — a mature tenant can have more completed/terminated
      // sessions than fit on one page.
      const sessions: AIInterviewResponse[] = [];
      for (let page = 1; page <= 40; page += 1) {
        const res = await aiInterviewService
          .list({ status: 'completed,terminated', page, page_size: 1000 })
          .catch(() => ({ items: [] as AIInterviewResponse[], total: 0 }));
        const items = res.items ?? [];
        sessions.push(...items);
        if (items.length < 1000 || sessions.length >= (res.total ?? sessions.length)) break;
      }

      // A session's config may be archived (excluded from `configs`, which
      // only lists non-archived by default) — drop it, matching the old
      // behaviour of only ever iterating non-archived configs.
      const merged = sessions
        .filter((session) => session.config_id && configById.has(session.config_id))
        .map((session): CandidateSessionRow => {
          const config = configById.get(session.config_id as string)!;
          return {
            ...session,
            _config_id: config.id,
            // jd_title first, matching how the interview cards on this page
            // are labelled, so the column reads the same as the list above it.
            _config_title: config.jd_title || config.position || 'Untitled',
            _job_id: config.jd_short_id || '',
            _job_version: config.jd_version ?? 1,
            _interview_version: ordinalByConfigId.get(config.id) ?? 1,
          };
        })
        // Newest first — completed sessions lead, then whatever started or
        // was invited most recently.
        .sort((a, b) => {
          const ta = new Date(a.completed_at || a.started_at || a.created_at || 0).getTime();
          const tb = new Date(b.completed_at || b.started_at || b.created_at || 0).getTime();
          return tb - ta;
        });

      setRows(merged);
      // Page is NOT reset here — it may have just been restored (see
      // useListStatePersistence above), and safePage clamps it if the
      // reload left fewer pages.
    } catch (err: any) {
      setError(err?.message || 'Failed to load candidate results');
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllSessions();
  }, [loadAllSessions]);

  /* Host's Refresh button — skips the mount value so this doesn't
     double-fetch alongside the effect above. */
  const skippedFirstRefreshSignal = useRef(false);
  useEffect(() => {
    if (refreshSignal === undefined) return;
    if (!skippedFirstRefreshSignal.current) {
      skippedFirstRefreshSignal.current = true;
      return;
    }
    loadAllSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  // Filtering is client-side: the rows are already all in memory. Keyed off
  // the APPLIED query so the list doesn't rebuild on every keystroke.
  const filteredRows = useMemo(() => {
    const query = search.appliedQuery.trim().toLowerCase();
    const f = search.filters;

    return rows.filter((row) => {
      if (query && ![row.candidate_name, row.candidate_email, row.candidate_cid, row._config_title, row._job_id]
        .some((field) => (field || '').toLowerCase().includes(query))) return false;
      if (f.job && row._job_id !== f.job) return false;
      if (f.jobVersion && String(row._job_version) !== f.jobVersion) return false;
      if (f.interviewVersion && String(row._interview_version) !== f.interviewVersion) return false;
      if (f.inviteSource && (row as any).invite_source !== f.inviteSource) return false;
      if (f.status && row.status !== f.status) return false;
      if (!matchesInviteResultFilter(row, mhsScore(row), f.result)) return false;
      if (f.risk && getProctoringRisk(row).level !== f.risk) return false;
      if (!matchesDateRange(row.completed_at, f.completedFrom, f.completedTo)) return false;
      return true;
    });
  }, [rows, search.appliedQuery, search.filters]);

  /* Filter options come from the loaded rows, so every choice matches at
     least one candidate. */
  const jobOptions = useMemo(() => jobFilterOptions(rows, (r) => r._job_id, (r) => r._config_title), [rows]);
  const jobVersionOptions = useMemo(() => versionFilterOptions(rows, (r) => r._job_version), [rows]);
  const interviewVersionOptions = useMemo(() => versionFilterOptions(rows, (r) => r._interview_version), [rows]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pageRows = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);

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

  const [columns, setColumns] = useState(() => CANDIDATE_COLUMNS.map((c) => ({ id: c.id as string, label: c.label as string, enabled: true })));
  const [showColumnModal, setShowColumnModal] = useState(false);
  const enabledColumns = columns.filter((c) => c.enabled);
  const col = (id: CandidateColumnId) => columns.some((c) => c.id === id && c.enabled);

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
  const allOnPageSelected = pageRows.length > 0 && pageRows.every((row) => selectedKeys.has(rowKey(row)));
  const toggleAllOnPage = () =>
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) pageRows.forEach((row) => next.delete(rowKey(row)));
      else pageRows.forEach((row) => next.add(rowKey(row)));
      return next;
    });
  const selectedRows = rows.filter((row) => selectedKeys.has(rowKey(row)));

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<'csv' | 'xls'>('csv');

  // One export cell per column; Timeline splits into its three parts so each
  // lands in its own spreadsheet column.
  const exportHeaders = (): string[] =>
    enabledColumns.flatMap((c) => (c.id === 'timeline' ? ['Started At', 'Completed At', 'Duration'] : [c.label]));
  const exportRow = (row: CandidateSessionRow): string[] =>
    enabledColumns.flatMap((c): string[] => {
      switch (c.id) {
        case 'cid': return [row.candidate_cid || ''];
        case 'candidate': return [row.candidate_name || ''];
        case 'email': return [row.candidate_email || ''];
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

  // Exports the selected rows when any are picked; otherwise every row
  // matching the current search — all pages, not just this one.
  const handleExport = () => {
    const exportRows = selectedRows.length > 0 ? selectedRows : filteredRows;
    if (exportRows.length === 0) {
      toast.warning('No candidates to export');
      return;
    }
    const headers = exportHeaders();
    const data = exportRows.map(exportRow);
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
    toast.success(`Exported ${exportRows.length} records to ${exportFormat === 'csv' ? 'CSV' : 'Excel'}`);
    setShowExportModal(false);
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
  const openSession = (row: CandidateSessionRow) => {
    try {
      /* Every candidate in the current (filtered, sorted) list — across all
         pages and interviews — each carrying its own interview, so Previous /
         Next walk the Candidate Results list rather than stopping at the rows
         of one interview on one page (which read "1 / 1"). */
      const navList = filteredRows.map((r) => ({ id: r.id, configId: r._config_id }));
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

  if (isLoading) {
    return (
      <div>
        {/* Toolbar mirror */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <Skeleton className="h-10 w-full max-w-md rounded-lg" />
          <div className="flex gap-2">
            <Skeleton className="h-10 w-32 rounded-lg" />
            <Skeleton className="h-10 w-24 rounded-lg" />
          </div>
        </div>

        {/* Table mirror — same columns/order as the real candidate results table */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 overflow-hidden">
          <div className="overflow-x-auto tf-table-shell">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700">
                <tr>
                  <th className="text-left px-4 py-3 whitespace-nowrap"><Skeleton className="h-3 w-20" /></th>
                  <th className="text-left px-4 py-3"><Skeleton className="h-3 w-20" /></th>
                  <th className="text-left px-4 py-3"><Skeleton className="h-3 w-20" /></th>
                  <th className="text-left px-4 py-3"><Skeleton className="h-3 w-20" /></th>
                  <th className="text-left px-4 py-3"><Skeleton className="h-3 w-20" /></th>
                  <th className="text-left px-4 py-3"><Skeleton className="h-3 w-20" /></th>
                  <th className="text-left px-4 py-3"><Skeleton className="h-3 w-20" /></th>
                  <th className="text-left px-4 py-3"><Skeleton className="h-3 w-20" /></th>
                  <th className="text-left px-4 py-3 whitespace-nowrap"><Skeleton className="h-3 w-20" /></th>
                  <th className="text-left px-4 py-3 whitespace-nowrap"><Skeleton className="h-3 w-20" /></th>
                  <th className="text-left px-4 py-3 whitespace-nowrap"><Skeleton className="h-3 w-20" /></th>
                  <th className="text-left px-4 py-3 whitespace-nowrap"><Skeleton className="h-3 w-20" /></th>
                  <th className="text-right px-4 py-3 tf-sticky-col"><Skeleton className="h-3 w-20 ml-auto" /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                {Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-14 rounded-md" /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Skeleton className="w-7 h-7 rounded-full" />
                        <Skeleton className="h-4 w-28" />
                      </div>
                    </td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-16 rounded" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-28" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-9 rounded-md" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-9 rounded-md" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-20 rounded-full" /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-1.5 w-16 rounded-full" />
                        <Skeleton className="h-4 w-8" />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <Skeleton className="h-3 w-28" />
                        <Skeleton className="h-3 w-28" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    </td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-16 rounded-full" /></td>
                    <td className="px-4 py-3 text-right"><Skeleton className="h-7 w-24 rounded-md ml-auto" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-destructive mb-3">{error}</p>
        <Button variant="primary" size="md" onClick={loadAllSessions}>
          Retry
        </Button>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <ListEmptyState
        icon={Users}
        isNarrowed={false}
        entityLabel="candidate result"
        emptyTitle="No candidate results yet"
        emptyDescription="Results appear here once a candidate completes an AI interview."
      />
    );
  }

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
          <select
            value={search.filters.result}
            onChange={(e) => search.setFilter('result', e.target.value)}
            aria-label="Result"
            className="px-3 py-2 text-sm border border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white dark:bg-slate-900 text-black dark:text-slate-100"
          >
            <option value="">All Results</option>
            {RESULT_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        }
        filterPanel={
          /* One filter per column that has a fixed set of values; name,
             email and CID are what the search box is for. Picks are drafts
             until Done, as on the Activity Logs tab. */
          <div className="rounded-xl border border-gray-100 dark:border-slate-700/60 bg-slate-50/60 dark:bg-slate-800/30 p-3 sm:p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
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
        countBadge={
          <ListCountBadge
            filtered={filteredRows.length}
            total={rows.length}
            noun="result"
          />
        }
      >
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setShowColumnModal(true)}
          icon={<SlidersHorizontal className="w-4 h-4" />}
          className="hidden sm:flex whitespace-nowrap !h-[38px] !text-sm"
        >
          <span className="hidden md:inline">Customize Columns</span>
          <span className="md:hidden">Columns</span>
        </Button>
        {/* Download PDF acts on the ticked rows only (disabled until one is
            selected); Export is always on — the ticked rows, else every
            filtered row. */}
        <DownloadPdfsButton
          getRows={() => selectedRows}
          selectedCount={selectedRows.length}
          zipName={`AI_Interview_Candidate_Reports_${new Date().toISOString().slice(0, 10)}.zip`}
        />
        <Button
          variant="primary"
          size="sm"
          onClick={() => setShowExportModal(true)}
          icon={<FileDown className="w-4 h-4" />}
          className="whitespace-nowrap !h-[38px] !text-sm"
        >
          Export{selectedRows.length > 0 ? ` (${selectedRows.length})` : ''}
        </Button>
        <ListViewToggle value={displayMode} onChange={setDisplayMode} />
      </ListToolbar>
    </>
  );

  return (
    <div>
      {toolbarSlot ? createPortal(toolbar, toolbarSlot) : toolbar}

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 overflow-hidden">
        {filteredRows.length === 0 ? (
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
              {pageRows.map((row) => {
                const risk = getProctoringRisk(row);
                const isSelected = selectedKeys.has(rowKey(row));
                return (
                  <button
                    key={`${row._config_id}-${row.id}`}
                    onClick={() => openSession(row)}
                    className={`group relative text-left bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 hover:shadow-md hover:border-brand-blue/20 hover:-translate-y-0.5 transition-all p-4 flex flex-col gap-3 ${gridCardSelectedClass(isSelected)}`}
                  >
                    <GridCardSelect
                      selected={isSelected}
                      onToggle={() => toggleSelected(row)}
                      label={row.candidate_name || 'candidate'}
                      selectionActive={selectedKeys.size > 0}
                    />
                    <div className="flex items-start gap-2.5">
                      <div className="w-9 h-9 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/20 flex items-center justify-center text-brand-blue font-semibold text-sm flex-shrink-0">
                        {(row.candidate_name || 'U')[0].toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900 dark:text-slate-50 truncate">
                          {row.candidate_name || 'Unknown'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-slate-400 truncate">
                          {row.candidate_email || '—'}
                        </p>
                      </div>
                      {row.candidate_cid && (
                        <span className="text-2xs font-mono font-medium text-brand-blue bg-brand-blue/5 ring-1 ring-brand-blue/20 px-1.5 py-0.5 rounded shrink-0">
                          {row.candidate_cid}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-gray-600 dark:text-slate-400 truncate" title={row._config_title}>
                      {row._config_title}
                    </p>

                    {col('inviteSource') && inviteSourceLabel(row) && (
                      <p className="text-xs text-gray-600 dark:text-slate-400">
                        <InviteSourceValue inv={row} iconClassName="w-3 h-3" />
                      </p>
                    )}

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant={getStatusVariant(row.status)}>{getStatusLabel(row.status)}</Badge>
                      {row.status === 'in_progress' && (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 bg-destructive text-white text-2xs font-bold rounded-full">
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

                    <div
                      onClick={(e) => { e.stopPropagation(); openSession(row); }}
                      title="View Details"
                      className="inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-brand-blue bg-brand-blue/5 hover:bg-brand-blue/10 ring-1 ring-brand-blue/20 rounded-lg transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">View Details</span>
                    </div>
                  </button>
                );
              })}
            </div>
            {filteredRows.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/50">
                <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-slate-400">
                  {/* Show N per page — back to page 1 on change. */}
                  <label className="inline-flex items-center gap-2">
                    <span>Show</span>
                    <select
                      value={pageSize}
                      onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                      aria-label="Rows per page"
                      className="h-8 px-2 text-sm border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-blue/40"
                    >
                      {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <span>per page</span>
                  </label>
                  <span>Showing {((safePage - 1) * pageSize) + 1}–{Math.min(safePage * pageSize, filteredRows.length)} of {filteredRows.length}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-gray-500 dark:text-slate-400 whitespace-nowrap">Go to</span>
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
                      className="w-14 h-8 px-2 text-sm text-center border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
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
            <div className="overflow-x-auto tf-table-shell">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700">
                  <tr>
<th className="text-left px-4 py-3 w-12 align-middle tf-sticky-col-left">
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
                    {col('cid') && <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-slate-400 text-xs uppercase tracking-wide whitespace-nowrap">CID</th>}
                    {col('candidate') && <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-slate-400 text-xs uppercase tracking-wide">Candidate</th>}
                    {col('email') && <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-slate-400 text-xs uppercase tracking-wide">Email</th>}
                    {col('timeline') && <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-slate-400 text-xs uppercase tracking-wide whitespace-nowrap">Timeline</th>}
                    {col('status') && <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-slate-400 text-xs uppercase tracking-wide">Status</th>}
                    {col('score') && <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-slate-400 text-xs uppercase tracking-wide whitespace-nowrap">Score</th>}
                    {col('result') && <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-slate-400 text-xs uppercase tracking-wide whitespace-nowrap">Result</th>}
                    {col('proctoring') && <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-slate-400 text-xs uppercase tracking-wide whitespace-nowrap">Proctoring Risk</th>}
                    {col('inviteSource') && <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-slate-400 text-xs uppercase tracking-wide whitespace-nowrap">Invite Source</th>}
                    {col('jobId') && <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-slate-400 text-xs uppercase tracking-wide whitespace-nowrap">Job ID</th>}
                    {col('jobTitle') && <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-slate-400 text-xs uppercase tracking-wide">Job Title</th>}
                    {col('jobVersion') && <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-slate-400 text-xs uppercase tracking-wide whitespace-nowrap">Job Version</th>}
                    {col('interviewVersion') && <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-slate-400 text-xs uppercase tracking-wide whitespace-nowrap">Interview Version</th>}
                    <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-slate-400 text-xs uppercase tracking-wide tf-sticky-col">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                  {pageRows.map((row) => {
                    const risk = getProctoringRisk(row);
                    return (
                      <tr
                        key={`${row._config_id}-${row.id}`}
                        onClick={() => openSession(row)}
                        className="hover:bg-brand-blue/5 transition-colors cursor-pointer"
                      >
<td className="px-4 py-3 w-12 align-middle tf-sticky-col-left" onClick={(e) => e.stopPropagation()}>
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
                        {col('cid') && (
                          <td className="px-4 py-3 whitespace-nowrap">
                            {row.candidate_cid ? (
                              <span className="text-xs font-mono font-medium text-brand-blue bg-brand-blue/5 ring-1 ring-brand-blue/20 px-2 py-1 rounded">
                                {row.candidate_cid}
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                        )}
                        {col('candidate') && (
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/20 flex items-center justify-center text-brand-blue font-semibold text-xs flex-shrink-0">
                                {(row.candidate_name || 'U')[0].toUpperCase()}
                              </div>
                              <span className="font-medium text-gray-900 dark:text-slate-50 truncate max-w-[160px]">
                                {row.candidate_name || 'Unknown'}
                              </span>
                            </div>
                          </td>
                        )}
                        {col('email') && (
                          <td className="px-4 py-3">
                            <span className="text-gray-600 dark:text-slate-400 truncate max-w-[180px] block">
                              {row.candidate_email || '—'}
                            </span>
                          </td>
                        )}
                        {col('timeline') && (
                          <td className="px-4 py-3 whitespace-nowrap text-gray-600 dark:text-slate-400">
                            <TimelineStamps startedAt={row.started_at} completedAt={row.completed_at} format={formatIST} duration={formatDuration(row)} />
                          </td>
                        )}
                        {col('status') && (
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge variant={getStatusVariant(row.status)}>{getStatusLabel(row.status)}</Badge>
                              {row.status === 'in_progress' && (
                                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-destructive text-white text-2xs font-bold rounded-full">
                                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                  LIVE
                                </span>
                              )}
                            </div>
                          </td>
                        )}
                        {col('score') && (
                          <td className="px-4 py-3 whitespace-nowrap">
                            {mhsScore(row) != null ? (
                              <span className={`${SCORE_CELL_TEXT} ${mhsScore(row)! >= 60 ? 'text-success' : 'text-destructive'}`}>
                                {mhsScore(row)}%
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                        )}
                        {col('result') && (
                          <td className="px-4 py-3 whitespace-nowrap">
                            {sessionResult(row) ? <PassFailBadge result={sessionResult(row)!} /> : <span className="text-gray-400">—</span>}
                          </td>
                        )}
                        {col('proctoring') && (
                          <td className="px-4 py-3 whitespace-nowrap">
                            {(row.status === 'completed' || row.status === 'terminated') ? (
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${risk.badge}`}>
                                {risk.level}
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                        )}
                        {col('inviteSource') && (
                          <td className="px-4 py-3 whitespace-nowrap text-gray-700 dark:text-slate-300">
                            {inviteSourceLabel(row)
                              ? <InviteSourceValue inv={row} iconClassName="w-3.5 h-3.5" />
                              : <span className="text-gray-400">—</span>}
                          </td>
                        )}
                        {col('jobId') && (
                          <td className="px-4 py-3 whitespace-nowrap">
                            {row._job_id ? (
                              <JobIdBadge>{row._job_id}</JobIdBadge>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                        )}
                        {col('jobTitle') && (
                          <td className="px-4 py-3">
                            <span className="text-gray-700 dark:text-slate-300 truncate max-w-[180px] block">
                              {row._config_title}
                            </span>
                          </td>
                        )}
                        {col('jobVersion') && (
                          <td className="px-4 py-3 whitespace-nowrap">
                            <VersionPill kind="job" version={row._job_version} />
                          </td>
                        )}
                        {col('interviewVersion') && (
                          <td className="px-4 py-3 whitespace-nowrap">
                            <VersionPill kind="interview" version={row._interview_version} />
                          </td>
                        )}
                        <td className="px-4 py-3 text-right whitespace-nowrap tf-sticky-col">
                          <ResultRowActions session={row} onView={() => openSession(row)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filteredRows.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/50">
                <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-slate-400">
                  {/* Show N per page — back to page 1 on change. */}
                  <label className="inline-flex items-center gap-2">
                    <span>Show</span>
                    <select
                      value={pageSize}
                      onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                      aria-label="Rows per page"
                      className="h-8 px-2 text-sm border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-blue/40"
                    >
                      {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <span>per page</span>
                  </label>
                  <span>Showing {((safePage - 1) * pageSize) + 1}–{Math.min(safePage * pageSize, filteredRows.length)} of {filteredRows.length}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-gray-500 dark:text-slate-400 whitespace-nowrap">Go to</span>
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
                      className="w-14 h-8 px-2 text-sm text-center border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
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

    {showColumnModal && (
      <ColumnCustomizationModal
        columns={columns}
        onClose={() => setShowColumnModal(false)}
        onApply={(ids) => setColumns((prev) => prev.map((c) => ({ ...c, enabled: ids.includes(c.id) })))}
      />
    )}

    {/* Export format picker — same modal as the resume scoring All Resumes tab. */}
    {showExportModal && (
      <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
        <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-[95vw] sm:max-w-md max-h-[calc(100dvh-2rem)] flex flex-col">
          <div className="flex items-start justify-between gap-3 p-5 border-b border-gray-200 shrink-0">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                <FileDown className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Export Candidate Results</h3>
                <p className="text-sm text-gray-500 mt-1 flex items-center gap-1.5">
                  {selectedRows.length > 0 ? `${selectedRows.length} selected records` : `${filteredRows.length} records`}
                  <span className="w-1 h-1 rounded-full bg-blue-500" />
                  {enabledColumns.length} columns
                </p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setShowExportModal(false)} className="px-2 flex-shrink-0" aria-label="Close">
              <X className="w-5 h-5" />
            </Button>
          </div>

          <div className="p-5 overflow-y-auto flex-1">
            <p className="text-sm font-bold text-gray-900 mb-3">Choose export format</p>
            <div className="space-y-3">
              {([
                { key: 'csv', title: 'CSV Format', desc: 'Compatible with Excel, Google Sheets, and most spreadsheet apps.', Icon: FileText, iconWrap: 'bg-success-subtle', iconColor: 'text-success' },
                { key: 'xls', title: 'Excel Format (.xls)', desc: 'Native Excel format with formatting and styling.', Icon: FileSpreadsheet, iconWrap: 'bg-blue-100', iconColor: 'text-blue-700' },
              ] as const).map(({ key, title, desc, Icon, iconWrap, iconColor }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setExportFormat(key)}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                    exportFormat === key ? 'border-blue-500 bg-blue-50/60' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${iconWrap}`}>
                    <Icon className={`w-6 h-6 ${iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-gray-900">{title}</div>
                    <div className="text-sm text-gray-500">{desc}</div>
                  </div>
                  <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${exportFormat === key ? 'border-blue-600' : 'border-gray-300'}`}>
                    {exportFormat === key && <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-4 p-4 bg-blue-50/60 rounded-xl flex items-start gap-3">
              <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-gray-600">
                <span className="block font-bold text-blue-700 mb-0.5">Columns included</span>
                {enabledColumns.map((c) => c.label).join(', ')}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200 shrink-0">
            <Button
              variant="primary"
              size="md"
              onClick={handleExport}
              disabled={enabledColumns.length === 0}
              icon={<Download className="w-4 h-4" />}
            >
              Export
            </Button>
          </div>
        </div>
      </div>
    )}
    </div>
  );
}
