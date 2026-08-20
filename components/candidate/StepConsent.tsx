'use client';

import React, { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import {
  Video, Mic, Eye, Shield, Clock, Trash2, CheckCircle, AlertTriangle,
  Circle, Briefcase, MapPin, Building2, Award, ExternalLink, X,
  FileText, Timer, HelpCircle, ChevronRight,
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
  interviewType?: string;
  interviewMode?: string | null;
  totalQuestions?: number;
  /** When true, informs the candidate before the interview starts that they
   *  will need their mobile phone to complete a proxy verification process —
   *  per the "AI Interview configuration" section of the Mobile QR
   *  Environment Verification spec ("the candidate will be informed on this
   *  process before interview starts where they will be requiring their
   *  mobile to complete proxy verification process"). */
  environmentVerificationEnabled?: boolean;
}

type ConsentKey = 'consent_video' | 'consent_audio' | 'consent_biometric' | 'consent_ai_analysis' | 'consent_terms';

interface ConsentState {
  consent_video: boolean;
  consent_audio: boolean;
  consent_biometric: boolean;
  consent_ai_analysis: boolean;
  consent_terms: boolean;
}

const CONSENT_ITEMS: { key: ConsentKey; icon: React.ElementType; label: string; desc: string }[] = [
  { key: 'consent_video', icon: Video, label: 'Video Recording', desc: 'I consent to video recording during this interview' },
  { key: 'consent_audio', icon: Mic, label: 'Audio Recording', desc: 'I consent to audio recording and transcription' },
  { key: 'consent_biometric', icon: Eye, label: 'Biometric Data', desc: 'I consent to biometric data processing (GDPR Art. 9)' },
  { key: 'consent_ai_analysis', icon: Shield, label: 'AI Analysis', desc: 'I consent to AI-powered analysis of my responses' },
  { key: 'consent_terms', icon: FileText, label: 'Terms of Service', desc: 'I have read and agree to the Privacy Policy and Terms of Service' },
];

const GDPR_RIGHTS = [
  'Right to access your personal data',
  'Right to rectification of inaccurate data',
  'Right to erasure ("right to be forgotten")',
  'Right to restrict processing',
  'Right to data portability',
  'Right to object to processing',
  'Right to withdraw consent at any time',
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
  interviewType,
  interviewMode,
  totalQuestions,
  environmentVerificationEnabled,
}: StepConsentProps) {
  const [showFullDesc, setShowFullDesc] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [consents, setConsents] = useState<ConsentState>({
    consent_video: false,
    consent_audio: false,
    consent_biometric: false,
    consent_ai_analysis: false,
    consent_terms: false,
  });
  const [consentAccepted, setConsentAccepted] = useState(false);

  const allChecked = Object.values(consents).every(Boolean);

  const toggleConsent = useCallback((key: ConsentKey) => {
    setConsents(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const toggleAll = useCallback(() => {
    const newVal = !allChecked;
    setConsents({
      consent_video: newVal, consent_audio: newVal,
      consent_biometric: newVal, consent_ai_analysis: newVal, consent_terms: newVal,
    });
  }, [allChecked]);

  const ALL_CONSENTS: ConsentState = {
    consent_video: true, consent_audio: true,
    consent_biometric: true, consent_ai_analysis: true, consent_terms: true,
  };

  const handleCheckboxClick = useCallback(() => {
    if (consentAccepted) {
      // uncheck — deselect all
      setConsentAccepted(false);
      setConsents({ consent_video: false, consent_audio: false, consent_biometric: false, consent_ai_analysis: false, consent_terms: false });
    } else {
      // check — select all, no modal
      setConsentAccepted(true);
      setConsents(ALL_CONSENTS);
    }
  }, [consentAccepted]);

  const handleModalAccept = useCallback(() => {
    if (!allChecked) return;
    setConsentAccepted(true);
    setShowConsentModal(false);
  }, [allChecked]);

  const handleProceed = useCallback(() => {
    if (!consentAccepted || submitting) return;
    onAccept(consentAccepted ? ALL_CONSENTS : consents);
  }, [consentAccepted, submitting, consents, onAccept]);

  const title = jdTitle || position || 'Interview Position';
  const expStr = jdExperienceMin != null && jdExperienceMax != null
    ? `${jdExperienceMin}–${jdExperienceMax} yrs`
    : jdExperienceMin != null ? `${jdExperienceMin}+ yrs`
    : jdExperienceMax != null ? `Up to ${jdExperienceMax} yrs`
    : null;
  const isLongDesc = (jdDescription?.length ?? 0) > 600;
  const descToShow = isLongDesc && !showFullDesc ? jdDescription!.slice(0, 600) + '…' : jdDescription;

  return (
    <div className="w-full space-y-6" style={{ colorScheme: 'light' }}>

      {/* ── Hero banner ── */}
      <div className="rounded-2xl overflow-hidden shadow-sm">
        <div className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-700 px-6 py-7">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Briefcase className="w-5 h-5 text-gray-300" />
                <span className="text-gray-300 text-sm font-medium">Position</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white">{title}</h1>
              {jdJobLevel && <p className="text-gray-300 mt-1 text-sm">{jdJobLevel} Level</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              {jdEmploymentType && (
                <span className="bg-white/10 border border-white/20 text-white text-xs font-medium px-3 py-1 rounded-full">
                  {jdEmploymentType}
                </span>
              )}
              {jdRemoteType && (
                <span className="bg-white/10 border border-white/20 text-white text-xs font-medium px-3 py-1 rounded-full">
                  {jdRemoteType}
                </span>
              )}
              {jdExperienceLevel && (
                <span className="bg-white/10 border border-white/20 text-white text-xs font-medium px-3 py-1 rounded-full">
                  {jdExperienceLevel}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Meta row */}
        <div className="bg-white border-b border-gray-100 px-6 py-3 flex flex-wrap gap-4 text-sm text-gray-600">
          {jdDepartment && (
            <span className="flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-gray-400" /> {jdDepartment}
            </span>
          )}
          {jdLocation && (
            <span className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-gray-400" /> {jdLocation}
            </span>
          )}
          {expStr && (
            <span className="flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-gray-400" /> {expStr} experience
            </span>
          )}
        </div>
      </div>

      {/* ── Interview stats cards ── */}
      {interviewMode === 'flexible' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1.5">
              <span className="flex items-center gap-1"><Timer className="w-3 h-3" /> Expected Duration</span>
            </p>
            <p className="text-lg font-bold text-gray-900">{duration != null && duration > 0 ? `${duration} min` : '~30 min'}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1.5">Interview Format</p>
            <p className="text-lg font-bold text-gray-900">Conversational</p>
          </div>
        </div>
      ) : ((duration != null && duration > 0) || (totalQuestions != null && totalQuestions > 0)) ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {duration != null && duration > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1.5">
                <span className="flex items-center gap-1"><Timer className="w-3 h-3" /> Expected Duration</span>
              </p>
              <p className="text-lg font-bold text-gray-900">{duration} min</p>
            </div>
          )}
          {totalQuestions != null && totalQuestions > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1.5">Total Questions</p>
              <p className="text-lg font-bold text-gray-900">{totalQuestions} questions</p>
            </div>
          )}
        </div>
      ) : null}

      {/* ── JD Description ── */}
      {jdDescription && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden" style={{ colorScheme: 'light' }}>
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">About the Role</h2>
          </div>
          <div className="p-5">
            {/* prose-invert must NOT apply here — force light mode via inline style so
                the dark class on <html> (from OS dark mode / next-themes) cannot invert
                the typography plugin's colors inside this container. */}
            <div
              className="prose prose-sm max-w-none leading-relaxed
                prose-headings:font-semibold
                prose-p:my-1.5
                prose-li:my-0.5
                prose-a:no-underline
                prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-normal prose-code:before:content-none prose-code:after:content-none
                prose-pre:rounded-lg prose-pre:text-sm prose-pre:font-normal"
              style={{
                color: '#374151',
                colorScheme: 'light',
              }}
            >
              <style>{`
                .jd-prose * { color: #374151 !important; background-color: transparent !important; }
                .jd-prose h1, .jd-prose h2, .jd-prose h3, .jd-prose h4 { color: #111827 !important; }
                .jd-prose strong { color: #111827 !important; }
                .jd-prose code { background-color: #f3f4f6 !important; color: #1f2937 !important; }
                .jd-prose pre { background-color: #f9fafb !important; color: #374151 !important; border: 1px solid #e5e7eb !important; }
              `}</style>
              <div className="jd-prose">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{descToShow || ''}</ReactMarkdown>
              </div>
            </div>
            {isLongDesc && (
              <button
                type="button"
                onClick={() => setShowFullDesc(!showFullDesc)}
                className="text-sm text-gray-500 hover:text-gray-700 mt-2 underline underline-offset-2"
              >
                {showFullDesc ? 'Show less' : 'Read more'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Skills ── */}
      {((jdMustHaveSkills?.length ?? 0) > 0 || (jdNiceToHaveSkills?.length ?? 0) > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {jdMustHaveSkills && jdMustHaveSkills.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Required Skills</h3>
              <div className="flex flex-wrap gap-1.5">
                {jdMustHaveSkills.map(skill => (
                  <span key={skill} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs px-2.5 py-1 rounded-full">
                    <CheckCircle className="w-3 h-3 text-gray-500" /> {skill}
                  </span>
                ))}
              </div>
            </div>
          )}
          {jdNiceToHaveSkills && jdNiceToHaveSkills.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Nice to Have</h3>
              <div className="flex flex-wrap gap-1.5">
                {jdNiceToHaveSkills.map(skill => (
                  <span key={skill} className="bg-gray-50 text-gray-600 text-xs px-2.5 py-1 rounded-full border border-gray-200">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── What's required ── */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-800 mb-1">Before You Begin</p>
            <ul className="text-amber-700 text-sm space-y-1">
              <li>• Camera and microphone access are required</li>
              <li>• If a genuine network or client failure occurs, the assessment can recover from the saved server state</li>
              <li>• Ensure you are in a quiet, well-lit environment</li>
              <li>• Tab switching and copy/paste are monitored</li>
              {environmentVerificationEnabled && (
                <li>
                  • At some point during the interview, you&apos;ll be asked to scan a QR code
                  with your <strong>mobile phone</strong> to briefly verify your physical
                  environment — have your phone within reach
                </li>
              )}
            </ul>
          </div>
        </div>
      </div>

      {/* ── Consent acceptance row ── */}
      <div className={`bg-white border rounded-xl p-5 transition-colors ${consentAccepted ? 'border-green-300 bg-green-50/30' : 'border-gray-200'}`}>
        <div className="flex items-start gap-3">
          <div
            className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2 cursor-pointer transition-all ${
              consentAccepted ? 'bg-gray-900 border-gray-900' : 'border-gray-300 hover:border-gray-500'
            }`}
            onClick={handleCheckboxClick}
          >
            {consentAccepted && <CheckCircle className="w-3.5 h-3.5 text-white" />}
          </div>
          <div className="text-sm text-gray-700 leading-relaxed">
            I accept the{' '}
            <button
              type="button"
              onClick={() => setShowConsentModal(true)}
              className="text-gray-900 font-semibold underline underline-offset-2 hover:text-gray-600 transition-colors"
            >
              consent and terms
            </button>
            {' '}for AI Interview
            <p className="text-xs text-gray-500 mt-1">
              Checking this box selects all consents. You may click &ldquo;consent and terms&rdquo; to review the full privacy policy and terms.
            </p>
          </div>
        </div>

        {consentAccepted && (
          <div className="mt-3 flex items-center gap-2 text-green-700 text-sm font-medium">
            <CheckCircle className="w-4 h-4" />
            All consents accepted
          </div>
        )}
      </div>

      {/* ── Proceed button ── */}
      <button
        type="button"
        onClick={handleProceed}
        disabled={!consentAccepted || submitting}
        className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white font-semibold py-3.5 px-4 rounded-xl hover:bg-gray-800 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {submitting ? 'Submitting…' : (
          <>
            Proceed
            <ChevronRight className="w-4 h-4" />
          </>
        )}
      </button>

      {/* ── Help ── */}
      <div className="flex items-center gap-2 text-sm text-gray-400 justify-center pb-2">
        <HelpCircle className="w-4 h-4" />
        Questions? Contact{' '}
        <a href="mailto:support@talentflow.com" className="text-gray-600 hover:underline">
          support@talentflow.com
        </a>
      </div>

      {/* ═══════════════════════════════════════════════════
          CONSENT MODAL
      ═══════════════════════════════════════════════════ */}
      {showConsentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[95vw] sm:max-w-2xl max-h-[90dvh] flex flex-col">

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-gray-700" />
                <h2 className="text-base font-semibold text-gray-900">Privacy &amp; Consent</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowConsentModal(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
               aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal body (scrollable) */}
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

              {/* GDPR notice */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800">
                  This interview collects video, audio, and facial expression data (special category data under <strong>GDPR Art. 9</strong>). Your explicit consent is required.
                </p>
              </div>

              {/* Data collected cards */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { icon: Video, label: 'Video' },
                  { icon: Mic, label: 'Audio' },
                  { icon: Eye, label: 'Facial' },
                ].map(({ icon: Icon, label }) => (
                  <div key={label} className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex flex-col items-center gap-1.5 text-center">
                    <Icon className="w-5 h-5 text-gray-600" />
                    <span className="text-xs font-medium text-gray-700">{label}</span>
                  </div>
                ))}
              </div>

              {/* Consent checkboxes */}
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">Your Consent</h3>
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="text-xs font-medium text-gray-500 hover:text-gray-800 underline underline-offset-2 transition-colors"
                  >
                    {allChecked ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <div className="space-y-3">
                  {CONSENT_ITEMS.map(item => (
                    <label key={item.key} className="flex items-start gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={consents[item.key]}
                        onChange={() => toggleConsent(item.key)}
                        className="mt-0.5 w-4 h-4 rounded border-gray-300 text-gray-800 focus:ring-gray-500 cursor-pointer flex-shrink-0"
                      />
                      <div>
                        <p className="text-sm font-medium text-gray-800 group-hover:text-gray-900 transition-colors">{item.label}</p>
                        <p className="text-xs text-gray-500">{item.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Data retention */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
                <h3 className="text-sm font-semibold text-gray-900">Data Retention</h3>
                <div className="flex items-start gap-2 text-sm text-gray-600">
                  <Clock className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  Retained for <strong className="text-gray-900 mx-1">90 days</strong>, then automatically deleted.
                </div>
                <div className="flex items-start gap-2 text-sm text-gray-600">
                  <Trash2 className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  You may request early deletion at any time.
                </div>
              </div>

              {/* Privacy policy */}
              <div className="text-sm text-gray-700 space-y-2.5">
                <h3 className="font-semibold text-gray-900">Key Points</h3>
                <p>Your data is encrypted in transit and at rest. It is never sold or shared with third parties beyond what&apos;s needed for this recruitment process.</p>
                <p>No automated hiring decision is made solely by AI — a human recruiter always reviews results.</p>
              </div>

              {/* GDPR rights */}
              <details className="bg-gray-50 border border-gray-200 rounded-xl">
                <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                  Your GDPR Rights
                </summary>
                <ul className="px-4 pb-3 space-y-1.5">
                  {GDPR_RIGHTS.map(right => (
                    <li key={right} className="flex items-start gap-2 text-xs text-gray-600">
                      <CheckCircle className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" /> {right}
                    </li>
                  ))}
                </ul>
              </details>

              {/* Recording notice */}
              <div className="bg-red-50 border border-red-100 rounded-xl p-3 flex items-center gap-2">
                <Circle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                <p className="text-xs text-gray-700">A <span className="font-medium text-red-600">recording indicator</span> will be visible throughout the interview.</p>
              </div>
            </div>

            {/* Modal footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex-shrink-0 space-y-2">
              <button
                type="button"
                onClick={handleModalAccept}
                disabled={!allChecked}
                className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white font-semibold py-3 px-4 rounded-xl hover:bg-gray-800 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Accept All &amp; Close
              </button>
              {!allChecked && (
                <p className="text-xs text-gray-400 text-center">Please check all consent boxes above to confirm.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
