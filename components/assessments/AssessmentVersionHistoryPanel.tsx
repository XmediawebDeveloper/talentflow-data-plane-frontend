'use client';

import { Fragment, useState } from 'react';
import { ChevronDown, Eye, Plus, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import type { JDLineageVersion, JDResponse } from '@/lib/services/jdService';
import { formatISTDate, formatISTTime } from '@/lib/utils/dateUtils';
import { countAssessmentTopics } from '@/lib/utils/assessmentUtils';
import { getDisplayStatus, getStatusConfig } from '@/lib/utils/jobOpeningDisplay';

/**
 * Job Versions for an assessment row, expanded in place beneath it.
 *
 * TWO NESTED LEVELS, each a table of its own:
 *
 *   Job Versions (N)          one row per version of the JOB
 *     └ Assessment Versions (N)   the assessments authored against that version
 *
 * The outer table carries only what a reader is choosing between — which
 * version, its state, when and by whom it was made — plus the three totals
 * that say how much work hangs off it. The job's descriptive fields (title,
 * experience, location, work mode) are deliberately not here: the row above
 * this panel already names the job, and repeating it on every version turned
 * the table into a horizontal scroll with eight columns of mostly-identical
 * text.
 *
 * The job → assessment mapping comes from the data, never from arithmetic on
 * the numbers: an assessment records the job version it was authored against
 * (`jd_version`), and every child here is that field matching a job version
 * from the JD's own lineage. Job V3 can hold Assessment V2 while Job V2 and Job
 * V1 both hold an Assessment V1. A job version with no assessment says so
 * rather than borrowing a neighbour's number.
 */

/** The assessment shape this panel reads, straight off `assessmentService.list`.
 *  Everything past the id is optional: a row missing a field shows a dash
 *  rather than inventing one. */
export interface AssessmentVersionRow {
  id: string;
  short_id?: string;
  title?: string;
  description?: string;
  version?: number;
  status?: string;
  created_at?: string;
  updated_at?: string;
  created_by_name?: string;
  invitations_count?: number;
  /** Attempts the candidates actually finished, as the backend counts them
   *  (`completed_count` on AssessmentResponse) - the same field each
   *  assessment's own pass rate is computed against. */
  completed_count?: number;
  /** The JOB version this assessment was authored against. The join key. */
  jd_version?: number;
  /* The configured sections, counted for the Questions column. Read through
     `countAssessmentTopics` so this panel and the Job List row above it report
     the same number — a job's total is the sum of the rows listed here. */
  hr_topics?: unknown[] | null;
  technical_topics?: unknown[] | null;
  coding_topics?: unknown[] | null;
}

interface AssessmentVersionHistoryPanelProps {
  /** The JD's own lineage — every job version. Undefined while it loads. */
  jobVersions: JDLineageVersion[] | undefined;
  /** Full JD record per job-version id, for that version's own author. */
  jobVersionDetails: Record<string, JDResponse>;
  /** Every assessment in this JD's lineage, in any order — sorted here. */
  assessments: AssessmentVersionRow[] | undefined;
  loading: boolean;
  /**
   * The live job version as the HOST resolved it — the same number its own
   * LATEST badge and its collapsed-row choice are drawn from, and the number
   * this table badges Latest from, so the row and this table cannot name
   * different versions. It is the highest version number in the lineage —
   * sequence, not status; this panel derives its own only when the prop is
   * absent (rendered without a host).
   */
  latestJobVersion?: number;
  /** The assessment the row is showing, marked so it is findable. */
  currentAssessmentId?: string;
  /** Row click — opens that assessment. Omitted, rows are read-only. */
  onRowClick?: (assessmentId: string) => void;
  /**
   * Start the assessment-creation flow for ONE job version, given that
   * version's own JD id.
   *
   * The id is the whole point: every job version is its own JD row, so passing
   * the version's id is what associates the new assessment with the version the
   * recruiter clicked rather than with whatever the job's current version
   * happens to be. Omit the handler and the action is not offered.
   */
  onCreateAssessment?: (jobVersionId: string, jobVersion: number) => void;
  /**
   * Read ONE job version — its own description, pay, location and the rest —
   * given that version's own JD id.
   *
   * Gated on the same id as `onCreateAssessment` and for the same reason: a
   * version is a JD row of its own, so the id is what makes the popup open on
   * the row that was clicked rather than on the job's current version. Omit the
   * handler and the eye is not offered.
   */
  onViewJobVersion?: (jobVersionId: string, jobVersion: number) => void;
  /**
   * A control for the WHOLE job, pinned to the top-right of this panel's
   * "Job Versions (N)" heading — where the Job List row's eye now lives, so
   * the thing that reads the job's versions sits on the table that lists them.
   *
   * A slot rather than a button of its own: the panel does not know what the
   * host wants to open, and the host already owns the popup and its state.
   */
  headerAction?: ReactNode;
  /**
   * The trailing controls for one assessment — the host's own three-dot menu
   * and quick actions. Given that assessment's record so the host's existing
   * per-assessment handlers work unchanged. Omit it and the Actions column
   * keeps only this panel's own buttons.
   */
  renderAction?: (assessment: AssessmentVersionRow) => ReactNode;
}

/* The list's own status vocabulary for ASSESSMENTS, not the raw DB one: the
   rows above this panel say Active / Draft / Completed / Archived, and a row
   saying "Published" for the same state would read as a different thing. */
export const ASSESSMENT_STATUS_LABELS: Record<string, string> = {
  published: 'Active',
  closed: 'Completed',
  archived: 'Archived',
  draft: 'Draft',
};

/** One assessment status, in the list's own words. Unknown reads as Draft, as
 *  it has since this table was a flat list. Exported with the chips below so
 *  the tracking popup states neither a second time. */
export const assessmentStatusLabel = (status?: string): string =>
  ASSESSMENT_STATUS_LABELS[String(status || '').toLowerCase()] || 'Draft';

const STATUS_STYLES: Record<string, { chip: string; dot: string }> = {
  Active: { chip: 'bg-green-100 text-green-700 ring-green-200', dot: 'bg-green-500' },
  Draft: { chip: 'bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20', dot: 'bg-brand-orange' },
  Completed: { chip: 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20', dot: 'bg-brand-blue' },
  Archived: { chip: 'bg-slate-100 text-gray-600 ring-gray-200', dot: 'bg-gray-400' },
  Disabled: { chip: 'bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20', dot: 'bg-brand-orange' },
  Unknown: { chip: 'bg-slate-100 text-gray-700 ring-gray-200', dot: 'bg-gray-400' },
};

/**
 * A JOB version's status badge, resolved exactly as the Job Openings version
 * history resolves it (`components/jobs/JobVersionHistoryPanel`): the raw DB
 * word capitalised, through the shared `getDisplayStatus` (which is what turns
 * a republished JD into "Republished") and `getStatusConfig` for the colours.
 *
 * This replaces a local mapping that renamed `published` to "Active". Nothing
 * else in the app calls a published JD Active — `mapJDStatus` in
 * jobOpeningDisplay maps it to "Published", which is what the Job Openings list
 * badge, its version history and the JD detail page all show. So this table was
 * the one surface printing a word the data does not say, and it also lost the
 * Published/Republished distinction the shared helper derives.
 *
 * ASSESSMENT statuses are a separate vocabulary and are unchanged: an
 * assessment really is "Active" when published (see ASSESSMENT_STATUS_LABELS
 * above, and `mapAssessmentFromApi` in the assessments list). Two entities, two
 * sets of words — conflating them is what went wrong here.
 */
export function JobStatusChip({ status, currentVersion }: { status?: string; currentVersion?: number }) {
  const raw = (status || '').trim();
  /* No status known yet (the JD lineage request is still in flight) - a dash,
     rather than asserting a state the table has not been told. */
  if (!raw) return <span className="text-sm text-gray-500 dark:text-slate-400">&mdash;</span>;

  const capitalised = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  const label = getDisplayStatus(capitalised, currentVersion);
  const tone = getStatusConfig(label);
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs whitespace-nowrap border ${tone.bg} ${tone.text} ${tone.border}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
      {label}
    </span>
  );
}

/* Outer table: the job version, its state, its provenance, its totals.
   `Actions` is appended by the renderer so it can be pinned separately. */
const JOB_COLUMNS: { label: string; minW: string }[] = [
  { label: 'Version', minW: 'min-w-[150px]' },
  { label: 'Status', minW: 'min-w-[110px]' },
  { label: 'Created On', minW: 'min-w-[130px]' },
  { label: 'Created By', minW: 'min-w-[120px]' },
  { label: 'Assessments', minW: 'min-w-[110px]' },
  { label: 'Questions', minW: 'min-w-[100px]' },
  { label: 'Invitations Sent', minW: 'min-w-[120px]' },
  { label: 'Completed', minW: 'min-w-[120px]' },
];

/* Inner table: the same shape minus Assessments — an assessment version is
   itself the thing that column counts. */
const ASSESSMENT_COLUMNS: { label: string; minW: string }[] = [
  { label: 'Version', minW: 'min-w-[150px]' },
  { label: 'Status', minW: 'min-w-[110px]' },
  { label: 'Created On', minW: 'min-w-[130px]' },
  { label: 'Created By', minW: 'min-w-[120px]' },
  { label: 'Questions', minW: 'min-w-[100px]' },
  { label: 'Invitations Sent', minW: 'min-w-[120px]' },
];

interface JobVersionGroup {
  jobVersion: number;
  /** This version's own JD row id — the context every action is scoped to. */
  jobVersionId?: string;
  isLatestJobVersion: boolean;
  jobStatus?: string;
  /** Republish counter, for the Published vs Republished distinction. */
  jobCurrentVersion?: number;
  createdOn?: string;
  createdBy?: string;
  assessments: AssessmentVersionRow[];
  /** Summed across this version's assessments, so the totals on the job row
   *  are exactly what its Assessment Versions table adds up to. */
  totalQuestions: number;
  totalInvitations: number;
  /** Finished attempts across this version's assessments - read beside the
   *  invitations it is a subset of: sent, then completed. */
  totalCompleted: number;
}

export function StatusChip({ label }: { label: string }) {
  const tone = STATUS_STYLES[label] || STATUS_STYLES.Unknown;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs ring-1 whitespace-nowrap ${tone.chip}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
      {label}
    </span>
  );
}

/**
 * The version chip: `v2.0` for a job version, `a2.0` for an assessment one.
 *
 * `V` plus the record's own version number, nothing else. Versions are whole
 * numbers in the data, so a `.0` minor part was display decoration standing
 * for a component no one can read — and it invited the reading that a `V2.1`
 * could exist.
 *
 * Both tables use the same wording; the chip's colour (blue for a job version,
 * cyan for an assessment one) plus each table's own heading are what tell them
 * apart.
 */
export function VersionChip({ kind, version }: { kind: 'job' | 'assessment'; version?: number }) {
  const isJob = kind === 'job';
  return (
    <span
      className={`px-2 py-0.5 rounded-md text-xs font-semibold whitespace-nowrap ring-1 ${
        isJob
          ? 'text-brand-blue bg-brand-blue/10 ring-brand-blue/20 dark:bg-brand-blue/20 dark:text-blue-300 dark:ring-brand-blue/35'
          : 'text-brand-cyan bg-brand-cyan/10 ring-brand-cyan/20 dark:bg-brand-cyan/20 dark:text-cyan-200 dark:ring-brand-cyan/35'
      }`}
    >
      V{version ?? 1}
    </span>
  );
}

export function LatestBadge() {
  return (
    <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold tracking-wide text-white bg-brand-blue ring-1 ring-white/10">
      Latest
    </span>
  );
}

/** A number over the noun it counts — the reference's metric cell. */
function MetricCell({ value, label }: { value: number; label: string }) {
  return (
    <>
      <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">{value}</div>
      <div className="text-xs text-gray-500 dark:text-slate-400">{label}</div>
    </>
  );
}

/** A date over its time, both in IST. A missing date is a dash, never today. */
function DateCell({ value }: { value?: string }) {
  if (!value) return <span className="text-sm text-gray-500 dark:text-slate-400">—</span>;
  return (
    <>
      <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">{formatISTDate(value)}</div>
      <div className="text-xs text-gray-500 dark:text-slate-400 uppercase">{formatISTTime(value)}</div>
    </>
  );
}

export default function AssessmentVersionHistoryPanel({
  jobVersions,
  jobVersionDetails,
  assessments,
  loading,
  latestJobVersion,
  currentAssessmentId,
  onRowClick,
  onCreateAssessment,
  onViewJobVersion,
  headerAction,
  renderAction,
}: AssessmentVersionHistoryPanelProps) {
  /* Which job versions have their assessment table open. Local to the panel:
     nothing outside it needs to know, and the state dies with the panel when
     the row is collapsed - which is the right lifetime for it. */
  const [expandedJobVersions, setExpandedJobVersions] = useState<Set<number>>(new Set());

  const toggleJobVersion = (jobVersion: number) => {
    setExpandedJobVersions((prev) => {
      const next = new Set(prev);
      if (next.has(jobVersion)) next.delete(jobVersion);
      else next.add(jobVersion);
      return next;
    });
  };

  const jobColumns = [...JOB_COLUMNS, { label: 'Actions', minW: 'min-w-[230px]' }];
  const assessmentRows = assessments ?? [];

  /* Which job versions to print.
   *
   * The union of the JD's lineage and the job versions the assessments
   * themselves name — not the lineage alone. Two reasons: the panel still
   * renders real rows if the lineage request fails, and an assessment pointing
   * at a job version the lineage no longer returns is a row that must not
   * silently vanish. */
  const jobVersionNumbers = (() => {
    const numbers = new Set<number>();
    for (const version of jobVersions ?? []) numbers.add(version.version_number ?? 1);
    for (const assessment of assessmentRows) {
      if (typeof assessment.jd_version === 'number') numbers.add(assessment.jd_version);
    }
    /* Nothing known yet — fall back to the row's own job version so the panel
       opens onto something rather than an empty table. */
    if (numbers.size === 0 && latestJobVersion) numbers.add(latestJobVersion);
    return [...numbers].sort((a, b) => b - a); // Latest first, then older.
  })();

  /* The live job version, as the HOST resolved it — one resolver
     (`getLatestJobVersion` in the assessments list) answers this for the row's
     LATEST badge, for the version each lineage is collapsed down to on that
     row, and for the row badged Latest here. So the version this table marks is
     always the one the row above it is showing, and both move together when a
     version is created, republished or dropped back to Draft.

     That number is the highest version in the lineage — SEQUENCE, as on the
     Job Openings page, never status and never `is_latest_version`, so a Draft
     v2 over a Published v1 is the row badged Latest here and the version the
     row above is showing. It already counts every job version the list knows
     and this panel's own assessment rows, so it can never be lower than what
     is printed here. Deriving it independently is exactly what let the two
     disagree; the fallback runs only if no host number is passed at all, and
     `jobVersionNumbers` is already sorted newest-first. */
  const newestJobVersion = latestJobVersion ?? jobVersionNumbers[0] ?? 1;

  const lineageByVersion = new Map<number, JDLineageVersion>();
  for (const version of jobVersions ?? []) {
    const number = version.version_number ?? 1;
    /* First entry for a number wins: a republished JD can report several
       lineage entries sharing one version number, and those are one version. */
    if (!lineageByVersion.has(number)) lineageByVersion.set(number, version);
  }

  const groups: JobVersionGroup[] = jobVersionNumbers.map((jobVersion) => {
    const lineageEntry = lineageByVersion.get(jobVersion);
    const detail = lineageEntry ? jobVersionDetails[lineageEntry.id] : undefined;
    /* Only the assessments actually recorded against THIS job version,
       newest assessment version first. */
    const versionAssessments = assessmentRows
      .filter((a) => a.jd_version === jobVersion)
      .sort((a, b) => (b.version ?? 1) - (a.version ?? 1));
    return {
      jobVersion,
      jobVersionId: lineageEntry?.id,
      isLatestJobVersion: jobVersion === newestJobVersion,
      /* The lineage entry is the authority on a version's status; the fully
         fetched JD record for that same version is the fallback, so a lineage
         row that comes back without a status still reads Active rather than
         Unknown. Both are dynamic - `status` on JDLineageVersion and on
         JDResponse respectively. */
      jobStatus: lineageEntry?.status || detail?.status,
      jobCurrentVersion: lineageEntry?.current_version ?? detail?.current_version,
      /* When the version itself was made, not when it was published — the
         column says Created On. */
      createdOn: lineageEntry?.created_at || detail?.created_at,
      createdBy: detail?.created_by_name,
      assessments: versionAssessments,
      totalQuestions: versionAssessments.reduce((sum, a) => sum + countAssessmentTopics(a), 0),
      totalInvitations: versionAssessments.reduce((sum, a) => sum + (a.invitations_count ?? 0), 0),
      totalCompleted: versionAssessments.reduce((sum, a) => sum + (a.completed_count ?? 0), 0),
    };
  });

  return (
    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-700">
      {loading && !assessments ? (
        <div className="flex items-center gap-2 py-2 text-xs text-gray-500 dark:text-slate-400">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          Loading versions...
        </div>
      ) : groups.length === 0 ? (
        <p className="py-2 text-xs text-gray-500 dark:text-slate-400">
          No version history for this assessment.
        </p>
      ) : (
        /* One shell owns BOTH scroll axes (x on narrow screens, y past 4 job
           versions), so header and body live in one <table> and their columns
           can never drift apart. The y-cap is deliberately NOT applied while an
           inner table is open — an expanded list has to be readable without
           fighting a fixed window. */
        <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/30 overflow-hidden">
          {/* Heading left, the host's control right - the table's own top
              corner, above the rows it acts on. */}
          <div className="px-3 sm:px-4 pt-3 pb-2 flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-100">
              Job Versions{' '}
              <span className="font-normal text-gray-500 dark:text-slate-400">({groups.length})</span>
            </h4>
            {headerAction && <div className="flex-shrink-0">{headerAction}</div>}
          </div>

          <div
            className={`overflow-x-auto ${
              groups.length > 4 && expandedJobVersions.size === 0
                ? 'overflow-y-auto max-h-[320px] overscroll-contain'
                : ''
            }`}
          >
            <table className="w-full min-w-[1200px] text-left">
              <thead>
                {/* The bottom hairline is an inset shadow, not border-b —
                    collapsed-table borders detach from sticky cells and would
                    scroll away with the body. The background is on every th,
                    NOT on the tr: a sticky th only carries a background painted
                    on the cell itself, and a bg-less th lets body text show
                    through. */}
                <tr>
                  {jobColumns.map(({ label, minW }) => (
                    <th
                      key={label}
                      /* z order, back to front: body cells (auto) < sticky
                         Action td (5) < sticky header (7) < pinned corner (8). */
                      className={`sticky top-0 py-2 px-3 text-xs font-semibold text-gray-500 dark:text-slate-400 whitespace-nowrap bg-slate-50 dark:bg-slate-800 ${minW} ${
                        label === 'Actions'
                          ? 'z-[7] lg:right-0 lg:z-[8] shadow-[inset_0_-1px_0_#e5e7eb] lg:shadow-[inset_0_-1px_0_#e5e7eb,-1px_0_0_0_#e5e7eb] dark:shadow-[inset_0_-1px_0_#334155] dark:lg:shadow-[inset_0_-1px_0_#334155,-1px_0_0_0_#334155]'
                          : 'z-[7] shadow-[inset_0_-1px_0_#e5e7eb] dark:shadow-[inset_0_-1px_0_#334155]'
                      }`}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => {
                  const count = group.assessments.length;
                  const hasAssessments = count > 0;
                  const isOpen = expandedJobVersions.has(group.jobVersion);
                  /* The newest assessment version in this group — the one its
                     inner table badges Latest. Read off the sorted list rather
                     than recomputed, so the badge and the ordering agree. */
                  const newestAssessmentVersion = group.assessments[0]?.version ?? 1;
                  /* Opaque only while pinned — an unpinned cell should take
                     the row's own hover tint like every other cell. */
                  const stickyTint = 'lg:bg-white lg:group-hover:bg-[#f8f9fc] dark:lg:bg-slate-900 dark:lg:group-hover:bg-slate-800';

                  return (
                    /* One <tr> per job version, then one more carrying its
                       inner table. A keyed Fragment, not a bare `<>`: the pair
                       is one list item and React needs the key on the outer
                       node. */
                    <Fragment key={`job-${group.jobVersion}`}>
                      {/* NO transform on the row: a transformed <tr> becomes
                          the containing block for its cells, which silently
                          kills position:sticky on the pinned Actions cell. */}
                      <tr
                        className={`group border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 transition-colors duration-200 ease-out hover:bg-brand-blue/[0.03] dark:hover:bg-brand-blue/[0.08] ${
                          hasAssessments ? 'cursor-pointer' : ''
                        }`}
                        /* The whole row toggles, not just the button — a small
                           target at the far right of a scrolling table is a
                           poor one. Only where there is something to expand. */
                        onClick={hasAssessments ? () => toggleJobVersion(group.jobVersion) : undefined}
                      >
                        <td className="py-3 px-3 whitespace-nowrap align-middle">
                          <span className="inline-flex items-center gap-1.5">
                            <VersionChip kind="job" version={group.jobVersion} />
                            {group.isLatestJobVersion && <LatestBadge />}
                          </span>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap align-middle">
                          <JobStatusChip status={group.jobStatus} currentVersion={group.jobCurrentVersion} />
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap align-middle">
                          <DateCell value={group.createdOn} />
                        </td>
                        <td
                          className="py-3 px-3 text-sm font-medium text-gray-900 dark:text-slate-100 whitespace-nowrap max-w-[160px] truncate align-middle"
                          title={group.createdBy || ''}
                        >
                          {group.createdBy || '—'}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap align-middle">
                          <MetricCell value={count} label={count === 1 ? 'Assessment' : 'Assessments'} />
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap align-middle">
                          <MetricCell value={group.totalQuestions} label={group.totalQuestions === 1 ? 'Question' : 'Questions'} />
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap align-middle">
                          <MetricCell value={group.totalInvitations} label={group.totalInvitations === 1 ? 'Invitation' : 'Invitations'} />
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap align-middle">
                          <MetricCell value={group.totalCompleted} label={group.totalCompleted === 1 ? 'Candidate' : 'Candidates'} />
                        </td>
                        {/* Actions — pinned right so it stays reachable while
                            the table scrolls sideways. Opaque background (plus
                            a hover tint matching the row's translucent one) so
                            content sliding underneath never shows through. */}
                        {/* Pinned right only where the table has room for it.
                            On a phone the pinned column would cover most of a
                            324px viewport, leaving the reader scrolling the
                            middle columns under it — so below `lg` it is an
                            ordinary last column reached by scrolling. */}
                        <td className={`py-3 px-3 whitespace-nowrap align-middle lg:sticky lg:right-0 lg:z-[5] lg:shadow-[-1px_0_0_0_#e5e7eb] transition-colors duration-200 dark:lg:shadow-[-1px_0_0_0_#334155] ${stickyTint}`}>
                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            {/* Read THIS version. Never disabled and never
                                conditional on the assessment state beside it:
                                reading a job version is unrelated to whether
                                one can be built against it, so an Archived,
                                Disabled or Draft row opens exactly like a
                                published one. Same button, same popup, as the
                                eye on the Create Assessment picker's own
                                version rows. */}
                            {onViewJobVersion && group.jobVersionId && (
                              <button
                                type="button"
                                onClick={() => onViewJobVersion(group.jobVersionId!, group.jobVersion)}
                                aria-label={`View job V${group.jobVersion} details`}
                                title={`View job V${group.jobVersion} details`}
                                className="h-8 w-8 flex items-center justify-center rounded-lg border border-brand-blue/40 bg-white dark:bg-slate-900 text-brand-blue hover:bg-brand-blue/10 hover:border-brand-blue transition-all flex-shrink-0"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {hasAssessments ? (
                              <button
                                type="button"
                                onClick={() => toggleJobVersion(group.jobVersion)}
                                aria-expanded={isOpen}
                                aria-label={
                                  isOpen
                                    ? `Hide the ${count} assessment version${count === 1 ? '' : 's'} for job V${group.jobVersion}`
                                    : `Show the ${count} assessment version${count === 1 ? '' : 's'} for job V${group.jobVersion}`
                                }
                                className="h-8 px-3 inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-brand-blue/30 bg-white dark:bg-slate-900 text-brand-blue text-xs font-medium hover:bg-brand-blue/5 transition-colors"
                              >
                                View Assessments
                                <ChevronDown
                                  className={`w-3.5 h-3.5 transition-transform duration-300 ease-out ${isOpen ? 'rotate-180' : ''}`}
                                />
                              </button>
                            ) : onCreateAssessment && group.jobVersionId ? (
                              /* No assessment for this job version yet, so the
                                 row offers the one action that changes that.

                                 Gated on `jobVersionId`: without this version's
                                 own JD row id there is nothing to scope the new
                                 assessment to, and falling back to the parent
                                 row's id would quietly attach it to a DIFFERENT
                                 job version. No button is better than the wrong
                                 association. */
                              <button
                                type="button"
                                onClick={() => onCreateAssessment(group.jobVersionId!, group.jobVersion)}
                                title={`Create an assessment for job V${group.jobVersion}`}
                                aria-label={`Create an assessment for job V${group.jobVersion}`}
                                className="h-8 px-3 inline-flex items-center gap-1.5 rounded-lg text-xs font-medium whitespace-nowrap bg-brand-blue hover:bg-brand-blue-2 text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 transition-all"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                Create
                              </button>
                            ) : (
                              <span className="text-xs text-gray-500 dark:text-slate-400">No assessment</span>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* The inner table. Always mounted so it can animate BOTH
                          ways; `grid-rows-[0fr] → [1fr]` is what makes a
                          height-unknown block collapse smoothly, which a plain
                          max-height guess cannot do without either clipping
                          tall content or easing through empty space. */}
                      {hasAssessments && (
                        <tr>
                          <td colSpan={jobColumns.length} className="p-0">
                            <div
                              className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                                isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                              }`}
                            >
                              <div className="overflow-hidden">
                                {/* Indented and tinted so the nesting is
                                    readable without a connector glyph per row. */}
                                <div className="px-3 sm:px-4 py-3 bg-slate-100/70 dark:bg-slate-800/60 border-t border-gray-200 dark:border-slate-700">
                                  <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
                                    <div className="px-3 pt-2.5 pb-1.5">
                                      <h5 className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                                        Assessment Versions{' '}
                                        <span className="font-normal text-gray-500 dark:text-slate-400">({count})</span>
                                      </h5>
                                    </div>
                                    <div className="overflow-x-auto">
                                      {/* A real nested table, so its columns
                                          line up with each other. It sizes
                                          independently of the outer one on
                                          purpose: sharing a grid would force
                                          the inner rows into columns sized for
                                          eight outer ones. */}
                                      <table className="w-full min-w-[860px] text-left">
                                        <thead>
                                          <tr>
                                            {[...ASSESSMENT_COLUMNS, { label: 'Actions', minW: 'min-w-[160px]' }].map(({ label, minW }) => (
                                              <th
                                                key={label}
                                                className={`py-2 px-3 text-xs font-semibold text-gray-500 dark:text-slate-400 whitespace-nowrap bg-slate-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 ${minW}`}
                                              >
                                                {label}
                                              </th>
                                            ))}
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {group.assessments.map((assessment) => {
                                            const isCurrent = !!currentAssessmentId && assessment.id === currentAssessmentId;
                                            const statusLabel = assessmentStatusLabel(assessment.status);
                                            const questions = countAssessmentTopics(assessment);
                                            const invitations = assessment.invitations_count ?? 0;
                                            return (
                                              <tr
                                                key={assessment.id}
                                                className={`border-b last:border-b-0 border-gray-100 dark:border-slate-700/70 transition-colors ${
                                                  isCurrent
                                                    ? 'bg-brand-blue/[0.06] dark:bg-brand-blue/[0.14]'
                                                    : 'hover:bg-brand-blue/[0.03] dark:hover:bg-slate-800'
                                                } ${onRowClick ? 'cursor-pointer' : ''}`}
                                                onClick={onRowClick ? () => onRowClick(assessment.id) : undefined}
                                              >
                                                <td className="py-2.5 px-3 whitespace-nowrap align-middle">
                                                  <span className="inline-flex items-center gap-1.5">
                                                    <VersionChip kind="assessment" version={assessment.version} />
                                                    {(assessment.version ?? 1) === newestAssessmentVersion && <LatestBadge />}
                                                  </span>
                                                </td>
                                                <td className="py-2.5 px-3 whitespace-nowrap align-middle">
                                                  <StatusChip label={statusLabel} />
                                                </td>
                                                <td className="py-2.5 px-3 whitespace-nowrap align-middle">
                                                  <DateCell value={assessment.created_at} />
                                                </td>
                                                <td
                                                  className="py-2.5 px-3 text-sm font-medium text-gray-900 dark:text-slate-100 whitespace-nowrap max-w-[160px] truncate align-middle"
                                                  title={assessment.created_by_name || ''}
                                                >
                                                  {assessment.created_by_name || '—'}
                                                </td>
                                                <td className="py-2.5 px-3 whitespace-nowrap align-middle">
                                                  <MetricCell value={questions} label={questions === 1 ? 'Question' : 'Questions'} />
                                                </td>
                                                <td className="py-2.5 px-3 whitespace-nowrap align-middle">
                                                  <MetricCell value={invitations} label={invitations === 1 ? 'Invitation' : 'Invitations'} />
                                                </td>
                                                <td className="py-2.5 px-3 whitespace-nowrap align-middle">
                                                  {/* gap-1.5 matches the spacing
                                                      inside the quick-action
                                                      group, so all four
                                                      controls read as one
                                                      evenly spaced row. */}
                                                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                                    {/* The host's own menu and
                                                        quick actions, unchanged.
                                                        Nothing else: the row
                                                        itself opens the
                                                        assessment, so a View
                                                        button beside it was a
                                                        second control for the
                                                        same navigation. */}
                                                    {renderAction?.(assessment)}
                                                  </div>
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
