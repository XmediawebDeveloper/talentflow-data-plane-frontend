'use client';

import { Fragment, useState } from 'react';
import { ChevronDown, Eye, Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Pagination from '@/components/Pagination';
import type { ReactNode } from 'react';
import type { JDLineageVersion, JDResponse } from '@/lib/services/jdService';
import { formatISTDate, formatISTTime } from '@/lib/utils/dateUtils';
import { getDisplayStatus, getStatusConfig } from '@/lib/utils/jobOpeningDisplay';
import { isStandardExperienceLevel } from '@/lib/utils/jobExperience';
import { toOneDecimalScore } from '@/lib/utils/score';
import { ASSESSMENT_JOB_LOCK_MESSAGE } from '@/lib/utils/assessmentJobLock';

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
  /**
   * The JD ROW this assessment was authored against — the job version's own
   * id, and the join key.
   *
   * Every job version is a JD row of its own, so this id names one version
   * exactly. It decides which job version counts this assessment, and
   * therefore whether that version offers Create Assessment or View
   * Assessment. Required on AssessmentResponse, so it is present on every row
   * the list endpoint returns.
   */
  jd_id?: string;
  /**
   * The job version NUMBER recorded at creation time. The FALLBACK join key,
   * used only where the id cannot resolve — it is optional on
   * AssessmentResponse, and a number cannot separate two JD rows reporting
   * the same version, so the id is asked first.
   */
  jd_version?: number;
  /* The three rounds and the share of the score each carries, as configured
     on the assessment (`<section>_enabled` / `<section>_percentage` on
     AssessmentResponse). Read by the Round Weightage column, which took the
     place of Questions: a count of configured TOPICS said little about an
     assessment, where the split between its rounds is the shape of it. */
  hr_enabled?: boolean;
  hr_percentage?: number;
  technical_enabled?: boolean;
  technical_percentage?: number;
  coding_enabled?: boolean;
  coding_percentage?: number;
}

interface AssessmentVersionHistoryPanelProps {
  /**
   * Page both tables — the Job Versions rows and each job version's
   * Assessment Versions rows — with the pagination bar (components/Pagination),
   * each on its own page state. Off by default, so every other host keeps the full lists it
   * has; the Assessments page turns it on to match its other tables.
   */
  paginated?: boolean;
  /** The JD's own lineage — every job version. Undefined while it loads. */
  jobVersions: JDLineageVersion[] | undefined;
  /** Full JD record per job-version id, for that version's own author. */
  jobVersionDetails: Record<string, JDResponse>;
  /** Every assessment in this JD's lineage, in any order — sorted here. */
  assessments: AssessmentVersionRow[] | undefined;
  /**
   * The BACKEND's answer to "which JD versions have an assessment" — the ids
   * from `/assessments/jds-with-assessments`, which reports every JD row
   * holding a non-archived assessment, Draft and Published alike.
   *
   * Read as a second, independent source beside `assessments`, and the two
   * are UNIONED rather than one winning. Both are evidence that an assessment
   * exists, and they fail in different directions: this index is complete but
   * says only yes-or-no, while `assessments` carries the detail but is one
   * request that can come back short or not at all. Trusting the rows alone
   * would then offer Create Assessment for a version that already has one —
   * the exact mistake this panel has to avoid, and the one a recruiter cannot
   * see is a mistake. A union is the fail-closed direction: the worst a stale
   * `true` does is send them to View Assessment for a version they would have
   * been refused a second assessment on anyway.
   *
   * Optional — omitted, the rows answer alone, as they did before.
   */
  jdsWithAssessments?: Set<string>;
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
   * What the child rows are CALLED. Omitted, the assessment wording stands —
   * see `ASSESSMENT_VOCABULARY`.
   */
  vocabulary?: VersionHistoryVocabulary;
  /**
   * The child table's one descriptive cell, paired with
   * `vocabulary.detailColumn`. Omitted, it is Round Weightage, which reads the
   * three `<section>_enabled` / `<section>_percentage` fields off the row.
   *
   * A slot because that cell is the only part of this table that is about what
   * the child IS rather than about its version, state or provenance — and so
   * the only part a different kind of child cannot share.
   */
  renderChildDetail?: (child: AssessmentVersionRow) => ReactNode;
  /** The cell under `vocabulary.extraDetailColumn`, when the vocabulary has one. */
  renderChildExtraDetail?: (child: AssessmentVersionRow) => ReactNode;
  /**
   * Leave Draft job versions out of the table. A Draft is not yet a
   * published/active version of the job, so the Total Jobs list does not show
   * it. Display only: the Draft record is untouched and still opens from the
   * job's own Draft workflow. Read off the same status the Status column
   * prints (`jobVersionDisplayStatus`); a version whose status is still
   * loading stays listed. Omitted, every version is shown as before.
   */
  hideDraftJobVersions?: boolean;
  /**
   * Leave out job versions with no assessment, so the table lists only the
   * versions an assessment was created for (the Total Jobs list). Read off the
   * same `hasAssessment` that decides the row's View Assessment, so a version
   * is listed exactly when it would offer one. Display only, like
   * `hideDraftJobVersions`; omitted, every version is shown as before.
   */
  hideJobVersionsWithoutAssessments?: boolean;
  /**
   * The trailing controls for one assessment — the host's own three-dot menu
   * and quick actions. Given that assessment's record so the host's existing
   * per-assessment handlers work unchanged. Omit it and the Actions column
   * keeps only this panel's own buttons.
   */
  renderAction?: (assessment: AssessmentVersionRow) => ReactNode;
  /**
   * True when `renderAction` is only a 3-dot menu (no quick-action icons), so
   * the Actions column reserves one button's width instead of the icon
   * cluster's — letting the child table fit its container without a
   * horizontal scrollbar.
   */
  menuOnlyActions?: boolean;
  /**
   * `renderAction` renders a single control (a lone ⋮ menu), so the Actions
   * column is sized for one 28px button instead of a row of quick actions.
   */
  singleActionControl?: boolean;
  /**
   * The picked ASSESSMENT version, and the way to change it.
   *
   * Selection lives here and nowhere else in this panel. There is no radio on
   * a job version row and none on the job itself: a job version is reached by
   * expanding it and a job by opening the panel, neither of which is a choice
   * that has to be held. The one thing worth holding is which assessment
   * version the reader has settled on, so that is the only thing with a
   * control.
   *
   * ONE group across the whole panel, not one per job version. Several job
   * versions can be expanded at once, and "one assessment version at a time"
   * has to hold across all of them - a per-group radio would happily let one
   * row in each expanded group be selected simultaneously, which is precisely
   * the multi-selection this must not allow.
   *
   * Controlled: the panel renders `selectedAssessmentId` and reports clicks.
   * It keeps no copy, so what survives a reopen is whatever the host chose to
   * keep, and the panel cannot drift from it.
   *
   * Omit `onSelectAssessment` and the column is not rendered at all - a radio
   * nothing reads is a control that does nothing.
   */
  selectedAssessmentId?: string | null;
  /**
   * Opt-in MULTI-select: pass the picked ids and the select column becomes
   * checkboxes, each click reported through `onSelectAssessment` for the host
   * to toggle. For the invite flows that send several assessments at once
   * (AI Talent Match). Omitted, the panel is the single-choice radio group
   * described above, unchanged.
   */
  selectedAssessmentIds?: string[];
  /**
   * Reports the pick together with the JOB VERSION it was made under.
   *
   * The version matters as much as the assessment: assessment version numbers
   * restart per job version, so "Assessment V1" alone names several different
   * rows in one job. The caller needs the pair to say what was chosen, and to
   * show it again afterwards.
   */
  onSelectAssessment?: (
    assessmentId: string,
    context: { jobVersion: number; jobVersionId?: string },
  ) => void;
  /**
   * The Job Version + Assessment Version pair currently chosen.
   *
   * It DE-EMPHASISES, it does not lock. Rows outside the pair fade back so
   * the active branch is obvious at a glance, but every one of them stays
   * clickable and every radio stays enabled: picking any other assessment,
   * under any other job version, simply replaces the pair. Hover returns a
   * faded row to full strength, which is the signal that it is still live.
   *
   * This was a hard lock and that was wrong. `pointer-events-none` on the
   * other rows meant the only way to change a choice was to clear it first
   * and start again - select, deselect, navigate, select. A single-choice
   * control should behave like a radio group: click another option and the
   * previous one gives way.
   *
   * Scoped to the PAIR, not to the assessment alone. Two job versions can
   * each hold an "Assessment V1", so keying on the assessment version NUMBER
   * would highlight a row in a different branch that happens to share a
   * number. Matched by job version first, then by the row's own id.
   *
   * Null on the Job List, which chooses nothing - reading a history is not a
   * choice that has to exclude anything.
   */
  activeSelection?: { jobVersion: number; assessmentId: string } | null;
  /**
   * Which JOB VERSIONS have their assessment table open, and the way to
   * change it — the same controlled/uncontrolled split as the selection
   * above, for the same reason.
   *
   * Expansion is a reading position, and a reading position has to outlive
   * the panel wherever the panel does not outlive the reading. The Job List
   * is exactly that case: opening an assessment version leaves the page
   * entirely, so a panel that owned its own expansion came back collapsed and
   * the recruiter had to walk down to their job version again. That host
   * therefore holds the set itself, keyed per job, and persists it.
   *
   * Uncontrolled where the panel really is the whole lifetime of the reading
   * — the Send Invite picker, which lives inside a dialog and is gone when
   * the dialog closes. Omit both and the panel keeps its own set, as before.
   *
   * Version NUMBERS, matching `group.jobVersion`, because that is what the
   * groups are keyed by here; the JD row id is the panel's way of naming a
   * version elsewhere, but the grouping is by number.
   */
  expandedJobVersions?: number[];
  /** Reports one job version's expander being toggled. See above. */
  onToggleJobVersion?: (jobVersion: number) => void;
  /**
   * Where the job version's own eye sits among that row's actions.
   *
   * `'leading'`, the default, is the historic order: the eye first, then the
   * View / Create slot beside it.
   *
   * `'trailing'` puts it AFTER that slot, so the pair reads as "View
   * Assessment, and here is the version behind it" rather than as two
   * unrelated buttons with the eye claiming the first position. The Job List
   * asks for this: it is the surface where the row's point is the assessment,
   * and the eye is the aside.
   *
   * A prop rather than a change to every caller, because the other surfaces —
   * the Send Invite picker and the AI Interview panels — were not part of the
   * request, and an action column quietly reordering under a recruiter who
   * uses both is worse than the inconsistency.
   */
  viewJobVersionPlacement?: 'leading' | 'trailing';
  /**
   * The eye on an ASSESSMENT row - opens that assessment's details.
   *
   * A slot, like `renderAction` and `headerAction`: the panel does not own
   * the details view, the host does. Omit it and no eye is rendered.
   */
  onViewAssessment?: (assessment: AssessmentVersionRow) => void;
  /**
   * The radio group's `name`.
   *
   * One group per SURFACE, not one per app. The Send Invite dialog renders
   * these same job rows over the page's own list, and both share
   * `openVersionsFor` - so the panel can be mounted twice at once, once
   * behind the overlay and once inside it. Sharing a `name` would make the
   * browser treat the two as a single group and unpick the page's selection
   * whenever the dialog's was set. Distinct names keep each surface's "one at
   * a time" to itself.
   */
  selectionGroupName?: string;
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
  Active: { chip: 'bg-success-subtle text-success ring-success-line', dot: 'bg-success' },
  Draft: { chip: 'bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20', dot: 'bg-brand-orange' },
  Completed: { chip: 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20', dot: 'bg-brand-blue' },
  Archived: { chip: 'bg-slate-100 text-gray-600 ring-gray-200', dot: 'bg-gray-400' },
  Disabled: { chip: 'bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20', dot: 'bg-brand-orange' },
  Unknown: { chip: 'bg-slate-100 text-gray-700 ring-gray-200', dot: 'bg-gray-400' },
};

/**
 * The word the Status column shows for a job version.
 *
 * Factored out of `JobStatusChip` so that a rule written against that column -
 * Create is offered on Published and Republished only - is decided by the very
 * string the reader is looking at, rather than by a second, separate reading of
 * the raw status that could drift from it.
 *
 * The raw DB word capitalised, through the shared `getDisplayStatus`, which is
 * what turns a published JD on its 2nd publish or later into "Republished".
 * Empty while the JD lineage request is still in flight - the chip draws a dash
 * for that, and it is not a status.
 */
export const jobVersionDisplayStatus = (status?: string, currentVersion?: number): string => {
  const raw = (status || '').trim();
  if (!raw) return '';
  const capitalised = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  return getDisplayStatus(capitalised, currentVersion);
};

/**
 * Can an assessment be built against this job version?
 *
 * Published and Republished only - the two states in which a job version is
 * live text a candidate could be assessed against. Everything else is a no,
 * each for its own reason: a Draft is not final, a Disabled version is out of
 * circulation, an Archived one is closed, and an unresolved status (the dash,
 * while the lineage loads) is not an assertion that creating is allowed.
 *
 * Read off the DISPLAYED status via `jobVersionDisplayStatus`, so the table can
 * never offer Create on a row whose own Status column reads Archived. Note that
 * "Republished" is derived rather than stored (see `getDisplayStatus`), so
 * testing the raw status alone would be testing a word this column never
 * prints; the same pairing `matchesStatusFilter` makes for the Published pill
 * on the Job Openings list.
 */
export const canCreateAssessmentForJobVersion = (status?: string, currentVersion?: number): boolean => {
  const label = jobVersionDisplayStatus(status, currentVersion);
  return label === 'Published' || label === 'Republished';
};

/** Why Create is off, in the words of the status that turned it off. */
export const createAssessmentBlockedReason = (status?: string, currentVersion?: number): string => {
  const label = jobVersionDisplayStatus(status, currentVersion);
  switch (label) {
    case 'Archived':
    case 'Disabled':
      return ASSESSMENT_JOB_LOCK_MESSAGE;
    case 'Draft':
      return 'Publish this job version to create an assessment for it';
    case '':
      return 'Job version status is still loading';
    default:
      return `Only Published or Republished job versions can have assessments (this one is ${label})`;
  }
};

/**
 * The experience a job version asks for, as this column words it.
 *
 * Resolved from that version's OWN fetched JD record, so a job republished
 * with a wider requirement reads correctly per row: V3 can say 5+ Years while
 * V1 still says 2–4. Undefined until that record lands (the details are
 * fetched per version and arrive progressively) and when the JD states no
 * experience at all - the cell draws a dash for both, as Created By already
 * does with the same record.
 *
 * `isStandardExperienceLevel` is the shared rule, from the same util the Job
 * Openings version history reads: a recruiter's OWN wording for the level
 * ("Fresher (0-0)", "Trainee") is the JD's own text and wins over the numbers,
 * while a standard seniority label (Entry/Mid/Senior) does not, because the
 * years beside it say more than the word does. Only the range wording is
 * spelled out here rather than taken from `formatJobExperienceText`, which
 * writes a lowercase "2-4 years" and has no Fresher case.
 *
 * Zero on both bounds is Fresher, not "0–0 Years" - and a zero minimum with no
 * maximum is the same statement, where "0+ Years" would be no statement at
 * all. A single number on both bounds drops the range rather than repeating
 * itself ("5 Years", not "5–5 Years").
 */
export const formatJobVersionExperience = (detail?: {
  job_level?: string | null;
  experience_level?: string | null;
  experience_min?: number | null;
  experience_max?: number | null;
}): string | undefined => {
  if (!detail) return undefined;

  const customLevel = (detail.job_level || detail.experience_level || '').trim();
  if (customLevel && !isStandardExperienceLevel(customLevel)) return customLevel;

  const min = detail.experience_min ?? null;
  const max = detail.experience_max ?? null;
  if (min === null && max === null) return undefined;
  if ((min ?? 0) === 0 && (max ?? 0) === 0) return 'Fresher';
  if (min !== null && max !== null) {
    return min === max ? `${min} Years` : `${min}–${max} Years`;
  }
  if (min !== null) return `${min}+ Years`;
  return `Up to ${max} Years`;
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
  const label = jobVersionDisplayStatus(status, currentVersion);
  /* No status known yet (the JD lineage request is still in flight) - a dash,
     rather than asserting a state the table has not been told. */
  if (!label) return <span className="text-sm text-gray-500 dark:text-slate-400">&mdash;</span>;

  const tone = getStatusConfig(label);
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap border ${tone.bg} ${tone.text} ${tone.border}`}
    >
      <span className={`w-1.5 h-1.5 shrink-0 rounded-full ${tone.dot}`} />
      {label}
    </span>
  );
}

/**
 * What the nested level is CALLED, and what its one descriptive column holds.
 *
 * Every word this panel puts on screen for the child rows comes from here. It
 * exists because the AI Interviews list opens the same two-level history over
 * the same job lineage, with interview configs where this page has assessments
 * — the same table, a different noun. Defaulted to the assessment wording, so
 * a caller that says nothing gets exactly what this panel has always rendered.
 */
export interface VersionHistoryVocabulary {
  /** The child noun, singular — used in the "View"/"Create" Actions-cell
   *  button text and its aria-label/title (e.g. "View Assessment" vs
   *  "View Interview"). */
  childSingular: string;
  /** Outer table's count column — how many children hang off a job version. */
  childPlural: string;
  /** Heading over the nested table, with its count appended. */
  childVersionsHeading: string;
  /** Said in the Actions cell of a job version that has no child at all. */
  childNone: string;
  /** The child table's one descriptive column — see `renderChildDetail`. */
  detailColumn: { label: string; minW: string };
  /** An optional second descriptive column, right after `detailColumn`,
   *  filled by `renderChildExtraDetail`. */
  extraDetailColumn?: { label: string; minW: string };
  /** Adds a Completed column after Invitations Sent in the child table, read
   *  from each row's `completed_count` (a dash while it is unknown). Opt-in:
   *  the AI Interviews page turns it on; the Assessments page is unchanged. */
  childCompletedColumn?: boolean;
  /**
   * One child's status, in the words its own list uses. Keyed straight into
   * `STATUS_STYLES` by the chip, so a word outside Active / Draft / Completed /
   * Archived / Disabled renders in the neutral tone rather than a wrong one.
   */
  statusLabel: (status?: string) => string;
}

export const ASSESSMENT_VOCABULARY: VersionHistoryVocabulary = {
  childSingular: 'Assessment',
  childPlural: 'Assessments',
  childVersionsHeading: 'Assessment Versions',
  childNone: 'No assessment',
  /* Where Questions used to be. Wider than the column it replaced, because it
     holds three labelled lines rather than one number. */
  detailColumn: { label: 'Round Weightage', minW: 'min-w-[170px]' },
  statusLabel: assessmentStatusLabel,
};

/* Outer table: the job version, its state, its provenance, its totals.
   `Actions` is appended by the renderer so it can be pinned separately. */
const jobColumnsFor = (vocabulary: VersionHistoryVocabulary): { label: string; minW: string }[] => [
  { label: 'Version', minW: 'min-w-[150px]' },
  { label: 'Status', minW: 'min-w-[110px]' },
  { label: 'Experience', minW: 'min-w-[130px]' },
  /* Created On and Created By, which used to be two columns of one fact each.
     Narrower combined than the 250px the pair took, and the two lines read as
     the one statement they are: who made this version, and when. */
  { label: 'Created', minW: 'min-w-[200px]' },
  { label: vocabulary.childPlural, minW: 'min-w-[110px]' },
  { label: 'Invitations Sent', minW: 'min-w-[120px]' },
  { label: 'Completed', minW: 'min-w-[120px]' },
];

/* Inner table: the same shape minus the count column — a child version is
   itself the thing that column counts. */
const childColumnsFor = (vocabulary: VersionHistoryVocabulary): { label: string; minW: string }[] => [
  { label: 'Version', minW: 'min-w-[150px]' },
  { label: 'Status', minW: 'min-w-[110px]' },
  { label: 'Created On', minW: 'min-w-[130px]' },
  { label: 'Created By', minW: 'min-w-[120px]' },
  vocabulary.detailColumn,
  ...(vocabulary.extraDetailColumn ? [vocabulary.extraDetailColumn] : []),
  { label: 'Invitations Sent', minW: 'min-w-[120px]' },
  ...(vocabulary.childCompletedColumn ? [{ label: 'Completed', minW: 'min-w-[120px]' }] : []),
];

interface JobVersionGroup {
  jobVersion: number;
  /** This version's own JD row id — the context every action is scoped to. */
  jobVersionId?: string;
  isLatestJobVersion: boolean;
  jobStatus?: string;
  /** Republish counter, for the Published vs Republished distinction. */
  jobCurrentVersion?: number;
  /** What this version asks for, already worded - see `formatJobVersionExperience`.
   *  Undefined until this version's own JD record lands, or when it states no
   *  experience at all; the cell draws a dash for both. */
  experience?: string;
  createdOn?: string;
  createdBy?: string;
  assessments: AssessmentVersionRow[];
  /**
   * Does THIS job version have an assessment — the one question the Actions
   * cell is decided by, and the reason Create Assessment and View Assessment
   * are never both wrong on the same row.
   *
   * Not `assessments.length > 0`: it is the union of the rows joined here and
   * the backend's own index (see `jdsWithAssessments`), so a version whose
   * assessment did not come back in this fetch still reads as having one.
   * Draft and Published both count — neither source filters by status, and an
   * assessment saved as a draft is an assessment that exists.
   */
  hasAssessment: boolean;
  /** Summed across this version's assessments, so the totals on the job row
   *  are exactly what its Assessment Versions table adds up to. */
  /** `null` while any row's count is still unknown (see `sumKnown`). */
  totalInvitations: number | null;
  /** Finished attempts across this version's assessments - read beside the
   *  invitations it is a subset of: sent, then completed. */
  totalCompleted: number | null;
}

export function StatusChip({ label }: { label: string }) {
  const tone = STATUS_STYLES[label] || STATUS_STYLES.Unknown;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ring-1 whitespace-nowrap ${tone.chip}`}>
      <span className={`w-1.5 h-1.5 shrink-0 rounded-full ${tone.dot}`} />
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
      className={`inline-flex shrink-0 whitespace-nowrap items-center justify-center min-w-[2.25rem] px-1.5 py-0.5 rounded-md text-xs font-semibold tabular-nums ring-1 ${
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
    <span className="inline-flex shrink-0 items-center whitespace-nowrap px-1.5 py-0.5 rounded-md text-2xs font-semibold tracking-wide text-white bg-brand-blue ring-1 ring-white/10">
      Latest
    </span>
  );
}

/** A number over the noun it counts — the reference's metric cell. */
/** A version's total — `null` (shown as a dash) while any row's count is
 *  still unknown, so a partial sum is never shown and then corrected. Hosts
 *  that leave a count unset until it is fetched (the AI Interview list) rely
 *  on this; assessment rows always carry both counts. */
const sumKnown = (values: (number | undefined)[]): number | null =>
  values.some((v) => typeof v !== 'number') ? null : values.reduce<number>((sum, v) => sum + (v as number), 0);

const UnknownMetric = () => <span className="text-sm text-gray-400">—</span>;

function MetricCell({ value, label }: { value: number; label: string }) {
  // Number and label on one line, never wrapped — the Assessments / Invitations
  // Sent / Completed columns read as a single "1 Assessment" phrase rather than
  // a value stacked above a word.
  return (
    <div className="flex items-baseline gap-1 whitespace-nowrap">
      <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">{value}</span>
      <span className="text-xs text-gray-500 dark:text-slate-400">{label}</span>
    </div>
  );
}

/**
 * The rounds this assessment is made of and the weight each carries, in the
 * column Questions used to hold.
 *
 * Read from the assessment's own configuration - `hr_percentage`,
 * `technical_percentage`, `coding_percentage` on AssessmentResponse, the same
 * three fields the details view diffs as "HR weight" and the creation flow
 * writes - so every row states its own split rather than a shared constant.
 *
 * Only the rounds this assessment actually has: a section switched off is not
 * part of the assessment, and printing "Coding Round: 0%" for it would be
 * three lines of noise on a two-round assessment. `*_enabled` decides that
 * where the row carries it; where it does not (an older row, or a list
 * endpoint that omits the flags) a non-zero weight stands in as evidence the
 * round is configured. Nothing configured at all reads as a dash, which is
 * what every other cell here does with nothing to say.
 *
 * HR carries one extra rule: it is dropped at 0% even when `hr_enabled` is
 * true. The HR section is on by default across the creation flow, so a row
 * whose whole weight sits on Technical and Coding still arrives with the flag
 * set and the weight at zero - and "HR Round: 0%" is a line that states a
 * round contributing nothing. Technical and Coding are left exactly as they
 * were: an enabled section shows its weight whatever that weight is.
 *
 * Whole numbers: the field is a percentage split of 100 across three rounds,
 * so a decimal place would be precision the configuration does not carry.
 */
function RoundWeightageCell({ assessment }: { assessment: AssessmentVersionRow }) {
  const rounds = [
    { label: 'HR Round', enabled: assessment.hr_enabled, percentage: assessment.hr_percentage, hideAtZero: true },
    { label: 'Technical Round', enabled: assessment.technical_enabled, percentage: assessment.technical_percentage, hideAtZero: false },
    { label: 'Coding Round', enabled: assessment.coding_enabled, percentage: assessment.coding_percentage, hideAtZero: false },
  ]
    .map(({ label, enabled, percentage, hideAtZero }) => ({
      label,
      enabled,
      hideAtZero,
      percentage: toOneDecimalScore(percentage ?? 0),
    }))
    .filter(({ enabled, percentage, hideAtZero }) => {
      if (hideAtZero && percentage === 0) return false;
      return enabled ?? percentage > 0;
    });

  if (rounds.length === 0) {
    return <span className="text-sm text-gray-500 dark:text-slate-400">&mdash;</span>;
  }

  return (
    <div className="flex flex-col gap-0.5">
      {rounds.map(({ label, percentage }) => (
        <div key={label} className="text-xs whitespace-nowrap leading-snug">
          <span className="text-gray-500 dark:text-slate-400">{label}: </span>
          <span className="font-semibold text-gray-900 dark:text-slate-100">{percentage}%</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Created On over Created By, one cell.
 *
 * Each line names what it states, because two bare values stacked - a date
 * over a name - only read as a pair once you already know the column. That
 * labelling is the same shape the Round Weightage cell uses in the table
 * below: the label muted, the value in the row's own weight.
 *
 * The date alone on the first line; the time it carried when Created On was a
 * column of its own moves into that line's tooltip, since a version's creation
 * time is worth keeping but not worth a third line. A missing half is a dash,
 * never invented, exactly as both columns did separately.
 *
 * `DateCell` below is untouched and still renders date-over-time - the
 * Assessment Versions table's own Created On column reads it.
 */
function CreatedCell({ createdOn, createdBy }: { createdOn?: string; createdBy?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div
        className="text-xs whitespace-nowrap leading-snug"
        title={createdOn ? `${formatISTDate(createdOn)} ${formatISTTime(createdOn)}` : ''}
      >
        <span className="text-gray-500 dark:text-slate-400">Created On: </span>
        <span className="font-semibold text-gray-900 dark:text-slate-100">
          {createdOn ? formatISTDate(createdOn) : '—'}
        </span>
      </div>
      <div
        className="text-xs whitespace-nowrap leading-snug max-w-[200px] truncate"
        title={createdBy || ''}
      >
        <span className="text-gray-500 dark:text-slate-400">Created By: </span>
        <span className="font-semibold text-gray-900 dark:text-slate-100">
          {createdBy || '—'}
        </span>
      </div>
    </div>
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
  jdsWithAssessments,
  loading,
  latestJobVersion,
  currentAssessmentId,
  onRowClick,
  onCreateAssessment,
  onViewJobVersion,
  headerAction,
  renderAction,
  menuOnlyActions = false,
  singleActionControl = false,
  selectedAssessmentId,
  selectedAssessmentIds,
  onSelectAssessment,
  activeSelection,
  expandedJobVersions: controlledExpandedJobVersions,
  onToggleJobVersion,
  viewJobVersionPlacement = 'leading',
  onViewAssessment,
  selectionGroupName = 'assessment-version-selection',
  vocabulary = ASSESSMENT_VOCABULARY,
  renderChildDetail,
  renderChildExtraDetail,
  hideDraftJobVersions = false,
  hideJobVersionsWithoutAssessments = false,
  paginated = false,
}: AssessmentVersionHistoryPanelProps) {
  const childColumns = childColumnsFor(vocabulary);
  /* `paginated` state. The Job Versions table has one page; each job version's
     Assessment Versions table has its own, keyed by job version, so turning a
     page in one never moves another. */
  const [jobVersionsPage, setJobVersionsPage] = useState(1);
  const [jobVersionsPageSize, setJobVersionsPageSize] = useState(10);
  const [childPaging, setChildPaging] = useState<Record<number, { page: number; size: number }>>({});
  const childPagingOf = (jobVersion: number) => childPaging[jobVersion] ?? { page: 1, size: 10 };
  const setChildPagingOf = (jobVersion: number, next: { page: number; size: number }) =>
    setChildPaging((current) => ({ ...current, [jobVersion]: next }));
  /** A page's slice of `rows`, clamped to a page that exists. */
  const pageSlice = <T,>(rows: T[], page: number, size: number) => {
    const safe = Math.min(Math.max(1, page), Math.max(1, Math.ceil(rows.length / size)));
    return rows.slice((safe - 1) * size, safe * size);
  };
  /* Which job versions have their assessment table open, when this panel owns
     the answer: nothing outside it needs to know, and the state dying with the
     panel is the right lifetime wherever the panel outlives the reading.

     A host that passes `expandedJobVersions` with a way to toggle it takes the
     answer over instead — see the prop. Both halves are required for that: a
     set with no toggle would be an expander that cannot be clicked, so the
     local set stays in charge unless the host can actually accept a change. */
  const [localExpandedJobVersions, setLocalExpandedJobVersions] = useState<Set<number>>(new Set());
  const expansionIsControlled = !!controlledExpandedJobVersions && !!onToggleJobVersion;
  const expandedJobVersions = expansionIsControlled
    ? new Set(controlledExpandedJobVersions)
    : localExpandedJobVersions;

  const toggleJobVersion = (jobVersion: number) => {
    if (expansionIsControlled) {
      onToggleJobVersion!(jobVersion);
      return;
    }
    setLocalExpandedJobVersions((prev) => {
      const next = new Set(prev);
      if (next.has(jobVersion)) next.delete(jobVersion);
      else next.add(jobVersion);
      return next;
    });
  };

  /* Does the ASSESSMENT sub-table's Actions column have anything to put in
     it? Its only content is the host's `renderAction`, so without that the
     column is a header over empty cells — 160px of dead width that pushes the
     real columns leftward and reads as a broken table. A host that omits the
     slot (the Send Invite picker, which lists versions to choose between and
     deliberately offers no per-row actions) now gets no column at all. */
  /* The Select column exists only where a host reads the selection. Same rule
     as the Actions column below it: no consumer, no column. */
  const showsAssessmentSelect = !!onSelectAssessment;
  const multiSelect = Array.isArray(selectedAssessmentIds);
  const isAssessmentPicked = (id: string) =>
    multiSelect ? selectedAssessmentIds!.includes(id) : selectedAssessmentId === id;

  /* The Actions column exists if EITHER control does. It used to be gated on
     `renderAction` alone, which meant a host offering only the eye - the Send
     Invite dialog, which lists versions to choose between and wants no
     per-row Send / Track / Result - lost the whole column and the eye with
     it. */
  const showsAssessmentActions = !!renderAction || !!onViewAssessment;

  /* Sized to what the cell actually holds, so it never reserves room for
     controls this host does not render:
       eye + quick actions + menu   215
       quick actions + menu          180
       eye alone, or a lone menu      90  (the 28px button plus the header word)
     Literal class strings, not built from a number, so Tailwind's scanner
     can see all three. */
  const assessmentActionsMinW = renderAction && menuOnlyActions && !onViewAssessment
    ? 'min-w-[90px]'
    : renderAction && !singleActionControl
    ? onViewAssessment
      ? 'min-w-[215px]'
      : 'min-w-[180px]'
    : 'min-w-[90px]';

  /* The table's own floor is the sum of its columns' minimums - declared
     below that sum, the shortfall comes off the last column, which is
     Actions. An inline style rather than a class: the combinations multiply
     with every optional column, and a class assembled from a number is one
     Tailwind never emits. */
  const assessmentTableMinWidth =
    800 +
    (vocabulary.extraDetailColumn ? 170 : 0) +
    (showsAssessmentSelect ? 70 : 0) +
    (showsAssessmentActions
      ? (renderAction && !singleActionControl ? (onViewAssessment ? 215 : menuOnlyActions ? 90 : 180) : 90)
      : 0);



  /* Wide enough for the eye plus the longer of the two actions the cell can
     hold. "Create AI Assessment" is the widest thing it ever renders — but only
     when the host passes `onCreateAssessment`. Without it the widest is "View
     Assessment", so reserving the full 280px leaves a ragged gap on the right
     of every row. Measured against what this host can actually render (300px
     since the label gained "AI"). */
  const jobColumns = [
    ...jobColumnsFor(vocabulary),
    { label: 'Actions', minW: onCreateAssessment ? 'min-w-[300px]' : 'min-w-[180px]' },
  ];
  const assessmentRows = assessments ?? [];

  /* ── The job version → assessment join ──────────────────────────────────
   *
   * BY ID, and the id is the JD ROW: every job version is a JD row of its
   * own, an assessment records the row it was authored against (`jd_id`), and
   * that pair is the only thing that says which version an assessment belongs
   * to. Never the job's name, its title, or a version's display text — two
   * versions of one job share all three.
   *
   * The version NUMBER is a fallback, not the rule. `jd_version` is optional
   * on AssessmentResponse, and joining on it alone meant an assessment that
   * came back without one matched NO job version: it vanished from the table,
   * its version's Assessments count stayed at zero, and that version went on
   * offering Create for an assessment that already existed. The number also
   * cannot separate two JD rows reporting the same version, where the id can.
   *
   * The number still carries what the id cannot: the JD lineage failing to
   * load, or an assessment pointing at a JD row the lineage no longer
   * returns. Then there is no id to match against and the number is all there
   * is. */
  const jobVersionByJdId = new Map<string, number>();
  for (const version of jobVersions ?? []) {
    jobVersionByJdId.set(version.id, version.version_number ?? 1);
  }

  /** Which job version this assessment belongs to, or undefined when neither
   *  key resolves — an assessment with no version to sit under is left out
   *  rather than attached to a neighbouring one, which would put one
   *  version's assessment under another. */
  const jobVersionOf = (assessment: AssessmentVersionRow): number | undefined => {
    const byId = assessment.jd_id ? jobVersionByJdId.get(assessment.jd_id) : undefined;
    if (byId !== undefined) return byId;
    return typeof assessment.jd_version === 'number' ? assessment.jd_version : undefined;
  };

  /* Which job versions to print.
   *
   * The union of the JD's lineage and the job versions the assessments
   * themselves resolve to — not the lineage alone. Two reasons: the panel
   * still renders real rows if the lineage request fails, and an assessment
   * pointing at a job version the lineage no longer returns is a row that
   * must not silently vanish. */
  const jobVersionNumbers = (() => {
    const numbers = new Set<number>();
    for (const version of jobVersions ?? []) numbers.add(version.version_number ?? 1);
    for (const assessment of assessmentRows) {
      const resolved = jobVersionOf(assessment);
      if (resolved !== undefined) numbers.add(resolved);
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

  const allGroups: JobVersionGroup[] = jobVersionNumbers.map((jobVersion) => {
    const lineageEntry = lineageByVersion.get(jobVersion);
    const detail = lineageEntry ? jobVersionDetails[lineageEntry.id] : undefined;
    /* Only the assessments actually recorded against THIS job version,
       resolved by JD row id (see `jobVersionOf`), newest assessment version
       first. */
    const versionAssessments = assessmentRows
      .filter((a) => jobVersionOf(a) === jobVersion)
      .sort((a, b) => (b.version ?? 1) - (a.version ?? 1));
    return {
      jobVersion,
      jobVersionId: lineageEntry?.id,
      /* Either source is enough — see `hasAssessment` on the type. The index
         is asked with this version's OWN JD row id, so one version having an
         assessment can never answer for its siblings. */
      hasAssessment:
        versionAssessments.length > 0 ||
        (!!lineageEntry?.id && !!jdsWithAssessments?.has(lineageEntry.id)),
      isLatestJobVersion: jobVersion === newestJobVersion,
      /* The lineage entry is the authority on a version's status; the fully
         fetched JD record for that same version is the fallback, so a lineage
         row that comes back without a status still reads Active rather than
         Unknown. Both are dynamic - `status` on JDLineageVersion and on
         JDResponse respectively. */
      jobStatus: lineageEntry?.status || detail?.status,
      jobCurrentVersion: lineageEntry?.current_version ?? detail?.current_version,
      /* `detail` is keyed by this version's own JD row id (`lineageEntry.id`),
         which is what maps the value to the right job version. */
      experience: formatJobVersionExperience(detail),
      /* When the version itself was made, not when it was published — the
         column says Created On. */
      createdOn: lineageEntry?.created_at || detail?.created_at,
      createdBy: detail?.created_by_name,
      assessments: versionAssessments,
      totalInvitations: sumKnown(versionAssessments.map((a) => a.invitations_count)),
      totalCompleted: sumKnown(versionAssessments.map((a) => a.completed_count)),
    };
  });

  /* Draft job versions, and versions with no assessment, left out when the
     host asks (see the props). If the host's latest version is one of them,
     Latest moves to the newest version still listed, so the table always
     badges a row. */
  const groups: JobVersionGroup[] = (() => {
    if (!hideDraftJobVersions && !hideJobVersionsWithoutAssessments) return allGroups;
    const visible = allGroups.filter(
      (group) =>
        (!hideDraftJobVersions || jobVersionDisplayStatus(group.jobStatus, group.jobCurrentVersion) !== 'Draft') &&
        (!hideJobVersionsWithoutAssessments || group.hasAssessment),
    );
    if (visible.length === 0 || visible.some((group) => group.isLatestJobVersion)) return visible;
    return visible.map((group, index) => ({ ...group, isLatestJobVersion: index === 0 }));
  })();

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
          <div className="px-3 sm:px-4 pt-3 pb-2 flex flex-wrap items-center justify-between gap-2">
            <h4 className="min-w-0 text-sm font-semibold text-gray-900 dark:text-slate-100">
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
            {/* Sum of this table's own column minimums - see jobColumns.
                Declared below that sum, the shortfall came off the last
                column, which is Actions. */}
            <table
              className={`w-full text-left ${
                onCreateAssessment ? 'min-w-[1220px]' : 'min-w-[1120px]'
              }`}
            >
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
                      /* The header sticks to the top of the scroll box (z-[7]);
                         no column is pinned sideways. Actions used to pin right,
                         but an opaque pinned column overlaps the last data
                         column (Completed) whenever the table is wider than its
                         host panel — which it is in the narrower contexts this
                         panel renders in — hiding Completed behind it. A plain
                         sideways-scrolling table keeps every column, Actions and
                         Completed alike, fully readable at some scroll position
                         on every screen. */
                      className={`sticky top-0 px-3 sm:px-4 py-2.5 sm:py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400 whitespace-nowrap bg-slate-50 dark:bg-slate-800 ${minW} z-[7] shadow-[inset_0_-1px_0_var(--raw-e5e7eb)] dark:shadow-[inset_0_-1px_0_var(--raw-334155)]`}
                    >
                      <span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">{label}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(paginated ? pageSlice(groups, jobVersionsPage, jobVersionsPageSize) : groups).map((group) => {
                  const count = group.assessments.length;
                  /* The row's whole Create-vs-View decision, and the group
                     owns it (see `hasAssessment` on JobVersionGroup). NOT
                     `count > 0`: the count is how many assessment rows this
                     fetch returned for the version, which is a different
                     question from whether the version HAS one. */
                  const hasAssessments = group.hasAssessment;
                  /* A pick exists and it was made under a DIFFERENT job
                     version. The row fades so the chosen branch stands out -
                     and stays entirely usable, because opening this version
                     and picking from it is exactly how a choice is changed. */
                  const jobVersionDimmed =
                    !!activeSelection && activeSelection.jobVersion !== group.jobVersion;
                  /* Expansion is the reader's, always. It used to be forced
                     shut whenever another version held the pick, which is what
                     made changing a choice impossible without clearing it. */
                  const isOpen = expandedJobVersions.has(group.jobVersion);
                  /* THE job version the reader is in: the one holding the
                     assessment version this panel has selected.

                     Matched on the assessment's own id inside this group's
                     rows, never on a version NUMBER — assessment versions
                     restart per job version, so every job version tends to
                     have a "V1" and a number would light up the wrong branch.

                     What it is for: after opening an assessment version and
                     coming back, the panel reopens with several job versions
                     possibly expanded and nothing saying which one was being
                     read. This tints that row, so the branch the reader left
                     from is the one they return to visually as well. */
                  const holdsSelection =
                    (multiSelect ? selectedAssessmentIds!.length > 0 : !!selectedAssessmentId)
                    && group.assessments.some((child) => isAssessmentPicked(child.id));
                  /* The newest assessment version in this group — the one its
                     inner table badges Latest. Read off the sorted list rather
                     than recomputed, so the badge and the ordering agree. */
                  const newestAssessmentVersion = group.assessments[0]?.version ?? 1;
                  /* Read THIS version. Never disabled and never conditional on
                     the assessment state beside it: reading a job version is
                     unrelated to whether one can be built against it, so an
                     Archived, Disabled or Draft row opens exactly like a
                     published one. Same button, same popup, as the eye on the
                     Create Assessment picker's own version rows.

                     Built once here and rendered on whichever side of the
                     View / Create slot `viewJobVersionPlacement` names, so the
                     two orders are one button in two positions rather than two
                     copies that can drift apart. */
                  const viewJobVersionButton =
                    onViewJobVersion && group.jobVersionId ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => onViewJobVersion(group.jobVersionId!, group.jobVersion)}
                        aria-label={`View job V${group.jobVersion} details`}
                        title={`View job V${group.jobVersion} details`}
                        className="h-8 w-8 px-0 flex-shrink-0"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    ) : null;

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
                        /* Anchors for a host that scrolls the reader back to
                           where they were. Inert markers — no styling and no
                           behaviour hangs off them — carrying the two facts a
                           scroll needs: which job version is open, and (below,
                           on the child rows) which assessment version is
                           picked. Set from the same values the row renders
                           from, so what is found is by construction what is
                           highlighted. */
                        data-tf-job-version-open={isOpen ? 'true' : undefined}
                        title={
                          jobVersionDimmed
                            ? `Job V${activeSelection?.jobVersion} currently holds the selection — open this version to choose from it instead`
                            : undefined
                        }
                        className={`group border-t border-gray-200 dark:border-slate-700 transition-all duration-200 ease-out ${
                          /* The tint is lighter than the one the picked
                             ASSESSMENT row carries inside it, so the pair reads
                             as branch-then-row rather than as two selections
                             competing. Hover still lifts either. */
                          holdsSelection
                            ? 'bg-brand-blue/[0.06] dark:bg-brand-blue/[0.14] hover:bg-brand-blue/[0.10] dark:hover:bg-brand-blue/[0.18]'
                            : 'bg-white dark:bg-slate-900 hover:bg-brand-blue/[0.03] dark:hover:bg-brand-blue/[0.08]'
                        } ${
                          hasAssessments ? 'cursor-pointer' : ''
                        } ${
                          /* Faded back, not switched off - and hover restores
                             it, so the row reads as available rather than
                             barred. */
                          jobVersionDimmed ? 'opacity-60 hover:opacity-100' : ''
                        }`}
                        /* The whole row toggles, not just the button — a small
                           target at the far right of a scrolling table is a
                           poor one. Only where there is something to expand. */
                        onClick={hasAssessments ? () => toggleJobVersion(group.jobVersion) : undefined}
                      >
                        <td className="px-3 sm:px-4 py-3 whitespace-nowrap align-middle">
                          <span className="inline-flex items-center gap-1.5">
                            <VersionChip kind="job" version={group.jobVersion} />
                            {group.isLatestJobVersion && <LatestBadge />}
                          </span>
                        </td>
                        <td className="px-3 sm:px-4 py-3 whitespace-nowrap align-middle">
                          <JobStatusChip status={group.jobStatus} currentVersion={group.jobCurrentVersion} />
                        </td>
                        <td
                          className="px-3 sm:px-4 py-3 text-sm font-medium text-gray-900 dark:text-slate-100 whitespace-nowrap max-w-[180px] truncate align-middle"
                          title={group.experience || ''}
                        >
                          {group.experience || <span className="text-gray-500 dark:text-slate-400">&mdash;</span>}
                        </td>
                        <td className="px-3 sm:px-4 py-3 whitespace-nowrap align-middle">
                          <CreatedCell createdOn={group.createdOn} createdBy={group.createdBy} />
                        </td>
                        <td className="px-3 sm:px-4 py-3 whitespace-nowrap align-middle">
                          <MetricCell value={count} label={count === 1 ? vocabulary.childSingular : vocabulary.childPlural} />
                        </td>
                        <td className="px-3 sm:px-4 py-3 whitespace-nowrap align-middle">
                          {group.totalInvitations === null
                            ? <UnknownMetric />
                            : <MetricCell value={group.totalInvitations} label={group.totalInvitations === 1 ? 'Invitation' : 'Invitations'} />}
                        </td>
                        <td className="px-3 sm:px-4 py-3 whitespace-nowrap align-middle">
                          {group.totalCompleted === null
                            ? <UnknownMetric />
                            : <MetricCell value={group.totalCompleted} label={group.totalCompleted === 1 ? 'Candidate' : 'Candidates'} />}
                        </td>
                        {/* Actions — an ordinary last column, reached by
                            scrolling sideways like any other. It is deliberately
                            NOT pinned right: an opaque pinned column overlaps the
                            Completed column beside it whenever the table is wider
                            than its host panel, clipping Completed from view. */}
                        <td className="px-3 sm:px-4 py-3 whitespace-nowrap align-middle">
                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            {/* The job version eye, when this surface wants it
                                first. See `viewJobVersionPlacement`. */}
                            {viewJobVersionPlacement === 'leading' && viewJobVersionButton}
                            {/* Create Assessment and View Assessment are the
                                SAME slot, decided per job version by one
                                thing: whether an assessment exists against
                                THIS version's JD row. Saving one — Draft or
                                Published, it makes no difference — is what
                                flips it, and because the answer is derived
                                from the fetched data rather than held in
                                component state, it is still flipped after a
                                reload, and one version flipping leaves its
                                siblings exactly as they were. */}
                            {hasAssessments ? (
                              <button
                                type="button"
                                onClick={() => toggleJobVersion(group.jobVersion)}
                                aria-expanded={isOpen}
                                aria-label={
                                  isOpen
                                    ? `Hide the ${vocabulary.childSingular.toLowerCase()} for job V${group.jobVersion}`
                                    : `View the ${vocabulary.childSingular.toLowerCase()} for job V${group.jobVersion}`
                                }
                                title={`View the ${vocabulary.childSingular.toLowerCase()} created for job V${group.jobVersion}`}
                                className="h-8 px-3 inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-brand-blue/30 bg-white dark:bg-slate-900 text-brand-blue text-xs font-medium hover:bg-brand-blue/5 transition-colors"
                              >
                                View {vocabulary.childSingular}
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
                                 association.

                                 ENABLED on this row's own Status column, read
                                 through the same helper the chip beside it
                                 renders: Published and Republished only. An
                                 Archived, Disabled or Draft version would take
                                 the recruiter to the creation flow to author an
                                 assessment against text that is closed, out of
                                 circulation or not final - so the button greys
                                 with the reason in its tooltip rather than
                                 disappearing, which is how the rest of this
                                 page reports "not for this row" and keeps the
                                 Actions column the same shape down the table.

                                 Each row decides for itself, so a job whose V3
                                 is Published and whose V1 is Archived offers
                                 Create on exactly one of them. */
                              (() => {
                                const canCreate = canCreateAssessmentForJobVersion(
                                  group.jobStatus,
                                  group.jobCurrentVersion,
                                );
                                const reason = canCreate
                                  ? `Create ${vocabulary.childSingular === 'Assessment' ? 'an' : 'a'} ${vocabulary.childSingular.toLowerCase()} for job V${group.jobVersion}`
                                  : createAssessmentBlockedReason(group.jobStatus, group.jobCurrentVersion);
                                return (
                                  <Button
                                    variant="primary"
                                    size="sm"
                                    disabled={!canCreate}
                                    onClick={() => {
                                      if (!canCreate) return;
                                      onCreateAssessment(group.jobVersionId!, group.jobVersion);
                                    }}
                                    title={reason}
                                    aria-label={reason}
                                    icon={<Plus className="w-3.5 h-3.5" />}
                                  >
                                    Create {vocabulary.childSingular === 'Assessment' ? 'AI Assessment' : vocabulary.childSingular}
                                  </Button>
                                );
                              })()
                            ) : (
                              <span className="text-xs text-gray-500 dark:text-slate-400">{vocabulary.childNone}</span>
                            )}
                            {/* …or last, beside the View Assessment button it
                                belongs with. Same button either way. */}
                            {viewJobVersionPlacement === 'trailing' && viewJobVersionButton}
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
                                      <h5 className="min-w-0 text-sm font-semibold text-gray-900 dark:text-slate-100">
                                        {vocabulary.childVersionsHeading}{' '}
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
                                      <table
                                        className="w-full text-left"
                                        style={{ minWidth: `${assessmentTableMinWidth}px` }}
                                      >
                                        <thead>
                                          <tr>
                                            {[
                                              /* Select FIRST, Actions LAST, the
                                                 data columns between - the order
                                                 the table is specified in. */
                                              ...(showsAssessmentSelect
                                                ? [{ label: 'Select', minW: 'min-w-[70px]' }]
                                                : []),
                                              ...childColumns,
                                              ...(showsAssessmentActions
                                                ? [{ label: 'Actions', minW: assessmentActionsMinW }]
                                                : []),
                                            ].map(({ label, minW }) => (
                                              <th
                                                key={label}
                                                className={`px-3 sm:px-4 py-2.5 sm:py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400 whitespace-nowrap bg-slate-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 ${minW}`}
                                              >
                                                <span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">{label}</span>
                                              </th>
                                            ))}
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {/* The version HAS an assessment (the
                                              backend index says so) but this
                                              fetch returned no row for it. Say
                                              that, rather than opening onto an
                                              empty table that reads as "there
                                              is nothing here" and contradicts
                                              the button that was just clicked. */}
                                          {count === 0 && (
                                            <tr>
                                              <td
                                                colSpan={
                                                  childColumns.length +
                                                  (showsAssessmentSelect ? 1 : 0) +
                                                  (showsAssessmentActions ? 1 : 0)
                                                }
                                                className="px-3 sm:px-4 py-4 text-xs text-gray-500 dark:text-slate-400"
                                              >
                                                This job version has an assessment, but its details could not be
                                                loaded. Reopen this panel to try again.
                                              </td>
                                            </tr>
                                          )}
                                          {(paginated
                                            ? pageSlice(group.assessments, childPagingOf(group.jobVersion).page, childPagingOf(group.jobVersion).size)
                                            : group.assessments
                                          ).map((assessment) => {
                                            const isCurrent = !!currentAssessmentId && assessment.id === currentAssessmentId;
                                            const statusLabel = vocabulary.statusLabel(assessment.status);
                                            const invitations = assessment.invitations_count;
                                            const isPicked = isAssessmentPicked(assessment.id);
                                            /* The one row still in play once a
                                               pick exists. Matched on the row's
                                               own id under an already-matching
                                               job version, never on the version
                                               NUMBER: two job versions can each
                                               carry an "Assessment V1", and
                                               matching by number would light up
                                               a row in the wrong branch. */
                                            /* Faded because something else is
                                               picked - never barred. Clicking
                                               this row's radio replaces the
                                               selection, which is the whole
                                               point of a single-choice
                                               control. */
                                            const assessmentDimmed = !!activeSelection && !isPicked;
                                            return (
                                              <tr
                                                key={assessment.id}
                                                /* The finest scroll anchor of
                                                   the three — see the job
                                                   version row above. */
                                                data-tf-assessment-selected={isPicked ? 'true' : undefined}
                                                className={`border-b last:border-b-0 border-gray-100 dark:border-slate-700/70 transition-all ${
                                                  isPicked
                                                    ? 'bg-brand-blue/[0.10] dark:bg-brand-blue/[0.18] ring-1 ring-inset ring-brand-blue/40'
                                                    : isCurrent
                                                      ? 'bg-brand-blue/[0.06] dark:bg-brand-blue/[0.14] hover:bg-brand-blue/[0.10]'
                                                      : 'hover:bg-brand-blue/[0.03] dark:hover:bg-slate-800'
                                                } ${
                                                  assessmentDimmed ? 'opacity-60 hover:opacity-100' : ''
                                                } ${onRowClick ? 'cursor-pointer' : ''}`}
                                                onClick={onRowClick ? () => onRowClick(assessment.id) : undefined}
                                              >
                                                {/* Select - the panel's ONLY
                                                    radio, on an ASSESSMENT
                                                    version row and nowhere
                                                    else.

                                                    One `name` for the whole
                                                    panel, so the browser's own
                                                    radio-group rule does the
                                                    enforcing: picking any row
                                                    unpicks whatever was picked
                                                    before, including a row in a
                                                    different expanded job
                                                    version. Two selected at
                                                    once is not a state this can
                                                    represent.

                                                    The click is stopped at the
                                                    cell: the row itself opens
                                                    the assessment, and choosing
                                                    a version must not also
                                                    navigate away from the table
                                                    the choice was made in. */}
                                                {showsAssessmentSelect && (
                                                  <td
                                                    className="px-3 sm:px-4 py-2.5 whitespace-nowrap align-middle"
                                                    onClick={(e) => e.stopPropagation()}
                                                  >
                                                    <input
                                                      /* Checkboxes in multi-select
                                                         mode (`selectedAssessmentIds`),
                                                         where the host toggles. */
                                                      type={multiSelect ? 'checkbox' : 'radio'}
                                                      name={multiSelect ? undefined : selectionGroupName}
                                                      value={assessment.id}
                                                      checked={isPicked}
                                                      onChange={() =>
                                                        onSelectAssessment?.(assessment.id, {
                                                          jobVersion: group.jobVersion,
                                                          jobVersionId: group.jobVersionId,
                                                        })
                                                      }
                                                      aria-label={`Select assessment V${assessment.version ?? 1} of job V${group.jobVersion}`}
                                                      className="w-4 h-4 text-brand-blue border-gray-300 focus:ring-brand-blue/40 cursor-pointer"
                                                    />
                                                  </td>
                                                )}
                                                <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap align-middle">
                                                  <span className="inline-flex items-center gap-1.5">
                                                    <VersionChip kind="assessment" version={assessment.version} />
                                                    {(assessment.version ?? 1) === newestAssessmentVersion && <LatestBadge />}
                                                  </span>
                                                </td>
                                                <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap align-middle">
                                                  <StatusChip label={statusLabel} />
                                                </td>
                                                <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap align-middle">
                                                  <DateCell value={assessment.created_at} />
                                                </td>
                                                <td
                                                  className="px-3 sm:px-4 py-2.5 text-sm font-medium text-gray-900 dark:text-slate-100 whitespace-nowrap max-w-[160px] truncate align-middle"
                                                  title={assessment.created_by_name || ''}
                                                >
                                                  {assessment.created_by_name || '—'}
                                                </td>
                                                <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap align-middle">
                                                  {renderChildDetail ? renderChildDetail(assessment) : <RoundWeightageCell assessment={assessment} />}
                                                </td>
                                                {vocabulary.extraDetailColumn && (
                                                  <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap align-middle">
                                                    {renderChildExtraDetail ? renderChildExtraDetail(assessment) : '—'}
                                                  </td>
                                                )}
                                                <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap align-middle">
                                                  {typeof invitations === 'number'
                                                    ? <MetricCell value={invitations} label={invitations === 1 ? 'Invitation' : 'Invitations'} />
                                                    : <UnknownMetric />}
                                                </td>
                                                {vocabulary.childCompletedColumn && (
                                                  <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap align-middle">
                                                    {typeof assessment.completed_count === 'number'
                                                      ? <MetricCell value={assessment.completed_count} label={assessment.completed_count === 1 ? 'Candidate' : 'Candidates'} />
                                                      : <span className="text-sm text-gray-400">—</span>}
                                                  </td>
                                                )}
                                                {/* Cell and header are gated
                                                    on the same flag, so the
                                                    row can never carry one
                                                    more cell than the header
                                                    declares - which is what
                                                    shifts every column right
                                                    of it out of alignment. */}
                                                {showsAssessmentActions && (
                                                  <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap align-middle">
                                                    {/* gap-1.5 matches the spacing
                                                        inside the quick-action
                                                        group, so all four
                                                        controls read as one
                                                        evenly spaced row. */}
                                                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                                      {/* Read THIS assessment.
                                                          Same square bordered
                                                          eye the job version row
                                                          above carries, so the
                                                          two levels offer the
                                                          same affordance for
                                                          "show me this one".
                                                          Leads the cell, then
                                                          the host's own quick
                                                          actions and menu. */}
                                                      {onViewAssessment && (
                                                        <Button
                                                          type="button"
                                                          variant="secondary"
                                                          size="sm"
                                                          onClick={() => onViewAssessment(assessment)}
                                                          aria-label={`View assessment V${assessment.version ?? 1} details`}
                                                          title={`View assessment V${assessment.version ?? 1} details`}
                                                          className="h-8 w-8 px-0 flex-shrink-0"
                                                        >
                                                          <Eye className="w-4 h-4" />
                                                        </Button>
                                                      )}
                                                      {/* The host's own menu and
                                                          quick actions, where a
                                                          host offers them. The
                                                          Send Invite dialog does
                                                          not: its rows are a
                                                          choice, and Send /
                                                          Track / Result all act
                                                          on an assessment rather
                                                          than help pick one. */}
                                                      {renderAction?.(assessment)}
                                                    </div>
                                                  </td>
                                                )}
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                    {paginated && count > 0 && (
                                      <div>
                                        <Pagination
                                          currentPage={Math.min(Math.max(1, childPagingOf(group.jobVersion).page), Math.max(1, Math.ceil((count) / (childPagingOf(group.jobVersion).size))))}
                                          totalPages={Math.max(1, Math.ceil((count) / (childPagingOf(group.jobVersion).size)))}
                                          totalItems={count}
                                          itemsPerPage={childPagingOf(group.jobVersion).size}
                                          onPageChange={(page) =>
                                            setChildPagingOf(group.jobVersion, { ...childPagingOf(group.jobVersion), page })
                                          }
                                          onItemsPerPageChange={(size) => setChildPagingOf(group.jobVersion, { page: 1, size })}
                                        />
                                      </div>
                                    )}
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
          {paginated && groups.length > 0 && (
            <div>
              <Pagination
                currentPage={Math.min(Math.max(1, jobVersionsPage), Math.max(1, Math.ceil((groups.length) / (jobVersionsPageSize))))}
                totalPages={Math.max(1, Math.ceil((groups.length) / (jobVersionsPageSize)))}
                totalItems={groups.length}
                itemsPerPage={jobVersionsPageSize}
                onPageChange={setJobVersionsPage}
                onItemsPerPageChange={(size) => { setJobVersionsPageSize(size); setJobVersionsPage(1); }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
