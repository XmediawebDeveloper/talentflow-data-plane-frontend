'use client';

/**
 * Organization Usage Page
 * Role-based rendering:
 * - Tenant Admin / Recruiter: Full unit pool view
 * - Billing Manager: Billing summary (filtered)
 */

import { useAuth } from '@/lib/hooks/useAuth';
import TenantUnitPool from '@/components/usage/TenantUnitPool';
import { BarChart3 } from 'lucide-react';
import { PageSkeleton } from '@/components/ui/skeleton';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { PageHeader } from '@/components/ui/page-header';
import { useScrollRestoration } from '@/lib/hooks/useListViewPersistence';

export default function UsagePage() {
  const { user, isLoading, isBillingManager } = useAuth();

  // Scroll-only persistence: this page just routes to a role-based child; the
  // list filters/pagination live inside those children (see MyConsumptionHistory).
  const rootRef = useScrollRestoration<HTMLElement>('org-usage', !isLoading);

  if (isLoading) {
    return <PageSkeleton variant="cards" showStats />;
  }

  if (!user) {
    return (
      <div className="tf-loader-page bg-slate-50">
        <p className="text-gray-500">Please log in to view usage data.</p>
      </div>
    );
  }

  const title = isBillingManager ? 'Billing & Usage' : 'Organization Usage';
  const subtitle = isBillingManager
    ? 'Aggregated billing and usage overview for your organization.'
    : "Monitor and manage your organization's unit consumption in real time.";

  return (
    <main ref={rootRef} className="tf-page">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="tf-page-sheet space-y-6">
        <PageBreadcrumb className="mb-0" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Usage' }]} />

        <PageHeader
          className="mb-0"
          icon={<BarChart3 className="h-5 w-5" />}
          title={title}
          description={subtitle}
        />

        {/* Role-Based Content */}
        <TenantUnitPool compact={false} showHistory={true} />
      </div>
      </div>
    </main>
  );
}
