'use client';

import * as React from 'react';
import { cn } from './utils';

/**
 * Page-level outer wrapper used across dashboard pages.
 * Provides consistent max-width, padding, and the slate background
 * established by /recruitment/job-openings.
 */
export function PageContainer({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'tf-page relative flex flex-col',
        className,
      )}
    >
      <div className="flex-1 px-4 py-4 sm:px-6 sm:py-6 max-w-[1600px] w-full mx-auto">{children}</div>
    </div>
  );
}

/**
 * Surface card — for content sections inside a page (e.g., a form panel,
 * a list panel). White in light mode, slate-900 in dark mode, with the same
 * border/ring/shadow recipe as the toolbar.
 */
export function SurfaceCard({
  children,
  className,
  padded = true,
}: {
  children: React.ReactNode;
  className?: string;
  /** When false, omits internal padding so callers can manage spacing. */
  padded?: boolean;
}) {
  return (
    <div
      className={cn(
        'tf-card',
        padded && 'p-4 sm:p-5',
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Section heading inside a SurfaceCard or page.
 * Use for "Recent activity", "Settings", subgroupings inside a page.
 */
export function SectionHeading({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3 mb-3', className)}>
      <div className="min-w-0">
        <h2 className="tf-section-title tracking-tight">
          {title}
        </h2>
        {description && (
          <p className="mt-0.5 tf-body-secondary">{description}</p>
        )}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}
