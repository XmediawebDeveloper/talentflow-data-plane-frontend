'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import {
  Clock,
  FileText,
  Code,
  Users,
  CheckCircle,
  AlertTriangle,
  Monitor,
  Camera,
  Mic,
  HelpCircle,
  Check,
  ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AssessmentInfo } from '@/lib/services/candidateService';

interface LandingScreenProps {
  assessmentInfo: AssessmentInfo;
  onBegin: () => void;
}

export function LandingScreen({ assessmentInfo, onBegin }: LandingScreenProps) {
  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes} minutes`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours} hour${hours > 1 ? 's' : ''}`;
  };

  const rounds = [
    {
      type: 'hr',
      enabled: assessmentInfo.has_hr_round,
      name: 'HR Round',
      icon: Users,
      color: 'bg-purple-500'
    },
    {
      type: 'technical',
      enabled: assessmentInfo.has_technical_round,
      name: 'Technical Round',
      icon: FileText,
      color: 'bg-blue-500'
    },
    {
      type: 'coding',
      enabled: assessmentInfo.has_coding_round,
      name: 'Coding Round',
      icon: Code,
      color: 'bg-success'
    }
  ].filter(r => r.enabled);

  // Progress steps
  const steps = [
    { label: 'Terms & Consent', active: false, completed: true },
    { label: 'Assessment Details', active: true, completed: false },
    { label: 'System Check', active: false, completed: false },
    { label: 'HR Questions', active: false, completed: false },
    { label: 'Assessment', active: false, completed: false }
  ];

  return (
    <div className="min-h-[100dvh] bg-gray-50 flex flex-col">
      {/* Sticky Header Container */}
      <div className="sticky top-0 z-50">
        {/* Header - Full Width */}
        <header className="w-full bg-white border-b border-gray-200">
          <div className="w-full px-6 lg:px-12 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Image
                  src="/logos/talent_flow_logo.png"
                  alt="TalentFlow"
                  width={200}
                  height={70}
                  className="h-16 w-auto"
                  priority
                  unoptimized
                />
              </div>
              <a
                href="mailto:support@talentflow.com"
                className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900 transition-colors"
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
            <p className="sm:hidden text-sm font-medium text-blue-700 mb-3 text-center" aria-live="polite">
              Step 2 of {steps.length}: Assessment Details
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2" aria-label="Assessment progress">
              {steps.map((step, index) => (
                <div key={index} className="flex items-center">
                  <div className="flex items-center gap-2">
                    <div
                      aria-current={step.active ? 'step' : undefined}
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                      step.completed
                        ? 'bg-success text-white'
                        : step.active
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-300 text-gray-600'
                    }`}
                    >
                      {step.completed ? <Check className="w-4 h-4" /> : index + 1}
                    </div>
                    <span className={`text-sm font-medium ${
                      step.active ? 'text-gray-900' : step.completed ? 'text-success' : 'text-gray-500'
                    }`}>
                      <span className="sm:hidden">{step.active ? step.label : ''}</span>
                      <span className="hidden sm:inline">{step.label}</span>
                    </span>
                  </div>
                  {index < steps.length - 1 && (
                    <div className={`w-8 sm:w-16 h-0.5 mx-2 ${
                      step.completed ? 'bg-success' : 'bg-gray-300'
                    }`} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - Full Width */}
      <main className="flex-1 w-full">
        {/* Hero Section - Assessment Title */}
        <div className="w-full bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 py-12">
          <div className="w-full px-6 lg:px-12">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div>
                <h1 className="text-3xl lg:text-4xl font-bold text-white mb-2">{assessmentInfo.assessment_title}</h1>
                <p className="text-blue-100 text-lg leading-7">{assessmentInfo.jd_title}</p>
              </div>
              <div className="flex items-center gap-3 bg-white/15 backdrop-blur-sm px-6 py-4 rounded-xl">
                <Clock className="w-8 h-8 text-white" />
                <div>
                  <p className="text-blue-100 text-sm">Duration</p>
                  <span className="font-bold text-2xl text-white">{formatDuration(assessmentInfo.duration_minutes)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Candidate Info Section */}
        <div className="w-full bg-white border-b border-gray-200 py-6">
          <div className="w-full px-6 lg:px-12">
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                <Users className="w-8 h-8 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">Candidate</p>
                <p className="text-2xl font-semibold text-gray-900">{assessmentInfo.candidate_name}</p>
                <p className="text-blue-700 break-all">{assessmentInfo.candidate_email}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Assessment Rounds Section */}
        <div className="w-full bg-white border-b border-gray-200 py-8">
          <div className="w-full px-6 lg:px-12">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-6">Assessment Rounds</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {rounds.map((round) => (
                <div
                  key={round.type}
                  className="flex items-center gap-4 p-5 bg-gray-50 rounded-xl"
                >
                  <div className={`w-14 h-14 ${round.color} rounded-xl flex items-center justify-center`}>
                    <round.icon className="w-7 h-7 text-white" />
                  </div>
                  <p className="font-semibold text-gray-900 text-lg">{round.name}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* System Requirements Section */}
        <div className="w-full bg-white border-b border-gray-200 py-8">
          <div className="w-full px-6 lg:px-12">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-6">System Requirements</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Monitor className="w-7 h-7 text-blue-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Stable Internet</p>
                  <p className="text-sm text-gray-600">Reliable connection required</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-success-subtle rounded-xl flex items-center justify-center">
                  <Camera className="w-7 h-7 text-success" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Camera Access</p>
                  <p className="text-sm text-gray-600">Required for proctoring</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-purple-100 rounded-xl flex items-center justify-center">
                  <Mic className="w-7 h-7 text-purple-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Microphone Access</p>
                  <p className="text-sm text-gray-600">Required for proctoring</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Important Notes Section */}
        <div className="w-full bg-warning-subtle border-b border-warning-line py-6">
          <div className="w-full px-6 lg:px-12">
            <div className="flex items-start gap-4">
              <AlertTriangle className="w-6 h-6 text-warning flex-shrink-0 mt-1" />
              <div>
                <p className="font-semibold text-warning-strong text-lg mb-2">Important Notes</p>
                <ul className="text-warning grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-warning rounded-full"></span>
                    Recovery is supported if a network or client failure occurs
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-warning rounded-full"></span>
                    Tab switching is monitored
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-warning rounded-full"></span>
                    Copy/paste actions are tracked
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-warning rounded-full"></span>
                    Answer all questions before submitting
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Action Footer */}
        <div className="w-full bg-white py-8">
          <div className="w-full px-6 lg:px-12">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-3 text-success">
                <CheckCircle className="w-7 h-7" />
                <span className="font-semibold text-lg">Ready to begin your assessment</span>
              </div>
              <Button
                onClick={onBegin}
                size="lg"
                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-10 py-6 text-lg font-semibold rounded-xl"
              >
                Continue to System Check
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-6 text-center bg-white border-t border-gray-200">
        <p className="text-gray-600">
          Having trouble? Contact us at{' '}
          <a href="mailto:support@talentflow.com" className="text-blue-600 hover:underline font-medium">
            support@talentflow.com
          </a>
        </p>
      </footer>
    </div>
  );
}
