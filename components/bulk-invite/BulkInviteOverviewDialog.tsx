'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Ban, CheckCircle2, ChevronLeft, ChevronRight, Clock, ClipboardList, Eye, FolderOpen, Loader2, RefreshCw, Search,
  Send, SkipForward, Video, X, XCircle,
} from 'lucide-react';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { Button } from '@/components/ui/button';
import { useBulkInviteActions } from './useBulkInviteActions';
import FilterSelect from '@/components/ui/filter-select';
import { VersionPill } from '@/components/assessments/AllAssessmentsTable';
import type { TrackedBulkInvite } from '@/contexts/BulkInviteProgressContext';
import {
  bulkInviteService, isBulkInviteActive, type BulkInviteItemStatus, type BulkInviteResultRow,
} from '@/lib/services/bulkInviteService';

/**
 * Every candidate of the invite widget's sends in ONE table — the invite
 * popup's "View", laid out like the Bulk Scoring progress popup: job header,
 * status chips, search / status / type filters, the candidate table and
 * pagination. Reads each send's results (GET /bulk-invites/{id}/results) and
 * merges them here; refreshes on its own while anything is still sending.
 */

type Row = BulkInviteResultRow & { job: TrackedBulkInvite };
type StatusFilter = 'all' | BulkInviteItemStatus;
type KindFilter = 'all' | 'assessment' | 'interview';

const PAGE_FETCH = 200;
const REFRESH_MS = 3000;

const STATUS: Record<BulkInviteItemStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  queued: { label: 'In queue', cls: 'bg-slate-50 text-gray-700 ring-gray-200', icon: <Clock className="w-3.5 h-3.5" /> },
  processing: { label: 'Sending', cls: 'bg-brand-blue/5 text-brand-blue ring-brand-blue/20', icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> },
  sent: { label: 'Sent successfully', cls: 'bg-success-subtle text-success ring-success/30', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  skipped: { label: 'Skipped', cls: 'bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/25', icon: <SkipForward className="w-3.5 h-3.5" /> },
  failed: { label: 'Failed', cls: 'bg-destructive-subtle text-destructive ring-destructive-line', icon: <XCircle className="w-3.5 h-3.5" /> },
  cancelled: { label: 'Cancelled', cls: 'bg-warning-subtle text-warning-strong ring-warning-line', icon: <Ban className="w-3.5 h-3.5" /> },
};

const SOURCE: Record<string, string> = {
  'talent-match': 'AI Talent Match',
  'score-resume': 'Resume Scoring',
  'my-resumes': 'My Resumes',
  'internal-db': 'Shared Database',
  extra: 'Added by email',
};

const versionOf = (j: TrackedBulkInvite) =>
  j.versionNumber ?? j.version_number ?? (Number(/version\s*(\d+)/i.exec(j.version_label ?? '')?.[1]) || undefined);

const dateParts = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return {
    day: d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase(),
  };
};

/** Every result row of one send (the endpoint pages; read them all). */
async function readAll(job: TrackedBulkInvite, signal: AbortSignal): Promise<Row[]> {
  const out: Row[] = [];
  for (let page = 1; page < 50; page += 1) {
    const res = await bulkInviteService.results(job.job_id, { page, page_size: PAGE_FETCH }, signal);
    out.push(...res.items.map((r) => ({ ...r, job })));
    if (out.length >= res.total || res.items.length === 0) break;
  }
  return out;
}

export default function BulkInviteOverviewDialog({ jobs, onClose }: { jobs: TrackedBulkInvite[]; onClose: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [kind, setKind] = useState<KindFilter>('all');
  const [perPage, setPerPage] = useState(10);
  const [page, setPage] = useState(1);

  const jobKey = jobs.map((j) => j.job_id).join(',');
  const anyActive = jobs.some(isBulkInviteActive);
  /* Cancel: the whole of every send still going (header), or one waiting
     candidate (row). Reload the rows after either. */
  const actions = useBulkInviteActions(() => setTick((n) => n + 1));
  const cancellable = jobs.filter((j) => isBulkInviteActive(j) && j.can_manage !== false);
  const cancelOpen = actions.cancelOpen;

  /* Load (and, while anything sends, keep reloading) every send's rows. */
  useEffect(() => {
    const ctl = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    Promise.all(jobs.map((j) => readAll(j, ctl.signal)))
      .then((lists) => {
        setRows(lists.flat());
        setError(null);
      })
      .catch((e: unknown) => {
        if (ctl.signal.aborted) return;
        setError(e instanceof Error ? e.message : 'Could not load the invitations.');
      })
      .finally(() => { if (!ctl.signal.aborted) setLoading(false); });
    return () => ctl.abort();
    // jobKey stands for `jobs`; counts on the jobs change every poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobKey, tick]);
  useEffect(() => {
    if (!anyActive) return;
    const t = setInterval(() => setTick((n) => n + 1), REFRESH_MS);
    return () => clearInterval(t);
  }, [anyActive]);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    // Esc while the cancel confirm is open closes only the confirm.
    if (cancelOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, cancelOpen]);

  /* Header: one job → its badge and name; several → how many. */
  const jds = useMemo(() => {
    const m = new Map<string, TrackedBulkInvite>();
    for (const j of jobs) m.set(String(j.jdCode ?? j.jd_code ?? j.jd_id), j);
    return [...m.values()];
  }, [jobs]);
  const oneJd = jds.length === 1 ? jds[0] : null;
  const total = jobs.reduce((n, j) => n + j.total, 0);
  const processed = jobs.reduce((n, j) => n + j.processed, 0);
  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
  const mixed = jobs.some((j) => j.kind === 'assessment') && jobs.some((j) => j.kind !== 'assessment');

  const counts = useMemo(() => {
    const c: Record<BulkInviteItemStatus, number> = { queued: 0, processing: 0, sent: 0, skipped: 0, failed: 0, cancelled: 0 };
    for (const r of rows ?? []) c[r.status] += 1;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? [])
      .filter((r) => status === 'all' || r.status === status)
      .filter((r) => kind === 'all' || (kind === 'assessment' ? r.job.kind === 'assessment' : r.job.kind !== 'assessment'))
      .filter((r) => !q || (r.name ?? '').toLowerCase().includes(q) || (r.email ?? '').toLowerCase().includes(q))
      .sort((a, b) => (b.processed_at ?? '').localeCompare(a.processed_at ?? '') || (a.name ?? '').localeCompare(b.name ?? ''));
  }, [rows, search, status, kind]);

  const pages = Math.max(1, Math.ceil(filtered.length / perPage));
  const current = Math.min(page, pages);
  const shownRows = filtered.slice((current - 1) * perPage, current * perPage);
  const from = filtered.length === 0 ? 0 : (current - 1) * perPage + 1;
  const to = Math.min(filtered.length, current * perPage);

  const chips: { key: BulkInviteItemStatus; label: string; icon: React.ReactNode }[] = [
    { key: 'queued', label: 'Queue', icon: <Clock className="w-4 h-4 text-gray-500 dark:text-slate-400" /> },
    { key: 'processing', label: 'Sending', icon: <Loader2 className={`w-4 h-4 text-brand-blue ${counts.processing > 0 ? 'animate-spin' : ''}`} /> },
    { key: 'sent', label: 'Sent', icon: <CheckCircle2 className="w-4 h-4 text-success" /> },
    { key: 'skipped', label: 'Skipped', icon: <SkipForward className="w-4 h-4 text-brand-orange-deep" /> },
    { key: 'cancelled', label: 'Cancelled', icon: <Ban className="w-4 h-4 text-warning-strong" /> },
    { key: 'failed', label: 'Failed', icon: <XCircle className="w-4 h-4 text-destructive" /> },
  ];

  const selectCls = 'h-10 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm text-gray-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-blue/30';
  const cols = oneJd ? 6 : 7;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Invitation progress"
        className="relative flex w-full max-w-6xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] flex-col overflow-hidden rounded-2xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 sm:px-6 pt-5 pb-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-blue/5">
              <Send className="h-5 w-5 text-brand-blue" />
            </div>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-lg font-semibold text-gray-900 dark:text-slate-100">
                {oneJd ? (
                  <>
                    {(oneJd.jdCode ?? oneJd.jd_code) && <JobIdBadge>{oneJd.jdCode ?? oneJd.jd_code}</JobIdBadge>}
                    <span className="[overflow-wrap:anywhere]">{oneJd.jdTitle ?? oneJd.jd_title ?? 'Job'}</span>
                    {(oneJd.jobVersion ?? oneJd.job_version) ? <VersionPill kind="job" version={(oneJd.jobVersion ?? oneJd.job_version) as number} /> : null}
                  </>
                ) : `${jds.length} jobs`}
              </p>
              <p className="mt-0.5 text-sm text-gray-600 dark:text-slate-300">
                Invite progress <span className="font-medium text-gray-800 dark:text-slate-200">{processed}/{total} candidates processed</span>
                {` · ${jobs.length} ${jobs.length === 1 ? 'send' : 'sends'}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${anyActive
              ? 'bg-brand-blue/5 text-brand-blue ring-brand-blue/20'
              : 'bg-success-subtle text-success ring-success/30'}`}
            >
              {anyActive ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              {anyActive ? 'Sending' : 'Complete'}
            </span>
            {cancellable.length > 0 && (
              <Button variant="secondary" size="sm" onClick={() => actions.askCancel(cancellable)}>
                Cancel sending
              </Button>
            )}
            <button type="button" onClick={refresh} title="Refresh" aria-label="Refresh"
              className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-gray-200 dark:border-slate-700 text-gray-600 hover:bg-gray-50 dark:hover:bg-slate-800">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button type="button" onClick={onClose} title="Close" aria-label="Close"
              className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-gray-200 dark:border-slate-700 text-gray-600 hover:bg-gray-50 dark:hover:bg-slate-800">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="h-1 w-full bg-gray-100 dark:bg-slate-800">
          <div className={`h-full transition-[width] duration-500 ${anyActive ? 'bg-brand-blue' : 'bg-success'}`} style={{ width: `${pct}%` }} />
        </div>

        {/* Status chips — click to filter */}
        <div className="flex flex-wrap gap-2 px-5 sm:px-6 py-3 border-b border-gray-100 dark:border-slate-700/60">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => { setStatus(status === c.key ? 'all' : c.key); setPage(1); }}
              aria-pressed={status === c.key}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${status === c.key
                ? 'border-brand-blue bg-brand-blue/5'
                : 'border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800'}`}
            >
              {c.icon}
              <span className="text-gray-700 dark:text-slate-300">{c.label}:</span>
              <span className="font-semibold tabular-nums text-gray-900 dark:text-slate-100">{counts[c.key]}</span>
            </button>
          ))}
        </div>

        {/* Search and filters */}
        <div className="flex flex-wrap items-center gap-3 px-5 sm:px-6 py-3 border-b border-gray-100 dark:border-slate-700/60">
          <label className="relative">
            <span className="sr-only">Search</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Name or email..."
              className={`${selectCls} w-56 pl-9`}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
            Status
            <FilterSelect
              value={status}
              onChange={(v) => { setStatus(v as StatusFilter); setPage(1); }}
              ariaLabel="Status"
              className="w-36 h-9 px-2.5 rounded-lg text-sm"
              options={[
                { value: 'all', label: 'All Status' },
                { value: 'queued', label: 'In queue' },
                { value: 'processing', label: 'Sending' },
                { value: 'sent', label: 'Sent' },
                { value: 'skipped', label: 'Skipped' },
                { value: 'cancelled', label: 'Cancelled' },
                { value: 'failed', label: 'Failed' },
              ]}
            />
          </label>
          {mixed && (
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
              Type
              <FilterSelect
                value={kind}
                onChange={(v) => { setKind(v as KindFilter); setPage(1); }}
                ariaLabel="Type"
                className="w-36 h-9 px-2.5 rounded-lg text-sm"
                options={[
                  { value: 'all', label: 'All Types' },
                  { value: 'assessment', label: 'Assessment' },
                  { value: 'interview', label: 'AI Interview' },
                ]}
              />
            </label>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 min-h-0 overflow-auto overscroll-contain">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-white dark:bg-slate-900">
              <tr className="border-b border-gray-200 dark:border-slate-700 text-left text-xs font-semibold text-gray-600 dark:text-slate-300">
                <th className="px-5 sm:px-6 py-3">Candidate</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Sent For</th>
                {!oneJd && <th className="px-3 py-3">Job</th>}
                <th className="px-3 py-3">Source</th>
                <th className="px-3 py-3">Sent Date</th>
                <th className="px-3 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
              {rows === null && !error && (
                <tr><td colSpan={cols} className="py-12 text-center text-gray-500"><Loader2 className="inline w-5 h-5 animate-spin mr-2" />Loading invitations…</td></tr>
              )}
              {error && (
                <tr><td colSpan={cols} className="py-12 text-center text-destructive">{error}</td></tr>
              )}
              {rows !== null && !error && shownRows.length === 0 && (
                <tr><td colSpan={cols} className="py-12 text-center text-gray-500">No candidates match these filters.</td></tr>
              )}
              {shownRows.map((r) => {
                const st = STATUS[r.status];
                const v = versionOf(r.job);
                const isInterview = r.job.kind !== 'assessment';
                const when = dateParts(r.processed_at);
                return (
                  <tr key={`${r.job.job_id}:${r.id}`} className="hover:bg-gray-50/70 dark:hover:bg-slate-800/40">
                    <td className="px-5 sm:px-6 py-3">
                      <p className="font-medium text-gray-900 dark:text-slate-100">{r.name || '—'}</p>
                      {r.email && <p className="text-xs text-gray-500 dark:text-slate-400 [overflow-wrap:anywhere]">{r.email}</p>}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ring-1 ${st.cls}`}>{st.icon}{st.label}</span>
                      {r.reason && (r.status === 'failed' || r.status === 'skipped') && (
                        <p className="mt-1 max-w-[16rem] text-2xs text-gray-500 dark:text-slate-400 [overflow-wrap:anywhere]">{r.reason}</p>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1.5 text-xs text-gray-700 dark:text-slate-300">
                        {isInterview
                          ? <Video className="w-3.5 h-3.5 text-violet-600" aria-hidden="true" />
                          : <ClipboardList className="w-3.5 h-3.5 text-brand-cyan" aria-hidden="true" />}
                        {isInterview ? 'AI Interview' : 'Assessment'}
                        {v ? (isInterview
                          ? <span className="rounded-md px-1.5 py-0.5 text-xs font-semibold ring-1 text-violet-700 bg-violet-50 ring-violet-200">V{v}</span>
                          : <VersionPill kind="assessment" version={v} />) : null}
                      </span>
                    </td>
                    {!oneJd && (
                      <td className="px-3 py-3">
                        <span className="flex flex-col items-start gap-0.5">
                          {/* JD ID and the job version sent from */}
                          <span className="inline-flex items-center gap-1">
                            {(r.job.jdCode ?? r.job.jd_code) && <JobIdBadge>{r.job.jdCode ?? r.job.jd_code}</JobIdBadge>}
                            {(r.job.jobVersion ?? r.job.job_version) ? <VersionPill kind="job" version={(r.job.jobVersion ?? r.job.job_version) as number} /> : null}
                          </span>
                          <span className="text-xs text-gray-700 dark:text-slate-300 [overflow-wrap:anywhere]">{r.job.jdTitle ?? r.job.jd_title ?? ''}</span>
                        </span>
                      </td>
                    )}
                    <td className="px-3 py-3">
                      {r.source ? (
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 dark:border-slate-700 px-2 py-1 text-xs text-gray-700 dark:text-slate-300">
                          <FolderOpen className="w-3.5 h-3.5" /> {SOURCE[r.source] ?? r.source}
                        </span>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-3 py-3">
                      {when ? (
                        <>
                          <p className="text-gray-900 dark:text-slate-100">{when.day}</p>
                          <p className="text-xs text-gray-500">{when.time}</p>
                        </>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="inline-flex items-center justify-center gap-2">
                      {r.job.can_manage !== false && r.can_cancel && (
                        <button
                          type="button"
                          onClick={() => void actions.cancelItem(r.job, r.id, r.name || r.email || undefined)}
                          disabled={actions.busy === `cancel-item:${r.id}`}
                          aria-label={`Cancel the invite to ${r.name || r.email || 'this candidate'}`}
                          title="Cancel this candidate — the rest keep sending"
                          className="h-9 px-2.5 inline-flex items-center gap-1.5 rounded-lg border border-destructive-line text-xs font-medium text-destructive hover:bg-destructive-subtle disabled:opacity-50"
                        >
                          {actions.busy === `cancel-item:${r.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />} Cancel
                        </button>
                      )}
                      {r.resume_id ? (
                        <a
                          href={`/recruitment/resume-view/${encodeURIComponent(r.resume_id)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="View resume (new tab)"
                          aria-label={`View ${r.name ?? 'candidate'}'s resume`}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 dark:border-slate-700 text-gray-700 hover:bg-gray-50 dark:hover:bg-slate-800"
                        >
                          <Eye className="w-4 h-4" />
                        </a>
                      ) : <span className="text-gray-300">—</span>}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 dark:border-slate-700/60 px-5 sm:px-6 py-3 text-sm text-gray-600 dark:text-slate-300">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2">
              Show:
              <FilterSelect
                value={String(perPage)}
                onChange={(v) => { setPerPage(Number(v)); setPage(1); }}
                ariaLabel="Rows per page"
                className="w-20 h-9 px-2.5 rounded-lg text-sm"
                options={[10, 25, 50, 100].map((n) => ({ value: String(n), label: String(n) }))}
              />
              per page
            </label>
            <span className="hidden sm:inline text-gray-300">|</span>
            <span>Showing {from} to {to} of {filtered.length} records</span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" disabled={current <= 1} onClick={() => setPage(current - 1)} aria-label="Previous page"
              className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-gray-200 dark:border-slate-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-slate-800">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="tabular-nums font-medium text-gray-900 dark:text-slate-100">{current} / {pages}</span>
            <button type="button" disabled={current >= pages} onClick={() => setPage(current + 1)} aria-label="Next page"
              className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-gray-200 dark:border-slate-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-slate-800">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      {actions.cancelDialog}
    </div>
  );
}
