'use client';

import { useRef } from 'react';
import { usePlanFeature } from '@/lib/hooks/usePlanFeature';
import { PlanFeatureKey, PLAN_FEATURE_METADATA, PLAN_LOCKED_MESSAGE } from '@/lib/types/planFeatures';
import FeatureNotAvailablePage from './FeatureNotAvailablePage';
import { Lock, ArrowRight, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface FeatureGateProps {
  feature: PlanFeatureKey;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  mode?: 'page' | 'section' | 'hidden';
}

export default function FeatureGate({
  feature,
  children,
  fallback,
  mode = 'page',
}: FeatureGateProps) {
  const { available, loading } = usePlanFeature(feature);

  // Persist last resolved availability across background refreshes.
  // When quota data reloads (loading briefly flips true), we keep the
  // last-known value so children are NOT unmounted — preventing the
  // ResumeScoringPage remount / re-scoring bug.
  const resolvedRef = useRef<boolean | null>(null);
  if (!loading) {
    resolvedRef.current = available;
  }
  const effectiveAvailable = resolvedRef.current;

  // Only show spinner on the very first load (before availability is ever known)
  if (effectiveAvailable === null) {
    if (mode === 'hidden') return null;
    // A page-mode gate stands in for the whole route, so its spinner belongs
    // in the middle of the page rather than in a 128px box tucked under the
    // header. A section-mode gate is one block inside a page that has already
    // rendered, so it keeps an in-place box.
    return (
      <div className={mode === 'section' ? 'flex items-center justify-center p-12' : 'tf-loader-page'}>
        <Loader2 className="w-8 h-8 text-gray-600 animate-spin" />
      </div>
    );
  }

  // Feature is available, render children
  if (effectiveAvailable) {
    return <>{children}</>;
  }

  // Feature not available — render fallback based on mode
  if (fallback) {
    return <>{fallback}</>;
  }

  if (mode === 'hidden') {
    return null;
  }

  if (mode === 'section') {
    const meta = PLAN_FEATURE_METADATA[feature];
    return (
      <div className="border border-gray-200 rounded-xl p-6 bg-gray-50" title={PLAN_LOCKED_MESSAGE}>
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
            <Lock className="w-5 h-5 text-gray-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-medium text-gray-900 mb-1">
              {meta.name} — Not Available
            </h3>
            <p className="tf-body-muted mb-3">
              Your plan does not include {meta.name}. {meta.description}.
            </p>
            <Link
              href="/subscription/current-plan"
              className="inline-flex items-center gap-1.5 text-sm text-gray-700 hover:text-gray-900 font-medium transition-colors"
            >
              Upgrade Plan
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // mode === 'page' (default)
  return <FeatureNotAvailablePage feature={feature} />;
}
