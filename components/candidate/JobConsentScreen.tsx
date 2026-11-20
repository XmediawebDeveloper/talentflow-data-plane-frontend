'use client';

import { formatLocationGroups } from '@/lib/utils/jobOpeningDisplay';
import { Fragment, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import {
  AlertCircle,
  AlertTriangle,
  Award,
  BarChart3,
  Building2,
  Check,
  CheckCircle,
  ChevronRight,
  Clock,
  Code,
  Coffee,
  Copy,
  Eye,
  FileText,
  Globe,
  Loader2,
  MapPin,
  Monitor,
  RefreshCcw,
  Settings,
  Shield,
  Timer,
  TrendingUp,
  Users,
  Video,
  Wifi,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { revealAfterPaint } from '@/lib/utils/candidateScroll';
import CandidateHeader from './CandidateHeader';
import CandidateStepper from './CandidateStepper';
import { AssessmentInfo } from '@/lib/services/candidateService';
import { IS_PRODUCTION_ENV } from '@/lib/utils/env';
import {
  CANDIDATE_PAGE,
  RECRUITER_SHELL,
  RECRUITER_WRAP,
  T_SECTION,
  T_EYEBROW,
  T_BODY,
} from '@/lib/constants/candidateLayout';
import { ModalA11y } from '@/components/ui/modal-a11y';
import { IconButton } from '@/components/ui/icon-button';

/**
 * Step 1 of the candidate assessment flow — "Job & Consent".
 *
 * Merges what used to be two steps, Terms & Consent and Assessment Details,
 * into one screen: the role and the assessment on the left, the terms and the
 * two consent checkboxes in a panel on the right (sticky on desktop, after the
 * job details on smaller screens).
 *
 * The portal keeps its own `consent` and `landing` steps and their handlers
 * unchanged; both render this screen. `consentAccepted` says which of the two
 * it is standing in for:
 *   - false → the consent panel is live. Continue records consent and then
 *     moves on to System Check (`onContinue` does both, in that order).
 *   - true  → consent was already given (a refresh, or Back from System
 *     Check), so the panel shows it as accepted and Continue goes straight on.
 */

interface JobConsentScreenProps {
  assessmentInfo: AssessmentInfo;
  /** Whether the candidate already accepted the terms on an earlier visit. */
  consentAccepted: boolean;
  /** Record consent if needed, then go on to System Check. */
  onContinue: () => Promise<void> | void;
  onDecline: () => void;
}

const TERMS = [
  {
    title: '1. Assessment Integrity',
    content: 'By proceeding, you confirm that all answers will be your own original work. Plagiarism, cheating, or unauthorized assistance is strictly prohibited and may result in immediate disqualification.',
  },
  {
    title: '2. Honesty & Authenticity',
    content: 'You agree to answer all questions truthfully and to the best of your ability. All information provided will be verified during subsequent interview stages.',
  },
  {
    title: '3. Data Privacy & Usage',
    content: 'Your assessment responses, performance data, and analytics will be stored securely and used solely for recruitment evaluation purposes. Your data will be handled in accordance with our Privacy Policy and applicable data protection laws.',
  },
  {
    title: '4. Technical Requirements',
    content: 'You are responsible for ensuring your device, browser, and internet connection meet the technical requirements. Technical issues on your end may not qualify for retakes.',
  },
  {
    title: '5. Time Limits & Submissions',
    content: 'All sections must be completed within the allocated time. The system will auto-submit your assessment when time expires. Late submissions will not be accepted.',
  },
  {
    title: '6. Intellectual Property',
    content: 'All assessment questions, content, and materials are proprietary and confidential. You may not reproduce, share, or distribute any part of the assessment.',
  },
];

const KEY_RULES: { icon: typeof Clock; title: string; text: string; critical?: boolean }[] = [
  { icon: Clock, title: 'Auto-recovery', text: 'If a genuine network or client failure occurs, your session can recover and resume from the saved server state.' },
  { icon: RefreshCcw, title: 'No going back', text: 'You cannot return to previous sections once submitted.' },
  { icon: Wifi, title: 'Stable internet', text: 'Ensure you have a stable internet connection throughout the test.' },
  { icon: AlertCircle, title: "Don't refresh", text: 'Do not refresh the page or navigate away during the assessment.' },
  {
    icon: AlertCircle,
    critical: true,
    title: 'Stay on this tab',
    text: IS_PRODUCTION_ENV
      ? 'Switching to another tab, minimising the window, Alt+Tab, the Windows/⌘ key, Esc or F11, or opening a Picture-in-Picture video ends the assessment immediately. There is no resume.'
      : 'Switching to another tab, minimising the window, Alt+Tab, the Windows/⌘ key, Esc or F11, or opening a Picture-in-Picture video is recorded as a violation for the recruiter.',
  },
  { icon: Monitor, critical: true, title: 'Share your entire screen', text: 'You will be asked to share your ENTIRE screen. Your screen and webcam are recorded for the whole assessment and stored with your result.' },
  { icon: Coffee, title: 'One sitting', text: 'Complete the assessment in one sitting without interruption.' },
];

const PROCTORING = [
  {
    icon: Monitor,
    label: 'Tab switching detection',
    description: IS_PRODUCTION_ENV
      ? 'Leaving the test tab (switching tabs, minimising, Alt+Tab, Windows/⌘ key) terminates the assessment immediately.'
      : 'Leaving the test tab (switching tabs, minimising, Alt+Tab, Windows/⌘ key) is recorded as a violation.',
  },
  { icon: Monitor, label: 'Screen & webcam recording', description: 'Your entire screen and webcam are recorded during the assessment for recruiter review.' },
  { icon: Copy, label: 'Copy-paste monitoring', description: 'Attempts to copy questions or paste answers will be flagged.' },
  { icon: BarChart3, label: 'Pattern analysis', description: 'AI will analyze answer patterns for irregularities.' },
  { icon: Clock, label: 'Time tracking', description: 'Time spent on each question will be monitored.' },
];

const formatDuration = (minutes: number) => {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours} hour${hours > 1 ? 's' : ''}`;
};

/* Stored values are lower-case slugs ("full-time", "onsite") — shown as words. */
const asLabel = (value?: string | null) =>
  value?.trim()
    ? value.trim().replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : null;

/** "Before You Begin" — what the candidate needs ready, as the AI
 *  interview's consent step lists it. */
const BEFORE_YOU_BEGIN = [
  { icon: Video, text: 'Camera and microphone access are required' },
  { icon: Wifi, text: 'Ensure you have a stable internet connection throughout the assessment.' },
  { icon: Monitor, text: 'You will be asked to share your entire screen while you take the assessment.' },
  { icon: Eye, text: 'Your screen, webcam and answers are recorded and analyzed as part of the assessment.' },
];

/** The "consent and terms" popup: the key rules, what is proctored, and the
 *  full terms — everything the consent checkbox accepts. "I Agree" ticks the
 *  checkbox and closes; closing without agreeing changes nothing. */
function TermsDialog({
  onClose,
  onAgree,
  agreed,
}: {
  onClose: () => void;
  onAgree: () => void;
  agreed: boolean;
}) {
  // Esc closes; the page behind stops scrolling while it is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <ModalA11y innerDialog closeOnEscape={false}><div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="terms-dialog-title"
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-[95vw] sm:max-w-3xl max-h-[90dvh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-5 sm:px-7 pt-6 pb-4 border-b border-gray-100 shrink-0">
          <div className="min-w-0">
            <h2 id="terms-dialog-title" className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900">Consent &amp; Terms</h2>
            <p className="mt-1 tf-body-muted">Please review the rules, proctoring and terms below before starting your assessment.</p>
          </div>
          <IconButton bare label="Close"
            type="button"
            onClick={onClose}
            className="p-2.5 -mr-2 -mt-1 rounded-lg text-gray-500 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </IconButton>
        </div>

        {/* Body (scrolls) */}
        <div className="overflow-y-auto overscroll-contain flex-1 px-5 sm:px-7 py-5 space-y-6">

          {/* Key rules — the two that can end or flag the attempt tinted red. */}
          <section aria-labelledby="instructions-heading">
            <div className="flex items-center gap-2 mb-2.5">
              <AlertCircle className="w-4 h-4 text-warning" />
              <h3 id="instructions-heading" className={T_SECTION}>Key rules</h3>
            </div>
            <ul className="tf-grid-2">
              {KEY_RULES.map((rule, index) => (
                <li
                  key={rule.title}
                  className={`rounded-lg border px-3 py-2.5 ${
                    /* An odd last rule spans the row rather than leaving a hole. */
                    KEY_RULES.length % 2 === 1 && index === KEY_RULES.length - 1 ? 'sm:col-span-2 ' : ''
                  }${rule.critical ? 'border-destructive-line bg-destructive-subtle/50' : 'border-gray-200 bg-white'}`}
                >
                  <p className={`flex items-center gap-1.5 text-sm font-semibold ${rule.critical ? 'text-destructive-strong' : 'text-gray-900'}`}>
                    <rule.icon className={`w-3.5 h-3.5 shrink-0 ${rule.critical ? 'text-destructive' : 'text-warning'}`} />
                    {rule.title}
                  </p>
                  <p className="mt-1 tf-meta leading-relaxed">{rule.text}</p>
                </li>
              ))}
            </ul>
          </section>

          {/* What is monitored. */}
          <section aria-labelledby="proctoring-heading">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mb-2.5">
              <h3 id="proctoring-heading" className={`${T_SECTION} flex items-center gap-2 self-center`}>
                <Shield className="w-4 h-4 text-brand-cyan" />
                AI proctoring
              </h3>
              <span className="tf-meta">— this assessment is monitored to keep it fair</span>
            </div>
            <ul className="tf-grid-2">
              {PROCTORING.map((feature, index) => (
                <li
                  key={feature.label}
                  className={`rounded-lg bg-brand-cyan/5 ring-1 ring-brand-cyan/15 px-3 py-2.5 ${
                    PROCTORING.length % 2 === 1 && index === PROCTORING.length - 1 ? 'sm:col-span-2' : ''
                  }`}
                >
                  <p className="flex items-center gap-1.5 tf-row-title">
                    <feature.icon className="w-3.5 h-3.5 shrink-0 text-brand-cyan" />
                    {feature.label}
                  </p>
                  <p className="mt-1 tf-meta leading-relaxed">{feature.description}</p>
                </li>
              ))}
            </ul>
          </section>

          {/* The full terms. */}
          <section aria-labelledby="terms-heading">
            <div className="flex items-center gap-2 mb-2.5">
              <FileText className="w-4 h-4 text-gray-600" />
              <h3 id="terms-heading" className={T_SECTION}>Terms &amp; Conditions</h3>
            </div>
            <div className="rounded-xl bg-slate-50 ring-1 ring-gray-200 p-4 space-y-3">
              {TERMS.map((term) => (
                <div key={term.title}>
                  <p className="tf-row-title">{term.title}</p>
                  <p className="tf-meta leading-relaxed mt-0.5">{term.content}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 px-5 sm:px-7 py-4 border-t border-gray-100 shrink-0">
          <Button variant="secondary" size="md" onClick={onClose} className="w-full sm:w-auto">
            Close
          </Button>
          {!agreed && (
            <Button variant="primary" size="md" onClick={onAgree} className="w-full sm:w-auto">
              <Check className="w-4 h-4" />
              I Agree
            </Button>
          )}
        </div>
      </div>
    </div></ModalA11y>
  );
}

export function JobConsentScreen({ assessmentInfo, consentAccepted, onContinue, onDecline }: JobConsentScreenProps) {
  // One tick accepts the terms and AI proctoring together, as on the AI
  // interview. Locked on once consent is already on record.
  const [agreed, setAgreed] = useState(consentAccepted);
  const [showTerms, setShowTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [jdDescriptionExpanded, setJdDescriptionExpanded] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const canContinue = consentAccepted || agreed;
  /* "Jarvis David" → "JD"; a single name gives one letter. */
  const candidateInitials = (assessmentInfo.candidate_name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part, i, parts) => (i === 0 || i === parts.length - 1 ? part[0] : ''))
    .join('')
    .toUpperCase() || '?';
  // Ticking consent brings Continue into view (only if it is hidden — below
  // the fold or cut off by the consent panel's own scroll), as on the AI
  // interview's consent step.
  const continueRef = useRef<HTMLDivElement>(null);
  const revealContinue = () => revealAfterPaint(() => continueRef.current, 'nearest');
  const toggleAgreed = () => {
    if (consentAccepted) return;
    const next = !agreed;
    setAgreed(next);
    if (next) revealContinue();
  };

  const handleContinue = async () => {
    if (!canContinue || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onContinue();
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── The role ────────────────────────────────────────────────────────────
  const rounds = [
    { type: 'hr', enabled: assessmentInfo.has_hr_round, name: 'HR Round', icon: Users, iconClass: '' },
    /* The gear the question screen shows for this round, tilted the same way. */
    { type: 'technical', enabled: assessmentInfo.has_technical_round, name: 'Technical Round', icon: Settings, iconClass: 'rotate-[20deg]' },
    { type: 'coding', enabled: assessmentInfo.has_coding_round, name: 'Coding Round', icon: Code, iconClass: '' },
  ].filter((r) => r.enabled);

  const jdDescription = assessmentInfo.jd_description?.trim() || '';
  const jdAdditionalDetails = assessmentInfo.jd_additional_details?.trim() || '';
  const { jd_experience_min: expMin, jd_experience_max: expMax } = assessmentInfo;
  const experience = expMin != null && expMax != null
    ? (expMin === expMax ? `${expMin} yrs experience` : `${expMin}–${expMax} yrs experience`)
    : expMin != null ? `${expMin}+ yrs experience`
    : expMax != null ? `Up to ${expMax} yrs experience`
    : null;
  type Fact = { label: string; Icon: typeof Building2; iconClass?: string };
  const present = (f: { label: string | null } & Omit<Fact, 'label'>): f is Fact => !!f.label;
  /* Under the title: where the role sits. An empty field is left out. */
  const briefMeta: Fact[] = [
    /* The industry leads the line; the department stands in only when the
       JD has no industry, so the line never loses its first fact. */
    { label: asLabel(assessmentInfo.jd_industry_type) || assessmentInfo.jd_department?.trim() || null, Icon: Building2 },
    { label: experience, Icon: Award },
    /* One entry per state, as "State: City, City" - every saved location, not just the first city. */
    ...formatLocationGroups(assessmentInfo.jd_locations, assessmentInfo.jd_location).map((label) => ({ label, Icon: MapPin })),
  ].filter(present);
  /* The pills: the rest of the role, then this assessment's own facts. */
  /* In three groups, split by a small divider: the role (type, mode,
     level), the assessment's length, then its rounds. An empty group is
     dropped so no divider stands alone. */
  const briefPillGroups: Fact[][] = [
    [
      { label: asLabel(assessmentInfo.jd_employment_type), Icon: Clock },
      { label: asLabel(assessmentInfo.jd_remote_type), Icon: Globe },
      { label: asLabel(assessmentInfo.jd_job_level), Icon: TrendingUp },
    ].filter(present),
    [{ label: `${formatDuration(assessmentInfo.duration_minutes)} assessment`, Icon: Timer }],
    rounds.map((round) => ({ label: round.name, Icon: round.icon, iconClass: round.iconClass })),
  ].filter((group) => group.length > 0);
  /* A long description reads behind "Read more" so the rest is not pushed off the page. */
  const JD_DESCRIPTION_CLAMP = 1200;
  const jdDescriptionLong = jdDescription.length > JD_DESCRIPTION_CLAMP;
  const hasJd = !!jdDescription || !!jdAdditionalDetails;

  return (
    <div className={CANDIDATE_PAGE} lang="en">
      <div className="sticky top-0 z-50">
        <CandidateHeader />
        <CandidateStepper current={1} />
      </div>

      <main className={RECRUITER_SHELL}>
        <div className={RECRUITER_WRAP}>
          <div className="px-4 md:px-8 py-4 md:py-6">

            {/* Two columns on desktop: the job on the left, the consent panel
                on the right. One column below `lg`, with the consent panel
                last, right above where the candidate acts. */}
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px] gap-5 xl:gap-6 items-start">

              {/* ── Left: the job ─────────────────────────────────────── */}
              <div className="min-w-0 space-y-5">

                {/* Job brief — as on the AI interview's first step: the role
                    as the page heading, its department / experience / location
                    on one line, then the rest of the role and the assessment's
                    own facts as pills. */}
                <section className="tf-card-soft p-5 min-w-0">
                  {/* Title row: the role and its tagline on the left, the
                      candidate (name and email) in its top-right corner — under
                      them on a phone. */}
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wider text-brand-blue">You&apos;re being assessed for</p>
                      <h1 className="mt-1 text-xl sm:text-2xl font-bold leading-tight text-gray-900 break-words">
                        {assessmentInfo.jd_title || assessmentInfo.assessment_title}
                      </h1>
                      {briefMeta.length > 0 && (
                        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 sm:gap-x-2 gap-y-1 tf-body-muted">
                          {briefMeta.map(({ label, Icon }, index) => (
                            <span key={label} className="inline-flex items-center gap-1.5 min-w-0">
                              {/* Dot separators only where the line stays on one row; on a
                                  phone the facts wrap, and a dot would start the next line. */}
                              {index > 0 && <span aria-hidden className="hidden sm:block w-1 h-1 rounded-full bg-gray-300 mr-0.5" />}
                              <Icon className="w-3.5 h-3.5 shrink-0 text-gray-500" aria-hidden="true" />
                              <span className="break-words">{label}</span>
                            </span>
                          ))}
                        </p>
                      )}
                    </div>
                    {/* No card: a thin rule on its left (desktop) sets it apart,
                        then an initials avatar, the name and the email. */}
                    <div className="flex items-center gap-2.5 min-w-0 self-start sm:self-center sm:shrink-0 sm:max-w-[45%] sm:border-l sm:border-gray-200 sm:pl-4 sm:py-0.5">
                      <span
                        aria-hidden
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/20 text-brand-blue text-xs font-semibold shrink-0"
                      >
                        {candidateInitials}
                      </span>
                      <div className="min-w-0">
                        <p className="tf-row-title truncate" title={assessmentInfo.candidate_name}>
                          {assessmentInfo.candidate_name}
                        </p>
                        <p className="tf-meta break-all" title={assessmentInfo.candidate_email}>
                          {assessmentInfo.candidate_email}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 pt-3.5 border-t border-dashed border-gray-200 flex flex-wrap items-center gap-1.5">
                    {briefPillGroups.map((group, groupIndex) => (
                      <Fragment key={group[0].label}>
                        {groupIndex > 0 && (
                          <span aria-hidden className="mx-1 h-4 w-px bg-gray-300" />
                        )}
                        {group.map(({ label, Icon, iconClass }) => (
                          <span
                            key={label}
                            className="tf-badge gap-1.5 border border-brand-blue/20 bg-brand-blue/10 text-brand-blue"
                          >
                            <Icon className={`w-3.5 h-3.5 shrink-0 ${iconClass ?? ''}`} aria-hidden="true" />
                            {label}
                          </span>
                        ))}
                      </Fragment>
                    ))}
                  </div>
                </section>

                {/* About the role — the JD's own text and notes. */}
                {hasJd && (
                  <section aria-labelledby="jd-heading" className="rounded-2xl border border-brand-blue/10 bg-slate-50 overflow-hidden min-w-0">
                    <div className="flex items-center gap-2 px-5 py-2.5 border-b border-brand-blue/10 bg-brand-blue/[0.03]">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white border border-brand-blue/20 text-brand-blue shrink-0">
                        <FileText className="w-3.5 h-3.5" />
                      </span>
                      <h2 id="jd-heading" className="tf-row-title uppercase tracking-wide">About the role</h2>
                    </div>

                    <div className="p-5 space-y-4 min-w-0">
                      {jdDescription && (
                        <div className="min-w-0">
                          <div className="relative">
                            <div
                              id="candidate-jd-description"
                              className={`prose prose-sm max-w-none min-w-0 break-words text-gray-700 leading-relaxed prose-headings:font-semibold prose-headings:text-gray-900 prose-strong:text-gray-900 prose-p:my-1.5 prose-li:my-0.5 prose-a:text-brand-blue prose-pre:overflow-x-auto ${jdDescriptionLong && !jdDescriptionExpanded ? 'max-h-96 overflow-hidden' : ''}`}
                            >
                              <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{jdDescription}</ReactMarkdown>
                            </div>
                            {jdDescriptionLong && !jdDescriptionExpanded && (
                              <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-slate-50 to-transparent" />
                            )}
                          </div>
                          {jdDescriptionLong && (
                            <button
                              type="button"
                              onClick={() => setJdDescriptionExpanded((expanded) => !expanded)}
                              aria-expanded={jdDescriptionExpanded}
                              aria-controls="candidate-jd-description"
                              className="mt-2 text-sm font-medium text-brand-blue underline underline-offset-2 hover:text-brand-blue-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 rounded"
                            >
                              {jdDescriptionExpanded ? 'Show less' : 'Read more'}
                            </button>
                          )}
                        </div>
                      )}

                      {jdAdditionalDetails && (
                        <div className="rounded-xl bg-white ring-1 ring-gray-200 p-4">
                          <h3 className={`${T_EYEBROW} mb-2`}>Additional Details</h3>
                          <p className={`${T_BODY} whitespace-pre-wrap break-words`}>{jdAdditionalDetails}</p>
                        </div>
                      )}
                    </div>
                  </section>
                )}
              </div>

              {/* ── Right: before you begin + consent ─────────────────── */}
              {/* Sticky on desktop, clear of the pinned header + stepper (the
                  stepper is taller below `xl`, where it shows its step line
                  and labelled columns). Capped to the space left under them,
                  so Continue stays on screen on a 768px-tall laptop. */}
              <aside
                aria-labelledby="before-you-begin-heading"
                className="tf-card-soft min-w-0 lg:sticky lg:top-52 xl:top-40 lg:max-h-[calc(100dvh-14rem)] xl:max-h-[calc(100dvh-11rem)] lg:overflow-y-auto"
              >
                {/* Before You Begin — the AI interview's list. */}
                <div className="p-5 pb-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-orange/10 text-brand-orange shrink-0">
                      <AlertTriangle className="w-4 h-4" />
                    </span>
                    <h2 id="before-you-begin-heading" className="tf-row-title">Before You Begin</h2>
                  </div>
                  <ul className="space-y-2.5">
                    {BEFORE_YOU_BEGIN.map(({ icon: Icon, text }) => (
                      <li key={text} className="flex items-start gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-blue/10 text-brand-blue shrink-0">
                          <Icon className="w-4 h-4" />
                        </span>
                        <span className="tf-body-secondary leading-snug pt-1.5">{text}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Consent — the whole row toggles it (click, tap, Space or
                    Enter); the "consent and terms" link inside only opens the
                    popup. Once consent is on record the row is locked on. */}
                <div className="px-5 py-4 border-t border-gray-100">
                  <div className={`rounded-xl p-3.5 transition-colors ${agreed ? 'bg-success-subtle/40 border border-success-line' : 'bg-brand-blue/5 border border-brand-blue/15'}`}>
                    <div
                      role="checkbox"
                      aria-checked={agreed}
                      aria-disabled={consentAccepted}
                      tabIndex={consentAccepted ? -1 : 0}
                      onClick={toggleAgreed}
                      onKeyDown={(e) => {
                        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleAgreed(); }
                      }}
                      className={`group flex items-start gap-3 select-none rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 ${consentAccepted ? 'cursor-default' : 'cursor-pointer'}`}
                    >
                      <span className={`hidden sm:flex h-8 w-8 items-center justify-center rounded-lg shrink-0 transition-colors ${agreed ? 'bg-success-subtle text-success' : 'bg-white text-brand-blue border border-brand-blue/20'}`}>
                        <Shield className="w-4 h-4" />
                      </span>
                      <span
                        aria-hidden
                        className={`mt-1 w-5 h-5 rounded flex items-center justify-center shrink-0 border-2 transition-all ${
                          agreed ? 'bg-gray-900 border-gray-900' : 'border-gray-300 group-hover:border-gray-500'
                        }`}
                      >
                        {agreed && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                      </span>
                      <div className="tf-body leading-relaxed min-w-0">
                        I accept the{' '}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setShowTerms(true); }}
                          onKeyDown={(e) => e.stopPropagation()}
                          className="text-gray-900 font-semibold underline underline-offset-2 hover:text-gray-600 transition-colors"
                        >
                          consent and terms
                        </button>
                        {' '}for AI Assessment
                        <p className="tf-meta mt-1">
                          Checking this box accepts all consents. Click &ldquo;consent and terms&rdquo; to review them.
                        </p>
                      </div>
                    </div>
                    {agreed && (
                      <div className="mt-3 ml-8 sm:ml-[4.75rem] flex items-center gap-2 text-success text-sm font-medium">
                        <CheckCircle className="w-4 h-4" />
                        {consentAccepted ? 'Consent already accepted' : 'All consents accepted'}
                      </div>
                    )}
                  </div>
                </div>

                <div className="sr-only" aria-live="polite" role="status">
                  {canContinue ? 'Consent accepted. You may now continue.' : 'Accept the consent and terms to continue.'}
                </div>

                <div ref={continueRef} className="px-5 pb-5">
                  <Button
                    onClick={handleContinue}
                    disabled={!canContinue || isSubmitting}
                    aria-disabled={!canContinue || isSubmitting}
                    variant="primary"
                    size="md"
                    className="w-full"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        Continue to System Check
                        <ChevronRight className="w-4 h-4" aria-hidden="true" />
                      </>
                    )}
                  </Button>
                  {!canContinue && (
                    <p className="mt-2 text-center tf-meta">Accept the consent and terms above to continue.</p>
                  )}
                  {!consentAccepted && (
                    <button
                      type="button"
                      onClick={onDecline}
                      disabled={isSubmitting}
                      className="mt-2 w-full text-center text-sm font-medium text-gray-500 hover:text-gray-700 hover:underline disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </aside>
            </div>
          </div>
        </div>
      </main>

      {/* As the AI interview's footer: "Need help?" muted, the contact line darker. */}
      <footer className="w-full py-5 text-center bg-white border-t border-gray-200">
        <p className="tf-body-muted">
          Need help?{' '}
          <a href="mailto:support@talentflow.com" className="font-medium text-gray-700 hover:text-brand-blue hover:underline break-all">
            Contact support@talentflow.com
          </a>
        </p>
      </footer>

      {showTerms && (
        <TermsDialog
          agreed={agreed}
          onClose={() => setShowTerms(false)}
          onAgree={() => { setAgreed(true); setShowTerms(false); revealContinue(); }}
        />
      )}
    </div>
  );
}
