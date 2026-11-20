'use client';

import { useAuth } from '@/lib/hooks/useAuth';
import { installStripWheelScroll } from '@/lib/scrollHandoff';
import { getLoginUrl } from '@/lib/services/authService';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useEffect, useState, useCallback, Suspense, useRef } from 'react';
import Header from '@/components/Header';
import { SessionTimeoutProvider } from '@/components/SessionTimeoutProvider';
import { toast } from 'sonner';
import { scoringService } from '@/lib/services/scoringService';
import { resumeService } from '@/lib/services/resumeService';
import { QuotaProvider, useQuota } from '@/contexts/QuotaContext';
import { PlanFeaturesProvider } from '@/components/providers/PlanFeaturesProvider';
import { TermsProvider } from '@/components/providers/TermsProvider';
import { PlanChangeProvider, usePlanChange } from '@/components/providers/PlanChangeProvider';
import { SUBSCRIPTION_INACTIVE_EVENT, SubscriptionInactiveDetail, PAYMENT_PENDING_EVENT, PaymentPendingDetail, redirectToPaymentPage, SESSION_EXPIRED_EVENT, clearTokens } from '@/lib/services/api';
import SuspendedAccountBlock from '@/components/subscription/SuspendedAccountBlock';
import ExpiredAccountBlock from '@/components/subscription/ExpiredAccountBlock';
import TermsBlockingOverlay from '@/components/terms/TermsBlockingOverlay';
import PlanChangeSuspendedBlock from '@/components/plan-change/PlanChangeSuspendedBlock';
import { AdminAssignedPlanProvider } from '@/components/providers/AdminAssignedPlanProvider';
import { InviteDialogProvider } from '@/components/talent-match-invite/InviteDialogProvider';
import RouteGuard from '@/components/RouteGuard';
import { masterDataService } from '@/lib/services';
import { setConfiguredExperienceLevels } from '@/lib/utils/jobExperience';
import { takeBootstrapPart } from '@/lib/services/shellBootstrap';
import { useScoringProgress } from '@/contexts/ScoringProgressContext';
import { useOptionalBulkInviteProgress } from '@/contexts/BulkInviteProgressContext';
import { useExternalBackgroundTasks } from '@/lib/backgroundTasks';
import dynamic from 'next/dynamic';
import { SkipLink } from '@/components/ui/skip-link';

/* Shell pieces that show nothing until their own data says so (banners,
   review/acceptance modals, the floating progress widgets). Loaded as separate
   chunks after the page hydrates instead of inside the layout's first bundle,
   so the header and page paint sooner on a hard refresh. They read state from
   their providers (not one-shot window events), so loading a moment later
   misses nothing. The BLOCKING overlays (suspended / expired / terms block /
   plan-change suspension) stay static on purpose: they must be ready to cover
   the page the instant their condition is known. */
const TermsReminderBanner = dynamic(() => import('@/components/terms/TermsReminderBanner'), { ssr: false });
const TermsAcceptanceModal = dynamic(() => import('@/components/terms/TermsAcceptanceModal'), { ssr: false });
const PlanChangeReviewBanner = dynamic(() => import('@/components/plan-change/PlanChangeReviewBanner'), { ssr: false });
const PlanChangeReviewModal = dynamic(() => import('@/components/plan-change/PlanChangeReviewModal'), { ssr: false });
const AdminAssignedPlanBanner = dynamic(() => import('@/components/admin-assigned-plan/AdminAssignedPlanBanner'), { ssr: false });
const AdminAssignedPlanModal = dynamic(() => import('@/components/admin-assigned-plan/AdminAssignedPlanModal'), { ssr: false });
import { useOptionalActivityFeed } from '@/contexts/ActivityFeedContext';
const GlobalScoringProgressIndicator = dynamic(() => import('@/components/GlobalScoringProgressIndicator'), { ssr: false });
const BulkInviteProgressIndicator = dynamic(() => import('@/components/bulk-invite/BulkInviteProgressIndicator'), { ssr: false });
/* Keeps resume uploads in the Background tasks dock after the screen that
   started them closes (lib/uploadTracker). Renders nothing; idle until an
   upload is handed over. */
const GlobalUploadTracker = dynamic(() => import('@/components/resumes/GlobalUploadTracker'), { ssr: false });

/* The two progress widgets render nothing until a task is tracked (scoring
   run, invite send, minimized AI Talent Match run), yet mounting them fetched
   ~17 chunks / ~245 KB gzipped on every dashboard page load. Mount them the
   first time anything is tracked, then keep them mounted (their toasts and
   "already finished at mount" bookkeeping live inside). */
function BackgroundTaskWidgets() {
  const { activeScoringJobs } = useScoringProgress();
  const invite = useOptionalBulkInviteProgress();
  const externalTasks = useExternalBackgroundTasks();
  /* AI Talent Match runs / upload batches come from the server feed only —
     without this the corner never mounted when they were the only activity
     (and appeared late after a refresh). */
  const feed = useOptionalActivityFeed();
  const feedRows = (feed?.items ?? []).some(a => !a.dismissed && (a.type === 'talent_match' || a.type === 'resume_upload'));
  const needed = activeScoringJobs.length > 0
    || feedRows
    || (invite?.jobs.length ?? 0) > 0
    || !!invite?.openResultsFor
    || externalTasks.length > 0;
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (needed) setMounted(true); }, [needed]);
  // TEMP diagnostics (cross-device icon): why the corner is / is not mounted.
  useEffect(() => {
    console.log('[ActivityDock] mount check', { needed, mounted, scoring: activeScoringJobs.length, invites: invite?.jobs.length ?? 0, feedRows, inPage: externalTasks.length });
  }, [needed, mounted, activeScoringJobs.length, invite?.jobs.length, feedRows, externalTasks.length]);
  if (!mounted && !needed) return null;
  return (
    <>
      {/* Global scoring progress indicator - floating bottom-right widget.
          Scoped to this (dashboard) layout, not the root layout, so it
          never mounts on the (public) candidate-facing pages (assessment/
          AI-interview token links) or the (auth)/(marketing) routes. */}
      <GlobalScoringProgressIndicator />
      {/* Create / Send bulk invitations - the same idea, bottom-LEFT, so a
          scoring run and a send can be followed at the same time. */}
      <BulkInviteProgressIndicator />
    </>
  );
}

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
      // Only when a reconcile ran: a throttled no-op changed nothing, and the
      // quota /bootstrap just delivered is current — refetching it on every
      // hard load was a duplicate /usage/quota-status per page.
      if (await resumeService.reconcileUsage()) await refetch();
    })();
  }, [refetch]);

  return null;
}

/**
 * Loads Configuration > Experience Levels once per login so every experience
 * badge/text across the dashboard (JD detail, JD lists, scoring, version
 * history, ...) resolves a JD's job_level against what Configuration actually
 * has on file instead of only the fixed word list built into jobExperience.ts.
 * Mounted once here (this layout persists across dashboard navigation), the
 * same pattern as ResumeUsageReconciler above. Failing silently is fine - the
 * formatter just keeps using its built-in dictionary for the standard codes.
 */
function ExperienceLevelsBootstrapper() {
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    // First load: the app-shell /bootstrap response, if it carried this part.
    takeBootstrapPart<Awaited<ReturnType<typeof masterDataService.listExperienceLevels>>>('experience_levels')
      .then((boot) => (boot.hit ? boot.data : masterDataService.listExperienceLevels(true)))
      .then((res) => setConfiguredExperienceLevels(res.items))
      .catch(() => {});
  }, []);

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

  // Sideways tab / pill strips (scrollbar hidden): the mouse wheel scrolls them
  // left-right, so a laptop / tablet with a mouse can reach every tab.
  useEffect(() => installStripWheelScroll(), []);

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

  console.log('[DASHBOARD] Layout render - isLoading:', isLoading, 'isAuthenticated:', isAuthenticated);

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
      // Drop any leftover accessToken cookie first. The middleware treats a bare
      // cookie as "logged in" and bounces /login straight back to /dashboard, while
      // this layout renders null — an endless redirect that shows a blank white page
      // (e.g. localStorage cleared but the cookie survived).
      clearTokens();
      const loginUrl = getLoginUrl();
      if (loginUrl.startsWith('http')) {
        window.location.href = loginUrl;
      } else {
        router.push(loginUrl);
      }
    }
  }, [isAuthenticated, isLoading, router, sessionExpiredVisible]);

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
      <div className="flex h-[100dvh] bg-gray-50 dark:bg-slate-950">
        {/* Main content area (no sidebar — dashboard is the nav hub) */}
        <div className="flex-1 flex flex-col">
          {/* Header Skeleton — matches the real <Header> */}
          <div className="h-16 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 px-4 sm:px-6 lg:px-8 flex items-center justify-between">
            <div className="h-10 w-40 sm:w-60 lg:w-80 bg-gray-100 dark:bg-slate-800 rounded-lg animate-pulse" />
            <div className="flex items-center gap-4">
              <div className="h-8 w-8 bg-gray-200 dark:bg-slate-800 rounded-lg animate-pulse" />
              <div className="h-8 w-8 bg-gray-200 dark:bg-slate-800 rounded-lg animate-pulse hidden sm:block" />
              <div className="h-8 w-24 bg-gray-200 dark:bg-slate-800 rounded-lg animate-pulse hidden sm:block" />
              <div className="h-9 w-9 bg-gray-300 dark:bg-slate-700 rounded-full animate-pulse" />
            </div>
          </div>

          {/* Body: intentionally EMPTY during the auth gate — NO content skeleton.
              This skeleton is server-rendered (isLoading starts true on the server),
              so on a hard refresh it necessarily paints BEFORE the page hydrates and
              shows its own skeleton. If we drew any body skeleton here it would read
              as a first, different skeleton that then swaps for the page's — the
              "two skeletons on refresh" bug. By rendering only the header chrome over
              an empty body, the page's own skeleton is the single content skeleton
              the user ever sees; an empty body for the brief auth window is not a
              skeleton, so there is nothing to double. */}
          <div className="flex-1 overflow-y-auto" />
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
      <ExperienceLevelsBootstrapper />
      <PlanFeaturesProvider>
        <PlanChangeProvider>
        <AdminAssignedPlanProvider>
        <TermsProvider>
        <SessionTimeoutProvider skipSettingsLoad={subscriptionExpired !== false}>
          <Suspense fallback={null}>
            <SearchParamsErrorHandler />
          </Suspense>
          <div className="flex h-[100dvh] bg-gray-50">
            {/* First thing Tab reaches: jump past the header and banners
                (a11y §14). Hidden until focused; out of the flex flow. */}
            <SkipLink />
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
              {/* tf-page-scroll: the page's real scroller (not <body>), so
                  globals.css locks it while a modal overlay is open. */}
              <div id="main-content" tabIndex={-1} className="tf-page-scroll flex-1 overflow-y-auto flex flex-col">
                <RouteGuard><InviteDialogProvider>{children}</InviteDialogProvider></RouteGuard>
              </div>
            </div>

            {/* SubscriptionInactiveModal is mounted once in app/layout.tsx; a second
                copy here opened two stacked modals on every dashboard page. */}

            {/* T&C blocking overlay - z-[95], below suspension z-[100] */}
            <TermsBlockingOverlay accountSuspended={accountSuspended} />

            {/* T&C acceptance modal - z-[90] */}
            <TermsAcceptanceModal />

            {/* Plan change review modal - z-[88] */}
            <PlanChangeReviewModal />

            {/* Admin-assigned plan payment modal - z-[88] */}
            <AdminAssignedPlanModal />

            <BackgroundTaskWidgets />
            <GlobalUploadTracker />

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
