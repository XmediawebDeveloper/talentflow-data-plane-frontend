'use client'

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
    <div className="flex-1 flex items-center justify-center py-12 sm:py-20 px-4">
      <div className="text-center max-w-md mx-auto">
        {/* Icon */}
        <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-5 sm:mb-6 rounded-full bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center">
          <Icon className="w-8 h-8 sm:w-10 sm:h-10 text-[var(--text-muted)]" />
        </div>

        {/* Title */}
        <h3 className="text-[var(--text-primary)] text-lg sm:text-xl font-semibold mb-2 tracking-tight">{title}</h3>

        {/* Description */}
        <p className="text-[var(--text-secondary)] text-sm sm:text-base mb-5 sm:mb-6 leading-relaxed">{description}</p>

        {/* Actions */}
        {(action || secondaryAction) && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2 sm:gap-3">
            {action && (
              <button
                onClick={action.onClick}
                className={`
                  inline-flex items-center justify-center h-10 px-5 rounded-lg transition-all duration-150 text-sm font-medium
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2
                  ${
                    action.variant === 'secondary'
                      ? 'bg-[var(--surface)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)] border border-[var(--border)]'
                      : 'bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] shadow-sm hover:shadow-md'
                  }
                `}
              >
                {action.label}
              </button>
            )}
            {secondaryAction && (
              <button
                onClick={secondaryAction.onClick}
                className="inline-flex items-center justify-center h-10 px-5 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-lg transition-colors"
              >
                {secondaryAction.label}
              </button>
            )}
          </div>
        )}

        {/* Custom children */}
        {children && <div className="mt-5 sm:mt-6">{children}</div>}
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
    <div className="flex flex-col items-center justify-center py-10 sm:py-12 px-4 text-center">
      <div className="text-[var(--text-secondary)] mb-1.5 text-sm sm:text-base font-medium">{message}</div>
      <div className="text-xs sm:text-sm text-[var(--text-muted)]">{suggestion}</div>
    </div>
  );
}
