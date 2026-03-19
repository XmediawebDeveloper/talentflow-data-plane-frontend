'use client';

import React from 'react';
import {
  Play,
  Briefcase,
  FileText,
  Clock,
  Globe,
  CheckCircle,
  ChevronRight,
  SkipForward,
  X,
  Building2,
  BookOpen,
  Lightbulb,
  Timer,
} from 'lucide-react';

interface StepIntroVideoProps {
  candidateName?: string;
  position?: string;
  interviewType?: string;
  duration?: number;
  introductionVideoUrl?: string | null;
  token: string;
  availableLanguages: string[];
  selectedLanguage: string;
  onSelectLanguage: (lang: string) => void;
  onContinue: () => void;
  onSkip: () => void;
  submitting?: boolean;
}

const EXPECT_ITEMS = [
  {
    icon: Building2,
    title: 'Company Overview',
    description: 'Learn about our mission, values, and culture',
  },
  {
    icon: BookOpen,
    title: 'Role Description',
    description: 'Understand the responsibilities for the {position} position',
  },
  {
    icon: Lightbulb,
    title: 'Interview Instructions',
    description:
      'Get tips on how to make the most of this AI-powered interview',
  },
  {
    icon: Timer,
    title: 'Duration',
    description: 'Maximum 1 minute introduction',
  },
];

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

export default function StepIntroVideo({
  candidateName = 'Candidate',
  position = 'Open Position',
  interviewType = 'AI Interview',
  duration = 30,
  introductionVideoUrl,
  token,
  availableLanguages,
  selectedLanguage,
  onSelectLanguage,
  onContinue,
  onSkip,
  submitting = false,
}: StepIntroVideoProps) {
  // Build the public intro video URL using the candidate token endpoint
  const videoSrc = introductionVideoUrl
    ? `${API_BASE_URL}/candidate/ai-interview/${token}/intro-video`
    : null;
  return (
    <div className="w-full max-w-3xl mx-auto space-y-6">
      {/* Blue gradient header card */}
      <div className="bg-gray-800 rounded-2xl p-8 text-center text-white shadow-lg">
        <div className="flex items-center justify-center gap-3 mb-3">
          <Play className="w-8 h-8" />
          <h2 className="text-2xl font-bold">Welcome to Your Interview</h2>
        </div>
        <p className="text-gray-300 text-sm">
          Please watch this brief introduction from our recruitment team
        </p>
      </div>

      {/* Video section */}
      {videoSrc ? (
        <div className="space-y-4 text-center">
          <div className="flex justify-center">
            <video
              src={videoSrc}
              controls
              className="w-full max-w-2xl rounded-xl border border-gray-200 shadow-sm"
            />
          </div>

          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 text-xs font-semibold px-3 py-1 rounded-full">
              <Play className="w-3.5 h-3.5" />
              Introduction Video
            </span>
            <h3 className="text-xl font-bold text-gray-900">
              Welcome, {candidateName}!
            </h3>
            <p className="text-gray-600 text-sm max-w-xl mx-auto">
              Thank you for taking the time to interview for the{' '}
              <span className="font-medium text-gray-800">{position}</span>{' '}
              position. Please watch the introduction video above to learn more
              about the role and what to expect during your interview.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center space-y-3">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
            <Play className="w-8 h-8 text-gray-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">
            No Introduction Video Available
          </h3>
          <p className="text-gray-500 text-sm max-w-md mx-auto">
            There is no introduction video for this interview. You may continue
            directly to the interview or review the details below.
          </p>
        </div>
      )}

      {/* What to Expect card */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">
          What to Expect
        </h3>
        <ul className="space-y-3">
          {EXPECT_ITEMS.map((item) => {
            const Icon = item.icon;
            const description = item.description.replace(
              '{position}',
              position
            );
            return (
              <li key={item.title} className="flex items-start gap-3">
                <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Icon className="w-4 h-4 text-gray-600" />
                </div>
                <div>
                  <span className="font-medium text-gray-900">
                    {item.title}:
                  </span>{' '}
                  <span className="text-gray-600 text-sm">{description}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Info row: Position | Interview Type | Duration */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center">
            <Briefcase className="w-5 h-5 text-gray-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium">Position</p>
            <p className="text-sm font-semibold text-gray-900">{position}</p>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center">
            <FileText className="w-5 h-5 text-gray-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium">Interview Type</p>
            <p className="text-sm font-semibold text-gray-900">
              {interviewType}
            </p>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center">
            <Clock className="w-5 h-5 text-gray-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium">Duration</p>
            <p className="text-sm font-semibold text-gray-900">
              {duration} minutes
            </p>
          </div>
        </div>
      </div>

      {/* Language Selection (only if more than 1 language) */}
      {availableLanguages.length > 1 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="bg-gray-800 px-6 py-4 flex items-center gap-3">
            <Globe className="w-5 h-5 text-white" />
            <div>
              <h3 className="text-white font-semibold">
                Select Interview Language
              </h3>
              <p className="text-gray-300 text-xs">
                The AI interviewer will conduct the interview in your selected
                language
              </p>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {availableLanguages.map((lang) => {
                const isSelected = lang === selectedLanguage;
                return (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => onSelectLanguage(lang)}
                    className={`relative border rounded-xl p-4 text-center transition-all ${
                      isSelected
                        ? 'border-gray-800 bg-gray-50 shadow-sm'
                        : 'border-gray-200 bg-white hover:border-gray-400'
                    }`}
                  >
                    {isSelected && (
                      <CheckCircle className="w-5 h-5 text-gray-600 absolute top-2 right-2" />
                    )}
                    <span
                      className={`text-sm font-medium ${
                        isSelected ? 'text-gray-700' : 'text-gray-700'
                      }`}
                    >
                      {lang}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-sm text-green-600 font-medium">
              Current Selection: {selectedLanguage}
            </p>
          </div>
        </div>
      )}

      {/* Footer actions */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
        <button
          type="button"
          onClick={onSkip}
          className="text-sm text-red-500 hover:text-red-600 font-medium flex items-center gap-1"
        >
          <X className="w-4 h-4" />
          Cancel Interview
        </button>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onSkip}
            className="px-5 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-1.5"
          >
            Skip Introduction
            <SkipForward className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onContinue}
            disabled={submitting}
            className="px-6 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-sm"
          >
            {submitting ? 'Loading...' : 'Continue to Interview'}
            {!submitting && <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
