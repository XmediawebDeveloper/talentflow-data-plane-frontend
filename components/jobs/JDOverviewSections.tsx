'use client';

import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { FileText, Lock } from 'lucide-react';
import type { JDResponse } from '@/lib/services/jdService';
import { formatJobExperienceText, formatExperienceLevelName } from '@/lib/utils/jobExperience';
import { criterionScoringLabel, requirementBadge } from '@/lib/utils/scoringCriteria';
import { usePlanLock } from '@/lib/hooks/usePlanFeature';
import { PLAN_LOCKED_MESSAGE } from '@/lib/types/planFeatures';
import ExtractedDataSummary from '@/components/jobs/ExtractedDataSummary';

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
  'tf-card';

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
  const { isPlanLocked } = usePlanLock();
  const assessmentLocked = isPlanLocked('assessment');

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
              <h2 className="tf-row-title mb-3">
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
            <h3 className="tf-row-name">Additional Details</h3>
            <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded">
              Visible to candidates
            </span>
          </div>
          <p className="tf-body-secondary whitespace-pre-wrap">{jd.additional_details}</p>
        </div>
      )}

      {/* Internal Recruiter Notes & Assessment Guidance — side by side, as on
          the page. One column below `sm`. The guidance card always renders —
          greyed with the plan message when the plan lacks assessments — so the
          layout never shifts once plan features load. */}
      <div className="tf-grid-2">
        <div className={`${CARD} p-4`}>
          <h3 className="tf-row-name mb-3">Internal Recruiter Notes</h3>
          <div className="tf-body-secondary space-y-2">
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

        {assessmentLocked ? (
          <div
            aria-disabled="true"
            title={PLAN_LOCKED_MESSAGE}
            className={`${CARD} p-4 cursor-not-allowed opacity-60`}
          >
            <h3 className="flex items-center gap-1.5 text-sm font-medium text-gray-400 dark:text-slate-500 mb-3">
              Assessment Guidance <Lock className="w-3 h-3" />
            </h3>
            <p className="tf-body-muted italic">{PLAN_LOCKED_MESSAGE}</p>
          </div>
        ) : (
          <div className={`${CARD} p-4`}>
            <h3 className="tf-row-name mb-3">Assessment Guidance</h3>
            <div className="tf-body-secondary">
              {jd.assessment_guidance ? (
                <p className="whitespace-pre-wrap">{jd.assessment_guidance}</p>
              ) : (
                <p className="text-gray-500 dark:text-slate-500 italic">No assessment guidance provided</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Extracted Data Summary - the JD wizard Review step's format, the same
          component the Job Details page renders. Recruiters reviewing an
          assessment were seeing only the JD prose here and had to open the full
          JD page to check the structured requirements. The JD full-view dialog
          (showScoringDetail off) leaves out the scoring reading: the
          Essential / Preferred badges, the Location tile, the per-criterion
          lines and the scoring answers. */}
      {hasAnyExtractedData && (
        <ExtractedDataSummary
          mustHaveSkills={mustHaveSkills}
          niceToHaveSkills={niceToHaveSkills}
          mustHaveComments={mustHaveComments}
          niceToHaveComments={niceToHaveComments}
          showRequirementBadges={showScoringDetail}
          experience={experienceText || null}
          experienceLevelOnly={experienceText ? null : formatExperienceLevelName(jd?.job_level || jd?.experience_level)}
          experienceNote={showScoringDetail ? requirementBadge(jd.experience_mandatory) : undefined}
          industry={jd.industry_type ? prettifyCode(jd.industry_type) : null}
          industryNote={showScoringDetail && jd.industry_type
            ? criterionScoringLabel(jd.industry_type, jd.industry_mandatory, { isIndustry: true })
            : undefined}
          location={showScoringDetail ? jd.location : null}
          locationNote={showScoringDetail && jd.location ? criterionScoringLabel(jd.location, jd.location_mandatory) : undefined}
          employmentType={employmentTypeLabel(jd.employment_type)}
          workMode={workModeLabel(jd.remote_type)}
          scoring={showScoringDetail ? {
            allowOverqualified: jd.allow_overqualified,
            jobHoppingEnabled: jd.job_hopping_enabled,
            overqualifiedNoNote: 'Experience more than 3 years above the maximum fails Experience',
          } : undefined}
          aiExtracted={jd.creation_method === 'ai_generated'}
        />
      )}

    </div>
  );
}
