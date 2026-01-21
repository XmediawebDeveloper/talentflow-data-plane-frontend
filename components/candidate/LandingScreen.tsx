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
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header - Full Width */}
      <header className="w-full bg-gray-900 border-b border-gray-800">
        <div className="w-[70%] mx-auto py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Image
                src="/talent_flow_logo.png"
                alt="TalentFlow"
                width={140}
                height={36}
                className="h-9 w-auto brightness-0 invert"
                priority
                unoptimized
              />
            </div>
            <a
              href="mailto:support@talentflow.com"
              className="flex items-center gap-2 text-sm text-white/70 hover:text-white transition-colors"
            >
              <HelpCircle className="w-4 h-4" />
              Need help?
            </a>
          </div>
        </div>
      </header>

      {/* Progress Stepper - Full Width */}
      <div className="w-full bg-gray-100 border-b border-gray-200">
        <div className="w-[70%] mx-auto py-4">
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

      {/* Main Content - 70% Width - Unified Card Design */}
      <main className="flex-1 w-[70%] mx-auto py-8">
        {/* Single Unified Container */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Header Section - Assessment Title */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-8 py-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-white">{assessmentInfo.assessment_title}</h1>
                <p className="text-blue-100">{assessmentInfo.jd_title}</p>
              </div>
              <div className="flex items-center gap-2 bg-white/20 backdrop-blur px-5 py-3 rounded-xl">
                <Clock className="w-6 h-6 text-white" />
                <span className="font-bold text-xl text-white">{formatDuration(assessmentInfo.duration_minutes)}</span>
              </div>
            </div>
          </div>

          {/* Candidate Info Section */}
          <div className="px-8 py-5 border-b border-gray-100 bg-gray-50/50">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <Users className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Candidate</p>
                <p className="text-lg font-semibold text-gray-900">{assessmentInfo.candidate_name}</p>
                <p className="text-sm text-blue-600">{assessmentInfo.candidate_email}</p>
              </div>
            </div>
          </div>

          {/* Assessment Rounds Section */}
          <div className="px-8 py-6 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Assessment Rounds</h3>
            <div className="grid sm:grid-cols-3 gap-4">
              {rounds.map((round) => (
                <div
                  key={round.type}
                  className="bg-gray-50 rounded-xl p-4 border border-gray-100"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-10 h-10 ${round.color} rounded-lg flex items-center justify-center`}>
                      <round.icon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{round.name}</p>
                      <p className="text-xs text-gray-500">{round.percentage}% weightage</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-600">{round.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* System Requirements Section */}
          <div className="px-8 py-6 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">System Requirements</h3>
            <div className="flex flex-wrap gap-6">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Monitor className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900 text-sm">Stable Internet</p>
                  <p className="text-xs text-gray-500">Reliable connection required</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-green-100 rounded-lg flex items-center justify-center">
                  <Camera className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900 text-sm">Camera Access</p>
                  <p className="text-xs text-gray-500">Required for proctoring</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-purple-100 rounded-lg flex items-center justify-center">
                  <Mic className="w-4 h-4 text-purple-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900 text-sm">Microphone Access</p>
                  <p className="text-xs text-gray-500">Required for proctoring</p>
                </div>
              </div>
            </div>
          </div>

          {/* Important Notes Section */}
          <div className="px-8 py-5 bg-amber-50 border-b border-amber-100">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-700 text-sm mb-1">Important Notes</p>
                <ul className="text-sm text-amber-600 flex flex-wrap gap-x-6 gap-y-1">
                  <li>• Once started, you cannot pause</li>
                  <li>• Tab switching is monitored</li>
                  <li>• Copy/paste actions are tracked</li>
                  <li>• Answer all questions before submitting</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Action Footer */}
          <div className="px-8 py-5 bg-gray-50">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 text-green-600">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium text-sm">Ready to begin your assessment</span>
              </div>
              <Button
                onClick={onBegin}
                size="lg"
                className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white px-8 py-5 text-base"
              >
                Continue to System Check
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-4 text-center border-t border-gray-200">
        <p className="text-sm text-gray-500">
          Having trouble? Contact us at{' '}
          <a href="mailto:support@talentflow.com" className="text-blue-600 hover:underline">
            support@talentflow.com
          </a>
        </p>
      </footer>
    </div>
  );
}
