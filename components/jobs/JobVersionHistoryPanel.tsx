'use client';

import { FileText, RefreshCw, Users } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Job } from '@/lib/types/types';
import type { JDLineageVersion, JDResponse } from '@/lib/services/jdService';
import { formatIST, formatISTDate } from '@/lib/utils/dateUtils';
import { formatJobExperienceText } from '@/lib/utils/jobExperience';
import {
  formatEmploymentType,
  formatIndustryType,
  getCreationMethodConfig,
  getDisplayStatus,
  getStatusConfig,
  resolveVersionHistoryRows,
} from '@/lib/utils/jobOpeningDisplay';

/**
 * The columns every surface shows. Select is prepended and Action appended per
 * surface — see `buildColumns`: the Job Openings list has actions and no
 * selection, the Apply to Job dialog is the other way round. "Scored By" is
 * likewise conditional: it only means anything on the Resume Scoring page, so
 * it's included only when that page passes `versionScoredBy` — Job Openings
 * and the Apply to Job dialog never see the column at all.
 *
 * Source (which module produced a score) is NOT one of these columns — a
 * version can carry scores from several different sources at once, so one
 * column per VERSION can't represent that. It's shown per SCORED RESUME
 * instead, in ScoredResumesTable, where each row has its own real answer.
 */
const buildBaseColumns = (showScoredBy: boolean): { label: string; minW: string }[] => [
  { label: 'Version', minW: 'min-w-[72px]' },
  { label: 'Job Title', minW: 'min-w-[160px]' },
  { label: 'Status', minW: 'min-w-[110px]' },
  { label: 'Experience / Industry', minW: 'min-w-[150px]' },
  { label: 'Location', minW: 'min-w-[120px]' },
  { label: 'Work Mode / Type', minW: 'min-w-[130px]' },
  { label: 'Posted On / By', minW: 'min-w-[130px]' },
  { label: 'Last Updated', minW: 'min-w-[110px]' },
  ...(showScoredBy ? [{ label: 'Scored By', minW: 'min-w-[160px]' }] : []),
  { label: 'Applicants', minW: 'min-w-[90px]' },
];

const buildColumns = (
  selectable: boolean,
  actionable: boolean,
  showScoredBy: boolean,
  extraColumns: ExtraVersionColumn[],
) => [
  ...(selectable ? [{ label: 'Select', minW: 'min-w-[64px]' }] : []),
  ...buildBaseColumns(showScoredBy),
  ...extraColumns.map(({ label, minW }) => ({ label, minW })),
  ...(actionable ? [{ label: 'Action', minW: 'min-w-[64px]' }] : []),
];

/**
 * A column a host adds after the shared ones, before Action.
 *
 * For a fact that belongs to THAT surface rather than to job versions in
 * general — the assessment each JD version does or does not have, on the
 * assessment JD picker. Kept as a column rather than crammed into the Action
 * cell so the table still reads as a table, and optional so every other host
 * renders exactly the columns it did before.
 */
export interface ExtraVersionColumn {
  label: string;
  minW: string;
  render: (versionJob: Job) => ReactNode;
}

interface JobVersionHistoryPanelProps {
  /** The latest-version row this history hangs off. */
  job: Job;
  /** Lineage for this job, or undefined while it is still being fetched. */
  versions: JDLineageVersion[] | undefined;
  loading: boolean;
  versionDetails: Record<string, JDResponse>;
  versionApplicants: Record<string, number>;
  /**
   * Who most recently scored a resume against each version, and when —
   * renders as a "Scored By" column just before Applicants. Omit it (the
   * default) and the column is dropped entirely, header included: only the
   * Resume Scoring page's version history has anything meaningful to put
   * there. `null` means the version has never been scored; an unset key means
   * still loading.
   */
  versionScoredBy?: Record<string, { name: string; scoredAt: string; source?: string } | null>;
  /**
   * The Action cell for one version, built from a Job-shaped stand-in pointed
   * at THAT version's id — so a host's existing per-job handlers work unchanged.
   * Omit it and the Action COLUMN itself is dropped, header included: the Apply
   * to Job dialog has no per-version actions, and an always-present empty
   * column there was just a dead pinned strip.
   */
  renderAction?: (versionJob: Job) => ReactNode;
  /**
   * Turns on the Select column: one radio per version row, so a specific
   * version can be picked instead of the latest. The argument is the same
   * Job-shaped stand-in `renderAction` receives, pointed at that version's id,
   * which is what the caller then acts on.
   *
   * Only published versions are offered — a draft or archived version cannot
   * receive candidates, so its radio is disabled with the reason attached
   * rather than hidden.
   */
  onSelectVersion?: (versionJob: Job) => void;
  /** Which version is currently picked, if any — the checked radio. */
  selectedVersionId?: string | null;
  /**
   * Keep the LATEST version's row when the Select column is on.
   *
   * Off by default, because on most selectable surfaces the row this panel
   * hangs off is itself a radio for the latest version, and listing it again
   * would put two radios on screen for one pick. The assessment JD picker sets
   * it: its table carries an Assessment column and a per-version Create action
   * that have to answer for v3 beside v2 and v1, so the latest row cannot be
   * dropped. A host that turns this on must keep its own card radio in a
   * SEPARATE `radioGroupName`, or the browser will strip the checked state off
   * one of the two inputs that represent the same pick.
   */
  keepLatestWhenSelectable?: boolean;
  /**
   * Per-version veto on selection, replacing the panel's default
   * published-only rule. Return `null` where the version can be picked, or the
   * reason it cannot — which becomes the disabled radio's tooltip.
   *
   * Assessments are built against drafts as freely as against published
   * versions, and are blocked instead by a version already having one, so that
   * surface answers this question for itself.
   */
  versionSelectionState?: (versionJob: Job) => string | null;
  /** Tooltip on a selectable version's radio. Defaults to "Apply to vN". */
  selectHint?: (versionJob: Job) => string;
  /**
   * Turn every radio off without dropping the column — set when the host has
   * already committed the pick elsewhere (another job is chosen in the Apply to
   * Job dialog), so this table stays legible and consistent with the row above
   * it instead of quietly offering a pick that would override that choice.
   */
  selectionDisabled?: boolean;
  /** Why selection is off, for the disabled radios' tooltip. */
  selectionDisabledReason?: string;
  /**
   * Radio group name. Share it with the caller's other radios (the job rows in
   * the Apply to Job dialog) and picking a version un-picks whatever else was
   * chosen, at the browser level as well as in state.
   */
  radioGroupName?: string;
  /** Where a version's title links to. Defaults to its Job Details page. */
  versionHref?: (versionId: string) => string;
  /**
   * Open version links in a new tab. Set inside a dialog, where following a
   * link in place would throw away whatever the user had selected.
   */
  openInNewTab?: boolean;
  /** Row click — omitted inside a dialog, where the title link is the way in. */
  onRowClick?: (versionId: string) => void;
  /**
   * Drop the row's hover flourish — the job-title text scaling up under the
   * cursor. Set where the rows are things you click to SELECT rather than to
   * navigate: on a selectable row that little scale reads as the control
   * twitching when you tick it.
   */
  staticRows?: boolean;
  /**
   * Status the host knows a version is now in, by version id — applied over
   * whatever the cached lineage says.
   *
   * The lineage is fetched once and cached, so a version whose status the host
   * has just changed (Archive, Disable, Unarchive, Re-enable from the row's own
   * menu) would keep rendering the status it was fetched with until the panel is
   * reopened. The host sets an entry here only AFTER the backend confirmed the
   * change, so this can only ever show a status the database actually holds.
   *
   * Keyed by version id, so it moves exactly one row and leaves every sibling
   * version alone.
   */
  statusOverrides?: Record<string, string>;
  /** Drop still-drafted versions from the chain — see resolveVersionHistoryRows. */
  publishedOnly?: boolean;
  /** Host-specific columns, inserted after the shared ones and before Action. */
  extraColumns?: ExtraVersionColumn[];
  /**
   * Pin the Version column to the left edge while the table scrolls
   * sideways, the same way Select/Action already pin. Resume Scoring's job
   * list turns this on: that table is wide enough that scrolling right to
   * read Scored By/Applicants otherwise loses track of which version a row
   * even is. Off by default — Job Openings and the Apply to Job dialog keep
   * Version as an ordinary column, and neither host sets this alongside a
   * Select column (the two would fight over the left edge).
   */
  stickyVersionColumn?: boolean;
}

/**
 * Version History, expanded in place under a job row.
 *
 * The columns mirror the main list's, so a version row reads like the job row
 * above it. Every cell is real data — lineage fields plus the version's own JD
 * record; anything still loading or unavailable shows a dash, never a
 * placeholder.
 *
 * Shared by the Job Openings list and the Apply to Job dialog: one table, so
 * the history a recruiter reads is the same in both places.
 */
export default function JobVersionHistoryPanel({
  job,
  versions,
  loading,
  versionDetails,
  versionApplicants,
  versionScoredBy,
  renderAction,
  onSelectVersion,
  selectedVersionId = null,
  keepLatestWhenSelectable = false,
  versionSelectionState,
  selectHint = (versionJob) => `Apply to v${versionJob.versionNumber ?? 1}`,
  selectionDisabled = false,
  selectionDisabledReason,
  radioGroupName = 'job-version-selection',
  versionHref = (id) => `/recruitment/job-details?id=${id}`,
  openInNewTab = false,
  onRowClick,
  staticRows = false,
  statusOverrides,
  publishedOnly = false,
  extraColumns = [],
  stickyVersionColumn = false,
}: JobVersionHistoryPanelProps) {
  const columns = buildColumns(!!onSelectVersion, !!renderAction, !!versionScoredBy, extraColumns);
  /* Which versions this table lists: the WHOLE chain — v1, v2 … up to and
     including the latest.

     The latest used to be dropped here, on the reasoning that the row this
     panel hangs off already IS the latest, so listing it again duplicated what
     the user was looking at. In practice that left the history reading as an
     incomplete story: a job at v2 showed a Version History of "v1" alone, with
     no row for the version actually live. The version the whole lineage leads
     up to belongs in its own history, marked as the latest (see `isLatest` per
     row below) so it is never mistaken for one of the superseded ones.

     Deduplicated by version NUMBER rather than id: a republished JD can report
     several entries sharing one version number — republishing bumps
     current_version, not the lineage version — and those are one version, not
     several. The first entry for a number wins.

     Sorted newest-first, so the table opens on the live version — v3 (Latest)
     → v2 → v1. The version a recruiter is most likely to want is the one they
     read without scrolling, and it matches the rest of the page, where the
     newest thing is always at the top.

     No status test: the latest is listed whatever it is, so a Published latest
     and a Republished one (the same DB status — `getDisplayStatus` below derives
     the "Republished" label from current_version) both appear without either
     being special-cased.

     Resolution itself (dedup by version number, newest-first sort, isLatest)
     lives in `resolveVersionHistoryRows` — shared with the compact
     JobVersionHistoryCards on Resume Scoring's grid view, so both always
     render the identical chain. The `excludeId` exception below is specific to
     CONTROL surfaces: in the Apply to Job dialog the row above this table is
     itself a radio for this same version, and selection is keyed on the job
     id — so listing it here would put two checked radios on screen for one
     pick. A read-only table has no such clash, which is why this is gated on
     selection mode rather than applied everywhere. */
  const jobVersions = resolveVersionHistoryRows(job, versions, {
    excludeId: onSelectVersion && !keepLatestWhenSelectable ? job.id : undefined,
    publishedOnly,
    versionApplicants,
  });

  return (
    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-700">
      <div className="flex items-center gap-2 mb-2.5">
        <FileText className="w-4 h-4 text-brand-blue" />
        <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Version History</p>
      </div>
      {loading && !versions ? (
        <div className="flex items-center gap-2 py-2 text-xs text-gray-500 dark:text-slate-400">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          Loading versions...
        </div>
      ) : jobVersions.length === 0 ? (
        <p className="py-2 text-xs text-gray-500 dark:text-slate-400">No versions recorded for this job.</p>
      ) : (
        /* One shell owns BOTH scroll axes (x on narrow screens, y past 3 rows),
           so header and body live in one <table> and their columns can never
           drift apart. The y-cap only exists when there are more than 3
           versions: header (~37px) + 3 typical two-line rows (~66px each). The
           header row is sticky top; the Action column is sticky right; the
           Action HEADER is pinned on both axes so the corner never scrolls
           away. The brand-tinted border marks this as the ACTIVE version table
           — it only exists while View Versions is open. */
        <div
          className={`overflow-x-auto rounded-lg border border-brand-blue/50 ring-1 ring-brand-blue/15 shadow-sm shadow-brand-blue/10 dark:bg-slate-900 dark:border-brand-blue/40 dark:ring-brand-blue/25 dark:shadow-black/20 ${
            jobVersions.length > 3 ? 'overflow-y-auto max-h-[240px] overscroll-contain' : ''
          }`}
        >
          <table className="w-full min-w-[960px] text-left">
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
                    /* z order, back to front: body cells (auto) < sticky
                       Select/Action td (5) < sticky header (7) < their pinned
                       corners (8) — so rows slide under the header and the
                       header slides under nothing. Select pins left, Action
                       right; both stay reachable while the table scrolls
                       sideways. */
                    className={`sticky top-0 py-2.5 px-3 text-xs font-bold text-gray-900 whitespace-nowrap bg-brand-sky dark:bg-slate-800 dark:text-slate-100 ${minW} ${
                      label === 'Action'
                        ? 'right-0 z-[8] shadow-[inset_0_-1px_0_#e5e7eb,-1px_0_0_0_#e5e7eb] dark:shadow-[inset_0_-1px_0_#334155,-1px_0_0_0_#334155]'
                        : label === 'Select' || (label === 'Version' && stickyVersionColumn)
                          ? 'left-0 z-[8] shadow-[inset_0_-1px_0_#e5e7eb,1px_0_0_0_#e5e7eb] dark:shadow-[inset_0_-1px_0_#334155,1px_0_0_0_#334155]'
                          : 'z-[7] shadow-[inset_0_-1px_0_#e5e7eb] dark:shadow-[inset_0_-1px_0_#334155]'
                    }`}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
              {jobVersions.map((version) => {
                /* Lineage rows carry the raw DB status ('published'); the status
                   helpers speak the Job type's capitalised form. */
                const rawStatus = statusOverrides?.[version.id] || version.status || '';
                const { isLatest } = version;
                const versionStatus = getDisplayStatus(
                  rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1).toLowerCase(),
                  version.current_version,
                );
                const versionStatusConfig = getStatusConfig(versionStatus);
                /* A Job-shaped stand-in pointed at THIS version's id, so a
                   host's Action menu reuses the exact handlers its job rows
                   call — no duplicate logic. The plain capitalised status (not
                   the display label, which can read "Republished") drives the
                   same per-status gates. */
                const versionPlainStatus = rawStatus
                  ? rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1).toLowerCase()
                  : job.status;
                const versionJob: Job = {
                  ...job,
                  id: version.id,
                  title: version.title || job.title,
                  status: versionPlainStatus as Job['status'],
                  currentVersion: version.current_version ?? job.currentVersion,
                  versionNumber: version.version_number,
                };
                const detail = versionDetails[version.id];
                const experienceText = detail
                  ? formatJobExperienceText({
                      jobLevel: detail.job_level || detail.experience_level,
                      experienceMin: detail.experience_min,
                      experienceMax: detail.experience_max,
                    })
                  : '';
                const postedOn = version.published_at || detail?.published_at || version.created_at || detail?.created_at;
                const lastUpdated = detail?.updated_at || version.published_at || version.created_at;
                const locationText =
                  detail?.location
                  || (detail?.locations || []).map((loc) => loc?.city).filter(Boolean).join(', ');
                const isSelected = !!onSelectVersion && selectedVersionId === version.id;
                /* Only a published version can receive candidates — the same
                   rule the dialog's job list is built on, applied per version
                   here so a draft in the history can't be picked. A host that
                   answers this question itself (`versionSelectionState`)
                   replaces the rule outright: the assessment picker builds
                   against drafts, and blocks on an existing assessment
                   instead. */
                const hostVeto = versionSelectionState ? versionSelectionState(versionJob) : undefined;
                const selectableByRule =
                  hostVeto === undefined ? versionPlainStatus === 'Published' : hostVeto === null;
                const selectable = selectableByRule && !selectionDisabled;
                const notSelectableReason = selectionDisabled
                  ? selectionDisabledReason
                  : hostVeto ?? 'Only published versions can receive candidates';

                return (
                  /* NO transform on the row itself: a transformed <tr> becomes
                     the containing block for its cells, which silently kills
                     position:sticky on the pinned Action cell. The hover pop
                     lives on the Job Title text instead (group-hover below). */
                  <tr
                    key={version.id}
                    /* The latest version carries a faint brand tint, so it
                       reads as the live one among the superseded rows. Kept
                       below the selected tint, which is the state the user just
                       acted on, and light enough that the pinned Action/Select
                       cells' own backgrounds still sit cleanly over it. */
                    className={`group transition-colors duration-200 ease-out ${
                      isSelected
                        ? 'bg-brand-blue/[0.07] dark:bg-brand-blue/[0.14]'
                        : isLatest
                          ? 'bg-brand-blue/[0.025] hover:bg-brand-blue/[0.05] dark:bg-brand-blue/[0.06] dark:hover:bg-brand-blue/[0.1]'
                          : 'hover:bg-brand-blue/[0.03] dark:hover:bg-brand-blue/[0.08]'
                    } ${onRowClick ? 'cursor-pointer' : ''}`}
                    onClick={onRowClick ? () => onRowClick(version.id) : undefined}
                  >
                    {onSelectVersion && (
                      /* Pinned left, mirroring the Action column's treatment on
                         the surfaces that have one: opaque background so cells
                         sliding underneath never show through, plus the hairline
                         that makes it read as floating over them. */
                      <td
                        /* Solid colour, not the row's own translucent
                           `bg-brand-blue/[x]`: a sticky cell needs an opaque
                           background so cells sliding underneath during
                           horizontal scroll never show through. #eff3f9 per
                           spec, static — not just on hover — so the cell
                           reads the same whether the row is being hovered
                           or not. */
                        className={`py-2.5 px-3 whitespace-nowrap align-middle sticky left-0 z-[5] shadow-[1px_0_0_0_#e5e7eb] transition-colors duration-200 dark:shadow-[1px_0_0_0_#334155] ${
                          isSelected
                            ? 'bg-[#eef2fb] dark:bg-slate-800'
                            : 'bg-[#eff3f9] dark:bg-slate-900'
                        }`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <label
                          /* An unpickable radio is dimmed as well as disabled —
                             a greyed native control alone is easy to miss on a
                             table where every other row still ticks. */
                          className={`flex items-center ${selectable ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
                          title={selectable ? selectHint(versionJob) : notSelectableReason}
                        >
                          <input
                            type="radio"
                            name={radioGroupName}
                            checked={isSelected}
                            disabled={!selectable}
                            onChange={() => selectable && onSelectVersion(versionJob)}
                            /* Clicking the picked one lets go of it, the same
                               way the job rows behave. */
                            onClick={() => isSelected && onSelectVersion(versionJob)}
                            /* Same size, colour and focus ring as the job
                               rows' own radio, so a version tick and a job tick
                               read as the same control. .tf-radio-tinted
                               (globals.css) — see that radio's own comment for
                               why this is a plain CSS rule rather than a
                               Tailwind arbitrary-value class. */
                            className="tf-radio-tinted focus:ring-brand-blue/40 flex-shrink-0"
                          />
                          <span className="sr-only">
                            Select version v{version.version_number ?? 1}
                          </span>
                        </label>
                      </td>
                    )}
                    <td className={`py-2.5 px-3 whitespace-nowrap align-middle ${
                      stickyVersionColumn
                        ? 'sticky left-0 z-[5] bg-[#eff3f9] shadow-[1px_0_0_0_#e5e7eb] transition-colors duration-200 dark:bg-slate-900 dark:shadow-[1px_0_0_0_#334155]'
                        : ''
                    }`}>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-md text-xs font-semibold text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20 dark:bg-brand-blue/20 dark:text-blue-300 dark:ring-brand-blue/35">
                          v{version.version_number ?? 1}
                        </span>
                        {/* Marks the live version, so the row added to the
                            bottom of the chain is never read as just another
                            superseded one. */}
                        {isLatest && (
                          <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide text-white bg-brand-blue ring-1 ring-white/10">
                            Latest
                          </span>
                        )}
                      </span>
                    </td>
                    <td
                      className="p-0 text-sm text-gray-900 dark:text-slate-100 max-w-[220px] overflow-hidden align-middle"
                      title={version.title || detail?.title || ''}
                    >
                      {/* The job role pops on row hover — a gentle scale from
                          the left edge. Scoped to this span so the sticky
                          Action column is unaffected. */}
                      <Link
                        href={versionHref(version.id)}
                        target={openInNewTab ? '_blank' : undefined}
                        rel={openInNewTab ? 'noopener noreferrer' : undefined}
                        onClick={(e) => e.stopPropagation()}
                        className="block h-full w-full py-2.5 px-3 hover:text-brand-blue hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 focus-visible:ring-offset-2"
                      >
                        <span className={`inline-block max-w-full truncate ${
                          staticRows ? '' : 'transform-gpu transition-transform duration-200 ease-out origin-left group-hover:scale-105'
                        }`}>
                          {version.title || detail?.title || '—'}
                        </span>
                      </Link>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap align-middle">
                      <div className="flex flex-col items-start gap-1">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${versionStatusConfig.bg} ${versionStatusConfig.text} border ${versionStatusConfig.border}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${versionStatusConfig.dot}`} />
                          {versionStatus}
                        </span>
                        {/* AI / Manual — same badge the job rows carry, from
                            this version's own record. Rendered only once the
                            detail fetch lands so a loading row doesn't claim
                            "Manual" by default. */}
                        {detail && (() => {
                          const methodConfig = getCreationMethodConfig(detail.creation_method);
                          return (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${methodConfig.bg} ${methodConfig.text} border ${methodConfig.border}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${methodConfig.dot}`} />
                              {methodConfig.label}
                            </span>
                          );
                        })()}
                      </div>
                    </td>
                    {/* Experience / Industry — one column, stacked, same
                        space-saving treatment as Posted On / By below.
                        Industry runs through the same formatter as the job rows
                        so it never shows the raw snake_case value. */}
                    <td className="py-2.5 px-3 whitespace-nowrap align-middle">
                      <div className="text-sm text-gray-700 dark:text-slate-300">
                        {experienceText || '—'}
                      </div>
                      <div
                        className="text-xs text-gray-500 dark:text-slate-400 max-w-[180px] truncate"
                        title={detail?.industry_type ? formatIndustryType(detail.industry_type) : ''}
                      >
                        {detail?.industry_type ? formatIndustryType(detail.industry_type) : '—'}
                      </div>
                    </td>
                    {/* Location — this version's own record; single field
                        first, else the cities from the locations list. */}
                    <td
                      className="py-2.5 px-3 text-sm text-gray-700 dark:text-slate-300 whitespace-nowrap max-w-[160px] truncate align-middle"
                      title={locationText || ''}
                    >
                      {locationText || '—'}
                    </td>
                    {/* Work Mode / Type — stacked: employment type over remote
                        mode, from this version's own record. A missing half
                        simply drops out; nothing is invented. */}
                    <td className="py-2.5 px-3 whitespace-nowrap align-middle">
                      <div className="text-sm text-gray-700 dark:text-slate-300">
                        {detail?.employment_type ? formatEmploymentType(detail.employment_type) : '—'}
                      </div>
                      {detail?.remote_type && (
                        <div className="text-xs text-gray-500 dark:text-slate-400">
                          {formatEmploymentType(detail.remote_type)}
                        </div>
                      )}
                    </td>
                    {/* Posted On / By — one column, date over author, so the
                        table stays narrower without dropping either fact. */}
                    <td className="py-2.5 px-3 whitespace-nowrap align-middle">
                      <div className="text-sm text-gray-700 dark:text-slate-300">
                        {postedOn ? formatISTDate(postedOn) : '—'}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-slate-400 max-w-[160px] truncate" title={detail?.created_by_name || ''}>
                        {detail?.created_by_name || '—'}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-sm text-gray-700 dark:text-slate-300 whitespace-nowrap align-middle">
                      {lastUpdated ? formatISTDate(lastUpdated) : '—'}
                    </td>
                    {versionScoredBy && (() => {
                      /* Unset key = still loading; explicit null = loaded and
                         genuinely never scored — those read differently, so
                         they're not collapsed into one fallback. */
                      const scoredByLoaded = Object.prototype.hasOwnProperty.call(versionScoredBy, version.id);
                      const info = versionScoredBy[version.id];
                      return (
                        <td className="py-2.5 px-3 whitespace-nowrap align-middle">
                          {info ? (
                            <div className="text-sm text-gray-700 dark:text-slate-300">
                              <div className="truncate max-w-[170px]" title={info.name}>
                                Scored by {info.name}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-slate-400">
                                {formatIST(info.scoredAt)}
                              </div>
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400 dark:text-slate-500">
                              {scoredByLoaded ? 'Not scored yet' : '—'}
                            </span>
                          )}
                        </td>
                      );
                    })()}
                    <td className="py-2.5 px-3 whitespace-nowrap align-middle">
                      <span className="inline-flex items-center gap-1.5 text-sm text-gray-700 dark:text-slate-300">
                        <Users className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                        {/* Resumes scored against this version. Dash only while
                            the count is still in flight (or if it failed) — a
                            real zero prints as 0. */}
                        {versionApplicants[version.id] ?? '—'}
                      </span>
                    </td>
                    {extraColumns.map(({ label, render }) => (
                      <td key={label} className="py-2.5 px-3 whitespace-nowrap align-middle">
                        {render(versionJob)}
                      </td>
                    ))}
                    {renderAction && (
                      /* Action — pinned right so it stays reachable while the
                         table scrolls sideways. Opaque background (plus a solid
                         hover tint matching the row's translucent one) so
                         content sliding underneath never shows through; the
                         left hairline makes it read as floating over the
                         scrolling cells. */
                      <td className="py-2.5 px-3 whitespace-nowrap align-middle sticky right-0 z-[5] bg-[#eff3f9] shadow-[-1px_0_0_0_#e5e7eb] transition-colors duration-200 dark:bg-slate-900 dark:shadow-[-1px_0_0_0_#334155]">
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          {renderAction(versionJob)}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
