'use client';

import React from 'react';
import Link from 'next/link';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

export interface BreadcrumbCrumb {
  label: string;
  /** Link target. Omit on the current (last) crumb so it renders as plain text. */
  href?: string;
  /**
   * Click handler for crumbs that navigate within a single-route view (e.g. an
   * in-page step/view switch). Used when `href` would point at the route the
   * user is already on, which a normal link cannot re-trigger. Ignored if
   * `href` is set or on the last crumb.
   */
  onClick?: () => void;
}

/**
 * Route breadcrumb shown at the top of a page, e.g. Dashboard › Current Plan › Usage & Quotas.
 * The last item is always rendered as the current page (non-clickable), even if a href is given.
 */
export default function PageBreadcrumb({
  items,
  className = 'mb-4',
}: {
  items: BreadcrumbCrumb[];
  className?: string;
}) {
  return (
    <Breadcrumb className={`bg-slate-50 ring-1 ring-slate-200/80 rounded-lg px-3 py-2 ${className}`}>
      <BreadcrumbList>
        {items.map((crumb, idx) => {
          const isLast = idx === items.length - 1;
          return (
            <React.Fragment key={`${crumb.label}-${idx}`}>
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage className="font-semibold text-brand-blue">
                    {crumb.label}
                  </BreadcrumbPage>
                ) : crumb.href ? (
                  <BreadcrumbLink asChild>
                    <Link href={crumb.href}>{crumb.label}</Link>
                  </BreadcrumbLink>
                ) : crumb.onClick ? (
                  <BreadcrumbLink asChild>
                    <button type="button" onClick={crumb.onClick} className="cursor-pointer">
                      {crumb.label}
                    </button>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage className="font-semibold text-brand-blue">
                    {crumb.label}
                  </BreadcrumbPage>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
