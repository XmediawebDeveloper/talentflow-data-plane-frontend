import { Sparkles, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { useState, useRef } from 'react';
import { aiMatchService, MatchedCandidate } from '@/lib/services/aiMatchService';
import AITalentMatchSettings from './AITalentMatchSettings';

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
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(true);
  const [selectedModel, setSelectedModel] = useState('bge-small-en-v1.5');  // Default model
  const hasStarted = useRef(false);

  const steps = [
    'Analyzing job requirements',
    'Generating embeddings',
    'Scanning candidate database',
    'Computing similarity scores',
    'AI filtering candidates',
    'Finalizing results'
  ];

  const startMatching = () => {
    setShowSettings(false);
    setIsLoading(true);

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
      <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
          <div className="text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <AlertCircle className="w-6 h-6 text-red-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Matching Failed</h2>
            <p className="text-sm text-gray-600 mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors font-medium text-sm"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show settings panel first - model selection
  if (showSettings) {
    return (
      <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
          {/* Header */}
          <div className="border-b border-gray-200 p-4 rounded-t-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">AI Talent Match</h2>
                <p className="text-sm text-gray-500 truncate max-w-[280px]">{jobTitle}</p>
              </div>
            </div>
          </div>

          {/* Model Selection */}
          <AITalentMatchSettings
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
          />

          {/* Actions */}
          <div className="border-t border-gray-200 p-4 rounded-b-xl flex items-center justify-between gap-3">
            <button
              onClick={() => onError?.('Cancelled')}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium text-sm"
            >
              Cancel
            </button>
            <button
              onClick={startMatching}
              className="px-6 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors font-medium text-sm flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              Start Matching
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show progress panel
  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
        {/* Header */}
        <div className="text-center mb-5">
          <div className="w-14 h-14 bg-gradient-to-br from-gray-800 to-gray-800 rounded-full flex items-center justify-center mx-auto mb-3 animate-pulse">
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">AI Matching in Progress</h2>
          <p className="text-sm text-gray-600 truncate px-4">{jobTitle}</p>
          <p className="text-xs text-gray-400 mt-1">Using {selectedModel}</p>
        </div>

        {/* Progress Bar */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-gray-600 font-medium">Overall Progress</span>
            <span className="text-xs text-gray-800 font-bold">{progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-gray-800 to-gray-800 rounded-full transition-all duration-300 ease-out"
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
                  isCurrent ? 'bg-gray-50 border-2 border-gray-300' :
                  isComplete ? 'bg-green-50 border border-green-200' :
                  'bg-gray-50 border border-gray-200'
                }`}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                  isCurrent ? 'bg-gray-800 text-white' :
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
                  isCurrent ? 'text-gray-900' :
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
