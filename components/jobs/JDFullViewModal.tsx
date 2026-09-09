'use client';

import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import {
  AlertCircle,
  Briefcase,
  CheckCircle,
  ChevronRight,
  ExternalLink,
  Eye,
  FileText,
  Loader2,
  X,
} from 'lucide-react';
import { jdService, type JDResponse } from '@/lib/services/jdService';
import { formatJobExperienceText } from '@/lib/utils/jobExperience';
import { usePlanFeatures } from '@/lib/hooks/usePlanFeature';

/**
 * ONE JD, in full, in a dialog.
 *
 * The JD is fetched here by id rather than taken from whatever `Job` the host
 * happens to hold: a list-mapped `Job` carries the handful of fields a card
 * needs, and the fields a recruiter opens a JD to read — the description
 * itself, the recruiter's additional details, the assessment guidance, the
 * per-skill notes — are not among them. `jdService.get` is the same call the
 * Job Details page makes for its own Overview tab.
 *
 * WHAT IT SHOWS is that Overview tab's job-description column, section for
 * section: the description, Additional Details, the Internal Recruiter Notes /
 * Assessment Guidance pair, and the collapsible Extracted Data Summary with
 * its Skills & Requirements and Requirements halves. Same fields, same order,
 * same empty-state wording, and the same derivations — the label helpers and
 * the `JDResponse` → display mapping below are the Job Details page's own,
 * copied rather than re-invented so the two surfaces cannot disagree about one
 * JD. Nothing outside that column is here: the page's identity header, its
 * Quick Actions and its activity panels belong to the page.
 *
 * The shell is the Version History modal's: the same overlay, the same
 * `max-h-[calc(100dvh-...)]` box that never grows past the viewport on any
 * screen, a header that stays put with the close action in it, and one
 * scrolling body under it. Escape closes it, as does the overlay.
 */
export default function JDFullViewModal({
  jdId,
  jdTitle,
  onClose,
  onOpenFullPage,
}: {
  jdId: string;
  /** Shown in the header until the record lands, so the dialog opens named. */
  jdTitle?: string;
  onClose: () => void;
  /** Optional route to the JD's own page, offered in the footer when given. */
  onOpenFullPage?: () => void;
}) {
  const { hasPlanFeature } = usePlanFeatures();
  const [jd, setJd] = useState<JDResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /* Collapsed on open, as it is on the Job Details page — the summary is the
     structured cross-check, read after the description rather than with it. */
  const [showExtractedSummary, setShowExtractedSummary] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchJd = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await jdService.get(jdId);
        if (!cancelled) setJd(response);
      } catch (err) {
        console.error('[TalentFlow] Failed to load JD for full view:', err);
        const message = err instanceof Error ? err.message : '';
        if (!cancelled) setError(message || 'Failed to load job description');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    fetchJd();
    /* The id can change under an open dialog — the host reopens it for another
       JD — so a reply for the previous id must not paint over the new one. */
    return () => {
      cancelled = true;
    };
  }, [jdId]);

  /* Lock the page behind while the dialog is up, so a wheel over the overlay
     does not scroll the host page out from under it.

     Mount-scoped, deliberately separate from the Escape listener below: hosts
     pass `onClose` as an inline arrow, so an effect keyed on it re-runs on
     every host render — and a re-run would capture the `hidden` it set itself
     as the value to restore, leaving the page locked after the dialog closed. */
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  /* ---- Read-only label helpers for the Extracted Data Summary dropdown ----
     JobDetailView's own, verbatim, so a code the Job Details page prints as
     "Field-based / Travel" does not read as "Field Based" here. */
  const prettifyCode = (value?: string): string =>
    (value || '')
      .replace(/[_-]+/g, ' ')
      .trim()
      .replace(/\b\w/g, c => c.toUpperCase());

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

  /* The Job Details page's own JDResponse → view mapping for the fields this
     column reads: the two skill lists, their per-skill notes, the single
     internal comment as the one-item list the notes card renders, and the
     experience line built by the shared formatter. */
  const mustHaveSkills = jd?.must_have_skills || [];
  const niceToHaveSkills = jd?.nice_to_have_skills || [];
  const mustHaveComments = jd?.must_have_comments || [];
  const niceToHaveComments = jd?.nice_to_have_comments || [];
  const internalRecruiterComments = jd?.internal_comments ? [jd.internal_comments] : [];
  const experienceText = jd
    ? formatJobExperienceText({
        jobLevel: jd.job_level || jd.experience_level,
        experienceMin: jd.experience_min,
        experienceMax: jd.experience_max,
      })
    : undefined;

  const hasAnyExtractedData =
    mustHaveSkills.length > 0 || niceToHaveSkills.length > 0 ||
    mustHaveComments.length > 0 || niceToHaveComments.length > 0 ||
    !!experienceText || !!jd?.industry_type ||
    !!jd?.employment_type || !!jd?.remote_type;

  return (
    <div
      className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] max-w-[95vw] sm:max-w-3xl w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Job Description"
      >
        {/* Header — stays put while the body scrolls, so the close action is
            reachable from anywhere in a long JD. */}
        <div className="flex-shrink-0 flex items-start justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-slate-700/60">
          <div className="flex items-center gap-3 min-w-0">
            <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex-shrink-0">
              <Briefcase className="w-4 h-4 text-brand-blue" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50 tracking-tight">
                Job Description
              </h2>
              <p className="text-sm text-gray-600 dark:text-slate-400 truncate">
                {jd?.title || jdTitle || 'Loading…'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-500 dark:text-slate-500 hover:text-brand-blue hover:bg-brand-blue/5 rounded-md transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body — the one scrolling region, so the dialog is bounded by the
            viewport whatever the JD's length. */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5">
          {isLoading ? (
            <div className="py-12 flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-brand-blue animate-spin" />
            </div>
          ) : error ? (
            <div className="py-10 text-center">
              <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          ) : !jd ? (
            <div className="py-10 text-center">
              <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500 dark:text-slate-400">
                This job description could not be found.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Complete Job Description */}
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 overflow-hidden">
                <div className="p-4 sm:p-5">
                  <div className="space-y-4 sm:space-y-5">
                    {jd.description ? (
                      <div>
                        <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-50 mb-3">
                          Job Description
                        </h2>
                        <div className="h-px bg-gray-200 dark:bg-slate-700 mb-3"></div>
                        {/* The same three passes the Job Details page makes
                            over the stored text: an extractor that found no
                            certifications still writes the heading, and an
                            empty "Certifications: None" section is noise in a
                            JD being read rather than edited. */}
                        <div className="markdown-content prose prose-sm max-w-none text-gray-700 dark:text-slate-300">
                          <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{jd.description
                            .replace(/#+\s*Certifications[\s\S]*?(?=\n#|\n\n#|$)/gi, (match) =>
                              match.toLowerCase().includes('none') || match.toLowerCase().includes('not required') || match.toLowerCase().includes('n/a') || match.trim().match(/^#+\s*Certifications\s*$/im) ? '' : match
                            )
                            .replace(/\*\*Certifications\*\*[:\s]*(?:None|None required|N\/A|Not required)\.?\s*/gi, '')
                            .replace(/Certifications[:\s]*(?:None|None required|N\/A|Not required)\.?\s*/gi, '')
                          }</ReactMarkdown>
                        </div>
                      </div>
                    ) : (
                      <div className="text-gray-500 dark:text-slate-500 italic text-center py-8">
                        No job description provided
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* JD22 - Additional Details. Shown only where the recruiter
                  filled it in, as on the Job Details page. */}
              {jd.additional_details && (
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-sm font-medium text-gray-900 dark:text-slate-50">Additional Details</h3>
                    <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded">
                      Visible to candidates
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-slate-400 whitespace-pre-wrap">{jd.additional_details}</p>
                </div>
              )}

              {/* Internal Recruiter Notes & Assessment Guidance - Side by Side.
                  One column below `sm`, where the dialog is too narrow for two;
                  the pair is otherwise the page's. */}
              <div className={`grid grid-cols-1 ${hasPlanFeature('assessment') ? 'sm:grid-cols-2' : ''} gap-4`}>
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 p-4">
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

                {/* Assessment Guidance - only if plan includes assessment */}
                {hasPlanFeature('assessment') && (
                  <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 p-4">
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

              {/* Extracted Data Summary - Collapsible */}
              {hasAnyExtractedData && (
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5">
                  {/* Header toggle */}
                  <button
                    type="button"
                    onClick={() => setShowExtractedSummary(!showExtractedSummary)}
                    className="w-full bg-brand-blue/[0.04] px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-slate-700/60 flex items-center justify-between hover:bg-brand-blue/[0.07] transition-colors rounded-t-xl"
                  >
                    <div className="text-left">
                      <h3 className="text-sm sm:text-lg text-gray-900 dark:text-slate-50 flex items-center gap-2 flex-wrap">
                        📊 Extracted Data Summary
                        <Eye className="w-5 h-5 text-gray-500 dark:text-slate-500" />
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">Click to {showExtractedSummary ? 'hide' : 'view'} structured requirements</p>
                    </div>
                    <div className={`transform transition-transform ${showExtractedSummary ? 'rotate-180' : ''}`}>
                      <ChevronRight className="w-5 h-5 text-gray-500 dark:text-slate-500 rotate-90" />
                    </div>
                  </button>

                  {showExtractedSummary && (
                    <>
                      {/* Skills & Comments */}
                      <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-slate-700">
                        <h3 className="text-sm sm:text-base text-gray-900 dark:text-slate-50 mb-3 sm:mb-4">Skills &amp; Requirements</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                          {/* Left: Skills */}
                          <div className="space-y-4 sm:space-y-6">
                            <div>
                              <h4 className="text-sm text-gray-700 dark:text-slate-300 mb-3">Must-Have Skills ({mustHaveSkills.length})</h4>
                              {mustHaveSkills.length > 0 ? (
                                <div className="space-y-2">
                                  {mustHaveSkills.map((skill, index) => (
                                    <div key={index} className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
                                      <CheckCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                                      {skill}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-gray-500 dark:text-slate-500 italic text-sm">None</p>
                              )}
                            </div>
                            <div>
                              <h4 className="text-sm text-gray-700 dark:text-slate-300 mb-3">Nice-to-Have Skills ({niceToHaveSkills.length})</h4>
                              {niceToHaveSkills.length > 0 ? (
                                <div className="space-y-2">
                                  {niceToHaveSkills.map((skill, index) => (
                                    <div key={index} className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400">
                                      <CheckCircle className="w-4 h-4 text-gray-800 dark:text-slate-100 flex-shrink-0" />
                                      {skill}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-gray-500 dark:text-slate-500 italic text-sm">None</p>
                              )}
                            </div>
                          </div>

                          {/* Right: Comments */}
                          <div className="space-y-4 sm:space-y-6">
                            <div>
                              <h4 className="text-sm text-gray-700 dark:text-slate-300 mb-3">Must-Have Additional Requirements ({mustHaveComments.length})</h4>
                              {mustHaveComments.length > 0 ? (
                                <div className="space-y-2">
                                  {mustHaveComments.map((comment, index) => (
                                    <div key={index} className="flex items-start gap-2 text-sm text-gray-700 dark:text-slate-300">
                                      <CheckCircle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                                      <span>{comment}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-gray-500 dark:text-slate-500 italic text-sm">None</p>
                              )}
                            </div>
                            <div>
                              <h4 className="text-sm text-gray-700 dark:text-slate-300 mb-3">Nice-to-Have Additional Requirements ({niceToHaveComments.length})</h4>
                              {niceToHaveComments.length > 0 ? (
                                <div className="space-y-2">
                                  {niceToHaveComments.map((comment, index) => (
                                    <div key={index} className="flex items-start gap-2 text-sm text-gray-600 dark:text-slate-400">
                                      <CheckCircle className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                                      <span>{comment}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-gray-500 dark:text-slate-500 italic text-sm">None</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Requirements Grid */}
                      <div className="p-4 sm:p-6">
                        <h3 className="text-sm sm:text-base text-gray-900 dark:text-slate-50 mb-3 sm:mb-4">Requirements</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                          <div className="bg-gray-50 dark:bg-slate-800/50 p-3 sm:p-4 rounded-lg">
                            <h4 className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 mb-1 sm:mb-2">Experience</h4>
                            <p className="text-sm sm:text-base text-gray-900 dark:text-slate-50">{experienceText || 'Not specified'}</p>
                          </div>
                          {/* No Education tile, as on the Job Details page: the
                              requirement is stated in the Additional
                              Requirements above, in the recruiter's own words
                              and with the field of study a bare level throws
                              away. */}
                          {jd.industry_type && (
                            <div className="bg-gray-50 dark:bg-slate-800/50 p-3 sm:p-4 rounded-lg">
                              <h4 className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 mb-1 sm:mb-2">Industry Type</h4>
                              <p className="text-sm sm:text-base text-gray-900 dark:text-slate-50">{prettifyCode(jd.industry_type)}</p>
                            </div>
                          )}
                          <div className="bg-gray-50 dark:bg-slate-800/50 p-3 sm:p-4 rounded-lg">
                            <h4 className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 mb-1 sm:mb-2">Employment Type</h4>
                            <p className="text-sm sm:text-base text-gray-900 dark:text-slate-50">{employmentTypeLabel(jd.employment_type)}</p>
                          </div>
                          <div className="bg-gray-50 dark:bg-slate-800/50 p-3 sm:p-4 rounded-lg">
                            <h4 className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 mb-1 sm:mb-2">Work Mode</h4>
                            <p className="text-sm sm:text-base text-gray-900 dark:text-slate-50">{workModeLabel(jd.remote_type)}</p>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer — the way out, and the way through to the JD's own page where
            the host offers one (which is where View JD used to go). */}
        <div className="flex-shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-t border-gray-100 dark:border-slate-700/60">
          {onOpenFullPage && jd ? (
            <button
              type="button"
              onClick={onOpenFullPage}
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm text-brand-blue hover:text-brand-blue-2 transition-colors"
            >
              Open full JD page
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-200 transition-colors hover:bg-gray-50 dark:hover:bg-slate-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
