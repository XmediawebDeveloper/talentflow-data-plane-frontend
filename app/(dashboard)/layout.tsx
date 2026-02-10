'use client';

import { useAuth } from '@/lib/hooks/useAuth';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useEffect, useState, useCallback, Suspense } from 'react';
import Sidebar from '@/components/shared/Sidebar';
import Header from '@/components/Header';
import SubscriptionInactiveModal from '@/components/SubscriptionInactiveModal';
import { SessionTimeoutProvider } from '@/components/SessionTimeoutProvider';
import { toast } from 'sonner';
import { scoringService } from '@/lib/services/scoringService';
import { QuotaProvider } from '@/contexts/QuotaContext';
import { SUBSCRIPTION_INACTIVE_EVENT, SubscriptionInactiveDetail } from '@/lib/services/api';

// Admin-only routes that require tenant_admin role
const adminRoutes = [
  '/organization',
  '/subscription',
  '/settings',
  '/analytics/team-usage',
  '/analytics/activity-logs',
];

// Paths allowed when subscription is expired/inactive
const SUBSCRIPTION_ALLOWED_PATHS = [
  '/subscription/current-plan',
  '/subscription/payment-methods',
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

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, tenant, isAuthenticated, isLoading, logout, isTenantAdmin } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [subscriptionExpired, setSubscriptionExpired] = useState(false);

  console.log('[DASHBOARD] Layout render - isLoading:', isLoading, 'isAuthenticated:', isAuthenticated, 'user:', user?.email);

  // Listen for subscription-inactive events from API interceptor
  useEffect(() => {
    const handleSubscriptionInactive = (event: CustomEvent<SubscriptionInactiveDetail>) => {
      console.log('[DASHBOARD] Subscription inactive detected:', event.detail?.status);
      setSubscriptionExpired(true);
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

  // Redirect to current-plan page when subscription is expired and user is on a non-allowed page
  useEffect(() => {
    if (subscriptionExpired && pathname) {
      const isAllowed = SUBSCRIPTION_ALLOWED_PATHS.some(path =>
        pathname === path || pathname.startsWith(path + '/')
      );
      if (!isAllowed) {
        console.log('[DASHBOARD] Subscription expired, redirecting to current-plan from:', pathname);
        router.push('/subscription/current-plan');
      }
    }
  }, [subscriptionExpired, pathname, router]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      console.log('[DASHBOARD] Not authenticated, redirecting to login');
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  // Client-side authorization check for admin routes
  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      // Exception: Team Chat is accessible to all users, even though it's under /organization
      if (pathname === '/organization/team-chat' || pathname.startsWith('/organization/team-chat/')) {
        return; // Allow access to all users
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
  }, [isLoading, isAuthenticated, user, pathname, isTenantAdmin, router]);

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

  if (isLoading) {
    console.log('[DASHBOARD] Still loading...');
    // FIX-002: Skeleton loader instead of spinner
    return (
      <div className="flex h-screen bg-gray-50">
        {/* Sidebar Skeleton */}
        <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
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
          <div className="h-16 bg-white border-b border-gray-200 px-8 flex items-center justify-between">
            <div className="h-10 w-80 bg-gray-100 rounded-lg animate-pulse" />
            <div className="flex items-center gap-4">
              <div className="h-8 w-8 bg-gray-200 rounded-lg animate-pulse" />
              <div className="h-8 w-8 bg-gray-200 rounded-lg animate-pulse" />
              <div className="h-8 w-24 bg-gray-200 rounded-lg animate-pulse" />
              <div className="h-9 w-9 bg-gray-300 rounded-full animate-pulse" />
            </div>
          </div>

          {/* Content Skeleton */}
          <div className="flex-1 p-8 space-y-6">
            {/* Page title */}
            <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />

            {/* Stats cards skeleton */}
            <div className="grid grid-cols-4 gap-6">
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
      <SessionTimeoutProvider>
        <Suspense fallback={null}>
          <SearchParamsErrorHandler />
        </Suspense>
        <div className="flex h-screen bg-gray-50">
          <Sidebar user={user || undefined} tenant={tenant || undefined} subscriptionExpired={subscriptionExpired} />

          <div className="flex-1 flex flex-col overflow-hidden">
            <Header
              user={user}
              tenant={tenant}
              onLogout={logout}
              onOpenSettings={() => router.push('/settings')}
            />

            <div className="flex-1 overflow-y-auto">
              {children}
            </div>
          </div>

          {/* Global subscription inactive modal - shown on all dashboard pages */}
          <SubscriptionInactiveModal />
        </div>
      </SessionTimeoutProvider>
    </QuotaProvider>
  );
}
