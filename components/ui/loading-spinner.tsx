/**
 * Loading Spinner Components
 * Various loading indicators for different contexts
 */

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  color?: 'blue' | 'white' | 'gray';
  className?: string;
}

export function LoadingSpinner({ size = 'md', color = 'blue', className = '' }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
    xl: 'w-12 h-12',
  };

  const colorClasses = {
    blue: 'border-gray-800 border-t-transparent',
    white: 'border-white border-t-transparent',
    gray: 'border-gray-400 border-t-transparent',
  };

  return (
    <div
      className={`${sizeClasses[size]} border-2 ${colorClasses[color]} rounded-full animate-spin ${className}`}
    />
  );
}

export function LoadingSpinnerWithText({ text = 'Loading...' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-8">
      <LoadingSpinner size="md" color="blue" />
      <span className="text-sm text-gray-600">{text}</span>
    </div>
  );
}

export function PageLoader() {
  return (
    <div className="flex-1 flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <LoadingSpinner size="xl" color="blue" className="mx-auto mb-4" />
        <p className="text-gray-600">Loading TalentFlow...</p>
      </div>
    </div>
  );
}

export function FullPageLoader({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="text-center">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-gray-200 rounded-full animate-ping absolute"></div>
          <div className="w-16 h-16 border-4 border-gray-800 border-t-transparent rounded-full animate-spin"></div>
        </div>
        <p className="text-gray-700 mt-6 text-lg font-medium">{message}</p>
      </div>
    </div>
  );
}

export function InlineLoader({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  return (
    <div className="flex items-center justify-center py-4">
      <LoadingSpinner size={size} color="blue" />
    </div>
  );
}

export function ButtonLoader() {
  return <LoadingSpinner size="sm" color="white" />;
}

/**
 * Pulsing dots loader
 */
export function DotsLoader({ color = 'blue' }: { color?: 'blue' | 'gray' | 'white' }) {
  const dotColor = {
    blue: 'bg-gray-800',
    gray: 'bg-gray-400',
    white: 'bg-white',
  };

  return (
    <div className="flex items-center gap-1">
      <div className={`w-2 h-2 ${dotColor[color]} rounded-full animate-bounce`} style={{ animationDelay: '0ms' }}></div>
      <div className={`w-2 h-2 ${dotColor[color]} rounded-full animate-bounce`} style={{ animationDelay: '150ms' }}></div>
      <div className={`w-2 h-2 ${dotColor[color]} rounded-full animate-bounce`} style={{ animationDelay: '300ms' }}></div>
    </div>
  );
}

/**
 * Progress bar loader
 */
export function ProgressLoader({ progress = 0, label }: { progress?: number; label?: string }) {
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
          className="h-full bg-gradient-to-r from-gray-700 to-gray-800 transition-all duration-300 ease-out rounded-full"
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>
    </div>
  );
}
