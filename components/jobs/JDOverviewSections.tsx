'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { ChevronRight, Eye, CheckCircle, FileText } from 'lucide-react';
import type { JDResponse } from '@/lib/services/jdService';
import { formatJobExperienceText } from '@/lib/utils/jobExperience';
import { criterionScoringLabel, requirementBadge } from '@/lib/utils/scoringCriteria';
import { usePlanFeatures } from '@/lib/hooks/usePlanFeature';

/**
 * ONE JD's Overview sections, exactly as the Job Details page lays them out.
 *
 * The job-description column of that page, section for section and card for
 * card: the Complete Job Description, Additional Details, the Internal
 * Recruiter Notes / Assessment Guidance pair, and the collapsible Extracted
 * Data Summary with its Skills & Requirements, Requirements and Scoring
 * Preferences blocks.
 *
 * Held here because three surfaces were drawing this column from the same
 * `JDResponse` and drawing it differently — the Job Details page itself, the
 * JD full-view dialog, and the View JD tab on an assessment. The tab was the
 * odd one: every section lived in ONE card rather than the page's card per
 * section, Additional Details lost its card and its "Visible to candidates"
 * badge, Assessment Guidance was a tinted box instead of half of a pair, and
 * Internal Recruiter Notes were missing altogether. Same JD, three readings.
 *
 * READ-ONLY. There is nothing to edit here and no callback that could: the
 * component takes a record and renders it.
 *
 * Nothing outside that column belongs here — the page's identity header, its
 * Quick Actions and its activity panels are the page's, and a host that wants
 * a title above these sections draws its own.
 */

/** The label helpers, JobDetailView's own, so a code the Job Details page
 *  prints as "Field-based / Travel" does not read as "Field Based" here. */
const prettifyCode = (value?: string): string =>
  (value || '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

const employmentTypeLabel = (value?: string): string => {
  switch (value) {
    case 'full_time': return 'Full Time';
    case 'part_time': return 'Part Time';
    case 'contract': return 'Contract';
    case 'internship': return 'Internship';
    case 'temporary': return 'Temporary / Seasonal';
    default: return value ? prettifyCode(value) : 'Not specified';
  }
};

const workModeLabel = (value?: string): string => {
  switch (value) {
    case 'onsite': return 'Onsite';
    case 'remote': return 'Remote';
    case 'hybrid': return 'Hybrid';
    case 'field_based': return 'Field-based / Travel';
    default: return value ? prettifyCode(value) : 'Not specified';
  }
};

/** The page's own card shell, so every section here sits in the same box. */
const CARD =
  'bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5';

/**
 * The three passes the Job Details page makes over the stored description: an
 * extractor that found no certifications still writes the heading, and an
 * empty "Certifications: None" section is noise in a JD being read rather
 * than edited.
 */
const stripEmptyCertifications = (description: string): string =>
  description
    .replace(/#+\s*Certifications[\s\S]*?(?=\n#|\n\n#|$)/gi, (match) =>
      match.toLowerCase().includes('none')
      || match.toLowerCase().includes('not required')
      || match.toLowerCase().includes('n/a')
      || match.trim().match(/^#+\s*Certifications\s*$/im)
        ? ''
        : match,
    )
    .replace(/\*\*Certifications\*\*[:\s]*(?:None|None required|N\/A|Not required)\.?\s*/gi, '')
    .replace(/Certifications[:\s]*(?:None|None required|N\/A|Not required)\.?\s*/gi, '');

export interface JDOverviewSectionsProps {
  jd: JDResponse;
  /**
   * The scoring-aware reading of the structured data: the Essential /
   * Preferred badges under each requirement heading, the Location tile, the
   * per-criterion scoring lines, and the Scoring Preferences block.
   *
   * On by default, because that is what the Job Details page shows. The JD
   * full-view dialog is the one caller that turns it off — it is a quick read
   * of the description, not a review of how a resume will be graded, and it
   * has never carried those.
   */
  showScoringDetail?: boolean;
}

export default function JDOverviewSections({
  jd,
  showScoringDetail = true,
}: JDOverviewSectionsProps) {
  const { hasPlanFeature } = usePlanFeatures();
  /* Collapsed on open, as it is on the Job Details page — the summary is the
     structured cross-check, read after the description rather than with it. */
  const [showExtractedSummary, setShowExtractedSummary] = useState(false);

  const mustHaveSkills = jd?.must_have_skills || [];
  const niceToHaveSkills = jd?.nice_to_have_skills || [];
  const mustHaveComments = jd?.must_have_comments || [];
  const niceToHaveComments = jd?.nice_to_have_comments || [];
  /* The single stored internal comment, as the one-item list the notes card
     renders — the page's own mapping. */
  const internalRecruiterComments = jd?.internal_comments ? [jd.internal_comments] : [];
  const experienceText = formatJobExperienceText({
    jobLevel: jd?.job_level || jd?.experience_level,
    experienceMin: jd?.experience_min,
    experienceMax: jd?.experience_max,
  });

  const hasAnyExtractedData = Boolean(
    mustHaveSkills.length || niceToHaveSkills.length ||
    mustHaveComments.length || niceToHaveComments.length ||
    experienceText || jd?.industry_type ||
    jd?.employment_type || jd?.remote_type,
  );

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Complete Job Description */}
      <div className={`${CARD} overflow-hidden`}>
        <div className="p-4 sm:p-5">
          {jd.description ? (
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-50 mb-3">
                Job Description
              </h2>
              <div className="h-px bg-gray-200 dark:bg-slate-700 mb-3" />
              <div className="markdown-content prose prose-sm max-w-none text-gray-700 dark:text-slate-300">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                  {stripEmptyCertifications(jd.description)}
                </ReactMarkdown>
              </div>
            </div>
          ) : (
            <div className="text-gray-500 dark:text-slate-500 italic text-center py-8">
              No job description provided
            </div>
          )}
        </div>
      </div>

      {/* JD22 - Additional Details. Shown only where the recruiter filled it
          in, as on the Job Details page, and carrying the same green
          "Visible to candidates" badge — the one thing that separates it from
          the internal notes below. */}
      {jd.additional_details && (
        <div className={`${CARD} p-4`}>
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-sm font-medium text-gray-900 dark:text-slate-50">Additional Details</h3>
            <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded">
              Visible to candidates
            </span>
          </div>
          <p className="text-sm text-gray-600 dark:text-slate-400 whitespace-pre-wrap">{jd.additional_details}</p>
        </div>
      )}

      {/* Internal Recruiter Notes & Assessment Guidance — side by side, as on
          the page. One column below `sm`, and one column throughout where the
          plan has no assessment feature and the pair is a single card. */}
      <div className={`grid grid-cols-1 ${hasPlanFeature('assessment') ? 'sm:grid-cols-2' : ''} gap-4`}>
        <div className={`${CARD} p-4`}>
          <h3 className="text-sm font-medium text-gray-900 dark:text-slate-50 mb-3">Internal Recruiter Notes</h3>
          <div className="text-sm text-gray-600 dark:text-slate-400 space-y-2">
            {internalRecruiterComments.length > 0 ? (
              <ul className="list-disc list-inside space-y-1">
                {internalRecruiterComments.map((note, index) => (
                  <li key={index}>{note}</li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500 dark:text-slate-500 italic">No internal notes added</p>
            )}
          </div>
        </div>

        {hasPlanFeature('assessment') && (
          <div className={`${CARD} p-4`}>
            <h3 className="text-sm font-medium text-gray-900 dark:text-slate-50 mb-3">Assessment Guidance</h3>
            <div className="text-sm text-gray-600 dark:text-slate-400">
              {jd.assessment_guidance ? (
                <p className="whitespace-pre-wrap">{jd.assessment_guidance}</p>
              ) : (
                <p className="text-gray-500 dark:text-slate-500 italic">No assessment guidance provided</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Extracted Data Summary — collapsible, mirroring the Job Details
          page. Recruiters reviewing an assessment were seeing only the
          JD prose here and had to open the full JD page to check the
          structured requirements the questions were generated from. */}
      {hasAnyExtractedData && (
        <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5">
          <button
            onClick={() => setShowExtractedSummary(!showExtractedSummary)}
            className="w-full bg-brand-blue/[0.04] px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 flex items-center justify-between hover:bg-brand-blue/[0.07] transition-colors rounded-t-xl"
          >
            <div className="text-left">
              <h3 className="text-sm sm:text-lg text-gray-900 flex items-center gap-2 flex-wrap">
                📊 Extracted Data Summary
                <Eye className="w-5 h-5 text-gray-500" />
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Click to {showExtractedSummary ? 'hide' : 'view'} structured requirements
              </p>
            </div>
            <div className={`transform transition-transform ${showExtractedSummary ? 'rotate-180' : ''}`}>
              <ChevronRight className="w-5 h-5 text-gray-500 rotate-90" />
            </div>
          </button>

          {showExtractedSummary && (
            <>
              {/* Skills & Comments */}
              <div className="p-4 sm:p-6 border-b border-gray-200">
                <h3 className="text-sm sm:text-base text-gray-900 mb-3 sm:mb-4">Skills &amp; Requirements</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  <div className="space-y-4 sm:space-y-6">
                    <div>
                      <h4 className="text-sm text-gray-700 mb-3">Must-Have Skills ({mustHaveSkills.length})</h4>
                      {mustHaveSkills.length > 0 ? (
                        <div className="space-y-2">
                          {mustHaveSkills.map((skill, index) => (
                            <div key={`ed-mh-${index}`} className="flex items-center gap-2 text-sm text-gray-700">
                              <CheckCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                              {skill}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-gray-500 italic text-sm">None</p>
                      )}
                    </div>
                    <div>
                      <h4 className="text-sm text-gray-700 mb-3">Nice-to-Have Skills ({niceToHaveSkills.length})</h4>
                      {niceToHaveSkills.length > 0 ? (
                        <div className="space-y-2">
                          {niceToHaveSkills.map((skill, index) => (
                            <div key={`ed-nh-${index}`} className="flex items-center gap-2 text-sm text-gray-600">
                              <CheckCircle className="w-4 h-4 text-gray-800 flex-shrink-0" />
                              {skill}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-gray-500 italic text-sm">None</p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4 sm:space-y-6">
                    <div>
                      {/* Labelled Essential/Preferred: Education has no tile of
                          its own, so which list a degree lands in is the only
                          place its Required status is visible. */}
                      <h4 className="text-sm text-gray-700 mb-3">
                        Must-Have Additional Requirements ({mustHaveComments.length})
                        {/* See JobDetailView: the badge is a scoring claim, so it
                            only appears when there are lines for it to apply to. */}
                        {showScoringDetail && mustHaveComments.length > 0 && (
                          <span className="ml-2 text-xs font-normal text-gray-500">✓ Required (Essential)</span>
                        )}
                      </h4>
                      {mustHaveComments.length > 0 ? (
                        <div className="space-y-2">
                          {mustHaveComments.map((comment, index) => (
                            <div key={`ed-mhc-${index}`} className="flex items-start gap-2 text-sm text-gray-700">
                              <CheckCircle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                              <span>{comment}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-gray-500 italic text-sm">None</p>
                      )}
                    </div>
                    <div>
                      <h4 className="text-sm text-gray-700 mb-3">
                        Nice-to-Have Additional Requirements ({niceToHaveComments.length})
                        {showScoringDetail && niceToHaveComments.length > 0 && (
                          <span className="ml-2 text-xs font-normal text-gray-500">○ Preferred</span>
                        )}
                      </h4>
                      {niceToHaveComments.length > 0 ? (
                        <div className="space-y-2">
                          {niceToHaveComments.map((comment, index) => (
                            <div key={`ed-nhc-${index}`} className="flex items-start gap-2 text-sm text-gray-600">
                              <CheckCircle className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                              <span>{comment}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-gray-500 italic text-sm">None</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Requirements Grid */}
              <div className="p-4 sm:p-6">
                <h3 className="text-sm sm:text-base text-gray-900 mb-3 sm:mb-4">Requirements</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                  <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                    <h4 className="text-xs sm:text-sm text-gray-600 mb-1 sm:mb-2">Experience</h4>
                    <p className="text-sm sm:text-base text-gray-900">{experienceText || 'Not specified'}</p>
                    {showScoringDetail && experienceText && (
                      <p className="text-xs text-gray-500 mt-1">{requirementBadge(jd.experience_mandatory)}</p>
                    )}
                  </div>
                  {/* Education tile REMOVED 2026-08-21. Same Requirements grid
                      as JobDetailView, same reason: education is a line inside
                      the Must-Have / Nice-to-Have Additional Requirements shown
                      directly above, so a tile here repeated it. */}
                  {jd.industry_type && (
                    <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                      <h4 className="text-xs sm:text-sm text-gray-600 mb-1 sm:mb-2">Industry Type</h4>
                      <p className="text-sm sm:text-base text-gray-900">{prettifyCode(jd.industry_type)}</p>
                      {/* See JobDetailView: "Others" is never scored. */}
                      {showScoringDetail && (
                        <p className="text-xs text-gray-500 mt-1">{criterionScoringLabel(jd.industry_type, jd.industry_mandatory, { isIndustry: true })}</p>
                      )}
                    </div>
                  )}
                  {showScoringDetail && jd.location && (
                    <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                      <h4 className="text-xs sm:text-sm text-gray-600 mb-1 sm:mb-2">Location</h4>
                      <p className="text-sm sm:text-base text-gray-900">{jd.location}</p>
                      <p className="text-xs text-gray-500 mt-1">{criterionScoringLabel(jd.location, jd.location_mandatory)}</p>
                    </div>
                  )}
                  <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                    <h4 className="text-xs sm:text-sm text-gray-600 mb-1 sm:mb-2">Employment Type</h4>
                    <p className="text-sm sm:text-base text-gray-900">{employmentTypeLabel(jd.employment_type)}</p>
                  </div>
                  <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                    <h4 className="text-xs sm:text-sm text-gray-600 mb-1 sm:mb-2">Work Mode</h4>
                    <p className="text-sm sm:text-base text-gray-900">{workModeLabel(jd.remote_type)}</p>
                  </div>
                </div>
              </div>

              {/* Scoring Preferences - recruiter answers that change how a resume
                  is graded against this JD but appear nowhere else once it is
                  published. Same block as the JD view and the scored-resume View
                  JD tab, so all three read the same. */}
              {showScoringDetail && (
              <div className="p-4 sm:p-6 border-b border-gray-200">
                <h3 className="text-sm sm:text-base text-gray-900 mb-3 sm:mb-4">Scoring Preferences</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                    <h4 className="text-xs sm:text-sm text-gray-600 mb-1 sm:mb-2">Allow Over-Qualified Candidates</h4>
                    <p className="text-sm sm:text-base text-gray-900">
                      {jd.allow_overqualified === null || jd.allow_overqualified === undefined
                        ? 'Not specified'
                        : jd.allow_overqualified ? 'Yes' : 'No'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {jd.allow_overqualified === false
                        ? 'Experience well above the range scores lower'
                        : 'Extra relevant experience is not penalised'}
                    </p>
                  </div>
                  <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                    <h4 className="text-xs sm:text-sm text-gray-600 mb-1 sm:mb-2">Job Hopping</h4>
                    <p className="text-sm sm:text-base text-gray-900">
                      {jd.job_hopping_enabled === null || jd.job_hopping_enabled === undefined
                        ? 'Not specified'
                        : jd.job_hopping_enabled ? 'Evaluated' : 'Not evaluated'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {jd.job_hopping_enabled === false
                        ? 'Tenure pattern is not scored for this role'
                        : 'Scored as a Preferred criterion'}
                    </p>
                  </div>
                </div>
              </div>
              )}
            </>
          )}
        </div>
      )}

    </div>
  );
}
