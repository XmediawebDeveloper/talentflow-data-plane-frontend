'use client';

import React, { Fragment, useState, useCallback, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import {
  Video, Eye, Shield, Clock, Trash2, CheckCircle, AlertTriangle,
  MapPin, Award, ExternalLink, X,
  FileText, Timer, HelpCircle, ChevronRight, Smartphone, Wifi,
  Lightbulb, Globe, SquareUser, Cpu, Laptop, ShieldCheck, Database, TrendingUp, MessagesSquare, Factory,
} from 'lucide-react';
import { revealAfterPaint } from '@/lib/utils/candidateScroll';
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
  /** Shown top-right of the role card, as on the assessment's Job & Consent step. */
  candidateName?: string | null;
  candidateEmail?: string | null;
  position?: string;
  jdTitle?: string | null;
  jdExperienceLevel?: string | null;
  jdDescription?: string | null;
  jdDepartment?: string | null;
  jdLocation?: string | null;
  /** Slug, e.g. "information_technology" — shown as words in the tagline. */
  jdIndustryType?: string | null;
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

interface ConsentState {
  consent_video: boolean;
  consent_audio: boolean;
  consent_biometric: boolean;
  consent_ai_analysis: boolean;
  consent_terms: boolean;
}

// Consent modal, row 1 - what the interview collects and why.
const DATA_USAGE_ITEMS: { icon: IconComponent; title: string; desc: string }[] = [
  { icon: Video, title: 'Video & Audio Recording', desc: 'Your video and audio may be recorded during the interview for evaluation, security, and audit purposes.' },
  { icon: FileText, title: 'Interview Responses', desc: 'Your answers will be transcribed and analyzed to evaluate your skills and fit for the role.' },
  { icon: SquareUser, title: 'Identity Verification', desc: 'We may capture a live photo or use identity verification to ensure a secure and fair interview.' },
  { icon: Cpu, title: 'AI Usage', desc: 'Your responses may be processed using AI to assist with transcription, analysis, and evaluation.' },
  { icon: Laptop, title: 'Technical Information', desc: 'We collect device, browser and network information to maintain interview security and prevent misuse.' },
];

// Consent modal, row 2 - "Learn More" cards; each expands to its details.
type LearnMoreKey = 'privacy' | 'rights' | 'retention';
const LEARN_MORE_ITEMS: { key: LearnMoreKey; icon: IconComponent; title: string; desc: string }[] = [
  { key: 'privacy', icon: FileText, title: 'Privacy Policy', desc: 'Learn how we collect, use, protect, and manage your personal data.' },
  { key: 'rights', icon: ShieldCheck, title: 'GDPR & DPDP Rights', desc: "Understand your rights under GDPR and India's DPDP Act, 2023." },
  { key: 'retention', icon: Database, title: 'Data Retention Policy', desc: 'Learn how long your data is retained and when it is deleted.' },
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
  jdLocation,
  jdIndustryType,
  jdEmploymentType,
  jdRemoteType,
  jdExperienceMin,
  jdExperienceMax,
  interviewType,
  interviewMode,
  totalQuestions,
  environmentVerificationEnabled,
  candidateName,
  candidateEmail,
}: StepConsentProps) {
  const [showFullDesc, setShowFullDesc] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [openLearnMore, setOpenLearnMore] = useState<LearnMoreKey | null>(null);
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

  // Auto-scroll targets: the JD card (after "Show less"), the mobile
  // acknowledgement (when it's what still blocks Proceed) and Proceed itself.
  const jdRef = useRef<HTMLDivElement>(null);
  const mobileAckRef = useRef<HTMLLabelElement>(null);
  const proceedRef = useRef<HTMLDivElement>(null);
  const mobileAckPending = !!environmentVerificationEnabled && !mobileVerificationAcknowledged;

  /** After consent is given: bring the next thing to do into view — the
   *  mobile acknowledgement if it is still unticked, otherwise Proceed. Only
   *  scrolls when that target is off screen (phones, short laptops). */
  const revealNextAction = useCallback(() => {
    revealAfterPaint(() => (mobileAckPending ? mobileAckRef.current : proceedRef.current),
      mobileAckPending ? 'center' : 'nearest');
  }, [mobileAckPending]);

  // The consent modal: stop the page behind it from scrolling (iOS scrolls
  // the page when the modal body overscrolls).
  useEffect(() => {
    if (!showConsentModal) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [showConsentModal]);

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
      revealNextAction();
    }
  }, [consentAccepted, revealNextAction]);

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
    ...(jdLocation ? [{ icon: MapPin, text: jdLocation }] : []),
    // The industry, not the department, describes the role here.
    ...(jdIndustryType?.trim() ? [{ icon: Factory, text: humanize(jdIndustryType.trim()) }] : []),
    ...(expStr ? [{ icon: Award, text: `${expStr} experience` }] : []),
  ];

  // Job facts first, then the interview's own (mode, questions) — each badge
  // only when backed by real data. In groups split by a small divider, as on
  // the assessment's Job & Consent step: the job (type, mode, level), the
  // interview mode (timed or conversational), then the question count. An
  // empty group is dropped so no divider stands alone.
  type RoleBadge = { key: string; icon: IconComponent; label: string };
  const roleBadgeGroups: RoleBadge[][] = [
    [
      ...(jdEmploymentType ? [{ key: 'employment', icon: Clock, label: humanize(jdEmploymentType) }] : []),
      ...(jdRemoteType ? [{ key: 'remote', icon: Globe, label: humanize(jdRemoteType) }] : []),
      ...(jdExperienceLevel ? [{ key: 'level', icon: TrendingUp, label: humanize(jdExperienceLevel) }] : []),
    ],
    /* 'flexible' interviews are conversational; every other mode ('fixed')
       is timed. */
    interviewMode === 'flexible'
      ? [{ key: 'mode', icon: MessagesSquare, label: 'Conversational' }]
      : [{ key: 'mode', icon: Timer, label: 'Timed' }],
    interviewMode !== 'flexible' && totalQuestions != null && totalQuestions > 0
      ? [{ key: 'questions', icon: HelpCircle, label: `${totalQuestions} ${totalQuestions === 1 ? 'question' : 'questions'}` }]
      : [],
  ].filter((group) => group.length > 0);

  /* "Jarvis David" → "JD"; a single name gives one letter. */
  const candidateInitials = (candidateName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part, i, parts) => (i === 0 || i === parts.length - 1 ? part[0] : ''))
    .join('')
    .toUpperCase();

  return (
    <div className="w-full space-y-6">

      {/* ── Two-column layout: details (left) + action panel (right) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-6 items-start">

        {/* ═══════════ LEFT COLUMN ═══════════ */}
        <div className="space-y-6 min-w-0">

          {/* Role card — the job, then every fact about it and about the
              interview as one continuous run of badges. */}
          <div className="relative overflow-hidden bg-white border border-gray-200 rounded-2xl shadow-sm">
            <div className="p-5 sm:p-6">
              {/* Title row: the role and its tagline on the left, the
                  candidate (name and email) in its top-right corner — under
                  them on a phone. */}
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
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
                {(candidateName || candidateEmail) && (
                  /* No card: a thin rule on its left (desktop) sets it apart,
                     then an initials avatar, the name and the email. */
                  <div className="flex items-center gap-2.5 min-w-0 self-start sm:self-center sm:max-w-[45%] sm:border-l sm:border-gray-200 sm:pl-4 sm:py-0.5">
                    <span
                      aria-hidden
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/20 text-brand-blue text-xs font-semibold shrink-0"
                    >
                      {candidateInitials || '?'}
                    </span>
                    <div className="min-w-0">
                      {candidateName && (
                        <p className="text-sm font-semibold text-gray-900 truncate" title={candidateName}>{candidateName}</p>
                      )}
                      {candidateEmail && (
                        <p className="text-xs text-gray-500 truncate" title={candidateEmail}>{candidateEmail}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {roleBadgeGroups.length > 0 && (
                <div className="mt-5 pt-4 border-t border-dashed border-gray-200 flex flex-wrap items-center gap-2">
                  {roleBadgeGroups.map((group, groupIndex) => (
                    <Fragment key={group[0].key}>
                      {groupIndex > 0 && (
                        <span aria-hidden className="mx-0.5 h-4 w-px bg-gray-300" />
                      )}
                      {group.map(badge => (
                        <span
                          key={badge.key}
                          className="inline-flex items-center gap-1.5 rounded-full border border-brand-blue/20 bg-brand-blue/10 px-3 py-1.5 text-xs font-medium text-brand-blue"
                        >
                          <badge.icon className="w-3.5 h-3.5 flex-shrink-0" />
                          {badge.label}
                        </span>
                      ))}
                    </Fragment>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* JD Description */}
          {jdDescription && (
            <div ref={jdRef} className="bg-brand-sky/40 dark:bg-brand-blue/10 border border-brand-blue/15 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-brand-blue/10 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white text-brand-blue border border-brand-blue/20 flex-shrink-0">
                  <FileText className="w-3.5 h-3.5" />
                </span>
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">About the Role</h2>
              </div>
              <div className="p-5">
                {/* The typography plugin's colours are pinned by the .jd-prose rules
                    below: the light values as before, and theme tokens under .dark
                    so the description follows dark mode like the rest of the page. */}
                <div
                  className="prose prose-sm max-w-none leading-relaxed
                    prose-headings:font-semibold
                    prose-p:my-1.5
                    prose-li:my-0.5
                    prose-a:no-underline
                    prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-normal prose-code:before:content-none prose-code:after:content-none
                    prose-pre:rounded-lg prose-pre:text-sm prose-pre:font-normal
                    [overflow-wrap:anywhere] prose-table:block prose-table:overflow-x-auto prose-pre:overflow-x-auto prose-img:max-w-full
                    text-gray-700"
                >
                  <style>{`
                    .jd-prose * { color: var(--raw-374151) !important; background-color: transparent !important; }
                    .jd-prose h1, .jd-prose h2, .jd-prose h3, .jd-prose h4 { color: var(--raw-111827) !important; }
                    .jd-prose strong { color: var(--raw-111827) !important; }
                    .jd-prose code { background-color: var(--raw-f3f4f6) !important; color: var(--raw-1f2937) !important; }
                    .jd-prose pre { background-color: var(--raw-f9fafb) !important; color: var(--raw-374151) !important; border: 1px solid var(--raw-e5e7eb) !important; }
                    .dark .jd-prose * { color: var(--text-secondary) !important; }
                    .dark .jd-prose h1, .dark .jd-prose h2, .dark .jd-prose h3, .dark .jd-prose h4, .dark .jd-prose strong { color: var(--text-primary) !important; }
                    .dark .jd-prose code, .dark .jd-prose pre { background-color: var(--surface-hover) !important; color: var(--text-primary) !important; border-color: var(--border) !important; }
                  `}</style>
                  <div className="jd-prose">
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{descToShow || ''}</ReactMarkdown>
                  </div>
                </div>
                {isLongDesc && (
                  <button
                    type="button"
                    onClick={() => {
                      const collapsing = showFullDesc;
                      setShowFullDesc(!showFullDesc);
                      // Collapsing a long JD leaves a phone scrolled far past
                      // it — bring the card's top back into view.
                      if (collapsing) revealAfterPaint(() => jdRef.current, 'start');
                    }}
                    className="inline-flex min-h-10 items-center -mb-2 text-sm text-brand-blue hover:text-brand-blue-2 mt-1 underline underline-offset-2"
                  >
                    {showFullDesc ? 'Show less' : 'Read more'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ═══════════ RIGHT COLUMN — action panel ═══════════ */}
        {/* Sticky below the pinned header + stepper (not under it). On short
            laptops the panel scrolls inside itself, so Proceed is always
            reachable without scrolling the whole JD first. */}
        <div className="lg:sticky lg:top-[calc(var(--tf-sticky-h,0px)+24px)] lg:max-h-[calc(100dvh-var(--tf-sticky-h,0px)-48px)] lg:overflow-y-auto bg-white border border-gray-200 rounded-2xl overflow-hidden min-w-0">

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
                  <label ref={mobileAckRef} className="mt-3 -my-1 py-1 flex items-start gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={mobileVerificationAcknowledged}
                      onChange={() => {
                        const next = !mobileVerificationAcknowledged;
                        setMobileVerificationAcknowledged(next);
                        if (next && consentAccepted) revealAfterPaint(() => proceedRef.current);
                      }}
                      className="mt-0.5 w-5 h-5 rounded border-gray-300 text-brand-blue focus:ring-brand-blue flex-shrink-0"
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
              {/* The whole row toggles consent (not just the 20px box), by
                  click, tap, Space or Enter. The "consent and terms" link
                  inside stops propagation so it only opens the modal. */}
              <div
                role="checkbox"
                aria-checked={consentAccepted}
                tabIndex={0}
                onClick={handleCheckboxClick}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); handleCheckboxClick(); }
                }}
                className="group flex items-start gap-3 cursor-pointer select-none rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40"
              >
                <span className={`hidden sm:flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0 transition-colors ${consentAccepted ? 'bg-success-subtle text-success' : 'bg-white text-brand-blue border border-brand-blue/20'}`}>
                  <Shield className="w-4 h-4" />
                </span>
                <div
                  aria-hidden
                  className={`mt-1 w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2 transition-all ${
                    consentAccepted ? 'bg-gray-900 border-gray-900' : 'border-gray-300 group-hover:border-gray-500'
                  }`}
                >
                  {consentAccepted && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                </div>
                <div className="text-sm text-gray-700 leading-relaxed min-w-0">
                  I accept the{' '}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setShowConsentModal(true); }}
                    onKeyDown={(e) => e.stopPropagation()}
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
                <div className="mt-3 ml-8 sm:ml-[4.75rem] flex items-center gap-2 text-success text-sm font-medium">
                  <CheckCircle className="w-4 h-4" />
                  All consents accepted
                </div>
              )}
            </div>
          </div>

          {/* Proceed button */}
          <div ref={proceedRef} className="px-5 pb-5">
            <Button
              type="button"
              variant="primary"
              size="lg"
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
            {/* Why Proceed is still disabled — a disabled button alone
                doesn't say what's missing. */}
            {!submitting && (!consentAccepted || mobileAckPending) && (
              <p className="mt-2 text-center text-xs text-gray-500">
                {!consentAccepted
                  ? 'Accept the consent and terms above to continue.'
                  : 'Confirm the mobile verification notice above to continue.'}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════
          CONSENT MODAL
      ═══════════════════════════════════════════════════ */}
      {showConsentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div
            role="dialog" aria-modal="true" aria-labelledby="consent-modal-title"
            className="bg-white rounded-2xl shadow-2xl w-full max-w-[95vw] sm:max-w-2xl max-h-[90dvh] flex flex-col"
          >

            {/* Modal header */}
            <div className="flex items-start justify-between gap-4 px-5 sm:px-7 pt-6 pb-4 flex-shrink-0">
              <div className="min-w-0">
                <h2 id="consent-modal-title" className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Privacy &amp; Consent</h2>
                <p className="mt-1 text-sm text-gray-500">Please review the information below before starting your AI interview.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowConsentModal(false)}
                className="p-2.5 -mr-2 -mt-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors flex-shrink-0"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal body (scrollable) - the reference's two columns, stacked
                as two rows to fit this width: what we collect, then Learn More. */}
            <div className="overflow-y-auto overscroll-contain flex-1 px-5 sm:px-7 pb-5 space-y-5">

              {/* Row 1 - what this interview collects */}
              <ul className="divide-y divide-gray-100">
                {DATA_USAGE_ITEMS.map(({ icon: Icon, title, desc }) => (
                  <li key={title} className="flex items-start gap-4 py-3.5">
                    <span className="w-11 h-11 rounded-full bg-brand-blue/5 text-brand-blue flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{title}</p>
                      <p className="mt-0.5 text-sm text-gray-500 leading-relaxed">{desc}</p>
                    </div>
                  </li>
                ))}
              </ul>

              {/* Row 2 - Learn More. Each card expands in place to its
                  details (policy, rights, retention). */}
              <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4 sm:p-5">
                <h3 className="text-lg font-bold text-gray-900">Learn More</h3>
                <p className="mt-0.5 text-sm text-gray-500">Read detailed information about your privacy, rights and data retention.</p>
                <div className="mt-4 space-y-3">
                  {LEARN_MORE_ITEMS.map(({ key, icon: Icon, title, desc }) => {
                    const open = openLearnMore === key;
                    return (
                      <div key={key} className="rounded-xl bg-white border border-gray-200 shadow-sm">
                        <button
                          type="button"
                          onClick={() => setOpenLearnMore(open ? null : key)}
                          aria-expanded={open}
                          className="w-full flex items-center gap-4 p-4 text-left rounded-xl hover:bg-gray-50/60 transition-colors"
                        >
                          <span className="w-11 h-11 rounded-full bg-brand-blue/5 text-gray-700 flex items-center justify-center flex-shrink-0">
                            <Icon className="w-5 h-5" />
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900">{title}</p>
                            <p className="mt-0.5 text-sm text-gray-500 leading-relaxed">{desc}</p>
                          </div>
                          <ChevronRight className={`w-5 h-5 text-brand-blue flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
                        </button>
                        {open && (
                          <div className="px-4 pb-4 sm:pl-[4.75rem] text-sm text-gray-600 space-y-2">
                            {key === 'privacy' && (
                              <>
                                <p>Your data is encrypted in transit and at rest. It is never sold or shared with third parties beyond what&apos;s needed for this recruitment process.</p>
                                <p>No automated hiring decision is made solely by AI &mdash; a human recruiter always reviews results.</p>
                                <p>A recording indicator will be visible throughout the interview.</p>
                              </>
                            )}
                            {key === 'rights' && (
                              <ul className="space-y-1.5">
                                {GDPR_RIGHTS.map(right => (
                                  <li key={right} className="flex items-start gap-2">
                                    <CheckCircle className="w-3.5 h-3.5 text-brand-blue mt-0.5 flex-shrink-0" /> {right}
                                  </li>
                                ))}
                              </ul>
                            )}
                            {key === 'retention' && (
                              <>
                                <p className="flex items-start gap-2">
                                  <Clock className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                                  <span>Retained for <strong className="text-gray-900">90 days</strong>, then automatically deleted.</span>
                                </p>
                                <p className="flex items-start gap-2">
                                  <Trash2 className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                                  You may request early deletion at any time.
                                </p>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
