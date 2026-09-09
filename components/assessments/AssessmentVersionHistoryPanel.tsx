'use client';

import { Fragment, useState } from 'react';
import { FileText, RefreshCw, CornerDownRight, ChevronDown, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import type { JDLineageVersion, JDResponse } from '@/lib/services/jdService';
import { formatISTDate } from '@/lib/utils/dateUtils';
import { stripVersionFromTitle } from '@/lib/utils/assessmentUtils';
import { formatJobExperienceText } from '@/lib/utils/jobExperience';
import { formatEmploymentType, formatIndustryType } from '@/lib/utils/jobOpeningDisplay';

/**
 * Job Version History for an assessment row, expanded in place beneath it.
 *
 * ONE ROW PER JOB VERSION, and the parent table carries job-level facts only —
 * which version, which role, its status, when and by whom. The assessments
 * authored against a version are its children, reached through the accordion in
 * the Actions column rather than given columns of their own; a job version with
 * two assessments cannot be one flat row without either repeating the job
 * across two lines or hiding one of the assessments.
 *
 * The accordion appears only where it earns its place. A version with a single
 * assessment names it inline and puts its actions on the row itself — there is
 * nothing to expand into, and a chevron opening onto one line is a click that
 * buys the reader nothing.
 *
 * The job → assessment mapping comes from the data, never from arithmetic on
 * the numbers: an assessment records the job version it was authored against
 * (`jd_version`), and every child here is that field matching a job version
 * from the JD's own lineage. Job v3 can hold Assessment v2 while Job v2 and Job
 * v1 both hold an Assessment v1. A job version with no assessment says so
 * rather than borrowing a neighbour's number.
 *
 * Visually this is `components/jobs/JobVersionHistoryPanel` — the Job Openings
 * list's own Version History — down to the brand-tinted table, the sticky
 * header, the vN chip plus Latest pill, the status dot chips and the sticky
 * Action column driven by a host-supplied render prop.
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
  /** The JOB version this assessment was authored against. The join key. */
  jd_version?: number;
}

interface AssessmentVersionHistoryPanelProps {
  /** The JD's own lineage — every job version. Undefined while it loads. */
  jobVersions: JDLineageVersion[] | undefined;
  /** Full JD record per job-version id, for that version's own title/author. */
  jobVersionDetails: Record<string, JDResponse>;
  /** Every assessment in this JD's lineage, in any order — sorted here. */
  assessments: AssessmentVersionRow[] | undefined;
  loading: boolean;
  /**
   * The live job version as the HOST resolved it — the same number its own
   * LATEST badge and its collapsed-row choice are drawn from, and the number
   * this table badges LATEST from, so the card and this table cannot name
   * different versions. It is the highest version number in the lineage —
   * sequence, not status; this panel derives its own only when the prop is
   * absent (rendered without a host).
   */
  latestJobVersion?: number;
  /** The assessment the card is showing, marked so it is findable. */
  currentAssessmentId?: string;
  /** Job title to fall back on before the per-version JD records land. */
  fallbackJobTitle?: string;
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
   * The Action cell for one assessment. Given that assessment's own record so
   * the host's existing per-assessment handlers work unchanged. Omit it and
   * the Actions COLUMN keeps only the accordion chevron.
   */
  renderAction?: (assessment: AssessmentVersionRow) => ReactNode;
}

/* The list's own status vocabulary for ASSESSMENTS, not the raw DB one: the
   cards above this panel say Active / Draft / Completed / Archived, and a row
   saying "Published" for the same state would read as a different thing. */
const ASSESSMENT_STATUS_LABELS: Record<string, string> = {
  published: 'Active',
  closed: 'Completed',
  archived: 'Archived',
  draft: 'Draft',
};

const STATUS_STYLES: Record<string, { chip: string; dot: string }> = {
  Active: { chip: 'bg-green-100 text-green-700 ring-green-200', dot: 'bg-green-500' },
  Draft: { chip: 'bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20', dot: 'bg-brand-orange' },
  Completed: { chip: 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20', dot: 'bg-brand-blue' },
  Archived: { chip: 'bg-slate-100 text-gray-600 ring-gray-200', dot: 'bg-gray-400' },
  Disabled: { chip: 'bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20', dot: 'bg-brand-orange' },
  Unknown: { chip: 'bg-slate-100 text-gray-700 ring-gray-200', dot: 'bg-gray-400' },
};

/* A JD's own statuses. "Published" is the DB word; every JD surface says
   Active, so this table does too. */
const jobStatusLabel = (status?: string) => {
  const raw = (status || '').toLowerCase();
  if (!raw) return 'Unknown';
  if (raw === 'published') return 'Active';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

/**
 * Job-level columns only — assessments live in the accordion below the row.
 *
 * The same columns, in the same order and under the same names, as the Job
 * Openings version history (`buildBaseColumns` in
 * components/jobs/JobVersionHistoryPanel): a job version reads identically
 * wherever a recruiter meets it. Every cell is this version's own JD record;
 * a field the record does not carry shows a dash.
 *
 * `Assessments` is this table's own addition and stays last before Actions —
 * it is the whole reason the panel exists, and the Job Openings table has no
 * equivalent to conflict with. The two columns Job Openings carries after
 * Posted On / By (Last Updated, Applicants) are deliberately not here: this
 * table's subject is which assessment answers which job version.
 */
const COLUMNS: { label: string; minW: string }[] = [
  { label: 'Version', minW: 'min-w-[150px]' },
  { label: 'Job Title', minW: 'min-w-[180px]' },
  { label: 'Status', minW: 'min-w-[110px]' },
  { label: 'Experience / Industry', minW: 'min-w-[150px]' },
  { label: 'Location', minW: 'min-w-[120px]' },
  { label: 'Work Mode / Type', minW: 'min-w-[130px]' },
  { label: 'Posted On / By', minW: 'min-w-[130px]' },
  { label: 'Assessments', minW: 'min-w-[240px]' },
];

interface JobVersionGroup {
  jobVersion: number;
  /** This version's own JD row id — the context every action is scoped to. */
  jobVersionId?: string;
  isLatestJobVersion: boolean;
  jobTitle?: string;
  jobStatus?: string;
  /** Experience / Industry, Location and Work Mode / Type all come from this
   *  version's own JD record, so they describe the version in the row rather
   *  than the job's current state. Undefined until that record lands, and
   *  undefined stays a dash — never a default. */
  experienceText?: string;
  industryType?: string;
  locationText?: string;
  employmentType?: string;
  remoteType?: string;
  postedOn?: string;
  postedBy?: string;
  assessments: AssessmentVersionRow[];
}

function StatusChip({ label }: { label: string }) {
  const tone = STATUS_STYLES[label] || STATUS_STYLES.Unknown;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs ring-1 whitespace-nowrap ${tone.chip}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
      {label}
    </span>
  );
}

function AssessmentVersionChip({ version }: { version?: number }) {
  return (
    <span className="px-2 py-0.5 rounded-md text-xs font-semibold text-brand-cyan bg-brand-cyan/10 ring-1 ring-brand-cyan/20 dark:bg-brand-cyan/20 dark:text-cyan-200 dark:ring-brand-cyan/35 whitespace-nowrap">
      Assessment v{version ?? 1}
    </span>
  );
}

export default function AssessmentVersionHistoryPanel({
  jobVersions,
  jobVersionDetails,
  assessments,
  loading,
  latestJobVersion,
  currentAssessmentId,
  fallbackJobTitle,
  onRowClick,
  onCreateAssessment,
  renderAction,
}: AssessmentVersionHistoryPanelProps) {
  /* Which job versions have their assessment list open. Local to the panel:
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

  const columns = [...COLUMNS, { label: 'Actions', minW: 'min-w-[84px]' }];
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
    /* Nothing known yet — fall back to the card's own job version so the panel
       opens onto something rather than an empty table. */
    if (numbers.size === 0 && latestJobVersion) numbers.add(latestJobVersion);
    return [...numbers].sort((a, b) => b - a); // Latest first, then older.
  })();

  /* The live job version, as the HOST resolved it — one resolver
     (`getLatestJobVersion` in the assessments list) answers this for the card's
     LATEST badge, for the version each lineage is collapsed down to on that
     card, and for the row badged LATEST here. So the row this table marks is
     always the row the card above it is showing, and both move together when a
     version is created, republished or dropped back to Draft.

     That number is the highest version in the lineage — SEQUENCE, as on the
     Job Openings page, never status and never `is_latest_version`, so a Draft
     v2 over a Published v1 is the row badged LATEST here and the row the card
     above is showing. It already counts every job version the list knows and
     this panel's own assessment rows, so it can never be lower than what is
     printed here. Deriving it independently is exactly what let the two
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
    return {
      jobVersion,
      jobVersionId: lineageEntry?.id,
      isLatestJobVersion: jobVersion === newestJobVersion,
      jobTitle: detail?.title || lineageEntry?.title || fallbackJobTitle,
      jobStatus: lineageEntry?.status,
      /* Read exactly as the Job Openings history reads them, off the same JD
         record, so the two tables can never format the same job differently. */
      experienceText: detail
        ? formatJobExperienceText({
            jobLevel: detail.job_level || detail.experience_level,
            experienceMin: detail.experience_min,
            experienceMax: detail.experience_max,
          })
        : undefined,
      industryType: detail?.industry_type,
      /* The single field first, else the cities named in the structured list. */
      locationText:
        detail?.location
        || (detail?.locations || []).map((loc) => loc?.city).filter(Boolean).join(', ')
        || undefined,
      employmentType: detail?.employment_type,
      remoteType: detail?.remote_type,
      postedOn: lineageEntry?.published_at || detail?.published_at || lineageEntry?.created_at || detail?.created_at,
      postedBy: detail?.created_by_name,
      /* Only the assessments actually recorded against THIS job version,
         newest assessment version first. */
      assessments: assessmentRows
        .filter((a) => a.jd_version === jobVersion)
        .sort((a, b) => (b.version ?? 1) - (a.version ?? 1)),
    };
  });

  return (
    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-700">
      <div className="flex items-center gap-2 mb-2.5">
        <FileText className="w-4 h-4 text-brand-blue" />
        <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Job Version History</p>
        {groups.length > 0 && (
          <span className="text-xs text-gray-500 dark:text-slate-400">
            {groups.length} job version{groups.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

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
           accordion is open — an expanded list has to be readable without
           fighting a 280px window. The brand-tinted border marks this as the
           ACTIVE version table; it only exists while the history is open. */
        <div
          className={`overflow-x-auto rounded-lg border border-brand-blue/50 ring-1 ring-brand-blue/15 shadow-sm shadow-brand-blue/10 dark:bg-slate-900 dark:border-brand-blue/40 dark:ring-brand-blue/25 dark:shadow-black/20 ${
            groups.length > 4 && expandedJobVersions.size === 0
              ? 'overflow-y-auto max-h-[280px] overscroll-contain'
              : ''
          }`}
        >
          <table className="w-full min-w-[1320px] text-left">
            <thead>
              {/* The bottom hairline is an inset shadow, not border-b —
                  collapsed-table borders detach from sticky cells and would
                  scroll away with the body. The background is on every th, NOT
                  on the tr: a sticky th only carries a background painted on
                  the cell itself, and a bg-less th lets body text show
                  through. */}
              <tr>
                {columns.map(({ label, minW }) => (
                  <th
                    key={label}
                    /* z order, back to front: body cells (auto) < sticky Action
                       td (5) < sticky header (7) < its pinned corner (8). */
                    className={`sticky top-0 py-2.5 px-3 text-xs font-bold text-gray-900 whitespace-nowrap bg-brand-sky dark:bg-slate-800 dark:text-slate-100 ${minW} ${
                      label === 'Actions'
                        ? 'right-0 z-[8] shadow-[inset_0_-1px_0_#e5e7eb,-1px_0_0_0_#e5e7eb] dark:shadow-[inset_0_-1px_0_#334155,-1px_0_0_0_#334155]'
                        : 'z-[7] shadow-[inset_0_-1px_0_#e5e7eb] dark:shadow-[inset_0_-1px_0_#334155]'
                    }`}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
              {groups.map((group) => {
                const count = group.assessments.length;
                const single = count === 1 ? group.assessments[0] : undefined;
                const hasAccordion = count > 1;
                const isOpen = expandedJobVersions.has(group.jobVersion);
                const rowTint = group.isLatestJobVersion
                  ? 'bg-brand-blue/[0.025] hover:bg-brand-blue/[0.05] dark:bg-brand-blue/[0.06] dark:hover:bg-brand-blue/[0.1]'
                  : 'hover:bg-brand-blue/[0.03] dark:hover:bg-brand-blue/[0.08]';
                const stickyTint = group.isLatestJobVersion
                  ? 'bg-[#f7f9fe] group-hover:bg-[#f2f6fd] dark:bg-slate-900 dark:group-hover:bg-slate-800'
                  : 'bg-white group-hover:bg-[#f8f9fc] dark:bg-slate-900 dark:group-hover:bg-slate-800';

                return (
                  /* One <tr> per job version, then one more carrying its
                     accordion. A keyed Fragment, not a bare `<>`: the pair is
                     one list item and React needs the key on the outer node. */
                  <Fragment key={`job-${group.jobVersion}`}>
                    {/* NO transform on the row: a transformed <tr> becomes the
                        containing block for its cells, which silently kills
                        position:sticky on the pinned Actions cell. */}
                    <tr
                      className={`group transition-colors duration-200 ease-out ${rowTint} ${
                        hasAccordion ? 'cursor-pointer' : ''
                      }`}
                      /* The whole row toggles, not just the chevron — a 32px
                         target at the far right of a scrolling table is a poor
                         one. Only where there is something to expand. */
                      onClick={hasAccordion ? () => toggleJobVersion(group.jobVersion) : undefined}
                    >
                      <td className="py-2.5 px-3 whitespace-nowrap align-middle">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-md text-xs font-semibold text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20 dark:bg-brand-blue/20 dark:text-blue-300 dark:ring-brand-blue/35">
                            Job v{group.jobVersion}
                          </span>
                          {group.isLatestJobVersion && (
                            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide text-white bg-brand-blue ring-1 ring-white/10">
                              Latest
                            </span>
                          )}
                        </span>
                      </td>
                      <td
                        className="py-2.5 px-3 text-sm text-gray-700 dark:text-slate-300 whitespace-nowrap max-w-[220px] truncate align-middle"
                        title={group.jobTitle || ''}
                      >
                        {group.jobTitle || '—'}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap align-middle">
                        <StatusChip label={jobStatusLabel(group.jobStatus)} />
                      </td>
                      {/* Experience / Industry — one column, stacked, exactly
                          as the Job Openings history stacks it. Industry runs
                          through the shared formatter so it never shows the raw
                          snake_case value. */}
                      <td className="py-2.5 px-3 whitespace-nowrap align-middle">
                        <div className="text-sm text-gray-700 dark:text-slate-300">
                          {group.experienceText || '—'}
                        </div>
                        <div
                          className="text-xs text-gray-500 dark:text-slate-400 max-w-[180px] truncate"
                          title={group.industryType ? formatIndustryType(group.industryType) : ''}
                        >
                          {group.industryType ? formatIndustryType(group.industryType) : '—'}
                        </div>
                      </td>
                      <td
                        className="py-2.5 px-3 text-sm text-gray-700 dark:text-slate-300 whitespace-nowrap max-w-[160px] truncate align-middle"
                        title={group.locationText || ''}
                      >
                        {group.locationText || '—'}
                      </td>
                      {/* Work Mode / Type — stacked: employment type over
                          remote mode. A missing half drops out rather than
                          being filled in. */}
                      <td className="py-2.5 px-3 whitespace-nowrap align-middle">
                        <div className="text-sm text-gray-700 dark:text-slate-300">
                          {group.employmentType ? formatEmploymentType(group.employmentType) : '—'}
                        </div>
                        {group.remoteType && (
                          <div className="text-xs text-gray-500 dark:text-slate-400">
                            {formatEmploymentType(group.remoteType)}
                          </div>
                        )}
                      </td>
                      {/* Posted On / By — date over author, the pair the two
                          old Created On / Created By columns used to spend two
                          columns on. */}
                      <td className="py-2.5 px-3 whitespace-nowrap align-middle">
                        <div className="text-sm text-gray-700 dark:text-slate-300">
                          {group.postedOn ? formatISTDate(group.postedOn) : '—'}
                        </div>
                        <div
                          className="text-xs text-gray-500 dark:text-slate-400 max-w-[160px] truncate"
                          title={group.postedBy || ''}
                        >
                          {group.postedBy || '—'}
                        </div>
                      </td>
                      {/* Summary, not a column pair: one assessment is named
                          here and needs no accordion, several are counted here
                          and listed below. Never a borrowed number — a job
                          version with none says so. */}
                      <td className="py-2.5 px-3 whitespace-nowrap align-middle">
                        {count === 0 ? (
                          <span className="text-xs text-gray-500 dark:text-slate-400">No assessment</span>
                        ) : single ? (
                          <span className="inline-flex items-center gap-1.5 max-w-full">
                            <CornerDownRight aria-hidden="true" className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500 flex-shrink-0" />
                            <AssessmentVersionChip version={single.version} />
                            <span
                              className={`text-sm truncate max-w-[150px] ${
                                onRowClick ? 'text-brand-blue hover:underline cursor-pointer' : 'text-gray-700 dark:text-slate-300'
                              }`}
                              title={stripVersionFromTitle(single.title || '') || single.short_id || ''}
                              onClick={onRowClick ? (e) => { e.stopPropagation(); onRowClick(single.id); } : undefined}
                            >
                              {stripVersionFromTitle(single.title || '') || single.short_id || '—'}
                            </span>
                          </span>
                        ) : (
                          /* The count alone. The Actions chevron and the
                             row's own click already say it opens, and its
                             aria-label carries that for a screen reader. */
                          <span className="inline-flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded-md text-xs font-semibold text-brand-cyan bg-brand-cyan/10 ring-1 ring-brand-cyan/20 dark:bg-brand-cyan/20 dark:text-cyan-200 dark:ring-brand-cyan/35">
                              {count} assessments
                            </span>
                          </span>
                        )}
                      </td>
                      {/* Actions — pinned right so it stays reachable while the
                          table scrolls sideways. Opaque background (plus a
                          hover tint matching the row's translucent one) so
                          content sliding underneath never shows through. */}
                      <td className={`py-2.5 px-3 whitespace-nowrap align-middle sticky right-0 z-[5] shadow-[-1px_0_0_0_#e5e7eb] transition-colors duration-200 dark:shadow-[-1px_0_0_0_#334155] ${stickyTint}`}>
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          {hasAccordion ? (
                            <button
                              type="button"
                              onClick={() => toggleJobVersion(group.jobVersion)}
                              aria-expanded={isOpen}
                              aria-label={
                                isOpen
                                  ? `Hide the ${count} assessments for Job v${group.jobVersion}`
                                  : `Show the ${count} assessments for Job v${group.jobVersion}`
                              }
                              title={isOpen ? 'Hide assessments' : `Show ${count} assessments`}
                              className="p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 rounded-lg transition-colors dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                            >
                              <ChevronDown
                                className={`w-4 h-4 transition-transform duration-300 ease-out ${isOpen ? 'rotate-180' : ''}`}
                              />
                            </button>
                          ) : single && renderAction ? (
                            /* One assessment, no accordion — so its actions
                               belong on the job row itself, where the reader
                               already is. */
                            renderAction(single)
                          ) : count === 0 && onCreateAssessment && group.jobVersionId ? (
                            /* No assessment for this job version yet, so the
                               row offers the one action that changes that.

                               Gated on `jobVersionId`: without this version's
                               own JD row id there is nothing to scope the new
                               assessment to, and falling back to the card's id
                               would quietly attach it to a DIFFERENT job
                               version. No button is better than the wrong
                               association. */
                            <button
                              type="button"
                              onClick={() => onCreateAssessment(group.jobVersionId!, group.jobVersion)}
                              title={`Create an assessment for Job v${group.jobVersion}`}
                              aria-label={`Create an assessment for Job v${group.jobVersion}`}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs whitespace-nowrap bg-brand-blue hover:bg-brand-blue-2 text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 transition-all"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Create
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>

                    {/* The accordion. Always mounted so it can animate BOTH
                        ways; `grid-rows-[0fr] → [1fr]` is what makes a
                        height-unknown block collapse smoothly, which a plain
                        max-height guess cannot do without either clipping tall
                        content or easing through empty space. `border-t-0`
                        needs the `!`: tbody's `divide-y` selector
                        (`.divide-y > :not([hidden]) ~ :not([hidden])`) outranks
                        a plain `border-t-0` on specificity, so without it a
                        stray rule is drawn under every job row that has an
                        accordion, open or shut. */}
                    {hasAccordion && (
                      <tr className="border-t-0!">
                        <td colSpan={columns.length} className="p-0">
                          <div
                            className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                              isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                            }`}
                          >
                            <div className="overflow-hidden">
                              <div className="bg-slate-50/70 dark:bg-slate-800/40 border-t border-gray-200 dark:border-slate-700">
                                {group.assessments.map((assessment) => {
                                  const isCurrent = !!currentAssessmentId && assessment.id === currentAssessmentId;
                                  const statusLabel =
                                    ASSESSMENT_STATUS_LABELS[String(assessment.status || '').toLowerCase()] || 'Draft';
                                  return (
                                    /* A flex row, not a nested <table>: a second
                                       table inside a colSpan cell would size its
                                       own columns and drift out of step with the
                                       parent's on every render. */
                                    <div
                                      key={assessment.id}
                                      className={`flex items-center gap-3 px-3 py-2 border-b last:border-b-0 border-gray-200/70 dark:border-slate-700/70 transition-colors ${
                                        isCurrent
                                          ? 'bg-brand-blue/[0.07] dark:bg-brand-blue/[0.14]'
                                          : 'hover:bg-white dark:hover:bg-slate-800'
                                      } ${onRowClick ? 'cursor-pointer' : ''}`}
                                      onClick={onRowClick ? () => onRowClick(assessment.id) : undefined}
                                    >
                                      {/* Indented under its job version, so the
                                          parent-child relationship survives the
                                          move out of the table's columns. */}
                                      <CornerDownRight aria-hidden="true" className="w-4 h-4 ml-4 text-gray-400 dark:text-slate-500 flex-shrink-0" />
                                      <span className="w-[150px] flex-shrink-0">
                                        <AssessmentVersionChip version={assessment.version} />
                                      </span>
                                      <span
                                        className="flex-1 min-w-[160px] text-sm text-gray-900 dark:text-slate-100 truncate"
                                        title={stripVersionFromTitle(assessment.title || '') || ''}
                                      >
                                        {stripVersionFromTitle(assessment.title || '') || assessment.short_id || '—'}
                                        {assessment.short_id && (
                                          <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold text-gray-600 bg-slate-100 ring-1 ring-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
                                            {assessment.short_id}
                                          </span>
                                        )}
                                      </span>
                                      <span className="w-[110px] flex-shrink-0">
                                        <StatusChip label={statusLabel} />
                                      </span>
                                      <span className="w-[120px] flex-shrink-0 text-sm text-gray-700 dark:text-slate-300">
                                        {assessment.created_at ? formatISTDate(assessment.created_at) : '—'}
                                      </span>
                                      <span className="w-[120px] flex-shrink-0 text-sm text-gray-700 dark:text-slate-300">
                                        {assessment.updated_at ? formatISTDate(assessment.updated_at) : '—'}
                                      </span>
                                      <span
                                        className="w-[130px] flex-shrink-0 text-sm text-gray-700 dark:text-slate-300 truncate"
                                        title={assessment.created_by_name || ''}
                                      >
                                        {assessment.created_by_name || '—'}
                                      </span>
                                      {renderAction && (
                                        <span className="flex-shrink-0 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                          {renderAction(assessment)}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
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
      )}
    </div>
  );
}
