'use client';

import { useEffect, useState } from 'react';
import { Building2, Users, Settings, Activity, FileText, Briefcase, Award, Zap, ClipboardCheck, Video, Upload, UserCheck, Calendar, Shield, Layers, ArrowUpRight, Clock, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { User, Tenant } from '@/lib/types/tenant';
import { dashboardService, DashboardStats, RecentActivity, SubscriptionUnits, JDActivity } from '@/lib/services/dashboardService';
import WelcomeBanner from '@/components/dashboard/WelcomeBanner';
import { useQuota } from '@/contexts/QuotaContext';
import { useAuth } from '@/lib/hooks/useAuth';
import { usePlanLock } from '@/lib/hooks/usePlanFeature';
import PlanLockedOverlay from '@/components/shared/PlanLockedOverlay';
import { formatOverallScore } from '@/lib/utils/matchStatus';
import { Skeleton } from '@/components/ui/skeleton';

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
  const { isPlanLocked } = usePlanLock();
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
      <main className="tf-page">
        <div className="tf-page-pad w-full max-w-[1400px] mx-auto">
          {/* Welcome Banner */}
          <div className="mb-8">
            <Skeleton className="h-28 sm:h-32 w-full rounded-2xl" />
          </div>

          {/* Quick Actions & Recent Activity */}
          <div className="tf-grid-3">
            {/* Quick Actions */}
            <div className="tf-card-soft p-4 sm:p-6">
              <div className="flex items-center gap-2.5 mb-4">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <Skeleton className="h-5 w-32" />
              </div>
              <div className="space-y-3">
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100">
                    <Skeleton className="w-10 h-10 rounded-xl flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-40" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Activity */}
            <div className="tf-card-soft md:col-span-2 overflow-hidden">
              <div className="flex items-start justify-between gap-4 px-4 sm:px-6 py-4 border-b border-gray-100 bg-gray-50">
                <div className="space-y-2">
                  <div className="flex items-center gap-2.5">
                    <Skeleton className="h-8 w-8 rounded-lg" />
                    <Skeleton className="h-5 w-36" />
                  </div>
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-6 w-24 rounded-full flex-shrink-0" />
              </div>
              <ul className="divide-y divide-gray-100">
                {Array.from({ length: 6 }).map((_, i) => (
                  <li key={i} className="flex items-start gap-3 sm:gap-4 px-4 sm:px-6 py-4">
                    <Skeleton className="h-9 w-9 rounded-full flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-2">
                          <Skeleton className="h-4 w-40" />
                          <Skeleton className="h-3 w-32" />
                          <Skeleton className="h-5 w-24 rounded-full" />
                        </div>
                        <Skeleton className="h-3 w-12 flex-shrink-0" />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="tf-page">
      <div className="tf-page-pad w-full max-w-[1400px] mx-auto">
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
      <div className="tf-grid-4 mb-8">
        {/* Resumes Card - Clickable with navigation links (only if plan includes resume_upload) */}
        {<PlanLockedOverlay locked={isPlanLocked('resume_upload')}>{<div className="tf-card-soft group relative overflow-hidden p-6 hover:shadow-lg hover:shadow-brand-blue/10 hover:border-brand-blue/30 hover:-translate-y-0.5 transition-all">
          <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-brand-blue/5 blur-2xl group-hover:bg-brand-blue/10 transition-colors" />
          <div className="relative flex items-center justify-between">
            <div>
              <p className="tf-body-secondary">Total Resumes</p>
              <p className="text-3xl font-bold text-gray-900 mt-1 tracking-tight">{stats?.total_resumes || 0}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span
                  className="text-xs text-brand-blue font-medium cursor-pointer hover:underline hover:text-brand-blue-2 transition-colors"
                  onClick={() => router.push('/recruitment/resume-database?tab=my-resumes')}
                >
                  {stats?.my_resumes || 0} My Resumes
                </span>
                <span className="text-xs text-gray-300">|</span>
                <span
                  className="text-xs text-brand-cyan font-medium cursor-pointer hover:underline hover:text-brand-teal transition-colors"
                  onClick={() => router.push('/recruitment/resume-database?tab=internal-db')}
                >
                  {stats?.internal_db_resumes || 0} Shared Database
                </span>
              </div>
            </div>
            <div className="w-12 h-12 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm shadow-brand-blue/10">
              <FileText className="w-6 h-6 text-brand-blue" />
            </div>
          </div>
        </div>}</PlanLockedOverlay>}

        {/* Job Descriptions Card - Clickable with status filters */}
        <div className="tf-card-soft group relative overflow-hidden p-6 hover:shadow-lg hover:shadow-brand-cyan/10 hover:border-brand-cyan/30 hover:-translate-y-0.5 transition-all">
          <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-brand-cyan/5 blur-2xl group-hover:bg-brand-cyan/10 transition-colors" />
          <div className="relative flex items-center justify-between">
            <div>
              <p
                className="tf-card-desc cursor-pointer hover:text-brand-cyan transition-colors"
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
                  className="text-xs text-success font-medium cursor-pointer hover:underline hover:text-success transition-colors"
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
              <p className="tf-body-secondary">Total Users</p>
              <p className="text-3xl font-bold text-gray-900 mt-1 tracking-tight">{stats?.total_users || 0}</p>
              <p className="text-xs text-success font-medium mt-1">{stats?.active_users || 0} Active</p>
            </div>
            <div className="w-12 h-12 bg-brand-teal/10 ring-1 ring-brand-teal/15 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm shadow-brand-teal/10">
              <Users className="w-6 h-6 text-brand-teal" />
            </div>
          </div>
        </div>

        {/* Assessments Card - Clickable (only if plan includes assessment) */}
        {<PlanLockedOverlay locked={isPlanLocked('assessment')}>{(
          <div
            className="tf-card-soft group relative overflow-hidden p-6 cursor-pointer hover:shadow-lg hover:shadow-brand-orange/10 hover:border-brand-orange/30 hover:-translate-y-0.5 transition-all"
            onClick={() => router.push('/recruitment/assessments')}
          >
            <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-brand-orange/5 blur-2xl group-hover:bg-brand-orange/10 transition-colors" />
            <div className="relative flex items-center justify-between">
              <div>
                <p className="tf-body-secondary">Assessments</p>
                <p className="text-3xl font-bold text-gray-900 mt-1 tracking-tight">{stats?.total_assessments || 0}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-xs text-success font-medium">{stats?.assessment_completed_count || 0} Completed</span>
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
        )}</PlanLockedOverlay>}
      </div>
      )}

      {/* JD02A: Subscription Units */}
      {false && subscriptionUnits && (
        <div className="mb-8">
          <div className="flex items-center gap-2.5 mb-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15">
              <Layers className="w-4 h-4 text-brand-blue" />
            </span>
            <h2 className="tf-section-title">Available Units</h2>
          </div>
          <div className="tf-grid-stats-5">
            {/* Resume Upload Units */}
            {subscriptionUnits.RU && <PlanLockedOverlay locked={isPlanLocked('resume_upload')}>{(
              <div
                className="tf-card-soft group cursor-pointer p-4 hover:shadow-md hover:shadow-brand-blue/10 hover:border-brand-blue/30 hover:-translate-y-0.5 transition-all"
                onClick={() => router.push('/recruitment/resume-database?tab=my-resumes')}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Upload className="w-5 h-5 text-brand-blue" />
                  </div>
                </div>
                <p className="tf-body-secondary whitespace-nowrap">Resume Storage</p>
                <p className="text-xl font-bold text-gray-900 tracking-tight">
                  {subscriptionUnits.RU.is_unlimited ? 'Unlimited' : subscriptionUnits.RU.available}
                </p>
                {!subscriptionUnits.RU.is_unlimited && (
                  <div className="mt-3">
                    <div className="flex justify-between tf-meta mb-1">
                      <span>{subscriptionUnits.RU.used} / {subscriptionUnits.RU.limit} used</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-1.5 rounded-full transition-all ${subscriptionUnits.RU.percentage_used > 80 ? 'bg-destructive' : subscriptionUnits.RU.percentage_used > 50 ? 'bg-brand-orange' : 'bg-brand-blue'}`}
                        style={{ width: `${Math.min(subscriptionUnits.RU.percentage_used, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}</PlanLockedOverlay>}

            {/* Resume Scoring Units */}
            {subscriptionUnits.RS && <PlanLockedOverlay locked={isPlanLocked('resume_scoring')}>{(
              <div
                className="tf-card-soft group cursor-pointer p-4 hover:shadow-md hover:shadow-brand-cyan/10 hover:border-brand-cyan/30 hover:-translate-y-0.5 transition-all"
                onClick={() => router.push('/recruitment/resume-scoring')}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-brand-cyan/10 ring-1 ring-brand-cyan/15 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Zap className="w-5 h-5 text-brand-cyan" />
                  </div>
                </div>
                <p className="tf-body-secondary whitespace-nowrap">Resume Scoring</p>
                <p className="text-xl font-bold text-gray-900 tracking-tight">
                  {subscriptionUnits.RS.is_unlimited ? 'Unlimited' : subscriptionUnits.RS.available}
                </p>
                {!subscriptionUnits.RS.is_unlimited && (
                  <div className="mt-3">
                    <div className="flex justify-between tf-meta mb-1">
                      <span>{subscriptionUnits.RS.used} / {subscriptionUnits.RS.limit} used</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-1.5 rounded-full transition-all ${subscriptionUnits.RS.percentage_used > 80 ? 'bg-destructive' : subscriptionUnits.RS.percentage_used > 50 ? 'bg-brand-orange' : 'bg-brand-cyan'}`}
                        style={{ width: `${Math.min(subscriptionUnits.RS.percentage_used, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}</PlanLockedOverlay>}

            {/* Assessment Units */}
            {subscriptionUnits.AS && <PlanLockedOverlay locked={isPlanLocked('assessment')}>{(
              <div
                className="tf-card-soft group cursor-pointer p-4 hover:shadow-md hover:shadow-brand-orange/10 hover:border-brand-orange/30 hover:-translate-y-0.5 transition-all"
                onClick={() => router.push('/recruitment/assessments')}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-brand-orange/10 ring-1 ring-brand-orange/15 rounded-xl flex items-center justify-center flex-shrink-0">
                    <ClipboardCheck className="w-5 h-5 text-brand-orange-deep" />
                  </div>
                </div>
                <p className="tf-body-secondary whitespace-nowrap">Assessment</p>
                <p className="text-xl font-bold text-gray-900 tracking-tight">
                  {subscriptionUnits.AS.is_unlimited ? 'Unlimited' : subscriptionUnits.AS.available}
                </p>
                {!subscriptionUnits.AS.is_unlimited && (
                  <div className="mt-3">
                    <div className="flex justify-between tf-meta mb-1">
                      <span>{subscriptionUnits.AS.used} / {subscriptionUnits.AS.limit} used</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-1.5 rounded-full transition-all ${subscriptionUnits.AS.percentage_used > 80 ? 'bg-destructive' : subscriptionUnits.AS.percentage_used > 50 ? 'bg-warning' : 'bg-brand-orange'}`}
                        style={{ width: `${Math.min(subscriptionUnits.AS.percentage_used, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}</PlanLockedOverlay>}

            {/* AI Interview Units */}
            {subscriptionUnits.AIU && <PlanLockedOverlay locked={isPlanLocked('ai_interview')}>{(
              <div
                className="tf-card-soft group cursor-pointer p-4 hover:shadow-md hover:shadow-brand-blue/10 hover:border-brand-blue-2/30 hover:-translate-y-0.5 transition-all"
                onClick={() => router.push('/recruitment/ai-interviews')}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-gradient-to-br from-brand-blue-2/15 to-brand-blue/10 ring-1 ring-brand-blue-2/15 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Video className="w-5 h-5 text-brand-blue-2" />
                  </div>
                </div>
                <p className="tf-body-secondary whitespace-nowrap">AI Interview</p>
                <p className="text-xl font-bold text-gray-900 tracking-tight">
                  {subscriptionUnits.AIU.is_unlimited ? 'Unlimited' : subscriptionUnits.AIU.available}
                </p>
                {!subscriptionUnits.AIU.is_unlimited && (
                  <div className="mt-3">
                    <div className="flex justify-between tf-meta mb-1">
                      <span>{subscriptionUnits.AIU.used} / {subscriptionUnits.AIU.limit} used</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-1.5 rounded-full transition-all ${subscriptionUnits.AIU.percentage_used > 80 ? 'bg-destructive' : subscriptionUnits.AIU.percentage_used > 50 ? 'bg-brand-orange' : 'bg-brand-blue'}`}
                        style={{ width: `${Math.min(subscriptionUnits.AIU.percentage_used, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}</PlanLockedOverlay>}

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
                <p className="tf-body-secondary whitespace-nowrap">Max Users</p>
                <p className="text-xl font-bold text-gray-900 tracking-tight">
                  {subscriptionUnits.max_seats.is_unlimited ? 'Unlimited' : subscriptionUnits.max_seats.available}
                </p>
                {!subscriptionUnits.max_seats.is_unlimited && (
                  <div className="mt-3">
                    <div className="flex justify-between tf-meta mb-1">
                      <span>{subscriptionUnits.max_seats.used} / {subscriptionUnits.max_seats.limit} used</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-1.5 rounded-full transition-all ${subscriptionUnits.max_seats.percentage_used > 80 ? 'bg-destructive' : subscriptionUnits.max_seats.percentage_used > 50 ? 'bg-brand-orange' : 'bg-brand-teal'}`}
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
          <div className="tf-card-soft p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="flex items-center gap-2.5 tf-section-title sm:text-lg">
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
                      <p className="tf-row-name truncate">
                        {activity.jd_title || 'Untitled JD'}
                      </p>
                      <p className="tf-meta truncate">
                        {activity.action_display} by {activity.user_name || 'System'}
                      </p>
                    </div>
                  </div>
                  <span className="tf-hint whitespace-nowrap flex-shrink-0">{activity.time_ago}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions & Recent Activity */}
      <div className="tf-grid-3">
        {/* Quick Actions */}
        <div className="tf-card-soft p-4 sm:p-6">
          <h2 className="flex items-center gap-2.5 tf-section-title sm:text-lg mb-4">
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
                <p className="tf-row-title">Create New Job</p>
                <p className="tf-meta">Post a new job opening</p>
              </div>
            </button>

            {<PlanLockedOverlay locked={isPlanLocked('resume_scoring')}>{(
              <button
                onClick={() => router.push('/recruitment/resume-scoring?mode=new')}
                className="group w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gradient-to-r from-white to-brand-teal/[0.02] hover:bg-brand-teal/[0.04] hover:border-brand-teal/30 hover:shadow-sm hover:shadow-brand-teal/10 transition-all"
              >
                <div className="w-10 h-10 bg-brand-teal/10 ring-1 ring-brand-teal/15 rounded-xl flex items-center justify-center group-hover:bg-brand-teal/15 transition-colors">
                  <Zap className="w-5 h-5 text-brand-teal" />
                </div>
                <div className="text-left">
                  <p className="tf-row-title">Resume Scoring</p>
                  <p className="tf-meta">Review and score candidate resumes</p>
                </div>
              </button>
            )}</PlanLockedOverlay>}

            {<PlanLockedOverlay locked={isPlanLocked('assessment')}>{(
              <button
                onClick={() => router.push('/recruitment/assessments?create=true')}
                className="group w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gradient-to-r from-white to-brand-orange/[0.02] hover:bg-brand-orange/[0.04] hover:border-brand-orange/30 hover:shadow-sm hover:shadow-brand-orange/10 transition-all"
              >
                <div className="w-10 h-10 bg-brand-orange/10 ring-1 ring-brand-orange/15 rounded-xl flex items-center justify-center group-hover:bg-brand-orange/15 transition-colors">
                  <ClipboardCheck className="w-5 h-5 text-brand-orange-deep" />
                </div>
                <div className="text-left">
                  <p className="tf-row-title">Assessment</p>
                  <p className="tf-meta">Create and manage candidate assessments</p>
                </div>
              </button>
            )}</PlanLockedOverlay>}

            {<PlanLockedOverlay locked={isPlanLocked('ai_interview')}>{(
              <button
                onClick={() => router.push('/recruitment/ai-interviews/jd-selection')}
                className="group w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gradient-to-r from-white to-brand-blue/[0.02] hover:bg-brand-blue/[0.04] hover:border-brand-blue/30 hover:shadow-sm hover:shadow-brand-blue/10 transition-all"
              >
                <div className="w-10 h-10 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-xl flex items-center justify-center group-hover:bg-brand-blue/15 transition-colors">
                  <Video className="w-5 h-5 text-brand-blue" />
                </div>
                <div className="text-left">
                  <p className="tf-row-title">AI Interview</p>
                  <p className="tf-meta">Launch and monitor interview workflows</p>
                </div>
              </button>
            )}</PlanLockedOverlay>}

            <button
              onClick={onNavigateToTenants}
              className="group w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gradient-to-r from-white to-brand-cyan/[0.02] hover:bg-brand-cyan/[0.04] hover:border-brand-cyan/30 hover:shadow-sm hover:shadow-brand-cyan/10 transition-all"
            >
              <div className="w-10 h-10 bg-brand-cyan/10 ring-1 ring-brand-cyan/15 rounded-xl flex items-center justify-center group-hover:bg-brand-cyan/15 transition-colors">
                <Building2 className="w-5 h-5 text-brand-cyan" />
              </div>
              <div className="text-left">
                <p className="tf-row-title">Manage Team</p>
                <p className="tf-meta">Add or edit team members</p>
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
                <p className="tf-row-title">Manage Users</p>
                <p className="tf-meta">Add users & permissions</p>
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
                <p className="tf-row-title">Settings</p>
                <p className="tf-meta">System configuration</p>
              </div>
            </button>
          </div>
        </div>

        {/* Recent Activity - Last 24 hours only, max 10 items - Feed View */}
        <div className="tf-card-soft md:col-span-2 overflow-hidden">
          <div className="flex items-start justify-between gap-4 px-4 sm:px-6 py-4 border-b border-gray-100 bg-gray-50">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2.5 tf-section-title sm:text-lg">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15">
                  <Activity className="w-4 h-4 text-brand-blue" />
                </span>
                Recent Activity
              </h2>
              <p className="tf-body-secondary mt-0.5">
                Latest actions across your workspace
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
              </span>
              <span className="tf-badge border border-brand-cyan/20 bg-white text-brand-blue shadow-sm">
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
                    // Resume Match Rating Mechanism (client doc, Sept 2026): prefer
                    // the 0-10 Overall Rating when the audit log entry carries one.
                    const scoreDisplay = score !== undefined ? formatOverallScore(details.overall_rating_10, score) : undefined;
                    if (jdNum && candidate && scoreDisplay !== undefined) return `${jdNum} - ${candidate} (${scoreDisplay})`;
                    if (candidate && scoreDisplay !== undefined) return `${candidate} - Score: ${scoreDisplay}`;
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
                          <p className="tf-row-name truncate">
                            {activity.action_display}
                          </p>
                          {detailsDisplay && (
                            <p className="tf-meta mt-0.5 truncate">
                              {detailsDisplay}
                            </p>
                          )}
                          <div className="mt-1.5 flex items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/15 pl-0.5 pr-2 py-0.5 text-2xs font-medium text-brand-blue">
                              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-brand-blue text-2xs font-semibold text-white shadow-sm">
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
              <p className="tf-row-name">No activity in the last 24 hours</p>
              <p className="tf-meta mt-1">New actions will appear here as your team works</p>
            </div>
          )}
        </div>
      </div>

      </div>
    </main>
  );
}
