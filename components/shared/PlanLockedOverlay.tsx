'use client';

import type { ReactNode } from 'react';
import { PLAN_LOCKED_MESSAGE } from '@/lib/types/planFeatures';

/**
 * Keeps plan-gated UI VISIBLE when the plan lacks the feature: `locked`
 * greys the children out, swallows clicks, and shows PLAN_LOCKED_MESSAGE on
 * hover. Unlocked, it renders the children untouched. Use instead of
 * `hasPlanFeature(x) && <...>` so nothing appears and then vanishes once
 * plan features load.
 */
export default function PlanLockedOverlay({
  locked,
  children,
  className = '',
}: {
  locked: boolean;
  children: ReactNode;
  className?: string;
}) {
  if (!locked) return <>{children}</>;
  return (
    <div aria-disabled="true" title={PLAN_LOCKED_MESSAGE} className={`cursor-not-allowed opacity-50 grayscale ${className}`}>
      <div className="pointer-events-none select-none h-full" inert>
        {children}
      </div>
    </div>
  );
}
