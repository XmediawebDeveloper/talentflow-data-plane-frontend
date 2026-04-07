'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import {
  Clock,
  CheckCircle,
  AlertCircle,
  Monitor,
  Copy,
  BarChart3,
  FileText,
  Shield,
  Wifi,
  RefreshCcw,
  Coffee,
  HelpCircle,
  Check,
  Users,
  ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AssessmentInfo } from '@/lib/services/candidateService';

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
    { icon: Coffee, text: 'Complete the assessment in one sitting without interruption.' }
  ];

  const proctoringFeatures = [
    { icon: Monitor, label: 'Tab switching detection', description: 'Navigating away from the test tab will be recorded.' },
    { icon: Copy, label: 'Copy-paste monitoring', description: 'Attempts to copy questions or paste answers will be flagged.' },
    { icon: BarChart3, label: 'Pattern analysis', description: 'AI will analyze answer patterns for irregularities.' },
    { icon: Clock, label: 'Time tracking', description: 'Time spent on each question will be monitored.' }
  ];

  // Progress steps
  const steps = [
    { label: 'Terms & Consent', active: true, completed: false },
    { label: 'Assessment Details', active: false, completed: false },
    { label: 'System Check', active: false, completed: false },
    { label: 'Assessment', active: false, completed: false }
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" lang="en">
      {/* Sticky Header Container */}
      <div className="sticky top-0 z-50">
        {/* Header - Full Width */}
        <header className="w-full bg-white border-b border-gray-200">
          <div className="w-full px-6 lg:px-12 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Image
                  src="/talent_flow_logo.png"
                  alt="TalentFlow"
                  width={160}
                  height={40}
                  className="h-10 w-auto"
                  priority
                  unoptimized
                />
              </div>
              <a
                href="mailto:support@talentflow.com"
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                <HelpCircle className="w-4 h-4" />
                Need help?
              </a>
            </div>
          </div>
        </header>

        {/* Progress Stepper - Full Width */}
        <div className="w-full bg-white border-b border-gray-200">
          <div className="w-full px-6 lg:px-12 py-4">
            <div className="flex items-center justify-center gap-2">
              {steps.map((step, index) => (
                <div key={index} className="flex items-center">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                      step.completed
                        ? 'bg-green-500 text-white'
                        : step.active
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-300 text-gray-600'
                    }`}>
                      {step.completed ? <Check className="w-4 h-4" /> : index + 1}
                    </div>
                    <span className={`text-sm font-medium hidden sm:block ${
                      step.active ? 'text-gray-900' : step.completed ? 'text-green-600' : 'text-gray-500'
                    }`}>
                      {step.label}
                    </span>
                  </div>
                  {index < steps.length - 1 && (
                    <div className={`w-8 sm:w-16 h-0.5 mx-2 ${
                      step.completed ? 'bg-green-500' : 'bg-gray-300'
                    }`} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Hero Section */}
      <div className="w-full bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 py-10">
        <div className="w-full px-6 lg:px-12 text-center">
          <h1 className="text-3xl lg:text-4xl font-bold text-white mb-2">Welcome, {assessmentInfo.candidate_name}!</h1>
          <p className="text-blue-100 text-lg">
            Please review and accept the terms before starting your assessment
          </p>
        </div>
      </div>

      {/* Assessment Info Section */}
      <div className="w-full bg-white border-b border-gray-200 py-6">
        <div className="w-full px-6 lg:px-12">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center">
                <FileText className="w-7 h-7 text-blue-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">{assessmentInfo.assessment_title}</h2>
                <p className="text-blue-600">{assessmentInfo.jd_title}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-2 bg-blue-50 px-4 py-2 rounded-lg border border-blue-200">
                <Clock className="w-5 h-5 text-blue-600" />
                <span className="font-semibold text-blue-700">{assessmentInfo.duration_minutes} minutes</span>
              </span>
              <span className="flex items-center gap-2 bg-purple-50 px-4 py-2 rounded-lg border border-purple-200">
                <Shield className="w-5 h-5 text-purple-600" />
                <span className="font-semibold text-purple-700">Proctored</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - Full Width */}
      <main className="flex-1 w-full">
        {/* Important Instructions & Proctoring Section */}
        <div className="w-full bg-white border-b border-gray-200 py-8">
          <div className="w-full px-6 lg:px-12">
            <div className="grid lg:grid-cols-2 gap-8">
              {/* Important Instructions */}
              <div className="bg-amber-50 rounded-xl p-6 border border-amber-200">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                    <AlertCircle className="w-5 h-5 text-amber-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900 text-lg">Important Instructions</h3>
                </div>
                <ul className="space-y-4">
                  {importantInstructions.map((instruction, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <instruction.icon className="w-4 h-4 text-amber-600" />
                      </div>
                      <span className="text-gray-700 pt-1">{instruction.text}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* AI Proctoring */}
              <div className="bg-purple-50 rounded-xl p-6 border border-purple-200">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Monitor className="w-5 h-5 text-purple-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900 text-lg">AI Proctoring & Monitoring</h3>
                </div>
                <p className="text-sm text-gray-600 mb-4">
                  This assessment uses AI-powered proctoring to ensure fairness:
                </p>
                <div className="space-y-4">
                  {proctoringFeatures.map((feature, index) => (
                    <div key={index} className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <feature.icon className="w-4 h-4 text-purple-600" />
                      </div>
                      <div>
                        <p className="text-gray-900 font-medium">{feature.label}</p>
                        <p className="text-sm text-gray-500">{feature.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Terms & Conditions Section */}
        <div className="w-full bg-gray-50 border-b border-gray-200 py-8">
          <div className="w-full px-6 lg:px-12">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5 text-gray-600" />
              </div>
              <h3 className="font-semibold text-gray-900 text-lg">Terms & Conditions</h3>
            </div>
            <div
              className="bg-white rounded-xl p-6 max-h-52 sm:max-h-60 overflow-y-auto border border-gray-200"
              role="region"
              aria-label="Terms and Conditions"
              tabIndex={0}
            >
              <div className="space-y-5">
                {termsAndConditions.map((term, index) => (
                  <div key={index}>
                    <p className="font-semibold text-gray-900">{term.title}</p>
                    <p className="text-gray-600 mt-1">{term.content}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Consent Checkboxes Section */}
        <div className="w-full bg-white border-b border-gray-200 py-8">
          <div className="w-full px-6 lg:px-12">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-6" id="consent-heading">Your Consent</h3>
            <div className="space-y-4" role="group" aria-labelledby="consent-heading">
              {/* Terms Checkbox */}
              <label
                className={`flex items-start gap-4 p-5 rounded-xl border-2 cursor-pointer transition-all focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 ${
                  agreedTerms
                    ? 'border-green-500 bg-green-50'
                    : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                }`}
              >
                <div className={`w-6 h-6 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                  agreedTerms ? 'bg-green-500 border-green-500' : 'border-gray-400'
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
                />
                <span id="terms-desc">
                  <strong className="text-gray-900">I have read and agree to the Terms & Conditions</strong>
                  <br />
                  <span className="text-gray-500 text-sm">I understand that violation of these terms may result in disqualification.</span>
                </span>
              </label>

              {/* Proctoring Checkbox */}
              <label
                className={`flex items-start gap-4 p-5 rounded-xl border-2 cursor-pointer transition-all focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 ${
                  agreedProctoring
                    ? 'border-green-500 bg-green-50'
                    : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                }`}
              >
                <div className={`w-6 h-6 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                  agreedProctoring ? 'bg-green-500 border-green-500' : 'border-gray-400'
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
                />
                <span id="proctoring-desc">
                  <strong className="text-gray-900">I consent to AI proctoring and monitoring</strong>
                  <br />
                  <span className="text-gray-500 text-sm">I understand that my activity will be tracked to ensure test integrity.</span>
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Screen reader status announcement */}
        <div className="sr-only" aria-live="polite" role="status">
          {canAccept
            ? 'Both consent checkboxes accepted. You may now continue.'
            : `${!agreedTerms && !agreedProctoring ? 'Please accept both checkboxes' : !agreedTerms ? 'Please accept the Terms and Conditions' : 'Please accept AI proctoring consent'} to continue.`
          }
        </div>

        {/* Action Footer */}
        <div className="w-full bg-white py-8">
          <div className="w-full px-6 lg:px-12">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
              <Button
                variant="outline"
                onClick={onDecline}
                className="px-8 py-5 border-gray-300 text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAccept}
                disabled={!canAccept || isSubmitting}
                aria-disabled={!canAccept || isSubmitting}
                aria-label={!canAccept ? 'Accept both consent checkboxes to continue' : 'I Agree - Continue to assessment'}
                size="lg"
                className={`px-10 py-6 text-lg font-semibold rounded-xl ${
                  canAccept
                    ? 'bg-blue-600 hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2'
                    : 'bg-gray-300 cursor-not-allowed'
                } text-white`}
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Processing...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    I Agree - Continue
                    <ArrowRight className="w-5 h-5" aria-hidden="true" />
                  </span>
                )}
              </Button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-6 text-center bg-white border-t border-gray-200">
        <p className="text-gray-500">
          Having trouble? Contact us at{' '}
          <a href="mailto:support@talentflow.com" className="text-blue-600 hover:underline font-medium">
            support@talentflow.com
          </a>
        </p>
      </footer>
    </div>
  );
}
