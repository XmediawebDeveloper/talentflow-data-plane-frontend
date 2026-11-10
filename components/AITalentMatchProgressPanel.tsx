import { Sparkles, CheckCircle2, Loader2, AlertCircle, Lightbulb, Minus, Check } from 'lucide-react';
import { useState, useRef, useEffect, useContext } from 'react';
import { aiMatchService, MatchedCandidate } from '@/lib/services/aiMatchService';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import ScoringProgressContext from '@/contexts/ScoringProgressContext';
import { useOptionalBulkInviteProgress } from '@/contexts/BulkInviteProgressContext';
import { isBulkInviteActive } from '@/lib/services/bulkInviteService';

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

  /* Minimize (top right, like the bulk invite popup): the popup shrinks into
     the bottom-right corner and a round icon follows the match while the page
     stays usable. A match that finishes while minimized holds its results —
     a toast and the icon (turned green) hand them over on a click, rather
     than the page jumping to them mid-task. */
  const [view, setView] = useState<'popup' | 'minimizing' | 'icon'>('popup');
  const viewRef = useRef(view);
  useEffect(() => { viewRef.current = view; });
  const [heldResults, setHeldResults] = useState<MatchedCandidate[] | null>(null);
  const handedOver = useRef(false);
  const handOver = (results: MatchedCandidate[]) => {
    if (handedOver.current) return;
    handedOver.current = true;
    onComplete(results);
  };

  /* The corner's other widgets (scoring, bulk invite) keep their spot; the
     icon stacks above them when one is showing. */
  const scoring = useContext(ScoringProgressContext);
  const bulk = useOptionalBulkInviteProgress();
  const cornerTaken = (!!scoring && scoring.activeScoringJobs.length > 0 && !scoring.isMainPanelOpen)
    || (!!bulk && bulk.widget !== 'hidden' && bulk.jobs.some((j) => !j.dismissed && !bulk.inPopupIds.has(j.job_id)
      && (bulk.widget === 'mini' || isBulkInviteActive(j) || j.status === 'paused' || !!j.stalled)));

  const minimize = () => {
    if (view !== 'popup') return;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setView('icon');
      return;
    }
    setView('minimizing');
    window.setTimeout(() => setView('icon'), 260);
  };

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

        if (viewRef.current === 'popup') {
          setTimeout(() => {
            handOver(candidates);
          }, 500);
        } else {
          setHeldResults(candidates);
          toast.success(`AI matching finished — ${jobTitle}`, {
            description: `${candidates.length} matching candidate${candidates.length === 1 ? '' : 's'} found.`,
            duration: 10000,
            action: { label: 'View results', onClick: () => handOver(candidates) },
          });
        }

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
            <h2 className="tf-section-title sm:text-lg mb-2">Matching Failed</h2>
            <p className="tf-body-secondary mb-4">{error}</p>
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

  // Minimized: the round icon — a ring of the progress, the % (✓ once done)
  if (view === 'icon') {
    const done = !!heldResults;
    const ring = done ? 'var(--raw-22c55e, #22c55e)' : 'var(--raw-ffffff, #ffffff)';
    const label = done
      ? `AI matching finished · ${jobTitle} · click to see the results`
      : `AI matching · ${jobTitle} · ${progress}% · click to open`;
    return (
      <button
        type="button"
        onClick={() => (heldResults ? handOver(heldResults) : setView('popup'))}
        aria-label={label}
        title={label}
        className={`fixed ${cornerTaken ? 'bottom-[5.5rem]' : 'bottom-6'} right-3 sm:right-6 z-40 h-12 w-12 rounded-full p-0.5 shadow-lg shadow-brand-blue/30 ring-1 ring-white/10 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/50 focus-visible:ring-offset-2 animate-in fade-in zoom-in-75 duration-200`}
        style={{ background: `conic-gradient(${ring} ${(done ? 100 : progress) * 3.6}deg, rgba(255,255,255,0.25) 0deg)` }}
      >
        <span className="relative flex h-full w-full items-center justify-center rounded-full bg-brand-blue text-white">
          <Sparkles className="h-5 w-5" />
          {done ? (
            <span className="absolute -top-1 -right-1 h-[1.125rem] w-[1.125rem] rounded-full bg-success text-white flex items-center justify-center ring-2 ring-white">
              <Check className="w-3 h-3" />
            </span>
          ) : (
            <span className="absolute -top-1.5 -right-2 min-w-[1.75rem] h-[1.125rem] px-1 rounded-full bg-white text-brand-blue text-[10px] font-bold leading-[1.125rem] tabular-nums ring-1 ring-brand-blue/20">
              {progress}%
            </span>
          )}
        </span>
      </button>
    );
  }

  const minimizing = view === 'minimizing';

  // Show progress panel
  return (
    <div className={`fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6 ${minimizing ? 'opacity-0 transition-opacity duration-200 pointer-events-none' : 'animate-in fade-in duration-200'}`}>
      <div className={`relative bg-white rounded-2xl shadow-2xl shadow-brand-blue/10 border border-gray-100 ring-1 ring-black/[0.02] max-w-[95vw] sm:max-w-2xl w-full p-4 sm:p-6 max-h-[calc(100dvh-2rem)] overflow-y-auto ${minimizing ? 'origin-bottom-right translate-x-[30vw] translate-y-[35vh] scale-[0.12] opacity-0 transition-[translate,scale,opacity] duration-[260ms] ease-in' : 'animate-in zoom-in-95 duration-200'}`}>
        {isLoading && (
          <Button
            variant="secondary"
            size="sm"
            onClick={minimize}
            className="w-8 !px-0 absolute top-3 right-3 sm:top-4 sm:right-4"
            aria-label="Minimize"
            title="Minimize — matching carries on; follow it from the icon bottom right"
          >
            <Minus className="w-4 h-4" />
          </Button>
        )}
        {/* Header */}
        <div className="text-center mb-3 sm:mb-4">
          <div className="relative w-11 h-11 sm:w-14 sm:h-14 mx-auto mb-2 sm:mb-3">
            <div className="absolute inset-0 rounded-full bg-brand-blue/15 animate-pulse"></div>
            <div className="relative w-full h-full bg-gradient-to-br from-brand-blue to-brand-blue-2 ring-1 ring-white/10 shadow-lg shadow-brand-blue/30 rounded-full flex items-center justify-center">
              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
          </div>
          <h2 className="tf-section-title sm:text-2xl mb-1">AI Matching in Progress</h2>
          <p className="text-sm sm:text-base font-semibold text-gray-500 break-words sm:truncate px-2 sm:px-4 mb-1">{jobTitle}</p>
          <p className="tf-body-muted px-2 sm:px-6">
            Our AI is analyzing the job and candidate details to find the best match for you.
          </p>
        </div>

        {/* Progress Bar */}
        <div className="mb-3 sm:mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="tf-row-title">Overall Progress</span>
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
                  {/* Phones: title and description wrap instead of being cut with "…". */}
                  <p className={`text-sm font-semibold break-words sm:truncate ${
                    isCurrent ? 'text-brand-blue' :
                    isComplete ? 'text-success' :
                    'text-gray-700'
                  }`}>
                    {step.title}
                  </p>
                  <p className="tf-meta break-words sm:truncate">{step.description}</p>
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
        <div className="flex items-center justify-center gap-2 mt-3 sm:mt-4 tf-body-muted text-center">
          <Lightbulb className="w-4 h-4 text-brand-blue flex-shrink-0" />
          <span>This may take a few moments. You can minimize this window — matching carries on in the background.</span>
        </div>
      </div>
    </div>
  );
}
