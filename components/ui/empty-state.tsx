import { LucideIcon } from 'lucide-react';
import { ReactNode } from 'react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'secondary';
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  children?: ReactNode;
}

/**
 * Enhanced empty state component with icon, title, description, and CTAs
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  children,
}: EmptyStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center py-20">
      <div className="text-center max-w-md mx-auto px-6">
        {/* Icon */}
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center">
          <Icon className="w-10 h-10 text-blue-600" />
        </div>

        {/* Title */}
        <h3 className="text-gray-900 mb-3 text-2xl">{title}</h3>

        {/* Description */}
        <p className="text-gray-600 mb-6 leading-relaxed">{description}</p>

        {/* Actions */}
        {(action || secondaryAction) && (
          <div className="flex items-center justify-center gap-3">
            {action && (
              <button
                onClick={action.onClick}
                className={`
                  px-5 py-2.5 rounded-lg transition-all duration-200 text-sm font-medium
                  ${
                    action.variant === 'secondary'
                      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300'
                      : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm hover:shadow-md'
                  }
                `}
              >
                {action.label}
              </button>
            )}
            {secondaryAction && (
              <button
                onClick={secondaryAction.onClick}
                className="px-5 py-2.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                {secondaryAction.label}
              </button>
            )}
          </div>
        )}

        {/* Custom children */}
        {children && <div className="mt-6">{children}</div>}
      </div>
    </div>
  );
}

/**
 * Simple empty state for tables/lists
 */
export function SimpleEmptyState({
  message = 'No items found',
  suggestion = 'Try adjusting your search or filters',
}: {
  message?: string;
  suggestion?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="text-gray-400 mb-2 text-lg">{message}</div>
      <div className="text-sm text-gray-500">{suggestion}</div>
    </div>
  );
}
