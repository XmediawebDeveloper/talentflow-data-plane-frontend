'use client';

import { useMemo, useState, type RefObject } from 'react';
import { Briefcase, CheckCircle, ChevronDown, ClipboardCheck, Eye, Info, Layers, Search, Send } from 'lucide-react';
import ListPagination from '@/components/ListPagination';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import AssessmentPreviewModal from '@/components/AssessmentPreviewModal';
import AssessmentVersionHistoryPanel, {
  ASSESSMENT_VOCABULARY,
  type AssessmentVersionRow,
} from '@/components/assessments/AssessmentVersionHistoryPanel';
import { VersionPill } from '@/components/assessments/AllAssessmentsTable';
import { useJobVersionLineage } from '@/lib/hooks/useJobVersionLineage';
import { parseAssessmentTitle } from '@/lib/utils/assessmentUtils';
import { formatIST } from '@/lib/utils/dateUtils';

/**
 * The "pick one assessment to invite to" list, drawn exactly as
 * `AIInterviewPicker` draws its interviews — that picker is the reference, and
 * this is it with assessments in place of interview configs: search, the
 * Grouped/Ungrouped toggle, the "Select an …" line with its "1 selected" chip,
 * the one-per-invite note, then either
 *   - Ungrouped: one row per assessment, radio + eye (preview), pinned
 *     Select / Preview columns;
 *   - Grouped: one card per job with its Job Versions → Assessment Versions
 *     panel in select mode (the same shared panel the AI picker uses),
 * paged with the project's ListPagination.
 *
 * The host owns everything else: which assessments are offered (this lists
 * exactly the `assessments` it is given — nothing fetched, nothing filtered
 * out beyond the search), the single selection, the dialog chrome and footer.
 */

// The API rows the host already holds; typed loosely, as the host holds them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PickerAssessment = any;

interface AssessmentPickerProps {
  assessments: PickerAssessment[];
  /** The picked assessment's id, or null. */
  selectedId: string | null;
  onSelect: (assessment: PickerAssessment | null) => void;
  /** The host dialog's scroller — pagination scrolls it back to the top. */
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
  searchLabel?: string;
  searchPlaceholder?: string;
}

/* The rounds an assessment runs, as the Round Weightage column names them. */
const ROUND_CHIPS: { key: 'hr' | 'technical' | 'coding'; short: string; label: string }[] = [
  { key: 'hr', short: 'HR', label: 'HR Round' },
  { key: 'technical', short: 'TECH', label: 'Technical Round' },
  { key: 'coding', short: 'CODE', label: 'Coding Round' },
];

const PICKER_TH = 'px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 whitespace-nowrap bg-slate-50 dark:bg-slate-800';

export default function AssessmentPicker({
  assessments,
  selectedId,
  onSelect,
  scrollContainerRef,
  searchLabel = 'Search Assessments',
  searchPlaceholder = 'Search by assessment ID, name, JD ID or JD name...',
}: AssessmentPickerProps) {
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grouped' | 'ungrouped'>('ungrouped');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [previewAssessment, setPreviewAssessment] = useState<PickerAssessment | null>(null);
  const jdLineage = useJobVersionLineage();

  const cleanTitleOf = (a: PickerAssessment) => parseAssessmentTitle(a.title || '').cleanTitle;
  /* The version the API states, else the one in the title's "- Version N". */
  const versionOf = (a: PickerAssessment): number | null =>
    typeof a.version === 'number' ? a.version : parseAssessmentTitle(a.title || '').version;
  const jobNameOf = (a: PickerAssessment) => a.jd_title || cleanTitleOf(a) || 'Untitled assessment';

  /* Newest first, like the Assessments list. */
  const sorted = useMemo(
    () => assessments
      .slice()
      .sort((x, y) => new Date(y.created_at || 0).getTime() - new Date(x.created_at || 0).getTime()),
    [assessments],
  );

  /* The host dialog's own search: assessment ID, title, JD ID or JD name. */
  const q = search.trim().toLowerCase();
  const matches = (a: PickerAssessment) =>
    !q ||
    a.short_id?.toLowerCase().includes(q) ||
    a.title?.toLowerCase().includes(q) ||
    a.jd_short_id?.toLowerCase().includes(q) ||
    a.jd_title?.toLowerCase().includes(q);
  const pickerRows = sorted.filter(matches);

  /* Assessments bucketed by job version (jd_id) — the panel's child rows. */
  const byJobVersionId = useMemo(() => {
    const map = new Map<string, PickerAssessment[]>();
    for (const a of assessments) {
      if (!a.jd_id) continue;
      const bucket = map.get(a.jd_id);
      if (bucket) bucket.push(a);
      else map.set(a.jd_id, [a]);
    }
    return map;
  }, [assessments]);

  const toVersionRow = (a: PickerAssessment): AssessmentVersionRow => ({
    id: a.id,
    short_id: a.short_id,
    title: a.title,
    version: versionOf(a) ?? undefined,
    status: a.status,
    created_at: a.created_at,
    created_by_name: a.created_by_name,
    invitations_count: a.invitations_count,
    completed_count: a.completed_count,
    jd_id: a.jd_id,
    jd_version: a.jd_version,
    hr_enabled: a.hr_enabled,
    hr_percentage: a.hr_percentage,
    technical_enabled: a.technical_enabled,
    technical_percentage: a.technical_percentage,
    coding_enabled: a.coding_enabled,
    coding_percentage: a.coding_percentage,
  });
  const versionRowsFor = (jdId?: string): AssessmentVersionRow[] => {
    if (!jdId) return [];
    const lineage = jdLineage.lineages[jdId];
    if (!lineage) return [];
    return lineage.flatMap((jobVersion) =>
      (byJobVersionId.get(jobVersion.id) ?? [])
        .slice()
        .sort((a, b) => (versionOf(a) ?? 0) - (versionOf(b) ?? 0))
        .map(toVersionRow),
    );
  };

  /* Grouped view — one card per JOB, on the lineage key the Assessments list
     uses: jd_short_id names the job, jd_id names a single version. The card
     stands for the job's newest job version, then its newest assessment. */
  const lineageKeyOf = (a: PickerAssessment) => a.jd_short_id || a.jd_id || `__unlinked__:${a.id}`;
  const isNewer = (a: PickerAssessment, b: PickerAssessment) => {
    const jobDelta = (a.jd_version ?? 1) - (b.jd_version ?? 1);
    if (jobDelta !== 0) return jobDelta > 0;
    return new Date(a.created_at || 0).getTime() > new Date(b.created_at || 0).getTime();
  };
  const collapse = (list: PickerAssessment[]) => {
    const byLineage = new Map<string, PickerAssessment>();
    for (const a of list) {
      const key = lineageKeyOf(a);
      const current = byLineage.get(key);
      if (!current || isNewer(a, current)) byLineage.set(key, a);
    }
    return [...byLineage.values()];
  };
  /* Filtered BEFORE the collapse so a job stays listed when the assessment
     that matched the search is not the one representing it. */
  const jobRows = collapse(pickerRows);
  const jobCount = collapse(sorted).length;
  /* Each job card's figures, over the assessments offered here. */
  const jobTotals = new Map<string, { assessments: number; invitations: number; completed: number; maxJobVersion: number }>();
  for (const a of sorted) {
    const key = lineageKeyOf(a);
    const entry = jobTotals.get(key) ?? { assessments: 0, invitations: 0, completed: 0, maxJobVersion: 1 };
    entry.assessments += 1;
    entry.invitations += a.invitations_count ?? 0;
    entry.completed += a.completed_count ?? 0;
    entry.maxJobVersion = Math.max(entry.maxJobVersion, a.jd_version ?? 1);
    jobTotals.set(key, entry);
  }
  /** Job versions: the fetched lineage once loaded, else the newest known version. */
  const jobVersionCountOf = (a: PickerAssessment) => {
    const fetched = a.jd_id ? jdLineage.lineages[a.jd_id] : undefined;
    if (fetched?.length) return fetched.length;
    return jobTotals.get(lineageKeyOf(a))?.maxJobVersion ?? 1;
  };

  const selectedAssessment = selectedId ? assessments.find((a) => a.id === selectedId) ?? null : null;
  const selectedJobKey = selectedAssessment ? lineageKeyOf(selectedAssessment) : null;

  const total = viewMode === 'ungrouped' ? pickerRows.length : jobRows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageSlice = <T,>(list: T[]) => list.slice((safePage - 1) * pageSize, safePage * pageSize);
  const pagedRows = pageSlice(pickerRows);
  const pagedJobRows = pageSlice(jobRows);

  const statusLabel = (status?: string) => (status === 'published' ? 'Active' : status || '—');

  return (
    <>
      {/* Search */}
      <div className="mb-4">
        <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">{searchLabel}</label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" />
          <input
            type="text"
            autoFocus
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder={searchPlaceholder}
            className="w-full pl-10 pr-4 py-2 text-sm text-black dark:text-slate-100 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
          />
        </div>
      </div>

      {/* Grouped/Ungrouped — the AI Interview picker's toggle. Ungrouped: one
          row per assessment. Grouped: one card per job, versions behind View
          Versions. */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm text-gray-600 dark:text-slate-400">View:</span>
        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
          {([
            { key: 'ungrouped', label: 'Ungrouped' },
            { key: 'grouped', label: 'Grouped' },
          ] as const).map((mode) => {
            const isActive = viewMode === mode.key;
            return (
              <button
                key={mode.key}
                type="button"
                aria-pressed={isActive}
                onClick={() => { setViewMode(mode.key); onSelect(null); setPage(1); }}
                className={`px-2.5 sm:px-3 py-1.5 min-h-[32px] rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                  isActive
                    ? 'bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/10 ring-1 ring-brand-blue/20 text-brand-blue'
                    : 'text-gray-600 dark:text-slate-400 hover:text-brand-blue'
                }`}
              >
                {mode.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <label className="min-w-0 text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-300">
          Select an Assessment
          <span className="ml-2 font-normal text-gray-500 dark:text-slate-400">
            {viewMode === 'ungrouped'
              ? `${pickerRows.length} active assessment${pickerRows.length !== 1 ? 's' : ''}`
              : `${jobCount} job${jobCount !== 1 ? 's' : ''}`}
          </span>
        </label>
        {selectedId && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20">
              <CheckCircle className="w-3 h-3" />
              1 selected
            </span>
            <button
              onClick={() => onSelect(null)}
              className="text-xs text-brand-blue hover:text-brand-blue-2 font-medium"
            >
              Clear Selection
            </button>
          </div>
        )}
      </div>

      {/* Why the pick is single — the AI Interview picker's note. */}
      <div className="mb-3 flex items-start gap-2 rounded-lg bg-brand-blue/[0.06] border border-brand-blue/20 px-3 py-2.5">
        <Info className="w-4 h-4 text-brand-blue flex-shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-900 dark:text-slate-100">One assessment per invite</p>
          <p className="mt-0.5 text-xs text-gray-700 dark:text-slate-300">
            You can pick only one assessment at a time, so everyone you invite gets the same assessment. To invite people to a different assessment, send another invite.
          </p>
        </div>
      </div>

      {viewMode === 'ungrouped' ? (
        pickerRows.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-slate-400">
            <Briefcase className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-slate-700" />
            <p>{q ? 'No assessments match your search' : 'No active assessments found'}</p>
            <p className="text-sm">{q ? 'Try different search terms' : 'Create and publish an assessment first to send invitations'}</p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
            <div className="overflow-x-auto scrollbar-visible">
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 z-[6]">
                  <tr className="border-b border-gray-200 dark:border-slate-700">
                    <th className={`${PICKER_TH} w-14 tf-sticky-col-left !bg-slate-50 dark:!bg-slate-800`}>Select</th>
                    <th className={PICKER_TH}>Assessment ID</th>
                    <th className={PICKER_TH}>Job ID</th>
                    <th className={PICKER_TH}>Job Name</th>
                    <th className={PICKER_TH}>Job Version</th>
                    <th className={PICKER_TH}>Assessment Version</th>
                    <th className={PICKER_TH}>Status</th>
                    <th className={PICKER_TH}>Rounds</th>
                    <th className={PICKER_TH}>Duration</th>
                    <th className={PICKER_TH}>Invitations Sent</th>
                    <th className={PICKER_TH}>Created On</th>
                    <th className={`${PICKER_TH} pr-6`}>Created By</th>
                    <th className={`${PICKER_TH} !text-center tf-sticky-col !bg-slate-50 dark:!bg-slate-800`}>Preview</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((a) => {
                    const isSelected = selectedId === a.id;
                    const version = versionOf(a);
                    const rounds = ROUND_CHIPS.filter((r) => a[`${r.key}_enabled`]);
                    const pick = () => onSelect(isSelected ? null : a);
                    return (
                      <tr
                        key={a.id}
                        onClick={pick}
                        aria-selected={isSelected}
                        data-row-selected={isSelected ? 'true' : undefined}
                        className={`border-b border-gray-100 dark:border-slate-700/60 last:border-b-0 cursor-pointer transition-colors ${
                          isSelected ? 'bg-brand-blue/[0.06] dark:bg-brand-blue/15' : 'hover:bg-brand-blue/5 dark:hover:bg-brand-blue/10'
                        }`}
                      >
                        <td className="px-3 py-2.5 align-middle tf-sticky-col-left">
                          <input
                            type="radio"
                            name="assessment-invite-picker-selection"
                            checked={isSelected}
                            onChange={pick}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Select ${jobNameOf(a)}`}
                            className="w-4 h-4 accent-brand-blue cursor-pointer"
                          />
                        </td>
                        <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                          {a.short_id ? (
                            <span className="inline-flex items-center px-2 py-0.5 bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20 rounded text-xs font-mono font-medium">
                              {a.short_id}
                            </span>
                          ) : <span className="text-xs text-gray-400">—</span>}
                        </td>
                        <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                          {a.jd_short_id ? <JobIdBadge>{a.jd_short_id}</JobIdBadge> : <span className="text-xs text-gray-400">—</span>}
                        </td>
                        <td className="px-3 py-2.5 align-middle max-w-[16rem]">
                          {/* The job's name; the assessment's own title (version
                              suffix stripped) on hover. */}
                          <span className="block truncate font-medium text-gray-900 dark:text-slate-50" title={cleanTitleOf(a) || jobNameOf(a)}>
                            {jobNameOf(a)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                          {a.jd_version ? <VersionPill kind="job" version={a.jd_version} /> : <span className="text-xs text-gray-400">—</span>}
                        </td>
                        <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                          {version ? <VersionPill kind="assessment" version={version} /> : <span className="text-xs text-gray-400">—</span>}
                        </td>
                        <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 bg-success-subtle text-success ring-success-line">
                            <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
                            {statusLabel(a.status)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                          {rounds.length > 0 ? (
                            <div className="flex items-center gap-1.5 flex-nowrap">
                              {rounds.map((round) => (
                                <span
                                  key={round.key}
                                  title={round.label}
                                  className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-semibold whitespace-nowrap bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20 dark:bg-brand-blue/20 dark:text-blue-300 dark:ring-brand-blue/30"
                                >
                                  {round.short}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                          <span className="tabular-nums text-gray-900 dark:text-slate-100">{a.duration_minutes || 0}</span>
                          <span className="text-xs text-gray-400 ml-1">min</span>
                        </td>
                        <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                          <span className="tabular-nums text-gray-900 dark:text-slate-100">{(a.invitations_count ?? 0).toLocaleString()}</span>
                          <span className="text-xs text-gray-400 ml-1">sent</span>
                        </td>
                        <td className="px-3 py-2.5 align-middle whitespace-nowrap text-gray-600 dark:text-slate-400 tabular-nums">
                          {a.created_at ? formatIST(a.created_at) : '—'}
                        </td>
                        <td className="px-3 pr-6 py-2.5 align-middle whitespace-nowrap text-gray-600 dark:text-slate-400">
                          {a.created_by_name || '—'}
                        </td>
                        <td className="px-3 py-2.5 align-middle text-center tf-sticky-col" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => setPreviewAssessment(a)}
                            className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-gray-300 dark:border-slate-700 text-gray-600 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-brand-blue/10 hover:text-brand-blue hover:border-brand-blue/40 transition-colors"
                            aria-label="Preview assessment"
                            title="Preview"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : jobRows.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-slate-400">
          <Briefcase className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-slate-700" />
          <p>{q ? 'No jobs match your search' : 'No jobs found'}</p>
          <p className="text-sm">{q ? 'Try different search terms' : 'Create and publish an assessment first to send invitations'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pagedJobRows.map((a) => {
            const jobKey = lineageKeyOf(a);
            const jdId: string | undefined = a.jd_id;
            const ownsSelection = selectedJobKey === jobKey;
            const dimmed = !!selectedId && !ownsSelection;
            const expanded = expandedKey === jobKey;
            const totals = jobTotals.get(jobKey) ?? { assessments: 0, invitations: 0, completed: 0, maxJobVersion: 1 };
            /* The job card's four figures, in the AI picker's order and colours. */
            const rowMetrics = [
              { key: 'job-versions', icon: Layers, iconClass: 'text-brand-blue', value: jobVersionCountOf(a), label: 'Job Versions' },
              { key: 'assessments', icon: ClipboardCheck, iconClass: 'text-brand-cyan', value: totals.assessments, label: 'Assessments' },
              { key: 'invitations', icon: Send, iconClass: 'text-brand-orange', value: totals.invitations, label: 'Invitations Sent' },
              { key: 'completed', icon: CheckCircle, iconClass: 'text-menu-icon-activate', value: totals.completed, label: 'Completed' },
            ];
            const toggleExpanded = () => {
              if (!jdId) return;
              const opening = !expanded;
              setExpandedKey(opening ? jobKey : null);
              if (opening) jdLineage.ensureLoaded(jdId, jdId);
            };
            return (
              <div
                key={jobKey}
                /* Clicking the card opens its versions. */
                onClick={toggleExpanded}
                className={`@container/ai-row relative p-3 sm:p-4 rounded-xl border ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 transition-all duration-150 ${
                  jdId ? 'cursor-pointer' : 'cursor-default'
                } ${
                  ownsSelection
                    ? 'border-brand-blue/50 bg-brand-blue/[0.03] shadow-md shadow-brand-blue/10'
                    : `border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-brand-blue/30 hover:shadow-md hover:shadow-brand-blue/10 ${dimmed ? 'opacity-60' : ''}`
                }`}
              >
                <div className="flex flex-col gap-3 @4xl/ai-row:flex-row @4xl/ai-row:items-center @4xl/ai-row:gap-4">
                  {/* Identity */}
                  <div className="flex items-center gap-2.5 min-w-0 @4xl/ai-row:w-[360px] @4xl/ai-row:flex-shrink-0">
                    <div className="h-9 w-9 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Briefcase className="h-4 w-4 text-brand-blue" />
                    </div>
                    {a.jd_short_id && <JobIdBadge className="flex-shrink-0">{a.jd_short_id}</JobIdBadge>}
                    <h3 className="text-sm font-medium text-gray-900 dark:text-slate-50 truncate min-w-0" title={jobNameOf(a)}>
                      {jobNameOf(a)}
                    </h3>
                  </div>

                  {/* Status */}
                  <div className="flex-shrink-0 @4xl/ai-row:w-[104px]">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ring-1 bg-success-subtle text-success ring-success-line">
                      <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
                      {statusLabel(a.status)}
                    </span>
                  </div>

                  {/* Metrics */}
                  <div className="grid grid-cols-2 gap-x-2 gap-y-3 sm:grid-cols-4 sm:gap-x-0 sm:gap-y-0 @4xl/ai-row:flex-1 @4xl/ai-row:min-w-0">
                    {rowMetrics.map(({ key, icon: MetricIcon, iconClass, value, label }) => (
                      <div key={key} className="min-w-0 sm:px-3 sm:border-l sm:border-gray-100 dark:sm:border-slate-700/60 sm:first:border-l-0 sm:first:pl-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <MetricIcon className={`w-4 h-4 flex-shrink-0 ${iconClass}`} />
                          <span className="text-sm font-semibold text-gray-900 dark:text-slate-50 truncate">{value}</span>
                        </div>
                        <p className="text-2xs text-gray-500 dark:text-slate-500 truncate mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>

                  {/* View Versions toggle */}
                  <div
                    className="flex items-center flex-wrap gap-2 flex-shrink-0 self-start @4xl/ai-row:self-auto @4xl/ai-row:ml-auto"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {jdId ? (
                      <button
                        type="button"
                        onClick={toggleExpanded}
                        title={expanded ? 'Hide version history' : 'View version history'}
                        aria-expanded={expanded}
                        className={`h-8 px-3 inline-flex items-center gap-1.5 whitespace-nowrap border rounded-lg text-xs font-medium transition-all ${
                          expanded
                            ? 'bg-brand-blue/10 text-brand-blue border-brand-blue/30'
                            : 'bg-white dark:bg-slate-900 text-brand-blue border-brand-blue/30 hover:bg-brand-blue/5'
                        }`}
                      >
                        <span className="hidden sm:inline">{expanded ? 'Hide' : 'View'} Versions</span>
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                      </button>
                    ) : (
                      /* No job behind this assessment — pick it directly. */
                      <button
                        type="button"
                        onClick={() => onSelect(ownsSelection ? null : a)}
                        className={`h-8 px-3 inline-flex items-center gap-1.5 whitespace-nowrap border rounded-lg text-xs font-medium transition-all ${
                          ownsSelection
                            ? 'bg-brand-blue text-white border-brand-blue shadow-sm shadow-brand-blue/25 ring-1 ring-white/10'
                            : 'bg-white dark:bg-slate-900 text-brand-blue border-brand-blue/30 hover:bg-brand-blue/5'
                        }`}
                      >
                        {ownsSelection ? <><CheckCircle className="w-3.5 h-3.5" />Selected</> : 'Select'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Assessment versions — the shared panel in select mode, as in
                    the AI picker. Picking a radio makes that assessment the
                    dialog's single selection. */}
                {expanded && jdId && (
                  <div
                    className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-700/60 cursor-default"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <AssessmentVersionHistoryPanel
                      jobVersions={jdLineage.lineages[jdId]}
                      jobVersionDetails={jdLineage.versionDetails}
                      assessments={versionRowsFor(jdId)}
                      loading={jdLineage.isLoading(jdId)}
                      currentAssessmentId={a.id}
                      vocabulary={ASSESSMENT_VOCABULARY}
                      selectionGroupName="assessment-invite-picker-selection"
                      selectedAssessmentId={ownsSelection ? selectedId : undefined}
                      onSelectAssessment={(assessmentId) =>
                        onSelect(assessments.find((x) => x.id === assessmentId) ?? null)
                      }
                      /* Same preview as the Ungrouped eye. */
                      onViewAssessment={(child) =>
                        setPreviewAssessment(assessments.find((x) => x.id === child.id) ?? null)
                      }
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {total > 0 && (
        <ListPagination
          currentPage={safePage}
          itemsPerPage={pageSize}
          totalItems={total}
          onPageChange={setPage}
          onItemsPerPageChange={(size) => { setPageSize(size); setPage(1); }}
          itemLabel={viewMode === 'ungrouped' ? 'assessments' : 'jobs'}
          scrollContainerRef={scrollContainerRef}
          compact
          alwaysShow
        />
      )}

      {previewAssessment && (
        <AssessmentPreviewModal
          isOpen
          onClose={() => setPreviewAssessment(null)}
          assessment={previewAssessment}
        />
      )}
    </>
  );
}
