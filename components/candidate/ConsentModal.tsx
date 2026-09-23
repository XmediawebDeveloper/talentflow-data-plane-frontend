'use client';

import { useState, useEffect } from 'react';
import {
  Clock,
  AlertCircle,
  Monitor,
  Copy,
  BarChart3,
  FileText,
  Shield,
  Wifi,
  RefreshCcw,
  Coffee,
  Check,
  ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import CandidateHeader from './CandidateHeader';
import CandidateStepper from './CandidateStepper';
/* The candidate flow's container — see the note on the constant. Each band
   keeps its full-bleed background and puts this inside it. */
import {
  CANDIDATE_PAGE,
  RECRUITER_SHELL,
  RECRUITER_WRAP,
  RECRUITER_CARD,
  PAGE_ICON_TILE,
  CARD_MUTED,
  T_PAGE_TITLE,
  T_PAGE_SUBTITLE,
  T_SECTION,
  T_CARD_TITLE,
  T_EYEBROW,
  T_BODY,
  T_HELP,
  ICON_TILE,
  ICON,
  ICON_INLINE,
  TILE_ACCENT,
} from '@/lib/constants/candidateLayout';
import { AssessmentInfo } from '@/lib/services/candidateService';
import { IS_PRODUCTION_ENV } from '@/lib/utils/env';
/* This screen is reached before the HR round is known, so its stepper shows
   four steps rather than five — the same list it already displayed. */
const CONSENT_STEPS = ['Terms & Consent', 'Assessment Details', 'System Check', 'Assessment'] as const;


interface ConsentModalProps {
  assessmentInfo: AssessmentInfo;
  onAccept: () => void;
  onDecline: () => void;
}

export function ConsentModal({ assessmentInfo, onAccept, onDecline }: ConsentModalProps) {
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedProctoring, setAgreedProctoring] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const canAccept = agreedTerms && agreedProctoring;

  const handleAccept = async () => {
    if (!canAccept) return;
    setIsSubmitting(true);
    try {
      await onAccept();
    } finally {
      setIsSubmitting(false);
    }
  };

  const termsAndConditions = [
    {
      title: '1. Assessment Integrity',
      content: 'By proceeding, you confirm that all answers will be your own original work. Plagiarism, cheating, or unauthorized assistance is strictly prohibited and may result in immediate disqualification.'
    },
    {
      title: '2. Honesty & Authenticity',
      content: 'You agree to answer all questions truthfully and to the best of your ability. All information provided will be verified during subsequent interview stages.'
    },
    {
      title: '3. Data Privacy & Usage',
      content: 'Your assessment responses, performance data, and analytics will be stored securely and used solely for recruitment evaluation purposes. Your data will be handled in accordance with our Privacy Policy and applicable data protection laws.'
    },
    {
      title: '4. Technical Requirements',
      content: 'You are responsible for ensuring your device, browser, and internet connection meet the technical requirements. Technical issues on your end may not qualify for retakes.'
    },
    {
      title: '5. Time Limits & Submissions',
      content: 'All sections must be completed within the allocated time. The system will auto-submit your assessment when time expires. Late submissions will not be accepted.'
    },
    {
      title: '6. Intellectual Property',
      content: 'All assessment questions, content, and materials are proprietary and confidential. You may not reproduce, share, or distribute any part of the assessment.'
    }
  ];

  const importantInstructions = [
    { icon: Clock, text: 'If a genuine network or client failure occurs, your session can recover and resume from the saved server state.' },
    { icon: RefreshCcw, text: 'You cannot return to previous sections once submitted.' },
    { icon: Wifi, text: 'Ensure you have a stable internet connection throughout the test.' },
    { icon: AlertCircle, text: 'Do not refresh the page or navigate away during the assessment.' },
    { icon: AlertCircle, text: IS_PRODUCTION_ENV
        ? 'Switching to another tab, minimising the window, Alt+Tab, the Windows/⌘ key, Esc or F11, or opening a Picture-in-Picture video ends the assessment immediately. There is no resume.'
        : 'Switching to another tab, minimising the window, Alt+Tab, the Windows/⌘ key, Esc or F11, or opening a Picture-in-Picture video is recorded as a violation for the recruiter.' },
    { icon: Monitor, text: 'You will be asked to share your ENTIRE screen. Your screen and webcam are recorded for the whole assessment and stored with your result.' },
    { icon: Coffee, text: 'Complete the assessment in one sitting without interruption.' }
  ];

  const proctoringFeatures = [
    { icon: Monitor, label: 'Tab switching detection', description: IS_PRODUCTION_ENV
        ? 'Leaving the test tab (switching tabs, minimising, Alt+Tab, Windows/⌘ key) terminates the assessment immediately.'
        : 'Leaving the test tab (switching tabs, minimising, Alt+Tab, Windows/⌘ key) is recorded as a violation.' },
    { icon: Monitor, label: 'Screen & webcam recording', description: 'Your entire screen and webcam are recorded during the assessment for recruiter review.' },
    { icon: Copy, label: 'Copy-paste monitoring', description: 'Attempts to copy questions or paste answers will be flagged.' },
    { icon: BarChart3, label: 'Pattern analysis', description: 'AI will analyze answer patterns for irregularities.' },
    { icon: Clock, label: 'Time tracking', description: 'Time spent on each question will be monitored.' }
  ];

  return (
    <div className={CANDIDATE_PAGE} lang="en">
      {/* Header + stepper: the shared pair. The logo here was `h-10` while
          Assessment Details drew it at `h-16`, so it grew as the candidate
          moved to the next screen. */}
      <div className="sticky top-0 z-50">
        <CandidateHeader />
        <CandidateStepper current={1} steps={CONSENT_STEPS} />
      </div>

      {/* The recruiter page shell. */}
      <main className={RECRUITER_SHELL}>
        <div className={RECRUITER_WRAP}>
          <div className={RECRUITER_CARD}>

            {/* Page header — the recruiter pattern. The blue hero band with a
                centred display-size "Welcome" that stood here is not a shape
                the signed-in UI has anywhere. */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
              <div className="flex items-start gap-3 min-w-0">
                <div className={PAGE_ICON_TILE}>
                  <FileText className={`${ICON} text-brand-blue`} />
                </div>
                <div className="min-w-0">
                  <h1 className={`${T_PAGE_TITLE} break-words`}>Welcome, {assessmentInfo.candidate_name}</h1>
                  <p className={`${T_PAGE_SUBTITLE} break-words`}>
                    Review and accept the terms before starting {assessmentInfo.assessment_title}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <span className="inline-flex items-center gap-2 bg-brand-blue/5 text-brand-blue px-3 py-1.5 rounded-lg ring-1 ring-brand-blue/20">
                  <Clock className={ICON_INLINE} />
                  <span className="text-sm font-medium whitespace-nowrap">{assessmentInfo.duration_minutes} minutes</span>
                </span>
                <span className="inline-flex items-center gap-2 bg-brand-cyan/5 text-brand-cyan px-3 py-1.5 rounded-lg ring-1 ring-brand-cyan/20">
                  <Shield className={ICON_INLINE} />
                  <span className="text-sm font-medium whitespace-nowrap">Proctored</span>
                </span>
              </div>
            </div>

            {/* Instructions + proctoring, as two cards in the page card. */}
            <div className="mb-5">
              <div className="grid lg:grid-cols-2 gap-3">
              {/* Important Instructions */}
              <div className="rounded-xl border border-warning-line bg-warning-subtle p-4 sm:p-5">
                <div className="flex items-center gap-3 mb-5">
                  <div className={`${ICON_TILE} bg-warning-subtle text-warning`}>
                    <AlertCircle className={ICON} />
                  </div>
                  <h3 className={T_SECTION}>Important Instructions</h3>
                </div>
                <ul className="space-y-4">
                  {importantInstructions.map((instruction, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <instruction.icon className={`${ICON_INLINE} text-warning mt-1`} />
                      <span className={T_BODY}>{instruction.text}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* AI Proctoring */}
              {/* The accent tone, not purple — purple-50/100/200/600/700 appears in
                  no token and carries no dark-mode value. */}
              <div className="rounded-xl border border-brand-cyan/20 bg-brand-cyan/5 p-4 sm:p-5">
                <div className="flex items-center gap-3 mb-5">
                  <div className={`${ICON_TILE} ${TILE_ACCENT}`}>
                    <Monitor className={ICON} />
                  </div>
                  <h3 className={T_SECTION}>AI Proctoring &amp; Monitoring</h3>
                </div>
                <p className={`${T_BODY} mb-4`}>
                  This assessment uses AI-powered proctoring to ensure fairness:
                </p>
                <div className="space-y-4">
                  {proctoringFeatures.map((feature, index) => (
                    <div key={index} className="flex items-start gap-3">
                      <feature.icon className={`${ICON_INLINE} text-brand-cyan mt-1`} />
                      <div className="min-w-0">
                        <p className={T_CARD_TITLE}>{feature.label}</p>
                        <p className={T_HELP}>{feature.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              </div>
            </div>

            {/* Terms & Conditions */}
            <div className="mb-5">
              <div className="flex items-center gap-3 mb-3">
              <div className={`${ICON_TILE} bg-gray-100 text-gray-600`}>
                <FileText className={ICON} />
              </div>
              <h3 className={T_SECTION}>Terms &amp; Conditions</h3>
            </div>
              <div
                className={`${CARD_MUTED} max-h-none md:max-h-80 overflow-visible md:overflow-y-auto`}
                role="region"
                aria-label="Terms and Conditions"
                tabIndex={0}
              >
                <div className="space-y-4">
                  {termsAndConditions.map((term, index) => (
                    <div key={index}>
                      <p className={T_CARD_TITLE}>{term.title}</p>
                      <p className={`${T_BODY} mt-1`}>{term.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Your Consent */}
            <div className="mb-5">
              <h2 className={`${T_EYEBROW} mb-3`} id="consent-heading">Your Consent</h2>
              <div className="space-y-3" role="group" aria-labelledby="consent-heading">
              {/* Terms Checkbox */}
              <label
                className={`flex items-start gap-3 p-3 sm:p-4 rounded-xl border cursor-pointer transition-all focus-within:ring-2 focus-within:ring-brand-blue focus-within:ring-offset-2 ${
                  agreedTerms
                    ? 'border-success-line bg-success-subtle'
                    : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                }`}
              >
                <div className={`w-6 h-6 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                  agreedTerms ? 'bg-success border-success-line' : 'border-gray-400'
                }`} aria-hidden="true">
                  {agreedTerms && <Check className="w-4 h-4 text-white" />}
                </div>
                <input
                  type="checkbox"
                  checked={agreedTerms}
                  onChange={(e) => setAgreedTerms(e.target.checked)}
                  className="sr-only"
                  aria-required="true"
                  aria-label="I have read and agree to the Terms and Conditions"
                  aria-describedby="terms-desc"
                />
                <span id="terms-desc">
                  <strong className={T_CARD_TITLE}>I have read and agree to the Terms &amp; Conditions</strong>
                  <br />
                  <span className={T_HELP}>I understand that violation of these terms may result in disqualification.</span>
                </span>
              </label>

              {/* Proctoring Checkbox */}
              <label
                className={`flex items-start gap-3 p-3 sm:p-4 rounded-xl border cursor-pointer transition-all focus-within:ring-2 focus-within:ring-brand-blue focus-within:ring-offset-2 ${
                  agreedProctoring
                    ? 'border-success-line bg-success-subtle'
                    : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                }`}
              >
                <div className={`w-6 h-6 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                  agreedProctoring ? 'bg-success border-success-line' : 'border-gray-400'
                }`} aria-hidden="true">
                  {agreedProctoring && <Check className="w-4 h-4 text-white" />}
                </div>
                <input
                  type="checkbox"
                  checked={agreedProctoring}
                  onChange={(e) => setAgreedProctoring(e.target.checked)}
                  className="sr-only"
                  aria-required="true"
                  aria-label="I consent to AI proctoring and monitoring"
                  aria-describedby="proctoring-desc"
                />
                <span id="proctoring-desc">
                  <strong className="text-gray-900">I consent to AI proctoring and monitoring</strong>
                  <br />
                  <span className="text-gray-700 text-sm">I understand that my activity will be tracked to ensure test integrity.</span>
                </span>
              </label>
              </div>
            </div>

            {/* Screen reader status announcement */}
        <div className="sr-only" aria-live="polite" role="status">
          {canAccept
            ? 'Both consent checkboxes accepted. You may now continue.'
            : `${!agreedTerms && !agreedProctoring ? 'Please accept both checkboxes' : !agreedTerms ? 'Please accept the Terms and Conditions' : 'Please accept AI proctoring consent'} to continue.`
          }
        </div>

            {/* Action row — the recruiter footer rule and button sizes. */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-gray-100">
              <Button variant="secondary" size="md" onClick={onDecline} className="w-full sm:w-auto">
                Cancel
              </Button>
              {/* The house primary Button carries its own brand-blue ground,
                  hover and focus ring. This was hand-painted blue-600/700 at
                  `px-10 py-6 text-lg`, which made it the largest button in the
                  flow in a colour that is in no token. */}
              <Button
                onClick={handleAccept}
                disabled={!canAccept || isSubmitting}
                aria-disabled={!canAccept || isSubmitting}
                aria-label={!canAccept ? 'Accept both consent checkboxes to continue' : 'I Agree - Continue to assessment'}
                variant="primary"
                size="md"
                className="w-full sm:w-auto"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Processing...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    I Agree - Continue
                    <ArrowRight className={ICON_INLINE} aria-hidden="true" />
                  </span>
                )}
              </Button>
            </div>

          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-5 text-center bg-white border-t border-gray-200">
        <p className={T_HELP}>
          Having trouble? Contact us at{' '}
          <a href="mailto:support@talentflow.com" className="text-brand-blue hover:underline font-medium break-all">
            support@talentflow.com
          </a>
        </p>
      </footer>
    </div>
  );
}
