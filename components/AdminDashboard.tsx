'use client';

import { useEffect, useState } from 'react';
import { Building2, Users, Settings, Activity, FileText, Briefcase, Award, Loader2, Zap, ClipboardCheck, Video, Upload, UserCheck, CreditCard, Calendar, Shield, Layers, ArrowUpRight, Clock, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { User, Tenant } from '@/lib/types/tenant';
import { dashboardService, DashboardStats, RecentActivity, SubscriptionUnits, JDActivity } from '@/lib/services/dashboardService';
import WelcomeBanner from '@/components/dashboard/WelcomeBanner';
import { useQuota } from '@/contexts/QuotaContext';
import { useAuth } from '@/lib/hooks/useAuth';
import { usePlanFeatures } from '@/lib/hooks/usePlanFeature';
import { formatISTDate } from '@/lib/utils/dateUtils';

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
  const { hasPlanFeature } = usePlanFeatures();
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

  const getActivityAccent = (action: string): string => {
    if (action.includes('resume')) return 'bg-blue-50 ring-blue-100';
    if (action.includes('jd') || action.includes('job')) return 'bg-purple-50 ring-purple-100';
    if (action.includes('user')) return 'bg-green-50 ring-green-100';
    if (action.includes('scoring') || action.includes('assessment')) return 'bg-orange-50 ring-orange-100';
    return 'bg-gray-100 ring-gray-200';
  };

  const formatActivityFullTime = (iso: string): string => {
    try {
      return new Date(iso).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return iso;
    }
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
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
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
                    ? formatISTDate(quotaData.trial_info.trial_end_date)
                    : quotaData?.trial_end_date
                      ? formatISTDate(quotaData.trial_end_date)
                      : '-'}
                </p>
              </div>
            </div>
          ) : (
            /* Paid Plan Layout */
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
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
            </div>
          )}
        </div>
      )}

      {/* Stats Cards */}
    
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
        {/* Resumes Card - Clickable with navigation links (only if plan includes resume_upload) */}
        {hasPlanFeature('resume_upload') && <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md hover:border-blue-300 transition-all">
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
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>}

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
              className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center cursor-pointer flex-shrink-0"
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
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Users className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        {/* Assessments Card - Clickable (only if plan includes assessment) */}
        {hasPlanFeature('assessment') && (
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
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Award className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* JD02A: Subscription Units */}
      {subscriptionUnits && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Available Units</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
            {/* Resume Upload Units */}
            {subscriptionUnits.RU && hasPlanFeature('resume_upload') && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Upload className="w-5 h-5 text-green-600" />
                  </div>
                </div>
                <p className="text-sm text-gray-600 whitespace-nowrap">Resume Storage</p>
                <p className="text-xl font-semibold text-gray-900">
                  {subscriptionUnits.RU.is_unlimited ? 'Unlimited' : subscriptionUnits.RU.available}
                </p>
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
            {subscriptionUnits.RS && hasPlanFeature('resume_scoring') && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Zap className="w-5 h-5 text-blue-600" />
                  </div>
                </div>
                <p className="text-sm text-gray-600 whitespace-nowrap">Resume Scoring</p>
                <p className="text-xl font-semibold text-gray-900">
                  {subscriptionUnits.RS.is_unlimited ? 'Unlimited' : subscriptionUnits.RS.available}
                </p>
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
            {subscriptionUnits.AS && hasPlanFeature('assessment') && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <ClipboardCheck className="w-5 h-5 text-orange-600" />
                  </div>
                </div>
                <p className="text-sm text-gray-600 whitespace-nowrap">Assessment</p>
                <p className="text-xl font-semibold text-gray-900">
                  {subscriptionUnits.AS.is_unlimited ? 'Unlimited' : subscriptionUnits.AS.available}
                </p>
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
            {subscriptionUnits.AIU && hasPlanFeature('ai_interview') && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Video className="w-5 h-5 text-purple-600" />
                  </div>
                </div>
                <p className="text-sm text-gray-600 whitespace-nowrap">AI Interview</p>
                <p className="text-xl font-semibold text-gray-900">
                  {subscriptionUnits.AIU.is_unlimited ? 'Unlimited' : subscriptionUnits.AIU.available}
                </p>
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
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <UserCheck className="w-5 h-5 text-teal-600" />
                  </div>
                </div>
                <p className="text-sm text-gray-600 whitespace-nowrap">Max Users</p>
                <p className="text-xl font-semibold text-gray-900">
                  {subscriptionUnits.max_seats.is_unlimited ? 'Unlimited' : subscriptionUnits.max_seats.available}
                </p>
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
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900">Recent JD Activity</h2>
              <Briefcase className="w-5 h-5 text-gray-400" />
            </div>
            <div className="space-y-3">
              {filteredJdRecentActivity.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-start sm:items-center justify-between gap-2 p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-start sm:items-center gap-3 min-w-0">
                    <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <Briefcase className="w-4 h-4 text-purple-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {activity.jd_title || 'Untitled JD'}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {activity.action_display} by {activity.user_name || 'System'}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">{activity.time_ago}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions & Recent Activity */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
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

        {/* Recent Activity - Last 24 hours only, max 10 items - Feed View */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 md:col-span-2 overflow-hidden">
          <div className="flex items-start justify-between gap-4 px-4 sm:px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-base sm:text-lg font-semibold text-gray-900">
                <Activity className="w-5 h-5 text-gray-600" />
                Recent Activity
              </h2>
              <p className="text-xs sm:text-sm text-gray-600 mt-0.5">
                Latest actions across your workspace
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="inline-flex items-center rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700">
                Last 24 hours
              </span>
            </div>
          </div>

          {filteredRecentActivity.length > 0 ? (
            <ul className="divide-y divide-gray-100">
              {filteredRecentActivity.map((activity) => {
                // Build details display based on activity type
                const getDetailsDisplay = () => {
                  const details = activity.details || {};
                  const actionLower = activity.action?.toLowerCase() || '';

                  if (actionLower.includes('login') || actionLower.includes('logout')) {
                    const parts: string[] = [];
                    const email = details.email || activity.user_email;
                    if (email) parts.push(email);
                    if (activity.ip_address) parts.push(`IP: ${activity.ip_address}`);
                    if (parts.length > 0) return parts.join(' • ');
                    return 'Session activity';
                  }
                  if (actionLower.includes('team')) {
                    if (details.team_name) return `Team: ${details.team_name}`;
                    if (details.name) return `Team: ${details.name}`;
                  }
                  if (actionLower.includes('jd_') || actionLower.includes('job')) {
                    const jdNum = details.jd_number || details.job_number;
                    const title = details.title || details.jd_title;
                    if (jdNum && title) return `${jdNum} - ${title}`;
                    return jdNum || title || '';
                  }
                  if (actionLower.includes('assessment_')) {
                    const assNum = details.assessment_number;
                    const title = details.title || details.assessment_title;
                    const jdNum = details.jd_number;
                    if (assNum && title) return `${assNum} - ${title}`;
                    if (jdNum && title) return `${jdNum} - ${title}`;
                    return title || details.candidate_email || '';
                  }
                  if (actionLower.includes('scoring')) {
                    const candidate = details.candidate_name;
                    const jdNum = details.jd_number;
                    const jdTitle = details.jd_title;
                    const score = details.score || details.overall_score;
                    if (jdNum && candidate && score !== undefined) return `${jdNum} - ${candidate} (${score}%)`;
                    if (candidate && score !== undefined) return `${candidate} - Score: ${score}%`;
                    return candidate || jdTitle || '';
                  }
                  if (actionLower.includes('resume_')) {
                    const candidate = details.candidate_name || details.title;
                    const fileName = details.file_name;
                    if (candidate && candidate !== 'Unknown' && fileName) return `${candidate} (${fileName})`;
                    if (candidate && candidate !== 'Unknown') return candidate;
                    return fileName || '';
                  }
                  if (actionLower.includes('user_')) {
                    const email = details.user_email || details.email || details.title;
                    const role = details.role;
                    if (email && role) return `${email} (${role})`;
                    return email || '';
                  }
                  if (actionLower.includes('folder')) {
                    if (details.folder_name) return `Folder: ${details.folder_name}`;
                    if (details.name) return `Folder: ${details.name}`;
                  }
                  if (actionLower.includes('role')) {
                    if (details.role_name) return `Role: ${details.role_name}`;
                    if (details.name) return `Role: ${details.name}`;
                  }
                  if (actionLower.includes('subscription') || actionLower.includes('plan')) {
                    if (details.plan_name) return `Plan: ${details.plan_name}`;
                    if (details.name) return details.name;
                  }
                  return details.title || details.name || details.email || details.candidate_name || '';
                };

                const detailsDisplay = getDetailsDisplay();
                const userLabel = activity.user_name || 'System';
                const initials = userLabel
                  .split(' ')
                  .map((p) => p[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join('')
                  .toUpperCase() || 'SY';
                const fullTime = formatActivityFullTime(activity.created_at);

                return (
                  <li
                    key={activity.id}
                    className="group flex items-start gap-3 sm:gap-4 px-4 sm:px-6 py-4 hover:bg-gray-50/70 transition-colors"
                  >
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-full ring-4 ring-white ${getActivityAccent(activity.action)} flex-shrink-0`}
                    >
                      {getActivityIcon(activity.action)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {activity.action_display}
                          </p>
                          {detailsDisplay && (
                            <p className="text-xs text-gray-500 mt-0.5 truncate">
                              {detailsDisplay}
                            </p>
                          )}
                          <div className="mt-1.5 flex items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 pl-0.5 pr-2 py-0.5 text-[11px] font-medium text-gray-700">
                              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-gray-800 text-[9px] font-semibold text-white">
                                {initials}
                              </span>
                              {userLabel}
                            </span>
                          </div>
                        </div>
                        <time
                          className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0 group-hover:text-gray-600 transition-colors"
                          title={fullTime}
                          dateTime={activity.created_at}
                        >
                          {activity.time_ago}
                        </time>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="text-center py-12 px-6">
              <div className="mx-auto h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                <Activity className="w-6 h-6 text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-900">No activity in the last 24 hours</p>
              <p className="text-xs text-gray-500 mt-1">New actions will appear here as your team works</p>
            </div>
          )}
        </div>
      </div>

    </main>
  );
}
