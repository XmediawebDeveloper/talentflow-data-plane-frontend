'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  sticky = true,
  actions,
  barRef,
}: {
  items: BreadcrumbCrumb[];
  className?: string;
  /**
   * Pin the breadcrumb to the top of the scroll container. Defaults to true.
   * Set to false on pages that already pin another element (e.g. a tab bar) at
   * top-0, otherwise the two sticky layers overlap and the breadcrumb links
   * become unclickable.
   */
  sticky?: boolean;
  /**
   * Controls rendered on the right of the crumb row, inside the same bar —
   * e.g. a Previous/Next record pager. Kept inside so the pager travels with a
   * sticky breadcrumb instead of scrolling away above it. The bar's own
   * background and ring are untouched; when omitted the markup is byte-for-byte
   * what it was, so no other page shifts.
   */
  actions?: React.ReactNode;
  /**
   * Ref onto the bar element itself. A page that pins a SECOND sticky layer
   * below this one (a tab bar, say) must offset it by this bar's real height —
   * measuring beats hardcoding, because the bar grows when `actions` wrap onto
   * a second line, and an offset that is too small leaves this bar covering the
   * layer underneath and swallowing its clicks.
   *
   * A wrapper div around <PageBreadcrumb> is NOT an alternative: `sticky` needs
   * this bar to be a direct child of the scrolling card, and a wrapper boxes it
   * to its own height so it can never travel.
   */
  barRef?: React.Ref<HTMLElement>;
}) {
  const router = useRouter();
  const list = (
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
                    <Link
                      href={crumb.href}
                      onClick={(e) => {
                        // Guaranteed client-side navigation. On pages that use a
                        // nested scroll container the default <Link> click can be
                        // swallowed; pushing explicitly keeps the crumb reliable.
                        if (e.defaultPrevented) return;
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                        e.preventDefault();
                        router.push(crumb.href!);
                      }}
                    >
                      {crumb.label}
                    </Link>
                  </BreadcrumbLink>
                ) : crumb.onClick ? (
                  <BreadcrumbLink asChild>
                    <button type="button" onClick={crumb.onClick} className="cursor-pointer">
                      {crumb.label}
                    </button>
                  </BreadcrumbLink>
                ) : (
                  // A middle crumb with no href and no onClick — a grouping
                  // label whose section has no page of its own (e.g. "Audits",
                  // "Reports"). Muted, not brand-blue semibold: styled like the
                  // last crumb it read as a second "current page", so the trail
                  // showed two highlighted items and neither looked like where
                  // the user actually was.
                  <span className="text-slate-500">{crumb.label}</span>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </React.Fragment>
          );
        })}
    </BreadcrumbList>
  );

  return (
    <Breadcrumb ref={barRef} className={`${sticky ? 'sticky top-0 z-30 ' : ''}bg-slate-50 ring-1 ring-slate-200/80 px-3 py-2 ${className}`}>
      {actions ? (
        // flex-wrap + ml-auto rather than justify-between: on a narrow screen
        // the actions drop to their own line and stay right-aligned there,
        // which justify-between would not do for a lone wrapped item.
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0">{list}</div>
          <div className="flex items-center gap-2 shrink-0 ml-auto">{actions}</div>
        </div>
      ) : (
        list
      )}
    </Breadcrumb>
  );
}
