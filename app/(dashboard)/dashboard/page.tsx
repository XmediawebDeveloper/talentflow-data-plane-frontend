'use client';

import AdminDashboard from '@/components/AdminDashboard';
import { useAuth } from '@/lib/hooks/useAuth';
import { useRouter } from 'next/navigation';

export default function DashboardPage() {
  const { user, tenant } = useAuth();
  const router = useRouter();

  return (
    <AdminDashboard
      user={user || undefined}
      tenant={tenant || undefined}
      onNavigateToTenants={() => router.push('/organization/users')}
      onNavigateToUsers={() => router.push('/organization/users')}
      onNavigateToAnalytics={() => router.push('/analytics')}
      onNavigateToSettings={() => router.push('/settings')}
    />
  );
}
