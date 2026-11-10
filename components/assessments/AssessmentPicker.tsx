'use client';

import { useEffect, useMemo, useState, type RefObject } from 'react';
import { Briefcase, CheckCircle, ChevronDown, ClipboardCheck, Eye, Info, Layers, Search, Send } from 'lucide-react';
import ListPagination from '@/components/ListPagination';
import ToolbarSelectAll from '@/components/ui/toolbar-select-all';
import { SEGMENT_TOGGLE, segmentBtn } from '@/components/ui/filter-pills';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import AssessmentPreviewModal from '@/components/AssessmentPreviewModal';
import AssessmentVersionHistoryPanel, {
  ASSESSMENT_VOCABULARY,
  type AssessmentVersionRow,
} from '@/components/assessments/AssessmentVersionHistoryPanel';
import { VersionPill, AssessmentJobStatusBadge } from '@/components/assessments/AllAssessmentsTable';
import { useJobLockBadges } from '@/lib/hooks/useJobLockBadges';
import { assessmentJobLockMessage } from '@/lib/utils/assessmentJobLock';
import { useJobVersionLineage } from '@/lib/hooks/useJobVersionLineage';
import { parseAssessmentTitle } from '@/lib/utils/assessmentUtils';
import { formatIST } from '@/lib/utils/dateUtils';
import { MobileRecordList, MobileRecordCard, MobileStatChip, DESKTOP_TABLE_ONLY } from '@/components/ui/mobile-record-card';

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
  /** Single-select: the picked assessment's id, or null. */
  selectedId?: string | null;
  onSelect?: (assessment: PickerAssessment | null) => void;
  /**
   * Opt-in MULTI-select, for the invite flows that send several assessments
   * at once (AI Talent Match): checkboxes instead of radios, an "N selected"
   * chip, Select All / Clear All over the filtered list, and the Grouped
   * view's version panel in checkbox mode. Everything else — layout, search,
   * Grouped/Ungrouped, paging, preview — is identical to single-select.
   */
  multiple?: boolean;
  selectedIds?: string[];
  onSelectionChange?: (assessments: PickerAssessment[]) => void;
  /** The host dialog's scroller — pagination scrolls it back to the top. */
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
  searchLabel?: string;
  searchPlaceholder?: string;
}

/* Rows (Ungrouped) or job cards (Grouped) a page — few enough that a page fits
   the Send Invite dialog without a scrollbar. */
const PAGE_SIZE = 5;

/* The rounds an assessment runs, as the Round Weightage column names them. */
const ROUND_CHIPS: { key: 'hr' | 'technical' | 'coding'; short: string; label: string }[] = [
  { key: 'hr', short: 'HR', label: 'HR Round' },
  { key: 'technical', short: 'TECH', label: 'Technical Round' },
  { key: 'coding', short: 'CODE', label: 'Coding Round' },
];

/* The Ungrouped table's header cell — the AI Talent Match results table's,
   class for class (its background and rule come from the <thead>). */
const PICKER_TH = 'px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-slate-300 whitespace-nowrap align-middle';

/* Grouped: the shared version panel's tables, brought onto the same results
   table's cells from here rather than in the panel (the Assessments page
   keeps its own look) — px-4 py-3 cells, the white header row
   `tf-table-shell` paints there (slate-500 headings in dark), the native
   checkbox size the Ungrouped rows use, and its blue-50 selected row. The
   panel's full-width expander cell (`p-0`) keeps its zero padding. */
export const GROUPED_TABLE_TONE = [
  '[&_th]:px-4 [&_th]:py-3 [&_th]:bg-white dark:[&_th]:bg-slate-900 dark:[&_th]:text-slate-500',
  '[&_td:not(.p-0)]:px-4 [&_td:not(.p-0)]:py-3',
  '[&_input[type=checkbox]]:w-auto [&_input[type=checkbox]]:h-auto',
  '[&_tr[data-tf-assessment-selected=true]]:bg-blue-50 dark:[&_tr[data-tf-assessment-selected=true]]:bg-slate-800/50 [&_tr[data-tf-assessment-selected=true]]:ring-0',
].join(' ');

export default function AssessmentPicker({
  assessments,
  selectedId = null,
  onSelect,
  multiple = false,
  selectedIds,
  onSelectionChange,
  scrollContainerRef,
  searchLabel = 'Search Assessments',
  searchPlaceholder = 'Search by assessment ID, name, JD ID or JD name...',
}: AssessmentPickerProps) {
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grouped' | 'ungrouped'>('ungrouped');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  /* Five a page, fixed: the list has to fit the dialog without a scrollbar. */
  const pageSize = PAGE_SIZE;
  const [previewAssessment, setPreviewAssessment] = useState<PickerAssessment | null>(null);
  const jdLineage = useJobVersionLineage();
  /* Each job's Disabled / Archived / Draft badge beside its name — the
     Assessments page's, so a disabled job reads the same in the picker. Kept
     live while the dialog is open (see useJobLockBadges). */
  const { badgeFor: jobBadgeFor } = useJobLockBadges(assessments.map((a: PickerAssessment) => a.jd_id));
  const jobBadge = (a: PickerAssessment) => {
    const kind = jobBadgeFor(a.jd_id);
    return kind ? <AssessmentJobStatusBadge kind={kind} /> : null;
  };
  /* A Disabled or Archived job takes no invites: its assessments are greyed
     and cannot be picked, with the Assessments page's lock message as the
     reason. Re-enable / unarchive the job and they come back at once. */
  const lockReasonOf = (a: PickerAssessment): string | null => assessmentJobLockMessage(jobBadgeFor(a.jd_id));

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
  /* Grouped: which job versions each opened job card shows expanded. The
     selectable rows (and their checkboxes / radios) live one level down,
     inside a job version, so a card opening onto collapsed versions hid every
     choice behind a second click — the Grouped view read as having no
     selection at all. A card now opens with the job versions that hold an
     offered assessment already expanded; the reader's own toggles take over
     from there (kept per job, so reopening a card keeps them). */
  const [jobVersionToggles, setJobVersionToggles] = useState<Record<string, number[]>>({});
  const offeredJobVersionsOf = (jdId: string): number[] => {
    const numberById = new Map((jdLineage.lineages[jdId] ?? []).map((v) => [v.id, v.version_number ?? 1] as const));
    const numbers = new Set<number>();
    for (const row of versionRowsFor(jdId)) {
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

  /* One selection model for both modes: single-select is a list of at most
     one, reported back through `onSelect`; multi-select toggles through
     `onSelectionChange`. */
  const pickedIds = multiple ? (selectedIds ?? []) : (selectedId ? [selectedId] : []);
  const isPicked = (id: string) => pickedIds.includes(id);
  const pickedCount = pickedIds.length;
  const pickedAssessments = () => assessments.filter((x) => isPicked(x.id));
  const toggle = (a: PickerAssessment) => {
    if (lockReasonOf(a) && !isPicked(a.id)) return;
    if (multiple) {
      const picked = pickedAssessments();
      onSelectionChange?.(isPicked(a.id) ? picked.filter((x) => x.id !== a.id) : [...picked, a]);
    } else {
      onSelect?.(isPicked(a.id) ? null : a);
    }
  };
  /* A pick whose job is disabled / archived while the dialog is open is let go
     — it can no longer be sent. */
  const lockedPickIds = pickedIds.filter((id) => {
    const a = assessments.find((x) => x.id === id);
    return !!a && !!lockReasonOf(a);
  }).join(',');
  useEffect(() => {
    if (!lockedPickIds) return;
    const locked = new Set(lockedPickIds.split(','));
    if (multiple) onSelectionChange?.(pickedAssessments().filter((x) => !locked.has(x.id)));
    else onSelect?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedPickIds]);
  /* The toolbar's Select All, over the assessments the search leaves listed. */
  const listedPickedCount = pickerRows.filter((a) => isPicked(a.id)).length;
  const allListedPicked = pickerRows.length > 0 && listedPickedCount === pickerRows.length;
  /* Adds rows to the pick, keeping what is already picked. */
  const addToPick = (rows: PickerAssessment[]) =>
    onSelectionChange?.([...pickedAssessments(), ...rows.filter((a) => !isPicked(a.id) && !lockReasonOf(a))]);
  /* Clear unticks just the listed assessments, so picks the search is hiding
     stay picked (with no search, that is every pick). */
  const clearListed = () => {
    const listedIds = new Set(pickerRows.map((a) => a.id));
    onSelectionChange?.(pickedAssessments().filter((a) => !listedIds.has(a.id)));
  };
  /* Grouped: the jobs holding a pick — one in single-select, any number in
     multi-select. */
  const pickedJobKeys = new Set(pickedAssessments().map(lineageKeyOf));

  const total = viewMode === 'ungrouped' ? pickerRows.length : jobRows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageSlice = <T,>(list: T[]) => list.slice((safePage - 1) * pageSize, safePage * pageSize);
  const pagedRows = pageSlice(pickerRows);
  const pagedJobRows = pageSlice(jobRows);
  /* "Select all on this page": the listed rows on it — in Grouped, every
     listed assessment under the jobs on it. */
  const pagedJobKeys = new Set(pagedJobRows.map(lineageKeyOf));
  const pageListedRows = viewMode === 'ungrouped' ? pagedRows : pickerRows.filter((a) => pagedJobKeys.has(lineageKeyOf(a)));

  const statusLabel = (status?: string) => (status === 'published' ? 'Active' : status || '—');

  return (
    <>
      {/* How many can be picked — the AI Interview picker's note, in its
          banner style, worded for the mode. */}
      <div className="mb-4 flex items-start gap-2 rounded-lg bg-brand-blue/[0.06] border border-brand-blue/20 px-3 py-2.5">
        <Info className="w-4 h-4 text-brand-blue flex-shrink-0 mt-0.5" />
        <div className="min-w-0">
          {multiple ? (
            <>
              <p className="tf-caption">One or more assessments per invite</p>
              <p className="mt-0.5 tf-meta">
                You can pick several assessments, and everyone you invite gets each of them. To send different assessments to different people, send separate invites.
              </p>
            </>
          ) : (
            <>
              <p className="tf-caption">One assessment per invite</p>
              <p className="mt-0.5 tf-meta">
                You can pick only one assessment at a time, so everyone you invite gets the same assessment. To invite people to a different assessment, send another invite.
              </p>
            </>
          )}
        </div>
      </div>

      {/* Search, with the Grouped/Ungrouped toggle on the SAME row (the AI
          Interview picker's toggle): the search takes the spare width, the
          toggle keeps its own, both centred on one line; below `sm` the toggle
          drops under the search rather than squeezing it. Ungrouped: one row
          per assessment. Grouped: one card per job, versions behind View
          Versions. */}
      <div className="mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          {/* Select All — first on the row, before the search: the Job
              Details AI Talent Match Results tab's own ToolbarSelectAll pill
              (this page / all / clear). Covers the assessments the search
              leaves listed, in either view; Clear unticks just those.
              Multi-select only; a single pick has nothing to select all of. */}
          {multiple && (
            <div className="flex-shrink-0 self-start sm:self-auto">
              <ToolbarSelectAll
                selectedCount={pickedCount}
                allSelected={allListedPicked}
                pageCount={pageListedRows.length}
                onSelectPage={() => addToPick(pageListedRows)}
                totalCount={pickerRows.length}
                onSelectAll={() => addToPick(pickerRows)}
                onClear={clearListed}
                itemLabel="assessments"
              />
            </div>
          )}
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" />
            <input
              id="assessment-picker-search"
              /* No visible label — the placeholder says what it searches;
                 `searchLabel` still names the field for screen readers. */
              aria-label={searchLabel}
              type="text"
              autoFocus
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder={searchPlaceholder}
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
                    /* The pick survives the switch: both views read the one
                       selection the host holds, so what is ticked in one is
                       ticked in the other. Only the paging restarts. */
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
            <p>{q ? 'No assessments match your search' : 'No active assessments found'}</p>
            <p className="text-sm">{q ? 'Try different search terms' : 'Create and publish an assessment first to send invitations'}</p>
          </div>
        ) : (
          /* The AI Talent Match results table's card, header, row and checkbox
             styling — its bordered card, gray-50 header with the rule on the
             cells, px-4 py-3 cells, gray-100 row rules, gray-50 hover and
             blue-50 selected tint, and its empty select header (Select All
             sits in the line above). Columns stay this picker's own.
             The scroller is its `tf-table-shell` too — one box owning both
             axes, the header pinned (and painted solid) as rows scroll under
             it, single-line cells and the overlay scrollbars — in the
             dialog-sized `--compact` form, so the rows scroll inside the
             table instead of stretching the dialog. */
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
                    <th className={PICKER_TH}>Assessment Version</th>
                    <th className={PICKER_TH}>Status</th>
                    <th className={PICKER_TH}>Rounds</th>
                    <th className={PICKER_TH}>Duration</th>
                    <th className={PICKER_TH}>Invitations Sent</th>
                    <th className={PICKER_TH}>Created On</th>
                    <th className={`${PICKER_TH} pr-6`}>Created By</th>
                    <th className={`${PICKER_TH} !text-center tf-sticky-col`}>Preview</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                  {pagedRows.map((a) => {
                    const isSelected = isPicked(a.id);
                    const version = versionOf(a);
                    const rounds = ROUND_CHIPS.filter((r) => a[`${r.key}_enabled`]);
                    const pick = () => toggle(a);
                    const lockReason = lockReasonOf(a);
                    return (
                      <tr
                        key={a.id}
                        onClick={pick}
                        aria-selected={isSelected}
                        aria-disabled={lockReason ? true : undefined}
                        title={lockReason ?? undefined}
                        data-row-selected={isSelected ? 'true' : undefined}
                        className={`transition-colors ${
                          lockReason
                            ? 'cursor-not-allowed [&>td:not(.tf-sticky-col)]:opacity-50'
                            : 'hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer'
                        } ${isSelected ? 'bg-blue-50 dark:bg-slate-800/50' : ''}`}
                      >
                        <td className="tf-td tf-sticky-col-left">
                          <input
                            type={multiple ? 'checkbox' : 'radio'}
                            name="assessment-invite-picker-selection"
                            checked={isSelected}
                            disabled={!!lockReason}
                            onChange={pick}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Select ${jobNameOf(a)}`}
                            className={`${multiple ? 'rounded ' : ''}border-gray-300 cursor-pointer`}
                          />
                        </td>
                        <td className="tf-td whitespace-nowrap">
                          {a.jd_short_id ? <JobIdBadge>{a.jd_short_id}</JobIdBadge> : <span className="tf-hint">—</span>}
                        </td>
                        <td className="tf-td max-w-[16rem]">
                          {/* The job's name; the assessment's own title (version
                              suffix stripped) on hover. */}
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="block truncate min-w-0 font-medium text-gray-900 dark:text-slate-50" title={cleanTitleOf(a) || jobNameOf(a)}>
                              {jobNameOf(a)}
                            </span>
                            {jobBadge(a)}
                          </div>
                        </td>
                        <td className="tf-td whitespace-nowrap">
                          {a.jd_version ? <VersionPill kind="job" version={a.jd_version} /> : <span className="tf-hint">—</span>}
                        </td>
                        <td className="tf-td whitespace-nowrap">
                          {version ? <VersionPill kind="assessment" version={version} /> : <span className="tf-hint">—</span>}
                        </td>
                        <td className="tf-td whitespace-nowrap">
                          <span className="tf-badge gap-1.5 ring-1 bg-success-subtle text-success ring-success-line">
                            <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
                            {statusLabel(a.status)}
                          </span>
                        </td>
                        <td className="tf-td whitespace-nowrap">
                          {rounds.length > 0 ? (
                            <div className="flex items-center gap-1.5 flex-nowrap">
                              {rounds.map((round) => (
                                <span
                                  key={round.key}
                                  title={round.label}
                                  className="tf-badge text-2xs bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20 dark:bg-brand-blue/20 dark:text-blue-300 dark:ring-brand-blue/30"
                                >
                                  {round.short}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="tf-hint">—</span>
                          )}
                        </td>
                        <td className="tf-td whitespace-nowrap">
                          <span className="tabular-nums text-gray-600 dark:text-slate-400">{a.duration_minutes || 0}</span>
                          <span className="tf-hint ml-1">min</span>
                        </td>
                        <td className="tf-td whitespace-nowrap">
                          <span className="tabular-nums text-gray-600 dark:text-slate-400">{(a.invitations_count ?? 0).toLocaleString()}</span>
                          <span className="tf-hint ml-1">sent</span>
                        </td>
                        <td className="tf-td whitespace-nowrap text-gray-600 dark:text-slate-400 tabular-nums">
                          {a.created_at ? formatIST(a.created_at) : '—'}
                        </td>
                        <td className="tf-td pr-6 whitespace-nowrap text-gray-600 dark:text-slate-400">
                          {a.created_by_name || '—'}
                        </td>
                        <td className="tf-td text-center tf-sticky-col" onClick={(e) => e.stopPropagation()}>
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
          <MobileRecordList>
            {pagedRows.map((a) => {
              const isSelected = isPicked(a.id);
              const version = versionOf(a);
              const rounds = ROUND_CHIPS.filter((r) => a[`${r.key}_enabled`]);
              const pick = () => toggle(a);
              const lockReason = lockReasonOf(a);
              return (
                <MobileRecordCard
                  key={a.id}
                  onClick={pick}
                  selected={isSelected}
                  aria-selected={isSelected}
                  aria-disabled={lockReason ? true : undefined}
                  className={lockReason ? 'cursor-not-allowed opacity-50' : undefined}
                  select={
                    <input
                      type={multiple ? 'checkbox' : 'radio'}
                      name="assessment-invite-picker-selection-mobile"
                      checked={isSelected}
                      disabled={!!lockReason}
                      onChange={pick}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select ${jobNameOf(a)}`}
                      className={`${multiple ? 'rounded ' : ''}border-gray-300 cursor-pointer`}
                    />
                  }
                  idBadge={a.jd_short_id ? <JobIdBadge>{a.jd_short_id}</JobIdBadge> : undefined}
                  badges={
                    <span className="tf-badge gap-1.5 ring-1 bg-success-subtle text-success ring-success-line">
                      <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
                      {statusLabel(a.status)}
                    </span>
                  }
                  title={<span title={lockReason ?? (cleanTitleOf(a) || jobNameOf(a))}>{jobNameOf(a)}</span>}
                  titleAddon={jobBadge(a)}
                  actions={
                    <button
                      type="button"
                      onClick={() => setPreviewAssessment(a)}
                      className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-gray-300 dark:border-slate-700 text-gray-600 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-brand-blue/10 hover:text-brand-blue hover:border-brand-blue/40 transition-colors"
                      aria-label="Preview assessment"
                      title="Preview"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  }
                  fields={[
                    { label: 'Job Version', value: a.jd_version ? <VersionPill kind="job" version={a.jd_version} /> : '—' },
                    { label: 'Assessment Version', value: version ? <VersionPill kind="assessment" version={version} /> : '—' },
                    {
                      label: 'Rounds',
                      value: rounds.length > 0 ? (
                        <span className="inline-flex items-center gap-1.5 flex-wrap">
                          {rounds.map((round) => (
                            <span
                              key={round.key}
                              title={round.label}
                              className="tf-badge text-2xs bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20 dark:bg-brand-blue/20 dark:text-blue-300 dark:ring-brand-blue/30"
                            >
                              {round.short}
                            </span>
                          ))}
                        </span>
                      ) : '—',
                    },
                    { label: 'Created', value: a.created_at ? formatIST(a.created_at) : '—' },
                    { label: 'By', value: a.created_by_name || '—' },
                  ]}
                  footer={
                    <>
                      <MobileStatChip tone="neutral">{a.duration_minutes || 0} min</MobileStatChip>
                      <MobileStatChip tone="info" icon={<Send className="w-3.5 h-3.5" />}>
                        {(a.invitations_count ?? 0).toLocaleString()} sent
                      </MobileStatChip>
                    </>
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
          <p className="text-sm">{q ? 'Try different search terms' : 'Create and publish an assessment first to send invitations'}</p>
        </div>
      ) : (
        /* Tighter than the AI picker's cards (gap 2, p-3) so a page of five
           fits the dialog without a scrollbar from sm up. */
        <div className="space-y-2">
          {pagedJobRows.map((a) => {
            const jobKey = lineageKeyOf(a);
            const jdId: string | undefined = a.jd_id;
            const ownsSelection = pickedJobKeys.has(jobKey);
            /* Other jobs fade only in single-select, where a pick elsewhere
               would replace this one; multi-select can hold picks in many. */
            const dimmed = !multiple && pickedCount > 0 && !ownsSelection;
            /* A Disabled / Archived job: greyed, and its versions stay shut so
               nothing under it can be picked. */
            const lockReason = lockReasonOf(a);
            const expanded = expandedKey === jobKey && !lockReason;
            const totals = jobTotals.get(jobKey) ?? { assessments: 0, invitations: 0, completed: 0, maxJobVersion: 1 };
            /* The job card's four figures, in the AI picker's order and colours. */
            const rowMetrics = [
              { key: 'job-versions', icon: Layers, iconClass: 'text-brand-blue', value: jobVersionCountOf(a), label: 'Job Versions' },
              { key: 'assessments', icon: ClipboardCheck, iconClass: 'text-brand-cyan', value: totals.assessments, label: 'Assessments' },
              { key: 'invitations', icon: Send, iconClass: 'text-brand-orange', value: totals.invitations, label: 'Invitations Sent' },
              { key: 'completed', icon: CheckCircle, iconClass: 'text-menu-icon-activate', value: totals.completed, label: 'Completed' },
            ];
            const toggleExpanded = () => {
              if (!jdId || lockReason) return;
              const opening = !expanded;
              setExpandedKey(opening ? jobKey : null);
              if (opening) jdLineage.ensureLoaded(jdId, jdId);
            };
            return (
              <div
                key={jobKey}
                /* Clicking the card opens its versions. */
                onClick={toggleExpanded}
                aria-disabled={lockReason ? true : undefined}
                title={lockReason ?? undefined}
                className={`@container/ai-row relative p-3 rounded-xl border ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 transition-all duration-150 ${
                  lockReason ? 'cursor-not-allowed' : jdId ? 'cursor-pointer' : 'cursor-default'
                } ${
                  lockReason
                    ? 'border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 opacity-50'
                    : ownsSelection
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
                    <h3 className="tf-row-name truncate min-w-0" title={jobNameOf(a)}>
                      {jobNameOf(a)}
                    </h3>
                    {jobBadge(a)}
                  </div>

                  {/* Status */}
                  <div className="flex-shrink-0 @4xl/ai-row:w-[104px]">
                    <span className="tf-badge gap-1.5 ring-1 bg-success-subtle text-success ring-success-line">
                      <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
                      {statusLabel(a.status)}
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
                        disabled={!!lockReason}
                        title={lockReason ?? (expanded ? 'Hide version history' : 'View version history')}
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
                        onClick={() => toggle(a)}
                        disabled={!!lockReason}
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
                    className={`mt-3 pt-3 border-t border-gray-100 dark:border-slate-700/60 cursor-default ${GROUPED_TABLE_TONE}`}
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
                      expandedJobVersions={expandedJobVersionsOf(jdId)}
                      onToggleJobVersion={(jobVersion) => toggleJobVersionOf(jdId, jobVersion)}
                      selectedAssessmentId={!multiple && ownsSelection ? selectedId : undefined}
                      selectedAssessmentIds={multiple ? pickedIds : undefined}
                      onSelectAssessment={(assessmentId) => {
                        const picked = assessments.find((x) => x.id === assessmentId);
                        if (!picked) return;
                        if (multiple) toggle(picked);
                        else onSelect?.(picked);
                      }}
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

      {/* Pinned to the foot of the dialog body (the host wraps this picker in a
          full-height column): the two views' lists differ in height, so a bar
          that followed the list jumped every time the view was switched. At the
          foot it stays put, and `-mb-2` cancels the bar's own p-2 so the gap
          under it matches the body's top padding. */}
      {total > 0 && (
        <div className="mt-auto pt-3 -mb-2">
        <ListPagination
          currentPage={safePage}
          itemsPerPage={pageSize}
          totalItems={total}
          onPageChange={setPage}
          onItemsPerPageChange={() => setPage(1)}
          pageSizeOptions={[PAGE_SIZE]}
          minimalOnMobile
          itemLabel={viewMode === 'ungrouped' ? 'assessments' : 'jobs'}
          scrollContainerRef={scrollContainerRef}
          compact
          alwaysShow
        />
        </div>
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
