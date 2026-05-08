'use client';

import { useEffect, useState } from 'react';
import { Building2, Users, Settings, Activity, FileText, Briefcase, Award, Loader2, Zap, ClipboardCheck, Video, Upload, UserCheck, Calendar, Shield, Layers, ArrowUpRight, Clock, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { User, Tenant } from '@/lib/types/tenant';
import { dashboardService, DashboardStats, RecentActivity, SubscriptionUnits, JDActivity } from '@/lib/services/dashboardService';
import WelcomeBanner from '@/components/dashboard/WelcomeBanner';
import { useQuota } from '@/contexts/QuotaContext';
import { useAuth } from '@/lib/hooks/useAuth';
import { usePlanFeatures } from '@/lib/hooks/usePlanFeature';

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
    if (action.includes('resume')) return <FileText className="w-4 h-4 text-brand-cyan" />;
    if (action.includes('jd') || action.includes('job')) return <Briefcase className="w-4 h-4 text-brand-blue" />;
    if (action.includes('user')) return <Users className="w-4 h-4 text-brand-teal" />;
    if (action.includes('scoring') || action.includes('assessment')) return <Award className="w-4 h-4 text-brand-orange-deep" />;
    return <Activity className="w-4 h-4 text-gray-600" />;
  };

  const getActivityAccent = (action: string): string => {
    if (action.includes('resume')) return 'bg-brand-cyan/10 ring-brand-cyan/15';
    if (action.includes('jd') || action.includes('job')) return 'bg-brand-blue/10 ring-brand-blue/15';
    if (action.includes('user')) return 'bg-brand-teal/10 ring-brand-teal/15';
    if (action.includes('scoring') || action.includes('assessment')) return 'bg-brand-orange/10 ring-brand-orange/15';
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
      <main className="flex-1 bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-brand-blue" />
          <span className="text-gray-700 font-medium">Loading dashboard...</span>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-x-hidden bg-slate-50">
      <div className="p-4 md:p-8 w-full max-w-[1400px] mx-auto">
      {/* Welcome Banner */}
      <div className="mb-8">
        <WelcomeBanner user={user} tenant={tenant} />
      </div>

      {error && (
        <div className="mb-6 p-4 bg-brand-orange/10 border border-brand-orange/30 rounded-lg text-brand-orange-deep text-sm">
          {error}
        </div>
      )}

      {/* Stats Cards */}

      {false && (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
        {/* Resumes Card - Clickable with navigation links (only if plan includes resume_upload) */}
        {hasPlanFeature('resume_upload') && <div className="group relative overflow-hidden bg-white rounded-2xl shadow-sm shadow-brand-blue/5 border border-gray-100 ring-1 ring-black/[0.02] p-6 hover:shadow-lg hover:shadow-brand-blue/10 hover:border-brand-blue/30 hover:-translate-y-0.5 transition-all">
          <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-brand-blue/5 blur-2xl group-hover:bg-brand-blue/10 transition-colors" />
          <div className="relative flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Resumes</p>
              <p className="text-3xl font-bold text-gray-900 mt-1 tracking-tight">{stats?.total_resumes || 0}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span
                  className="text-xs text-brand-blue font-medium cursor-pointer hover:underline hover:text-brand-blue-2 transition-colors"
                  onClick={() => router.push('/recruitment/my-resumes')}
                >
                  {stats?.my_resumes || 0} My Resumes
                </span>
                <span className="text-xs text-gray-300">|</span>
                <span
                  className="text-xs text-brand-cyan font-medium cursor-pointer hover:underline hover:text-brand-teal transition-colors"
                  onClick={() => router.push('/recruitment/resume-database')}
                >
                  {stats?.internal_db_resumes || 0} Internal DB
                </span>
              </div>
            </div>
            <div className="w-12 h-12 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm shadow-brand-blue/10">
              <FileText className="w-6 h-6 text-brand-blue" />
            </div>
          </div>
        </div>}

        {/* Job Descriptions Card - Clickable with status filters */}
        <div className="group relative overflow-hidden bg-white rounded-2xl shadow-sm shadow-brand-blue/5 border border-gray-100 ring-1 ring-black/[0.02] p-6 hover:shadow-lg hover:shadow-brand-cyan/10 hover:border-brand-cyan/30 hover:-translate-y-0.5 transition-all">
          <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-brand-cyan/5 blur-2xl group-hover:bg-brand-cyan/10 transition-colors" />
          <div className="relative flex items-center justify-between">
            <div>
              <p
                className="text-sm text-gray-600 cursor-pointer hover:text-brand-cyan transition-colors"
                onClick={() => router.push('/recruitment/job-openings')}
              >
                Job Descriptions
              </p>
              <p
                className="text-3xl font-bold text-gray-900 mt-1 tracking-tight cursor-pointer hover:text-brand-cyan transition-colors"
                onClick={() => router.push('/recruitment/job-openings')}
              >
                {stats?.total_jds || 0}
              </p>
              {/* JD02A & JD02B: Show published, draft, and my JDs counts - All clickable */}
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span
                  className="text-xs text-green-600 font-medium cursor-pointer hover:underline hover:text-green-700 transition-colors"
                  onClick={(e) => { e.stopPropagation(); router.push('/recruitment/job-openings?status=published'); }}
                >
                  {stats?.active_jds || 0} Published
                </span>
                <span className="text-xs text-gray-300">|</span>
                <span
                  className="text-xs text-brand-orange-deep font-medium cursor-pointer hover:underline hover:text-brand-orange transition-colors"
                  onClick={(e) => { e.stopPropagation(); router.push('/recruitment/job-openings?status=draft'); }}
                >
                  {stats?.draft_jds || 0} Draft
                </span>
              </div>
            </div>
            <div
              className="w-12 h-12 bg-brand-cyan/10 ring-1 ring-brand-cyan/15 rounded-xl flex items-center justify-center cursor-pointer flex-shrink-0 shadow-sm shadow-brand-cyan/10"
              onClick={() => router.push('/recruitment/job-openings')}
            >
              <Briefcase className="w-6 h-6 text-brand-cyan" />
            </div>
          </div>
        </div>

        {/* Users Card - Clickable for admins */}
        <div
          className={`group relative overflow-hidden bg-white rounded-2xl shadow-sm shadow-brand-blue/5 border border-gray-100 ring-1 ring-black/[0.02] p-6 ${canManageUsers ? 'cursor-pointer hover:shadow-lg hover:shadow-brand-teal/10 hover:border-brand-teal/30 hover:-translate-y-0.5 transition-all' : 'hover:shadow-md transition-shadow'}`}
          onClick={() => canManageUsers && onNavigateToUsers?.()}
        >
          <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-brand-teal/5 blur-2xl group-hover:bg-brand-teal/10 transition-colors" />
          <div className="relative flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Users</p>
              <p className="text-3xl font-bold text-gray-900 mt-1 tracking-tight">{stats?.total_users || 0}</p>
              <p className="text-xs text-green-600 font-medium mt-1">{stats?.active_users || 0} Active</p>
            </div>
            <div className="w-12 h-12 bg-brand-teal/10 ring-1 ring-brand-teal/15 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm shadow-brand-teal/10">
              <Users className="w-6 h-6 text-brand-teal" />
            </div>
          </div>
        </div>

        {/* Assessments Card - Clickable (only if plan includes assessment) */}
        {hasPlanFeature('assessment') && (
          <div
            className="group relative overflow-hidden bg-white rounded-2xl shadow-sm shadow-brand-blue/5 border border-gray-100 ring-1 ring-black/[0.02] p-6 cursor-pointer hover:shadow-lg hover:shadow-brand-orange/10 hover:border-brand-orange/30 hover:-translate-y-0.5 transition-all"
            onClick={() => router.push('/recruitment/assessments')}
          >
            <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-brand-orange/5 blur-2xl group-hover:bg-brand-orange/10 transition-colors" />
            <div className="relative flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Assessments</p>
                <p className="text-3xl font-bold text-gray-900 mt-1 tracking-tight">{stats?.total_assessments || 0}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-xs text-green-600 font-medium">{stats?.assessment_completed_count || 0} Completed</span>
                  {stats?.assessment_average_score !== null && stats?.assessment_average_score !== undefined && (
                    <>
                      <span className="text-xs text-gray-300">|</span>
                      <span className="text-xs text-brand-blue font-medium">Avg: {stats.assessment_average_score}%</span>
                    </>
                  )}
                </div>
              </div>
              <div className="w-12 h-12 bg-brand-orange/10 ring-1 ring-brand-orange/15 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm shadow-brand-orange/10">
                <Award className="w-6 h-6 text-brand-orange-deep" />
              </div>
            </div>
          </div>
        )}
      </div>
      )}

      {/* JD02A: Subscription Units */}
      {false && subscriptionUnits && (
        <div className="mb-8">
          <div className="flex items-center gap-2.5 mb-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15">
              <Layers className="w-4 h-4 text-brand-blue" />
            </span>
            <h2 className="text-lg font-semibold text-gray-900">Available Units</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
            {/* Resume Upload Units */}
            {subscriptionUnits.RU && hasPlanFeature('resume_upload') && (
              <div
                className="group cursor-pointer bg-white rounded-2xl shadow-sm shadow-brand-blue/5 border border-gray-100 ring-1 ring-black/[0.02] p-4 hover:shadow-md hover:shadow-brand-blue/10 hover:border-brand-blue/30 hover:-translate-y-0.5 transition-all"
                onClick={() => router.push('/recruitment/my-resumes')}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Upload className="w-5 h-5 text-brand-blue" />
                  </div>
                </div>
                <p className="text-sm text-gray-600 whitespace-nowrap">Resume Storage</p>
                <p className="text-xl font-bold text-gray-900 tracking-tight">
                  {subscriptionUnits.RU.is_unlimited ? 'Unlimited' : subscriptionUnits.RU.available}
                </p>
                {!subscriptionUnits.RU.is_unlimited && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>{subscriptionUnits.RU.used} / {subscriptionUnits.RU.limit} used</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-1.5 rounded-full transition-all ${subscriptionUnits.RU.percentage_used > 80 ? 'bg-red-500' : subscriptionUnits.RU.percentage_used > 50 ? 'bg-brand-orange' : 'bg-brand-blue'}`}
                        style={{ width: `${Math.min(subscriptionUnits.RU.percentage_used, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Resume Scoring Units */}
            {subscriptionUnits.RS && hasPlanFeature('resume_scoring') && (
              <div
                className="group cursor-pointer bg-white rounded-2xl shadow-sm shadow-brand-blue/5 border border-gray-100 ring-1 ring-black/[0.02] p-4 hover:shadow-md hover:shadow-brand-cyan/10 hover:border-brand-cyan/30 hover:-translate-y-0.5 transition-all"
                onClick={() => router.push('/recruitment/resume-scoring')}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-brand-cyan/10 ring-1 ring-brand-cyan/15 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Zap className="w-5 h-5 text-brand-cyan" />
                  </div>
                </div>
                <p className="text-sm text-gray-600 whitespace-nowrap">Resume Scoring</p>
                <p className="text-xl font-bold text-gray-900 tracking-tight">
                  {subscriptionUnits.RS.is_unlimited ? 'Unlimited' : subscriptionUnits.RS.available}
                </p>
                {!subscriptionUnits.RS.is_unlimited && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>{subscriptionUnits.RS.used} / {subscriptionUnits.RS.limit} used</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-1.5 rounded-full transition-all ${subscriptionUnits.RS.percentage_used > 80 ? 'bg-red-500' : subscriptionUnits.RS.percentage_used > 50 ? 'bg-brand-orange' : 'bg-brand-cyan'}`}
                        style={{ width: `${Math.min(subscriptionUnits.RS.percentage_used, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Assessment Units */}
            {subscriptionUnits.AS && hasPlanFeature('assessment') && (
              <div
                className="group cursor-pointer bg-white rounded-2xl shadow-sm shadow-brand-blue/5 border border-gray-100 ring-1 ring-black/[0.02] p-4 hover:shadow-md hover:shadow-brand-orange/10 hover:border-brand-orange/30 hover:-translate-y-0.5 transition-all"
                onClick={() => router.push('/recruitment/assessments')}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-brand-orange/10 ring-1 ring-brand-orange/15 rounded-xl flex items-center justify-center flex-shrink-0">
                    <ClipboardCheck className="w-5 h-5 text-brand-orange-deep" />
                  </div>
                </div>
                <p className="text-sm text-gray-600 whitespace-nowrap">Assessment</p>
                <p className="text-xl font-bold text-gray-900 tracking-tight">
                  {subscriptionUnits.AS.is_unlimited ? 'Unlimited' : subscriptionUnits.AS.available}
                </p>
                {!subscriptionUnits.AS.is_unlimited && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>{subscriptionUnits.AS.used} / {subscriptionUnits.AS.limit} used</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-1.5 rounded-full transition-all ${subscriptionUnits.AS.percentage_used > 80 ? 'bg-red-500' : subscriptionUnits.AS.percentage_used > 50 ? 'bg-yellow-500' : 'bg-brand-orange'}`}
                        style={{ width: `${Math.min(subscriptionUnits.AS.percentage_used, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* AI Interview Units */}
            {subscriptionUnits.AIU && hasPlanFeature('ai_interview') && (
              <div
                className="group cursor-pointer bg-white rounded-2xl shadow-sm shadow-brand-blue/5 border border-gray-100 ring-1 ring-black/[0.02] p-4 hover:shadow-md hover:shadow-brand-blue/10 hover:border-brand-blue-2/30 hover:-translate-y-0.5 transition-all"
                onClick={() => router.push('/recruitment/ai-interviews')}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-gradient-to-br from-brand-blue-2/15 to-brand-blue/10 ring-1 ring-brand-blue-2/15 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Video className="w-5 h-5 text-brand-blue-2" />
                  </div>
                </div>
                <p className="text-sm text-gray-600 whitespace-nowrap">AI Interview</p>
                <p className="text-xl font-bold text-gray-900 tracking-tight">
                  {subscriptionUnits.AIU.is_unlimited ? 'Unlimited' : subscriptionUnits.AIU.available}
                </p>
                {!subscriptionUnits.AIU.is_unlimited && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>{subscriptionUnits.AIU.used} / {subscriptionUnits.AIU.limit} used</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-1.5 rounded-full transition-all ${subscriptionUnits.AIU.percentage_used > 80 ? 'bg-red-500' : subscriptionUnits.AIU.percentage_used > 50 ? 'bg-brand-orange' : 'bg-brand-blue'}`}
                        style={{ width: `${Math.min(subscriptionUnits.AIU.percentage_used, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Max Users */}
            {subscriptionUnits.max_seats && (
              <div
                className={`group bg-white rounded-2xl shadow-sm shadow-brand-blue/5 border border-gray-100 ring-1 ring-black/[0.02] p-4 hover:shadow-md hover:shadow-brand-teal/10 hover:border-brand-teal/30 transition-all ${canManageUsers ? 'cursor-pointer hover:-translate-y-0.5' : ''}`}
                onClick={() => canManageUsers && onNavigateToUsers?.()}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-brand-teal/10 ring-1 ring-brand-teal/15 rounded-xl flex items-center justify-center flex-shrink-0">
                    <UserCheck className="w-5 h-5 text-brand-teal" />
                  </div>
                </div>
                <p className="text-sm text-gray-600 whitespace-nowrap">Max Users</p>
                <p className="text-xl font-bold text-gray-900 tracking-tight">
                  {subscriptionUnits.max_seats.is_unlimited ? 'Unlimited' : subscriptionUnits.max_seats.available}
                </p>
                {!subscriptionUnits.max_seats.is_unlimited && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>{subscriptionUnits.max_seats.used} / {subscriptionUnits.max_seats.limit} used</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-1.5 rounded-full transition-all ${subscriptionUnits.max_seats.percentage_used > 80 ? 'bg-red-500' : subscriptionUnits.max_seats.percentage_used > 50 ? 'bg-brand-orange' : 'bg-brand-teal'}`}
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
          <div className="bg-white rounded-2xl shadow-sm shadow-brand-blue/5 border border-gray-100 ring-1 ring-black/[0.02] p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="flex items-center gap-2.5 text-base sm:text-lg font-semibold text-gray-900">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15">
                  <Briefcase className="w-4 h-4 text-brand-blue" />
                </span>
                Recent JD Activity
              </h2>
            </div>
            <div className="space-y-3">
              {filteredJdRecentActivity.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-start sm:items-center justify-between gap-2 p-3 bg-gray-50 rounded-xl border border-gray-100 hover:border-brand-blue/20 hover:shadow-sm hover:shadow-brand-blue/5 transition-all"
                >
                  <div className="flex items-start sm:items-center gap-3 min-w-0">
                    <div className="w-8 h-8 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-full flex items-center justify-center flex-shrink-0">
                      <Briefcase className="w-4 h-4 text-brand-blue" />
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
        <div className="bg-white rounded-2xl shadow-sm shadow-brand-blue/5 border border-gray-100 ring-1 ring-black/[0.02] p-4 sm:p-6">
          <h2 className="flex items-center gap-2.5 text-base sm:text-lg font-semibold text-gray-900 mb-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-cyan/15 ring-1 ring-brand-cyan/20">
              <Sparkles className="w-4 h-4 text-brand-teal" />
            </span>
            Quick Actions
          </h2>
          <div className="space-y-3">
            <button
              onClick={() => router.push('/recruitment/jd-creation')}
              className="group w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gradient-to-r from-white to-brand-blue/[0.02] hover:bg-brand-blue/[0.04] hover:border-brand-blue/30 hover:shadow-sm hover:shadow-brand-blue/10 transition-all"
            >
              <div className="w-10 h-10 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-xl flex items-center justify-center group-hover:bg-brand-blue/15 transition-colors">
                <Briefcase className="w-5 h-5 text-brand-blue" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-gray-900">Create New Job</p>
                <p className="text-xs text-gray-500">Post a new job opening</p>
              </div>
            </button>

            {hasPlanFeature('resume_scoring') && (
              <button
                onClick={() => router.push('/recruitment/resume-scoring')}
                className="group w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gradient-to-r from-white to-brand-teal/[0.02] hover:bg-brand-teal/[0.04] hover:border-brand-teal/30 hover:shadow-sm hover:shadow-brand-teal/10 transition-all"
              >
                <div className="w-10 h-10 bg-brand-teal/10 ring-1 ring-brand-teal/15 rounded-xl flex items-center justify-center group-hover:bg-brand-teal/15 transition-colors">
                  <Zap className="w-5 h-5 text-brand-teal" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-gray-900">Resume Scoring</p>
                  <p className="text-xs text-gray-500">Review and score candidate resumes</p>
                </div>
              </button>
            )}

            {hasPlanFeature('assessment') && (
              <button
                onClick={() => router.push('/recruitment/assessments')}
                className="group w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gradient-to-r from-white to-brand-orange/[0.02] hover:bg-brand-orange/[0.04] hover:border-brand-orange/30 hover:shadow-sm hover:shadow-brand-orange/10 transition-all"
              >
                <div className="w-10 h-10 bg-brand-orange/10 ring-1 ring-brand-orange/15 rounded-xl flex items-center justify-center group-hover:bg-brand-orange/15 transition-colors">
                  <ClipboardCheck className="w-5 h-5 text-brand-orange-deep" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-gray-900">Assessment</p>
                  <p className="text-xs text-gray-500">Create and manage candidate assessments</p>
                </div>
              </button>
            )}

            {hasPlanFeature('ai_interview') && (
              <button
                onClick={() => router.push('/recruitment/ai-interviews')}
                className="group w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gradient-to-r from-white to-brand-blue/[0.02] hover:bg-brand-blue/[0.04] hover:border-brand-blue/30 hover:shadow-sm hover:shadow-brand-blue/10 transition-all"
              >
                <div className="w-10 h-10 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-xl flex items-center justify-center group-hover:bg-brand-blue/15 transition-colors">
                  <Video className="w-5 h-5 text-brand-blue" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-gray-900">AI Interview</p>
                  <p className="text-xs text-gray-500">Launch and monitor interview workflows</p>
                </div>
              </button>
            )}

            <button
              onClick={onNavigateToTenants}
              className="group w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gradient-to-r from-white to-brand-cyan/[0.02] hover:bg-brand-cyan/[0.04] hover:border-brand-cyan/30 hover:shadow-sm hover:shadow-brand-cyan/10 transition-all"
            >
              <div className="w-10 h-10 bg-brand-cyan/10 ring-1 ring-brand-cyan/15 rounded-xl flex items-center justify-center group-hover:bg-brand-cyan/15 transition-colors">
                <Building2 className="w-5 h-5 text-brand-cyan" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-gray-900">Manage Team</p>
                <p className="text-xs text-gray-500">Add or edit team members</p>
              </div>
            </button>

            <button
              onClick={onNavigateToUsers}
              className="group w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gradient-to-r from-white to-brand-teal/[0.02] hover:bg-brand-teal/[0.04] hover:border-brand-teal/30 hover:shadow-sm hover:shadow-brand-teal/10 transition-all"
            >
              <div className="w-10 h-10 bg-brand-teal/10 ring-1 ring-brand-teal/15 rounded-xl flex items-center justify-center group-hover:bg-brand-teal/15 transition-colors">
                <Users className="w-5 h-5 text-brand-teal" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-gray-900">Manage Users</p>
                <p className="text-xs text-gray-500">Add users & permissions</p>
              </div>
            </button>

            <button
              onClick={onNavigateToSettings}
              className="group w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gradient-to-r from-white to-brand-orange/[0.02] hover:bg-brand-orange/[0.04] hover:border-brand-orange/30 hover:shadow-sm hover:shadow-brand-orange/10 transition-all"
            >
              <div className="w-10 h-10 bg-brand-orange/10 ring-1 ring-brand-orange/15 rounded-xl flex items-center justify-center group-hover:bg-brand-orange/15 transition-colors">
                <Settings className="w-5 h-5 text-brand-orange-deep" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-gray-900">Settings</p>
                <p className="text-xs text-gray-500">System configuration</p>
              </div>
            </button>
          </div>
        </div>

        {/* Recent Activity - Last 24 hours only, max 10 items - Feed View */}
        <div className="bg-white rounded-2xl shadow-sm shadow-brand-blue/5 border border-gray-100 ring-1 ring-black/[0.02] md:col-span-2 overflow-hidden">
          <div className="flex items-start justify-between gap-4 px-4 sm:px-6 py-4 border-b border-gray-100 bg-gray-50">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2.5 text-base sm:text-lg font-semibold text-gray-900">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15">
                  <Activity className="w-4 h-4 text-brand-blue" />
                </span>
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
              <span className="inline-flex items-center rounded-full border border-brand-cyan/20 bg-white px-2.5 py-1 text-xs font-medium text-brand-blue shadow-sm">
                Last 24 hours
              </span>
            </div>
          </div>

          {filteredRecentActivity.length > 0 ? (
            <ul className="divide-y divide-gray-100 max-h-[28rem] overflow-y-auto scrollbar-auto-hide">
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
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/15 pl-0.5 pr-2 py-0.5 text-[11px] font-medium text-brand-blue">
                              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-brand-blue text-[9px] font-semibold text-white shadow-sm">
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
              <div className="mx-auto h-12 w-12 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center mb-3">
                <Activity className="w-6 h-6 text-brand-blue" />
              </div>
              <p className="text-sm font-medium text-gray-900">No activity in the last 24 hours</p>
              <p className="text-xs text-gray-500 mt-1">New actions will appear here as your team works</p>
            </div>
          )}
        </div>
      </div>

      </div>
    </main>
  );
}
