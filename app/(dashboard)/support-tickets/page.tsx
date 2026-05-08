'use client';

import SupportCenter from '@/components/SupportCenter';
import { usePermissions } from '@/lib/hooks/usePermissions';
import FeatureGate from '@/components/shared/FeatureGate';

export default function SupportTicketsPage() {
  const { isTenantAdmin } = usePermissions();

  return (
    <>
      <FeatureGate feature="priority_support" mode="section">
        <div className="mx-auto w-full max-w-[1400px] mt-4 mx-4 sm:mx-6 lg:mx-8 p-4 bg-green-50 border border-green-200 rounded-xl">
          <p className="text-sm text-green-700 font-medium">
            Priority Support is enabled for your plan. Your tickets are handled with higher priority and faster response times.
          </p>
        </div>
      </FeatureGate>
      <SupportCenter isAdmin={isTenantAdmin} />
    </>
  );
}
