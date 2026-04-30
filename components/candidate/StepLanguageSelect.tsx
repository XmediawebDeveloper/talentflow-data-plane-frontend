'use client';

import React from 'react';
import { Globe, CheckCircle, ChevronRight, MessageSquare } from 'lucide-react';

interface StepLanguageSelectProps {
  availableLanguages: string[];
  selectedLanguage: string;
  onSelectLanguage: (lang: string) => void;
  onContinue: () => void;
  submitting?: boolean;
}

export default function StepLanguageSelect({
  availableLanguages,
  selectedLanguage,
  onSelectLanguage,
  onContinue,
  submitting = false,
}: StepLanguageSelectProps) {
  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      {/* Blue pill badge */}
      <div className="text-center space-y-3">
        <span className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 text-xs font-semibold px-3 py-1 rounded-full">
          <Globe className="w-3.5 h-3.5" />
          Language Selection
        </span>

        {/* Heading */}
        <h2 className="text-2xl font-bold text-gray-900">
          Select Interview Language
        </h2>

        {/* Subtitle */}
        <p className="text-gray-600 text-sm">
          Choose your preferred language for the AI interview
        </p>
      </div>

      {/* Card with blue gradient header */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="bg-gray-800 px-6 py-4 flex items-center gap-3">
          <MessageSquare className="w-5 h-5 text-white" />
          <div>
            <h3 className="text-white font-semibold">Interview Language</h3>
            <p className="text-gray-300 text-xs">
              Select the language you are most comfortable with
            </p>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Language grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {availableLanguages.map((lang) => {
              const isSelected = lang === selectedLanguage;
              return (
                <button
                  key={lang}
                  type="button"
                  onClick={() => onSelectLanguage(lang)}
                  className={`relative border rounded-xl p-6 text-center transition-all ${
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

          {/* Current selection indicator */}
          <p className="text-sm text-green-600 font-medium">
            Current Selection: {selectedLanguage}
          </p>
        </div>
      </div>

      {/* Note */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
        <p className="text-sm text-gray-700">
          <span className="font-medium">Note:</span> The AI interviewer will
          conduct the entire interview in your selected language. You can change
          this before starting.
        </p>
      </div>

      {/* Continue button */}
      <div className="flex justify-center pt-2">
        <button
          type="button"
          onClick={onContinue}
          disabled={submitting}
          className="px-8 py-3 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
        >
          {submitting ? 'Loading...' : 'Continue'}
          {!submitting && <ChevronRight className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
