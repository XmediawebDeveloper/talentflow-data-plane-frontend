import { X, Clock, Users, Brain, Code, BarChart, Sparkles, Shield, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import LanguageLogo, { logoLabelForId } from '@/components/assessments/LanguageLogo';
import { VersionPill } from '@/components/assessments/AllAssessmentsTable';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { parseAssessmentTitle } from '@/lib/utils/assessmentUtils';

interface AssessmentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  assessment: any;
  /** Set by hosts that open the preview from a job (AI Talent Match's Actions
   *  menu): adds the assessment version, the job and its job version under the
   *  title, and a Rounds row saying which of HR / Technical / Coding this
   *  assessment configures — including that a round is NOT configured. Other
   *  hosts omit it and the preview reads exactly as before. */
  jobContext?: { jobVersionNumber?: number };
}

/* The rounds an assessment can run — the Rounds chips of
   JobAssessmentVersionPicker / AssessmentPicker. */
const ROUNDS: { key: 'hr' | 'technical' | 'coding'; label: string }[] = [
  { key: 'hr', label: 'HR' },
  { key: 'technical', label: 'Technical' },
  { key: 'coding', label: 'Coding' },
];

export default function AssessmentPreviewModal({ isOpen, onClose, assessment, jobContext }: AssessmentPreviewModalProps) {
  if (!isOpen || !assessment) return null;

  // Extract section data from assessment
  const getSections = () => {
    const sections = [];

    if (assessment.hr_enabled) {
      sections.push({
        name: 'HR',
        percentage: assessment.hr_percentage || 0,
        topics: assessment.hr_topics || [],
        scoringType: 'informational',
      });
    }

    if (assessment.technical_enabled) {
      sections.push({
        name: 'Technical',
        percentage: assessment.technical_percentage || 0,
        topics: assessment.technical_topics || [],
        scoringType: 'scored',
      });
    }

    if (assessment.coding_enabled) {
      sections.push({
        name: 'Coding',
        percentage: assessment.coding_percentage || 0,
        topics: assessment.coding_topics || [],
        languages: assessment.coding_languages || [],
        scoringType: 'scored',
      });
    }

    return sections;
  };

  const sections = getSections();

  return (
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] max-w-[95vw] sm:max-w-lg md:max-w-2xl lg:max-w-4xl w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-slate-50 dark:bg-slate-950 border-b border-gray-100 dark:border-slate-700/60 px-4 sm:px-6 py-3 sm:py-4 flex items-start sm:items-center justify-between gap-3 flex-shrink-0">
          <div className="min-w-0 flex-1 flex items-start sm:items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-5 h-5 text-brand-blue" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h2 className="text-base sm:text-xl font-semibold text-gray-900 dark:text-slate-50 tracking-tight min-w-0 truncate">Assessment Preview</h2>
                <span className="px-2 py-0.5 bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20 rounded text-xs flex items-center gap-1 flex-shrink-0 whitespace-nowrap">
                  <Sparkles className="w-3 h-3" />
                  Configuration View
                </span>
              </div>
              <p className="tf-card-desc">
                Preview of assessment configuration and scoring
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={onClose}
            className="px-2 flex-shrink-0"
            aria-label="Close">
            <X className="w-5 h-5 sm:w-6 sm:h-6" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-6">
          {/* Assessment Summary */}
          <div className="bg-white dark:bg-slate-900 rounded-lg border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm p-4 sm:p-6 mb-4 sm:mb-6">
            <h2 className="tf-section-title mb-3 sm:mb-4 [overflow-wrap:anywhere]">{assessment.title}</h2>
            {jobContext && (() => {
              const assessmentVersion = typeof assessment.version === 'number'
                ? assessment.version
                : parseAssessmentTitle(assessment.title || '').version;
              return (
                <div className="-mt-1 sm:-mt-2 mb-3 sm:mb-4 flex items-center gap-2 flex-wrap min-w-0 tf-card-desc">
                  {assessmentVersion ? <VersionPill kind="assessment" version={assessmentVersion} label="Assessment" /> : null}
                  {assessment.jd_short_id && <JobIdBadge>{assessment.jd_short_id}</JobIdBadge>}
                  {assessment.jd_title && <span className="min-w-0 [overflow-wrap:anywhere]">{assessment.jd_title}</span>}
                  {jobContext.jobVersionNumber ? <VersionPill kind="job" version={jobContext.jobVersionNumber} label="Job" /> : null}
                </div>
              );
            })()}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div className="p-3 sm:p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg flex sm:block items-center justify-between">
                <div className="tf-body sm:mb-1">Total Duration</div>
                <div className="text-lg sm:text-2xl font-semibold text-gray-900 dark:text-slate-50">{assessment.duration_minutes || assessment.duration || 30} min</div>
              </div>
              <div className="p-3 sm:p-4 bg-brand-cyan/5 ring-1 ring-brand-cyan/15 rounded-lg flex sm:block items-center justify-between">
                <div className="text-sm text-brand-cyan sm:mb-1">Sections</div>
                <div className="text-lg sm:text-2xl font-semibold text-gray-900 dark:text-slate-50">{sections.length}</div>
              </div>
              <div className="p-3 sm:p-4 bg-brand-orange/10 rounded-lg flex sm:block items-center justify-between">
                <div className="text-sm text-brand-orange-deep sm:mb-1">Status</div>
                <div className="text-lg sm:text-2xl font-semibold text-gray-900 dark:text-slate-50">
                  {/* The Assessments list maps the backend's lowercase status
                      ('published' / 'draft' / 'closed' / 'archived') into UI
                      labels ('Active' / 'Draft' / 'Completed' / 'Archived')
                      before passing the row here. The preview modal was only
                      checking for the raw backend value, so an Active
                      assessment fell through to "Draft". Resolve via a
                      case-insensitive lookup that handles both forms. */}
                  {(() => {
                    const raw = String(assessment.status || '').toLowerCase();
                    if (raw === 'published' || raw === 'active') return 'Active';
                    if (raw === 'closed' || raw === 'completed') return 'Completed';
                    if (raw === 'archived') return 'Archived';
                    if (raw === 'draft') return 'Draft';
                    return assessment.status || 'Draft';
                  })()}
                </div>
              </div>
            </div>
            {/* Which rounds the saved record turns on — read from its
                `*_enabled` flags, so a coding round is never assumed. */}
            {jobContext && (
              <div className="mt-3 sm:mt-4 flex items-center gap-2 flex-wrap">
                <span className="tf-body">Rounds:</span>
                {ROUNDS.map((round) => {
                  const configured = !!assessment[`${round.key}_enabled`];
                  return (
                    <span
                      key={round.key}
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ring-1 whitespace-nowrap ${
                        configured
                          ? 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20'
                          : 'bg-slate-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 ring-gray-200 dark:ring-slate-700'
                      }`}
                    >
                      {round.label}{configured ? '' : ' · Not configured'}
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* Proctoring Status */}
          {assessment.proctoring_enabled && (
            <div className="bg-brand-blue/5 border border-brand-blue/20 ring-1 ring-brand-blue/10 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6">
              <div className="flex items-start sm:items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 bg-brand-blue/10 rounded-lg flex-shrink-0">
                  <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-brand-blue text-sm sm:text-base">Proctoring Enabled</span>
                    <Video className="w-4 h-4 text-brand-blue flex-shrink-0" />
                  </div>
                  <p className="text-sm text-brand-blue-2">
                    Webcam monitoring, screen recording, and AI cheating prevention active
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Scoring Rules Summary */}
          <div className="bg-slate-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] rounded-lg p-4 sm:p-6 mb-4 sm:mb-6">
            <div className="flex items-start gap-2 sm:gap-3 mb-3 sm:mb-4">
              <BarChart className="w-5 h-5 sm:w-6 sm:h-6 text-brand-blue flex-shrink-0" />
              <div className="min-w-0">
                <h3 className="font-semibold text-gray-900 dark:text-slate-50 text-sm sm:text-base mb-1 tracking-tight">Evaluation & Scoring Logic</h3>
                <p className="tf-body">
                  How candidates will be evaluated when taking this assessment
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
              {/* HR Section Info */}
              {assessment.hr_enabled && (
                <div className="bg-white dark:bg-slate-900 rounded-lg p-3 sm:p-4 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Users className="w-4 h-4 text-brand-blue flex-shrink-0" />
                    <h4 className="tf-subsection-title">HR Section</h4>
                    <span className="ml-auto px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded text-xs font-medium whitespace-nowrap flex-shrink-0">
                      Not Scored
                    </span>
                  </div>
                  <p className="text-xs text-gray-700 dark:text-slate-300">
                    Responses recorded and displayed in reports for review, but <strong>NOT included in PASS/FAIL decision</strong>
                  </p>
                </div>
              )}

              {/* Technical + Coding Info */}
              {(assessment.technical_enabled || assessment.coding_enabled) && (
                <div className="bg-white dark:bg-slate-900 rounded-lg p-3 sm:p-4 border border-brand-cyan/30 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    {assessment.technical_enabled && <Brain className="w-4 h-4 text-brand-blue flex-shrink-0" />}
                    {assessment.coding_enabled && <Code className="w-4 h-4 text-brand-cyan flex-shrink-0" />}
                    <h4 className="tf-subsection-title">
                      {assessment.technical_enabled && assessment.coding_enabled
                        ? 'Technical + Coding'
                        : assessment.technical_enabled
                          ? 'Technical'
                          : 'Coding'}
                    </h4>
                    <span className="ml-auto px-2 py-0.5 bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/20 rounded text-xs font-medium whitespace-nowrap flex-shrink-0">
                      Scored
                    </span>
                  </div>
                  <p className="text-xs text-gray-700 dark:text-slate-300 mb-2">Each question scored 0-10. <strong>Pass requires:</strong></p>
                  <ul className="text-xs text-gray-700 dark:text-slate-300 space-y-1">
                    <li>• ≥70% of questions scoring ≥7 <strong>OR</strong></li>
                    <li>• Section average ≥7.0</li>
                  </ul>
                </div>
              )}
            </div>

            {/* Final Result Logic */}
            <div className="mt-3 sm:mt-4 bg-brand-cyan/10 ring-1 ring-brand-cyan/20 rounded-lg p-2.5 sm:p-3 text-center">
              <span className="text-sm text-brand-cyan">
                <strong>Final Result:</strong> PASS/FAIL determined by{' '}
                {assessment.technical_enabled && assessment.coding_enabled
                  ? 'Technical + Coding sections only'
                  : assessment.technical_enabled
                    ? 'Technical section only'
                    : assessment.coding_enabled
                      ? 'Coding section only'
                      : 'scored sections'}
              </span>
            </div>
          </div>

          {/* Section Details */}
          <div className="space-y-3 sm:space-y-4">
            {sections.map((section, idx) => (
              <div key={idx} className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] rounded-lg p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 mb-3 sm:mb-4">
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    {section.name === 'HR' && <Users className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue flex-shrink-0" />}
                    {section.name === 'Technical' && <Brain className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue flex-shrink-0" />}
                    {section.name === 'Coding' && <Code className="w-4 h-4 sm:w-5 sm:h-5 text-brand-cyan flex-shrink-0" />}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900 dark:text-slate-50 text-sm sm:text-base">{section.name} Section</h3>
                        {section.scoringType === 'informational' ? (
                          <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 ring-1 ring-gray-200 dark:ring-slate-700 rounded text-xs font-medium whitespace-nowrap">
                            Informational Only
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/20 rounded text-xs font-medium whitespace-nowrap">
                            Scored (0-10 scale)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex sm:flex-col items-center sm:items-end gap-2 sm:gap-1 flex-shrink-0">
                    <div className="text-xl sm:text-2xl font-semibold text-brand-blue">{section.percentage}%</div>
                    {section.scoringType === 'scored' && (
                      <span className="text-xs text-brand-cyan">Counts to PASS/FAIL</span>
                    )}
                  </div>
                </div>

                {/* Topics — HR topics arrive as `{text, type, time}` objects
                    while Technical/Coding topics are strings. Resolve to the
                    visible text so we don't trigger React error #31. */}
                {section.topics && section.topics.length > 0 && (
                  <div className="mb-3 sm:mb-4">
                    <div className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Topics Covered:</div>
                    <div className="flex flex-wrap gap-1.5 sm:gap-2">
                      {section.topics.map((topic: any, tidx: number) => (
                        <span key={tidx} className="px-2 sm:px-3 py-0.5 sm:py-1 bg-slate-100 dark:bg-slate-800 tf-body rounded-lg max-w-full [overflow-wrap:anywhere]">
                          {typeof topic === 'string' ? topic : (topic?.text || topic?.name || '')}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Coding Languages */}
                {section.name === 'Coding' && section.languages && section.languages.length > 0 && (
                  <div className="mb-3 sm:mb-4">
                    <div className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Programming Languages:</div>
                    <div className="flex flex-wrap gap-1.5 sm:gap-2">
                      {section.languages.map((lang: string, lidx: number) => (
                        <span key={lidx} className="inline-flex items-center gap-1.5 px-2 sm:px-3 py-0.5 sm:py-1 bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20 rounded-lg text-sm max-w-full [overflow-wrap:anywhere]">
                          <LanguageLogo language={logoLabelForId(lang, lang)} size="sm" />
                          {lang}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Dynamic Generation Note */}
                <div className="bg-slate-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-700/60 rounded-lg p-3 sm:p-4">
                  <div className="text-sm text-gray-800 dark:text-slate-100">
                    <strong>Questions will be generated dynamically</strong> when candidates are assigned to this assessment based on the configured topics and difficulty level.
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
