import { useEffect, useState } from 'react';
import { Clock, Users, Brain, Code, Sparkles, Shield, Layers, Info, Loader2, Star } from 'lucide-react';
import { AppModalFooterButtons } from '@/components/ui/app-modal';
import { assessmentService } from '@/lib/services/assessmentService';
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

/* One look per section: its icon, and the colour of its slice of the
   weightage bar, its dot and its icon box. */
const SECTION_STYLE: Record<string, { icon: typeof Users; bar: string; box: string }> = {
  HR: { icon: Users, bar: 'bg-slate-400 dark:bg-slate-500', box: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300' },
  Technical: { icon: Brain, bar: 'bg-brand-blue', box: 'bg-brand-blue/10 text-brand-blue' },
  Coding: { icon: Code, bar: 'bg-brand-cyan', box: 'bg-brand-cyan/10 text-brand-cyan' },
};

/* A JD skill, as the Assessment Info panel reads them: a string, or a
   `{ name/skill, level/depth }` object. */
type SkillEntry = string | { name?: string; skill?: string; level?: string; depth?: string } | null | undefined;
const skillName = (entry: SkillEntry): string =>
  typeof entry === 'string' ? entry : (entry?.name || entry?.skill || '');
const skillLevel = (entry: SkillEntry): string | null =>
  typeof entry === 'object' && entry ? (entry.level || entry.depth || null) : null;

export default function AssessmentPreviewModal({ isOpen, onClose, assessment, jobContext }: AssessmentPreviewModalProps) {
  // Esc = Cancel (the popup standard, as in AppModal).
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  /* The job's two skill lists, snapshotted on the assessment — the same
     fields the Assessment Info panel shows: `jd_skill_depth` (Must-Have) and
     `jd_nice_to_have_skills` (Nice-to-Have). Some hosts pass a list row
     without them, so the assessment is read once to get them. */
  const passedSkills = assessment && (assessment.jd_skill_depth !== undefined || assessment.jd_nice_to_have_skills !== undefined)
    ? { mustHave: (assessment.jd_skill_depth ?? []) as SkillEntry[], niceToHave: (assessment.jd_nice_to_have_skills ?? []) as SkillEntry[] }
    : null;
  const [fetchedSkills, setFetchedSkills] = useState<{ id: string; mustHave: SkillEntry[]; niceToHave: SkillEntry[] } | { id: string; failed: true } | null>(null);
  const needsFetch = isOpen && !!assessment?.id && !passedSkills;
  useEffect(() => {
    if (!needsFetch) return;
    let cancelled = false;
    const id = assessment.id as string;
    assessmentService.get(id)
      .then(full => {
        if (!cancelled) setFetchedSkills({ id, mustHave: (full.jd_skill_depth ?? []) as SkillEntry[], niceToHave: (full.jd_nice_to_have_skills ?? []) as SkillEntry[] });
      })
      .catch(() => { if (!cancelled) setFetchedSkills({ id, failed: true }); });
    return () => { cancelled = true; };
  }, [needsFetch, assessment?.id]);
  const fetched = fetchedSkills?.id === assessment?.id ? fetchedSkills : null;
  /* undefined = loading; null = not available (no id, or the read failed). */
  const jdSkills: { mustHave: SkillEntry[]; niceToHave: SkillEntry[] } | null | undefined = passedSkills
    ?? (!needsFetch ? null : !fetched ? undefined : 'failed' in fetched ? null : fetched);

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
  const totalWeight = sections.reduce((n, s) => n + s.percentage, 0);

  /* The Assessments list maps the backend's lowercase status ('published' /
     'draft' / 'closed' / 'archived') into UI labels ('Active' / 'Draft' /
     'Completed' / 'Archived') before passing the row here, so resolve via a
     case-insensitive lookup that handles both forms. */
  const status = (() => {
    const raw = String(assessment.status || '').toLowerCase();
    if (raw === 'published' || raw === 'active') return 'Active';
    if (raw === 'closed' || raw === 'completed') return 'Completed';
    if (raw === 'archived') return 'Archived';
    if (raw === 'draft') return 'Draft';
    return assessment.status || 'Draft';
  })();
  const statusClass = status === 'Active'
    ? 'bg-success-subtle text-success ring-success-line'
    : status === 'Draft'
      ? 'bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20'
      : 'bg-slate-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 ring-gray-200 dark:ring-slate-700';

  const scoredLabel = assessment.technical_enabled && assessment.coding_enabled
    ? 'Technical + Coding'
    : assessment.technical_enabled
      ? 'Technical'
      : assessment.coding_enabled
        ? 'Coding'
        : null;

  /* Must-Have / Nice-to-Have Skills — the Assessment Info panel's two lists,
     same fields and same reading (name · level; Nice-to-Have always shown,
     with a placeholder when the JD has none). Under Technical when there is
     one, else on their own below the sections. */
  const skillChips = (items: SkillEntry[], chipClass: string, levelClass: string) => (
    <div className="flex flex-wrap gap-1">
      {items.map((skill, idx) => {
        const level = skillLevel(skill);
        return (
          <span key={idx} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-medium ring-1 max-w-full [overflow-wrap:anywhere] ${chipClass}`}>
            {skillName(skill)}
            {level && <span className={`font-normal ${levelClass}`}>· {level}</span>}
          </span>
        );
      })}
    </div>
  );
  const skillsBlock = jdSkills === undefined ? (
    <p className="mt-2 pl-[2.375rem] flex items-center gap-1.5 tf-micro-hint">
      <Loader2 className="w-3 h-3 animate-spin" /> Loading skills…
    </p>
  ) : jdSkills ? (
    <div className="mt-2 pl-[2.375rem] space-y-2">
      {jdSkills.mustHave.length > 0 && (
        <div>
          <p className="flex items-center gap-1 text-2xs font-semibold text-gray-700 dark:text-slate-300 mb-1">
            <Star className="w-3 h-3 text-brand-blue" />
            Must-Have Skills <span className="font-normal text-gray-500 dark:text-slate-400">({jdSkills.mustHave.length})</span>
          </p>
          {skillChips(jdSkills.mustHave, 'bg-brand-blue/5 text-brand-blue ring-brand-blue/20', 'text-brand-blue/70')}
        </div>
      )}
      <div>
        <p className="flex items-center gap-1 text-2xs font-semibold text-gray-700 dark:text-slate-300 mb-1">
          <Star className="w-3 h-3 text-brand-cyan" />
          Nice-to-Have Skills <span className="font-normal text-gray-500 dark:text-slate-400">({jdSkills.niceToHave.length})</span>
        </p>
        {jdSkills.niceToHave.length > 0
          ? skillChips(jdSkills.niceToHave, 'bg-brand-cyan/10 text-brand-cyan ring-brand-cyan/25', 'text-brand-cyan/80')
          : <span className="tf-micro-hint">None configured for this JD</span>}
      </div>
    </div>
  ) : null;

  const chip = 'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ring-1 whitespace-nowrap';

  return (
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] w-full max-w-[95vw] sm:max-w-xl md:max-w-2xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header: what this is, and which assessment. No ✕ — the footer's
            Cancel closes (the popup standard). */}
        <div className="px-4 sm:px-5 pt-4 pb-3 flex items-start gap-3 flex-shrink-0">
          <div className="min-w-0 flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-blue to-brand-blue-2 shadow shadow-brand-blue/25 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-2xs font-semibold uppercase tracking-wider text-brand-blue">Assessment Preview</p>
              <h2 className="text-base font-semibold leading-snug text-gray-900 dark:text-slate-50 [overflow-wrap:anywhere]">{assessment.title}</h2>
              {jobContext && (() => {
                const assessmentVersion = typeof assessment.version === 'number'
                  ? assessment.version
                  : parseAssessmentTitle(assessment.title || '').version;
                return (
                  <div className="mt-1 flex items-center gap-1.5 flex-wrap min-w-0 tf-meta">
                    {assessmentVersion ? <VersionPill kind="assessment" version={assessmentVersion} label="Assessment" /> : null}
                    {assessment.jd_short_id && <JobIdBadge>{assessment.jd_short_id}</JobIdBadge>}
                    {assessment.jd_title && <span className="min-w-0 [overflow-wrap:anywhere]">{assessment.jd_title}</span>}
                    {jobContext.jobVersionNumber ? <VersionPill kind="job" version={jobContext.jobVersionNumber} label="Job" /> : null}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        {/* At a glance: one row of chips */}
        <div className="px-4 sm:px-5 pb-3 flex flex-wrap items-center gap-1.5 flex-shrink-0 border-b border-gray-100 dark:border-slate-700/60">
          <span className={`${chip} bg-slate-50 dark:bg-slate-800 text-gray-700 dark:text-slate-200 ring-gray-200 dark:ring-slate-700`}>
            <Clock className="w-3.5 h-3.5 text-gray-500 dark:text-slate-400" />
            {assessment.duration_minutes || assessment.duration || 30} min
          </span>
          <span className={`${chip} bg-slate-50 dark:bg-slate-800 text-gray-700 dark:text-slate-200 ring-gray-200 dark:ring-slate-700`}>
            <Layers className="w-3.5 h-3.5 text-gray-500 dark:text-slate-400" />
            {sections.length} section{sections.length === 1 ? '' : 's'}
          </span>
          <span className={`${chip} ${statusClass}`}>{status}</span>
          {assessment.proctoring_enabled && (
            <span
              className={`${chip} bg-brand-blue/5 text-brand-blue ring-brand-blue/20`}
              title="Webcam monitoring, screen recording, and AI cheating prevention active"
            >
              <Shield className="w-3.5 h-3.5" />
              Proctored
            </span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-5 py-3 space-y-3">
          {/* Which rounds the saved record turns on — read from its
              `*_enabled` flags, so a coding round is never assumed. */}
          {jobContext && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="tf-meta mr-0.5">Rounds</span>
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

          {/* Weightage: one bar, a slice per section */}
          {sections.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-gray-900 dark:text-slate-100">Section weightage</span>
                <span className="tf-micro-hint tabular-nums">{totalWeight}% total</span>
              </div>
              <div className="flex h-2 rounded-full overflow-hidden bg-gray-100 dark:bg-slate-800 gap-0.5">
                {sections.map((s) => (
                  <div
                    key={s.name}
                    className={SECTION_STYLE[s.name].bar}
                    style={{ width: `${totalWeight > 0 ? (s.percentage / totalWeight) * 100 : 0}%` }}
                    title={`${s.name} ${s.percentage}%`}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Sections */}
          <div className="rounded-lg border border-gray-200 dark:border-slate-700 divide-y divide-gray-100 dark:divide-slate-700/60">
            {sections.length === 0 && (
              <p className="px-3 py-4 text-center tf-body-muted">No sections configured.</p>
            )}
            {sections.map((section) => {
              const style = SECTION_STYLE[section.name];
              const Icon = style.icon;
              return (
                <div key={section.name} className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${style.box}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">{section.name}</span>
                    {section.scoringType === 'informational' ? (
                      <span className="px-1.5 py-0.5 rounded text-2xs font-medium bg-slate-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 ring-1 ring-gray-200 dark:ring-slate-700 whitespace-nowrap">
                        Not scored
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-2xs font-medium bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/20 whitespace-nowrap">
                        Scored 0–10
                      </span>
                    )}
                    <span className="ml-auto text-sm font-bold tabular-nums text-brand-blue">{section.percentage}%</span>
                  </div>

                  {/* Topics — HR topics arrive as `{text, type, time}` objects
                      while Technical/Coding topics are strings. Resolve to the
                      visible text so we don't trigger React error #31. */}
                  {section.name === 'Technical' && skillsBlock}
                  {section.topics && section.topics.length > 0 && (section.name !== 'Technical' || jdSkills === null) && (
                    <div className="mt-2 pl-[2.375rem] flex flex-wrap gap-1">
                      {section.topics.map((topic: any, tidx: number) => (
                        <span key={tidx} className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-2xs text-gray-700 dark:text-slate-300 max-w-full [overflow-wrap:anywhere]">
                          {typeof topic === 'string' ? topic : (topic?.text || topic?.name || '')}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Coding Languages */}
                  {section.name === 'Coding' && section.languages && section.languages.length > 0 && (
                    <div className="mt-1.5 pl-[2.375rem] flex flex-wrap gap-1">
                      {section.languages.map((lang: string, lidx: number) => (
                        <span key={lidx} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20 text-2xs font-medium max-w-full [overflow-wrap:anywhere]">
                          <LanguageLogo language={logoLabelForId(lang, lang)} size="sm" />
                          {lang}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {!assessment.technical_enabled && jdSkills !== null && (
            <div className="rounded-lg border border-gray-200 dark:border-slate-700 px-3 pb-2.5 pt-0.5 [&>*:first-child]:pl-0">
              {skillsBlock}
            </div>
          )}

          {/* How it is scored */}
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-900 dark:text-slate-100 mb-1">
              <Info className="w-3.5 h-3.5 text-brand-blue" />
              How candidates are scored
            </p>
            <ul className="tf-meta space-y-0.5 pl-5 list-disc marker:text-gray-400">
              {scoredLabel && (
                <li>
                  <strong>PASS/FAIL</strong> comes from {scoredLabel} only — each question 0–10; pass with ≥70% of questions at ≥7, <strong>or</strong> a section average ≥7.0.
                </li>
              )}
              {assessment.hr_enabled && <li>HR answers are kept in the report for review, but don&apos;t count towards the result.</li>}
              <li>Questions are generated when candidates are assigned, from the topics above.</li>
            </ul>
          </div>
        </div>

        {/* Footer: Cancel */}
        <div className="flex shrink-0 border-t border-gray-100 bg-slate-50/50 px-4 py-3 dark:border-slate-700/60 dark:bg-slate-800/50 sm:px-5">
          <AppModalFooterButtons onCancel={onClose} compactFooter />
        </div>
      </div>
    </div>
  );
}
