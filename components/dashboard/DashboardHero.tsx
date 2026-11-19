'use client';

import Link from 'next/link';
import { ArrowUpRight, Calendar, Plus } from 'lucide-react';
import { useAuth } from '@/lib/hooks/useAuth';
import { usePlanLock } from '@/lib/hooks/usePlanFeature';
import { PLAN_LOCKED_MESSAGE } from '@/lib/types/planFeatures';

const ROLE_LABELS: Record<string, string> = {
  tenant_admin: 'Owner',
  recruiter: 'Recruiter',
  billing_manager: 'Billing Manager',
  viewer: 'Viewer',
};

function timeOfDayGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Hero banner for the redesigned dashboard. Premium look — generous spacing,
 * decorative glows, one primary + one ghost CTA, and a meta row beneath the
 * title with role / workspace info. Permission-gated CTAs.
 */
export default function DashboardHero() {
  const { user, tenant, isTenantAdmin, hasPermission } = useAuth();
  const firstName = (user?.name || user?.email || '').split(/[\s@]/)[0] || 'there';
  const role = ROLE_LABELS[user?.role || ''] || '';
  const canCreateJob = isTenantAdmin || hasPermission('canCreateJD');
  const canRunMatch = isTenantAdmin || hasPermission('canRunAiMatch');
  // Plan lacks AI Talent Match → the button stays, disabled with the plan hover.
  const { isPlanLocked } = usePlanLock();
  const matchPlanLocked = isPlanLocked('ai_talent_match');

  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  return (
    <section className="relative mb-4 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-blue via-brand-blue-2 to-brand-teal px-6 py-6 text-white shadow-xl shadow-brand-blue/20 ring-1 ring-white/10 sm:px-8 sm:py-7 lg:px-10 lg:py-8">
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-brand-cyan/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-brand-orange/15 blur-3xl" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
          backgroundSize: '24px 24px',
        }}
      />

      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <div className="tf-badge mb-3 gap-1.5 bg-white/10 text-2xs tracking-wide text-white/90 ring-1 ring-white/15 backdrop-blur-sm">
            <Calendar className="h-3 w-3 text-brand-cyan" />
            {dateLabel}
          </div>
          <h1 className="tf-page-title">
            {timeOfDayGreeting()}, {firstName}
            <span aria-hidden className="ml-2 inline-block">👋</span>
          </h1>
          <p className="mt-2 max-w-xl text-sm text-white/75">
            Here&apos;s a focused view of your workspace. Pick up where you left off, or kick something new off below.
          </p>

          {(role || tenant?.name) && (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-white/70">
              {role && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 ring-1 ring-white/10">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-cyan" />
                  {role}
                </span>
              )}
              {tenant?.name && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 ring-1 ring-white/10">
                  <span className="h-1.5 w-1.5 rounded-full bg-white/60" />
                  {tenant.name}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {matchPlanLocked ? (
            <span
              aria-disabled="true"
              title={PLAN_LOCKED_MESSAGE}
              className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-white/5 px-4 py-2.5 text-sm font-medium text-white/50 ring-1 ring-white/10"
            >
              AI Talent Match
              <ArrowUpRight className="h-4 w-4" />
            </span>
          ) : !canRunMatch ? (
            <span
              aria-disabled="true"
              title="You do not have permission to run AI Talent Match"
              className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-white/5 px-4 py-2.5 text-sm font-medium text-white/50 opacity-60 ring-1 ring-white/10"
            >
              AI Talent Match
              <ArrowUpRight className="h-4 w-4" />
            </span>
          ) : (
            <Link
              href="/recruitment/ai-talent-match"
              // Quick Access already prefetches this page.
              prefetch={false}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-medium text-white ring-1 ring-white/15 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-white/15"
            >
              AI Talent Match
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          )}
          {canCreateJob ? (
            <Link
              href="/recruitment/jd-creation"
              // Quick Access already prefetches this page.
              prefetch={false}
              className="group inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-brand-blue shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              <Plus className="h-4 w-4 transition-transform group-hover:rotate-90" />
              Create Job
            </Link>
          ) : (
            <span
              aria-disabled="true"
              title="You do not have permission to create job descriptions"
              className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-white/40 px-4 py-2.5 text-sm font-semibold text-brand-blue/60 opacity-60 shadow-md"
            >
              <Plus className="h-4 w-4" />
              Create Job
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
