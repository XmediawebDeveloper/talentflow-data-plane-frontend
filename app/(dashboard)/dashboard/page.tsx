'use client';

import EnhancedDashboard from '@/components/EnhancedDashboard';
import { useAuth } from '@/lib/hooks/useAuth';

export default function DashboardPage() {
  const { user, tenant } = useAuth();

  return (
    <EnhancedDashboard
      user={user || undefined}
      tenant={tenant || undefined}
    />
  );
}
