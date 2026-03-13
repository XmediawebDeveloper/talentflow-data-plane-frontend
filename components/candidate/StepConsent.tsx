'use client';

import React, { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  Video, Mic, Eye, Shield, Clock, Trash2, CheckCircle, AlertTriangle,
  Circle, Briefcase, MapPin, Building2, Award, ExternalLink,
} from 'lucide-react';

interface StepConsentProps {
  onAccept: (consents: {
    consent_video: boolean;
    consent_audio: boolean;
    consent_biometric: boolean;
    consent_ai_analysis: boolean;
    consent_terms: boolean;
  }) => void;
  submitting?: boolean;
  // JD props (shown above consent)
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
  duration?: number;
}

type ConsentKey =
  | 'consent_video'
  | 'consent_audio'
  | 'consent_biometric'
  | 'consent_ai_analysis'
  | 'consent_terms';

interface ConsentState {
  consent_video: boolean;
  consent_audio: boolean;
  consent_biometric: boolean;
  consent_ai_analysis: boolean;
  consent_terms: boolean;
}

const CONSENT_ITEMS: { key: ConsentKey; label: string }[] = [
  { key: 'consent_video', label: 'I consent to video recording during this interview' },
  { key: 'consent_audio', label: 'I consent to audio recording and transcription' },
  { key: 'consent_biometric', label: 'I consent to biometric data processing (GDPR Art. 9)' },
  { key: 'consent_ai_analysis', label: 'I consent to AI-powered analysis of my responses' },
  { key: 'consent_terms', label: 'I have read and agree to the Privacy Policy and Terms of Service' },
];

const DATA_CARDS = [
  { icon: Video, title: 'Video Recording', description: 'Your video will be recorded throughout the interview', bg: 'bg-gray-100', iconColor: 'text-gray-600' },
  { icon: Mic, title: 'Audio Recording', description: 'Your audio will be captured for transcription and analysis', bg: 'bg-gray-100', iconColor: 'text-gray-600' },
  { icon: Eye, title: 'Facial Analysis', description: 'AI will analyze facial expressions for engagement metrics', bg: 'bg-gray-100', iconColor: 'text-gray-600' },
];

const GDPR_RIGHTS = [
  'Right to access your personal data',
  'Right to rectification of inaccurate data',
  'Right to erasure ("right to be forgotten")',
  'Right to restrict processing',
  'Right to data portability',
  'Right to object to processing',
  'Right to withdraw consent at any time',
  'Right to lodge a complaint with a supervisory authority',
];

export default function StepConsent({
  onAccept,
  submitting = false,
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
  duration,
}: StepConsentProps) {
  const [consents, setConsents] = useState<ConsentState>({
    consent_video: false,
    consent_audio: false,
    consent_biometric: false,
    consent_ai_analysis: false,
    consent_terms: false,
  });
  const [showFullDesc, setShowFullDesc] = useState(false);

  const allChecked = Object.values(consents).every(Boolean);
  const noneChecked = Object.values(consents).every((v) => !v);

  const toggleConsent = useCallback((key: ConsentKey) => {
    setConsents((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const toggleAll = useCallback(() => {
    const newValue = !allChecked;
    setConsents({
      consent_video: newValue,
      consent_audio: newValue,
      consent_biometric: newValue,
      consent_ai_analysis: newValue,
      consent_terms: newValue,
    });
  }, [allChecked]);

  const handleSubmit = useCallback(() => {
    if (allChecked && !submitting) {
      onAccept(consents);
    }
  }, [allChecked, submitting, consents, onAccept]);

  const title = jdTitle || position || 'Interview Position';
  const expStr = jdExperienceMin != null && jdExperienceMax != null
    ? `${jdExperienceMin}-${jdExperienceMax} years`
    : jdExperienceMin != null ? `${jdExperienceMin}+ years`
    : jdExperienceMax != null ? `Up to ${jdExperienceMax} years`
    : null;
  const isLongDesc = jdDescription ? jdDescription.length > 500 : false;
  const descToShow = isLongDesc && !showFullDesc
    ? jdDescription!.slice(0, 500) + '...'
    : jdDescription;

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-8 space-y-6">

      {/* ── SECTION 1: Job Details ── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="bg-gray-800 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">{title}</h2>
              {jdJobLevel && <p className="text-sm text-gray-300">{jdJobLevel} Level</p>}
            </div>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Quick info row */}
          <div className="flex flex-wrap gap-3 text-sm">
            {jdDepartment && (
              <span className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 px-3 py-1 rounded-full">
                <Building2 className="w-3.5 h-3.5" /> {jdDepartment}
              </span>
            )}
            {jdLocation && (
              <span className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 px-3 py-1 rounded-full">
                <MapPin className="w-3.5 h-3.5" /> {jdLocation}
              </span>
            )}
            {(jdEmploymentType || jdRemoteType) && (
              <span className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 px-3 py-1 rounded-full">
                {[jdEmploymentType, jdRemoteType].filter(Boolean).join(' / ')}
              </span>
            )}
            {expStr && (
              <span className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 px-3 py-1 rounded-full">
                <Award className="w-3.5 h-3.5" /> {expStr} experience
              </span>
            )}
          </div>

          {/* Interview info */}
          <div className="flex gap-4 text-sm text-gray-600">
            {duration != null && duration > 0 && (
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-gray-400" /> {duration} min interview
              </span>
            )}
          </div>

          {/* Description */}
          {jdDescription && (
            <div>
              <div className="prose prose-sm prose-gray max-w-none text-gray-600 leading-relaxed">
                <ReactMarkdown>{descToShow || ''}</ReactMarkdown>
              </div>
              {isLongDesc && (
                <button
                  type="button"
                  onClick={() => setShowFullDesc(!showFullDesc)}
                  className="text-sm text-gray-500 hover:text-gray-700 mt-1 underline underline-offset-2"
                >
                  {showFullDesc ? 'Show less' : 'Read more'}
                </button>
              )}
            </div>
          )}

          {/* Skills */}
          {jdMustHaveSkills && jdMustHaveSkills.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Required Skills</h3>
              <div className="flex flex-wrap gap-1.5">
                {jdMustHaveSkills.map((skill) => (
                  <span key={skill} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs px-2.5 py-1 rounded-full">
                    <CheckCircle className="w-3 h-3 text-gray-500" /> {skill}
                  </span>
                ))}
              </div>
            </div>
          )}
          {jdNiceToHaveSkills && jdNiceToHaveSkills.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Nice to Have</h3>
              <div className="flex flex-wrap gap-1.5">
                {jdNiceToHaveSkills.map((skill) => (
                  <span key={skill} className="bg-gray-50 text-gray-600 text-xs px-2.5 py-1 rounded-full border border-gray-200">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Divider ── */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Privacy & Consent</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      {/* ── SECTION 2: GDPR/DPDP Notice ── */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              Important Notice — Biometric Data Collection
            </h2>
            <p className="text-gray-600 mt-1.5 text-sm leading-relaxed">
              This interview involves collection of video, audio, and facial expression data (special category data under GDPR Art. 9).
              Your explicit consent is required. You may withdraw consent at any time.
            </p>
          </div>
        </div>
      </div>

      {/* ── SECTION 3: Data Collection Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {DATA_CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.title} className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col items-center text-center">
              <div className={`w-10 h-10 rounded-full ${card.bg} flex items-center justify-center mb-2`}>
                <Icon className={`w-5 h-5 ${card.iconColor}`} />
              </div>
              <h3 className="text-sm font-medium text-gray-900">{card.title}</h3>
              <p className="text-xs text-gray-500 mt-1">{card.description}</p>
            </div>
          );
        })}
      </div>

      {/* ── SECTION 4: Data Retention ── */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-3">Data Retention & Deletion</h2>
        <div className="space-y-2.5">
          <div className="flex items-start gap-3">
            <Clock className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-gray-600">
              Data retained for <strong className="text-gray-900">90 days</strong>, then automatically deleted.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <Trash2 className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-gray-600">
              You may <strong className="text-gray-900">request early deletion</strong> at any time.
            </p>
          </div>
        </div>
      </div>

      {/* ── SECTION 5: Consent Checkboxes ── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Your Consent</h2>
          <button
            type="button"
            onClick={toggleAll}
            className="text-sm font-medium text-gray-600 hover:text-gray-800 underline underline-offset-2 transition-colors"
          >
            {allChecked ? 'Deselect All' : 'Select All'}
          </button>
        </div>
        <div className="space-y-3">
          {CONSENT_ITEMS.map((item) => (
            <label key={item.key} className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={consents[item.key]}
                onChange={() => toggleConsent(item.key)}
                className="mt-0.5 w-4 h-4 rounded border-gray-300 text-gray-800 focus:ring-gray-500 cursor-pointer flex-shrink-0"
              />
              <span className="text-sm text-gray-700 group-hover:text-gray-900 transition-colors select-none">
                {item.label}
              </span>
            </label>
          ))}
        </div>

        {/* Read full policy link */}
        <div className="mt-4 pt-3 border-t border-gray-100">
          <a
            href="/privacy-policy"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-800 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Read our Privacy Policy & Terms of Service
          </a>
        </div>
      </div>

      {/* ── SECTION 6: Your Rights (collapsed) ── */}
      <details className="bg-gray-50 border border-gray-200 rounded-xl">
        <summary className="px-5 py-3 cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
          Your GDPR Rights
        </summary>
        <div className="px-5 pb-4">
          <ul className="space-y-1.5">
            {GDPR_RIGHTS.map((right) => (
              <li key={right} className="flex items-start gap-2">
                <CheckCircle className="w-3.5 h-3.5 text-gray-500 mt-0.5 flex-shrink-0" />
                <span className="text-sm text-gray-600">{right}</span>
              </li>
            ))}
          </ul>
        </div>
      </details>

      {/* ── SECTION 7: Recording Notice ── */}
      <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex items-center gap-3">
        <Circle className="w-4 h-4 text-red-500 flex-shrink-0" />
        <p className="text-sm text-gray-700">
          A <span className="font-medium text-red-600">recording indicator</span> will be visible throughout the interview.
        </p>
      </div>

      {/* ── Accept Button ── */}
      <div className="pt-2 pb-4">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!allChecked || submitting}
          className="w-full bg-gray-900 text-white font-semibold py-3 px-6 rounded-xl hover:bg-gray-800 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
        >
          {submitting ? 'Submitting...' : 'Accept All & Continue'}
        </button>
        {!allChecked && !noneChecked && (
          <p className="text-xs text-gray-500 text-center mt-2">
            Please check all consent boxes above to continue.
          </p>
        )}
      </div>
    </div>
  );
}
