import { Building2, Users, BarChart3, Settings, TrendingUp, Activity, UserPlus, Shield } from 'lucide-react';
import { User, Tenant } from '@/lib/types/tenant';

interface AdminDashboardProps {
  user?: User;
  tenant?: Tenant;
  onNavigateToTenants?: () => void;
  onNavigateToUsers?: () => void;
  onNavigateToAnalytics?: () => void;
  onNavigateToSettings?: () => void;
}

export default function AdminDashboard({
  user,
  tenant,
  onNavigateToTenants,
  onNavigateToUsers,
  onNavigateToAnalytics,
  onNavigateToSettings,
}: AdminDashboardProps) {
  // Mock stats
  const stats = {
    totalTenants: 12,
    activeTenants: 10,
    totalUsers: 48,
    activeUsers: 42,
    newUsersThisWeek: 5,
    systemHealth: 99.9,
  };

  const recentActivity = [
    { id: 1, action: 'New user registered', user: 'John Smith', tenant: 'Tech Corp', time: '5 min ago' },
    { id: 2, action: 'Tenant subscription upgraded', user: 'System', tenant: 'StartupX', time: '1 hour ago' },
    { id: 3, action: 'User permissions updated', user: 'Admin', tenant: 'TalentFlow', time: '2 hours ago' },
    { id: 4, action: 'New tenant created', user: 'Admin', tenant: 'Innovation Labs', time: '3 hours ago' },
    { id: 5, action: 'User deactivated', user: 'Admin', tenant: 'Tech Corp', time: '5 hours ago' },
  ];

  const canManageUsers = user?.permissions?.can_manage_users;

  return (
    <main className="flex-1 p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-gray-50">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl flex items-center justify-center shadow-lg">
            <BarChart3 className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Welcome back, {user?.name || 'User'}
            </h1>
            <p className="text-sm text-gray-600">
              {tenant?.name || 'TalentFlow'} - Admin Dashboard
            </p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-6 mb-8">
        <div
          className={`bg-white rounded-xl shadow-sm border border-gray-200 p-6 ${canManageUsers ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
          onClick={() => canManageUsers && onNavigateToTenants?.()}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Tenants</p>
              <p className="text-3xl font-semibold text-gray-900 mt-1">{stats.totalTenants}</p>
              <p className="text-xs text-green-600 mt-1">{stats.activeTenants} active</p>
            </div>
            <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
              <Building2 className="w-6 h-6 text-gray-800" />
            </div>
          </div>
        </div>

        <div
          className={`bg-white rounded-xl shadow-sm border border-gray-200 p-6 ${canManageUsers ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
          onClick={() => canManageUsers && onNavigateToUsers?.()}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Users</p>
              <p className="text-3xl font-semibold text-gray-900 mt-1">{stats.totalUsers}</p>
              <p className="text-xs text-green-600 mt-1">{stats.activeUsers} active</p>
            </div>
            <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-gray-800" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">New Users</p>
              <p className="text-3xl font-semibold text-gray-900 mt-1">{stats.newUsersThisWeek}</p>
              <p className="text-xs text-gray-500 mt-1">This week</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <UserPlus className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">System Health</p>
              <p className="text-3xl font-semibold text-green-600 mt-1">{stats.systemHealth}%</p>
              <p className="text-xs text-gray-500 mt-1">Uptime</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <Activity className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions & Recent Activity */}
      <div className="grid grid-cols-3 gap-6">
        {/* Quick Actions */}
        {canManageUsers && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
            <div className="space-y-3">
              <button
                onClick={onNavigateToTenants}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 hover:border-gray-200 transition-colors"
              >
                <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-gray-800" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-gray-900">Manage Tenants</p>
                  <p className="text-xs text-gray-500">Add or edit tenants</p>
                </div>
              </button>

              <button
                onClick={onNavigateToUsers}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 hover:border-gray-200 transition-colors"
              >
                <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                  <Users className="w-5 h-5 text-gray-800" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-gray-900">Manage Users</p>
                  <p className="text-xs text-gray-500">Add users & permissions</p>
                </div>
              </button>

              <button
                onClick={onNavigateToSettings}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-colors"
              >
                <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                  <Settings className="w-5 h-5 text-gray-600" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-gray-900">Settings</p>
                  <p className="text-xs text-gray-500">System configuration</p>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Recent Activity */}
        <div className={`bg-white rounded-xl shadow-sm border border-gray-200 p-6 ${canManageUsers ? 'col-span-2' : 'col-span-3'}`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
            <Activity className="w-5 h-5 text-gray-400" />
          </div>
          <div className="space-y-4">
            {recentActivity.map((activity) => (
              <div
                key={activity.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                    <Shield className="w-4 h-4 text-gray-800" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{activity.action}</p>
                    <p className="text-xs text-gray-500">
                      {activity.user} - {activity.tenant}
                    </p>
                  </div>
                </div>
                <span className="text-xs text-gray-400">{activity.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Role-based Message for non-admins */}
      {!canManageUsers && (
        <div className="mt-8 bg-gray-50 border border-gray-200 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Shield className="w-5 h-5 text-gray-800" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-blue-900">Limited Access</h3>
              <p className="text-sm text-gray-900 mt-1">
                Your current role has limited permissions. Contact your administrator if you need access to additional features.
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
