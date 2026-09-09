'use client';

/**
 * Organization Usage Page
 * Role-based rendering:
 * - Tenant Admin / Recruiter: Full unit pool view
 * - Billing Manager: Billing summary (filtered)
 * - Standard User: Own consumption only
 */

import { useAuth } from '@/lib/hooks/useAuth';
import TenantUnitPool from '@/components/usage/TenantUnitPool';
import MyConsumptionHistory from '@/components/usage/MyConsumptionHistory';
import { BarChart3, Sparkles } from 'lucide-react';
import { PageSkeleton } from '@/components/ui/skeleton';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { useScrollRestoration } from '@/lib/hooks/useListViewPersistence';

export default function UsagePage() {
  const { user, isLoading, isBillingManager, isStandardUser } = useAuth();

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

  const title = isStandardUser ? 'My Usage' : isBillingManager ? 'Billing & Usage' : 'Organization Usage';
  const subtitle = isStandardUser
    ? 'View your personal consumption history across all features.'
    : isBillingManager
      ? 'Aggregated billing and usage overview for your organization.'
      : "Monitor and manage your organization's unit consumption in real time.";

  return (
    <main ref={rootRef} className="flex-1 overflow-x-hidden bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px] px-4 md:px-8">
      <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl space-y-6">
        <PageBreadcrumb className="mb-0" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Usage' }]} />

        {/* SaaS Hero Header */}
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-blue via-brand-blue-2 to-brand-teal p-5 text-white shadow-xl shadow-brand-blue/20 ring-1 ring-white/10 sm:p-6 lg:p-7">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-cyan/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-brand-orange/15 blur-3xl" />
          <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
          <div className="relative flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/12 ring-1 ring-white/15 backdrop-blur-sm">
              <BarChart3 className="h-6 w-6 text-white" />
            </div>
            <div>
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-white/90 ring-1 ring-white/15 backdrop-blur-sm">
                <Sparkles className="h-3 w-3 text-brand-orange" />
                Consumption tracking
              </div>
              <h1 className="text-lg sm:text-xl font-semibold tracking-tight">{title}</h1>
              <p className="mt-2 max-w-2xl text-sm text-white/80 sm:text-base">{subtitle}</p>
            </div>
          </div>
        </section>

        {/* Role-Based Content */}
        {isStandardUser ? (
          <MyConsumptionHistory />
        ) : (
          <TenantUnitPool compact={false} showHistory={true} />
        )}
      </div>
      </div>
    </main>
  );
}
