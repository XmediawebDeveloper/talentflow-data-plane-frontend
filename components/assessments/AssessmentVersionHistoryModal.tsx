'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Archive, BarChart3, CheckCircle, ClipboardList, Clock, Eye, FileText, Info, Loader2,
  RefreshCw, X
} from 'lucide-react';
import { showErrorToast } from '@/lib/utils/errorToast';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { assessmentService, type AssessmentResponse } from '@/lib/services/assessmentService';
import { loadJobAssessmentHierarchy } from '@/lib/utils/jobAssessmentHierarchy';
import { formatISTDate, formatISTTime } from '@/lib/utils/dateUtils';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { DateField } from '@/components/ui/date-field';
import FilterSelect from '@/components/ui/filter-select';
import FilterChips, { type FilterChip } from '@/components/ui/filter-chips';
import NameAvatar from '@/components/ui/name-avatar';
import { MobileRecordList, MobileRecordCard, MobileStatChip, DESKTOP_TABLE_ONLY } from '@/components/ui/mobile-record-card';

/* ── Status palette for the results donut ─────────────────────────────
   Invited · Completed · In Progress · Revoked · Expired. Validated (dataviz
   validate_palette.js) as a RING — the wrap pair (Expired → Invited)
   included — in exactly this order: all checks PASS in dark (#0f172a); in
   light (#fff) all PASS with one contrast WARN on the orange, relieved by the
   always-visible legend with counts. Green only borders blue and cyan.
   Revoked is violet, as on the invite cards. `fill` is a CSS class so it
   wins over the SVG attribute and follows dark mode. */
const RESULT_SEGMENTS = [
  { key: 'invited', label: 'Invited', swatch: 'bg-[#2563eb] dark:bg-[#3b82f6]', fill: 'fill-[#2563eb] dark:fill-[#3b82f6]' },
  { key: 'completed', label: 'Completed', swatch: 'bg-[#16a34a] dark:bg-[#16a34a]', fill: 'fill-[#16a34a] dark:fill-[#16a34a]' },
  { key: 'in_progress', label: 'In Progress', swatch: 'bg-[#079cc4] dark:bg-[#0891b2]', fill: 'fill-[#079cc4] dark:fill-[#0891b2]' },
  { key: 'revoked', label: 'Revoked', swatch: 'bg-[#7c3aed] dark:bg-[#a855f7]', fill: 'fill-[#7c3aed] dark:fill-[#a855f7]' },
  { key: 'expired', label: 'Expired', swatch: 'bg-[#ed881c] dark:bg-[#d97706]', fill: 'fill-[#ed881c] dark:fill-[#d97706]' },
] as const;
type SortKey = 'created' | 'creator' | 'status';
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
  /* Per-round Pass / Fail from completed results — flat, so the All Versions
     reduce adds them like every other counter. */
  technical_pass: number; technical_fail: number;
  coding_pass: number; coding_fail: number;
  hr_pass: number; hr_fail: number;
}
const EMPTY_STATS: VersionStats = {
  total: 0, invited: 0, in_progress: 0, completed: 0, terminated: 0, expired: 0, revoked: 0, pass: 0, fail: 0,
  technical_pass: 0, technical_fail: 0, coding_pass: 0, coding_fail: 0, hr_pass: 0, hr_fail: 0,
};

const normalizeStatus = (status: string) => String(status || '').toLowerCase();
const STATUS_PILL: Record<string, { label: string; className: string }> = {
  published: { label: 'Active', className: 'bg-success-subtle text-success-strong ring-success-line' },
  draft: { label: 'Draft', className: 'bg-warning-subtle text-warning-strong ring-warning-line' },
  archived: { label: 'Archived', className: 'bg-slate-100 text-gray-600 ring-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700' },
  closed: { label: 'Completed', className: 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20' },
};

/* An assessment's rounds are on/off flags, not a list. */
const ROUND_LABELS: Record<string, string> = { technical: 'Technical', coding: 'Coding', hr: 'HR' };
const ROUND_SHORT_LABELS: Record<string, string> = { technical: 'TECH', coding: 'CODE', hr: 'HR' };
const roundsOf = (a: AssessmentResponse) =>
  (['technical', 'coding', 'hr'] as const)
    .filter((k) => (k === 'technical' ? a.technical_enabled : k === 'coding' ? a.coding_enabled : a.hr_enabled))
    .map((type) => ({ type }));
/** The Assessments module's pass mark when an assessment sets none. */
const DEFAULT_PASS_MARK = 70;
const pillFor = (status: string) => STATUS_PILL[normalizeStatus(status)] ?? { label: status, className: STATUS_PILL.archived.className };
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

/** One assessment's invite funnel (from its invitations) and Pass / Fail
 *  (from its completed results: the result's own `passed`, else every scored
 *  enabled round at or above the pass mark - the Assessments module's rule). */
async function loadStats(a: AssessmentResponse): Promise<VersionStats> {
  const s: VersionStats = { ...EMPTY_STATS };
  for (let page = 1; page <= 20; page += 1) {
    const res = await assessmentService.listInvitations(a.id, { page, page_size: 100 });
    for (const inv of res.items || []) {
      const status = String(inv.status || '').toLowerCase();
      if (status === 'revoked') { s.revoked += 1; continue; }
      s.total += 1;
      // sent / pending / bounced -> invited; opened (system check) / started -> in progress;
      // abandoned / failed -> terminated.
      const bucket = ['opened', 'started', 'in_progress'].includes(status) ? 'in_progress'
        : status === 'completed' ? 'completed'
        : status === 'expired' ? 'expired'
        : ['abandoned', 'failed', 'terminated'].includes(status) ? 'terminated'
        : 'invited';
      (s as unknown as Record<string, number>)[bucket] += 1;
    }
    if ((res.items || []).length < 100 || page >= (res.total_pages || 1)) break;
  }
  const passMark = Number((a as unknown as { passing_threshold?: number }).passing_threshold) || DEFAULT_PASS_MARK;
  const rounds = roundsOf(a).map((r) => r.type);
  for (let page = 1; page <= 20; page += 1) {
    const res = await assessmentService.listResults(a.id, { page, page_size: 100, status_filter: 'completed' });
    const items = (res as unknown as { items?: Record<string, unknown>[] }).items || [];
    for (const r of items) {
      // Each enabled round: pass at a score >= the pass mark.
      for (const k of rounds) {
        const raw = r[`${k}_score`];
        if (raw === null || raw === undefined || raw === '') continue;
        const score = Number(raw);
        if (!Number.isFinite(score)) continue;
        (s as unknown as Record<string, number>)[`${k}_${score >= passMark ? 'pass' : 'fail'}`] += 1;
      }
      let passed: boolean | null = typeof r.passed === 'boolean' ? r.passed : null;
      if (passed === null) {
        const scores = rounds
          .map((k) => r[`${k}_score`])
          .filter((v) => v !== null && v !== undefined && v !== '')
          .map(Number)
          .filter(Number.isFinite);
        if (scores.length > 0) passed = scores.every((v) => v >= passMark);
      }
      if (passed === true) s.pass += 1;
      else if (passed === false) s.fail += 1;
    }
    const totalPages = (res as unknown as { total_pages?: number }).total_pages || 1;
    if (items.length < 100 || page >= totalPages) break;
  }
  return s;
}

/**
 * Assessment Version History for one job - the same layout as the AI Interview
 * Version History dialog: every assessment version with its invite funnel and
 * pass rate, plus a per-version results panel. Opened from the Job Details
 * page's Assessment quick-actions heading.
 */
export default function AssessmentVersionHistoryModal({
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
  const [allConfigs, setAllConfigs] = useState<AssessmentResponse[]>([]);
  const [stats, setStats] = useState<Record<string, VersionStats>>({});
  /** Job version per assessment, from the job lineage (the row's own
   *  jd_version snapshot often reads 1 for later job versions). */
  const [jobVersionById, setJobVersionById] = useState<Record<string, number>>({});
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

  const load = useCallback(async function loadHistory(): Promise<void> {
    setLoading(true);
    try {
      const hierarchy = await loadJobAssessmentHierarchy(jobId);
      const all = [...hierarchy.assessments];
      setAllConfigs(all);
      setJobVersionById(Object.fromEntries(hierarchy.jobVersionByAssessmentId));
      const entries = await Promise.all(all.map(async (c) => [c.id, await loadStats(c).catch(() => null)] as const));
      setStats(Object.fromEntries(entries.filter(([, v]) => v !== null)) as Record<string, VersionStats>);
    } catch (error) {
      showErrorToast(error, "Couldn't load the assessment version history", {
        id: 'assessment-version-history-modal-load',
        retry: () => loadHistory(),
      });
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

  const versions = useMemo(
    () => [...allConfigs].sort((x, y) => new Date(y.created_at || 0).getTime() - new Date(x.created_at || 0).getTime()),
    [allConfigs],
  );
  const labelOf = useCallback((c: AssessmentResponse) => `V${c.version ?? 1}`, []);
  const jobVersionOf = (c: AssessmentResponse) => jobVersionById[c.id] ?? c.jd_version ?? 1;
  const multiJobVersions = new Set(versions.map(jobVersionOf)).size > 1;
  const shownRounds = (['technical', 'coding'] as const).filter((k) => versions.some((c) => roundsOf(c).some((r) => r.type === k)));
  const creators = [...new Set(versions.map((c) => c.created_by_name).filter(Boolean))] as string[];

  /* Active filter tags — one per filter row control, the date range as one. */
  const STATUS_CHIP_LABELS: Record<string, string> = { published: 'Active', draft: 'Draft', closed: 'Completed', archived: 'Archived' };
  const formatChipDate = (v: string) => {
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00` : v);
    return Number.isNaN(d.getTime())
      ? v
      : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  const versionChipConfig = versionFilter ? versions.find((c) => String(c.id) === versionFilter) : undefined;
  const activeFilterChips: FilterChip[] = [
    !!versionFilter && {
      key: 'version',
      label: 'Version',
      value: versionChipConfig
        ? `${labelOf(versionChipConfig)}${multiJobVersions ? ` · Job V${jobVersionOf(versionChipConfig)}` : ''}`
        : versionFilter,
      onRemove: () => setVersionFilter(''),
    },
    !!statusFilter && { key: 'status', label: 'Status', value: STATUS_CHIP_LABELS[statusFilter] ?? statusFilter, onRemove: () => setStatusFilter('') },
    !!creatorFilter && { key: 'creator', label: 'Created By', value: creatorFilter, onRemove: () => setCreatorFilter('') },
    !!(dateFrom || dateTo) && {
      key: 'date',
      label: 'Date',
      value: dateFrom && dateTo
        ? `${formatChipDate(dateFrom)} – ${formatChipDate(dateTo)}`
        : dateFrom ? `From ${formatChipDate(dateFrom)}` : `Until ${formatChipDate(dateTo)}`,
      onRemove: () => { setDateFrom(''); setDateTo(''); },
    },
  ].filter(Boolean) as FilterChip[];

  const filtered = versions.filter((c) => {
    if (versionFilter && c.id !== versionFilter) return false;
    if (statusFilter && normalizeStatus(c.status) !== statusFilter) return false;
    if (creatorFilter && c.created_by_name !== creatorFilter) return false;
    const t = new Date(c.created_at || 0).getTime();
    if (dateFrom && t < new Date(`${dateFrom}T00:00:00`).getTime()) return false;
    if (dateTo && t > new Date(`${dateTo}T23:59:59.999`).getTime()) return false;
    return true;
  });

  const STATUS_ORDER: Record<string, number> = { published: 0, draft: 1, closed: 2, archived: 3 };
  const sortValue = (c: AssessmentResponse): string | number => {
    switch (sort.key) {
      case 'creator': return (c.created_by_name || '').toLowerCase();
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
    archived: versions.filter((c) => ['archived', 'closed'].includes(normalizeStatus(c.status))).length,
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
          }, { ...EMPTY_STATS })
        : undefined)
    : selected ? stats[selected.id] : undefined;
  const donutTotal = sel ? RESULT_SEGMENTS.reduce((n, seg) => n + sel[seg.key], 0) : 0;

  if (!open) return null;

  const fieldClass = 'w-full sm:w-full py-2 sm:py-2 pl-3 sm:pl-3 pr-3 sm:pr-3 rounded-lg sm:rounded-lg text-gray-900 dark:text-slate-100';

  return (
    <>
      <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="asmt-history-title"
          className="pointer-events-auto bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-slate-700/60 w-full max-w-[95vw] xl:max-w-[1400px] max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-start sm:items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-gray-100 dark:border-slate-700/60">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/20 flex items-center justify-center shrink-0">
                <ClipboardList className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2 id="asmt-history-title" className="tf-section-title sm:text-lg tracking-tight">Assessment Version History</h2>
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
              <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-lg text-gray-500 hover:text-brand-blue hover:bg-brand-blue/5">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
            {/* Stat cards */}
            <div className="tf-grid-stats">
              {[
                { label: 'Assessment Versions', value: filtered.length === versions.length ? `${versions.length}` : `${filtered.length} / ${versions.length}`,
                  hint: filtered.length === versions.length ? undefined : 'Matching the filters / all versions', Icon: FileText, tile: 'bg-brand-blue/10 text-brand-blue', text: 'text-gray-900 dark:text-slate-50' },
                { label: 'Active', value: String(counts.published), Icon: CheckCircle, tile: 'bg-success-subtle text-success', text: 'text-success' },
                { label: 'Draft', value: String(counts.draft), Icon: Clock, tile: 'bg-warning-subtle text-warning', text: 'text-warning-strong' },
                { label: 'Archived / Completed', value: String(counts.archived), Icon: Archive, tile: 'bg-slate-100 dark:bg-slate-800 text-gray-500', text: 'text-gray-900 dark:text-slate-50' },
              ].map(({ label, value, hint, Icon, tile, text }) => (
                <div key={label} className="tf-panel px-4 py-2.5 flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${tile}`}><Icon className="w-4 h-4" /></div>
                  <div className="min-w-0">
                    <div className="tf-meta truncate">{label}</div>
                    <div className={`text-xl font-bold tabular-nums leading-tight flex items-center gap-1.5 ${text}`}>
                      {value}
                      {hint && <span title={hint}><Info className="w-3.5 h-3.5 text-gray-400" /></span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Filters — one row above the table */}
            <div className="tf-grid-4">
              <label className="block">
                <span className="block tf-caption mb-1">Version</span>
                <FilterSelect
                  value={versionFilter}
                  onChange={setVersionFilter}
                  ariaLabel="Version"
                  options={[
                    { value: '', label: 'All Versions' },
                    ...versions.map((c) => ({
                      value: String(c.id),
                      label: `${labelOf(c)}${multiJobVersions ? ` · Job V${jobVersionOf(c)}` : ''} (${pillFor(c.status).label})`,
                    })),
                  ]}
                  className={fieldClass}
                />
              </label>
              <label className="block">
                <span className="block tf-caption mb-1">Status</span>
                <FilterSelect
                  value={statusFilter}
                  onChange={setStatusFilter}
                  ariaLabel="Status"
                  options={[
                    { value: '', label: 'All Status' },
                    { value: 'published', label: 'Active' },
                    { value: 'draft', label: 'Draft' },
                    { value: 'closed', label: 'Completed' },
                    { value: 'archived', label: 'Archived' },
                  ]}
                  className={fieldClass}
                />
              </label>
              <label className="block">
                <span className="block tf-caption mb-1">Created By</span>
                <FilterSelect
                  value={creatorFilter}
                  onChange={setCreatorFilter}
                  ariaLabel="Created By"
                  options={[{ value: '', label: 'All Users' }, ...creators.map((n) => ({ value: String(n), label: String(n) }))]}
                  className={fieldClass}
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
            {activeFilterChips.length > 0 && (
              <FilterChips className="!mt-3" chips={activeFilterChips} />
            )}

            {loading && versions.length === 0 ? (
              <div className="py-16 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand-blue" /></div>
            ) : versions.length === 0 ? (
              <div className="py-14 text-center tf-body-muted">No assessment has been created for this job yet.</div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4 items-stretch">
                {/* Left column: versions table, then the rate bars under it */}
                <div className="space-y-4 min-w-0">
                {/* Versions table — a FIXED five-row height: 72px two-line header
                    + 5 × 53px rows (+2px border). Fewer versions leave the box
                    its size; more scroll inside under the sticky header.
                    Assessment columns: invite funnel, then a Pass / Fail pair
                    per scored round (TECH / CODE). */}
                <div className={`${DESKTOP_TABLE_ONLY} rounded-xl border border-gray-100 dark:border-slate-700/60 overflow-auto h-[339px]`}>
                  <table className="w-full text-sm min-w-[820px]">
                    <thead className="sticky top-0 z-10 bg-white dark:bg-slate-900 tf-meta">
                      <tr className="h-9">
                        {([['Version', 'created'], ['Created On', 'created'], ['Created By', 'creator']] as [string, SortKey][]).map(([h, key]) => (
                          <th key={h} rowSpan={2} className="tf-th-cell font-semibold text-left" aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                            <button type="button" onClick={() => toggleSort(key)} className="inline-flex items-center gap-1 hover:text-brand-blue">
                              {h}
                            </button>
                          </th>
                        ))}
                        <th rowSpan={2} className="tf-th-cell font-semibold text-center">Invited</th>
                        <th rowSpan={2} className="tf-th-cell font-semibold text-center">Completed</th>
                        {shownRounds.map((k) => (
                          <th key={k} colSpan={2} className="tf-th-cell font-semibold text-center border-l border-white/70 dark:border-slate-700" title={`${ROUND_LABELS[k]} round`}>
                            {ROUND_SHORT_LABELS[k]}
                          </th>
                        ))}
                        <th rowSpan={2} className="tf-th-cell font-semibold text-center">Expired</th>
                        <th rowSpan={2} className="tf-th-cell font-semibold text-left" aria-sort={sort.key === 'status' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                          <button type="button" onClick={() => toggleSort('status')} className="inline-flex items-center gap-1 hover:text-brand-blue">
                            Status
                          </button>
                        </th>
                        <th rowSpan={2} className="tf-th-cell font-semibold text-center">Action</th>
                      </tr>
                      <tr className="h-9 border-b border-gray-200 dark:border-slate-700 tf-meta">
                        {shownRounds.map((k) => (
                          <th key={k} colSpan={2} className="p-0 font-semibold border-l border-white/70 dark:border-slate-700">
                            <div className="grid grid-cols-2"><span>Pass</span><span>Fail</span></div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-slate-900 divide-y divide-gray-100 dark:divide-slate-800">
                      {filtered.length === 0 && (
                        <tr><td colSpan={7 + shownRounds.length * 2} className="tf-td text-center tf-body-muted">No versions match the filters.</td></tr>
                      )}
                      {sorted.map((c) => {
                        const st = stats[c.id];
                        const isSel = selected?.id === c.id;
                        const pill = pillFor(c.status);
                        const spin = <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-300 mx-auto" />;
                        const enabled = new Set(roundsOf(c).map((r) => r.type));
                        return (
                          <tr
                            key={c.id}
                            onClick={() => setSelectedId(c.id)}
                            aria-selected={isSel}
                            className={`h-[53px] cursor-pointer transition-colors ${isSel
                              ? 'bg-brand-blue/[0.03] dark:bg-brand-blue/10 shadow-[inset_3px_0_0_var(--brand-blue)]'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                          >
                            <td className="tf-td whitespace-nowrap">
                              <span className="inline-flex items-center justify-center min-w-[2.25rem] px-1.5 py-0.5 rounded-md text-xs font-semibold ring-1 text-brand-cyan bg-brand-cyan/10 ring-brand-cyan/20">{labelOf(c)}</span>
                              {multiJobVersions && <div className="tf-micro-hint mt-1">Job V{jobVersionOf(c)}</div>}
                            </td>
                            <td className="tf-td whitespace-nowrap text-gray-700 dark:text-slate-300">
                              {c.created_at ? <><div>{formatISTDate(c.created_at)}</div><div className="tf-hint">{formatISTTime(c.created_at)}</div></> : '—'}
                            </td>
                            <td className="tf-td whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <NameAvatar name={c.created_by_name} size="sm" />
                                <span className="text-gray-700 dark:text-slate-300 truncate max-w-[8rem]">{c.created_by_name || '—'}</span>
                              </div>
                            </td>
                            <td className="tf-td text-center tabular-nums font-semibold text-brand-blue">{st ? st.total : spin}</td>
                            <td className="tf-td text-center tabular-nums font-semibold text-gray-900 dark:text-slate-100">{st ? st.completed : spin}</td>
                            {shownRounds.map((k) => (
                              <td key={k} colSpan={2} className="tf-td border-l border-gray-100 dark:border-slate-800">
                                {!enabled.has(k) ? <div className="text-center text-gray-300 dark:text-slate-600">—</div> : !st ? spin : (
                                  <div className="grid grid-cols-2 gap-1.5">
                                    <span className="text-center rounded-md py-1 text-xs font-semibold tabular-nums bg-success-subtle text-success-strong" title="Pass">
                                      {(st as unknown as Record<string, number>)[`${k}_pass`]}
                                    </span>
                                    <span className="text-center rounded-md py-1 text-xs font-semibold tabular-nums bg-destructive-subtle text-destructive" title="Fail">
                                      {(st as unknown as Record<string, number>)[`${k}_fail`]}
                                    </span>
                                  </div>
                                )}
                              </td>
                            ))}
                            <td className="tf-td text-center tabular-nums font-semibold text-gray-900 dark:text-slate-100">{st ? st.expired : spin}</td>
                            <td className="tf-td whitespace-nowrap">
                              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ring-1 ${pill.className}`}>
                                <span className="w-1.5 h-1.5 rounded-full bg-current" />{pill.label}
                              </span>
                            </td>
                            <td className="tf-td text-center" onClick={(e) => e.stopPropagation()}>
                              <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => router.push(`/recruitment/assessments/${c.id}?tab=results`)}
                                title="View assessment"
                                aria-label={`View assessment ${labelOf(c)}`}
                                className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-gray-200 dark:border-slate-700 text-gray-500 hover:text-brand-blue hover:border-brand-blue/30 hover:bg-brand-blue/5 transition-colors"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <MobileRecordList
                  empty={filtered.length === 0 ? <div className="tf-record-card text-center tf-body-muted">No versions match the filters.</div> : undefined}
                >
                  {sorted.map((c) => {
                    const st = stats[c.id];
                    const isSel = selected?.id === c.id;
                    const pill = pillFor(c.status);
                    const spin = <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-300" />;
                    const enabled = new Set(roundsOf(c).map((r) => r.type));
                    return (
                      <MobileRecordCard
                        key={c.id}
                        selected={isSel}
                        aria-selected={isSel}
                        onClick={() => setSelectedId(c.id)}
                        idBadge={
                          <span className="inline-flex items-center justify-center min-w-[2.25rem] px-1.5 py-0.5 rounded-md text-xs font-semibold ring-1 text-brand-cyan bg-brand-cyan/10 ring-brand-cyan/20">{labelOf(c)}</span>
                        }
                        badges={
                          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ring-1 ${pill.className}`}>
                            <span className="w-1.5 h-1.5 rounded-full bg-current" />{pill.label}
                          </span>
                        }
                        title={
                          <span className="flex min-w-0 items-center gap-2">
                            <NameAvatar name={c.created_by_name} size="sm" />
                            <span className="truncate">{c.created_by_name || '—'}</span>
                          </span>
                        }
                        actions={
                          <button
                            type="button"
                            onClick={() => router.push(`/recruitment/assessments/${c.id}?tab=results`)}
                            title="View assessment"
                            aria-label={`View assessment ${labelOf(c)}`}
                            className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-gray-200 dark:border-slate-700 text-gray-500 hover:text-brand-blue hover:border-brand-blue/30 hover:bg-brand-blue/5 transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        }
                        fields={[
                          { label: 'Created', value: c.created_at ? `${formatISTDate(c.created_at)} ${formatISTTime(c.created_at)}` : '—' },
                          { label: 'Job Version', value: multiJobVersions ? `V${jobVersionOf(c)}` : null },
                          ...shownRounds.map((k) => ({
                            label: ROUND_SHORT_LABELS[k],
                            value: !enabled.has(k) ? '—' : !st ? spin : (
                              <span className="inline-flex items-center gap-1.5">
                                <span className="rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums bg-success-subtle text-success-strong" title="Pass">
                                  Pass {(st as unknown as Record<string, number>)[`${k}_pass`]}
                                </span>
                                <span className="rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums bg-destructive-subtle text-destructive" title="Fail">
                                  Fail {(st as unknown as Record<string, number>)[`${k}_fail`]}
                                </span>
                              </span>
                            ),
                          })),
                        ]}
                        footer={
                          <>
                            <MobileStatChip tone="info">Invited {st ? st.total : spin}</MobileStatChip>
                            <MobileStatChip tone="success">Completed {st ? st.completed : spin}</MobileStatChip>
                            <MobileStatChip tone="neutral">Expired {st ? st.expired : spin}</MobileStatChip>
                          </>
                        }
                      />
                    );
                  })}
                </MobileRecordList>

                {/* Completion / Pass / Fail rate — for the version picked in
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
                        { label: 'Pass Rate', hint: `Passed ÷ scored completions (round scores ≥ ${DEFAULT_PASS_MARK}% unless the assessment sets its own pass mark)`, value: pct(sel.pass, sel.pass + sel.fail),
                          sub: `${sel.pass} of ${sel.pass + sel.fail} passed`, bar: 'bg-brand-blue', text: 'text-brand-blue' },
                        { label: 'Fail Rate', hint: 'Failed ÷ scored completions (below the pass mark)', value: pct(sel.fail, sel.pass + sel.fail),
                          sub: `${sel.fail} of ${sel.pass + sel.fail} failed`, bar: 'bg-destructive', text: 'text-destructive' },
                        { label: 'Terminated Rate', hint: 'Terminated ÷ all candidates (revoked excluded)', value: pct(sel.terminated, sel.total),
                          sub: `${sel.terminated} of ${sel.total} terminated`, bar: 'bg-[#b91c1c] dark:bg-[#e11d48]', text: 'text-[#b91c1c] dark:text-[#e11d48]' },
                      ].map((r) => (
                        <div key={r.label}>
                          <div className="flex items-center justify-between">
                            <span className="tf-row-title inline-flex items-center gap-1">
                              {r.label}<span title={r.hint}><Info className="w-3.5 h-3.5 text-gray-400" /></span>
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
                      value={showAll ? ALL_VERSIONS : String(selected?.id || '')}
                      onChange={(v) => setSelectedId(v)}
                      ariaLabel="Version"
                      options={[
                        { value: ALL_VERSIONS, label: 'All Versions' },
                        ...versions.map((c) => ({ value: String(c.id), label: `${labelOf(c)} (${pillFor(c.status).label})` })),
                      ]}
                      className="w-auto sm:w-auto py-1.5 sm:py-1.5 pl-2 sm:pl-2 pr-2 sm:pr-2 gap-1 rounded-lg sm:rounded-lg text-xs text-gray-900 dark:text-slate-100"
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
                          {donutTotal > 0 ? (
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
                            <span className="text-3xl font-bold tabular-nums text-gray-900 dark:text-slate-50 leading-none">{donutTotal}</span>
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
                                <span className="tabular-nums tf-meta">({pct(sel[seg.key], donutTotal)}%)</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>

                    </>
                  )}
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </>
  );
}
