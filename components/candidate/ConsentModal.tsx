'use client';

import { useState } from 'react';
import Image from 'next/image';
import {
  Clock,
  CheckCircle,
  AlertCircle,
  Monitor,
  Copy,
  BarChart3,
  Timer,
  FileText,
  Shield,
  Wifi,
  RefreshCcw,
  Coffee,
  HelpCircle,
  Mail,
  Check
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
    { icon: Timer, text: 'Once started, the timer cannot be paused or stopped.' },
    { icon: RefreshCcw, text: 'You cannot return to previous sections once submitted.' },
    { icon: Wifi, text: 'Ensure you have a stable internet connection throughout the test.' },
    { icon: AlertCircle, text: 'Do not refresh the page or navigate away during the assessment.' },
    { icon: Coffee, text: 'Complete the assessment in one sitting without interruption.' }
  ];

  const proctoringFeatures = [
    { icon: Monitor, label: 'Tab switching detection', description: 'Navigating away from the test tab will be recorded.' },
    { icon: Copy, label: 'Copy-paste monitoring', description: 'Attempts to copy questions or paste answers will be flagged.' },
    { icon: BarChart3, label: 'Pattern analysis', description: 'AI will analyze answer patterns for irregularities.' },
    { icon: Timer, label: 'Time tracking', description: 'Time spent on each question will be monitored.' }
  ];

  // Progress steps
  const steps = [
    { label: 'Terms & Consent', active: true, completed: false },
    { label: 'Assessment Details', active: false, completed: false },
    { label: 'System Check', active: false, completed: false },
    { label: 'Assessment', active: false, completed: false }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50">
      {/* Header with Logo */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Image
                src="/talent_flow_logo.png"
                alt="TalentFlow"
                width={140}
                height={36}
                className="h-9 w-auto"
                priority
              />
            </div>
            <a
              href="mailto:support@talentflow.com"
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-purple-600 transition-colors"
            >
              <HelpCircle className="w-4 h-4" />
              Need help?
            </a>
          </div>
        </div>
      </header>

      {/* Progress Stepper */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-center gap-2">
            {steps.map((step, index) => (
              <div key={index} className="flex items-center">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                    step.completed
                      ? 'bg-green-500 text-white'
                      : step.active
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-200 text-gray-500'
                  }`}>
                    {step.completed ? <Check className="w-4 h-4" /> : index + 1}
                  </div>
                  <span className={`text-sm font-medium hidden sm:block ${
                    step.active ? 'text-purple-600' : 'text-gray-500'
                  }`}>
                    {step.label}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div className={`w-8 sm:w-16 h-0.5 mx-2 ${
                    step.completed ? 'bg-green-500' : 'bg-gray-200'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Welcome Section */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome, {assessmentInfo.candidate_name}!
          </h1>
          <p className="text-gray-600">
            Please review and accept the terms before starting your assessment
          </p>
        </div>

        {/* Assessment Info Card */}
        <div className="bg-gradient-to-r from-purple-600 via-purple-500 to-indigo-500 rounded-2xl p-6 mb-8 text-white shadow-lg">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-semibold mb-1">{assessmentInfo.assessment_title}</h2>
              <p className="text-purple-100 text-sm mb-4">{assessmentInfo.jd_title}</p>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <span className="flex items-center gap-2 bg-white/20 px-3 py-1.5 rounded-full">
                  <Clock className="w-4 h-4" />
                  {assessmentInfo.duration_minutes} minutes
                </span>
                <span className="flex items-center gap-2 bg-white/20 px-3 py-1.5 rounded-full">
                  <Shield className="w-4 h-4" />
                  Proctored
                </span>
                {assessmentInfo.company_name && (
                  <span className="text-purple-100">
                    by {assessmentInfo.company_name}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6 mb-8">
          {/* Important Instructions */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-orange-50 border-b border-orange-100">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-orange-500" />
                <h3 className="font-semibold text-gray-900">Important Instructions</h3>
              </div>
            </div>
            <div className="p-6">
              <ul className="space-y-4">
                {importantInstructions.map((instruction, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <instruction.icon className="w-4 h-4 text-orange-600" />
                    </div>
                    <span className="text-sm text-gray-700 pt-1.5">{instruction.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* AI Proctoring */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-purple-50 border-b border-purple-100">
              <div className="flex items-center gap-2">
                <Monitor className="w-5 h-5 text-purple-600" />
                <h3 className="font-semibold text-gray-900">AI Proctoring & Monitoring</h3>
              </div>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-600 mb-4">
                This assessment uses AI-powered proctoring to ensure fairness:
              </p>
              <div className="space-y-3">
                {proctoringFeatures.map((feature, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <feature.icon className="w-4 h-4 text-purple-600" />
                    </div>
                    <div className="pt-1">
                      <p className="text-sm text-gray-900 font-medium">{feature.label}</p>
                      <p className="text-xs text-gray-500">{feature.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Terms & Conditions */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-8">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-gray-600" />
              <h3 className="font-semibold text-gray-900">Terms & Conditions</h3>
            </div>
          </div>
          <div className="p-6 max-h-64 overflow-y-auto">
            <div className="space-y-4">
              {termsAndConditions.map((term, index) => (
                <div key={index}>
                  <p className="font-medium text-gray-900 text-sm">{term.title}</p>
                  <p className="text-sm text-gray-600 mt-1">{term.content}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Consent Checkboxes */}
        <div className="space-y-4 mb-8">
          {/* Terms Checkbox */}
          <label
            className={`flex items-start gap-4 p-5 rounded-2xl border-2 cursor-pointer transition-all ${
              agreedTerms
                ? 'border-green-500 bg-green-50'
                : 'border-gray-200 hover:border-gray-300 bg-white'
            }`}
          >
            <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
              agreedTerms ? 'bg-green-500 border-green-500' : 'border-gray-300'
            }`}>
              {agreedTerms && <Check className="w-4 h-4 text-white" />}
            </div>
            <input
              type="checkbox"
              checked={agreedTerms}
              onChange={(e) => setAgreedTerms(e.target.checked)}
              className="sr-only"
            />
            <span className="text-sm text-gray-700">
              <strong className="text-gray-900">I have read and agree to the Terms & Conditions</strong>
              <br />
              <span className="text-gray-500">I understand that violation of these terms may result in disqualification from the recruitment process.</span>
            </span>
          </label>

          {/* Proctoring Checkbox */}
          <label
            className={`flex items-start gap-4 p-5 rounded-2xl border-2 cursor-pointer transition-all ${
              agreedProctoring
                ? 'border-green-500 bg-green-50'
                : 'border-gray-200 hover:border-gray-300 bg-white'
            }`}
          >
            <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
              agreedProctoring ? 'bg-green-500 border-green-500' : 'border-gray-300'
            }`}>
              {agreedProctoring && <Check className="w-4 h-4 text-white" />}
            </div>
            <input
              type="checkbox"
              checked={agreedProctoring}
              onChange={(e) => setAgreedProctoring(e.target.checked)}
              className="sr-only"
            />
            <span className="text-sm text-gray-700">
              <strong className="text-gray-900">I consent to AI proctoring and monitoring</strong>
              <br />
              <span className="text-gray-500">I understand that my activity will be tracked to ensure test integrity and fairness.</span>
            </span>
          </label>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <Button
            variant="outline"
            onClick={onDecline}
            className="px-6"
          >
            Cancel
          </Button>
          <Button
            onClick={handleAccept}
            disabled={!canAccept || isSubmitting}
            className={`px-8 py-3 text-base ${
              canAccept
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700'
                : 'bg-gray-300'
            } text-white`}
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Processing...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5" />
                I Agree - Continue
              </span>
            )}
          </Button>
        </div>

        {/* Support Footer */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500">
            Having trouble? Contact us at{' '}
            <a href="mailto:support@talentflow.com" className="text-purple-600 hover:underline">
              support@talentflow.com
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
