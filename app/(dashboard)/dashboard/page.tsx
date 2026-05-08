'use client';

import EnhancedDashboard from '@/components/EnhancedDashboard';
import AdminDashboard from '@/components/AdminDashboard';
import RecruiterDashboard from '@/components/RecruiterDashboard';
import BillingManagerDashboard from '@/components/BillingManagerDashboard';
import ViewerDashboard from '@/components/ViewerDashboard';
import StandardUserDashboard from '@/components/StandardUserDashboard';
import { useAuth } from '@/lib/hooks/useAuth';
import { useRouter } from 'next/navigation';

export default function DashboardPage() {
  const { user, tenant } = useAuth();
  const router = useRouter();

  const handleNavigateToTenants = () => router.push('/organization/team-management');
  const handleNavigateToUsers = () => router.push('/organization/user-management');
  const handleNavigateToAnalytics = () => router.push('/reports/performance-reports');
  const handleNavigateToSettings = () => router.push('/settings/general-settings');

  switch (user?.role) {
    case 'tenant_admin':
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

    case 'recruiter':
      return <RecruiterDashboard user={user || undefined} tenant={tenant || undefined} />;

    case 'billing_manager':
      return <BillingManagerDashboard user={user || undefined} tenant={tenant || undefined} />;

    case 'viewer':
      return <ViewerDashboard user={user || undefined} tenant={tenant || undefined} />;

    case 'standard_user':
      return <StandardUserDashboard user={user || undefined} tenant={tenant || undefined} />;

    default:
      return <EnhancedDashboard user={user || undefined} tenant={tenant || undefined} />;
  }
}
