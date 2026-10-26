'use client';

import { Info, Layers, TrendingUp, Globe, Code, Zap, Star } from 'lucide-react';
import LanguageLogo, { logoLabelForId } from '@/components/assessments/LanguageLogo';

/**
 * The Assessment Info panel: what the JD analysis extracted for this
 * assessment — complexity, experience level, domain, coding requirement and
 * the two skill lists.
 *
 * Lifted out of `AssessmentDetailsView`, where it was ~200 lines of inline JSX
 * inside a sub-tab, so the candidate result page can show the SAME panel
 * rather than a second implementation of it that drifts. Neither host owns it
 * now; both render it from the assessment record they already hold.
 *
 * Presentational and self-contained: it fetches nothing and decides nothing
 * about which tab is open. Give it an assessment, it reports on it.
 */
export interface AssessmentInfoSource {
  jd_complexity?: string | null;
  jd_experience_level?: string | null;
  jd_primary_domain?: string | null;
  /** Must-Have skills, as strings or `{ name/skill, level/depth }` objects. */
  jd_skill_depth?: unknown[] | null;
  /** Nice-to-Have skills, same two shapes. */
  jd_nice_to_have_skills?: unknown[] | null;
  coding_enabled?: boolean;
  coding_languages?: string[] | null;
}

export default function AssessmentInfoPanel({ assessment }: { assessment: AssessmentInfoSource }) {

const complexityLabel = (val: string | null | undefined) => {
  const map: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High', expert: 'Expert' };
  return val ? (map[val] || val) : null;
};
const complexityColor = (val: string | null | undefined) => {
  const map: Record<string, string> = {
    low: 'bg-green-100 text-green-700 ring-1 ring-green-200',
    medium: 'bg-yellow-100 text-yellow-700 ring-1 ring-yellow-200',
    high: 'bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20',
    expert: 'bg-red-100 text-red-700 ring-1 ring-red-200',
  };
  return val ? (map[val] || 'bg-slate-100 text-gray-700 ring-1 ring-gray-200') : 'bg-slate-100 text-gray-700 ring-1 ring-gray-200';
};
const expLabel = (val: string | null | undefined) => {
  const map: Record<string, string> = {
    junior: 'Junior', mid: 'Mid-Level', senior: 'Senior', lead: 'Lead', expert: 'Expert',
  };
  return val ? (map[val] || val) : null;
};
const expColor = (val: string | null | undefined) => {
  const map: Record<string, string> = {
    junior: 'bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/20',
    mid: 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20',
    senior: 'bg-brand-blue-2/15 text-brand-blue-2 ring-1 ring-brand-blue-2/25',
    lead: 'bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20',
    expert: 'bg-red-100 text-red-700 ring-1 ring-red-200',
  };
  return val ? (map[val] || 'bg-slate-100 text-gray-700 ring-1 ring-gray-200') : 'bg-slate-100 text-gray-700 ring-1 ring-gray-200';
};

const skillDepth: any[] = (assessment.jd_skill_depth as any[]) || [];
const niceToHaveSkills: any[] = (assessment.jd_nice_to_have_skills as any[]) || [];
const codingLanguages: string[] = assessment.coding_languages || [];
// NHS section is always rendered (with an empty-state placeholder)
// so its presence shouldn't gate the whole panel — fall back to the
// other JD-snapshot signals to decide whether there's anything
// worth showing at all.
const hasData = assessment.jd_complexity || assessment.jd_experience_level || assessment.jd_primary_domain || skillDepth.length > 0 || codingLanguages.length > 0;

return (
  <div className="bg-white rounded-xl border border-gray-200 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5">
    <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-b border-gray-200">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-9 h-9 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
          <Info className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue" />
        </div>
        <h3 className="text-sm sm:text-base font-medium text-gray-900 tracking-tight">Assessment Info</h3>
      </div>
      <p className="text-sm text-gray-600">Metadata extracted from the job description used to generate this assessment</p>
    </div>

    {!hasData ? (
      <div className="px-3 sm:px-4 lg:px-6 py-8 sm:py-12 text-center">
        <Info className="w-8 h-8 sm:w-12 sm:h-12 text-gray-300 mx-auto mb-2 sm:mb-3" />
        <p className="text-gray-600 mb-1">No metadata available</p>
        <p className="text-sm text-gray-500">Assessment info will appear once the JD analysis is complete</p>
      </div>
    ) : (
      <div className="p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
        {/* Key Metadata Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 lg:gap-4">
          {/* Job Complexity Level */}
          <div className="rounded-xl border border-gray-200 ring-1 ring-black/[0.02] bg-white shadow-sm shadow-brand-blue/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-9 h-9 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                <Layers className="w-4 h-4 text-brand-blue" />
              </div>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Job Complexity</span>
            </div>
            {assessment.jd_complexity ? (
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${complexityColor(assessment.jd_complexity)}`}>
                {complexityLabel(assessment.jd_complexity)}
              </span>
            ) : (
              <span className="text-sm text-gray-400">Not available</span>
            )}
          </div>

          {/* Experience Level */}
          <div className="rounded-xl border border-gray-200 ring-1 ring-black/[0.02] bg-white shadow-sm shadow-brand-blue/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-9 h-9 rounded-xl bg-brand-cyan/10 ring-1 ring-brand-cyan/15 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-brand-cyan" />
              </div>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Experience Level</span>
            </div>
            {assessment.jd_experience_level ? (
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${expColor(assessment.jd_experience_level)}`}>
                {expLabel(assessment.jd_experience_level)}
              </span>
            ) : (
              <span className="text-sm text-gray-400">Not available</span>
            )}
          </div>

          {/* Primary Domain */}
          <div className="rounded-xl border border-gray-200 ring-1 ring-black/[0.02] bg-white shadow-sm shadow-brand-blue/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-9 h-9 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                <Globe className="w-4 h-4 text-brand-blue" />
              </div>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Primary Domain</span>
            </div>
            {assessment.jd_primary_domain ? (
              <span className="text-sm font-medium text-gray-900">{assessment.jd_primary_domain}</span>
            ) : (
              <span className="text-sm text-gray-400">Not available</span>
            )}
          </div>

          {/* Coding Requirement */}
          <div className="rounded-xl border border-gray-200 ring-1 ring-black/[0.02] bg-white shadow-sm shadow-brand-blue/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-9 h-9 rounded-xl bg-brand-cyan/10 ring-1 ring-brand-cyan/15 flex items-center justify-center">
                <Code className="w-4 h-4 text-brand-cyan" />
              </div>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Coding Requirement</span>
            </div>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${assessment.coding_enabled ? 'bg-green-100 text-green-700 ring-1 ring-green-200' : 'bg-slate-100 text-gray-600 ring-1 ring-gray-200'}`}>
              {assessment.coding_enabled ? 'Required' : 'Not Required'}
            </span>
          </div>

          {/* Eligible Programming Languages */}
          <div className="rounded-xl border border-gray-200 ring-1 ring-black/[0.02] bg-white shadow-sm shadow-brand-blue/5 p-4 sm:col-span-2">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-9 h-9 rounded-xl bg-brand-orange/10 ring-1 ring-brand-orange/20 flex items-center justify-center">
                <Zap className="w-4 h-4 text-brand-orange-deep" />
              </div>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Eligible Programming Languages</span>
            </div>
            {codingLanguages.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {codingLanguages.map((lang, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20"
                  >
                    <LanguageLogo language={logoLabelForId(lang, lang)} size="sm" />
                    {lang}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-sm text-gray-400">{assessment.coding_enabled ? 'No languages specified' : 'N/A — coding not required'}</span>
            )}
          </div>
        </div>

        {/* Must-Have Skills (MHS) — labelled symmetrically with the
            NHS section so a recruiter scanning the page sees a
            matching pair instead of "Skill Depth" + "Nice-to-Have". */}
        {skillDepth.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Star className="w-4 h-4 text-brand-blue" />
              <h4 className="text-sm font-medium text-gray-900 tracking-tight">Must-Have Skills</h4>
              <span className="text-xs text-gray-500">(Required skills extracted from JD)</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {skillDepth.map((skill: any, idx: number) => {
                const skillName = typeof skill === 'string' ? skill : skill?.name || skill?.skill || JSON.stringify(skill);
                const level = typeof skill === 'object' ? (skill?.level || skill?.depth) : null;
                return (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20"
                  >
                    {skillName}
                    {level && (
                      <span className="text-xs text-brand-blue/70 font-normal">· {level}</span>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Nice-to-Have Skills (NHS) — always rendered alongside
            MHS so the section's presence is consistent. When the
            JD has none configured we show a muted placeholder
            instead of hiding the heading entirely (which made
            recruiters think NHS support was missing). */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Star className="w-4 h-4 text-brand-cyan" />
            <h4 className="text-sm font-medium text-gray-900 tracking-tight">Nice-to-Have Skills</h4>
            <span className="text-xs text-gray-500">(Preferred skills extracted from JD)</span>
          </div>
          {niceToHaveSkills.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {niceToHaveSkills.map((skill: any, idx: number) => {
                const skillName = typeof skill === 'string' ? skill : skill?.name || skill?.skill || JSON.stringify(skill);
                const level = typeof skill === 'object' ? (skill?.level || skill?.depth) : null;
                return (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/25"
                  >
                    {skillName}
                    {level && (
                      <span className="text-xs text-brand-cyan/80 font-normal">· {level}</span>
                    )}
                  </span>
                );
              })}
            </div>
          ) : (
            <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm text-gray-400 bg-gray-50 border border-gray-200">
              None configured for this JD
            </span>
          )}
        </div>
      </div>
    )}
  </div>
);
}
