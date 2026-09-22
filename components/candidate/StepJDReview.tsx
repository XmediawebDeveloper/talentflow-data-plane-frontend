'use client';

import React, { useState } from 'react';
import type { IconComponent } from '@/lib/types/icon';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import {
  Briefcase,
  Clock,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  FileText,
  Award,
  MapPin,
  Building2,
  Globe,
  CheckCircle,
  Star,
  GraduationCap,
  Layers,
} from 'lucide-react';

interface StepJDReviewProps {
  position?: string;
  jdTitle?: string | null;
  jdExperienceLevel?: string | null;
  jdDescription?: string | null;
  jdDepartment?: string | null;
  jdLocation?: string | null;
  jdEmploymentType?: string | null;
  jdRemoteType?: string | null;
  jdMustHaveSkills?: string[] | null;
  jdNiceToHaveSkills?: string[] | null;
  jdExperienceMin?: number | null;
  jdExperienceMax?: number | null;
  jdJobLevel?: string | null;
  jdIndustryType?: string | null;
  duration?: number;
  totalQuestions?: number;
  interviewType?: string;
}

function formatInterviewType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatLabel(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function generateBadges(
  interviewType?: string,
  experienceLevel?: string | null,
  employmentType?: string | null,
  remoteType?: string | null,
): Array<{ label: string; bgColor: string; textColor: string }> {
  const badges: Array<{ label: string; bgColor: string; textColor: string }> = [];

  if (interviewType) {
    const typeLower = interviewType.toLowerCase();
    if (typeLower.includes('technical') || typeLower.includes('coding')) {
      badges.push({ label: 'Technical', bgColor: 'bg-blue-100', textColor: 'text-blue-700' });
    }
    if (typeLower.includes('behavioral') || typeLower.includes('behaviour')) {
      badges.push({ label: 'Behavioral', bgColor: 'bg-success-subtle', textColor: 'text-success' });
    }
    if (typeLower.includes('system') || typeLower.includes('design')) {
      badges.push({ label: 'System Design', bgColor: 'bg-purple-100', textColor: 'text-purple-700' });
    }
    if (badges.length === 0) {
      badges.push({ label: formatInterviewType(interviewType), bgColor: 'bg-blue-100', textColor: 'text-blue-700' });
    }
  }

  if (experienceLevel) {
    badges.push({ label: formatLabel(experienceLevel), bgColor: 'bg-warning-subtle', textColor: 'text-warning' });
  }

  if (employmentType) {
    badges.push({ label: formatLabel(employmentType), bgColor: 'bg-success-subtle', textColor: 'text-success' });
  }

  if (remoteType) {
    badges.push({ label: formatLabel(remoteType), bgColor: 'bg-purple-100', textColor: 'text-purple-700' });
  }

  return badges;
}

export default function StepJDReview({
  position,
  jdTitle,
  jdExperienceLevel,
  jdDescription,
  jdDepartment,
  jdLocation,
  jdEmploymentType,
  jdRemoteType,
  jdMustHaveSkills,
  jdNiceToHaveSkills,
  jdExperienceMin,
  jdExperienceMax,
  jdJobLevel,
  jdIndustryType,
  duration,
  totalQuestions,
  interviewType,
}: StepJDReviewProps) {
  const [showFullJD, setShowFullJD] = useState(false);

  const displayTitle = jdTitle || position || 'Position';
  const badges = generateBadges(interviewType, jdExperienceLevel, jdEmploymentType, jdRemoteType);
  const hasLongDescription = jdDescription && jdDescription.length > 300;
  const mustHaveSkills = jdMustHaveSkills?.length ? jdMustHaveSkills : null;
  const niceToHaveSkills = jdNiceToHaveSkills?.length ? jdNiceToHaveSkills : null;

  // Build experience string
  let experienceStr = '';
  if (jdExperienceMin != null && jdExperienceMax != null) {
    experienceStr = `${jdExperienceMin} - ${jdExperienceMax} years`;
  } else if (jdExperienceMin != null) {
    experienceStr = `${jdExperienceMin}+ years`;
  } else if (jdExperienceMax != null) {
    experienceStr = `Up to ${jdExperienceMax} years`;
  }

  // Collect quick info items (only non-null)
  const quickInfo: Array<{ icon: IconComponent; label: string; value: string }> = [];
  if (jdDepartment) quickInfo.push({ icon: Building2, label: 'Department', value: jdDepartment });
  if (jdLocation) quickInfo.push({ icon: MapPin, label: 'Location', value: jdLocation });
  if (jdIndustryType) quickInfo.push({ icon: Globe, label: 'Industry', value: formatLabel(jdIndustryType) });
  if (jdJobLevel) quickInfo.push({ icon: GraduationCap, label: 'Level', value: formatLabel(jdJobLevel) });
  if (experienceStr) quickInfo.push({ icon: Award, label: 'Experience', value: experienceStr });

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Page Heading */}
      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 bg-blue-100 text-blue-700 text-xs font-semibold px-3 py-1 rounded-full">
          <FileText className="w-3.5 h-3.5" />
          Job Details
        </span>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mt-3">
          Review Your Position
        </h1>
        <p className="text-gray-500 mt-2">
          Please review the position details before proceeding
        </p>
      </div>

      {/* Main Card */}
      <div className="w-full">
        {/* Gradient Header with Job Title */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-t-xl px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
              <Briefcase className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold">{displayTitle}</h2>
              {(jdExperienceLevel || jdDepartment) && (
                <p className="text-white/80 text-sm mt-0.5">
                  {jdExperienceLevel && <><Award className="w-3.5 h-3.5 inline mr-1" />{formatLabel(jdExperienceLevel)}</>}
                  {jdExperienceLevel && jdDepartment && <span className="mx-2">·</span>}
                  {jdDepartment && <><Building2 className="w-3.5 h-3.5 inline mr-1" />{jdDepartment}</>}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Card Body */}
        <div className="bg-white border border-gray-200 border-t-0 rounded-b-xl p-6 space-y-6">
          {/* Badge Row */}
          {badges.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {badges.map((badge) => (
                <span
                  key={badge.label}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${badge.bgColor} ${badge.textColor}`}
                >
                  {badge.label}
                </span>
              ))}
            </div>
          )}

          {/* Interview Info Boxes */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl p-4 bg-purple-50 border border-purple-200">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Interview Type</p>
              <p className="font-semibold text-gray-900 mt-1">
                {interviewType ? formatInterviewType(interviewType) : 'General'}
              </p>
            </div>
            <div className="rounded-xl p-4 bg-blue-50 border border-blue-200">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Expected Duration</p>
              <div className="flex items-center gap-1.5 mt-1">
                <Clock className="w-4 h-4 text-blue-600" />
                <p className="font-semibold text-gray-900">
                  {duration ? `${duration} min` : 'TBD'}
                </p>
              </div>
            </div>
            <div className="rounded-xl p-4 bg-teal-50 border border-teal-200">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Total Questions</p>
              <div className="flex items-center gap-1.5 mt-1">
                <HelpCircle className="w-4 h-4 text-teal-600" />
                <p className="font-semibold text-gray-900">
                  {totalQuestions ? String(totalQuestions) : 'TBD'}
                </p>
              </div>
            </div>
          </div>

          {/* Quick Info Grid (only if any data) */}
          {quickInfo.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h4 className="text-lg font-semibold text-gray-900">Position Details</h4>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {quickInfo.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label} className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
                      <Icon className="w-4 h-4 text-gray-500 flex-shrink-0" />
                      <div>
                        <p className="text-2xs text-gray-400 uppercase tracking-wide">{item.label}</p>
                        <p className="text-sm font-medium text-gray-900">{item.value}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Full Job Description */}
          {jdDescription && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h4 className="text-lg font-semibold text-gray-900">About the Role</h4>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
              <div
                className={`relative ${!showFullJD && hasLongDescription ? 'max-h-48 overflow-hidden' : ''}`}
              >
                <div className="prose prose-sm max-w-none text-gray-700 prose-headings:text-gray-900 prose-headings:font-semibold prose-h2:text-base prose-h3:text-sm prose-p:text-sm prose-p:leading-relaxed prose-li:text-sm prose-strong:text-gray-900 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5">
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{jdDescription}</ReactMarkdown>
                </div>
                {!showFullJD && hasLongDescription && (
                  <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white to-transparent" />
                )}
              </div>
              {hasLongDescription && (
                <button
                  type="button"
                  onClick={() => setShowFullJD(!showFullJD)}
                  className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-purple-600 hover:text-purple-700 transition-colors"
                >
                  {showFullJD ? (
                    <>Show Less <ChevronUp className="w-4 h-4" /></>
                  ) : (
                    <>Read Full Description <ChevronDown className="w-4 h-4" /></>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Must-Have Skills */}
          {mustHaveSkills && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h4 className="text-lg font-semibold text-gray-900">Required Skills</h4>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
              <div className="flex flex-wrap gap-2">
                {mustHaveSkills.map((skill, i) => {
                  const label = typeof skill === 'string' ? skill : (skill as any)?.name || (skill as any)?.skill || String(skill);
                  return (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200"
                    >
                      <CheckCircle className="w-3 h-3" />
                      {label}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Nice-to-Have Skills */}
          {niceToHaveSkills && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h4 className="text-lg font-semibold text-gray-900">Nice to Have</h4>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
              <div className="flex flex-wrap gap-2">
                {niceToHaveSkills.map((skill, i) => {
                  const label = typeof skill === 'string' ? skill : (skill as any)?.name || (skill as any)?.skill || String(skill);
                  return (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200"
                    >
                      <Star className="w-3 h-3" />
                      {label}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
