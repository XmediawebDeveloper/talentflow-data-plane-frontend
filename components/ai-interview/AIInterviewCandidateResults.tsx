'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useListSearch } from '@/lib/hooks/useListSearch';
import ListEmptyState from '@/components/ui/list-empty-state';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Eye, Users, CheckCircle, XCircle } from 'lucide-react';
import ListToolbar from '@/components/ui/list-toolbar';
import ListCountBadge from '@/components/ui/list-count-badge';
import ListViewToggle, { ListDisplayMode } from '@/components/ui/list-view-toggle';
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

const PAGE_SIZE = 15;

/** 60% — the same pass mark the invite tracker's own Score column uses
 *  (see AIInterviewInviteTable's ScoreCell). */
const PASS_MARK = 60;

function PassFailBadge({ score }: { score: number }) {
  const passed = score >= PASS_MARK;
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
  const [displayMode, setDisplayMode] = useState<ListDisplayMode>('list');

  // Search state lives in the shared hook: typed vs applied query, plus a
  // reset. No status filter — the fetch itself is scoped to Completed only
  // (see loadAllSessions), so there is nothing left to filter by. `onChange`
  // returns to page 1 — narrowing from page 3 would otherwise strand the
  // user on a page that no longer exists.
  const search = useListSearch({
    initialFilters: {},
    onChange: () => setCurrentPage(1),
  });

  /**
   * One request per config, fanned out in parallel. There is no cross-config
   * sessions endpoint, and the per-interview view's endpoint is scoped to a
   * config id — so this is the aggregation the Assessments tab does too. A
   * config whose sessions fail to load contributes nothing rather than sinking
   * the whole tab.
   *
   * `status: 'completed'` — Candidate Results only has a result to show once
   * an interview is actually finished, so the fetch itself is scoped to
   * that, rather than pulling every invite/in-progress/expired row across
   * every config just to filter them back out client-side.
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

      const perConfig = await Promise.all(
        configs.map(async (config) => {
          try {
            const result = await aiInterviewService.getConfigInvitations(config.id, {
              page: 1,
              page_size: 1000,
              compact: true,
              status: 'completed',
            });
            return (result.items ?? []).map((session): CandidateSessionRow => ({
              ...session,
              _config_id: config.id,
              // jd_title first, matching how the interview cards on this page
              // are labelled, so the column reads the same as the list above it.
              _config_title: config.jd_title || config.position || 'Untitled',
              _job_id: config.jd_short_id || '',
              _job_version: config.jd_version ?? 1,
              _interview_version: ordinalByConfigId.get(config.id) ?? 1,
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

  // Filtering is client-side: the rows are already all in memory, and the
  // per-config endpoint can't filter across configs anyway. Keyed off the
  // APPLIED query so the list doesn't rebuild on every keystroke.
  const filteredRows = useMemo(() => {
    const query = search.appliedQuery.trim().toLowerCase();
    if (!query) return rows;

    return rows.filter((row) =>
      [row.candidate_name, row.candidate_email, row.candidate_cid, row._config_title, row._job_id]
        .some((field) => (field || '').toLowerCase().includes(query)),
    );
  }, [rows, search.appliedQuery]);

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
                  <th className="text-left px-4 py-3"><Skeleton className="h-3 w-20" /></th>
                  <th className="text-left px-4 py-3"><Skeleton className="h-3 w-20" /></th>
                  <th className="text-left px-4 py-3"><Skeleton className="h-3 w-20" /></th>
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
      {/* Same heading treatment as every other tab's — title + count, right
          above the search/filter bar. */}
      <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50 tracking-tight mb-3">
        Candidate Results ({rows.length})
      </h2>

      {/* Search + Filter bar — same toolbar as the per-interview results view. */}
      <ListToolbar
        searchValue={search.query}
        onSearchChange={search.setQuery}
        // The hook debounces into `appliedQuery`, so the toolbar passes
        // keystrokes straight through.
        searchDebounceMs={0}
        searchPlaceholder="Search by name, email, CID, or interview..."
        activeFilterCount={search.activeFilterCount}
        filtersApplied={search.filtersApplied}
        onClearFilters={search.reset}
        countBadge={
          <ListCountBadge
            filtered={filteredRows.length}
            total={rows.length}
            noun="result"
          />
        }
      >
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
                        <span className="text-2xs font-mono font-medium text-brand-blue bg-brand-blue/5 ring-1 ring-brand-blue/20 px-1.5 py-0.5 rounded shrink-0">
                          {row.candidate_cid}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-gray-600 dark:text-slate-400 truncate" title={row._config_title}>
                      {row._config_title}
                    </p>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant={getStatusVariant(row.status)}>{getStatusLabel(row.status)}</Badge>
                      {row.status === 'in_progress' && (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 bg-destructive text-white text-2xs font-bold rounded-full">
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
                      <div className="flex items-center gap-1.5">
                        <span className={`font-medium text-xs ${
                          row.score >= 70 ? 'text-success' :
                          row.score >= 50 ? 'text-brand-orange-deep' : 'text-destructive'
                        }`}>
                          {Math.round(row.score)}%
                        </span>
                        <PassFailBadge score={row.score} />
                      </div>
                    )}

                    <div className="flex items-center justify-between text-xs text-gray-500 dark:text-slate-500 pt-2 border-t border-gray-100 dark:border-slate-800">
                      <span>{formatDuration(row)}</span>
                      <span>{row.completed_at ? formatIST(row.completed_at) : row.started_at ? formatIST(row.started_at) : '—'}</span>
                    </div>

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
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-slate-400 text-xs uppercase tracking-wide whitespace-nowrap">Job ID</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-slate-400 text-xs uppercase tracking-wide">Job Title</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-slate-400 text-xs uppercase tracking-wide whitespace-nowrap">Job Version</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-slate-400 text-xs uppercase tracking-wide whitespace-nowrap">Interview Version</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-slate-400 text-xs uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-slate-400 text-xs uppercase tracking-wide whitespace-nowrap">Score</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-slate-400 text-xs uppercase tracking-wide whitespace-nowrap">Timeline</th>
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
                        <td className="px-4 py-3 whitespace-nowrap">
                          {row._job_id ? (
                            <JobIdBadge>{row._job_id}</JobIdBadge>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-gray-700 dark:text-slate-300 truncate max-w-[180px] block">
                            {row._config_title}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <VersionPill kind="job" version={row._job_version} />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <VersionPill kind="interview" version={row._interview_version} />
                        </td>
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
                        <td className="px-4 py-3 whitespace-nowrap">
                          {row.score != null ? (
                            <div className="flex items-center gap-1.5">
                              <span className={`font-medium text-xs ${
                                row.score >= 70 ? 'text-success' :
                                row.score >= 50 ? 'text-brand-orange-deep' : 'text-destructive'
                              }`}>
                                {Math.round(row.score)}%
                              </span>
                              <PassFailBadge score={row.score} />
                            </div>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-600 dark:text-slate-400">
                          <div className="flex flex-col gap-0.5 text-xs">
                            <span><span className="text-gray-400 dark:text-slate-500">Started at:</span> {row.started_at ? formatIST(row.started_at) : '—'}</span>
                            <span><span className="text-gray-400 dark:text-slate-500">Completed at:</span> {row.completed_at ? formatIST(row.completed_at) : '—'}</span>
                            <span><span className="text-gray-400 dark:text-slate-500">Duration:</span> {formatDuration(row)}</span>
                          </div>
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
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); openSession(row); }}
                            icon={<Eye className="w-3.5 h-3.5" />}
                            title="View Details"
                            aria-label="View Details"
                          >
                            <span className="hidden sm:inline">View Details</span>
                          </Button>
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
