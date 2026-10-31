'use client';

import { Briefcase, MapPin } from 'lucide-react';
import type { JDResponse } from '@/lib/services/jdService';
import { mapJDToJob, formatLastUpdated, formatLocationGroups } from '@/lib/utils/jobOpeningDisplay';
import { formatJobExperienceBadge } from '@/lib/utils/jobExperience';
import { formatSalaryRange } from '@/lib/utils/salary';
import { formatIST } from '@/lib/utils/dateUtils';

/* Job Details' status pill (JobDetailView's getStatusBadgeClass /
   getDisplayStatus), so the two read the same for one JD. */
const STATUS_BADGE_CLASS: Record<string, string> = {
  Published: 'bg-success-subtle text-success border-success-line',
  Republished: 'bg-success-subtle text-success border-success-line',
  Draft: 'bg-warning-subtle text-warning border-warning-line',
  Disabled: 'bg-destructive-subtle text-destructive border-destructive-line',
  Archived: 'bg-purple-100 text-purple-700 border-purple-200',
};
const NEUTRAL_BADGE_CLASS = 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700';

const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
  full_time: 'Full Time',
  part_time: 'Part Time',
  contract: 'Contract',
  internship: 'Internship',
  temporary: 'Temporary',
};
const WORK_MODE_LABEL: Record<string, string> = {
  onsite: 'On-site',
  remote: 'Remote',
  hybrid: 'Hybrid',
  field_based: 'Field-based',
};

const CHIP_CLASS = 'inline-flex items-center px-2.5 py-1 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-md text-xs';

/**
 * The Job Details page's first card — JD ID, title, status, then location,
 * experience, employment type, work mode, salary, Posted / By / Last Updated
 * and the version — read-only, from the JD record itself. Same chrome and
 * order as that card; no version menu and no links, as it sits in a dialog.
 */
export default function JDHeaderCard({ jd }: { jd: JDResponse }) {
  const job = mapJDToJob(jd);
  const status = job.status === 'Published' && (job.currentVersion ?? 0) > 1 ? 'Republished' : job.status;
  const hasSalary = !!(jd.salary_min || jd.salary_max);

  return (
    <div className="mb-5 bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 p-4 sm:p-5">
      <div className="flex flex-1 min-w-0 items-start gap-3">
        <div className="hidden sm:flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15">
          <Briefcase className="h-4 w-4 text-brand-blue" />
        </div>
        <div className="flex-1 min-w-0">
          {/* Row 1: JD ID + Job Title + Status */}
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {job.job_id && (
              <span className="inline-flex items-center px-2 py-0.5 bg-brand-blue text-white rounded-md text-xs font-semibold font-mono tracking-wide">
                {job.job_id}
              </span>
            )}
            <h3 className="min-w-0 font-semibold text-gray-900 dark:text-slate-50 text-lg sm:text-xl truncate" title={job.title}>
              {job.title}
            </h3>
            {status && (
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border whitespace-nowrap ${STATUS_BADGE_CLASS[status] ?? NEUTRAL_BADGE_CLASS}`}>
                {status}
              </span>
            )}
          </div>

          {/* Row 2: Location, experience, employment type, work mode, salary,
              Posted / By / Last Updated, version */}
          <div className="flex flex-wrap items-center gap-1.5 tf-meta-strong">
            {job.location && (
              <>
                {formatLocationGroups(job.locations, job.location).map((label) => (
                  <div key={label} className="flex items-center gap-1.5 min-w-0">
                    <MapPin className="w-4 h-4 text-brand-blue flex-shrink-0" />
                    <span className="[overflow-wrap:anywhere]">{label}</span>
                  </div>
                ))}
                <span className="text-gray-300">•</span>
              </>
            )}
            {job.experience_level && (
              <span className={CHIP_CLASS}>
                {formatJobExperienceBadge({ jobLevel: job.experience_level, experienceText: job.experience })}
              </span>
            )}
            {jd.employment_type && (
              <span className={CHIP_CLASS}>{EMPLOYMENT_TYPE_LABEL[jd.employment_type] ?? jd.employment_type}</span>
            )}
            {jd.remote_type && (
              <span className={CHIP_CLASS}>{WORK_MODE_LABEL[jd.remote_type] ?? jd.remote_type}</span>
            )}
            {hasSalary && (
              <span className="inline-flex items-center px-2.5 py-1 bg-success-subtle text-success rounded-md text-xs font-medium">
                {formatSalaryRange({ min: jd.salary_min, max: jd.salary_max, currency: jd.salary_currency })}
                {jd.compensation_type ? ` / ${jd.compensation_type}` : ''}
              </span>
            )}
            {(job.location || jd.employment_type || jd.remote_type || hasSalary) && (
              <span className="text-gray-300">•</span>
            )}
            <span className="inline-flex items-center gap-1">
              <span className="font-medium text-gray-700 dark:text-slate-300">Posted:</span>
              <span className="font-normal text-gray-500 dark:text-slate-400">{job.postedDate ? formatIST(job.postedDate) : 'N/A'}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="font-medium text-gray-700 dark:text-slate-300">By:</span>
              <span className="font-normal text-gray-500 dark:text-slate-400">{job.postedBy || 'Unknown'}</span>
            </span>
            {job.updated_at && (
              <span className="inline-flex items-center gap-1">
                <span className="font-medium text-gray-700 dark:text-slate-300">Last Updated:</span>
                <span className="font-normal text-gray-500 dark:text-slate-400">{formatLastUpdated(job.updated_at)}</span>
              </span>
            )}
            {job.versionNumber && job.versionNumber > 0 ? (
              <>
                <span className="text-gray-300">•</span>
                <span className="inline-flex items-center px-2.5 py-1 bg-brand-orange-deep text-white rounded-full text-xs font-medium">
                  v{job.versionNumber}.0
                </span>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
