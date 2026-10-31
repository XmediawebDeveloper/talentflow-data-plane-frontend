import { Sparkles, CheckCircle2, Loader2, AlertCircle, Lightbulb } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { aiMatchService, MatchedCandidate } from '@/lib/services/aiMatchService';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

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
    { title: 'Analyzing job requirements', description: 'Extracting skills, experience, and role details' },
    { title: 'Processing job criteria', description: 'Identifying key responsibilities and qualifications' },
    { title: 'Scanning candidate database', description: 'Searching through relevant candidate profiles' },
    { title: 'Computing match scores', description: 'Analyzing candidate fit and ranking results' },
    { title: 'Finalizing results', description: 'Preparing your personalized recommendations' },
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
        <div className="bg-white rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 ring-1 ring-black/[0.02] max-w-[95vw] sm:max-w-md w-full p-5 sm:p-6 max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <div className="text-center">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-destructive-subtle ring-1 ring-destructive-line rounded-full flex items-center justify-center mx-auto mb-3">
              <AlertCircle className="w-5 h-5 sm:w-6 sm:h-6 text-destructive" />
            </div>
            <h2 className="tf-section-title mb-2">Matching Failed</h2>
            <p className="tf-card-desc mb-4">{error}</p>
            <Button
              variant="primary"
              onClick={() => window.location.reload()}
            >
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Show progress panel
  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
      <div className="bg-white rounded-2xl shadow-2xl shadow-brand-blue/10 border border-gray-100 ring-1 ring-black/[0.02] max-w-[95vw] sm:max-w-2xl w-full p-4 sm:p-6 max-h-[calc(100dvh-2rem)] overflow-y-auto">
        {/* Header */}
        <div className="text-center mb-3 sm:mb-4">
          <div className="relative w-11 h-11 sm:w-14 sm:h-14 mx-auto mb-2 sm:mb-3">
            <div className="absolute inset-0 rounded-full bg-brand-blue/15 animate-pulse"></div>
            <div className="relative w-full h-full bg-gradient-to-br from-brand-blue to-brand-blue-2 ring-1 ring-white/10 shadow-lg shadow-brand-blue/30 rounded-full flex items-center justify-center">
              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
          </div>
          <h2 className="text-lg sm:text-2xl font-bold text-gray-900 mb-1">AI Matching in Progress</h2>
          <p className="text-sm sm:text-base font-semibold text-gray-500 truncate px-2 sm:px-4 mb-1">{jobTitle}</p>
          <p className="tf-body-muted px-2 sm:px-6">
            Our AI is analyzing the job and candidate details to find the best match for you.
          </p>
        </div>

        {/* Progress Bar */}
        <div className="mb-3 sm:mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm text-gray-700 font-semibold">Overall Progress</span>
            <span className="text-base sm:text-lg text-brand-blue font-bold">{progress}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-brand-blue to-brand-blue-2 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>

        {/* Current Steps */}
        <div className="space-y-1.5 sm:space-y-2">
          {steps.map((step, index) => {
            const stepNumber = index + 1;
            const isComplete = currentStep > stepNumber;
            const isCurrent = currentStep === stepNumber;
            const statusLabel = isComplete ? 'Completed' : isCurrent ? 'In Progress' : 'Pending';

            return (
              <div
                key={index}
                className={`flex items-center gap-3 p-2 sm:p-2.5 rounded-xl transition-all ${
                  isCurrent ? 'bg-brand-blue/5 ring-1 ring-brand-blue/30' :
                  isComplete ? 'bg-success-subtle ring-1 ring-success-line' :
                  'bg-gray-50 ring-1 ring-gray-200'
                }`}
              >
                <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  isCurrent ? 'bg-brand-blue text-white shadow shadow-brand-blue/25 ring-1 ring-white/10' :
                  isComplete ? 'bg-success text-white' :
                  'bg-gray-300 text-gray-600'
                }`}>
                  {isComplete ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : isCurrent ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <span className="text-xs font-semibold">{stepNumber}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold truncate ${
                    isCurrent ? 'text-brand-blue' :
                    isComplete ? 'text-success' :
                    'text-gray-700'
                  }`}>
                    {step.title}
                  </p>
                  <p className="tf-meta truncate">{step.description}</p>
                </div>
                <span className={`flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${
                  isCurrent ? 'bg-brand-blue/10 text-brand-blue' :
                  isComplete ? 'bg-success-subtle text-success' :
                  'bg-gray-200 text-gray-600'
                }`}>
                  {statusLabel}
                </span>
              </div>
            );
          })}
        </div>

        {/* Footer note */}
        <div className="flex items-center justify-center gap-2 mt-3 sm:mt-4 tf-body-muted">
          <Lightbulb className="w-4 h-4 text-brand-blue flex-shrink-0" />
          <span>This may take a few moments. Please don&apos;t close this window.</span>
        </div>
      </div>
    </div>
  );
}
