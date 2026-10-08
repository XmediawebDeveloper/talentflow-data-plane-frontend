'use client';

import React from 'react';
import { Globe, CheckCircle, ChevronRight, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { revealAfterPaint } from '@/lib/utils/candidateScroll';

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

        <div className="p-4 sm:p-6 space-y-5">
          {/* Language grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {availableLanguages.map((lang) => {
              const isSelected = lang === selectedLanguage;
              return (
                <button
                  key={lang}
                  type="button"
                  onClick={() => {
                    onSelectLanguage(lang);
                    // With many languages on a phone, Continue is below the grid.
                    revealAfterPaint(() => document.getElementById('tf-language-continue'));
                  }}
                  aria-pressed={isSelected}
                  className={`relative min-h-14 border rounded-xl p-4 sm:p-6 pr-8 sm:pr-8 text-center break-words transition-all ${
                    isSelected
                      ? 'border-brand-blue bg-brand-blue/10 ring-2 ring-brand-blue/30 shadow-sm'
                      : 'border-gray-200 bg-white hover:border-gray-400'
                  }`}
                >
                  {isSelected && (
                    <CheckCircle className="w-5 h-5 text-brand-blue absolute top-2 right-2" />
                  )}
                  <span
                    className={`text-sm font-medium ${
                      isSelected ? 'text-brand-blue' : 'text-gray-700'
                    }`}
                  >
                    {lang}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Current selection indicator */}
          <p className="text-sm text-success font-medium">
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
      <div id="tf-language-continue" className="flex justify-center pt-2 scroll-mb-4">
        <Button
          type="button"
          variant="primary"
          size="lg"
          onClick={onContinue}
          disabled={submitting}
          className="w-full sm:w-auto px-8"
        >
          {submitting ? 'Loading...' : 'Continue'}
          {!submitting && <ChevronRight className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}
