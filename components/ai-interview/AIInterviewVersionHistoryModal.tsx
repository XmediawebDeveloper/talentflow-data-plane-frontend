'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Archive, BarChart3, CheckCircle, Clock, Eye, FileText, Info, Loader2,
  RefreshCw, Video, X
} from 'lucide-react';
import { showErrorToast } from '@/lib/utils/errorToast';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { aiInterviewService, type AIInterviewResponse } from '@/lib/services/aiInterviewService';
import { formatISTDate, formatISTTime } from '@/lib/utils/dateUtils';
import { interviewVersionOrdinal } from '@/lib/utils/aiInterviewVersion';
import { displayInviteScore, inviteResult, resolveInviteStatus } from '@/components/AIInterviewInviteTable';
import { ROUND_LABELS, ROUND_SHORT_LABELS } from './AIInterviewPicker';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { DateField } from '@/components/ui/date-field';
import FilterSelect from '@/components/ui/filter-select';
import NameAvatar from '@/components/ui/name-avatar';
import { jobInterviewConfigs } from './JobInterviewVersionPicker';
import { MobileRecordList, MobileRecordCard, MobileStatChip, DESKTOP_TABLE_ONLY } from '@/components/ui/mobile-record-card';
import { clickableRowProps } from '@/lib/a11y/clickableProps';
import { ModalA11y } from '@/components/ui/modal-a11y';
import { IconButton } from '@/components/ui/icon-button';

/* ── Status palette for the results donut ─────────────────────────────
   Validated (dataviz validate_palette.js) as a RING — the wrap pair
   (Expired → Invited) included — in exactly this order: all checks PASS in
   dark (#0f172a); in light (#fff) all PASS with one contrast WARN on the
   orange, relieved by the always-visible legend with counts. Order matters:
   green only borders blue and cyan (never red/orange), so Terminated and
   Completed are never neighbours. `fill` is a CSS class so it wins over the
   SVG attribute and follows dark mode. */
const RESULT_SEGMENTS = [
  { key: 'invited', label: 'Invited', swatch: 'bg-[var(--raw-2563eb)] dark:bg-[var(--raw-3b82f6)]', fill: 'fill-[var(--raw-2563eb)] dark:fill-[var(--raw-3b82f6)]' },
  { key: 'completed', label: 'Completed', swatch: 'bg-[var(--raw-16a34a)] dark:bg-[var(--raw-16a34a)]', fill: 'fill-[var(--raw-16a34a)] dark:fill-[var(--raw-16a34a)]' },
  { key: 'in_progress', label: 'In Progress', swatch: 'bg-[var(--raw-079cc4)] dark:bg-[var(--raw-0891b2)]', fill: 'fill-[var(--raw-079cc4)] dark:fill-[var(--raw-0891b2)]' },
  { key: 'terminated', label: 'Terminated', swatch: 'bg-[var(--raw-b91c1c)] dark:bg-[var(--raw-e11d48)]', fill: 'fill-[var(--raw-b91c1c)] dark:fill-[var(--raw-e11d48)]' },
  { key: 'expired', label: 'Expired', swatch: 'bg-[var(--raw-ed881c)] dark:bg-[var(--raw-d97706)]', fill: 'fill-[var(--raw-ed881c)] dark:fill-[var(--raw-d97706)]' },
] as const;
type SortKey = 'created' | 'creator' | 'rounds' | 'status';
/** Version Wise Results value that sums every version. */
const ALL_VERSIONS = '__all__';

interface VersionStats {
  total: number;
  invited: number;
  in_progress: number;
  completed: number;
  terminated: number;
  expired: number;
  revoked: number;
  pass: number;
  fail: number;
}

const normalizeStatus = (status: string) =>
  ['invited', 'consent_pending', 'system_check', 'in_progress', 'scheduled'].includes(status) ? 'published' : status;
const STATUS_PILL: Record<string, { label: string; className: string }> = {
  published: { label: 'Active', className: 'bg-success-subtle text-success-strong ring-success-line' },
  draft: { label: 'Draft', className: 'bg-warning-subtle text-warning-strong ring-warning-line' },
  archived: { label: 'Archived', className: 'bg-slate-100 text-gray-600 ring-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700' },
  cancelled: { label: 'Disabled', className: 'bg-destructive-subtle text-destructive ring-destructive-line' },
  completed: { label: 'Completed', className: 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20' },
};
const pillFor = (status: string) => STATUS_PILL[normalizeStatus(status)] ?? { label: status, className: STATUS_PILL.archived.className };
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

/** Every invite of one interview, counted by the same status and Pass/Fail
 *  rules the invite tables use. Pages through (compact rows, 200 a page). */
async function loadStats(configId: string): Promise<VersionStats> {
  const s: VersionStats = { total: 0, invited: 0, in_progress: 0, completed: 0, terminated: 0, expired: 0, revoked: 0, pass: 0, fail: 0 };
  for (let page = 1; page <= 10; page += 1) {
    const res = await aiInterviewService.getConfigInvitations(configId, { page, page_size: 200, compact: true });
    for (const inv of res.items || []) {
      const status = resolveInviteStatus(inv);
      if (status === 'revoked') { s.revoked += 1; continue; }
      s.total += 1;
      // Consent / system check are the start of the session — in progress.
      const bucket = ['consent_pending', 'system_check', 'in_progress'].includes(status) ? 'in_progress'
        : ['completed', 'terminated', 'expired'].includes(status) ? status
        : 'invited';
      (s as unknown as Record<string, number>)[bucket] += 1;
      if (status === 'completed') {
        const r = inviteResult(inv, displayInviteScore(inv));
        if (r === 'Pass') s.pass += 1;
        else if (r === 'Fail') s.fail += 1;
      }
    }
    if ((res.items || []).length < 200 || page >= (res.total_pages || 1)) break;
  }
  return s;
}

/**
 * AI Interview Version History for one job — every interview version with its
 * invite funnel (invited → completed, terminated, expired) and pass rate, plus
 * a per-version results panel. Opened from the Job Details page's AI Interview
 * quick-actions heading.
 */
export default function AIInterviewVersionHistoryModal({
  open, onClose, jobId, jobTitle, jobShortId, jobVersion,
}: {
  open: boolean;
  onClose: () => void;
  /** The JD row id; the whole job lineage (all job versions) is listed. */
  jobId: string;
  jobTitle?: string;
  jobShortId?: string;
  /** The job version this page shows, for the subtitle. */
  jobVersion?: number | null;
}) {
  const router = useRouter();
  const [allConfigs, setAllConfigs] = useState<AIInterviewResponse[]>([]);
  const [stats, setStats] = useState<Record<string, VersionStats>>({});
  const [loading, setLoading] = useState(false);
  const [versionFilter, setVersionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [creatorFilter, setCreatorFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /* Sortable columns — Version and Created On both order by creation (newest
     first by default); Created By / Rounds / Status by name, count, status. */
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'created', dir: 'desc' });

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const listAll = async (status?: string) => {
        const items: AIInterviewResponse[] = [];
        for (let page = 1; ; page += 1) {
          const batch = await aiInterviewService.listConfigs({ status, page, page_size: 100, compact: true });
          items.push(...(batch.items || []));
          if ((batch.items || []).length < 100 || items.length >= (batch.total ?? items.length)) break;
        }
        return items;
      };
      const live = await listAll();
      /* Archived versions page through too — a tenant with more than 100 of
         them used to lose the rest. A failure here still shows the live
         versions, but says the list may be missing archived ones rather than
         passing it off as complete. */
      const archived = await listAll('archived').catch((err) => {
        showErrorToast(err, "Couldn't load archived versions — the list may be incomplete", { id: 'ai-interview-versions-archived-load', retry: () => { void load(); } });
        return [] as AIInterviewResponse[];
      });
      const seen = new Set<string>();
      const all = [...live, ...archived].filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
      setAllConfigs(all);
      const versions = jobInterviewConfigs(all, jobId);
      const entries = await Promise.all(versions.map(async (c) => [c.id, await loadStats(c.id).catch(() => null)] as const));
      setStats(Object.fromEntries(entries.filter(([, v]) => v !== null)) as Record<string, VersionStats>);
    } catch (err) {
      showErrorToast(err, "Couldn't load the interview version history", { id: 'ai-interview-versions-load', retry: () => { void load(); } });
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  // Load each time the dialog opens — deferred a tick, so the loading state
  // isn't set synchronously inside the effect.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(t);
  }, [open, load]);

  const versions = useMemo(() => jobInterviewConfigs(allConfigs, jobId), [allConfigs, jobId]);
  const labelOf = useCallback((c: AIInterviewResponse) => `V${interviewVersionOrdinal(c, allConfigs)}`, [allConfigs]);
  const multiJobVersions = new Set(versions.map((c) => c.jd_version ?? 1)).size > 1;
  const creators = [...new Set(versions.map((c) => c.created_by_name).filter(Boolean))] as string[];

  const filtered = versions.filter((c) => {
    if (versionFilter && c.id !== versionFilter) return false;
    if (statusFilter && normalizeStatus(c.status) !== statusFilter) return false;
    if (creatorFilter && c.created_by_name !== creatorFilter) return false;
    const t = new Date(c.created_at || 0).getTime();
    if (dateFrom && t < new Date(`${dateFrom}T00:00:00`).getTime()) return false;
    if (dateTo && t > new Date(`${dateTo}T23:59:59.999`).getTime()) return false;
    return true;
  });

  const STATUS_ORDER: Record<string, number> = { published: 0, draft: 1, archived: 2, cancelled: 3, completed: 4 };
  const sortValue = (c: AIInterviewResponse): string | number => {
    switch (sort.key) {
      case 'creator': return (c.created_by_name || '').toLowerCase();
      case 'rounds': return (c.rounds_config || []).filter((r) => r.enabled !== false).length;
      case 'status': return STATUS_ORDER[normalizeStatus(c.status)] ?? 9;
      default: return new Date(c.created_at || 0).getTime();
    }
  };
  const sorted = [...filtered].sort((a, b) => {
    const x = sortValue(a); const y = sortValue(b);
    const cmp = x < y ? -1 : x > y ? 1 : 0;
    return sort.dir === 'asc' ? cmp : -cmp;
  });
  const toggleSort = (key: SortKey) =>
    setSort((cur) => (cur.key === key ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'created' ? 'desc' : 'asc' }));

  const counts = {
    published: versions.filter((c) => normalizeStatus(c.status) === 'published').length,
    draft: versions.filter((c) => normalizeStatus(c.status) === 'draft').length,
    archived: versions.filter((c) => ['archived', 'cancelled'].includes(normalizeStatus(c.status))).length,
  };

  // Results panel: 'all' sums every version; otherwise the picked row, else
  // the latest published, else the newest.
  const showAll = selectedId === ALL_VERSIONS;
  const selected = showAll ? undefined
    : versions.find((c) => c.id === selectedId)
      ?? versions.find((c) => normalizeStatus(c.status) === 'published')
      ?? versions[0];
  const allLoaded = versions.length > 0 && versions.every((c) => stats[c.id]);
  const sel: VersionStats | undefined = showAll
    ? (allLoaded
        ? versions.reduce<VersionStats>((acc, c) => {
            const v = stats[c.id];
            (Object.keys(acc) as (keyof VersionStats)[]).forEach((k) => { acc[k] += v[k]; });
            return acc;
          }, { total: 0, invited: 0, in_progress: 0, completed: 0, terminated: 0, expired: 0, revoked: 0, pass: 0, fail: 0 })
        : undefined)
    : selected ? stats[selected.id] : undefined;

  if (!open) return null;

  const fieldClass = 'w-full sm:w-full px-3 sm:px-3 py-2 sm:py-2 rounded-lg sm:rounded-lg text-gray-900 dark:text-slate-100';

  return (
    <>
      <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm z-50" onClick={onClose} />
      <ModalA11y innerDialog onClose={() => onClose()}><div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="aiiv-history-title"
          className="pointer-events-auto bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-slate-700/60 w-full max-w-[95vw] xl:max-w-[1400px] max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-start sm:items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-gray-100 dark:border-slate-700/60">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20 flex items-center justify-center shrink-0">
                <Video className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2 id="aiiv-history-title" className="tf-section-title sm:text-lg tracking-tight">AI Interview Version History</h2>
                {/* JD ID · job name · job version */}
                <div className="flex items-center gap-2 mt-0.5 min-w-0 flex-wrap">
                  {jobShortId && <JobIdBadge>{jobShortId}</JobIdBadge>}
                  <span className="tf-body-secondary truncate">{jobTitle || 'This job'}</span>
                  {jobVersion != null && (
                    <span className="text-xs font-semibold px-1.5 py-0.5 rounded-md bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20" title="Job version">V{jobVersion}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:text-brand-blue disabled:opacity-60"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
              <IconButton bare label="Close" type="button" onClick={onClose} className="p-2 rounded-lg text-gray-500 hover:text-brand-blue hover:bg-brand-blue/5">
                <X className="w-5 h-5" />
              </IconButton>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
            {/* Stat cards */}
            <div className="tf-grid-stats">
              {[
                { label: 'Total Interview Versions', value: filtered.length === versions.length ? `${versions.length}` : `${filtered.length} / ${versions.length}`,
                  hint: filtered.length === versions.length ? undefined : 'Matching the filters / all versions', Icon: FileText, tile: 'bg-brand-blue/10 text-brand-blue', text: 'text-gray-900 dark:text-slate-50' },
                { label: 'Active', value: String(counts.published), Icon: CheckCircle, tile: 'bg-success-subtle text-success', text: 'text-success' },
                { label: 'Draft', value: String(counts.draft), Icon: Clock, tile: 'bg-warning-subtle text-warning', text: 'text-warning-strong' },
                { label: 'Archived / Disabled', value: String(counts.archived), Icon: Archive, tile: 'bg-slate-100 dark:bg-slate-800 text-gray-500', text: 'text-gray-900 dark:text-slate-50' },
              ].map(({ label, value, hint, Icon, tile, text }) => (
                <div key={label} className="tf-panel px-4 py-2.5 flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${tile}`}><Icon className="w-4 h-4" /></div>
                  <div className="min-w-0">
                    <div className="tf-meta truncate">{label}</div>
                    <div className={`text-xl font-bold tabular-nums leading-tight flex items-center gap-1.5 ${text}`}>
                      {value}
                      {hint && <span title={hint}><Info className="w-3.5 h-3.5 text-gray-500" /></span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Filters — one row above the table */}
            <div className="tf-grid-4">
              <label className="block">
                <span className="block tf-caption mb-1">Interview Version</span>
                <FilterSelect
                  value={versionFilter}
                  onChange={(v) => setVersionFilter(v)}
                  ariaLabel="Interview Version"
                  className={fieldClass}
                  options={[
                    { value: '', label: 'All Versions' },
                    ...versions.map((c) => ({ value: c.id, label: `${labelOf(c)}${multiJobVersions ? ` · Job V${c.jd_version ?? 1}` : ''} (${pillFor(c.status).label})` })),
                  ]}
                />
              </label>
              <label className="block">
                <span className="block tf-caption mb-1">Status</span>
                <FilterSelect
                  value={statusFilter}
                  onChange={(v) => setStatusFilter(v)}
                  ariaLabel="Status"
                  className={fieldClass}
                  options={[
                    { value: '', label: 'All Status' },
                    { value: 'published', label: 'Active' },
                    { value: 'draft', label: 'Draft' },
                    { value: 'archived', label: 'Archived' },
                    { value: 'cancelled', label: 'Disabled' },
                  ]}
                />
              </label>
              <label className="block">
                <span className="block tf-caption mb-1">Created By</span>
                <FilterSelect
                  value={creatorFilter}
                  onChange={(v) => setCreatorFilter(v)}
                  ariaLabel="Created By"
                  className={fieldClass}
                  options={[{ value: '', label: 'All Users' }, ...creators.map((n) => ({ value: n, label: n }))]}
                />
              </label>
              <div>
                <span className="block tf-caption mb-1">Date Range</span>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <DateField value={dateFrom} max={dateTo || undefined} onChange={setDateFrom} className="sm:flex-1 sm:min-w-0" aria-label="Created from" />
                  <span className="tf-hint text-center sm:text-left sm:flex-shrink-0">to</span>
                  <DateField value={dateTo} min={dateFrom || undefined} onChange={setDateTo} className="sm:flex-1 sm:min-w-0" aria-label="Created to" />
                </div>
              </div>
            </div>

            {loading && versions.length === 0 ? (
              <div className="py-16 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand-blue" /></div>
            ) : versions.length === 0 ? (
              <div className="py-14 text-center tf-body-muted">No AI interview has been created for this job yet.</div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4 items-stretch">
                {/* Left column: versions table, then the rate bars under it */}
                <div className="space-y-4 min-w-0">
                {/* Versions table — a FIXED five-row height: 40px header + 5 × 53px
                    rows (+2px border). Fewer versions leave the box its size;
                    more scroll inside under the sticky header. */}
                <div className={`${DESKTOP_TABLE_ONLY} rounded-xl border border-gray-100 dark:border-slate-700/60 overflow-auto h-[307px]`}>
                  <table className="w-full text-sm min-w-[900px]">
                    <thead className="sticky top-0 z-10">
                      <tr className="h-10 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 tf-meta">
                        {([
                          ['Version', 'created'], ['Created On', 'created'], ['Created By', 'creator'], ['Rounds', 'rounds'],
                          ['Invited'], ['Completed'], ['Terminated'], ['Expired'], ['Revoked'], ['Status', 'status'], ['Action'],
                        ] as [string, SortKey?][]).map(([h, key]) => {
                          const left = ['Version', 'Created On', 'Created By', 'Rounds', 'Status'].includes(h);
                          const active = !!key && sort.key === key;
                          return (
                            <th key={h} className={`px-3 py-2.5 font-semibold whitespace-nowrap text-xs text-gray-600 dark:text-slate-300 ${left ? 'text-left' : 'text-center'}`}
                              aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                              {key ? (
                                <button type="button" onClick={() => toggleSort(key)} className="inline-flex items-center gap-1 hover:text-brand-blue">
                                  {h}
                                </button>
                              ) : h}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-slate-900 divide-y divide-gray-100 dark:divide-slate-800">
                      {filtered.length === 0 && (
                        <tr><td colSpan={11} className="tf-td text-center tf-body-muted">No versions match the filters.</td></tr>
                      )}
                      {sorted.map((c) => {
                        const st = stats[c.id];
                        const rounds = (c.rounds_config || []).filter((r) => r.enabled !== false);
                        const isSel = selected?.id === c.id;
                        const pill = pillFor(c.status);
                        const num = (n: number | undefined) => (st ? n : <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground dark:text-gray-300 mx-auto" />);
                        return (
                          <tr {...clickableRowProps}
                            key={c.id}
                            onClick={() => setSelectedId(c.id)}
                            aria-selected={isSel}
                            className={`h-[53px] cursor-pointer transition-colors ${isSel
                              ? 'bg-brand-blue/[0.03] dark:bg-brand-blue/10 shadow-[inset_3px_0_0_var(--brand-blue)]'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                          >
                            <td className="tf-td whitespace-nowrap">
                              <span className="inline-flex items-center justify-center min-w-[2.25rem] px-1.5 py-0.5 rounded-md text-xs font-semibold ring-1 text-brand-cyan bg-brand-cyan/10 ring-brand-cyan/20">{labelOf(c)}</span>
                              {multiJobVersions && <div className="tf-micro-hint mt-1">Job V{c.jd_version ?? 1}</div>}
                            </td>
                            <td className="tf-td whitespace-nowrap text-gray-700 dark:text-slate-300">
                              {c.created_at ? <><div>{formatISTDate(c.created_at)}</div><div className="tf-hint">{formatISTTime(c.created_at)}</div></> : '—'}
                            </td>
                            <td className="tf-td whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <NameAvatar name={c.created_by_name} size="sm" />
                                <span className="text-gray-700 dark:text-slate-300 truncate max-w-[9rem]">{c.created_by_name || '—'}</span>
                              </div>
                            </td>
                            <td className="tf-td">
                              <div className="flex items-center gap-1 flex-nowrap whitespace-nowrap">
                                {rounds.length === 0 ? <span className="text-gray-400">—</span> : rounds.map((r, i) => (
                                  <span key={`${r.type}-${i}`} title={ROUND_LABELS[r.type] || r.type} className="px-1.5 py-0.5 rounded text-2xs font-semibold bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20">
                                    {ROUND_SHORT_LABELS[r.type] || r.type}
                                  </span>
                                ))}
                              </div>
                            </td>
                            {[st?.total, st?.completed, st?.terminated, st?.expired, st?.revoked].map((n, i) => (
                              <td key={i} className={`px-3 py-2 text-center tabular-nums font-semibold ${i === 0 ? 'text-brand-blue' : 'text-gray-900 dark:text-slate-100'}`}>{num(n)}</td>
                            ))}
                            <td className="tf-td whitespace-nowrap">
                              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ring-1 ${pill.className}`}>
                                <span className="w-1.5 h-1.5 rounded-full bg-current" />{pill.label}
                              </span>
                            </td>
                            <td className="tf-td text-center" onClick={(e) => e.stopPropagation()}>
                              <IconButton bare label={`View interview ${labelOf(c)}`} tooltip="View interview"
                                type="button"
                                onClick={() => router.push(`/recruitment/ai-interviews/${c.id}?tab=results`)}
                                className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-gray-200 dark:border-slate-700 text-gray-500 hover:text-brand-blue hover:border-brand-blue/30 hover:bg-brand-blue/5 transition-colors"
                              >
                                <Eye className="w-4 h-4" />
                              </IconButton>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <MobileRecordList
                  empty={<div className="py-6 text-center tf-body-muted">No versions match the filters.</div>}
                >
                  {sorted.map((c) => {
                    const st = stats[c.id];
                    const rounds = (c.rounds_config || []).filter((r) => r.enabled !== false);
                    const isSel = selected?.id === c.id;
                    const pill = pillFor(c.status);
                    const num = (n: number | undefined) => (st ? n : <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground dark:text-gray-300" />);
                    return (
                      <MobileRecordCard
                        key={c.id}
                        onClick={() => setSelectedId(c.id)}
                        selected={isSel}
                        aria-selected={isSel}
                        idBadge={<span className="inline-flex items-center justify-center min-w-[2.25rem] px-1.5 py-0.5 rounded-md text-xs font-semibold ring-1 text-brand-cyan bg-brand-cyan/10 ring-brand-cyan/20">{labelOf(c)}</span>}
                        badges={
                          <>
                            {multiJobVersions && <span className="tf-micro-hint">Job V{c.jd_version ?? 1}</span>}
                            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ring-1 ${pill.className}`}>
                              <span className="w-1.5 h-1.5 rounded-full bg-current" />{pill.label}
                            </span>
                          </>
                        }
                        title={
                          <span className="flex items-center gap-2 min-w-0">
                            <NameAvatar name={c.created_by_name} size="sm" />
                            <span className="truncate">{c.created_by_name || '—'}</span>
                          </span>
                        }
                        actions={
                          <IconButton bare label={`View interview ${labelOf(c)}`} tooltip="View interview"
                            type="button"
                            onClick={() => router.push(`/recruitment/ai-interviews/${c.id}?tab=results`)}
                            className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-gray-200 dark:border-slate-700 text-gray-500 hover:text-brand-blue hover:border-brand-blue/30 hover:bg-brand-blue/5 transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </IconButton>
                        }
                        fields={[
                          { label: 'Created On', value: c.created_at ? `${formatISTDate(c.created_at)} ${formatISTTime(c.created_at)}` : '—' },
                          {
                            label: 'Rounds',
                            value: rounds.length === 0 ? '—' : (
                              <span className="inline-flex items-center gap-1 flex-wrap">
                                {rounds.map((r, i) => (
                                  <span key={`${r.type}-${i}`} title={ROUND_LABELS[r.type] || r.type} className="px-1.5 py-0.5 rounded text-2xs font-semibold bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20">
                                    {ROUND_SHORT_LABELS[r.type] || r.type}
                                  </span>
                                ))}
                              </span>
                            ),
                          },
                        ]}
                        footer={
                          <>
                            <MobileStatChip tone="info">{num(st?.total)} Invited</MobileStatChip>
                            <MobileStatChip tone="success">{num(st?.completed)} Completed</MobileStatChip>
                            <MobileStatChip tone="danger">{num(st?.terminated)} Terminated</MobileStatChip>
                            <MobileStatChip tone="warning">{num(st?.expired)} Expired</MobileStatChip>
                            <MobileStatChip tone="neutral">{num(st?.revoked)} Revoked</MobileStatChip>
                          </>
                        }
                      />
                    );
                  })}
                </MobileRecordList>

                {/* Completion / Pass / Fail / Terminated rate — for the version picked in
                    Version Wise Results (a row click picks it too). */}
                {sel && (
                  <div className="rounded-xl border border-gray-100 dark:border-slate-700/60 p-4">
                    <div className="tf-meta mb-3">
                      Rates for <span className="font-semibold text-gray-700 dark:text-slate-300">{showAll ? 'All Versions' : selected ? labelOf(selected) : ''}</span>
                    </div>
                    <div className="tf-grid-4">
                      {[
                        { label: 'Completion Rate', hint: 'Completed ÷ all candidates (revoked excluded)', value: pct(sel.completed, sel.total),
                          sub: `${sel.completed} of ${sel.total} completed`, bar: 'bg-success', text: 'text-success' },
                        { label: 'Pass Rate', hint: 'Passed ÷ scored completions (Must-Have ≥ 60%)', value: pct(sel.pass, sel.pass + sel.fail),
                          sub: `${sel.pass} of ${sel.pass + sel.fail} passed`, bar: 'bg-brand-blue', text: 'text-brand-blue' },
                        { label: 'Fail Rate', hint: 'Failed ÷ scored completions (Must-Have < 60%)', value: pct(sel.fail, sel.pass + sel.fail),
                          sub: `${sel.fail} of ${sel.pass + sel.fail} failed`, bar: 'bg-destructive', text: 'text-destructive' },
                        { label: 'Terminated Rate', hint: 'Terminated ÷ all candidates (revoked excluded)', value: pct(sel.terminated, sel.total),
                          sub: `${sel.terminated} of ${sel.total} terminated`, bar: 'bg-[var(--raw-b91c1c)] dark:bg-[var(--raw-e11d48)]', text: 'text-[var(--raw-b91c1c)] dark:text-[var(--raw-e11d48)]' },
                      ].map((r) => (
                        <div key={r.label}>
                          <div className="flex items-center justify-between">
                            <span className="tf-row-title inline-flex items-center gap-1">
                              {r.label}<span title={r.hint}><Info className="w-3.5 h-3.5 text-gray-500" /></span>
                            </span>
                            <span className={`text-base font-bold tabular-nums ${r.text}`}>{r.value}%</span>
                          </div>
                          <div className="mt-1.5 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div className={`h-full rounded-full ${r.bar}`} style={{ width: `${Math.min(100, r.value)}%` }} />
                          </div>
                          <div className="tf-meta mt-1">{r.sub}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                </div>

                {/* Version Wise Results */}
                <div className="rounded-xl border border-gray-100 dark:border-slate-700/60 p-4 space-y-3 flex flex-col">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-brand-blue/10 text-brand-blue flex items-center justify-center"><BarChart3 className="w-4 h-4" /></div>
                      <span className="tf-row-title">Version Wise Results</span>
                    </div>
                    <FilterSelect
                      value={showAll ? ALL_VERSIONS : selected?.id || ''}
                      onChange={(v) => setSelectedId(v)}
                      ariaLabel="Version"
                      className="w-auto sm:w-auto text-xs px-2 sm:px-2 py-1.5 sm:py-1.5 rounded-lg sm:rounded-lg text-gray-900 dark:text-slate-100"
                      options={[
                        { value: ALL_VERSIONS, label: 'All Versions' },
                        ...versions.map((c) => ({ value: c.id, label: `${labelOf(c)} (${pillFor(c.status).label})` })),
                      ]}
                    />
                  </div>

                  {!sel ? (
                    <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-brand-blue" /></div>
                  ) : (
                    <>
                      {/* Donut (status breakdown) + legend with counts — identity is
                          never colour alone. Static: no hover highlighting; the
                          centre always shows the total. */}
                      <div className="flex flex-col items-center gap-4 flex-1 justify-center">
                        <div className="relative w-[210px] h-[210px] shrink-0">
                          {sel.total > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={RESULT_SEGMENTS.filter((seg) => sel[seg.key] > 0).map((seg) => ({ key: seg.key, name: seg.label, value: sel[seg.key] }))}
                                  dataKey="value"
                                  nameKey="name"
                                  innerRadius="66%"
                                  outerRadius="100%"
                                  startAngle={90}
                                  endAngle={-270}
                                  paddingAngle={RESULT_SEGMENTS.filter((seg) => sel[seg.key] > 0).length > 1 ? 2 : 0}
                                  cornerRadius={3}
                                  stroke="none"
                                  isAnimationActive={false}
                                >
                                  {RESULT_SEGMENTS.filter((seg) => sel[seg.key] > 0).map((seg) => (
                                    <Cell
                                      key={seg.key}
                                      className={`${seg.fill} outline-none pointer-events-none`}
                                    />
                                  ))}
                                </Pie>
                              </PieChart>
                            </ResponsiveContainer>
                          ) : (
                            <div className="w-full h-full rounded-full border-[22px] border-slate-100 dark:border-slate-800" />
                          )}
                          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                            <span className="text-3xl font-bold tabular-nums text-gray-900 dark:text-slate-50 leading-none">{sel.total}</span>
                            <span className="tf-meta mt-1 leading-tight">Total<br />Candidates</span>
                          </div>
                        </div>
                        {/* Legend: names in the left half, values in the right half,
                            split by ONE common line down the centre. */}
                        <ul className="relative w-full space-y-1.5 text-sm">
                          <li className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 !mt-0 bg-gray-200 dark:bg-slate-700" aria-hidden />
                          {RESULT_SEGMENTS.map((seg) => (
                            <li
                              key={seg.key}
                              className="grid grid-cols-2 items-center rounded"
                            >
                              <span className="flex items-center gap-2 min-w-0 pl-1 pr-3">
                                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${seg.swatch}`} />
                                <span className="truncate text-gray-600 dark:text-slate-400">{seg.label}</span>
                              </span>
                              <span className="flex items-baseline gap-1.5 pl-3 pr-1">
                                <span className="tabular-nums font-semibold text-gray-900 dark:text-slate-100">{sel[seg.key]}</span>
                                <span className="tabular-nums tf-meta">({pct(sel[seg.key], sel.total)}%)</span>
                              </span>
                            </li>
                          ))}
                          {sel.revoked > 0 && (
                            <li className="grid grid-cols-2 items-center tf-meta">
                              <span className="flex items-center gap-2 min-w-0 pl-1 pr-3">
                                <span className="w-2.5 h-2.5 shrink-0" />
                                <span className="truncate">Revoked (not counted)</span>
                              </span>
                              <span className="pl-3 pr-1 tabular-nums">{sel.revoked}</span>
                            </li>
                          )}
                        </ul>
                      </div>

                    </>
                  )}
                </div>
              </div>
            )}
          </div>

        </div>
      </div></ModalA11y>
    </>
  );
}
