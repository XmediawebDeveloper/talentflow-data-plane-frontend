'use client';

import { useEffect, useState } from 'react';
import { Building2, Users, Settings, Activity, FileText, Briefcase, Award, Loader2, Zap, ClipboardCheck, Video, Upload, UserCheck, CreditCard, Calendar, Shield, Layers, ArrowUpRight, Clock, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { User, Tenant } from '@/lib/types/tenant';
import { dashboardService, DashboardStats, RecentActivity, SubscriptionUnits, JDActivity } from '@/lib/services/dashboardService';
import WelcomeBanner from '@/components/dashboard/WelcomeBanner';
import { useQuota } from '@/contexts/QuotaContext';
import { useAuth } from '@/lib/hooks/useAuth';

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
  const router = useRouter();
  const { quotaData } = useQuota();
  const isTenantAdmin = user?.role === 'tenant_admin';
  const { hasPermission } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [subscriptionUnits, setSubscriptionUnits] = useState<SubscriptionUnits | null>(null);  // JD02A
  const [jdRecentActivity, setJdRecentActivity] = useState<JDActivity[]>([]);  // JD02A
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        setLoading(true);
        const data = await dashboardService.getDashboard();
        setStats(data.stats);
        setRecentActivity(data.recent_activity);
        setSubscriptionUnits(data.subscription_units);  // JD02A
        setJdRecentActivity(data.jd_recent_activity || []);  // JD02A
        setError(null);
      } catch (err: any) {
        console.error('Failed to fetch dashboard:', err);

        // Check for permission denied (403 Forbidden)
        if (err?.message?.includes('403') || err?.message?.includes('Permission') || err?.status === 403) {
          setError('Permission Denied: You do not have access to view dashboard data');
        } else {
          setError('Failed to load dashboard data');
        }

        // Set default stats on error
        setStats({
          total_resumes: 0,
          my_resumes: 0,
          internal_db_resumes: 0,
          resumes_this_week: 0,
          total_jds: 0,
          active_jds: 0,
          draft_jds: 0,  // JD02A
          my_jds: 0,     // JD02B
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

  const canManageUsers = hasPermission('canManageUsers');

  // Filter activities to only show those from the last 24 hours
  const filterLast24Hours = <T extends { created_at: string }>(activities: T[]): T[] => {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return activities.filter((activity) => {
      const activityDate = new Date(activity.created_at);
      return activityDate >= twentyFourHoursAgo;
    });
  };

  // Get filtered activities (last 24 hours only, max 10 items)
  const filteredRecentActivity = filterLast24Hours(recentActivity).slice(0, 10);
  const filteredJdRecentActivity = filterLast24Hours(jdRecentActivity).slice(0, 10);

  const getActivityIcon = (action: string) => {
    if (action.includes('resume')) return <FileText className="w-4 h-4 text-blue-600" />;
    if (action.includes('jd') || action.includes('job')) return <Briefcase className="w-4 h-4 text-purple-600" />;
    if (action.includes('user')) return <Users className="w-4 h-4 text-green-600" />;
    if (action.includes('scoring') || action.includes('assessment')) return <Award className="w-4 h-4 text-orange-600" />;
    return <Activity className="w-4 h-4 text-gray-600" />;
  };

  if (loading) {
    return (
      <main className="flex-1 p-4 md:p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-gray-50 flex items-center justify-center">
        <div className="flex items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-gray-600" />
          <span className="text-gray-600">Loading dashboard...</span>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 p-4 md:p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-gray-50">
      {/* Welcome Banner */}
      <div className="mb-8">
        <WelcomeBanner user={user} tenant={tenant} />
      </div>

      {error && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm">
          {error}
        </div>
      )}

      {/* Plan Overview - Admin Only */}
      {isTenantAdmin && (tenant?.subscription || quotaData) && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              {quotaData?.is_trial ? (
                <Sparkles className="w-5 h-5 text-amber-500" />
              ) : (
                <CreditCard className="w-5 h-5 text-indigo-600" />
              )}
              <h2 className="text-lg font-semibold text-gray-900">Plan Overview</h2>
              {quotaData?.is_trial && (
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Free Trial</span>
              )}
            </div>
            <button
              onClick={() => router.push('/subscription/current-plan')}
              className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition-colors"
            >
              {quotaData?.is_trial ? 'Upgrade Plan' : 'Manage Plan'} <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Free Trial Layout */}
          {quotaData?.is_trial ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-4">
              <div>
                <p className="text-xs text-gray-500 mb-1">Current Plan</p>
                <p className="text-sm font-semibold text-gray-900">
                  {quotaData?.plan_name || tenant?.subscription?.planName || 'Free Trial'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Trial Type</p>
                <p className="text-sm font-semibold text-gray-900 capitalize">
                  {quotaData?.trial_info?.trial_type?.toLowerCase() || 'standard'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Status</p>
                <p className="text-sm font-semibold capitalize">
                  {(() => {
                    const rawStatus = quotaData?.subscription_status || tenant?.subscription?.status || 'trial';
                    const isActive = rawStatus === 'trial' || rawStatus === 'active';
                    const label = isActive ? 'Active' : rawStatus;
                    const colorClass = rawStatus === 'expired' || rawStatus === 'suspended'
                      ? 'text-red-700'
                      : isActive
                        ? 'text-green-700'
                        : 'text-amber-600';
                    return <span className={colorClass}>{label}</span>;
                  })()}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Time Remaining</p>
                <p className="text-sm font-semibold">
                  {quotaData?.trial_info?.days_remaining != null ? (
                    <span className={
                      quotaData.trial_info.days_remaining <= 3
                        ? 'text-red-700'
                        : quotaData.trial_info.days_remaining <= 7
                          ? 'text-amber-600'
                          : 'text-green-700'
                    }>
                      {quotaData.trial_info.days_remaining === 0 ? (
                        (() => {
                          const endDate = quotaData.trial_info?.trial_end_date || quotaData.trial_end_date;
                          if (endDate) {
                            const hoursLeft = Math.max(0, Math.floor((new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60)));
                            if (hoursLeft > 0) return `${hoursLeft}h left`;
                            const minsLeft = Math.max(0, Math.floor((new Date(endDate).getTime() - Date.now()) / (1000 * 60)));
                            if (minsLeft > 0) return `${minsLeft}m left`;
                            return 'Expired';
                          }
                          return 'Less than a day';
                        })()
                      ) : (
                        `${quotaData.trial_info.days_remaining} ${quotaData.trial_info.days_remaining === 1 ? 'day' : 'days'}`
                      )}
                    </span>
                  ) : (
                    <span className="text-gray-900">-</span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Trial Ends</p>
                <p className="text-sm font-semibold text-gray-900">
                  {quotaData?.trial_info?.trial_end_date
                    ? new Date(quotaData.trial_info.trial_end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : quotaData?.trial_end_date
                      ? new Date(quotaData.trial_end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : '-'}
                </p>
              </div>
            </div>
          ) : (
            /* Paid Plan Layout */
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-4">
              <div>
                <p className="text-xs text-gray-500 mb-1">Current Plan</p>
                <p className="text-sm font-semibold text-gray-900">
                  {quotaData?.plan_name || quotaData?.plan_info?.plan_name || tenant?.subscription?.planName || '-'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Plan Tier</p>
                <p className="text-sm font-semibold text-gray-900 capitalize">
                  {quotaData?.plan_info?.plan_tier || '-'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Status</p>
                <p className="text-sm font-semibold capitalize">
                  <span className={
                    (quotaData?.subscription_status || tenant?.subscription?.status) === 'active'
                      ? 'text-green-700'
                      : (quotaData?.subscription_status || tenant?.subscription?.status) === 'expired'
                        ? 'text-red-700'
                        : (quotaData?.subscription_status || tenant?.subscription?.status) === 'suspended'
                          ? 'text-red-700'
                          : 'text-yellow-700'
                  }>
                    {quotaData?.subscription_status || tenant?.subscription?.status || '-'}
                  </span>
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Billing Period</p>
                <p className="text-sm font-semibold text-gray-900 capitalize">
                  {quotaData?.plan_info?.billing_period?.toLowerCase() || '-'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Isolation</p>
                <p className="text-sm font-semibold text-gray-900 capitalize">
                  {(quotaData?.plan_info?.isolation_type || quotaData?.isolation_type || '-').toString().toLowerCase()}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Resumes Card - Clickable with navigation links */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md hover:border-blue-300 transition-all">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Resumes</p>
              <p className="text-3xl font-semibold text-gray-900 mt-1">{stats?.total_resumes || 0}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span
                  className="text-xs text-blue-600 cursor-pointer hover:underline hover:text-blue-700 transition-colors"
                  onClick={() => router.push('/recruitment/my-resumes')}
                >
                  {stats?.my_resumes || 0} My Resumes
                </span>
                <span className="text-xs text-gray-400">|</span>
                <span
                  className="text-xs text-purple-600 cursor-pointer hover:underline hover:text-purple-700 transition-colors"
                  onClick={() => router.push('/recruitment/resume-database')}
                >
                  {stats?.internal_db_resumes || 0} Internal DB
                </span>
              </div>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        {/* Job Descriptions Card - Clickable with status filters */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md hover:border-purple-300 transition-all">
          <div className="flex items-center justify-between">
            <div>
              <p
                className="text-sm text-gray-600 cursor-pointer hover:text-purple-600 transition-colors"
                onClick={() => router.push('/recruitment/job-openings')}
              >
                Job Descriptions
              </p>
              <p
                className="text-3xl font-semibold text-gray-900 mt-1 cursor-pointer hover:text-purple-600 transition-colors"
                onClick={() => router.push('/recruitment/job-openings')}
              >
                {stats?.total_jds || 0}
              </p>
              {/* JD02A & JD02B: Show published, draft, and my JDs counts - All clickable */}
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span
                  className="text-xs text-green-600 cursor-pointer hover:underline hover:text-green-700 transition-colors"
                  onClick={(e) => { e.stopPropagation(); router.push('/recruitment/job-openings?status=published'); }}
                >
                  {stats?.active_jds || 0} Published
                </span>
                <span className="text-xs text-gray-400">|</span>
                <span
                  className="text-xs text-yellow-600 cursor-pointer hover:underline hover:text-yellow-700 transition-colors"
                  onClick={(e) => { e.stopPropagation(); router.push('/recruitment/job-openings?status=draft'); }}
                >
                  {stats?.draft_jds || 0} Draft
                </span>
              </div>
            </div>
            <div
              className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center cursor-pointer"
              onClick={() => router.push('/recruitment/job-openings')}
            >
              <Briefcase className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>

        {/* Users Card - Clickable for admins */}
        <div
          className={`bg-white rounded-xl shadow-sm border border-gray-200 p-6 ${canManageUsers ? 'cursor-pointer hover:shadow-md hover:border-green-300 transition-all' : 'hover:shadow-md transition-shadow'}`}
          onClick={() => canManageUsers && onNavigateToUsers?.()}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Users</p>
              <p className="text-3xl font-semibold text-gray-900 mt-1">{stats?.total_users || 0}</p>
              <p className="text-xs text-green-600 mt-1">{stats?.active_users || 0} Active</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        {/* Assessments Card - Clickable */}
        <div
          className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 cursor-pointer hover:shadow-md hover:border-orange-300 transition-all"
          onClick={() => router.push('/recruitment/assessments')}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Assessments</p>
              <p className="text-3xl font-semibold text-gray-900 mt-1">{stats?.total_assessments || 0}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-xs text-green-600">{stats?.assessment_completed_count || 0} Completed</span>
                {stats?.assessment_average_score !== null && stats?.assessment_average_score !== undefined && (
                  <>
                    <span className="text-xs text-gray-400">|</span>
                    <span className="text-xs text-blue-600">Avg: {stats.assessment_average_score}%</span>
                  </>
                )}
              </div>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <Award className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </div>
      </div>

      {/* JD02A: Subscription Units */}
      {subscriptionUnits && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Available Units</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {/* Resume Upload Units */}
            {subscriptionUnits.RU && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <Upload className="w-5 h-5 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-600">Resume Storage</p>
                    <p className="text-xl font-semibold text-gray-900">
                      {subscriptionUnits.RU.is_unlimited ? 'Unlimited' : subscriptionUnits.RU.available}
                    </p>
                  </div>
                </div>
                {!subscriptionUnits.RU.is_unlimited && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>{subscriptionUnits.RU.used} / {subscriptionUnits.RU.limit} used</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full ${subscriptionUnits.RU.percentage_used > 80 ? 'bg-red-500' : subscriptionUnits.RU.percentage_used > 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
                        style={{ width: `${Math.min(subscriptionUnits.RU.percentage_used, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Resume Scoring Units */}
            {subscriptionUnits.RS && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Zap className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-600">Resume Scoring</p>
                    <p className="text-xl font-semibold text-gray-900">
                      {subscriptionUnits.RS.is_unlimited ? 'Unlimited' : subscriptionUnits.RS.available}
                    </p>
                  </div>
                </div>
                {!subscriptionUnits.RS.is_unlimited && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>{subscriptionUnits.RS.used} / {subscriptionUnits.RS.limit} used</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full ${subscriptionUnits.RS.percentage_used > 80 ? 'bg-red-500' : subscriptionUnits.RS.percentage_used > 50 ? 'bg-yellow-500' : 'bg-blue-500'}`}
                        style={{ width: `${Math.min(subscriptionUnits.RS.percentage_used, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Assessment Units */}
            {subscriptionUnits.AS && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                    <ClipboardCheck className="w-5 h-5 text-orange-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-600">Assessment</p>
                    <p className="text-xl font-semibold text-gray-900">
                      {subscriptionUnits.AS.is_unlimited ? 'Unlimited' : subscriptionUnits.AS.available}
                    </p>
                  </div>
                </div>
                {!subscriptionUnits.AS.is_unlimited && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>{subscriptionUnits.AS.used} / {subscriptionUnits.AS.limit} used</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full ${subscriptionUnits.AS.percentage_used > 80 ? 'bg-red-500' : subscriptionUnits.AS.percentage_used > 50 ? 'bg-yellow-500' : 'bg-orange-500'}`}
                        style={{ width: `${Math.min(subscriptionUnits.AS.percentage_used, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* AI Interview Units */}
            {subscriptionUnits.AIU && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Video className="w-5 h-5 text-purple-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-600">AI Interview</p>
                    <p className="text-xl font-semibold text-gray-900">
                      {subscriptionUnits.AIU.is_unlimited ? 'Unlimited' : subscriptionUnits.AIU.available}
                    </p>
                  </div>
                </div>
                {!subscriptionUnits.AIU.is_unlimited && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>{subscriptionUnits.AIU.used} / {subscriptionUnits.AIU.limit} used</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full ${subscriptionUnits.AIU.percentage_used > 80 ? 'bg-red-500' : subscriptionUnits.AIU.percentage_used > 50 ? 'bg-yellow-500' : 'bg-purple-500'}`}
                        style={{ width: `${Math.min(subscriptionUnits.AIU.percentage_used, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Max Users */}
            {subscriptionUnits.max_seats && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
                    <UserCheck className="w-5 h-5 text-teal-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-600">Max Users</p>
                    <p className="text-xl font-semibold text-gray-900">
                      {subscriptionUnits.max_seats.is_unlimited ? 'Unlimited' : subscriptionUnits.max_seats.available}
                    </p>
                  </div>
                </div>
                {!subscriptionUnits.max_seats.is_unlimited && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>{subscriptionUnits.max_seats.used} / {subscriptionUnits.max_seats.limit} used</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full ${subscriptionUnits.max_seats.percentage_used > 80 ? 'bg-red-500' : subscriptionUnits.max_seats.percentage_used > 50 ? 'bg-yellow-500' : 'bg-teal-500'}`}
                        style={{ width: `${Math.min(subscriptionUnits.max_seats.percentage_used, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* JD02A: JD Recent Activity - Last 24 hours only, max 10 items */}
      {filteredJdRecentActivity.length > 0 && (
        <div className="mb-8">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Recent JD Activity</h2>
              <Briefcase className="w-5 h-5 text-gray-400" />
            </div>
            <div className="space-y-3">
              {filteredJdRecentActivity.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                      <Briefcase className="w-4 h-4 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {activity.jd_title || 'Untitled JD'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {activity.action_display} by {activity.user_name || 'System'}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-gray-400">{activity.time_ago}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions & Recent Activity */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="space-y-3">
            <button
              onClick={() => router.push('/recruitment/jd-creation')}
              className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-colors"
            >
              <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                <Briefcase className="w-5 h-5 text-gray-800" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-gray-900">Create New Job</p>
                <p className="text-xs text-gray-500">Post a new job opening</p>
              </div>
            </button>

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

        {/* Recent Activity - Last 24 hours only, max 10 items - Table View */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
            <Activity className="w-5 h-5 text-gray-400" />
          </div>
          {filteredRecentActivity.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Details</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredRecentActivity.map((activity) => {
                    // Build details display based on activity type
                    const getDetailsDisplay = () => {
                      const details = activity.details || {};

                      // Normalize action to lowercase for comparison
                      const actionLower = activity.action?.toLowerCase() || '';

                      // Login/Logout activities - show email and IP
                      if (actionLower.includes('login') || actionLower.includes('logout')) {
                        const parts: string[] = [];
                        const email = details.email || activity.user_email;
                        if (email) parts.push(email);
                        if (activity.ip_address) parts.push(`IP: ${activity.ip_address}`);
                        if (parts.length > 0) return parts.join(' • ');
                        return 'Session activity';
                      }

                      // Team activities - show team name
                      if (actionLower.includes('team')) {
                        if (details.team_name) return `Team: ${details.team_name}`;
                        if (details.name) return `Team: ${details.name}`;
                      }

                      // JD activities (jd_create, jd_publish, etc.)
                      if (actionLower.includes('jd_') || actionLower.includes('job')) {
                        const jdNum = details.jd_number || details.job_number;
                        const title = details.title || details.jd_title;
                        if (jdNum && title) return `${jdNum} - ${title}`;
                        return jdNum || title || '-';
                      }

                      // Assessment activities
                      if (actionLower.includes('assessment_')) {
                        const assNum = details.assessment_number;
                        const title = details.title || details.assessment_title;
                        const jdNum = details.jd_number;
                        if (assNum && title) return `${assNum} - ${title}`;
                        if (jdNum && title) return `${jdNum} - ${title}`;
                        return title || details.candidate_email || '-';
                      }

                      // Resume scoring
                      if (actionLower.includes('scoring')) {
                        const candidate = details.candidate_name;
                        const jdNum = details.jd_number;
                        const jdTitle = details.jd_title;
                        const score = details.score || details.overall_score;
                        if (jdNum && candidate && score !== undefined) {
                          return `${jdNum} - ${candidate} (${score}%)`;
                        }
                        if (candidate && score !== undefined) {
                          return `${candidate} - Score: ${score}%`;
                        }
                        return candidate || jdTitle || '-';
                      }

                      // Resume upload/delete/move
                      if (actionLower.includes('resume_')) {
                        const candidate = details.candidate_name || details.title;
                        const fileName = details.file_name;
                        if (candidate && candidate !== 'Unknown' && fileName) return `${candidate} (${fileName})`;
                        if (candidate && candidate !== 'Unknown') return candidate;
                        return fileName || '-';
                      }

                      // User activities
                      if (actionLower.includes('user_')) {
                        const email = details.user_email || details.email || details.title;
                        const role = details.role;
                        if (email && role) return `${email} (${role})`;
                        return email || '-';
                      }

                      // Folder activities
                      if (actionLower.includes('folder')) {
                        if (details.folder_name) return `Folder: ${details.folder_name}`;
                        if (details.name) return `Folder: ${details.name}`;
                      }

                      // Role activities
                      if (actionLower.includes('role')) {
                        if (details.role_name) return `Role: ${details.role_name}`;
                        if (details.name) return `Role: ${details.name}`;
                      }

                      // Subscription/Plan activities
                      if (actionLower.includes('subscription') || actionLower.includes('plan')) {
                        if (details.plan_name) return `Plan: ${details.plan_name}`;
                        if (details.name) return details.name;
                      }

                      // Default fallback - check common fields
                      return details.title || details.name || details.email || details.candidate_name || '-';
                    };

                    const detailsDisplay = getDetailsDisplay();

                    return (
                      <tr key={activity.id} className="hover:bg-gray-50 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center">
                              {getActivityIcon(activity.action)}
                            </div>
                            <span className="text-sm font-medium text-gray-900">{activity.action_display}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-sm text-gray-700">{detailsDisplay}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-sm text-gray-600">{activity.user_name || 'System'}</span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className="text-xs text-gray-400">{activity.time_ago}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Activity className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-sm">No recent activity</p>
            </div>
          )}
        </div>
      </div>

    </main>
  );
}
