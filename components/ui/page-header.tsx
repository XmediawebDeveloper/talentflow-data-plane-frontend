'use client';

import * as React from 'react';
import { cn } from './utils';

export interface PageHeaderProps {
  title: string;
  description?: React.ReactNode;
  /** Optional icon shown left of title — pass a Lucide icon element, already sized. */
  icon?: React.ReactNode;
  /** Right-aligned action area (buttons, quota chips, etc.). */
  actions?: React.ReactNode;
  /** Slot above the title row — typically breadcrumbs. */
  breadcrumb?: React.ReactNode;
  className?: string;
}

/**
 * Standard page header used across all dashboard pages.
 * Title is text-lg sm:text-xl, tracking-tight; description is text-sm text-gray-600.
 * Pattern mirrors /recruitment/job-openings.
 */
export function PageHeader({
  title,
  description,
  icon,
  actions,
  breadcrumb,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('mb-5', className)}>
      {breadcrumb && <div className="mb-3">{breadcrumb}</div>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          {icon && (
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/15 dark:bg-brand-blue/20 dark:ring-brand-blue/30">
              {icon}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="tf-page-title mb-1 truncate">
              {title}
            </h1>
            {description && (
              <p className="tf-body-secondary">{description}</p>
            )}
          </div>
        </div>
        {actions && <div className="flex flex-col sm:items-end gap-2 shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
