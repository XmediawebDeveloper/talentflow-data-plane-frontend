'use client';

import { useState } from 'react';
import { X, Clock, CheckCircle, AlertCircle, Monitor, Copy, BarChart3, Timer } from 'lucide-react';
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
    'Once started, the timer cannot be paused or stopped.',
    'You cannot return to previous sections once submitted.',
    'Ensure you have a stable internet connection throughout the test.',
    'Do not refresh the page or navigate away during the assessment.',
    'Complete the assessment in one sitting without interruption.'
  ];

  const proctoringFeatures = [
    { icon: Monitor, label: 'Tab switching detection', description: 'Navigating away from the test tab will be recorded.' },
    { icon: Copy, label: 'Copy-paste monitoring', description: 'Attempts to copy questions or paste answers will be flagged.' },
    { icon: BarChart3, label: 'Pattern analysis', description: 'AI will analyze answer patterns for irregularities.' },
    { icon: Timer, label: 'Time tracking', description: 'Time spent on each question will be monitored.' }
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header - Gradient */}
        <div className="px-6 py-5 bg-gradient-to-r from-purple-600 via-purple-500 to-indigo-500 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Assessment Terms & Consent</h2>
            <p className="text-purple-100 text-sm">Please review and accept before starting the test</p>
          </div>
          <button
            onClick={onDecline}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Assessment Info Card */}
          <div className="mb-6 p-4 bg-blue-50 rounded-xl border border-blue-100">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-4 h-4 text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900">{assessmentInfo.assessment_title}</p>
                <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    Duration: {assessmentInfo.duration_minutes}
                  </span>
                  <span className="flex items-center gap-1">
                    <CheckCircle className="w-4 h-4" />
                    Questions:
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Important Instructions */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="w-5 h-5 text-orange-500" />
              <h3 className="font-semibold text-gray-900">Important Instructions</h3>
            </div>
            <div className="bg-orange-50 rounded-xl p-4 border border-orange-100">
              <ul className="space-y-2">
                {importantInstructions.map((instruction, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="w-1.5 h-1.5 bg-orange-500 rounded-full mt-2 flex-shrink-0" />
                    {instruction}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Terms & Conditions */}
          <div className="mb-6">
            <h3 className="font-semibold text-gray-900 mb-3">Terms & Conditions</h3>
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 max-h-48 overflow-y-auto">
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

          {/* AI Proctoring & Monitoring */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Monitor className="w-5 h-5 text-purple-600" />
              <h3 className="font-semibold text-gray-900">AI Proctoring & Monitoring</h3>
            </div>
            <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
              <p className="text-sm text-gray-700 mb-3">
                This assessment uses AI-powered proctoring to ensure fairness and integrity:
              </p>
              <div className="space-y-3">
                {proctoringFeatures.map((feature, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <feature.icon className="w-3.5 h-3.5 text-purple-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{feature.label}:</p>
                      <p className="text-sm text-gray-600">{feature.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Consent Checkboxes */}
          <div className="space-y-3">
            {/* Terms Checkbox */}
            <label
              className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                agreedTerms
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              <input
                type="checkbox"
                checked={agreedTerms}
                onChange={(e) => setAgreedTerms(e.target.checked)}
                className="w-5 h-5 rounded border-gray-300 text-green-600 focus:ring-green-500 mt-0.5"
              />
              <span className="text-sm text-gray-700">
                <strong>I have read and agree to the Terms & Conditions</strong> stated above. I understand that violation of these terms may result in disqualification from the recruitment process.
              </span>
            </label>

            {/* Proctoring Checkbox */}
            <label
              className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                agreedProctoring
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              <input
                type="checkbox"
                checked={agreedProctoring}
                onChange={(e) => setAgreedProctoring(e.target.checked)}
                className="w-5 h-5 rounded border-gray-300 text-green-600 focus:ring-green-500 mt-0.5"
              />
              <span className="text-sm text-gray-700">
                <strong>I consent to AI proctoring and monitoring</strong> during this assessment. I understand that my activity will be tracked to ensure test integrity and fairness.
              </span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
          <Button variant="outline" onClick={onDecline}>
            Cancel
          </Button>
          <Button
            onClick={handleAccept}
            disabled={!canAccept || isSubmitting}
            className={`${
              canAccept
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700'
                : 'bg-gray-300'
            } text-white px-6`}
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Processing...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                I Agree - Start Test
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
