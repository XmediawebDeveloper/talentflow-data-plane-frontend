'use client';

import { ExternalLink, MapPin } from 'lucide-react';
import type { JDResponse } from '@/lib/services/jdService';
import { formatJobExperienceBadge, formatExperienceRange } from '@/lib/utils/jobExperience';
import { formatSalaryRange } from '@/lib/utils/salary';
import { formatIST } from '@/lib/utils/dateUtils';
import { formatLocationGroups } from '@/lib/utils/jobOpeningDisplay';

/**
 * The identity card that heads the Job Details page — JD id, title and status
 * over the facts row — as a read-only block any surface can put above a JD.
 *
 * Row 1: the blue mono JD-xxx pill, the job title, the status chip.
 * Row 2: location, experience, employment type, work mode, salary, then the
 * posted date, who posted it, and the version.
 *
 * Every class, chip, separator and label is the page's own (JobDetailView's
 * "Job Details Card"), so a JD read from an assessment's View JD tab is the
 * same object a recruiter already knows from Job Openings rather than a second
 * arrangement of the same fields.
 *
 * READ-ONLY, and that is the one deliberate difference from the page. There,
 * the title opens the overview and the version pill is a switcher; here both
 * are plain text. A tab that only shows a JD has nothing for them to do, and
 * the page this sits on carries its own job-version control already — a second
 * one beside it would be two controls for one thing.
 */

/** The page's JD status palette, on its own capitalised vocabulary. */
const statusBadgeClass = (status: string) => {
  switch (status) {
    case 'Published': return 'bg-green-100 text-green-700 border-green-200';
    case 'Republished': return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'Draft': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    case 'Closed': return 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700';
    case 'Disabled': return 'bg-red-100 text-red-700 border-red-200';
    case 'Archived': return 'bg-purple-100 text-purple-700 border-purple-200';
    default: return 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700';
  }
};

/** "Republished" is what a published JD past its first version is called — the
 *  page's own rule, not a status the backend stores. */
const displayStatus = (status: string, version?: number) => {
  const label = status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Draft';
  return label === 'Published' && version && version > 1 ? 'Republished' : label;
};

const employmentTypeLabel = (value?: string) => {
  switch (value) {
    case 'full_time': return 'Full Time';
    case 'part_time': return 'Part Time';
    case 'contract': return 'Contract';
    case 'internship': return 'Internship';
    case 'temporary': return 'Temporary';
    default: return value;
  }
};

const workModeLabel = (value?: string) => {
  switch (value) {
    case 'onsite': return 'On-site';
    case 'remote': return 'Remote';
    case 'hybrid': return 'Hybrid';
    case 'field_based': return 'Field-based';
    default: return value;
  }
};

export interface JDIdentityHeaderProps {
  jd: JDResponse;
  /**
   * The version to state in the purple pill.
   *
   * Passed in rather than read off the record, because the host may know a
   * truer answer: on an assessment's page the job version is resolved from the
   * JD row the assessment points at, which is the number every other badge on
   * that page is already showing. Falls back to the JD's own
   * `current_version`.
   */
  versionNumber?: number;
  /**
   * Makes the whole card a link to the JD's own page: the host decides where
   * that is and what trail it arrives with. Omit it and the card stays the
   * read-only block described above.
   */
  onOpen?: () => void;
}

export default function JDIdentityHeader({ jd, versionNumber, onOpen }: JDIdentityHeaderProps) {
  const version = versionNumber ?? jd.current_version;
  const status = displayStatus(jd.status, jd.current_version);
  const employment = employmentTypeLabel(jd.employment_type);
  const workMode = workModeLabel(jd.remote_type);
  const salary = formatSalaryRange({
    min: jd.salary_min,
    max: jd.salary_max,
    currency: jd.salary_currency,
  });
  /* The bullet before the posted info only earns its place when something
     came before it — the page's own condition. */
  const hasFactsBefore = Boolean(jd.location || employment || workMode || salary);

  return (
    <div
      className={`bg-white dark:bg-slate-900 rounded-xl border border-brand-blue/30 dark:border-brand-blue/40 ring-1 ring-brand-blue/10 dark:ring-brand-blue/20 shadow-sm shadow-brand-blue/10 p-4 sm:p-5${
        onOpen
          ? ' group cursor-pointer transition-all hover:border-brand-blue/50 hover:shadow-md hover:shadow-brand-blue/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40'
          : ''
      }`}
      {...(onOpen
        ? {
            role: 'link',
            tabIndex: 0,
            title: `Open ${jd.title || 'job'} details`,
            onClick: onOpen,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpen();
              }
            },
          }
        : {})}
    >
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Row 1: JD ID + Job Title + Status */}
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {jd.job_id && (
              <span className="inline-flex items-center px-2 py-0.5 bg-blue-600 text-white rounded-md text-xs font-semibold font-mono tracking-wide">
                {jd.job_id}
              </span>
            )}
            <h1 className={`min-w-0 max-w-full font-normal text-gray-900 dark:text-slate-50 text-base sm:text-lg truncate${onOpen ? ' group-hover:text-brand-blue transition-colors' : ''}`}>
              {jd.title}
            </h1>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border whitespace-nowrap shrink-0 ${statusBadgeClass(status)}`}>
              {status}
            </span>
          </div>

          {/* Row 2: Location + Experience + Employment Type + Work Mode +
              Salary + Posted Date + Posted By + Version */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-600 dark:text-slate-400">
            {jd.location && (
              <>
                {formatLocationGroups(jd.locations, jd.location).map((label) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 shrink-0 text-purple-600" />
                    <span>{label}</span>
                  </div>
                ))}
                <span className="text-gray-300">&bull;</span>
              </>
            )}

            {(jd.job_level || jd.experience_level) && (
              <span className="inline-flex items-center px-2.5 py-1 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-md text-xs">
                {formatJobExperienceBadge({
                  jobLevel: jd.job_level || jd.experience_level,
                  /* The years, formatted by the same helper the Requirements
                     tile uses, so "13+ years" reads identically in the chip
                     and in the tile below it. */
                  experienceText: formatExperienceRange(jd.experience_min, jd.experience_max),
                })}
              </span>
            )}

            {/* No Education chip, as on the page: education is a requirement
                line inside Must-Have / Nice-to-Have Additional Requirements and
                is shown there only. */}

            {employment && (
              <span className="inline-flex items-center px-2.5 py-1 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-md text-xs">
                {employment}
              </span>
            )}

            {workMode && (
              <span className="inline-flex items-center px-2.5 py-1 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-md text-xs">
                {workMode}
              </span>
            )}

            {salary && (
              <span className="inline-flex items-center px-2.5 py-1 bg-green-50 text-green-700 rounded-md text-xs font-medium">
                {salary}
                {jd.compensation_type ? ` / ${jd.compensation_type}` : ''}
              </span>
            )}

            {hasFactsBefore && <span className="text-gray-300">&bull;</span>}

            <span>Posted {jd.published_at || jd.created_at ? formatIST(jd.published_at || jd.created_at) : 'N/A'}</span>
            <span className="text-gray-300">&bull;</span>

            <span>By {jd.created_by_name || 'Unknown'}</span>

            {version && version > 0 && (
              <>
                <span className="text-gray-300">&bull;</span>
                {/* The page's purple version pill, as a label. Nothing opens
                    from it here — see the note on read-only above. */}
                <span className="inline-flex items-center px-2.5 py-1 bg-purple-600 text-white rounded-full text-xs font-medium">
                  v{version}.0
                </span>
              </>
            )}
          </div>
        </div>
        {onOpen && (
          <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm text-brand-blue whitespace-nowrap shrink-0">
            View Job Details
            <ExternalLink className="w-3.5 h-3.5" />
          </span>
        )}
      </div>
    </div>
  );
}
