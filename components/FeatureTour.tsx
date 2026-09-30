import { useState } from 'react';
import { X, ChevronRight, ChevronLeft } from 'lucide-react';

interface TourStep {
  title: string;
  description: string;
  target?: string;
  image?: string;
}

const tourSteps: TourStep[] = [
  {
    title: 'Welcome to TalentFlow! 🎉',
    description: 'Your AI-powered recruitment platform. Let\'s take a quick tour of the key features to get you started.',
  },
  {
    title: 'Upload & Parse Resumes',
    description: 'Upload resumes in bulk and our AI automatically extracts candidate information, skills, and experience.',
  },
  {
    title: 'AI Talent Matching',
    description: 'Use AI to automatically match candidates with job descriptions based on skills, experience, and requirements.',
  },
  {
    title: 'Smart Assessments',
    description: 'Create and send assessments to candidates. Track completion rates and scores in real-time.',
  },
  {
    title: 'Keyboard Shortcuts ⌨️',
    description: 'Press Cmd/Ctrl + / to view all keyboard shortcuts and boost your productivity.',
  },
];

interface FeatureTourProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function FeatureTour({ isOpen, onClose }: FeatureTourProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onClose();
      setCurrentStep(0);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    onClose();
    setCurrentStep(0);
  };

  if (!isOpen) {
    return null;
  }

  const step = tourSteps[currentStep];

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-in fade-in duration-200" />

      {/* Tour Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 pointer-events-none">
        <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl max-w-[95vw] sm:max-w-2xl w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col pointer-events-auto animate-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="bg-gradient-to-r from-gray-800 to-gray-800 px-6 py-5 flex items-center justify-between rounded-t-xl sm:rounded-t-2xl flex-shrink-0">
            <div>
              <h2 className="text-xl text-white font-semibold">{step.title}</h2>
              <p className="text-sm text-gray-100 mt-1">
                Step {currentStep + 1} of {tourSteps.length}
              </p>
            </div>
            <button
              onClick={handleSkip}
              className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center transition-colors"
             aria-label="Close">
              <X className="w-5 h-5 text-white" />
            </button>
          </div>

          {/* Content */}
          <div className="p-8 overflow-y-auto flex-1 min-h-0">
            {/* Progress Bar */}
            <div className="mb-6">
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-gray-700 to-gray-700 transition-all duration-300"
                  style={{ width: `${((currentStep + 1) / tourSteps.length) * 100}%` }}
                />
              </div>
            </div>

            {/* Description */}
            <p className="text-gray-700 text-lg leading-relaxed mb-8">{step.description}</p>

            {/* Visual placeholder */}
            <div className="bg-gradient-to-br from-gray-50 to-gray-50 rounded-xl p-12 mb-6 text-center">
              <div className="text-6xl mb-4">
                {currentStep === 0 && '👋'}
                {currentStep === 1 && '📄'}
                {currentStep === 2 && '🤖'}
                {currentStep === 3 && '📊'}
                {currentStep === 4 && '⌨️'}
              </div>
              <p className="text-sm text-gray-600">Feature illustration</p>
            </div>
          </div>

          {/* Footer */}
          <div className="px-8 py-5 bg-gray-50 rounded-b-xl sm:rounded-b-2xl flex items-center justify-between border-t border-gray-200 flex-shrink-0">
            <button
              onClick={handleSkip}
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              Skip Tour
            </button>

            <div className="flex items-center gap-3">
              {currentStep > 0 && (
                <button
                  onClick={handlePrevious}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-white transition-colors text-sm font-medium text-gray-700 flex items-center gap-2"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </button>
              )}
              <button
                onClick={handleNext}
                className="px-5 py-2 bg-gradient-to-r from-gray-800 to-gray-800 text-white rounded-lg hover:shadow-lg transition-all text-sm font-medium flex items-center gap-2"
              >
                {currentStep < tourSteps.length - 1 ? 'Next' : 'Get Started'}
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
