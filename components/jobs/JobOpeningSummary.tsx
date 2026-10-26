'use client';

import JobIdBadge, { JOB_HEADLINE_ROW, JOB_ID_BADGE_FIT } from './JobIdBadge';
import {
  Briefcase,
  Building2,
  MapPin,
  Users,
  TrendingUp,
  Calendar,
  User,
  Clock,
  DollarSign,
  Target,
  ClipboardCheck,
  Video,
} from 'lucide-react';
import type { Job } from '@/lib/types/types';
import { Tooltip } from '@/components/ui/tooltip';
import { formatISTDate } from '@/lib/utils/dateUtils';
import { formatSalaryRange, formatCompensationPeriod } from '@/lib/utils/salary';
import {
  formatEmploymentType,
  formatIndustryType,
  formatLastUpdated,
  getCreationMethodConfig,
  getDisplayStatus,
  getPublishedDate,
  getStatusConfig,
} from '@/lib/utils/jobOpeningDisplay';

/**
 * Fields some hosts attach to a Job beyond the shared type — the salary string
 * and the skill arrays the listing chips read.
 */
type JobWithListingExtras = Job & {
  salary?: string;
  mustHaveSkills?: unknown[];
  niceToHaveSkills?: unknown[];
};

/**
 * Posted date, author, last update, applicants — the facts the Job Openings
 * list carries under a job's headline. (Experience moved to the primary row,
 * ahead of industry type — see <JobOpeningPrimaryItems>.)
 *
 * Its own component so a surface can control how they lay out without a second
 * copy of the fields drifting from this one.
 *
 * `singleLine` keeps all of them on one horizontal row instead of wrapping onto
 * several: `flex-nowrap` plus inherited `whitespace-nowrap`, with the row
 * scrolling inside itself when it genuinely cannot fit rather than clipping.
 * Off by default — the Job Openings list wraps them, and it stays that way.
 */
/** The row's items on their own, so a host can put them in a row of its own
 *  making — see `mergeInfoRows` on <JobOpeningSummary>. */

/** A "Label: value" meta field for the icon-less Job Openings layout — the label
 *  carries the form-label weight/colour the design system uses elsewhere
 *  (`font-medium text-gray-700`), the value sits a shade lighter at normal
 *  weight, giving a clear hierarchy with no custom styling. */
function MetaLabelValue({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1">
      <span className="font-medium text-gray-700 dark:text-slate-300">{label}:</span>
      <span className="font-normal text-gray-500 dark:text-slate-400">{value}</span>
    </span>
  );
}

/* The Job Openings count badges' tones, spelled out in full so Tailwind
   keeps the classes. */
const COUNT_TONES = {
  info: 'bg-info-subtle text-info-strong',
  success: 'bg-success-subtle text-success-strong',
  warning: 'bg-warning-subtle text-warning-strong',
} as const;

/* A count chip's icon: grey, or the chip's own colour when coloured. */
const countIcon = (colored: boolean) =>
  `w-4 h-4 flex-shrink-0 ${colored ? '' : 'text-gray-400 dark:text-slate-500'}`;

function JobOpeningMetaItems({ job, showIcons = true, showCounts = true, coloredCounts = false, applicantsLabel }: { job: Job; showIcons?: boolean; showCounts?: boolean; coloredCounts?: boolean; applicantsLabel?: string }) {
  /* Grey by default; `coloredCounts` takes the Job Openings badges' tones —
     info (applicants), success (assessed), warning (interviewed). */
  const countChip = (tone: keyof typeof COUNT_TONES) =>
    `flex items-center gap-1.5 px-2 py-0.5 rounded-lg ${coloredCounts ? COUNT_TONES[tone] : 'bg-gray-50 dark:bg-slate-800'}`;
  return (
    <>
      {/* By / Posted / Last Updated. With icons (the default, every other
          surface) they read "By {name}" behind a muted icon. On the Job
          Openings cards (showIcons=false) they switch to an icon-less
          "Label: value" pair — bolder label, lighter value — via
          <MetaLabelValue>. */}
      {/* Job Openings cards: Created (never moved by publishing) always, Posted
          only once the job was published — the same pair, in the same order,
          as the job details header. */}
      {!showIcons && job.created_at && (
        <MetaLabelValue label="Created" value={formatISTDate(job.created_at)} />
      )}
      {!showIcons && getPublishedDate(job) && (
        <MetaLabelValue label="Posted" value={formatISTDate(getPublishedDate(job))} />
      )}
      {job.postedBy && (
        showIcons ? (
          <span className="flex items-center gap-1.5">
            <User className="w-4 h-4 text-gray-400 dark:text-slate-500" />
            By {job.postedBy}
          </span>
        ) : (
          <MetaLabelValue label="By" value={job.postedBy} />
        )
      )}
      {showIcons && job.postedDate && (
        <span className="flex items-center gap-1.5">
          <Calendar className="w-4 h-4 text-gray-400 dark:text-slate-500" />
          Posted {formatISTDate(job.postedDate)}
        </span>
      )}
      {job.updated_at && (
        showIcons ? (
          <span className="flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-gray-400 dark:text-slate-500" />
            Last Updated: {formatLastUpdated(job.updated_at)}
          </span>
        ) : (
          <MetaLabelValue label="Last Updated" value={formatLastUpdated(job.updated_at)} />
        )
      )}
      {/* A record with no applicant count at all (the AI Interview flow's JD
          list carries none) said " applicants" with nothing in front of it.
          `showCounts` lets a host (the Job Openings cards) suppress these three
          chips here and render them elsewhere instead. */}
      {showCounts && job.applicants != null && (
        <span className={countChip('info')}>
          <Users className={countIcon(coloredCounts)} />
          {job.applicants} {applicantsLabel ?? (job.applicants === 1 ? 'applicant' : 'applicants')}
        </span>
      )}
      {/* Only the Job Openings list sets these; other hosts render as before. */}
      {showCounts && job.assessed != null && (
        <span className={countChip('success')}>
          <ClipboardCheck className={countIcon(coloredCounts)} />
          {job.assessed} assessed
        </span>
      )}
      {showCounts && job.interviewed != null && (
        <span className={countChip('warning')}>
          <Video className={countIcon(coloredCounts)} />
          {job.interviewed} interviewed
        </span>
      )}
    </>
  );
}

/** Experience / industry / location / employment type / work mode, as items.
 *  Exported so a list that is not a Job Openings row (AI Talent Match's
 *  Matched Jobs) can print the same JD details line. */
export function JobOpeningPrimaryItems({ job, hideEmpty = false }: { job: Job; hideEmpty?: boolean }) {
  // Per-city names when the full array is available (every current JD); hosts
  // that only ever set the legacy joined `location` string (older cached data)
  // fall back to showing that string as-is, same as before this array existed.
  const locationNames = (job.locations || [])
    .map((loc) => loc?.city?.trim())
    .filter((city): city is string => !!city);
  const hasLocation = locationNames.length > 0 || !!(job.location && job.location.trim());
  const salaryText = formatSalaryRange({ min: job.salary_min, max: job.salary_max, currency: job.salary_currency });
  const hasSalary = !!salaryText;
  return (
    <>
      {job.experience && (
        <span className="flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4 text-gray-400 dark:text-slate-500" />
          {job.experience}
        </span>
      )}
      {/* Phones: an empty field's bare "-" (here, Location and Salary) is
          hidden — on a wrapped two-line card it read as a stray dash, not
          as "not set". From sm the placeholders show as before. */}
      <span className={`flex items-center gap-1.5 ${job.industry_type ? '' : 'max-sm:hidden'}`}>
        <Building2 className="w-4 h-4 text-gray-400 dark:text-slate-500" />
        {formatIndustryType(job.industry_type)}
      </span>
      {/* Location — under `hideEmpty` (Job Openings cards) it is omitted entirely
          when absent, rather than rendering a '-' placeholder. A single location
          shows its name directly; more than one shows the first name plus "+N more",
          with every name available in a hover tooltip rather than overflowing the row. */}
      {(!hideEmpty || hasLocation) && (
        <span className={`flex items-center gap-1.5 ${hasLocation ? '' : 'max-sm:hidden'}`}>
          <MapPin className="w-4 h-4 text-gray-400 dark:text-slate-500" />
          {locationNames.length > 1 ? (
            <Tooltip
              content={
                <div className="flex flex-col gap-0.5">
                  {locationNames.map((name, index) => (
                    <span key={index}>{name}</span>
                  ))}
                </div>
              }
            >
              <span className="underline decoration-dotted decoration-gray-400 dark:decoration-slate-500 underline-offset-2">
                {locationNames[0]} +{locationNames.length - 1} more
              </span>
            </Tooltip>
          ) : (
            hasLocation ? (locationNames[0] || job.location) : '-'
          )}
        </span>
      )}
      {/* Salary — same conditional treatment: shown only when there is a value. */}
      {(!hideEmpty || hasSalary) && (
        <span className={`flex items-center gap-1.5 ${hasSalary ? '' : 'max-sm:hidden'}`}>
          Salary {salaryText || '-'}
          {(job.salary_min || job.salary_max) && job.compensation_type
            ? ` / ${formatCompensationPeriod(job.compensation_type)}`
            : ''}
        </span>
      )}
      <span className="flex items-center gap-1.5">
        <Briefcase className="w-4 h-4 text-gray-400 dark:text-slate-500" />
        {formatEmploymentType(job.employmentType)}
      </span>
      {job.workMode && (
        <span className="flex items-center gap-1.5">
          <Users className="w-4 h-4 text-gray-400 dark:text-slate-500" />
          <span className="capitalize">{job.workMode}</span>
        </span>
      )}
    </>
  );
}

/* On small mobile the meta WRAPS (flex-wrap) — forcing it onto one nowrap row
   there made the row wider than the phone screen, which pushed the whole card
   past the viewport (clipping the title/status too, not just the meta). From
   sm: up it returns to the intended single scrollable line.
   [&>span]:flex-shrink-0 matters at sm+: a flex item can shrink below its own
   content width even under flex-nowrap, which with nowrap text would push the
   label out of its box instead of scrolling the row. */
const SINGLE_LINE_ROW =
  'flex-wrap gap-x-3 gap-y-1.5 sm:flex-nowrap sm:gap-y-0 sm:whitespace-nowrap sm:overflow-x-auto sm:scrollbar-hide sm:[&>span]:flex-shrink-0';

/* `phoneGrid` (compact phone layout): below sm the row's fields are drawn at
   text-xs with 14px icons and tighter gaps, and each field stays whole on one
   line — so they wrap as whole units ("By Deepak Raj", "4 assessed") instead
   of breaking mid-name or mid-word inside a narrow column. */
const PHONE_GRID_ROW =
  'max-sm:text-xs max-sm:gap-x-3 max-sm:gap-y-1.5 max-sm:[&>span]:whitespace-nowrap max-sm:[&>span]:max-w-full max-sm:[&>span]:gap-1 max-sm:[&_svg]:w-3.5 max-sm:[&_svg]:h-3.5';

export function JobOpeningMeta({ job, singleLine = false, showIcons = true, showCounts = true, coloredCounts = false, applicantsLabel, phoneGrid = false }: { job: Job; singleLine?: boolean; showIcons?: boolean; showCounts?: boolean; coloredCounts?: boolean; applicantsLabel?: string; phoneGrid?: boolean }) {
  return (
    <div
      className={`flex items-center text-sm text-gray-600 dark:text-slate-400 ${
        singleLine ? SINGLE_LINE_ROW : 'flex-wrap gap-x-3 gap-y-1.5'
      } ${phoneGrid ? PHONE_GRID_ROW : ''}`}
    >
      <JobOpeningMetaItems job={job} showIcons={showIcons} showCounts={showCounts} coloredCounts={coloredCounts} applicantsLabel={applicantsLabel} />
    </div>
  );
}

interface JobOpeningSummaryProps {
  job: Job;
  /**
   * The meta row (experience / dates / author / applicants), rendered in place
   * under the headline. Off where a surface positions <JobOpeningMeta> itself.
   */
  showMetaRow?: boolean;
  /** Keep that row on one horizontal line — see <JobOpeningMeta>. */
  metaSingleLine?: boolean;
  /**
   * Same treatment for the experience / industry / location / type row above it.
   * Off by default: the Job Openings list wraps it.
   */
  infoSingleLine?: boolean;
  /**
   * Draw BOTH info rows as one line — experience, industry, location, type, work
   * mode, dates, author and applicants in a single nowrap row that
   * scrolls if it has to. The AI Interview wizard's header uses it, where the
   * card shares its width with action buttons and two stacked rows made the
   * card twice as tall as what it was describing. Implies `infoSingleLine`.
   */
  mergeInfoRows?: boolean;
  /** Extra badges after the vN chip — a per-surface addition, e.g. a tick. */
  trailingBadges?: React.ReactNode;
  /**
   * Job Openings list cards opt into a cleaner presentation:
   *   - `showMetaIcons={false}` drops the Posted / By / Last Updated icons,
   *     leaving plain text.
   *   - `hideEmptyFields` shows Salary / Location only when they have a value,
   *     with no '-' placeholder when missing.
   * Both default to the icon + full-field layout every other surface (the Apply
   * to Job dialog, AI Talent Match, AI Interview) already renders, so the shared
   * component only changes where a caller opts in.
   */
  showMetaIcons?: boolean;
  hideEmptyFields?: boolean;
  /**
   * Suppress the Applicants / Assessed / Interviewed count chips in the meta
   * row. The Job Openings cards render those separately (a colored vertical
   * stack beside the row actions), so the shared row must not also print them.
   * Defaults true, so every other surface is unchanged.
   */
  showCountBadges?: boolean;
  /** Colour those chips like the Job Openings badges (Resume Scoring's
   *  Score Resumes list). Off by default: grey everywhere else. */
  coloredCountBadges?: boolean;
  /** The word after the applicant count ("scored" on Resume Scoring).
   *  Omitted = "applicant" / "applicants". */
  applicantsLabel?: string;
  /** Phones only: both info rows as a two-column grid — see PHONE_GRID_ROW.
   *  Off by default, so every other surface is unchanged. */
  phoneGrid?: boolean;
}

/**
 * A job opening as the Job Openings list renders it: the badge row (JD id,
 * title, status, AI/Manual, vN), then experience/role/location/type, then
 * dates/author/applicants, then salary + skills.
 *
 * The one implementation behind both the Job Openings list rows and the Apply
 * to Job dialog's "Select a Job Opening" list, so the dialog cannot drift into
 * showing a different set of fields — or the same field differently — from the
 * page it mirrors.
 */
export default function JobOpeningSummary({
  job,
  showMetaRow = true,
  metaSingleLine = false,
  infoSingleLine = false,
  mergeInfoRows = false,
  trailingBadges,
  showMetaIcons = true,
  hideEmptyFields = false,
  showCountBadges = true,
  coloredCountBadges = false,
  applicantsLabel,
  phoneGrid = false,
}: JobOpeningSummaryProps) {
  const displayStatus = getDisplayStatus(job.status, job.currentVersion);
  const statusConfig = getStatusConfig(displayStatus);
  const creationMethodConfig = getCreationMethodConfig(job.creation_method);
  const extras = job as JobWithListingExtras;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {/* Job ID + Job Name share one nowrap line at every width — see
            JOB_HEADLINE_ROW. The host's checkbox / radio sits level with it. */}
        <div className={JOB_HEADLINE_ROW}>
        {job.job_id && (
          <JobIdBadge className={JOB_ID_BADGE_FIT} title={job.job_id}>{job.job_id}</JobIdBadge>
        )}
        {/* The job name takes whatever the row leaves it and truncates there,
            with the whole name in `title` for a hover. `min-w-0` is what makes
            that happen: a flex item will not shrink below its content width
            without it, so the name would otherwise push the status pill beside
            it off the row instead of truncating. The same three rules apply
            wherever a job name is drawn - see the Job Name cell in
            components/assessments/AllAssessmentsTable, where they were settled. */}
        <h3
          className={`text-sm sm:text-base font-medium text-gray-900 dark:text-slate-50 truncate min-w-0 ${
            /* Compact phone layout: up to two lines, so the role reads in
               full instead of "Junior Software T…". */
            phoneGrid ? 'max-sm:whitespace-normal max-sm:line-clamp-2 max-sm:leading-snug' : ''
          }`}
          title={job.title}
        >
          {job.title}
        </h3>
        </div>
        {job.versionNumber && job.versionNumber >= 1 && (
          <span className="px-2 py-0.5 rounded-full text-xs bg-gray-50 text-gray-700 border border-gray-200 flex items-center gap-1.5 flex-shrink-0 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
            <div className="w-1.5 h-1.5 rounded-full bg-gray-500"></div>
            v{job.versionNumber}
          </span>
        )}
        <span className={`px-2 py-0.5 rounded-full text-xs ${creationMethodConfig.bg} ${creationMethodConfig.text} border ${creationMethodConfig.border} flex items-center gap-1.5 flex-shrink-0`}>
          <div className={`w-1.5 h-1.5 rounded-full ${creationMethodConfig.dot}`}></div>
          {creationMethodConfig.label}
        </span>
        <span className={`px-2 py-0.5 rounded-full text-xs ${statusConfig.bg} ${statusConfig.text} border ${statusConfig.border} flex items-center gap-1.5 flex-shrink-0`}>
          <div className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`}></div>
          {displayStatus}
        </span>
        {trailingBadges}
      </div>

      {mergeInfoRows ? (
        /* Both rows as one line */
        <div className={`flex items-center text-sm text-gray-600 dark:text-slate-400 mb-2 ${SINGLE_LINE_ROW}`}>
          <JobOpeningPrimaryItems job={job} hideEmpty={hideEmptyFields} />
          {showMetaRow && <JobOpeningMetaItems job={job} showIcons={showMetaIcons} showCounts={showCountBadges} coloredCounts={coloredCountBadges} applicantsLabel={applicantsLabel} />}
        </div>
      ) : (
        <>
          {/* Primary Info Row 1 - Experience / Industry / Location / Employment / Mode */}
          <div
            className={`flex items-center text-sm text-gray-600 dark:text-slate-400 mb-1.5 ${
              infoSingleLine ? SINGLE_LINE_ROW : 'flex-wrap gap-x-3 gap-y-1.5'
            } ${phoneGrid ? PHONE_GRID_ROW : ''}`}
          >
            <JobOpeningPrimaryItems job={job} hideEmpty={hideEmptyFields} />
          </div>

          {/* Primary Info Row 2 - Dates / Posted By / Applicants */}
          {showMetaRow && (
            <div className={`mb-2 ${phoneGrid ? 'max-sm:mt-2 max-sm:pt-2 max-sm:border-t max-sm:border-gray-100 max-sm:mb-0' : ''}`}>
              <JobOpeningMeta job={job} singleLine={metaSingleLine} showIcons={showMetaIcons} showCounts={showCountBadges} coloredCounts={coloredCountBadges} applicantsLabel={applicantsLabel} phoneGrid={phoneGrid} />
            </div>
          )}
        </>
      )}

      {/* Additional Info Row - Salary & Skills */}
      <div className="flex items-center flex-wrap gap-2">
        {extras.salary && (
          <div className="flex items-center gap-1.5 px-3 py-1 bg-green-50 dark:bg-green-950/30 rounded-lg text-sm">
            <DollarSign className="w-4 h-4 text-green-600" />
            <span className="text-green-700 dark:text-green-300">{extras.salary}</span>
          </div>
        )}
        {((extras.mustHaveSkills?.length ?? 0) > 0 || (extras.niceToHaveSkills?.length ?? 0) > 0) && (
          <div className="flex items-center gap-1.5 px-3 py-1 bg-gray-100 dark:bg-slate-800 rounded-lg text-sm">
            <Target className="w-4 h-4 text-gray-700 dark:text-slate-300" />
            <span className="text-gray-700 dark:text-slate-300">
              {extras.mustHaveSkills?.length || 0} required + {extras.niceToHaveSkills?.length || 0} preferred
            </span>
          </div>
        )}
      </div>
    </>
  );
}
