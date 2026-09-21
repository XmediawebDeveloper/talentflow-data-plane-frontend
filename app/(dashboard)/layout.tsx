'use client';

import { useAuth } from '@/lib/hooks/useAuth';
import { getLoginUrl } from '@/lib/services/authService';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useEffect, useState, useCallback, Suspense, useRef } from 'react';
import Header from '@/components/Header';
import SubscriptionInactiveModal from '@/components/SubscriptionInactiveModal';
import { SessionTimeoutProvider } from '@/components/SessionTimeoutProvider';
import { toast } from 'sonner';
import { scoringService } from '@/lib/services/scoringService';
import { resumeService } from '@/lib/services/resumeService';
import { QuotaProvider, useQuota } from '@/contexts/QuotaContext';
import { PlanFeaturesProvider } from '@/components/providers/PlanFeaturesProvider';
import { TermsProvider } from '@/components/providers/TermsProvider';
import { PlanChangeProvider, usePlanChange } from '@/components/providers/PlanChangeProvider';
import { SUBSCRIPTION_INACTIVE_EVENT, SubscriptionInactiveDetail, PAYMENT_PENDING_EVENT, PaymentPendingDetail, redirectToPaymentPage, SESSION_EXPIRED_EVENT } from '@/lib/services/api';
import SuspendedAccountBlock from '@/components/subscription/SuspendedAccountBlock';
import ExpiredAccountBlock from '@/components/subscription/ExpiredAccountBlock';
import TermsReminderBanner from '@/components/terms/TermsReminderBanner';
import TermsBlockingOverlay from '@/components/terms/TermsBlockingOverlay';
import TermsAcceptanceModal from '@/components/terms/TermsAcceptanceModal';
import PlanChangeReviewBanner from '@/components/plan-change/PlanChangeReviewBanner';
import PlanChangeReviewModal from '@/components/plan-change/PlanChangeReviewModal';
import PlanChangeSuspendedBlock from '@/components/plan-change/PlanChangeSuspendedBlock';
import { AdminAssignedPlanProvider } from '@/components/providers/AdminAssignedPlanProvider';
import AdminAssignedPlanBanner from '@/components/admin-assigned-plan/AdminAssignedPlanBanner';
import AdminAssignedPlanModal from '@/components/admin-assigned-plan/AdminAssignedPlanModal';
import GlobalScoringProgressIndicator from '@/components/GlobalScoringProgressIndicator';

// Admin-only routes that require tenant_admin role
const adminRoutes = [
  '/organization',
  '/subscription',
  '/settings',
  '/analytics/team-usage',
  '/analytics/activity-logs',
];

const routePermissionRules: Array<{
  prefix: string;
  permissions?: string[];
  allowAll?: boolean;
}> = [
  { prefix: '/recruitment/hr-question-bank', permissions: ['canViewHRQuestionBank', 'canCreateHRQuestionBank', 'canUpdateHRQuestionBank', 'canDeleteHRQuestionBank'] },
  { prefix: '/organization/team-chat', allowAll: true },
  { prefix: '/organization/team-management', permissions: ['canViewTeams', 'canCreateTeams'] },
  { prefix: '/organization/user-management', permissions: ['canManageUsers'] },
  { prefix: '/organization/company-profile', permissions: ['canManageSettings'] },
  { prefix: '/subscription/current-plan', permissions: ['canViewCurrentPlan'] },
  { prefix: '/subscription/usage-quotas', permissions: ['canViewUsage'] },
  { prefix: '/subscription/payment-methods', permissions: ['canViewPaymentMethods'] },
  { prefix: '/subscription/billing-history', permissions: ['canViewBillingHistory'] },
  { prefix: '/subscription/refund-history', permissions: ['canViewRefundHistory'] },
  { prefix: '/subscription/dispute-history', permissions: ['canViewDisputeHistory'] },
  { prefix: '/subscription/unit-disputes', permissions: ['canViewUsage'] },
  { prefix: '/settings/general-settings', allowAll: true },
  { prefix: '/settings/permissions', permissions: ['canViewRoles'] },
  { prefix: '/settings/api-management', permissions: ['canViewApiManagement'] },
  { prefix: '/settings/branding', permissions: ['canViewBranding'] },
  { prefix: '/settings/security', permissions: ['canViewSecuritySettings'] },
  { prefix: '/settings/legal', permissions: ['canManageSettings'] },
  { prefix: '/support-tickets', permissions: ['canViewSupport'] },
];

// Paths allowed when subscription is expired/inactive
const SUBSCRIPTION_ALLOWED_PATHS = [
  '/subscription/current-plan',
  '/subscription/payment-methods',
  '/subscription/usage-quotas',
  '/audits/trail',
  '/audits/activity',
  '/support-tickets',
  '/settings/general-settings',
];

// Storage key for scoring batch persistence
const SCORING_BATCH_STORAGE_KEY = 'talentflow_scoring_batch';

interface StoredScoringBatch {
  jobId: string;
  jobTitle: string;
  startTime: number;
  resumeIds: string[];
  status: 'in_progress' | 'completed';
}

function SearchParamsErrorHandler() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const error = searchParams.get('error');
    if (error === 'unauthorized') {
      toast.error('Access Denied: You do not have permission to access that page.');
      const url = new URL(window.location.href);
      url.searchParams.delete('error');
      window.history.replaceState({}, '', url.toString());
    }
  }, [searchParams]);

  return null;
}

/**
 * Resume Storage (RU) usage can drift from the tenant's actual active resume
 * count (refund-path bugs, absorbed reservations, etc. — see usage_tracking's
 * `reconcile_resume_usage`). Until now the only thing that corrected it was
 * visiting My Resumes or Resume Database, which call `reconcileUsage()` on
 * their own mount — so a tenant who logged in and looked at the header's
 * plan/units widget without ever opening one of those two pages kept seeing
 * the stale, drifted number. Mounted once per login (this layout persists
 * across dashboard navigation), so the correction — and the refetch that
 * surfaces it in the widget — happens right away regardless of which page the
 * tenant lands on.
 */
function ResumeUsageReconciler() {
  const { refetch } = useQuota();
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    (async () => {
      await resumeService.reconcileUsage();
      await refetch();
    })();
  }, [refetch]);

  return null;
}

function PlanChangeSuspendedOverlay() {
  const { isSuspendedDueToPlanChange } = usePlanChange();
  if (!isSuspendedDueToPlanChange) return null;
  return (
    <div className="fixed inset-0 z-[98]">
      <PlanChangeSuspendedBlock />
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, tenant, isAuthenticated, isLoading, logout, isTenantAdmin } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Synchronous guard: read pending_password_reset once on mount (lazy initializer runs
  // before first paint). If set, block all dashboard rendering — AuthProvider handles redirect.
  const [hasPendingPasswordReset] = useState<boolean>(() =>
    typeof window !== 'undefined' && localStorage.getItem('pending_password_reset') === 'true'
  );

  // Initialize as undefined to show locked state until we know for sure
  const [subscriptionExpired, setSubscriptionExpired] = useState<boolean | undefined>(undefined);
  const [accountSuspended, setAccountSuspended] = useState<boolean>(false);
  const [suspensionReason, setSuspensionReason] = useState<string | undefined>(undefined);
  const [suspendedAt, setSuspendedAt] = useState<string | undefined>(undefined);
  const [supportEmail, setSupportEmail] = useState<string>('support@talentflow.com');

  // Mobile menu state — retained because Header still reads the prop, but no longer toggled.
  const [isMobileMenuOpen] = useState(false);

  // Track whether the session-expired modal is showing.
  // While true, the dashboard's "redirect to login if not authenticated" effect
  // is suppressed — the user must click OK on the modal to log out.
  const [sessionExpiredVisible, setSessionExpiredVisible] = useState(false);

  /* The shell owns scrolling. It is `h-[100dvh]` with its own scroller
     inside, so the DOCUMENT must never scroll while a dashboard route is up —
     when it did, the page grew a second scrollbar at the window edge and a
     blank run below the shell equal to whatever body-level element had
     poked past the viewport. Marked on <html> so the rule is scoped to these
     routes; the marketing and candidate-facing layouts keep normal document
     scrolling. Removed on unmount for the same reason. */
  useEffect(() => {
    document.documentElement.classList.add('tf-app-shell');
    return () => document.documentElement.classList.remove('tf-app-shell');
  }, []);

  useEffect(() => {
    const handleSessionExpired = () => setSessionExpiredVisible(true);
    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, []);

  const hasRoutePermission = useCallback((permission: string) => {
    if (isTenantAdmin) return true;
    // Permission is a structured camelCase object — cast through `unknown` to a
    // generic record because we look up keys by runtime string.
    const permissions = user?.permissions as unknown as Record<string, boolean | undefined> | undefined;
    return !!permissions?.[permission];
  }, [isTenantAdmin, user]);

  console.log('[DASHBOARD] Layout render - isLoading:', isLoading, 'isAuthenticated:', isAuthenticated, 'user:', user?.email);

  // Initialize subscription status immediately based on tenant data
  useEffect(() => {
    if (isLoading) return;

    // Check tenant subscription status
    if (tenant?.subscription) {
      const status = tenant.subscription.status?.toLowerCase();
      const isExpired = status === 'expired' || status === 'inactive';
      const isSuspended = status === 'suspended';
      console.log('[DASHBOARD] Tenant subscription status:', status, 'isExpired:', isExpired, 'isSuspended:', isSuspended);

      if (status === 'plan_change_pending') {
        // Let PlanChangeProvider handle this — don't block the app
        console.log('[DASHBOARD] Plan change pending - PlanChangeProvider will handle');
        setAccountSuspended(false);
        setSubscriptionExpired(false);
      } else if (isSuspended) {
        // CRITICAL: Suspend accounts immediately - blocks all access except sign out
        console.log('[DASHBOARD] Account SUSPENDED - blocking all access');
        setAccountSuspended(true);
        setSubscriptionExpired(false);
        // Capture suspension details from user data (set at login from admin API)
        if (user?.suspensionReason) setSuspensionReason(user.suspensionReason);
        if (user?.suspendedAt) setSuspendedAt(user.suspendedAt);
      } else if (isExpired) {
        // Immediately lock if tenant data says expired
        console.log('[DASHBOARD] Locking menus - subscription expired');
        setSubscriptionExpired(true);
        setAccountSuspended(false);
      } else if (status === 'active' || status === 'trial') {
        // Immediately unlock if tenant says active/trial
        console.log('[DASHBOARD] Unlocking menus - subscription active');
        setSubscriptionExpired(false);
        setAccountSuspended(false);
      }
    }
  }, [isLoading, tenant, user]);

  // Listen for subscription-inactive events from API interceptor
  // If API reports suspended or expired, update state accordingly
  useEffect(() => {
    const handleSubscriptionInactive = (event: CustomEvent<SubscriptionInactiveDetail>) => {
      const detail = event.detail;
      console.log('[DASHBOARD] API reported subscription inactive - status:', detail?.status);

      if (detail?.status === 'SUSPENDED') {
        // API confirmed account is suspended - block everything
        setAccountSuspended(true);
        setSubscriptionExpired(false);
        if (detail.reason) setSuspensionReason(detail.reason);
        if (detail.suspended_at) setSuspendedAt(detail.suspended_at);
        if (detail.support_email) setSupportEmail(detail.support_email);
      } else {
        // Expired or other inactive status
        setSubscriptionExpired(true);
      }
    };

    window.addEventListener(
      SUBSCRIPTION_INACTIVE_EVENT,
      handleSubscriptionInactive as EventListener
    );

    return () => {
      window.removeEventListener(
        SUBSCRIPTION_INACTIVE_EVENT,
        handleSubscriptionInactive as EventListener
      );
    };
  }, []);

  // Listen for payment-pending events from API interceptor and redirect to complete-payment
  // Uses shared redirectToPaymentPage() which has a module-level guard — so even if multiple
  // concurrent 402 errors dispatch multiple events, only ONE hard redirect ever fires
  useEffect(() => {
    const handlePaymentPending = (event: CustomEvent<PaymentPendingDetail>) => {
      console.log('[DASHBOARD] Payment pending detected, redirecting to complete-payment');
      redirectToPaymentPage(event.detail.tenant_id, event.detail.plan_id);
    };

    window.addEventListener(PAYMENT_PENDING_EVENT, handlePaymentPending as EventListener);
    return () => window.removeEventListener(PAYMENT_PENDING_EVENT, handlePaymentPending as EventListener);
  }, []);

  // Redirect to current-plan when subscription is expired for users who can access it.
  useEffect(() => {
    const canAccessCurrentPlan = hasRoutePermission('canViewCurrentPlan');
    if (subscriptionExpired === true && !accountSuspended && canAccessCurrentPlan && pathname) {
      const isAllowed = SUBSCRIPTION_ALLOWED_PATHS.some(path =>
        pathname === path || pathname.startsWith(path + '/')
      );
      if (!isAllowed) {
        console.log('[DASHBOARD] Subscription expired, redirecting to current-plan from:', pathname);
        router.push('/subscription/current-plan');
      }
    }
  }, [subscriptionExpired, accountSuspended, hasRoutePermission, pathname, router]);

  // Redirect to login if not authenticated.
  // Skipped while the session-expired modal is showing — the modal will
  // perform the actual logout/redirect when the user clicks OK.
  useEffect(() => {
    if (sessionExpiredVisible) return;
    if (!isLoading && !isAuthenticated) {
      console.log('[DASHBOARD] Not authenticated, redirecting to login');
      const loginUrl = getLoginUrl();
      if (loginUrl.startsWith('http')) {
        window.location.href = loginUrl;
      } else {
        router.push(loginUrl);
      }
    }
  }, [isAuthenticated, isLoading, router, sessionExpiredVisible]);

  // Client-side authorization check for admin routes
  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      const matchingRule = routePermissionRules.find(rule =>
        pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`)
      );

      if (matchingRule) {
        if (matchingRule.allowAll) return;

        if ((matchingRule.permissions || []).some(hasRoutePermission)) {
          return;
        }
      }

      const isAdminRoute = adminRoutes.some(route =>
        pathname === route || pathname.startsWith(`${route}/`)
      );

      if (isAdminRoute && !isTenantAdmin) {
        console.log('[DASHBOARD] Unauthorized access to admin route:', pathname);
        toast.error('Access Denied: Only Tenant Admins can access this page.');
        router.push('/dashboard');
      }
    }
  }, [hasRoutePermission, isLoading, isAuthenticated, user, pathname, isTenantAdmin, router]);

  // Check for pending scoring batches on login and show notification
  useEffect(() => {
    if (!isAuthenticated || isLoading) return;

    const checkPendingScoringBatch = async () => {
      try {
        const storedBatch = localStorage.getItem(SCORING_BATCH_STORAGE_KEY);
        if (!storedBatch) return;

        const batch: StoredScoringBatch = JSON.parse(storedBatch);
        console.log('[DASHBOARD] Found pending scoring batch:', batch);

        // Check if this batch was interrupted (started before current session)
        const batchAge = Date.now() - batch.startTime;
        const maxBatchAge = 24 * 60 * 60 * 1000; // 24 hours

        if (batchAge > maxBatchAge) {
          // Batch is too old, clear it
          console.log('[DASHBOARD] Scoring batch too old, clearing...');
          localStorage.removeItem(SCORING_BATCH_STORAGE_KEY);
          return;
        }

        if (batch.status === 'in_progress') {
          // Show notification about pending scoring
          toast.success(
            `Resume scoring for "${batch.jobTitle}" is ready to continue.`,
            {
              duration: 8000,
              action: {
                label: 'Continue',
                onClick: () => router.push(`/recruitment/resume-scoring?jd_id=${batch.jobId}`),
              },
            }
          );

          // Clear the batch from localStorage
          localStorage.removeItem(SCORING_BATCH_STORAGE_KEY);
        }
      } catch (e) {
        console.error('[DASHBOARD] Error checking scoring batch:', e);
      }
    };

    // Delay the check slightly to avoid toast during initial render
    const timer = setTimeout(checkPendingScoringBatch, 1500);
    return () => clearTimeout(timer);
  }, [isAuthenticated, isLoading, router]);

  // If the pending_password_reset flag was set on mount, don't render any dashboard content.
  // AuthProvider keeps isLoading=true and handles the /set-password redirect, so the user
  // sees the loading skeleton instead of a flash of authenticated dashboard UI.
  if (hasPendingPasswordReset) {
    return null;
  }

  if (isLoading) {
    console.log('[DASHBOARD] Still loading...');
    // FIX-002: Skeleton loader instead of spinner
    return (
      <div className="flex h-[100dvh] bg-gray-50">
        {/* Main content area (no sidebar) */}
        <div className="flex-1 flex flex-col">
          {/* Header Skeleton */}
          <div className="h-16 bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 flex items-center justify-between">
            <div className="h-10 w-40 sm:w-60 lg:w-80 bg-gray-100 rounded-lg animate-pulse" />
            <div className="flex items-center gap-4">
              <div className="h-8 w-8 bg-gray-200 rounded-lg animate-pulse" />
              <div className="h-8 w-8 bg-gray-200 rounded-lg animate-pulse hidden sm:block" />
              <div className="h-8 w-24 bg-gray-200 rounded-lg animate-pulse hidden sm:block" />
              <div className="h-9 w-9 bg-gray-300 rounded-full animate-pulse" />
            </div>
          </div>

          {/* Content Skeleton */}
          <div className="flex-1 p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
            {/* Page title */}
            <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />

            {/* Stats cards skeleton */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 p-6">
                  <div className="h-4 w-20 bg-gray-200 rounded animate-pulse mb-3" />
                  <div className="h-8 w-16 bg-gray-200 rounded animate-pulse" />
                </div>
              ))}
            </div>

            {/* Table skeleton */}
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="p-4 border-b border-gray-100">
                <div className="h-6 w-32 bg-gray-200 rounded animate-pulse" />
              </div>
              <div className="divide-y divide-gray-100">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="p-4 flex items-center gap-4">
                    <div className="h-4 w-4 bg-gray-200 rounded animate-pulse" />
                    <div className="h-4 bg-gray-200 rounded animate-pulse flex-1" />
                    <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
                    <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

      </div>
    );
  }

  if (!isAuthenticated) {
    console.log('[DASHBOARD] Not authenticated, returning null');
    return null;
  }

  console.log('[DASHBOARD] Authenticated, rendering dashboard');

  // No sidebar anywhere — /dashboard is the navigation hub (in-page Quick Access).
  // Per-page breadcrumbs (PageBreadcrumb) orient users on every other route.

  return (
    <QuotaProvider>
      <ResumeUsageReconciler />
      <PlanFeaturesProvider>
        <PlanChangeProvider>
        <AdminAssignedPlanProvider>
        <TermsProvider>
        <SessionTimeoutProvider skipSettingsLoad={subscriptionExpired !== false}>
          <Suspense fallback={null}>
            <SearchParamsErrorHandler />
          </Suspense>
          <div className="flex h-[100dvh] bg-gray-50">
            <div className="flex-1 flex flex-col overflow-hidden">
              <Header
                user={user}
                tenant={tenant}
                onLogout={logout}
                onOpenSettings={() => router.push('/settings')}
                onMenuClick={undefined}
                isMobileMenuOpen={isMobileMenuOpen}
                subscriptionExpired={subscriptionExpired === true}
              />

              <TermsReminderBanner />
              <PlanChangeReviewBanner />
              <AdminAssignedPlanBanner />
              <div className="flex-1 overflow-y-auto flex flex-col">
                {children}
              </div>
            </div>

            {/* Global subscription inactive modal - shown on all dashboard pages (not for suspended) */}
            <SubscriptionInactiveModal />

            {/* T&C blocking overlay - z-[95], below suspension z-[100] */}
            <TermsBlockingOverlay accountSuspended={accountSuspended} />

            {/* T&C acceptance modal - z-[90] */}
            <TermsAcceptanceModal />

            {/* Plan change review modal - z-[88] */}
            <PlanChangeReviewModal />

            {/* Admin-assigned plan payment modal - z-[88] */}
            <AdminAssignedPlanModal />

            {/* Global scoring progress indicator - floating bottom-right widget.
                Scoped to this (dashboard) layout, not the root layout, so it
                never mounts on the (public) candidate-facing pages (assessment/
                AI-interview token links) or the (auth)/(marketing) routes. */}
            <GlobalScoringProgressIndicator />

            {/* Plan change suspended overlay - z-[98], above terms z-[95], below generic suspension z-[100] */}
            <PlanChangeSuspendedOverlay />

            {/* CRITICAL: Full-screen suspension overlay - blocks ALL interaction */}
            {accountSuspended && (
              <div className="fixed inset-0 z-[100]">
                <SuspendedAccountBlock
                  suspensionReason={suspensionReason}
                  suspendedAt={suspendedAt}
                  contactEmail={supportEmail}
                />
              </div>
            )}

            {/* Non-admin expired overlay - blocks all interaction, logout only */}
            {subscriptionExpired === true && !accountSuspended && !isTenantAdmin && (
              <div className="fixed inset-0 z-[100]">
                <ExpiredAccountBlock adminEmail={user?.tenantAdminEmail} />
              </div>
            )}
          </div>
        </SessionTimeoutProvider>
        </TermsProvider>
        </AdminAssignedPlanProvider>
        </PlanChangeProvider>
      </PlanFeaturesProvider>
    </QuotaProvider>
  );
}
