import { CheckCircle, Loader2 } from 'lucide-react';

interface Step {
  label: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
}

interface ProgressIndicatorProps {
  steps: Step[];
  currentStep: number;
}

/**
 * Multi-step progress indicator for long-running operations
 */
export function ProgressIndicator({ steps, currentStep }: ProgressIndicatorProps) {
  return (
    <div className="space-y-4">
      {steps.map((step, index) => {
        const isActive = index === currentStep;
        const isCompleted = step.status === 'completed';
        const isError = step.status === 'error';
        const isProcessing = step.status === 'processing';

        return (
          <div key={index} className="flex items-center gap-4">
            {/* Status Icon */}
            <div
              className={`
                flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all
                ${isCompleted ? 'bg-green-500' : ''}
                ${isError ? 'bg-red-500' : ''}
                ${isProcessing ? 'bg-blue-500 animate-pulse' : ''}
                ${step.status === 'pending' ? 'bg-gray-200' : ''}
              `}
            >
              {isCompleted && <CheckCircle className="w-5 h-5 text-white" />}
              {isProcessing && <Loader2 className="w-5 h-5 text-white animate-spin" />}
              {step.status === 'pending' && <span className="text-xs text-gray-500">{index + 1}</span>}
              {isError && <span className="text-white text-xs">!</span>}
            </div>

            {/* Step Label */}
            <div className="flex-1">
              <div
                className={`
                  text-sm font-medium transition-colors
                  ${isCompleted ? 'text-green-700' : ''}
                  ${isError ? 'text-red-700' : ''}
                  ${isProcessing ? 'text-blue-700' : ''}
                  ${step.status === 'pending' ? 'text-gray-500' : ''}
                `}
              >
                {step.label}
              </div>
              {isProcessing && (
                <div className="mt-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 animate-loading-bar w-1/4"></div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Simple linear progress bar
 */
export function LinearProgress({ progress, label }: { progress: number; label?: string }) {
  return (
    <div className="w-full">
      {label && (
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-600">{label}</span>
          <span className="text-sm font-medium text-gray-900">{Math.round(progress)}%</span>
        </div>
      )}
      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-300 ease-out rounded-full"
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>
    </div>
  );
}
