import { Sparkles, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
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
  const [completedCandidates, setCompletedCandidates] = useState(0);
  const [totalCandidates, setTotalCandidates] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const hasStarted = useRef(false);

  const steps = [
    'Analyzing job requirements',
    'Generating embeddings',
    'Scanning candidate database',
    'Computing AI match scores',
    'Ranking candidates',
    'Finalizing results'
  ];

  useEffect(() => {
    // Prevent double execution in React Strict Mode
    if (hasStarted.current) return;
    hasStarted.current = true;

    let progressInterval: NodeJS.Timeout;
    let stepInterval: NodeJS.Timeout;

    const runAIMatch = async () => {
      try {
        // Start progress animation
        progressInterval = setInterval(() => {
          setProgress(prev => {
            if (prev >= 90) return 90; // Cap at 90% until API returns
            return prev + 2;
          });
        }, 100);

        // Update steps animation
        stepInterval = setInterval(() => {
          setCurrentStep(prev => {
            if (prev >= steps.length - 1) return prev;
            return prev + 1;
          });
        }, 1500);

        // Call the real RAG API
        const { session, candidates } = await aiMatchService.run(jobId, {
          limit: 50,
          minSimilarity: 0.2,  // Lower threshold to include more candidates
        });

        // Update progress to 100%
        clearInterval(progressInterval);
        clearInterval(stepInterval);
        setProgress(100);
        setCurrentStep(steps.length);
        setTotalCandidates(candidates.length);
        setCompletedCandidates(candidates.length);
        setIsLoading(false);

        // Small delay to show completion
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

    return () => {
      clearInterval(progressInterval);
      clearInterval(stepInterval);
    };
  }, [jobId, onComplete, onError]);

  // Show error state
  if (error) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
          <div className="text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Matching Failed</h2>
            <p className="text-gray-600 mb-6">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors font-medium"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-gray-800 to-gray-800 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
            <Sparkles className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl text-gray-900 mb-2">AI Matching in Progress</h2>
          <p className="text-gray-600">
            Analyzing candidates for: <span className="font-medium text-gray-900">{jobTitle}</span>
          </p>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600 font-medium">Overall Progress</span>
            <span className="text-sm text-gray-800 font-bold">{progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-gray-800 to-gray-800 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>

        {/* Current Steps */}
        <div className="space-y-3 mb-8">
          {steps.map((step, index) => {
            const stepNumber = index + 1;
            const isComplete = currentStep > stepNumber;
            const isCurrent = currentStep === stepNumber;
            
            return (
              <div 
                key={index}
                className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                  isCurrent ? 'bg-gray-50 border-2 border-gray-300' :
                  isComplete ? 'bg-green-50 border border-green-200' :
                  'bg-gray-50 border border-gray-200'
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  isCurrent ? 'bg-gray-800 text-white' :
                  isComplete ? 'bg-green-600 text-white' :
                  'bg-gray-300 text-gray-600'
                }`}>
                  {isComplete ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : isCurrent ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <span className="text-sm font-medium">{stepNumber}</span>
                  )}
                </div>
                <span className={`text-sm font-medium ${
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

        {/* Stats */}
        <div className="bg-gradient-to-br from-gray-50 to-gray-50 border border-gray-200 rounded-xl p-6">
          <div className="grid grid-cols-2 gap-6">
            <div className="text-center">
              <div className="text-sm text-gray-600 mb-1">Candidates Found</div>
              <div className="text-3xl font-bold text-gray-800">
                {isLoading ? (
                  <span className="animate-pulse">...</span>
                ) : (
                  completedCandidates
                )}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {isLoading ? 'Searching...' : `${totalCandidates} matches`}
              </div>
            </div>
            <div className="text-center">
              <div className="text-sm text-gray-600 mb-1">RAG Pipeline</div>
              <div className="flex items-center justify-center gap-2">
                <div className="flex items-center gap-1">
                  <div className={`w-2 h-2 rounded-full ${isLoading ? 'bg-green-500 animate-pulse' : 'bg-green-500'}`}></div>
                  <span className="text-sm font-medium text-green-600">
                    {isLoading ? 'Processing' : 'Complete'}
                  </span>
                </div>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {isLoading ? 'Vector search + AI filtering' : 'Done'}
              </div>
            </div>
          </div>
        </div>

        {/* Info Text */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            Using RAG pipeline: Vector similarity search + AI-powered candidate filtering.
            <br />
            Candidates are ranked by combined similarity and AI match scores.
          </p>
        </div>
      </div>
    </div>
  );
}