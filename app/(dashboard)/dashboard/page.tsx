'use client';

import EnhancedDashboard from '@/components/EnhancedDashboard';
import AdminDashboard from '@/components/AdminDashboard';
import { useAuth } from '@/lib/hooks/useAuth';
import { useRouter } from 'next/navigation';

export default function DashboardPage() {
  const { user, tenant } = useAuth();
  const router = useRouter();

  // Check if user is tenant admin
  const isTenantAdmin = user?.role === 'tenant_admin';

  // Navigation handlers for AdminDashboard
  const handleNavigateToTenants = () => {
    router.push('/organization/team-management');
  };

  const handleNavigateToUsers = () => {
    router.push('/organization/user-management');
  };

  const handleNavigateToAnalytics = () => {
    router.push('/reports/performance-reports');
  };

  const handleNavigateToSettings = () => {
    router.push('/settings/general-settings');
  };

  // Show AdminDashboard for tenant admins, EnhancedDashboard for regular users
  if (isTenantAdmin) {
    return (
      <AdminDashboard
        user={user || undefined}
        tenant={tenant || undefined}
        onNavigateToTenants={handleNavigateToTenants}
        onNavigateToUsers={handleNavigateToUsers}
        onNavigateToAnalytics={handleNavigateToAnalytics}
        onNavigateToSettings={handleNavigateToSettings}
      />
    );
  }

  return (
    <EnhancedDashboard
      user={user || undefined}
      tenant={tenant || undefined}
    />
  );
}
