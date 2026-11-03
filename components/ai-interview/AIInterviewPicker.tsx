'use client';

import { useMemo, useState, type RefObject } from 'react';
import { Briefcase, CheckCircle, ChevronDown, Eye, Info, Layers, Search, Send, Video } from 'lucide-react';
import ListPagination from '@/components/ListPagination';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import AssessmentVersionHistoryPanel, {
  ASSESSMENT_VOCABULARY,
  type AssessmentVersionRow,
  type VersionHistoryVocabulary,
} from '@/components/assessments/AssessmentVersionHistoryPanel';
import { GROUPED_TABLE_TONE } from '@/components/assessments/AssessmentPicker';
import { SEGMENT_TOGGLE, segmentBtn } from '@/components/ui/filter-pills';
import ToolbarSelectAll from '@/components/ui/toolbar-select-all';
import { useJobVersionLineage } from '@/lib/hooks/useJobVersionLineage';
import { modeFromConfig } from '@/lib/constants/aiInterviewMode';
import { formatIST } from '@/lib/utils/dateUtils';
import { isJdDisabled } from '@/lib/services/aiInterviewService';
import type { AIInterviewResponse } from '@/lib/services/aiInterviewService';
import ConfigurePreviewDialog from './ConfigurePreviewDialog';
import { MobileRecordList, MobileRecordCard, MobileStatChip, DESKTOP_TABLE_ONLY } from '@/components/ui/mobile-record-card';

/**
 * The "pick one active AI interview" list shared by the AI Interview page's
 * Send Invite popup and the Invite to AI Interview flow (My Resumes, Scored
 * Resumes, resume view, Job Details). Drawn as the Invite to Assessment
 * popup's AssessmentPicker draws its list — that picker is the reference: the
 * one-per-invite note, then the toolbar (search + the Job Openings-style
 * Ungrouped/Grouped toggle), then either
 *   - Ungrouped: one row per active interview version, checkbox + eye
 *     (Configure Details preview), pinned Select / Preview columns;
 *   - Grouped: one card per job with its Job Versions → Interview Versions
 *     panel in checkbox mode,
 * paged with the project's ListPagination.
 *
 * Checkboxes in both modes. By default ONE pick (ticking a row replaces it,
 * no Select All — the assessment picker's single-pick mode). Opt-in
 * `multiple` (the Job Details invite) is the assessment picker's multi-select:
 * ticks add up, and the toolbar leads with its Select All pill. The host owns
 * the selection and everything around this list (dialog chrome, footer, and
 * sending each picked interview through the share step).
 */

export interface AIInterviewPickerSelection {
  jobKey: string;
  jdId?: string;
  interviewId: string;
}

interface AIInterviewPickerProps {
  /** Every config the host has (any status) — the list shows the active ones;
   *  the rest keep interview-version numbers and job lineages correct. */
  configs: AIInterviewResponse[];
  selection: AIInterviewPickerSelection | null;
  onSelectionChange: (selection: AIInterviewPickerSelection | null) => void;
  /** The host dialog's scroller — pagination scrolls it back to the top. */
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
  searchLabel?: string;
  /** Opt-in multi-select: several interviews, picked through `selectedIds` /
   *  `onSelectedIdsChange` (and the Select All pill) instead of `selection`. */
  multiple?: boolean;
  selectedIds?: string[];
  onSelectedIdsChange?: (ids: string[]) => void;
}

export const ROUND_LABELS: Record<string, string> = {
  hr: 'HR',
  technical: 'Technical',
  behavioral: 'Behavioral',
  culture_fit: 'Culture Fit',
  leadership: 'Leadership',
  problem_solving: 'Problem Solving',
  must_have_skills: 'Must-Have Skills',
  nice_to_have_skills: 'Nice-to-Have Skills',
};

export const ROUND_SHORT_LABELS: Record<string, string> = {
  hr: 'HR',
  technical: 'TECH',
  behavioral: 'BEH',
  culture_fit: 'CF',
  leadership: 'LEAD',
  problem_solving: 'PS',
  must_have_skills: 'MHS',
  nice_to_have_skills: 'NHS',
};

// Candidate-flow statuses are still live, published configs.
const normalizeConfigStatus = (status: string) =>
  ['invited', 'consent_pending', 'system_check', 'in_progress', 'scheduled'].includes(status) ? 'published' : status;

const getStatusLabel = (status: string) => {
  switch (normalizeConfigStatus(status)) {
    case 'published': return 'Active';
    case 'draft': return 'Draft';
    case 'completed': return 'Completed';
    case 'cancelled': return 'Cancelled';
    case 'archived': return 'Archived';
    default: return status;
  }
};

/* The shared version panel, worded for interviews. */
const INTERVIEW_VOCABULARY: VersionHistoryVocabulary = {
  ...ASSESSMENT_VOCABULARY,
  childSingular: 'Interview',
  childPlural: 'Interviews',
  childVersionsHeading: 'Interview Versions',
  childNone: 'No interview',
  detailColumn: { label: 'Mode', minW: 'min-w-[130px]' },
  extraDetailColumn: { label: 'Rounds', minW: 'min-w-[170px]' },
  statusLabel: (status?: string) => getStatusLabel(String(status ?? '')),
};

/* Header cell — the AI Talent Match results table's, class for class (its
   background and rule come from the <thead>), as in the assessment picker. */
const PICKER_TH = 'px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-slate-300 whitespace-nowrap align-middle';

const ROUND_CHIP = 'inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-semibold whitespace-nowrap bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20 dark:bg-brand-blue/20 dark:text-blue-300 dark:ring-brand-blue/30';

export default function AIInterviewPicker({
  configs,
  selection,
  onSelectionChange,
  scrollContainerRef,
  searchLabel = 'Search Jobs',
  multiple = false,
  selectedIds,
  onSelectedIdsChange,
}: AIInterviewPickerProps) {
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grouped' | 'ungrouped'>('ungrouped');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [configurePreviewId, setConfigurePreviewId] = useState<string | null>(null);
  const jdLineage = useJobVersionLineage();

  /* Configs bucketed by job version (jd_id) — the panel's child rows, and the
     interview-version ordinal (oldest first within a job version). */
  const configsByJobVersionId = useMemo(() => {
    const byJobVersion = new Map<string, AIInterviewResponse[]>();
    for (const config of configs) {
      if (!config.jd_id) continue;
      const bucket = byJobVersion.get(config.jd_id);
      if (bucket) bucket.push(config);
      else byJobVersion.set(config.jd_id, [config]);
    }
    return byJobVersion;
  }, [configs]);
  const ordinalById = useMemo(() => {
    const map = new Map<string, number>();
    for (const bucket of configsByJobVersionId.values()) {
      bucket
        .slice()
        .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime())
        .forEach((config, index) => map.set(config.id, index + 1));
    }
    return map;
  }, [configsByJobVersionId]);
  const interviewVersionOf = (c: AIInterviewResponse) => ordinalById.get(c.id) ?? 1;

  const toInterviewVersionRow = (config: AIInterviewResponse, ordinal: number): AssessmentVersionRow => ({
    id: config.id,
    short_id: config.display_id,
    title: config.jd_title || config.position,
    version: ordinal,
    status: normalizeConfigStatus(config.status),
    created_at: config.created_at,
    created_by_name: config.created_by_name,
    invitations_count: config.invitations_count,
    jd_id: config.jd_id,
    jd_version: config.jd_version,
  });
  /* Grouped: a job's ACTIVE interview versions across its job versions. */
  const interviewVersionRows = (jdId?: string): AssessmentVersionRow[] => {
    if (!jdId) return [];
    const lineage = jdLineage.lineages[jdId];
    if (!lineage) return [];
    return lineage
      .flatMap((jobVersion) =>
        (configsByJobVersionId.get(jobVersion.id) ?? [])
          .slice()
          .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime())
          .map((config, index) => toInterviewVersionRow(config, index + 1)),
      )
      .filter((row) => row.status === 'published');
  };
  /* Grouped: which job versions each opened job card shows expanded — the
     ones holding an active interview, until the reader toggles (the
     assessment picker's rule, so the checkboxes are never a click away). */
  const [jobVersionToggles, setJobVersionToggles] = useState<Record<string, number[]>>({});
  const offeredJobVersionsOf = (jdId: string): number[] => {
    const numberById = new Map((jdLineage.lineages[jdId] ?? []).map((v) => [v.id, v.version_number ?? 1] as const));
    const numbers = new Set<number>();
    for (const row of interviewVersionRows(jdId)) {
      const n = (row.jd_id ? numberById.get(row.jd_id) : undefined) ?? row.jd_version;
      if (typeof n === 'number') numbers.add(n);
    }
    return [...numbers];
  };
  const expandedJobVersionsOf = (jdId: string) => jobVersionToggles[jdId] ?? offeredJobVersionsOf(jdId);
  const toggleJobVersionOf = (jdId: string, jobVersion: number) => {
    const current = expandedJobVersionsOf(jdId);
    setJobVersionToggles((prev) => ({
      ...prev,
      [jdId]: current.includes(jobVersion) ? current.filter((n) => n !== jobVersion) : [...current, jobVersion],
    }));
  };

  /* Active interview versions, newest first, searchable by job title, Job ID
     or interview ID. */
  const q = search.trim().toLowerCase();
  // A disabled job's interviews can't take invites until it is enabled again.
  const activeConfigs = configs
    .filter((c) => normalizeConfigStatus(c.status) === 'published' && !isJdDisabled(c.jd_status))
    .sort((x, y) => new Date(y.created_at || 0).getTime() - new Date(x.created_at || 0).getTime());
  const pickerRows = activeConfigs.filter((c) =>
    !q ||
    `${c.jd_title || ''} ${c.position || ''} ${c.display_id || ''} ${c.jd_short_id || ''}`
      .toLowerCase()
      .includes(q),
  );

  /* Grouped view — one card per JOB, on the lineage key the main list uses
     (jd_short_id names the job, jd_id a single version). The card stands for
     the job's newest job version, then its newest interview. Filtered BEFORE
     the collapse so a job stays listed when the version that matched the
     search is not the one representing it. */
  const lineageKeyOf = (c: AIInterviewResponse) => c.jd_short_id || c.jd_id || `__unlinked__:${c.id}`;
  const isNewer = (a: AIInterviewResponse, b: AIInterviewResponse) => {
    const jobDelta = (a.jd_version ?? 1) - (b.jd_version ?? 1);
    if (jobDelta !== 0) return jobDelta > 0;
    return new Date(a.created_at || 0).getTime() > new Date(b.created_at || 0).getTime();
  };
  const collapse = (list: AIInterviewResponse[]) => {
    const byLineage = new Map<string, AIInterviewResponse>();
    for (const config of list) {
      const key = lineageKeyOf(config);
      const current = byLineage.get(key);
      if (!current || isNewer(config, current)) byLineage.set(key, config);
    }
    return [...byLineage.values()];
  };
  const jobRows = collapse(pickerRows);
  /* Each job card's figures, over the active interviews offered here. */
  const jobTotals = new Map<string, { interviews: number; invitations: number; completed: number; maxJobVersion: number }>();
  for (const c of activeConfigs) {
    const key = lineageKeyOf(c);
    const entry = jobTotals.get(key) ?? { interviews: 0, invitations: 0, completed: 0, maxJobVersion: 1 };
    entry.interviews += 1;
    entry.invitations += c.invitations_count ?? 0;
    entry.completed += c.completed_count ?? 0;
    entry.maxJobVersion = Math.max(entry.maxJobVersion, c.jd_version ?? 1);
    jobTotals.set(key, entry);
  }
  /** Job versions: the fetched lineage once loaded, else the newest known version. */
  const jobVersionCountOf = (c: AIInterviewResponse) => {
    const fetched = c.jd_id ? jdLineage.lineages[c.jd_id] : undefined;
    if (fetched?.length) return fetched.length;
    return jobTotals.get(lineageKeyOf(c))?.maxJobVersion ?? 1;
  };

  /* One selection model for both modes, read by both views — so the picks
     survive a view switch, as in the assessment picker. Single-select is a
     list of at most one: ticking replaces it, ticking it again clears it.
     Multi-select toggles through `onSelectedIdsChange`. */
  const pickedIds = multiple ? (selectedIds ?? []) : (selection ? [selection.interviewId] : []);
  const isPicked = (id: string) => pickedIds.includes(id);
  const pickedJobKeys = new Set(
    configs.filter((c) => pickedIds.includes(c.id)).map(lineageKeyOf),
  );
  const toggle = (c: AIInterviewResponse) => {
    if (multiple) {
      onSelectedIdsChange?.(isPicked(c.id) ? pickedIds.filter((id) => id !== c.id) : [...pickedIds, c.id]);
    } else {
      onSelectionChange(isPicked(c.id) ? null : { jobKey: c.id, jdId: c.jd_id, interviewId: c.id });
    }
  };
  /* Select All — the assessment picker's, over the interviews the search
     leaves listed (only Active ones are ever listed, so every listed row is
     eligible). Clear unticks just those, so picks the search is hiding stay
     picked (with no search, that is every pick). */
  const listedPickedCount = pickerRows.filter((c) => isPicked(c.id)).length;
  const allListedPicked = pickerRows.length > 0 && listedPickedCount === pickerRows.length;
  const addToPick = (rows: AIInterviewResponse[]) =>
    onSelectedIdsChange?.([...pickedIds, ...rows.filter((c) => !isPicked(c.id)).map((c) => c.id)]);
  const clearListed = () => {
    const listedIds = new Set(pickerRows.map((c) => c.id));
    onSelectedIdsChange?.(pickedIds.filter((id) => !listedIds.has(id)));
  };

  const total = viewMode === 'ungrouped' ? pickerRows.length : jobRows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageSlice = <T,>(list: T[]) => list.slice((safePage - 1) * pageSize, safePage * pageSize);
  const pagedRows = pageSlice(pickerRows);
  const pagedJobRows = pageSlice(jobRows);
  /* "Select all on this page": the listed rows on it — in Grouped, every
     listed interview under the jobs on it. */
  const pagedJobKeys = new Set(pagedJobRows.map(lineageKeyOf));
  const pageListedRows = viewMode === 'ungrouped' ? pagedRows : pickerRows.filter((c) => pagedJobKeys.has(lineageKeyOf(c)));

  const configOf = (id: string, jdId?: string) =>
    configsByJobVersionId.get(jdId || '')?.find((c) => c.id === id) ?? configs.find((c) => c.id === id);
  const roundsOf = (c?: AIInterviewResponse) => (c?.rounds_config || []).filter((round) => round.enabled !== false);
  const roundChips = (c?: AIInterviewResponse) => {
    const rounds = roundsOf(c);
    if (rounds.length === 0) return <span className="tf-hint">—</span>;
    return (
      <div className="flex items-center gap-1.5 flex-nowrap">
        {rounds.map((round, index) => (
          <span key={`${round.type}-${index}`} title={ROUND_LABELS[round.type] || round.type} className={ROUND_CHIP}>
            {ROUND_SHORT_LABELS[round.type] || ROUND_LABELS[round.type] || round.type}
          </span>
        ))}
      </div>
    );
  };

  return (
    <>
      {/* Why the pick is single — the assessment picker's note, in its
          banner style, above the toolbar. */}
      <div className="mb-4 flex items-start gap-2 rounded-lg bg-brand-blue/[0.06] border border-brand-blue/20 px-3 py-2.5">
        <Info className="w-4 h-4 text-brand-blue flex-shrink-0 mt-0.5" />
        <div className="min-w-0">
          {multiple ? (
            <>
              <p className="tf-caption">One or more interviews per invite</p>
              <p className="mt-0.5 tf-meta">
                You can pick several interviews, and everyone you invite gets each of them. To send different interviews to different people, send separate invites.
              </p>
            </>
          ) : (
            <>
              <p className="tf-caption">One interview per invite</p>
              <p className="mt-0.5 tf-meta">
                You can pick only one interview at a time, so everyone you invite gets the same interview. To invite people to a different interview, send another invite.
              </p>
            </>
          )}
        </div>
      </div>

      {/* The toolbar — the assessment picker's row: search taking the spare
          width, the Ungrouped/Grouped toggle keeping its own; below `sm` the
          toggle drops under the search. */}
      <div className="mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          {/* Select All — first on the row, before the search: the assessment
              picker's ToolbarSelectAll pill (this page / all / clear), with
              its partial and all-selected states. Multi-select only; a single
              pick has nothing to select all of. */}
          {multiple && (
            <div className="flex-shrink-0 self-start sm:self-auto">
              <ToolbarSelectAll
                selectedCount={pickedIds.length}
                allSelected={allListedPicked}
                pageCount={pageListedRows.length}
                onSelectPage={() => addToPick(pageListedRows)}
                totalCount={pickerRows.length}
                onSelectAll={() => addToPick(pickerRows)}
                onClear={clearListed}
                itemLabel="interviews"
              />
            </div>
          )}
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" />
            <input
              type="text"
              autoFocus
              aria-label={searchLabel}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search by job title, Job ID or interview ID..."
              className="tf-input pl-10 pr-4"
            />
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="tf-body-secondary">View:</span>
            {/* The Job Openings page's All / AI Generated / Manual segmented
                toggle: tinted track, the active option a white chip. */}
            <div className={SEGMENT_TOGGLE}>
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
                    /* The pick survives the switch; only the paging restarts. */
                    onClick={() => { setViewMode(mode.key); setPage(1); }}
                    className={`${segmentBtn(isActive)} whitespace-nowrap`}
                  >
                    {mode.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {viewMode === 'ungrouped' ? (
        pickerRows.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-slate-400">
            <Briefcase className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-slate-700" />
            <p>{q ? 'No active interviews match your search' : 'No active interviews'}</p>
            <p className="text-sm">{q ? 'Try a different job title or Job ID.' : 'Publish an AI interview to invite candidates to it.'}</p>
          </div>
        ) : (
          /* The assessment picker's Ungrouped table, class for class: the AI
             Talent Match results card, its `tf-table-shell` in the
             dialog-sized `--compact` form (pinned white header, one scroller
             for both axes, single-line cells), px-4 py-3 cells, gray-100 row
             rules, gray-50 hover, blue-50 selected tint, empty select header.
             Columns stay this picker's own. */
          <>
          <div className={`${DESKTOP_TABLE_ONLY} tf-card overflow-hidden`}>
            <div className="tf-table-shell tf-table-shell--compact">
              <table className="w-full table-auto text-sm">
                <thead className="sticky top-0 z-10 [&_th]:bg-white dark:[&_th]:bg-slate-900 [&_th]:border-b [&_th]:border-gray-200 dark:[&_th]:border-slate-700">
                  <tr>
                    <th className="tf-th-cell w-10 tf-sticky-col-left tf-th" aria-label="Select" />
                    <th className={PICKER_TH}>JD ID</th>
                    <th className={PICKER_TH}>Job Name</th>
                    <th className={PICKER_TH}>Job Version</th>
                    <th className={PICKER_TH}>Interview Version</th>
                    <th className={PICKER_TH}>Status</th>
                    <th className={PICKER_TH}>Rounds</th>
                    <th className={PICKER_TH}>Invitations Sent</th>
                    <th className={PICKER_TH}>Created On</th>
                    <th className={`${PICKER_TH} pr-6`}>Created By</th>
                    <th className={`${PICKER_TH} !text-center tf-sticky-col`}>Preview</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                  {pagedRows.map((config) => {
                    const isSelected = isPicked(config.id);
                    const pick = () => toggle(config);
                    return (
                      <tr
                        key={config.id}
                        onClick={pick}
                        aria-selected={isSelected}
                        data-row-selected={isSelected ? 'true' : undefined}
                        className={`hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors cursor-pointer ${
                          isSelected ? 'bg-blue-50 dark:bg-slate-800/50' : ''
                        }`}
                      >
                        <td className="tf-td tf-sticky-col-left">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={pick}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Select ${config.jd_title || config.position || 'interview'}`}
                            className="rounded border-gray-300 cursor-pointer"
                          />
                        </td>
                        <td className="tf-td whitespace-nowrap">
                          {config.jd_short_id ? <JobIdBadge>{config.jd_short_id}</JobIdBadge> : <span className="tf-hint">—</span>}
                        </td>
                        <td className="tf-td max-w-[16rem]">
                          <span className="block truncate font-medium text-gray-900 dark:text-slate-50" title={config.jd_title || config.position || 'Untitled'}>
                            {config.jd_title || config.position || 'Untitled'}
                          </span>
                        </td>
                        <td className="tf-td whitespace-nowrap">
                          <span className="inline-flex items-center justify-center min-w-[2.25rem] px-1.5 py-0.5 rounded-md text-xs font-semibold tabular-nums ring-1 text-brand-blue bg-brand-blue/10 ring-brand-blue/20">
                            V{config.jd_version ?? 1}
                          </span>
                        </td>
                        <td className="tf-td whitespace-nowrap">
                          <span className="inline-flex items-center justify-center min-w-[2.25rem] px-1.5 py-0.5 rounded-md text-xs font-semibold tabular-nums ring-1 text-brand-cyan bg-brand-cyan/10 ring-brand-cyan/20">
                            V{interviewVersionOf(config)}
                          </span>
                        </td>
                        <td className="tf-td whitespace-nowrap">
                          <span className="tf-badge gap-1.5 ring-1 bg-success-subtle text-success ring-success-line">
                            <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
                            Active
                          </span>
                        </td>
                        <td className="tf-td whitespace-nowrap">{roundChips(config)}</td>
                        <td className="tf-td whitespace-nowrap">
                          <span className="tabular-nums text-gray-600 dark:text-slate-400">{(config.invitations_count ?? 0).toLocaleString()}</span>
                          <span className="tf-hint ml-1">sent</span>
                        </td>
                        <td className="tf-td whitespace-nowrap text-gray-600 dark:text-slate-400 tabular-nums">
                          {config.created_at ? formatIST(config.created_at) : '—'}
                        </td>
                        <td className="tf-td pr-6 whitespace-nowrap text-gray-600 dark:text-slate-400">
                          {config.created_by_name || 'System'}
                        </td>
                        <td className="tf-td text-center tf-sticky-col" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => setConfigurePreviewId(config.id)}
                            className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-gray-300 dark:border-slate-700 text-gray-600 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-brand-blue/10 hover:text-brand-blue hover:border-brand-blue/40 transition-colors"
                            aria-label="Preview interview configuration"
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
          <MobileRecordList>
            {pagedRows.map((config) => {
              const isSelected = isPicked(config.id);
              const pick = () => toggle(config);
              return (
                <MobileRecordCard
                  key={config.id}
                  onClick={pick}
                  selected={isSelected}
                  aria-selected={isSelected}
                  select={
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={pick}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select ${config.jd_title || config.position || 'interview'}`}
                      className="rounded border-gray-300 cursor-pointer"
                    />
                  }
                  idBadge={config.jd_short_id ? <JobIdBadge>{config.jd_short_id}</JobIdBadge> : undefined}
                  badges={
                    <span className="tf-badge gap-1.5 ring-1 bg-success-subtle text-success ring-success-line">
                      <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
                      Active
                    </span>
                  }
                  title={config.jd_title || config.position || 'Untitled'}
                  actions={
                    <button
                      type="button"
                      onClick={() => setConfigurePreviewId(config.id)}
                      className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-gray-300 dark:border-slate-700 text-gray-600 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-brand-blue/10 hover:text-brand-blue hover:border-brand-blue/40 transition-colors"
                      aria-label="Preview interview configuration"
                      title="Preview"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  }
                  fields={[
                    {
                      label: 'Job Version',
                      value: (
                        <span className="inline-flex items-center justify-center min-w-[2.25rem] px-1.5 py-0.5 rounded-md text-xs font-semibold tabular-nums ring-1 text-brand-blue bg-brand-blue/10 ring-brand-blue/20">
                          V{config.jd_version ?? 1}
                        </span>
                      ),
                    },
                    {
                      label: 'Interview Version',
                      value: (
                        <span className="inline-flex items-center justify-center min-w-[2.25rem] px-1.5 py-0.5 rounded-md text-xs font-semibold tabular-nums ring-1 text-brand-cyan bg-brand-cyan/10 ring-brand-cyan/20">
                          V{interviewVersionOf(config)}
                        </span>
                      ),
                    },
                    { label: 'Rounds', value: roundChips(config) },
                    { label: 'Created On', value: config.created_at ? formatIST(config.created_at) : '—' },
                    { label: 'Created By', value: config.created_by_name || 'System' },
                  ]}
                  footer={
                    <MobileStatChip tone="info" icon={<Send className="w-3.5 h-3.5" />}>
                      {(config.invitations_count ?? 0).toLocaleString()} Sent
                    </MobileStatChip>
                  }
                />
              );
            })}
          </MobileRecordList>
          </>
        )
      ) : jobRows.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-slate-400">
          <Briefcase className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-slate-700" />
          <p>{q ? 'No jobs match your search' : 'No jobs found'}</p>
          <p className="text-sm">{q ? 'Try a different job title or Job ID.' : 'Create an AI interview against a job first.'}</p>
        </div>
      ) : (
        /* Grouped — the assessment picker's job cards, class for class. */
        <div className="space-y-3">
          {pagedJobRows.map((config) => {
            const jobKey = lineageKeyOf(config);
            const jdId = config.jd_id;
            const ownsSelection = pickedJobKeys.has(jobKey);
            /* Other jobs fade only in single-select, where a pick elsewhere
               would replace this one; multi-select can hold picks in many. */
            const dimmed = !multiple && pickedIds.length > 0 && !ownsSelection;
            const expanded = expandedKey === jobKey;
            const totals = jobTotals.get(jobKey) ?? { interviews: 0, invitations: 0, completed: 0, maxJobVersion: 1 };
            const rowMetrics = [
              { key: 'job-versions', icon: Layers, iconClass: 'text-brand-blue', value: jobVersionCountOf(config), label: 'Job Versions' },
              { key: 'interviews', icon: Video, iconClass: 'text-brand-cyan', value: totals.interviews, label: 'Interviews' },
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
                    {config.jd_short_id && <JobIdBadge className="flex-shrink-0">{config.jd_short_id}</JobIdBadge>}
                    <h3 className="tf-row-name truncate min-w-0" title={config.jd_title || config.position || 'Untitled'}>
                      {config.jd_title || config.position || 'Untitled'}
                    </h3>
                  </div>

                  {/* Status */}
                  <div className="flex-shrink-0 @4xl/ai-row:w-[104px]">
                    <span className="tf-badge gap-1.5 ring-1 bg-success-subtle text-success ring-success-line">
                      <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
                      Active
                    </span>
                  </div>

                  {/* Metrics */}
                  <div className="tf-grid-stats @4xl/ai-row:flex-1 @4xl/ai-row:min-w-0">
                    {rowMetrics.map(({ key, icon: MetricIcon, iconClass, value, label }) => (
                      <div key={key} className="min-w-0 sm:px-3 sm:border-l sm:border-gray-100 dark:sm:border-slate-700/60 sm:first:border-l-0 sm:first:pl-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <MetricIcon className={`w-4 h-4 flex-shrink-0 ${iconClass}`} />
                          <span className="tf-row-title truncate">{value}</span>
                        </div>
                        <p className="tf-micro-hint truncate mt-0.5">{label}</p>
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
                      /* No job behind this interview — pick it directly. */
                      <button
                        type="button"
                        onClick={() => toggle(config)}
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

                {/* Interview versions — the shared panel in checkbox mode with
                    the assessment picker's table tone. In single-select its
                    list holds at most the one pick, so ticking replaces it. */}
                {expanded && jdId && (
                  <div
                    className={`mt-3 pt-3 border-t border-gray-100 dark:border-slate-700/60 cursor-default ${GROUPED_TABLE_TONE}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <AssessmentVersionHistoryPanel
                      jobVersions={jdLineage.lineages[jdId]}
                      jobVersionDetails={jdLineage.versionDetails}
                      assessments={interviewVersionRows(jdId)}
                      loading={jdLineage.isLoading(jdId)}
                      currentAssessmentId={config.id}
                      vocabulary={INTERVIEW_VOCABULARY}
                      selectionGroupName="ai-interview-invite-picker-selection"
                      expandedJobVersions={expandedJobVersionsOf(jdId)}
                      onToggleJobVersion={(jobVersion) => toggleJobVersionOf(jdId, jobVersion)}
                      selectedAssessmentIds={pickedIds}
                      onSelectAssessment={(interviewId) => {
                        const picked = configOf(interviewId);
                        if (picked) toggle(picked);
                      }}
                      /* Mode and Rounds — the Active tab's two columns. */
                      renderChildDetail={(child) => {
                        const source = configOf(child.id, child.jd_id);
                        if (!source) return <span className="tf-body-muted">&mdash;</span>;
                        const mode = modeFromConfig(source.special_instructions, source.duration_minutes);
                        return (
                          <span className="tf-row-name">
                            {mode === 'fixed' ? 'Timed' : 'Conversational'}
                          </span>
                        );
                      }}
                      renderChildExtraDetail={(child) => roundChips(configOf(child.id, child.jd_id))}
                      /* Same Configure Details preview as the Ungrouped eye. */
                      onViewAssessment={(child) => setConfigurePreviewId(child.id)}
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
          itemLabel={viewMode === 'ungrouped' ? 'interviews' : 'jobs'}
          scrollContainerRef={scrollContainerRef}
          compact
          alwaysShow
        />
      )}

      {configurePreviewId && (
        <ConfigurePreviewDialog configId={configurePreviewId} onClose={() => setConfigurePreviewId(null)} />
      )}
    </>
  );
}
