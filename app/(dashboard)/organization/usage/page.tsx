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
import { Loader2 } from 'lucide-react';

export default function UsagePage() {
  const { user, isLoading, isTenantAdmin, isBillingManager, isStandardUser, isRecruiter } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Please log in to view usage data.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
        {/* Page Title */}
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 tracking-tight">
            {isStandardUser ? 'My Usage' : isBillingManager ? 'Billing & Usage' : 'Organization Usage'}
          </h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            {isStandardUser
              ? 'View your personal consumption history'
              : isBillingManager
              ? 'Aggregated billing and usage overview'
              : 'Monitor and manage your organization\'s unit consumption'
            }
          </p>
        </div>

        {/* Role-Based Content */}
        {isStandardUser ? (
          // Standard User: Only own consumption
          <MyConsumptionHistory />
        ) : (
          // Tenant Admin, Billing Manager, Recruiter: Unit pool view (API will filter for Billing Manager)
          <TenantUnitPool compact={false} showHistory={true} />
        )}
      </div>
    </div>
  );
}
