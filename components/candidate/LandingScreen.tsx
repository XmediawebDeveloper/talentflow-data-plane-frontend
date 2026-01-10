'use client';

import {
  Clock,
  FileText,
  Code,
  Users,
  CheckCircle,
  AlertTriangle,
  Monitor,
  Camera,
  Mic
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AssessmentInfo } from '@/lib/services/candidateService';

interface LandingScreenProps {
  assessmentInfo: AssessmentInfo;
  onBegin: () => void;
}

export function LandingScreen({ assessmentInfo, onBegin }: LandingScreenProps) {
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
      percentage: assessmentInfo.hr_percentage
    },
    {
      type: 'technical',
      enabled: assessmentInfo.has_technical_round,
      name: 'Technical Round',
      icon: FileText,
      description: 'Multiple choice questions',
      percentage: assessmentInfo.technical_percentage
    },
    {
      type: 'coding',
      enabled: assessmentInfo.has_coding_round,
      name: 'Coding Round',
      icon: Code,
      description: 'Programming challenges',
      percentage: assessmentInfo.coding_percentage
    }
  ].filter(r => r.enabled);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">TF</span>
            </div>
            <div>
              <span className="text-xl font-semibold text-gray-800">TalentFlow</span>
              {assessmentInfo.company_name && (
                <span className="text-gray-500 ml-2">| {assessmentInfo.company_name}</span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Welcome Card */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          {/* Gradient Header */}
          <div className="bg-gradient-to-r from-gray-800 to-gray-700 px-8 py-8 text-white">
            <h1 className="text-3xl font-bold mb-2">{assessmentInfo.assessment_title}</h1>
            <p className="text-gray-300">{assessmentInfo.jd_title}</p>
          </div>

          {/* Candidate Info */}
          <div className="px-8 py-6 border-b border-gray-100 bg-gray-50">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Welcome,</p>
                <p className="text-xl font-semibold text-gray-800">
                  {assessmentInfo.candidate_name}
                </p>
                <p className="text-sm text-gray-500">{assessmentInfo.candidate_email}</p>
              </div>
              <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border border-gray-200">
                <Clock className="w-5 h-5 text-gray-600" />
                <span className="font-medium text-gray-800">
                  {formatDuration(assessmentInfo.duration_minutes)}
                </span>
              </div>
            </div>
          </div>

          {/* Description */}
          {assessmentInfo.assessment_description && (
            <div className="px-8 py-6 border-b border-gray-100">
              <p className="text-gray-600">{assessmentInfo.assessment_description}</p>
            </div>
          )}

          {/* Assessment Rounds */}
          <div className="px-8 py-6 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Assessment Rounds</h2>
            <div className="grid gap-4 md:grid-cols-3">
              {rounds.map((round, idx) => (
                <div
                  key={round.type}
                  className="bg-gray-50 rounded-xl p-4 border border-gray-100"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center">
                      <round.icon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-800">{round.name}</p>
                      <p className="text-sm text-gray-500">{round.percentage}% weightage</p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 mt-2">{round.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Requirements */}
          <div className="px-8 py-6 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Before You Begin</h2>

            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Monitor className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-800">Stable Internet Connection</p>
                  <p className="text-sm text-gray-500">Ensure you have a reliable internet connection throughout the assessment</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Camera className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-800">Camera & Microphone</p>
                  <p className="text-sm text-gray-500">Your camera and microphone will be used for proctoring</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Mic className="w-4 h-4 text-purple-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-800">Quiet Environment</p>
                  <p className="text-sm text-gray-500">Find a quiet place where you won't be disturbed</p>
                </div>
              </div>
            </div>
          </div>

          {/* Important Notes */}
          <div className="px-8 py-6 border-b border-gray-100 bg-amber-50">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-800">Important Notes</p>
                <ul className="text-sm text-amber-700 mt-2 space-y-1">
                  <li>- Once started, you cannot pause the assessment</li>
                  <li>- Tab switching and copy/paste actions are monitored</li>
                  <li>- Ensure all questions are answered before submitting</li>
                  <li>- Results will be shown immediately after completion</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Action */}
          <div className="px-8 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="w-5 h-5" />
                <span className="text-sm font-medium">Ready to begin</span>
              </div>
              <Button onClick={onBegin} size="lg" variant="primary">
                Begin Assessment
              </Button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 py-6 text-center">
        <p className="text-sm text-gray-500">
          Powered by TalentFlow | Need help? Contact{' '}
          <a href="mailto:support@talentflow.app" className="text-gray-700 hover:underline">
            support@talentflow.app
          </a>
        </p>
      </footer>
    </div>
  );
}
