'use client';

import { useAuth } from '@/lib/hooks/useAuth';
import { getLoginUrl } from '@/lib/services/authService';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useEffect, useState, useCallback, Suspense, useRef } from 'react';
import Sidebar from '@/components/shared/Sidebar';
import Header from '@/components/Header';
import SubscriptionInactiveModal from '@/components/SubscriptionInactiveModal';
import { SessionTimeoutProvider } from '@/components/SessionTimeoutProvider';
import { toast } from 'sonner';
import { scoringService } from '@/lib/services/scoringService';
import { QuotaProvider } from '@/contexts/QuotaContext';
import { PlanFeaturesProvider } from '@/components/providers/PlanFeaturesProvider';
import { TermsProvider } from '@/components/providers/TermsProvider';
import { PlanChangeProvider, usePlanChange } from '@/components/providers/PlanChangeProvider';
import { SUBSCRIPTION_INACTIVE_EVENT, SubscriptionInactiveDetail, PAYMENT_PENDING_EVENT, PaymentPendingDetail, redirectToPaymentPage } from '@/lib/services/api';
import SuspendedAccountBlock from '@/components/subscription/SuspendedAccountBlock';
import ExpiredAccountBlock from '@/components/subscription/ExpiredAccountBlock';
import TermsReminderBanner from '@/components/terms/TermsReminderBanner';
import TermsBlockingOverlay from '@/components/terms/TermsBlockingOverlay';
import TermsAcceptanceModal from '@/components/terms/TermsAcceptanceModal';
import PlanChangeReviewBanner from '@/components/plan-change/PlanChangeReviewBanner';
import PlanChangeReviewModal from '@/components/plan-change/PlanChangeReviewModal';
import PlanChangeSuspendedBlock from '@/components/plan-change/PlanChangeSuspendedBlock';

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

  // Mobile menu state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const hasRoutePermission = useCallback((permission: string) => {
    if (isTenantAdmin) return true;
    const permissions = user?.permissions as Record<string, boolean | undefined> | undefined;
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

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      console.log('[DASHBOARD] Not authenticated, redirecting to login');
      const loginUrl = getLoginUrl();
      if (loginUrl.startsWith('http')) {
        window.location.href = loginUrl;
      } else {
        router.push(loginUrl);
      }
    }
  }, [isAuthenticated, isLoading, router]);

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
      <div className="flex h-screen bg-gray-50">
        {/* Sidebar Skeleton - hidden on mobile */}
        <div className="hidden lg:flex w-64 bg-white border-r border-gray-200 flex-col">
          {/* Logo area */}
          <div className="h-16 px-4 flex items-center border-b border-gray-100">
            <div className="h-8 w-32 bg-gray-200 rounded animate-pulse" />
          </div>
          {/* Nav items skeleton */}
          <div className="flex-1 p-4 space-y-2">
            {[75, 85, 65, 90, 70, 80, 95, 72].map((width, i) => (
              <div key={i} className="flex items-center gap-3 p-2">
                <div className="w-5 h-5 bg-gray-200 rounded animate-pulse" />
                <div className="h-4 bg-gray-200 rounded animate-pulse" style={{ width: `${width}%` }} />
              </div>
            ))}
          </div>
        </div>

        {/* Main content area */}
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

  return (
    <QuotaProvider>
      <PlanFeaturesProvider>
        <PlanChangeProvider>
        <TermsProvider>
        <SessionTimeoutProvider skipSettingsLoad={subscriptionExpired !== false}>
          <Suspense fallback={null}>
            <SearchParamsErrorHandler />
          </Suspense>
          <div className="flex h-screen bg-gray-50">
            {/* Mobile Menu Overlay */}
            {isMobileMenuOpen && (
              <div
                className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                onClick={() => setIsMobileMenuOpen(false)}
              />
            )}

            {/* Sidebar - Hidden on mobile, slide-in overlay when open */}
            <div
              className={`
                fixed lg:static inset-y-0 left-0 z-50
                transform transition-transform duration-300 ease-in-out
                ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
              `}
            >
              <Sidebar
                user={user || undefined}
                tenant={tenant || undefined}
                subscriptionExpired={subscriptionExpired}
                accountSuspended={accountSuspended}
                onClose={() => setIsMobileMenuOpen(false)}
              />
            </div>

            <div className="flex-1 flex flex-col overflow-hidden">
              <Header
                user={user}
                tenant={tenant}
                onLogout={logout}
                onOpenSettings={() => router.push('/settings')}
                onMenuClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                isMobileMenuOpen={isMobileMenuOpen}
                subscriptionExpired={subscriptionExpired === true}
              />

              <TermsReminderBanner />
              <PlanChangeReviewBanner />
              <div className="flex-1 overflow-y-auto flex flex-col scrollbar-auto-hide scrollbar-auto-hide-area">
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
        </PlanChangeProvider>
      </PlanFeaturesProvider>
    </QuotaProvider>
  );
}
