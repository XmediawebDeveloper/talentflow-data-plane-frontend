import { Sparkles, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { aiMatchService, MatchedCandidate } from '@/lib/services/aiMatchService';

interface AITalentMatchProgressPanelProps {
  jobTitle: string;
  jobId: string;
  onComplete: (results: MatchedCandidate[]) => void;
  onError?: (error: string) => void;
}

export default function AITalentMatchProgressPanel({
  jobTitle,
  jobId,
  onComplete,
  onError,
}: AITalentMatchProgressPanelProps) {
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const selectedModel = 'bge-small-en-v1.5';  // 384d - must match stored resume embeddings

  const hasStarted = useRef(false);

  const steps = [
    'Analyzing job requirements',
    'Processing job criteria',
    'Scanning candidate database',
    'Computing match scores',
    'Finalizing results'
  ];

  // Start matching immediately on mount
  useEffect(() => {
    startMatching();
  }, []);

  const startMatching = () => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    let progressInterval: NodeJS.Timeout;
    let stepInterval: NodeJS.Timeout;

    const runAIMatch = async () => {
      try {
        progressInterval = setInterval(() => {
          setProgress(prev => prev >= 90 ? 90 : prev + 2);
        }, 100);

        stepInterval = setInterval(() => {
          setCurrentStep(prev => prev >= steps.length - 1 ? prev : prev + 1);
        }, 1500);

        // Call API with selected model - returns all matching candidates (like rag.py)
        const { session, candidates } = await aiMatchService.run(jobId, {
          embeddingModel: selectedModel,
          minSimilarity: 0.5,
        });

        clearInterval(progressInterval);
        clearInterval(stepInterval);
        setProgress(100);
        setCurrentStep(steps.length);
        setIsLoading(false);

        setTimeout(() => {
          onComplete(candidates);
        }, 500);

      } catch (err) {
        clearInterval(progressInterval);
        clearInterval(stepInterval);
        const errorMessage = err instanceof Error ? err.message : 'Failed to run AI match';
        setError(errorMessage);
        setIsLoading(false);
        onError?.(errorMessage);
      }
    };

    runAIMatch();
  };

  // Show error state
  if (error) {
    return (
      <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
        <div className="bg-white rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 ring-1 ring-black/[0.02] max-w-sm w-full p-5 sm:p-6 max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <div className="text-center">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-red-50 ring-1 ring-red-200 rounded-full flex items-center justify-center mx-auto mb-3">
              <AlertCircle className="w-5 h-5 sm:w-6 sm:h-6 text-red-600" />
            </div>
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">Matching Failed</h2>
            <p className="text-xs sm:text-sm text-gray-600 mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors font-medium text-sm"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show progress panel
  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
      <div className="bg-white rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 ring-1 ring-black/[0.02] max-w-lg w-full p-5 sm:p-6 max-h-[calc(100dvh-2rem)] overflow-y-auto">
        {/* Header */}
        <div className="text-center mb-4 sm:mb-5">
          <div className="w-10 h-10 sm:w-14 sm:h-14 bg-brand-blue ring-1 ring-white/10 shadow-md shadow-brand-blue/25 rounded-full flex items-center justify-center mx-auto mb-3 animate-pulse">
            <Sparkles className="w-5 h-5 sm:w-7 sm:h-7 text-white" />
          </div>
          <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-1">AI Matching in Progress</h2>
          <p className="text-xs sm:text-sm text-gray-600 truncate px-2 sm:px-4">{jobTitle}</p>
        </div>

        {/* Progress Bar */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-gray-600 font-medium">Overall Progress</span>
            <span className="text-xs text-brand-blue font-bold">{progress}%</span>
          </div>
          <div className="w-full bg-brand-blue/10 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-brand-blue to-brand-blue-2 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>

        {/* Current Steps */}
        <div className="space-y-2">
          {steps.map((step, index) => {
            const stepNumber = index + 1;
            const isComplete = currentStep > stepNumber;
            const isCurrent = currentStep === stepNumber;

            return (
              <div
                key={index}
                className={`flex items-center gap-2 p-2 rounded-lg transition-all ${
                  isCurrent ? 'bg-brand-blue/5 ring-1 ring-brand-blue/30' :
                  isComplete ? 'bg-green-50 ring-1 ring-green-200' :
                  'bg-gray-50 ring-1 ring-gray-200'
                }`}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                  isCurrent ? 'bg-brand-blue text-white shadow shadow-brand-blue/25 ring-1 ring-white/10' :
                  isComplete ? 'bg-green-600 text-white' :
                  'bg-gray-300 text-gray-600'
                }`}>
                  {isComplete ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : isCurrent ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <span className="text-xs font-medium">{stepNumber}</span>
                  )}
                </div>
                <span className={`text-xs font-medium ${
                  isCurrent ? 'text-brand-blue' :
                  isComplete ? 'text-green-700' :
                  'text-gray-600'
                }`}>
                  {step}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
