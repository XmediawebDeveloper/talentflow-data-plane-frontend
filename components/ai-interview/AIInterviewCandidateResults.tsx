'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useListSearch } from '@/lib/hooks/useListSearch';
import ListEmptyState from '@/components/ui/list-empty-state';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Eye, Users } from 'lucide-react';
import ListToolbar from '@/components/ui/list-toolbar';
import ListCountBadge from '@/components/ui/list-count-badge';
import ListViewToggle, { ListDisplayMode } from '@/components/ui/list-view-toggle';
import { Skeleton } from '@/components/ui/skeleton';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import type { AIInterviewResponse } from '@/lib/services/aiInterviewService';
import { formatIST } from '@/lib/utils/dateUtils';
import {
  getStatusBadge,
  getStatusLabel,
  getStatusIcon,
  getProctoringRisk,
  formatDuration,
} from './AIInterviewResults';

/**
 * Candidate Results — every candidate session across every AI interview, in one
 * table. The AI Interview counterpart of the Assessments page's tab of the same
 * name, and the same table the per-interview results view shows, widened with
 * an Interview column because rows here span configs.
 *
 * Row rendering imports the per-interview view's helpers rather than copying
 * them, so a status colour or risk rule only ever has to change in one place.
 */

/** A session plus the interview it belongs to — rows here span configs. */
type CandidateSessionRow = AIInterviewResponse & {
  _config_id: string;
  _config_title: string;
};

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'invited', label: 'Invited' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'terminated', label: 'Terminated' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled', label: 'Cancelled' },
];

const PAGE_SIZE = 15;

export default function AIInterviewCandidateResults() {
  const router = useRouter();

  const [rows, setRows] = useState<CandidateSessionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [displayMode, setDisplayMode] = useState<ListDisplayMode>('list');

  // Search + filter state lives in the shared hook: typed vs applied query,
  // staged vs committed filters, the active count, and a reset that clears
  // everything. `onChange` returns to page 1 — narrowing from page 3 would
  // otherwise strand the user on a page that no longer exists.
  const search = useListSearch({
    initialFilters: { status: 'all', scoreMin: '', scoreMax: '' },
    onChange: () => setCurrentPage(1),
    // Min and max are one score range, so they read as a single filter.
    countFilters: (filters) =>
      (filters.status !== 'all' ? 1 : 0) + (filters.scoreMin || filters.scoreMax ? 1 : 0),
  });
  const { status: statusFilter, scoreMin, scoreMax } = search.filters;

  /**
   * One request per config, fanned out in parallel. There is no cross-config
   * sessions endpoint, and the per-interview view's endpoint is scoped to a
   * config id — so this is the aggregation the Assessments tab does too. A
   * config whose sessions fail to load contributes nothing rather than sinking
   * the whole tab.
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

      const perConfig = await Promise.all(
        configs.map(async (config) => {
          try {
            const result = await aiInterviewService.getConfigInvitations(config.id, {
              page: 1,
              page_size: 1000,
              compact: true,
            });
            return (result.items ?? []).map((session): CandidateSessionRow => ({
              ...session,
              _config_id: config.id,
              // jd_title first, matching how the interview cards on this page
              // are labelled, so the column reads the same as the list above it.
              _config_title: config.jd_title || config.position || 'Untitled',
            }));
          } catch {
            return [];
          }
        })
      );

      // Newest first — completed sessions lead, then whatever started or was
      // invited most recently.
      const merged = perConfig.flat().sort((a, b) => {
        const ta = new Date(a.completed_at || a.started_at || a.created_at || 0).getTime();
        const tb = new Date(b.completed_at || b.started_at || b.created_at || 0).getTime();
        return tb - ta;
      });

      setRows(merged);
      setCurrentPage(1);
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

  // Filtering is client-side: the rows are already all in memory, and the
  // per-config endpoint can't filter across configs anyway. Keyed off the
  // APPLIED query so the list doesn't rebuild on every keystroke.
  const filteredRows = useMemo(() => {
    const query = search.appliedQuery.trim().toLowerCase();
    const min = scoreMin !== '' ? parseFloat(scoreMin) : null;
    const max = scoreMax !== '' ? parseFloat(scoreMax) : null;

    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;

      if (min !== null || max !== null) {
        if (row.score == null) return false;
        if (min !== null && row.score < min) return false;
        if (max !== null && row.score > max) return false;
      }

      if (!query) return true;
      return [row.candidate_name, row.candidate_email, row.candidate_cid, row._config_title]
        .some((field) => (field || '').toLowerCase().includes(query));
    });
  }, [rows, search.appliedQuery, statusFilter, scoreMin, scoreMax]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageRows = filteredRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

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
      const navList = pageRows
        .filter((r) => r._config_id === row._config_id)
        .map((r) => ({ id: r.id }));
      sessionStorage.setItem('aiInterviewResultNavList', JSON.stringify(navList));
    } catch { /* ignore storage failures */ }
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
                  <th className="text-left px-4 py-3 whitespace-nowrap"><Skeleton className="h-3 w-20" /></th>
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
                    <td className="px-4 py-3"><Skeleton className="h-4 w-28" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-20 rounded-full" /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-1.5 w-16 rounded-full" />
                        <Skeleton className="h-4 w-8" />
                      </div>
                    </td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-14" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
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
        <p className="text-sm text-red-600 mb-3">{error}</p>
        <button
          onClick={loadAllSessions}
          className="px-4 py-2 text-sm bg-brand-blue text-white rounded-lg hover:bg-brand-blue-2 transition-colors"
        >
          Retry
        </button>
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
        emptyDescription="Results appear here once candidates are invited to an AI interview."
      />
    );
  }

  return (
    <div>
      {/* Search + Filter bar — same toolbar as the per-interview results view. */}
      <ListToolbar
        searchValue={search.query}
        onSearchChange={search.setQuery}
        // The hook debounces into `appliedQuery`, so the toolbar passes
        // keystrokes straight through.
        searchDebounceMs={0}
        searchPlaceholder="Search by name, email, CID, or interview..."
        onToggleFilters={() => setShowFilters((v) => !v)}
        filtersOpen={showFilters}
        activeFilterCount={search.activeFilterCount}
        filtersApplied={search.filtersApplied}
        onClearFilters={search.reset}
        filterPanel={
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1.5">Score Range (%)</label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="number"
                placeholder="Min"
                min={0}
                max={100}
                value={search.draftFilters.scoreMin}
                onChange={(e) => search.setDraftFilter('scoreMin', e.target.value)}
                className="w-24 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 bg-white text-black"
              />
              <span className="text-gray-400">–</span>
              <input
                type="number"
                placeholder="Max"
                min={0}
                max={100}
                value={search.draftFilters.scoreMax}
                onChange={(e) => search.setDraftFilter('scoreMax', e.target.value)}
                className="w-24 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 bg-white text-black"
              />
              <button
                type="button"
                onClick={() => { search.applyFilters(); setShowFilters(false); }}
                className="ml-auto px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors"
              >
                Done
              </button>
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
        <select
          value={statusFilter}
          onChange={(e) => search.setFilter('status', e.target.value)}
          aria-label="Interview status"
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white text-black"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <ListViewToggle value={displayMode} onChange={setDisplayMode} />
      </ListToolbar>

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
                return (
                  <button
                    key={`${row._config_id}-${row.id}`}
                    onClick={() => openSession(row)}
                    className="text-left bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 hover:shadow-md hover:border-brand-blue/20 hover:-translate-y-0.5 transition-all p-4 flex flex-col gap-3"
                  >
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
                        <span className="text-[10px] font-mono font-medium text-brand-blue bg-brand-blue/5 ring-1 ring-brand-blue/20 px-1.5 py-0.5 rounded shrink-0">
                          {row.candidate_cid}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-gray-600 dark:text-slate-400 truncate" title={row._config_title}>
                      {row._config_title}
                    </p>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {getStatusIcon(row.status)}
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(row.status)}`}>
                        {getStatusLabel(row.status)}
                      </span>
                      {row.status === 'in_progress' && (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                          LIVE
                        </span>
                      )}
                      {row.status === 'completed' && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${risk.badge}`}>
                          {risk.level} risk
                        </span>
                      )}
                    </div>

                    {row.score != null && (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 dark:bg-slate-700 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full ${
                              row.score >= 70 ? 'bg-green-500' :
                              row.score >= 50 ? 'bg-brand-orange' : 'bg-red-500'
                            }`}
                            style={{ width: `${Math.min(100, row.score)}%` }}
                          />
                        </div>
                        <span className={`font-medium text-xs shrink-0 ${
                          row.score >= 70 ? 'text-green-600' :
                          row.score >= 50 ? 'text-brand-orange-deep' : 'text-red-600'
                        }`}>
                          {Math.round(row.score)}%
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-xs text-gray-500 dark:text-slate-500 pt-2 border-t border-gray-100 dark:border-slate-800">
                      <span>{formatDuration(row)}</span>
                      <span>{row.completed_at ? formatIST(row.completed_at) : row.started_at ? formatIST(row.started_at) : '—'}</span>
                    </div>

                    <div
                      onClick={(e) => { e.stopPropagation(); openSession(row); }}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-blue bg-brand-blue/5 hover:bg-brand-blue/10 ring-1 ring-brand-blue/20 rounded-lg transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      View Details
                    </div>
                  </button>
                );
              })}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/50">
                <div className="text-sm text-gray-500 dark:text-slate-400">
                  Showing {((safePage - 1) * PAGE_SIZE) + 1}–{Math.min(safePage * PAGE_SIZE, filteredRows.length)} of {filteredRows.length}
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
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-slate-400 text-xs uppercase tracking-wide whitespace-nowrap">CID</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-slate-400 text-xs uppercase tracking-wide">Candidate</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-slate-400 text-xs uppercase tracking-wide">Email</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-slate-400 text-xs uppercase tracking-wide">Interview</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-slate-400 text-xs uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-slate-400 text-xs uppercase tracking-wide whitespace-nowrap">Score</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-slate-400 text-xs uppercase tracking-wide whitespace-nowrap">Duration</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-slate-400 text-xs uppercase tracking-wide whitespace-nowrap">Started At</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-slate-400 text-xs uppercase tracking-wide whitespace-nowrap">Completed At</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-slate-400 text-xs uppercase tracking-wide whitespace-nowrap">Proctoring Risk</th>
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
                        <td className="px-4 py-3 whitespace-nowrap">
                          {row.candidate_cid ? (
                            <span className="text-xs font-mono font-medium text-brand-blue bg-brand-blue/5 ring-1 ring-brand-blue/20 px-2 py-1 rounded">
                              {row.candidate_cid}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
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
                        <td className="px-4 py-3">
                          <span className="text-gray-600 dark:text-slate-400 truncate max-w-[180px] block">
                            {row.candidate_email || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-gray-700 dark:text-slate-300 truncate max-w-[180px] block">
                            {row._config_title}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {getStatusIcon(row.status)}
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(row.status)}`}>
                              {getStatusLabel(row.status)}
                            </span>
                            {row.status === 'in_progress' && (
                              <span className="flex items-center gap-1 px-1.5 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full">
                                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                LIVE
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {row.score != null ? (
                            <div className="flex items-center gap-2">
                              <div className="w-16 bg-gray-200 dark:bg-slate-700 rounded-full h-1.5">
                                <div
                                  className={`h-1.5 rounded-full ${
                                    row.score >= 70 ? 'bg-green-500' :
                                    row.score >= 50 ? 'bg-brand-orange' : 'bg-red-500'
                                  }`}
                                  style={{ width: `${Math.min(100, row.score)}%` }}
                                />
                              </div>
                              <span className={`font-medium text-xs ${
                                row.score >= 70 ? 'text-green-600' :
                                row.score >= 50 ? 'text-brand-orange-deep' : 'text-red-600'
                              }`}>
                                {Math.round(row.score)}%
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-600 dark:text-slate-400">
                          {formatDuration(row)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-600 dark:text-slate-400">
                          {row.started_at ? formatIST(row.started_at) : '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-600 dark:text-slate-400">
                          {row.completed_at ? formatIST(row.completed_at) : '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {row.status === 'completed' ? (
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${risk.badge}`}>
                              {risk.level}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap tf-sticky-col">
                          <button
                            onClick={(e) => { e.stopPropagation(); openSession(row); }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-blue bg-brand-blue/5 hover:bg-brand-blue/10 ring-1 ring-brand-blue/20 rounded-lg transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            View Details
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/50">
                <div className="text-sm text-gray-500 dark:text-slate-400">
                  Showing {((safePage - 1) * PAGE_SIZE) + 1}–{Math.min(safePage * PAGE_SIZE, filteredRows.length)} of {filteredRows.length}
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
    </div>
  );
}
