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
      description: 'Behavioral & situational questions',
      percentage: assessmentInfo.hr_percentage,
      color: 'bg-purple-500'
    },
    {
      type: 'technical',
      enabled: assessmentInfo.has_technical_round,
      name: 'Technical Round',
      icon: FileText,
      description: 'Multiple choice questions',
      percentage: assessmentInfo.technical_percentage,
      color: 'bg-blue-500'
    },
    {
      type: 'coding',
      enabled: assessmentInfo.has_coding_round,
      name: 'Coding Round',
      icon: Code,
      description: 'Programming challenges',
      percentage: assessmentInfo.coding_percentage,
      color: 'bg-green-500'
    }
  ].filter(r => r.enabled);

  // Progress steps
  const steps = [
    { label: 'Terms & Consent', active: false, completed: true },
    { label: 'Assessment Details', active: true, completed: false },
    { label: 'System Check', active: false, completed: false },
    { label: 'Assessment', active: false, completed: false }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
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
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-blue-600 transition-colors"
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
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-500'
                  }`}>
                    {step.completed ? <Check className="w-4 h-4" /> : index + 1}
                  </div>
                  <span className={`text-sm font-medium hidden sm:block ${
                    step.active ? 'text-blue-600' : step.completed ? 'text-green-600' : 'text-gray-500'
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
            Assessment Overview
          </h1>
          <p className="text-gray-600">
            Review the details below before starting your assessment
          </p>
        </div>

        {/* Assessment Info Card */}
        <div className="bg-gradient-to-r from-sky-300 via-sky-400 to-sky-500 rounded-2xl p-6 mb-8 text-white shadow-lg">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold mb-1">{assessmentInfo.assessment_title}</h2>
              <p className="text-sky-100">{assessmentInfo.jd_title}</p>
              {assessmentInfo.company_name && (
                <p className="text-sky-100 text-sm mt-1">by {assessmentInfo.company_name}</p>
              )}
            </div>
            <div className="flex items-center gap-4">
              <div className="bg-white/20 px-4 py-2 rounded-xl flex items-center gap-2">
                <Clock className="w-5 h-5" />
                <span className="font-semibold">{formatDuration(assessmentInfo.duration_minutes)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Candidate Info */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Candidate</p>
              <p className="text-lg font-semibold text-gray-900">{assessmentInfo.candidate_name}</p>
              <p className="text-sm text-gray-500">{assessmentInfo.candidate_email}</p>
            </div>
          </div>
        </div>

        {/* Assessment Rounds */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Assessment Rounds</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {rounds.map((round) => (
              <div
                key={round.type}
                className="bg-gray-50 rounded-xl p-4 border border-gray-100"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-10 h-10 ${round.color} rounded-lg flex items-center justify-center`}>
                    <round.icon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{round.name}</p>
                    <p className="text-sm text-gray-500">{round.percentage}% weightage</p>
                  </div>
                </div>
                <p className="text-sm text-gray-600">{round.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Requirements */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">System Requirements</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Monitor className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Stable Internet</p>
                <p className="text-sm text-gray-500">Reliable connection required</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Camera className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Camera Access</p>
                <p className="text-sm text-gray-500">Required for proctoring</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Mic className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Microphone Access</p>
                <p className="text-sm text-gray-500">Required for proctoring</p>
              </div>
            </div>
          </div>
        </div>

        {/* Important Notes */}
        <div className="bg-amber-50 rounded-lg border border-amber-200 p-6 mb-8">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-800 mb-2">Important Notes</p>
              <ul className="text-sm text-amber-700 space-y-1">
                <li>• Once started, you cannot pause the assessment</li>
                <li>• Tab switching and copy/paste actions are monitored</li>
                <li>• Ensure all questions are answered before submitting</li>
                <li>• Results will be available after completion</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Action */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="w-5 h-5" />
              <span className="font-medium">Ready to begin</span>
            </div>
            <Button
              onClick={onBegin}
              size="lg"
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-8"
            >
              Continue to System Check
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </div>
        </div>

        {/* Support Footer */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500">
            Having trouble? Contact us at{' '}
            <a href="mailto:support@talentflow.com" className="text-blue-600 hover:underline">
              support@talentflow.com
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
