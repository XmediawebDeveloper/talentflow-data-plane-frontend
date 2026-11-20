'use client';

import { FileText, RefreshCw, Users } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Job } from '@/lib/types/types';
import type { JDLineageVersion, JDResponse } from '@/lib/services/jdService';
import { formatIST, formatISTDate } from '@/lib/utils/dateUtils';
import { formatJdExperience } from '@/lib/utils/jobExperience';
import {
  formatEmploymentType,
  getCreationMethodConfig,
  getDisplayStatus,
  getStatusConfig,
  resolveVersionHistoryRows,
} from '@/lib/utils/jobOpeningDisplay';
import { clickableProps } from '@/lib/a11y/clickableProps';

interface JobVersionHistoryCardsProps {
  /** The latest-version row this history hangs off. */
  job: Job;
  /** Lineage for this job, or undefined while it is still being fetched. */
  versions: JDLineageVersion[] | undefined;
  loading: boolean;
  versionDetails: Record<string, JDResponse>;
  versionApplicants: Record<string, number>;
  /**
   * Who most recently scored a resume against each version, and when. `null`
   * means the version has never been scored; an unset key means still loading.
   */
  versionScoredBy?: Record<string, { name: string; scoredAt: string; source?: string } | null>;
  /** The ⋮ menu for one version, built from a Job-shaped stand-in pointed at
   *  THAT version's id — same contract as JobVersionHistoryPanel.renderAction. */
  renderAction?: (versionJob: Job) => ReactNode;
  /** Card click — the title link stops propagation, so this fires for clicks
   *  anywhere else on the card. */
  onCardClick?: (versionId: string) => void;
  /** Where a version's title links to. Defaults to its Job Details page. */
  versionHref?: (versionId: string) => string;
  /** Drop still-drafted versions from the chain — see resolveVersionHistoryRows. */
  publishedOnly?: boolean;
}

/**
 * Version History, expanded in place under a job card — the grid-view
 * counterpart of `JobVersionHistoryPanel`'s table.
 *
 * A dense spreadsheet-style table reads as out of place dropped into a
 * visual, badge-heavy grid card, so this renders the identical version chain
 * (via the same `resolveVersionHistoryRows`, so the two never disagree) as a
 * vertical stack of compact cards instead — matching the grid card's own
 * language of pills, badges and icons rather than table rows.
 *
 * List view keeps the table: a full-width row has room for it, and it already
 * matches the Job Description page it was modelled on.
 */
export default function JobVersionHistoryCards({
  job,
  versions,
  loading,
  versionDetails,
  versionApplicants,
  versionScoredBy,
  renderAction,
  onCardClick,
  versionHref = (id) => `/recruitment/job-details?id=${id}`,
  publishedOnly = false,
}: JobVersionHistoryCardsProps) {
  const jobVersions = resolveVersionHistoryRows(job, versions, { publishedOnly, versionApplicants });

  return (
    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-700">
      <div className="flex items-center gap-2 mb-2.5">
        <FileText className="w-4 h-4 text-brand-blue" />
        <p className="tf-row-title">Version History</p>
      </div>
      {loading && !versions ? (
        <div className="flex items-center gap-2 py-2 tf-meta">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          Loading versions...
        </div>
      ) : jobVersions.length === 0 ? (
        <p className="py-2 tf-meta">No versions recorded for this job.</p>
      ) : (
        <div className="space-y-2.5">
          {jobVersions.map((version) => {
            const rawStatus = version.status || '';
            const versionStatus = getDisplayStatus(
              rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1).toLowerCase(),
              version.current_version,
            );
            const versionStatusConfig = getStatusConfig(versionStatus);
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
            const methodConfig = detail ? getCreationMethodConfig(detail.creation_method) : null;
            const experienceText = detail
              ? formatJdExperience({
                  jobLevel: detail.job_level || detail.experience_level,
                  experienceMin: detail.experience_min,
                  experienceMax: detail.experience_max,
                })
              : '';
            const locationText =
              detail?.location
              || (detail?.locations || []).map((loc) => loc?.city).filter(Boolean).join(', ');
            const metaParts = [
              experienceText,
              locationText,
              detail?.employment_type ? formatEmploymentType(detail.employment_type) : '',
              detail?.remote_type ? formatEmploymentType(detail.remote_type) : '',
            ].filter(Boolean);

            const scoredByLoaded = !!versionScoredBy && Object.prototype.hasOwnProperty.call(versionScoredBy, version.id);
            const scoredByInfo = versionScoredBy?.[version.id];

            return (
              <div {...((onCardClick) ? clickableProps : {})}
                key={version.id}
                onClick={onCardClick ? () => onCardClick(version.id) : undefined}
                className={`relative rounded-lg border p-3 transition-colors ${
                  onCardClick ? 'cursor-pointer' : ''
                } ${
                  version.isLatest
                    ? 'border-brand-blue/30 bg-brand-blue/[0.03] hover:bg-brand-blue/[0.05] dark:border-brand-blue/40 dark:bg-brand-blue/[0.06]'
                    : 'border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800/50'
                }`}
              >
                {renderAction && (
                  <div
                    className="absolute top-2 right-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {renderAction(versionJob)}
                  </div>
                )}

                {/* Version + status badges */}
                <div className="flex flex-wrap items-center gap-1.5 mb-1.5 pr-8">
                  <span className="px-2 py-0.5 rounded-md text-xs font-semibold text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20 dark:bg-brand-blue/20 dark:text-blue-300 dark:ring-brand-blue/35">
                    v{version.version_number ?? 1}
                  </span>
                  {version.isLatest && (
                    <span className="px-1.5 py-0.5 rounded-md text-2xs font-semibold uppercase tracking-wide text-white bg-brand-blue ring-1 ring-white/10">
                      Latest
                    </span>
                  )}
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${versionStatusConfig.bg} ${versionStatusConfig.text} border ${versionStatusConfig.border}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${versionStatusConfig.dot}`} />
                    {versionStatus}
                  </span>
                  {methodConfig && (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${methodConfig.bg} ${methodConfig.text} border ${methodConfig.border}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${methodConfig.dot}`} />
                      {methodConfig.label}
                    </span>
                  )}
                </div>

                {/* Title */}
                <Link
                  href={versionHref(version.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="block text-sm font-medium text-gray-900 dark:text-slate-100 hover:text-brand-blue hover:underline truncate mb-1"
                  title={version.title || detail?.title || ''}
                >
                  {version.title || detail?.title || '—'}
                </Link>

                {/* Experience / location / work mode */}
                {metaParts.length > 0 && (
                  <p className="tf-meta truncate mb-1.5">
                    {metaParts.join(' · ')}
                  </p>
                )}

                {/* Scored by + when */}
                {versionScoredBy && (
                  <div className="text-xs mb-1.5">
                    {scoredByInfo ? (
                      <>
                        <div className="text-gray-700 dark:text-slate-300 truncate" title={scoredByInfo.name}>
                          Scored by {scoredByInfo.name}
                        </div>
                        <div className="flex items-center gap-1.5 text-gray-500 dark:text-slate-400">
                          <span>{formatIST(scoredByInfo.scoredAt)}</span>
                        </div>
                      </>
                    ) : (
                      <span className="text-gray-500 dark:text-slate-500">
                        {scoredByLoaded ? 'Not scored yet' : '—'}
                      </span>
                    )}
                  </div>
                )}

                {/* Applicants + posted date footer */}
                <div className="flex items-center justify-between tf-meta">
                  <span className="inline-flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-gray-500 dark:text-slate-500" />
                    {versionApplicants[version.id] ?? '—'}
                  </span>
                  {(version.published_at || detail?.published_at || version.created_at) && (
                    <span>
                      {formatISTDate(version.published_at || detail?.published_at || version.created_at)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
