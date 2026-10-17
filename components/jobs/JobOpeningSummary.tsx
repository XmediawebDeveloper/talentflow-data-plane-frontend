'use client';

import JobIdBadge from './JobIdBadge';
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

function JobOpeningMetaItems({ job, showIcons = true, showCounts = true }: { job: Job; showIcons?: boolean; showCounts?: boolean }) {
  return (
    <>
      {/* By / Posted / Last Updated. With icons (the default, every other
          surface) they read "By {name}" behind a muted icon. On the Job
          Openings cards (showIcons=false) they switch to an icon-less
          "Label: value" pair — bolder label, lighter value — via
          <MetaLabelValue>. */}
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
      {job.postedDate && (
        showIcons ? (
          <span className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-gray-400 dark:text-slate-500" />
            Posted {formatISTDate(job.postedDate)}
          </span>
        ) : (
          <MetaLabelValue label="Posted" value={formatISTDate(job.postedDate)} />
        )
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
        <span className="flex items-center gap-1.5 px-2 py-0.5 bg-gray-50 dark:bg-slate-800 rounded-lg">
          <Users className="w-4 h-4 text-gray-400 dark:text-slate-500" />
          {job.applicants} {job.applicants === 1 ? 'applicant' : 'applicants'}
        </span>
      )}
      {/* Only the Job Openings list sets these; other hosts render as before. */}
      {showCounts && job.assessed != null && (
        <span className="flex items-center gap-1.5 px-2 py-0.5 bg-gray-50 dark:bg-slate-800 rounded-lg">
          <ClipboardCheck className="w-4 h-4 text-gray-400 dark:text-slate-500" />
          {job.assessed} assessed
        </span>
      )}
      {showCounts && job.interviewed != null && (
        <span className="flex items-center gap-1.5 px-2 py-0.5 bg-gray-50 dark:bg-slate-800 rounded-lg">
          <Video className="w-4 h-4 text-gray-400 dark:text-slate-500" />
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
      <span className="flex items-center gap-1.5">
        <Building2 className="w-4 h-4 text-gray-400 dark:text-slate-500" />
        {formatIndustryType(job.industry_type)}
      </span>
      {/* Location — under `hideEmpty` (Job Openings cards) it is omitted entirely
          when absent, rather than rendering a '-' placeholder. A single location
          shows its name directly; more than one collapses to a count, with every
          name available in a hover tooltip rather than overflowing the row. */}
      {(!hideEmpty || hasLocation) && (
        <span className="flex items-center gap-1.5">
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
                {locationNames.length} Locations
              </span>
            </Tooltip>
          ) : (
            hasLocation ? (locationNames[0] || job.location) : '-'
          )}
        </span>
      )}
      {/* Salary — same conditional treatment: shown only when there is a value. */}
      {(!hideEmpty || hasSalary) && (
        <span className="flex items-center gap-1.5">
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

export function JobOpeningMeta({ job, singleLine = false, showIcons = true, showCounts = true }: { job: Job; singleLine?: boolean; showIcons?: boolean; showCounts?: boolean }) {
  return (
    <div
      className={`flex items-center text-sm text-gray-600 dark:text-slate-400 ${
        singleLine ? SINGLE_LINE_ROW : 'flex-wrap gap-x-3 gap-y-1.5'
      }`}
    >
      <JobOpeningMetaItems job={job} showIcons={showIcons} showCounts={showCounts} />
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
}: JobOpeningSummaryProps) {
  const displayStatus = getDisplayStatus(job.status, job.currentVersion);
  const statusConfig = getStatusConfig(displayStatus);
  const creationMethodConfig = getCreationMethodConfig(job.creation_method);
  const extras = job as JobWithListingExtras;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {job.job_id && (
          <JobIdBadge className="flex-shrink-0">{job.job_id}</JobIdBadge>
        )}
        {/* The job name takes whatever the row leaves it and truncates there,
            with the whole name in `title` for a hover. `min-w-0` is what makes
            that happen: a flex item will not shrink below its content width
            without it, so the name would otherwise push the status pill beside
            it off the row instead of truncating. The same three rules apply
            wherever a job name is drawn - see the Job Name cell in
            components/assessments/AllAssessmentsTable, where they were settled. */}
        <h3
          /* basis-full on mobile so the name takes its OWN line and TRUNCATES to
             the card width — in a flex-wrap row a lone long title otherwise has
             no width to clip against and its nowrap content forces the whole card
             wider than the screen (clipping the title AND the meta below), while
             the status/method/version badges wrap cleanly onto the next line.
             sm:basis-auto restores the inline behaviour on wider screens. */
          className="basis-full sm:basis-auto text-sm sm:text-base font-medium text-gray-900 dark:text-slate-50 truncate min-w-0"
          title={job.title}
        >
          {job.title}
        </h3>
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
          {showMetaRow && <JobOpeningMetaItems job={job} showIcons={showMetaIcons} showCounts={showCountBadges} />}
        </div>
      ) : (
        <>
          {/* Primary Info Row 1 - Experience / Industry / Location / Employment / Mode */}
          <div
            className={`flex items-center text-sm text-gray-600 dark:text-slate-400 mb-1.5 ${
              infoSingleLine ? SINGLE_LINE_ROW : 'flex-wrap gap-x-3 gap-y-1.5'
            }`}
          >
            <JobOpeningPrimaryItems job={job} hideEmpty={hideEmptyFields} />
          </div>

          {/* Primary Info Row 2 - Dates / Posted By / Applicants */}
          {showMetaRow && (
            <div className="mb-2">
              <JobOpeningMeta job={job} singleLine={metaSingleLine} showIcons={showMetaIcons} showCounts={showCountBadges} />
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
