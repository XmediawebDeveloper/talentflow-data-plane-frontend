'use client';

import { useState } from 'react';
import { X, Shield, Eye, Database, Camera, MonitorCheck } from 'lucide-react';
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
  const [agreedData, setAgreedData] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canAccept = agreedTerms && agreedProctoring && agreedData;

  const handleAccept = async () => {
    if (!canAccept) return;
    setIsSubmitting(true);
    try {
      await onAccept();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Terms & Consent</h2>
              <p className="text-sm text-gray-500">Please review before proceeding</p>
            </div>
          </div>
          <button
            onClick={onDecline}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Assessment Info */}
          <div className="mb-6 p-4 bg-gray-50 rounded-xl">
            <p className="text-sm text-gray-500">You are about to take</p>
            <p className="text-lg font-semibold text-gray-800">{assessmentInfo.assessment_title}</p>
            <p className="text-sm text-gray-600">{assessmentInfo.jd_title}</p>
          </div>

          {/* Consent Items */}
          <div className="space-y-4">
            {/* Terms of Service */}
            <div
              className={`p-4 rounded-xl border-2 transition-colors cursor-pointer ${
                agreedTerms ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => setAgreedTerms(!agreedTerms)}
            >
              <div className="flex items-start gap-4">
                <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                  agreedTerms ? 'bg-green-500 border-green-500' : 'border-gray-300'
                }`}>
                  {agreedTerms && (
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <MonitorCheck className="w-4 h-4 text-gray-600" />
                    <span className="font-medium text-gray-800">Terms of Service</span>
                  </div>
                  <p className="text-sm text-gray-600">
                    I agree to complete this assessment honestly and without external assistance.
                    I understand that any form of cheating or malpractice may result in disqualification.
                  </p>
                </div>
              </div>
            </div>

            {/* Proctoring Consent */}
            <div
              className={`p-4 rounded-xl border-2 transition-colors cursor-pointer ${
                agreedProctoring ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => setAgreedProctoring(!agreedProctoring)}
            >
              <div className="flex items-start gap-4">
                <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                  agreedProctoring ? 'bg-green-500 border-green-500' : 'border-gray-300'
                }`}>
                  {agreedProctoring && (
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Camera className="w-4 h-4 text-gray-600" />
                    <span className="font-medium text-gray-800">Proctoring Consent</span>
                  </div>
                  <p className="text-sm text-gray-600">
                    I consent to being recorded via camera and screen sharing during this assessment.
                    I understand that tab switches, copy/paste actions, and other activities may be monitored.
                  </p>
                </div>
              </div>
            </div>

            {/* Data Privacy */}
            <div
              className={`p-4 rounded-xl border-2 transition-colors cursor-pointer ${
                agreedData ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => setAgreedData(!agreedData)}
            >
              <div className="flex items-start gap-4">
                <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                  agreedData ? 'bg-green-500 border-green-500' : 'border-gray-300'
                }`}>
                  {agreedData && (
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Database className="w-4 h-4 text-gray-600" />
                    <span className="font-medium text-gray-800">Data Privacy</span>
                  </div>
                  <p className="text-sm text-gray-600">
                    I understand that my responses will be stored and may be evaluated by AI systems.
                    My data will be handled in accordance with the privacy policy and shared only with the hiring organization.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Additional Info */}
          <div className="mt-6 p-4 bg-blue-50 rounded-xl">
            <div className="flex items-start gap-3">
              <Eye className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-blue-800">What we collect</p>
                <ul className="text-sm text-blue-700 mt-1 space-y-1">
                  <li>- Camera feed for identity verification</li>
                  <li>- Screen activity during the assessment</li>
                  <li>- Tab switches and window focus changes</li>
                  <li>- Your answers and time spent on each question</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
          <Button variant="ghost" onClick={onDecline}>
            Go Back
          </Button>
          <Button
            variant="primary"
            onClick={handleAccept}
            disabled={!canAccept || isSubmitting}
            loading={isSubmitting}
          >
            Accept & Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
