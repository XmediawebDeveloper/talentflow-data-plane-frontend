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
} from 'lucide-react';
import type { Job } from '@/lib/types/types';
import { formatISTDate } from '@/lib/utils/dateUtils';
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
 * Experience, posted date, author, last update, applicants — the five facts the
 * Job Openings list carries under a job's headline.
 *
 * Its own component so a surface can control how they lay out without a second
 * copy of the fields drifting from this one.
 *
 * `singleLine` keeps all five on one horizontal row instead of wrapping onto
 * several: `flex-nowrap` plus inherited `whitespace-nowrap`, with the row
 * scrolling inside itself when it genuinely cannot fit rather than clipping.
 * Off by default — the Job Openings list wraps them, and it stays that way.
 */
export function JobOpeningMeta({ job, singleLine = false }: { job: Job; singleLine?: boolean }) {
  return (
    <div
      className={`flex items-center text-sm text-gray-600 dark:text-slate-400 ${
        singleLine
          /* [&>span]:flex-shrink-0 matters: a flex item can shrink below its
             own content width even under flex-nowrap, which with nowrap text
             would push the label out of its box instead of scrolling the row. */
          ? 'flex-nowrap gap-x-3 whitespace-nowrap overflow-x-auto [&>span]:flex-shrink-0'
          : 'flex-wrap gap-x-3 gap-y-1.5'
      }`}
    >
      {job.experience && (
        <span className="flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4 text-gray-400 dark:text-slate-500" />
          {job.experience}
        </span>
      )}
      {job.postedDate && (
        <span className="flex items-center gap-1.5">
          <Calendar className="w-4 h-4 text-gray-400 dark:text-slate-500" />
          Posted {formatISTDate(job.postedDate)}
        </span>
      )}
      {job.postedBy && (
        <span className="flex items-center gap-1.5">
          <User className="w-4 h-4 text-gray-400 dark:text-slate-500" />
          By {job.postedBy}
        </span>
      )}
      {job.updated_at && (
        <span className="flex items-center gap-1.5">
          <Clock className="w-4 h-4 text-gray-400 dark:text-slate-500" />
          Last Updated: {formatLastUpdated(job.updated_at)}
        </span>
      )}
      <span className="flex items-center gap-1.5 px-2 py-0.5 bg-gray-50 dark:bg-slate-800 rounded-lg">
        <Users className="w-4 h-4 text-gray-400 dark:text-slate-500" />
        {job.applicants} {job.applicants === 1 ? 'applicant' : 'applicants'}
      </span>
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
  /** Extra badges after the vN chip — a per-surface addition, e.g. a tick. */
  trailingBadges?: React.ReactNode;
}

/**
 * A job opening as the Job Openings list renders it: the badge row (JD id,
 * title, status, AI/Manual, vN), then role/location/type, then
 * experience/dates/author/applicants, then salary + skills.
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
  trailingBadges,
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
          className="text-sm sm:text-base font-medium text-gray-900 dark:text-slate-50 truncate min-w-0"
          title={job.title}
        >
          {job.title}
        </h3>
        <span className={`px-2 py-0.5 rounded-full text-xs ${statusConfig.bg} ${statusConfig.text} border ${statusConfig.border} flex items-center gap-1.5 flex-shrink-0`}>
          <div className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`}></div>
          {displayStatus}
        </span>
        <span className={`px-2 py-0.5 rounded-full text-xs ${creationMethodConfig.bg} ${creationMethodConfig.text} border ${creationMethodConfig.border} flex items-center gap-1.5 flex-shrink-0`}>
          <div className={`w-1.5 h-1.5 rounded-full ${creationMethodConfig.dot}`}></div>
          {creationMethodConfig.label}
        </span>
        {job.versionNumber && job.versionNumber >= 1 && (
          <span className="px-2 py-0.5 rounded-full text-xs bg-gray-50 text-gray-700 border border-gray-200 flex items-center gap-1.5 flex-shrink-0 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
            <div className="w-1.5 h-1.5 rounded-full bg-gray-500"></div>
            v{job.versionNumber}
          </span>
        )}
        {trailingBadges}
      </div>

      {/* Primary Info Row 1 - Role / Industry / Location / Employment / Mode */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-gray-600 dark:text-slate-400 mb-1.5">
        {job.department && (
          <span className="flex items-center gap-1.5">
            <Briefcase className="w-4 h-4 text-gray-400 dark:text-slate-500" />
            {job.department}
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <Building2 className="w-4 h-4 text-gray-400 dark:text-slate-500" />
          {formatIndustryType(job.industry_type)}
        </span>
        <span className="flex items-center gap-1.5">
          <MapPin className="w-4 h-4 text-gray-400 dark:text-slate-500" />
          {job.location && job.location.trim() ? job.location : '-'}
        </span>
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
      </div>

      {/* Primary Info Row 2 - Experience / Dates / Posted By / Applicants */}
      {showMetaRow && (
        <div className="mb-2">
          <JobOpeningMeta job={job} singleLine={metaSingleLine} />
        </div>
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
