'use client';

import React, { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import {
  Video, Mic, Eye, Shield, Clock, Trash2, CheckCircle, AlertTriangle,
  Circle, MapPin, Building2, Award, ExternalLink, X,
  FileText, Timer, HelpCircle, ChevronRight, Smartphone, Wifi,
  Lightbulb, Sparkles, Globe,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { IconComponent } from '@/lib/types/icon';

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
  jdExperienceMin?: number | null;
  jdExperienceMax?: number | null;
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

// Visual-only mapping for the "Before You Begin" notice — each bullet gets an
// icon that matches its meaning. Order/text matches the original list 1:1; no
// content was changed.
const BEFORE_YOU_BEGIN_ITEMS: { icon: IconComponent; text: string }[] = [
  { icon: Video, text: 'Camera and microphone access are required' },
  { icon: Wifi, text: 'Ensure you have a stable internet connection throughout the interview.' },
  { icon: Lightbulb, text: 'Ensure you are in a quiet, well-lit environment' },
  { icon: Eye, text: 'Your responses may be recorded and analyzed as part of the interview.' },
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
  jdExperienceMin,
  jdExperienceMax,
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
  // Dedicated acknowledgement for the "Mobile Verification Required" notice
  // below — separate from the general consent checkbox, and only relevant
  // (rendered + required) when this interview actually has proxy-integrity
  // verification enabled. Forces the candidate to specifically confirm they
  // read THIS notice, not just the general consent block.
  const [mobileVerificationAcknowledged, setMobileVerificationAcknowledged] = useState(false);

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
    if (environmentVerificationEnabled && !mobileVerificationAcknowledged) return;
    onAccept(consentAccepted ? ALL_CONSENTS : consents);
  }, [consentAccepted, submitting, consents, onAccept, environmentVerificationEnabled, mobileVerificationAcknowledged]);

  const title = jdTitle || position || 'Interview Position';
  const expStr = jdExperienceMin != null && jdExperienceMax != null
    ? `${jdExperienceMin}–${jdExperienceMax} yrs`
    : jdExperienceMin != null ? `${jdExperienceMin}+ yrs`
    : jdExperienceMax != null ? `Up to ${jdExperienceMax} yrs`
    : null;
  const isLongDesc = (jdDescription?.length ?? 0) > 600;
  const descToShow = isLongDesc && !showFullDesc ? jdDescription!.slice(0, 600) + '…' : jdDescription;

  /** "full_time" → "Full Time", "onsite" → "Onsite" — JD enums read as words. */
  const humanize = (value: string) =>
    value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const metaItems: { icon: IconComponent; text: string }[] = [
    ...(jdDepartment ? [{ icon: Building2, text: jdDepartment }] : []),
    ...(jdLocation ? [{ icon: MapPin, text: jdLocation }] : []),
    ...(expStr ? [{ icon: Award, text: `${expStr} experience` }] : []),
  ];

  // Job facts first, then the interview's own (duration, questions/format) —
  // one continuous row, each badge only when backed by real data.
  const roleBadges: { key: string; icon: IconComponent; label: string }[] = [
    ...(jdEmploymentType ? [{ key: 'employment', icon: Clock, label: humanize(jdEmploymentType) }] : []),
    ...(jdRemoteType ? [{ key: 'remote', icon: Globe, label: humanize(jdRemoteType) }] : []),
    ...(jdExperienceLevel ? [{ key: 'level', icon: Sparkles, label: humanize(jdExperienceLevel) }] : []),
    ...(interviewMode === 'flexible'
      ? [{ key: 'duration', icon: Timer, label: `${duration != null && duration > 0 ? duration : '~30'} min interview` }]
      : duration != null && duration > 0
        ? [{ key: 'duration', icon: Timer, label: `${duration} min interview` }]
        : []),
    ...(interviewMode === 'flexible'
      ? [{ key: 'format', icon: Sparkles, label: 'Conversational' }]
      : totalQuestions != null && totalQuestions > 0
        ? [{ key: 'questions', icon: HelpCircle, label: `${totalQuestions} ${totalQuestions === 1 ? 'question' : 'questions'}` }]
        : []),
  ];

  return (
    <div className="w-full space-y-6" style={{ colorScheme: 'light' }}>

      {/* ── Two-column layout: details (left) + action panel (right) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-6 items-start">

        {/* ═══════════ LEFT COLUMN ═══════════ */}
        <div className="space-y-6 min-w-0">

          {/* Role card — the job, then every fact about it and about the
              interview as one continuous run of badges. */}
          <div className="relative overflow-hidden bg-white border border-gray-200 rounded-2xl shadow-sm">
            <div className="p-5 sm:p-6">
              <div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-brand-blue">You&apos;re interviewing for</p>
                  <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-gray-900 leading-tight break-words">{title}</h1>
                  {metaItems.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-y-1 text-sm text-gray-500">
                      {metaItems.map((item, i) => (
                        <span key={item.text} className="flex items-center">
                          {i > 0 && <span aria-hidden className="mx-2.5 h-1 w-1 rounded-full bg-gray-300" />}
                          <item.icon className="w-3.5 h-3.5 text-gray-400 mr-1.5 flex-shrink-0" />
                          {item.text}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {roleBadges.length > 0 && (
                <div className="mt-5 pt-4 border-t border-dashed border-gray-200 flex flex-wrap gap-2">
                  {roleBadges.map(badge => (
                    <span
                      key={badge.key}
                      className="inline-flex items-center gap-1.5 rounded-full border border-brand-blue/20 bg-brand-blue/10 px-3 py-1.5 text-xs font-medium text-brand-blue"
                    >
                      <badge.icon className="w-3.5 h-3.5 flex-shrink-0" />
                      {badge.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* JD Description */}
          {jdDescription && (
            <div className="bg-brand-sky/40 border border-brand-blue/15 rounded-xl overflow-hidden" style={{ colorScheme: 'light' }}>
              <div className="px-5 py-3 border-b border-brand-blue/10 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white text-brand-blue border border-brand-blue/20 flex-shrink-0">
                  <FileText className="w-3.5 h-3.5" />
                </span>
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
                    color: 'var(--raw-374151)',
                    colorScheme: 'light',
                  }}
                >
                  <style>{`
                    .jd-prose * { color: var(--raw-374151) !important; background-color: transparent !important; }
                    .jd-prose h1, .jd-prose h2, .jd-prose h3, .jd-prose h4 { color: var(--raw-111827) !important; }
                    .jd-prose strong { color: var(--raw-111827) !important; }
                    .jd-prose code { background-color: var(--raw-f3f4f6) !important; color: var(--raw-1f2937) !important; }
                    .jd-prose pre { background-color: var(--raw-f9fafb) !important; color: var(--raw-374151) !important; border: 1px solid var(--raw-e5e7eb) !important; }
                  `}</style>
                  <div className="jd-prose">
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{descToShow || ''}</ReactMarkdown>
                  </div>
                </div>
                {isLongDesc && (
                  <button
                    type="button"
                    onClick={() => setShowFullDesc(!showFullDesc)}
                    className="text-sm text-brand-blue hover:text-brand-blue-2 mt-2 underline underline-offset-2"
                  >
                    {showFullDesc ? 'Show less' : 'Read more'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ═══════════ RIGHT COLUMN — action panel ═══════════ */}
        <div className="lg:sticky lg:top-6 bg-white border border-gray-200 rounded-2xl overflow-hidden min-w-0">

          {/* Before You Begin */}
          <div className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-orange/10 text-brand-orange flex-shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </span>
              <p className="font-semibold text-gray-900">Before You Begin</p>
            </div>
            <div className="space-y-3">
              {BEFORE_YOU_BEGIN_ITEMS.map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-start gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-blue/10 text-brand-blue flex-shrink-0">
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="text-sm text-gray-600 leading-snug pt-1.5">{text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Mobile verification notice — kept separate from the general
              "Before You Begin" list above since it's a distinct requirement
              (its own acceptance criteria: mobile phone required, no app
              install, camera/mic permission, may trigger at any point). */}
          {environmentVerificationEnabled && (
            <div className="px-5 pb-5 pt-5 border-t border-gray-100">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue/10 text-brand-blue flex-shrink-0">
                  <Smartphone className="w-5 h-5" />
                </span>
                <div>
                  <p className="font-semibold text-gray-900 mb-1">Mobile Verification Required</p>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    At any point during the interview, you may be asked to scan a QR code with your{' '}
                    <strong>mobile phone</strong> to briefly verify your physical environment — have your
                    phone within reach. No app installation is required; it opens directly in your phone&apos;s
                    browser, which may ask for camera and microphone permission.
                  </p>
                  <label className="mt-3 flex items-start gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={mobileVerificationAcknowledged}
                      onChange={() => setMobileVerificationAcknowledged(prev => !prev)}
                      className="mt-0.5 w-4 h-4 rounded border-gray-300 text-brand-blue focus:ring-brand-blue flex-shrink-0"
                    />
                    <span className="text-sm text-gray-700">
                      I have read and understood the mobile verification requirement above.
                    </span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Consent acceptance */}
          <div className="px-5 pb-5 pt-5 border-t border-gray-100">
            <div className={`rounded-xl p-4 transition-colors ${consentAccepted ? 'bg-success-subtle/40 border border-success-line' : 'bg-brand-blue/5 border border-brand-blue/15'}`}>
              <div className="flex items-start gap-3">
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0 transition-colors ${consentAccepted ? 'bg-success-subtle text-success' : 'bg-white text-brand-blue border border-brand-blue/20'}`}>
                  <Shield className="w-4 h-4" />
                </span>
                <div
                  className={`mt-1 w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2 cursor-pointer transition-all ${
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
                <div className="mt-3 ml-11 flex items-center gap-2 text-success text-sm font-medium">
                  <CheckCircle className="w-4 h-4" />
                  All consents accepted
                </div>
              )}
            </div>
          </div>

          {/* Proceed button */}
          <div className="px-5 pb-5">
            <Button
              type="button"
              variant="primary"
              onClick={handleProceed}
              disabled={!consentAccepted || submitting || (environmentVerificationEnabled && !mobileVerificationAcknowledged)}
              className="w-full"
            >
              {submitting ? 'Submitting…' : (
                <>
                  Proceed
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        </div>
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
              <div className="bg-warning-subtle border border-warning-line rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
                <p className="text-sm text-warning-strong">
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
              <div className="bg-destructive-subtle border border-destructive-line rounded-xl p-3 flex items-center gap-2">
                <Circle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
                <p className="text-xs text-gray-700">A <span className="font-medium text-destructive">recording indicator</span> will be visible throughout the interview.</p>
              </div>
            </div>

            {/* Modal footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex-shrink-0 space-y-2">
              <Button
                type="button"
                variant="primary"
                onClick={handleModalAccept}
                disabled={!allChecked}
                className="w-full"
              >
                Accept All &amp; Close
              </Button>
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
