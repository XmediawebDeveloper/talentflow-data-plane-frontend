'use client';

import {
  Users,
  Upload,
  ClipboardList,
  BarChart3,
  Video,
  Key,
  Shield,
  Headphones,
  Sparkles,
  UserCog,
  Lock,
  ArrowRight,
} from 'lucide-react';
import type { IconComponent } from '@/lib/types/icon';
import Link from 'next/link';
import { PlanFeatureKey, PLAN_FEATURE_METADATA } from '@/lib/types/planFeatures';

const ICON_MAP: Record<string, IconComponent> = {
  Users,
  Upload,
  ClipboardList,
  BarChart3,
  Video,
  Key,
  Shield,
  Headphones,
  Sparkles,
  UserCog,
};

interface FeatureNotAvailablePageProps {
  feature: PlanFeatureKey;
}

export default function FeatureNotAvailablePage({ feature }: FeatureNotAvailablePageProps) {
  const meta = PLAN_FEATURE_METADATA[feature];
  const Icon = ICON_MAP[meta.icon] || Lock;

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-6">
          <Icon className="w-8 h-8 text-gray-400" />
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium mb-4">
          <Lock className="w-3 h-3" />
          Feature Not Available
        </div>

        <h1 className="text-2xl font-semibold text-gray-900 mb-3">
          {meta.name}
        </h1>

        <p className="text-gray-600 mb-2">
          Your subscribed plan does not include <strong>{meta.name}</strong>.
        </p>
        <p className="tf-body-muted mb-8">
          {meta.description}. Upgrade your plan to unlock this feature.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/subscription/current-plan"
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-gray-800 text-white rounded-xl hover:bg-gray-900 transition-colors shadow-sm"
          >
            Upgrade Plan
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
