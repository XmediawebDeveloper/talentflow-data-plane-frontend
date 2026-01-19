'use client';

import { useAuth } from '@/lib/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Sidebar from '@/components/shared/Sidebar';
import Header from '@/components/Header';
import SubscriptionInactiveModal from '@/components/SubscriptionInactiveModal';
import { toast } from 'sonner';
import { scoringService } from '@/lib/services/scoringService';

// Storage key for scoring batch persistence
const SCORING_BATCH_STORAGE_KEY = 'talentflow_scoring_batch';

interface StoredScoringBatch {
  jobId: string;
  jobTitle: string;
  startTime: number;
  resumeIds: string[];
  status: 'in_progress' | 'completed';
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, tenant, isAuthenticated, isLoading, logout } = useAuth();
  const router = useRouter();

  console.log('[DASHBOARD] Layout render - isLoading:', isLoading, 'isAuthenticated:', isAuthenticated, 'user:', user?.email);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      console.log('[DASHBOARD] Not authenticated, redirecting to login');
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

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
          // Show notification about interrupted scoring
          const elapsedMinutes = Math.floor(batchAge / 60000);
          toast.info(
            `Resume scoring for "${batch.jobTitle}" was interrupted ${elapsedMinutes > 0 ? `${elapsedMinutes} minutes ago` : 'recently'}. Visit Resume Scoring to check status or restart.`,
            {
              duration: 10000,
              action: {
                label: 'View Scoring',
                onClick: () => router.push(`/recruitment/resume-scoring?jd_id=${batch.jobId}`),
              },
            }
          );

          // Clear the batch since it was interrupted (frontend scoring doesn't continue)
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
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-700 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
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
    <div className="flex h-screen bg-gray-50">
      <Sidebar user={user || undefined} tenant={tenant || undefined} />

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
  );
}
'use client';

import { useAuth } from '@/lib/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Sidebar from '@/components/shared/Sidebar';
import Header from '@/components/Header';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, tenant, isAuthenticated, isLoading, logout } = useAuth();
  const router = useRouter();

  console.log('[DASHBOARD] Layout render - isLoading:', isLoading, 'isAuthenticated:', isAuthenticated, 'user:', user?.email);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      console.log('[DASHBOARD] Not authenticated, redirecting to login');
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    console.log('[DASHBOARD] Still loading...');
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-700 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
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
    <div className="flex h-screen bg-gray-50">
      <Sidebar user={user || undefined} tenant={tenant || undefined} />

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
    </div>
  );
}
