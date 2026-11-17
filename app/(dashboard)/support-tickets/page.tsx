'use client';

import SupportCenter from '@/components/SupportCenter';
import { usePermissions } from '@/lib/hooks/usePermissions';

export default function SupportTicketsPage() {
  const { isTenantAdmin } = usePermissions();

  return (
    <div className="tf-page relative flex flex-col">
      <SupportCenter isAdmin={isTenantAdmin} />
    </div>
  );
}
