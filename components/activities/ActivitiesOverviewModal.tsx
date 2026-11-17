'use client';

/* "Overall Activity" — every job in My Activities for one module (AI
   Assessment / AI Interview / Resume Scoring) in one popup: totals, one
   overall bar, a job table with per-row Send again / Re-score /
   Cancel. Opened from the My Activities dock; the
   page underneath never changes.

   Job level only. A cross-job candidate list needs a backend list API that
   does not exist yet, so it is not shown. */

import { useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ClipboardList, Eye, FileText, Layers, Loader2, Minus, RotateCcw, Search, Square, Trash2, Video, XCircle,
} from 'lucide-react';
import AppModal from '@/components/ui/app-modal';
import { Button } from '@/components/ui/button';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import ListPagination from '@/components/ListPagination';
import { useModuleQuota } from '@/contexts/QuotaContext';

export type ActivityKind = 'assessment' | 'interview' | 'scoring';

/** One job (one send / one scoring run) as the overview shows it. */
export interface ActivityRow {
  key: string;
  kind: ActivityKind;
  code?: string | null;
  title: string;
  jdVersion?: number | null;
  /** Assessment / AI interview version sent. */
  modVersion?: number | null;
  total: number;
  done: number;
  failed: number;
  skipped: number;
  cancelled: number;
  queue: number;
  running: boolean;
  /** Finished with failures. */
  look: boolean;
  startedAt?: string | null;
  /** May cancel / send again / re-score (owner or admin). */
  canManage: boolean;
  /** Rows that Send again / Re-score would put back (failed + cancelled). */
  retryable: number;
  /** Scoring only: Exact Match count. */
  exact?: number;
}

export const ACTIVITY_MODULE: Record<ActivityKind, {
  label: string; short: string; Icon: typeof FileText; text: string; verb: string; unit: 'AS' | 'AIU' | 'RS'; again: string;
}> = {
  assessment: { label: 'AI Assessment', short: 'Assessment', Icon: ClipboardList, text: 'text-brand-orange', verb: 'Sent', unit: 'AS', again: 'Send again' },
  interview: { label: 'AI Interview', short: 'AI Interview', Icon: Video, text: 'text-brand-cyan', verb: 'Sent', unit: 'AIU', again: 'Send again' },
  scoring: { label: 'Resume Scoring', short: 'Scoring', Icon: FileText, text: 'text-brand-cyan', verb: 'Scored', unit: 'RS', again: 'Re-score' },
};
const KINDS: ActivityKind[] = ['assessment', 'interview', 'scoring'];
const UNIT_NOUN: Record<ActivityKind, string> = { assessment: 'AI Assessment', interview: 'AI Interview', scoring: 'Resume Scoring' };

const n = (v: number) => (v ?? 0).toLocaleString('en-IN');
const pctOf = (r: Pick<ActivityRow, 'total' | 'queue'>) => (r.total > 0 ? Math.round(((r.total - r.queue) / r.total) * 100) : 0);
const stateOf = (r: ActivityRow) => (r.running ? 'running' : r.look ? 'look' : 'done');
const barTone = (s: string) => (s === 'running' ? 'bg-brand-blue' : s === 'look' ? 'bg-warning-strong' : 'bg-success');

function StateBadge({ state }: { state: string }) {
  const cls = 'tf-badge ring-1 [&_svg]:h-3 [&_svg]:w-3';
  if (state === 'running') return <span className={`${cls} bg-brand-blue/10 text-brand-blue ring-brand-blue/20`}><Loader2 className="animate-spin" />Running</span>;
  if (state === 'look') return <span className={`${cls} bg-warning-subtle text-warning-strong ring-warning-line`}><AlertTriangle />Need a look</span>;
  return <span className={`${cls} bg-success-subtle text-success ring-success-line`}><CheckCircle2 />Done</span>;
}

type Pill = 'all' | 'running' | 'done' | 'look' | 'cancelled';

export default function ActivitiesOverviewModal({
  open,
  kind,
  onKindChange,
  onClose,
  rows,
  onOpenRow,
  onRemoveRow,
  onRetry,
  onCancel,
  onMinimize,
}: {
  open: boolean;
  kind: ActivityKind;
  onKindChange: (k: ActivityKind) => void;
  onClose: () => void;
  rows: ActivityRow[];
  /** That job's own progress popup. */
  onOpenRow: (row: ActivityRow) => void;
  onRemoveRow: (row: ActivityRow) => void;
  /** Send again / Re-score every failed + cancelled row of these jobs. */
  onRetry: (rows: ActivityRow[]) => Promise<void>;
  /** Stop these running jobs (what is done stays done). */
  onCancel: (rows: ActivityRow[]) => void;
  /** Hide the popup; everything keeps running in My Activities. */
  onMinimize: () => void;
}) {
  const [pill, setPill] = useState<Pill>('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [confirmRetry, setConfirmRetry] = useState<ActivityRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  const m = ACTIVITY_MODULE[kind];
  const quota = useModuleQuota(m.unit);
  const mine = rows.filter(r => r.kind === kind);
  const sum = mine.reduce((s, r) => ({
    total: s.total + r.total, done: s.done + r.done, failed: s.failed + r.failed, skipped: s.skipped + r.skipped,
    cancelled: s.cancelled + r.cancelled, queue: s.queue + r.queue, running: s.running + (r.running ? 1 : 0), exact: s.exact + (r.exact ?? 0),
  }), { total: 0, done: 0, failed: 0, skipped: 0, cancelled: 0, queue: 0, running: 0, exact: 0 });
  const overall = pctOf(sum);

  const reset = () => setPage(1);
  const switchKind = (k: ActivityKind) => { onKindChange(k); setPill('all'); setQ(''); reset(); };

  const list = mine
    .filter(r => pill === 'all' || (pill === 'cancelled' ? r.cancelled > 0 : stateOf(r) === pill))
    .filter(r => !q || `${r.code ?? ''} ${r.title}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => Number(b.running) - Number(a.running) || String(b.startedAt ?? '').localeCompare(String(a.startedAt ?? '')));
  /* A page past the end (a job removed, a filter changed) shows the last one. */
  const lastPage = Math.max(1, Math.ceil(list.length / perPage));
  const curPage = Math.min(page, lastPage);
  const pageRows = list.slice((curPage - 1) * perPage, curPage * perPage);

  /* Send again / Re-score is per row: jobs with failed / cancelled rows. */
  const retryCount = (confirmRetry ?? []).reduce((t, r) => t + r.retryable, 0);

  const PILLS: { k: Pill; label: string; v: number; icon: React.ReactNode; tone: string }[] = [
    { k: 'all', label: 'All', v: mine.length, icon: <Layers />, tone: 'text-[var(--muted-foreground)]' },
    { k: 'running', label: 'Running', v: mine.filter(r => r.running).length, icon: <Loader2 />, tone: 'text-brand-blue' },
    { k: 'done', label: 'Done', v: mine.filter(r => stateOf(r) === 'done').length, icon: <CheckCircle2 />, tone: 'text-success' },
    { k: 'look', label: 'Need a look', v: mine.filter(r => stateOf(r) === 'look').length, icon: <AlertTriangle />, tone: 'text-warning-strong' },
    { k: 'cancelled', label: 'Cancelled', v: mine.filter(r => r.cancelled > 0).length, icon: <XCircle />, tone: 'text-warning-strong' },
  ];
  const pillCls = (on: boolean) => `inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-1 text-xs sm:px-3 sm:py-1.5 sm:text-sm transition-all [&_svg]:h-3.5 [&_svg]:w-3.5 ${on
    ? 'border-brand-blue/40 ring-2 ring-brand-blue/20 bg-brand-blue/[0.05]'
    : 'border-[var(--border)] bg-[var(--card)] hover:border-brand-blue/30 hover:shadow-sm'}`;

  const available = quota.availableUnits;
  const knownUnits = !quota.isUnlimited && available !== null && available >= 0;
  const shortUnits = !!confirmRetry && knownUnits && retryCount > (available ?? 0);

  /* The summary bar: every candidate of this module, by outcome. */
  const segments = [
    { key: 'done', label: m.verb, v: sum.done, bar: 'bg-success', dot: 'bg-success' },
    { key: 'failed', label: 'Failed', v: sum.failed, bar: 'bg-destructive', dot: 'bg-destructive' },
    { key: 'skipped', label: 'Skipped', v: sum.skipped, bar: 'bg-brand-cyan', dot: 'bg-brand-cyan' },
    { key: 'cancelled', label: 'Cancelled', v: sum.cancelled, bar: 'bg-warning-strong', dot: 'bg-warning-strong' },
    { key: 'queue', label: 'Queue', v: sum.queue, bar: '', dot: 'bg-[var(--border-dark)]' },
  ];
  const share = (v: number) => (sum.total > 0 ? (v / sum.total) * 100 : 0);
  const runningJobs = mine.filter(r => r.running).length;
  const lookJobs = mine.filter(r => stateOf(r) === 'look').length;
  const headState = runningJobs ? 'running' : lookJobs ? 'look' : 'done';
  const allRunning = rows.filter(r => r.running).length;

  return (
    <>
      <AppModal
        open={open}
        onCancel={onClose}
        size="xl"
        mobileSheet
        tone="plain"
        icon={<Layers className="h-5 w-5" />}
        title="Overall Activity"
        subtitle={`${rows.length} job${rows.length === 1 ? '' : 's'} in My Activities${allRunning ? ` · ${allRunning} running` : ' · all finished'}`}
        headerExtra={
          <Button
            variant="secondary"
            size="sm"
            onClick={onMinimize}
            className="px-2 sm:px-3"
            aria-label="Minimize"
            title="Minimize — everything keeps running. Open it again from My Activities at the bottom-right."
          >
            <Minus className="h-4 w-4" />
            <span className="hidden sm:inline">Minimize</span>
          </Button>
        }
        cancelLabel="Cancel"
        footerStart="Jobs keep running in the background — you can leave this popup at any time."
        bodyClassName="!pt-4"
      >
        <div className="space-y-4">
          {/* Module cards — pick one; each shows its own jobs and progress. */}
          <div className="grid gap-2 sm:grid-cols-3" role="tablist" aria-label="Module">
            {KINDS.map(k => {
              const mm = ACTIVITY_MODULE[k];
              const kr = rows.filter(r => r.kind === k);
              const kt = kr.reduce((t, r) => ({ total: t.total + r.total, queue: t.queue + r.queue }), { total: 0, queue: 0 });
              const kp = pctOf(kt);
              const kRun = kr.filter(r => r.running).length;
              const kLook = kr.some(r => stateOf(r) === 'look');
              const on = k === kind;
              return (
                <button key={k} type="button" role="tab" aria-selected={on} disabled={!kr.length} onClick={() => switchKind(k)}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50 ${on
                    ? 'border-brand-blue/40 bg-brand-blue/[0.04] ring-2 ring-brand-blue/20'
                    : 'border-[var(--border)] bg-[var(--card)] hover:border-brand-blue/30 hover:shadow-sm'}`}>
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ${k === 'assessment' ? 'bg-brand-orange/10 ring-brand-orange/15' : 'bg-brand-cyan/10 ring-brand-cyan/15'}`}>
                    <mm.Icon className={`h-4 w-4 ${mm.text}`} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className={`truncate text-sm ${on ? 'font-semibold text-brand-blue' : 'font-medium text-[var(--text-primary)]'}`}>{mm.label}</span>
                      <span className="tf-meta shrink-0 tabular-nums">{kr.length} job{kr.length === 1 ? '' : 's'}{kRun ? ` · ${kRun} running` : ''}</span>
                    </span>
                    <span className="mt-1.5 flex items-center gap-2">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--border-dark)]">
                        <span className={`block h-full rounded-full transition-[width] duration-500 ${kRun ? 'bg-brand-blue' : kLook ? 'bg-warning-strong' : 'bg-success'}`} style={{ width: `${kr.length ? kp : 0}%` }} />
                      </span>
                      <span className="tf-meta w-9 shrink-0 text-right tabular-nums">{kr.length ? `${kp}%` : '—'}</span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Summary — the same status card as the live progress popups. */}
          <div className="rounded-xl border border-[var(--border)] px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${headState === 'running'
                  ? 'bg-brand-blue/10 text-brand-blue' : headState === 'look' ? 'bg-warning-subtle text-warning-strong' : 'bg-success-subtle text-success'}`}>
                  {headState === 'running' ? <Loader2 className="h-4 w-4 animate-spin" /> : headState === 'look' ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                </span>
                <div className="min-w-0" aria-live="polite">
                  <p className="tf-section-title leading-tight">
                    {m.label}: {n(sum.done)} of {n(sum.total)} {m.verb.toLowerCase()}
                  </p>
                  <p className="tf-meta">
                    {mine.length} job{mine.length === 1 ? '' : 's'}
                    {runningJobs ? ` · ${runningJobs} running` : ''}
                    {lookJobs ? ` · ${lookJobs} need a look` : ''}
                    {kind === 'scoring' && sum.exact > 0 ? ` · ${n(sum.exact)} Exact Match` : ''}
                  </p>
                </div>
              </div>
              <span className={`text-2xl font-semibold tabular-nums ${headState === 'running' ? 'text-brand-blue' : headState === 'look' ? 'text-warning-strong' : 'text-success'}`}>{overall}%</span>
            </div>
            <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-[var(--border-dark)]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={overall}
              aria-label={`${n(sum.total - sum.queue)} of ${n(sum.total)} processed`}>
              {segments.filter(sg => sg.bar).map(sg => (
                <div key={sg.key} className={`${sg.bar} h-full transition-[width] duration-500`} style={{ width: `${share(sg.v)}%` }} />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {segments.map(sg => (
                <span key={sg.key} className="inline-flex items-center gap-1.5 tf-meta">
                  <span className={`h-2 w-2 rounded-full ${sg.dot}`} />
                  {sg.label} <b className="tabular-nums text-[var(--text-primary)]">{n(sg.v)}</b>
                </span>
              ))}
            </div>
          </div>


          {/* pills */}
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Status">
            {PILLS.map(x => (
              <button key={x.k} type="button" role="tab" aria-selected={pill === x.k} className={pillCls(pill === x.k)} onClick={() => { setPill(x.k); reset(); }}>
                <span className={x.tone}>{x.icon}</span>
                <span className="text-[var(--muted-foreground)]">{x.label}:</span>
                <b className="tabular-nums">{x.v}</b>
              </button>
            ))}
          </div>

          {/* toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex h-9 min-w-[12rem] flex-1 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 sm:max-w-xs">
              <Search className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
              <input value={q} onChange={e => { setQ(e.target.value); reset(); }} placeholder="Search JD ID or job…" className="w-full bg-transparent text-sm outline-none" aria-label="Search jobs" />
            </label>
          </div>

          {/* job table */}
          <div className="tf-table-shell min-h-[22rem] overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full min-w-[880px] text-left">
              <thead>
                <tr className="bg-[var(--surface)]">
                  <th className="tf-th px-3 py-2">S.No</th>
                  <th className="tf-th px-3 py-2">Job</th>
                  <th className="tf-th px-3 py-2">Version</th>
                  <th className="tf-th px-3 py-2">Progress</th>
                  <th className="tf-th px-3 py-2">{m.verb}</th>
                  <th className="tf-th px-3 py-2">Failed</th>
                  <th className="tf-th px-3 py-2">{kind === 'scoring' ? 'Cancelled' : 'Skipped'}</th>
                  {kind === 'scoring' && <th className="tf-th px-3 py-2">Exact Match</th>}
                  <th className="tf-th px-3 py-2">Started</th>
                  <th className="tf-th px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {pageRows.map((r, i) => {
                  const st = stateOf(r);
                  const pct = pctOf(r);
                  return (
                    <tr key={r.key} className="hover:bg-[var(--surface)]">
                      <td className="tf-td px-3 py-2 tabular-nums">{(curPage - 1) * perPage + i + 1}</td>
                      <td className="px-3 py-2">
                        <button type="button" onClick={() => onOpenRow(r)} className="flex max-w-[16rem] items-center gap-1.5 text-left hover:text-brand-blue" title="Open this job's progress">
                          {r.code && <JobIdBadge className="inline-flex h-5 shrink-0 items-center text-2xs">{r.code}</JobIdBadge>}
                          <span className="truncate text-sm font-medium hover:underline">{r.title}</span>
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <span className="flex flex-wrap items-center gap-1">
                          {r.jdVersion ? <span className="rounded px-1.5 py-0.5 text-2xs font-semibold text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20">v{r.jdVersion}</span> : null}
                          {r.modVersion && kind !== 'scoring' ? (
                            <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-2xs font-semibold ring-1 ${kind === 'assessment'
                              ? 'text-brand-cyan bg-brand-cyan/10 ring-brand-cyan/20' : 'text-[var(--info-strong)] bg-[var(--info-subtle)] ring-[var(--info-line)]'}`}>
                              {m.short} V{r.modVersion}
                            </span>
                          ) : null}
                          {!r.jdVersion && !(r.modVersion && kind !== 'scoring') && <span className="tf-meta">—</span>}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--border-dark)]">
                            <div className={`h-full rounded-full transition-[width] duration-500 ${barTone(st)}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="tf-meta w-9 tabular-nums">{pct}%</span>
                          <StateBadge state={st} />
                        </div>
                      </td>
                      <td className="tf-td px-3 py-2 tabular-nums whitespace-nowrap">{n(r.done)}/{n(r.total)}</td>
                      <td className={`tf-td px-3 py-2 tabular-nums ${r.failed ? 'font-semibold text-destructive' : ''}`}>{n(r.failed)}</td>
                      <td className="tf-td px-3 py-2 tabular-nums">{n(kind === 'scoring' ? r.cancelled : r.skipped)}</td>
                      {kind === 'scoring' && <td className="tf-td px-3 py-2 tabular-nums text-success">{n(r.exact ?? 0)}</td>}
                      <td className="tf-td px-3 py-2 whitespace-nowrap">{r.startedAt ? new Date(r.startedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <Button variant="secondary" size="sm" className="!h-7 !w-7 !px-0" title="Open this job's progress" aria-label="Open this job's progress" onClick={() => onOpenRow(r)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {r.running
                            ? r.canManage && (
                              <Button variant="secondary" size="sm" className="!h-7 !w-7 !px-0" title="Cancel — what is done stays done" aria-label="Cancel" onClick={() => onCancel([r])}>
                                <Square className="h-3.5 w-3.5" />
                              </Button>)
                            : (<>
                              {r.canManage && r.retryable > 0 && (
                                <Button variant="secondary" size="sm" className="!h-7 !w-7 !px-0" title={`${m.again} ${n(r.retryable)} failed / cancelled`} aria-label={m.again} onClick={() => setConfirmRetry([r])}>
                                  <RotateCcw className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button variant="secondary" size="sm" className="!h-7 !w-7 !px-0" title="Remove from My Activities" aria-label="Remove from My Activities" onClick={() => onRemoveRow(r)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>)}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!list.length && <p className="px-4 py-10 text-center tf-meta">{mine.length ? 'No job matches this filter.' : `No ${m.label} jobs in My Activities.`}</p>}
          </div>

          <ListPagination
            currentPage={curPage}
            itemsPerPage={perPage}
            totalItems={list.length}
            onPageChange={setPage}
            onItemsPerPageChange={v => { setPerPage(v); setPage(1); }}
            itemLabel="jobs"
            pageSizeOptions={[10, 25, 50]}
          />
        </div>
      </AppModal>

      {/* Units confirm for Send again / Re-score across jobs. */}
      <AppModal
        open={!!confirmRetry}
        onCancel={() => { if (!busy) setConfirmRetry(null); }}
        size="sm"
        tone="warning"
        zIndexClass="z-[70]"
        title={`${m.again} across ${confirmRetry?.length ?? 0} job${confirmRetry?.length === 1 ? '' : 's'}?`}
        actions={[{
          label: `${m.again} ${n(retryCount)}`,
          variant: 'primary',
          disabled: shortUnits,
          loading: busy,
          onClick: async () => {
            if (!confirmRetry) return;
            setBusy(true);
            try { await onRetry(confirmRetry); } finally {
              setBusy(false); setConfirmRetry(null);
            }
          },
        }]}
      >
        <div className="space-y-2">
          <p className="tf-body-secondary">
            {n(retryCount)} failed or cancelled {kind === 'scoring' ? 'resumes are scored again' : 'candidates are sent again'}.
            This uses up to <b>{n(retryCount)} {UNIT_NOUN[kind]} units</b>
            {quota.isUnlimited ? ' (unlimited plan).' : knownUnits ? ` · ${n(available ?? 0)} available.` : '.'}
          </p>
          {shortUnits && (
            <p className="rounded-lg border border-destructive-line bg-destructive-subtle px-3 py-2 text-xs text-destructive">
              Not enough units. Add units in Usage &amp; Quotas first.
            </p>
          )}
        </div>
      </AppModal>
    </>
  );
}
