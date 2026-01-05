'use client';

import { useEffect, useState } from 'react';
import { Building2, Users, BarChart3, Settings, Activity, FileText, Briefcase, Award, Loader2 } from 'lucide-react';
import { User, Tenant } from '@/lib/types/tenant';
import { dashboardService, DashboardStats, RecentActivity } from '@/lib/services/dashboardService';

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
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        setLoading(true);
        const data = await dashboardService.getDashboard();
        setStats(data.stats);
        setRecentActivity(data.recent_activity);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch dashboard:', err);
        setError('Failed to load dashboard data');
        // Set default stats on error
        setStats({
          total_resumes: 0,
          resumes_this_week: 0,
          total_jds: 0,
          active_jds: 0,
          total_users: 0,
          active_users: 0,
          total_scorings: 0,
          total_assessments: 0,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, []);

  const canManageUsers = user?.permissions?.canManageUsers;

  const getActivityIcon = (action: string) => {
    if (action.includes('resume')) return <FileText className="w-4 h-4 text-blue-600" />;
    if (action.includes('jd') || action.includes('job')) return <Briefcase className="w-4 h-4 text-purple-600" />;
    if (action.includes('user')) return <Users className="w-4 h-4 text-green-600" />;
    if (action.includes('scoring') || action.includes('assessment')) return <Award className="w-4 h-4 text-orange-600" />;
    return <Activity className="w-4 h-4 text-gray-600" />;
  };

  if (loading) {
    return (
      <main className="flex-1 p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-gray-50 flex items-center justify-center">
        <div className="flex items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-gray-600" />
          <span className="text-gray-600">Loading dashboard...</span>
        </div>
      </main>
    );
  }

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
              {tenant?.name || 'TalentFlow'} - Dashboard
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm">
          {error}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Resumes</p>
              <p className="text-3xl font-semibold text-gray-900 mt-1">{stats?.total_resumes || 0}</p>
              <p className="text-xs text-green-600 mt-1">+{stats?.resumes_this_week || 0} this week</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Job Descriptions</p>
              <p className="text-3xl font-semibold text-gray-900 mt-1">{stats?.total_jds || 0}</p>
              <p className="text-xs text-green-600 mt-1">{stats?.active_jds || 0} active</p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <Briefcase className="w-6 h-6 text-purple-600" />
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
              <p className="text-3xl font-semibold text-gray-900 mt-1">{stats?.total_users || 0}</p>
              <p className="text-xs text-green-600 mt-1">{stats?.active_users || 0} active</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Assessments</p>
              <p className="text-3xl font-semibold text-gray-900 mt-1">{stats?.total_assessments || 0}</p>
              <p className="text-xs text-gray-500 mt-1">{stats?.total_scorings || 0} scorings</p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <Award className="w-6 h-6 text-orange-600" />
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
                  <p className="text-sm font-medium text-gray-900">Manage Team</p>
                  <p className="text-xs text-gray-500">Add or edit team members</p>
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
            {recentActivity.length > 0 ? (
              recentActivity.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center border border-gray-200">
                      {getActivityIcon(activity.action)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{activity.action_display}</p>
                      <p className="text-xs text-gray-500">
                        {activity.user_name || 'System'}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-gray-400">{activity.time_ago}</span>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Activity className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-sm">No recent activity</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Role-based Message for non-admins */}
      {!canManageUsers && (
        <div className="mt-8 bg-gray-50 border border-gray-200 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Activity className="w-5 h-5 text-gray-800" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-800">Your Dashboard</h3>
              <p className="text-sm text-gray-900 mt-1">
                View your activity and stats. Contact your administrator for additional permissions.
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
