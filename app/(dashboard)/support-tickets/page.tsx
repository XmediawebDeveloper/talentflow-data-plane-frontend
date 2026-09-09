'use client';

import SupportCenter from '@/components/SupportCenter';
import { usePermissions } from '@/lib/hooks/usePermissions';

export default function SupportTicketsPage() {
  const { isTenantAdmin } = usePermissions();

  return (
    <div className="relative flex-1 flex flex-col overflow-x-hidden bg-slate-50">
      <SupportCenter isAdmin={isTenantAdmin} />
    </div>
  );
}
