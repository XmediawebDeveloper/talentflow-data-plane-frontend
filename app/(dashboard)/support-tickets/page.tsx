'use client';

import SupportCenter from '@/components/SupportCenter';
import { usePermissions } from '@/lib/hooks/usePermissions';

export default function SupportTicketsPage() {
  const { isTenantAdmin } = usePermissions();

  return <SupportCenter isAdmin={isTenantAdmin} />;
}
