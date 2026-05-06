'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Briefcase,
  Users,
  FileText,
  ArrowUpRight,
  Target,
  CheckCircle,
  AlertCircle,
  Calendar,
  Loader2,
  Sparkles,
  MapPin,
  Building2,
  Edit2,
  Archive,
  Clock,
  LogIn,
  LogOut,
  Upload,
  Star,
  Activity,
  TrendingUp,
  BarChart3,
} from 'lucide-react';
import { useState, useEffect, useRef, useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  Cell,
} from 'recharts';
import { useRouter } from 'next/navigation';
import { jdService, JDResponse } from '@/lib/services/jdService';
import { resumeService } from '@/lib/services/resumeService';
import { dashboardService, RecentActivity } from '@/lib/services/dashboardService';
import { toast } from 'sonner';
import { User, Tenant } from '@/lib/types/tenant';
import WelcomeBanner from '@/components/dashboard/WelcomeBanner';
import { useAuth } from '@/lib/hooks/useAuth';
import { formatIST, formatISTDate } from '@/lib/utils/dateUtils';

// Module-level cache to prevent duplicate API calls across remounts
const dashboardCache = {
  dashboardFetched: false,
  quotaFetched: false,
  dashboardData: null as any,
  quotaData: null as any,
};

interface EnhancedDashboardProps {
  user?: User;
  tenant?: Tenant;
}

interface DashboardStats {
  activeJobs: number;
  totalCandidates: number;
  resumesScored: number;
  assessmentsCompleted: number;
}

interface JDStatusCounts {
  published: number;
  draft: number;
  disabled: number;
  archived: number;
}

interface QuotaInfo {
  quota_type: string;
  name: string;
  limit: number;
  used: number;
  remaining: number;
  percentage_used: number;
  is_low: boolean;
  is_exhausted: boolean;
}

interface QuotaStatusData {
  plan_name: string;
  billing_period?: {
    start: string;
    end: string;
  };
  quotas: QuotaInfo[];
}

export default function EnhancedDashboard({ user, tenant }: EnhancedDashboardProps) {
  const router = useRouter();
  const { hasPermission, isTenantAdmin: isTenantAdminRole } = useAuth();
  const [publishedJDs, setPublishedJDs] = useState<JDResponse[]>([]);
  const [draftJDs, setDraftJDs] = useState<JDResponse[]>([]);
  const [loadingJDs, setLoadingJDs] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    activeJobs: 0,
    totalCandidates: 0,
    resumesScored: 0,
    assessmentsCompleted: 0,
  });
  const [jdStatusCounts, setJdStatusCounts] = useState<JDStatusCounts>({
    published: 0,
    draft: 0,
    disabled: 0,
    archived: 0,
  });
  const [quotaStatusData, setQuotaStatusData] = useState<QuotaStatusData | null>(null);
  const [loadingQuota, setLoadingQuota] = useState(true);
  const [userActivity, setUserActivity] = useState<RecentActivity[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(true);

  // Refs to prevent duplicate API calls
  const hasFetchedDashboardData = useRef(false);
  const hasFetchedQuotaStatus = useRef(false);
  const hasFetchedActivity = useRef(false);

  // Permission checks
  const canCreateJD = hasPermission('canCreateJD') || isTenantAdminRole;
  const canUpdateJD = hasPermission('canUpdateJD') || isTenantAdminRole;
  const canUploadResumes = hasPermission('canUploadResumes') || isTenantAdminRole;
  const canViewResumes = hasPermission('canViewResumes') || isTenantAdminRole;


  // Fetch JDs and calculate stats
  useEffect(() => {
    // Skip if already fetched (check both ref and module cache)
    if (hasFetchedDashboardData.current || dashboardCache.dashboardFetched) {
      // Restore from cache if available
      if (dashboardCache.dashboardData) {
        setPublishedJDs(dashboardCache.dashboardData.publishedJDs || []);
        setDraftJDs(dashboardCache.dashboardData.draftJDs || []);
        setJdStatusCounts(dashboardCache.dashboardData.jdStatusCounts || { published: 0, draft: 0, disabled: 0, archived: 0 });
        setStats(dashboardCache.dashboardData.stats || { activeJobs: 0, totalCandidates: 0, resumesScored: 0, assessmentsCompleted: 0 });
        setLoadingJDs(false);
      }
      return;
    }

    const controller = new AbortController();

    const fetchDashboardData = async () => {
      // Double-check before making API calls
      if (hasFetchedDashboardData.current || dashboardCache.dashboardFetched) return;
      hasFetchedDashboardData.current = true;
      dashboardCache.dashboardFetched = true;

      setLoadingJDs(true);
      try {
        // Kick off the independent, bounded fetches in parallel:
        //   - preview lists (published/draft top 5)
        //   - first page of all JDs for aggregation
        //   - resume total count
        // The remaining JD pages (if any) are fetched after, but capped to avoid runaway loops.
        const FIRST_PAGE_SIZE = 100;
        const MAX_JD_PAGES = 10; // hard cap: never fetch more than 1000 JDs on the dashboard

        const [publishedResult, draftResult, firstPageResult, resumeResult] =
          await Promise.allSettled([
            jdService.list({ status: 'published', page_size: 5, page: 1, source: 'my-jds' }),
            jdService.list({ status: 'draft', page_size: 5, page: 1, source: 'my-jds' }),
            jdService.list({ page_size: FIRST_PAGE_SIZE, page: 1, source: 'my-jds' }),
            resumeService.list({ page_size: 1, page: 1 }),
          ]);
        if (controller.signal.aborted) return;

        const publishedResponse =
          publishedResult.status === 'fulfilled'
            ? publishedResult.value
            : { items: [], total: 0, page: 1, page_size: 5, total_pages: 0 };
        const draftResponse =
          draftResult.status === 'fulfilled'
            ? draftResult.value
            : { items: [], total: 0, page: 1, page_size: 5, total_pages: 0 };

        setPublishedJDs(publishedResponse.items || []);
        setDraftJDs(draftResponse.items || []);

        let allJDs: JDResponse[] = [];
        let totalPages = 0;
        if (firstPageResult.status === 'fulfilled') {
          allJDs = [...firstPageResult.value.items];
          totalPages = firstPageResult.value.total_pages || 0;
        } else {
          console.error('Failed to fetch JDs first page:', firstPageResult.reason);
        }

        // Fetch any remaining pages in parallel, capped at MAX_JD_PAGES total.
        const lastPage = Math.min(totalPages, MAX_JD_PAGES);
        if (lastPage > 1) {
          const remainingPages = [];
          for (let p = 2; p <= lastPage; p++) {
            remainingPages.push(
              jdService.list({ page_size: FIRST_PAGE_SIZE, page: p, source: 'my-jds' })
            );
          }
          const rest = await Promise.allSettled(remainingPages);
          if (controller.signal.aborted) return;
          for (const r of rest) {
            if (r.status === 'fulfilled') allJDs = allJDs.concat(r.value.items);
          }
        }

        // Calculate JD status counts
        const statusCounts = {
          published: 0,
          draft: 0,
          disabled: 0,
          archived: 0,
        };

        allJDs.forEach((jd) => {
          const status = jd.status?.toLowerCase();
          if (status === 'published') statusCounts.published++;
          else if (status === 'draft') statusCounts.draft++;
          else if (status === 'disabled') statusCounts.disabled++;
          else if (status === 'archived') statusCounts.archived++;
        });

        setJdStatusCounts(statusCounts);

        // Calculate total scored resumes
        const totalScored = allJDs.reduce(
          (sum, jd) => sum + (jd.scored_resumes_count || 0),
          0
        );

        // Calculate total assessments
        const totalAssessments = allJDs.reduce(
          (sum, jd) => sum + (jd.assessments_count || 0),
          0
        );

        const totalResumes =
          resumeResult.status === 'fulfilled' ? resumeResult.value.total || 0 : 0;
        if (resumeResult.status === 'rejected') {
          console.error('Failed to fetch resume count:', resumeResult.reason);
        }

        const newStats = {
          activeJobs: statusCounts.published,
          totalCandidates: totalResumes,
          resumesScored: totalScored,
          assessmentsCompleted: totalAssessments,
        };
        setStats(newStats);

        // Save to cache
        dashboardCache.dashboardData = {
          publishedJDs: publishedResponse.items || [],
          draftJDs: draftResponse.items || [],
          jdStatusCounts: statusCounts,
          stats: newStats,
        };
      } catch (error: any) {
        if (!controller.signal.aborted) {
          console.error('Failed to fetch dashboard data:', error);

          // Check for permission denied (403 Forbidden)
          if (error?.message?.includes('403') || error?.message?.includes('Permission') || error?.status === 403) {
            toast.error('Permission Denied: You do not have access to view dashboard data');
          } else {
            toast.error('Failed to load dashboard data');
          }
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingJDs(false);
        }
      }
    };

    fetchDashboardData();

    return () => {
      controller.abort();
    };
  }, []);

  // Fetch quota status from API - refetch when user changes
  useEffect(() => {
    // Clear cache when user changes to ensure fresh data
    if (user?.id) {
      dashboardCache.quotaFetched = false;
      dashboardCache.quotaData = null;
      hasFetchedQuotaStatus.current = false;
    }

    const controller = new AbortController();
    // Abort the quota request if it hangs for more than 15s so the dashboard never freezes.
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const fetchQuotaStatus = async () => {
      hasFetchedQuotaStatus.current = true;
      dashboardCache.quotaFetched = true;

      setLoadingQuota(true);
      try {
        const token = localStorage.getItem('accessToken');
        if (!token) {
          console.warn('[EnhancedDashboard] No access token found');
          setLoadingQuota(false);
          return;
        }

        const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

        const quotaStatusResponse = await fetch(`${API_BASE}/usage/quota-status`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        if (quotaStatusResponse.ok) {
          const responseData = await quotaStatusResponse.json();
          console.log('[EnhancedDashboard] Quota status from API:', responseData);

          const data = responseData.data || responseData;
          const quotasMap = data.quotas || {};

          // Map quota_type to display names
          const quotaTypeToModule: Record<string, string> = {
            'RU': 'Resume Storage',
            'RS': 'Resume Scoring',
            'AS': 'Assessments',
            'AIU': 'AI Interviews',
            'storage_gb': 'Storage',
            'max_jobs': 'Job Publishing Units',
            'max_seats': 'Max Users',
          };

          // Preferred order for display
          const preferredOrder = ['max_jobs', 'RU', 'AS', 'AIU'];

          // Get all quota types from API response
          const allQuotaTypes = Object.keys(quotasMap);

          // Sort: preferred order first, then any remaining
          const sortedQuotaTypes = [
            ...preferredOrder.filter(qt => allQuotaTypes.includes(qt)),
            ...allQuotaTypes.filter(qt => !preferredOrder.includes(qt))
          ];

          const quotasList: QuotaInfo[] = [];

          for (const quotaType of sortedQuotaTypes) {
            const q = quotasMap[quotaType];
            if (q) {
              const sub = q.subscription || {};
              const addon = q.addon || {};
              const isUnlimited = sub.limit === 'unlimited' || sub.limit === -1;
              const addonPurchased = addon.total_purchased || 0;
              const baseLimit = isUnlimited ? -1 : (typeof sub.limit === 'number' ? sub.limit : 0);
              const limit = isUnlimited ? -1 : (baseLimit + addonPurchased);
              const used = sub.used || 0;
              const remaining = isUnlimited ? -1 : (q.total_remaining !== undefined ? q.total_remaining : (sub.remaining || 0));
              const usagePercentage = isUnlimited ? 0 : (limit > 0 ? (used / limit) * 100 : 0);

              const status = q.status || 'OK';
              // Only consider low/exhausted if the quota has a limit > 0 (i.e., it's enabled for this plan)
              const hasQuota = limit > 0;
              const isLow = hasQuota && (status === 'WARNING' || status === 'CRITICAL' || usagePercentage >= 80);
              const isExhausted = hasQuota && (status === 'EXCEEDED' || (remaining <= 0 && !isUnlimited));

              quotasList.push({
                quota_type: quotaType,
                name: quotaTypeToModule[quotaType] || quotaType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                limit: limit,
                used: used,
                remaining: remaining,
                percentage_used: usagePercentage,
                is_low: isLow,
                is_exhausted: isExhausted,
              });
            }
          }

          if (!controller.signal.aborted) {
            const quotaData = {
              plan_name: data.plan_name || 'Current Plan',
              billing_period: data.billing_period,
              quotas: quotasList,
            };
            setQuotaStatusData(quotaData);
            // Save to cache
            dashboardCache.quotaData = quotaData;
          }
        } else {
          console.error('[EnhancedDashboard] Failed to fetch quota status:', quotaStatusResponse.status);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error('[EnhancedDashboard] Error fetching quota status:', error);
          toast.error('Failed to load quota data');
        }
      } finally {
        clearTimeout(timeoutId);
        if (!controller.signal.aborted) {
          setLoadingQuota(false);
        }
      }
    };

    fetchQuotaStatus();

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [user?.id]);

  // Fetch current user's recent activity
  useEffect(() => {
    if (hasFetchedActivity.current) return;

    const fetchUserActivity = async () => {
      hasFetchedActivity.current = true;
      setLoadingActivity(true);
      try {
        const data = await dashboardService.getDashboard();
        setUserActivity(data.user_recent_activity || []);
      } catch (error) {
        console.error('[EnhancedDashboard] Failed to fetch user activity:', error);
      } finally {
        setLoadingActivity(false);
      }
    };

    fetchUserActivity();
  }, []);

  const getActivityIcon = (action: string) => {
    if (action.includes('login')) return <LogIn className="h-4 w-4 text-brand-blue" />;
    if (action.includes('logout')) return <LogOut className="h-4 w-4 text-gray-500" />;
    if (action.includes('jd_create') || action.includes('jd_publish')) return <Briefcase className="h-4 w-4 text-green-600" />;
    if (action.includes('jd_update')) return <Edit2 className="h-4 w-4 text-brand-orange" />;
    if (action.includes('jd_archive')) return <Archive className="h-4 w-4 text-gray-500" />;
    if (action.includes('resume_upload')) return <Upload className="h-4 w-4 text-brand-cyan" />;
    if (action.includes('scoring')) return <Star className="h-4 w-4 text-brand-orange-deep" />;
    if (action.includes('assessment')) return <CheckCircle className="h-4 w-4 text-brand-teal" />;
    if (action.includes('ai_match')) return <Sparkles className="h-4 w-4 text-brand-blue-2" />;
    return <Activity className="h-4 w-4 text-gray-400" />;
  };

  const getActivityAccent = (action: string): string => {
    if (action.includes('login')) return 'bg-brand-blue/10 ring-brand-blue/15';
    if (action.includes('jd_create') || action.includes('jd_publish')) return 'bg-green-50 ring-green-100';
    if (action.includes('jd_update')) return 'bg-brand-orange/10 ring-brand-orange/15';
    if (action.includes('resume_upload')) return 'bg-brand-cyan/10 ring-brand-cyan/15';
    if (action.includes('scoring')) return 'bg-brand-orange/10 ring-brand-orange-deep/15';
    if (action.includes('assessment')) return 'bg-brand-teal/10 ring-brand-teal/15';
    if (action.includes('ai_match')) return 'bg-brand-blue-2/10 ring-brand-blue-2/15';
    return 'bg-gray-50 ring-gray-100';
  };

  // Only show activity from the last 24 hours
  const recentActivity24h = userActivity.filter((a) => {
    const ts = new Date(a.created_at).getTime();
    return !isNaN(ts) && ts >= Date.now() - 24 * 60 * 60 * 1000;
  });

  // 7-day activity trend (derived from already-fetched userActivity, no new API call)
  const activityTrend = useMemo(() => {
    const days: { date: string; label: string; count: number }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      days.push({
        date: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString('en-US', { weekday: 'short' }),
        count: 0,
      });
    }
    for (const a of userActivity) {
      const ts = new Date(a.created_at).getTime();
      if (isNaN(ts)) continue;
      const key = new Date(ts).toISOString().slice(0, 10);
      const bucket = days.find((x) => x.date === key);
      if (bucket) bucket.count += 1;
    }
    return days;
  }, [userActivity]);

  const activityTotal = activityTrend.reduce((s, d) => s + d.count, 0);

  // JD distribution by status (derived from already-fetched jdStatusCounts)
  const jdStatusBars = useMemo(
    () => [
      { name: 'Published', value: jdStatusCounts.published, fill: '#16a34a' },
      { name: 'Draft', value: jdStatusCounts.draft, fill: '#ed881c' },
      { name: 'Disabled', value: jdStatusCounts.disabled, fill: '#dc2626' },
      { name: 'Archived', value: jdStatusCounts.archived, fill: '#6b7280' },
    ],
    [jdStatusCounts],
  );
  const jdStatusTotal = jdStatusBars.reduce((s, b) => s + b.value, 0);

  const handleViewJobDetails = (jd: JDResponse) => {
    if (jd.status === 'draft') {
      const stage = jd.creation_stage || 'create';
      router.push(`/recruitment/jd-creation?id=${jd.id}&stage=${stage}`);
    } else {
      router.push(`/recruitment/job-details?id=${jd.id}`);
    }
  };

  const handleAIMatch = (jd: JDResponse) => {
    sessionStorage.setItem('preselectedJobId', jd.id);
    router.push('/recruitment/ai-talent-match');
  };

  return (
    <div className="bg-slate-50 flex-1">
      <div className="space-y-6 p-4 md:p-8">
      {/* Welcome Banner */}
      <WelcomeBanner user={user} tenant={tenant} />

      {/* JD Status Boxes */}
      <Card className="border-gray-100 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02]">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15">
                <Briefcase className="h-4.5 w-4.5 text-brand-blue" />
              </div>
              <div>
                <CardTitle className="text-lg font-semibold text-gray-900">Job Description Status</CardTitle>
                <CardDescription className="text-gray-600">
                  Overview of all job descriptions by status
                </CardDescription>
              </div>
            </div>
            {canCreateJD && (
              <Button
                onClick={() => router.push('/recruitment/jd-creation')}
                className="bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-all"
              >
                <Briefcase className="mr-2 h-4 w-4" />
                Create Job
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {/* Published JDs */}
            <div
              className="group p-4 rounded-xl border border-green-100 bg-gradient-to-br from-green-50 to-green-50/40 hover:border-green-300 hover:shadow-md hover:shadow-green-100 dark:bg-green-900/20 dark:border-green-800 dark:hover:border-green-700 transition-all cursor-pointer"
              onClick={() => router.push('/recruitment/job-openings?status=published')}
            >
              <div className="text-2xl sm:text-3xl lg:text-4xl font-bold text-green-600 dark:text-green-400 mb-1 sm:mb-2 tracking-tight">
                {jdStatusCounts.published}
              </div>
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-green-100 dark:bg-green-900/40 rounded-lg ring-1 ring-green-200/60">
                  <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Published</h3>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Active job postings</p>
                </div>
              </div>
            </div>

            {/* Draft JDs */}
            <div
              className="group p-4 rounded-xl border border-brand-orange/20 bg-gradient-to-br from-brand-orange/10 to-brand-orange/5 hover:border-brand-orange/40 hover:shadow-md hover:shadow-brand-orange/10 dark:bg-yellow-900/20 dark:border-yellow-800 dark:hover:border-yellow-700 transition-all cursor-pointer"
              onClick={() => router.push('/recruitment/job-openings?status=draft')}
            >
              <div className="text-2xl sm:text-3xl lg:text-4xl font-bold text-brand-orange-deep dark:text-yellow-400 mb-1 sm:mb-2 tracking-tight">
                {jdStatusCounts.draft}
              </div>
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-brand-orange/15 dark:bg-yellow-900/40 rounded-lg ring-1 ring-brand-orange/20">
                  <Edit2 className="h-4 w-4 text-brand-orange-deep dark:text-yellow-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Draft</h3>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Incomplete postings</p>
                </div>
              </div>
            </div>

            {/* Disabled JDs */}
            <div
              className="group p-4 rounded-xl border border-red-100 bg-gradient-to-br from-red-50 to-red-50/40 hover:border-red-300 hover:shadow-md hover:shadow-red-100 dark:bg-red-900/20 dark:border-red-800 dark:hover:border-red-700 transition-all cursor-pointer"
              onClick={() => router.push('/recruitment/job-openings?status=disabled')}
            >
              <div className="text-2xl sm:text-3xl lg:text-4xl font-bold text-red-600 dark:text-red-400 mb-1 sm:mb-2 tracking-tight">
                {jdStatusCounts.disabled}
              </div>
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-red-100 dark:bg-red-900/40 rounded-lg ring-1 ring-red-200/60">
                  <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Disabled</h3>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Temporarily hidden</p>
                </div>
              </div>
            </div>

            {/* Archived JDs */}
            <div
              className="group p-4 rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white hover:border-gray-300 hover:shadow-md hover:shadow-gray-100 dark:bg-gray-800 dark:border-gray-700 dark:hover:border-gray-600 transition-all cursor-pointer"
              onClick={() => router.push('/recruitment/job-openings?status=archived')}
            >
              <div className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-600 dark:text-gray-300 mb-1 sm:mb-2 tracking-tight">
                {jdStatusCounts.archived}
              </div>
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg ring-1 ring-gray-200/60">
                  <Archive className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Archived</h3>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Closed postings</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Insights — line + bar charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Activity trend (last 7 days) */}
        <Card className="border-gray-100 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02]">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-start gap-3">
                <span className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15">
                  <TrendingUp className="h-4 w-4 text-brand-blue" />
                </span>
                <div>
                  <CardTitle className="text-lg font-semibold text-gray-900">Activity Trend</CardTitle>
                  <CardDescription className="text-gray-600">
                    Your actions over the last 7 days
                  </CardDescription>
                </div>
              </div>
              <span className="inline-flex items-center rounded-full border border-brand-cyan/20 bg-white px-2.5 py-1 text-xs font-medium text-brand-blue shadow-sm self-start sm:self-auto">
                {activityTotal} total
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {loadingActivity ? (
              <div className="h-64 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-brand-blue" />
              </div>
            ) : activityTotal === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-center px-6">
                <div className="mx-auto h-12 w-12 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center mb-3">
                  <Activity className="h-6 w-6 text-brand-blue" />
                </div>
                <p className="text-sm font-medium text-gray-900">No activity in the last 7 days</p>
                <p className="text-xs text-gray-500 mt-1">Your daily activity will appear here</p>
              </div>
            ) : (
              <div className="h-64" aria-label="Line chart of daily activity over the last 7 days">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={activityTrend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="activityStroke" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#0e3b98" />
                        <stop offset="100%" stopColor="#079cc4" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="label"
                      stroke="#9ca3af"
                      fontSize={12}
                      tickLine={false}
                      axisLine={{ stroke: '#e5e7eb' }}
                    />
                    <YAxis
                      stroke="#9ca3af"
                      fontSize={12}
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={false}
                      width={28}
                    />
                    <ReTooltip
                      cursor={{ stroke: '#0f3c99', strokeOpacity: 0.15, strokeWidth: 2 }}
                      contentStyle={{
                        background: '#ffffff',
                        border: '1px solid #e5e7eb',
                        borderRadius: 8,
                        fontSize: 12,
                        boxShadow: '0 4px 14px -2px rgb(15 23 42 / 0.06)',
                      }}
                      labelStyle={{ color: '#0f172a', fontWeight: 600 }}
                      formatter={(v: number) => [`${v}`, 'Actions']}
                    />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="url(#activityStroke)"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: '#0f3c99', strokeWidth: 0 }}
                      activeDot={{ r: 5, fill: '#0f3c99', stroke: '#ffffff', strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Jobs by status */}
        <Card className="border-gray-100 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02]">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-start gap-3">
                <span className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg bg-brand-orange/10 ring-1 ring-brand-orange/15">
                  <BarChart3 className="h-4 w-4 text-brand-orange-deep" />
                </span>
                <div>
                  <CardTitle className="text-lg font-semibold text-gray-900">Jobs by Status</CardTitle>
                  <CardDescription className="text-gray-600">
                    Distribution of all your job descriptions
                  </CardDescription>
                </div>
              </div>
              <span className="inline-flex items-center rounded-full border border-brand-orange/20 bg-white px-2.5 py-1 text-xs font-medium text-brand-orange-deep shadow-sm self-start sm:self-auto">
                {jdStatusTotal} total
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {loadingJDs ? (
              <div className="h-64 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-brand-orange" />
              </div>
            ) : jdStatusTotal === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-center px-6">
                <div className="mx-auto h-12 w-12 rounded-full bg-brand-orange/10 ring-1 ring-brand-orange/15 flex items-center justify-center mb-3">
                  <Briefcase className="h-6 w-6 text-brand-orange-deep" />
                </div>
                <p className="text-sm font-medium text-gray-900">No jobs yet</p>
                <p className="text-xs text-gray-500 mt-1">Create your first job to see the breakdown</p>
              </div>
            ) : (
              <div className="h-64" aria-label="Bar chart of job descriptions grouped by status">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={jdStatusBars} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="name"
                      stroke="#9ca3af"
                      fontSize={12}
                      tickLine={false}
                      axisLine={{ stroke: '#e5e7eb' }}
                    />
                    <YAxis
                      stroke="#9ca3af"
                      fontSize={12}
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={false}
                      width={28}
                    />
                    <ReTooltip
                      cursor={{ fill: '#0f3c99', fillOpacity: 0.06 }}
                      contentStyle={{
                        background: '#ffffff',
                        border: '1px solid #e5e7eb',
                        borderRadius: 8,
                        fontSize: 12,
                        boxShadow: '0 4px 14px -2px rgb(15 23 42 / 0.06)',
                      }}
                      labelStyle={{ color: '#0f172a', fontWeight: 600 }}
                      formatter={(v: number) => [`${v}`, 'Jobs']}
                    />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={56}>
                      {jdStatusBars.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Published Jobs */}
        <Card className="border-gray-100 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2.5 text-lg font-semibold text-gray-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15">
                <Briefcase className="h-4 w-4 text-brand-blue" />
              </span>
              Published Jobs
            </CardTitle>
            <CardDescription className="text-gray-600">
              Active job postings accepting applications
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingJDs ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-brand-blue" />
              </div>
            ) : publishedJDs.length === 0 ? (
              <div className="text-center py-8">
                <Briefcase className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-600">No published jobs yet</p>
                {canCreateJD && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 border-brand-blue/30 text-brand-blue hover:bg-brand-blue/5 hover:border-brand-blue/50"
                    onClick={() => router.push('/recruitment/jd-creation')}
                  >
                    Create First Job
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {publishedJDs.map((jd) => (
                  <div
                    key={jd.id}
                    className="flex items-start justify-between p-3 rounded-xl border border-gray-100 hover:border-brand-blue/30 hover:bg-brand-blue/[0.02] hover:shadow-sm hover:shadow-brand-blue/5 transition-all cursor-pointer"
                    onClick={() => handleViewJobDetails(jd)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {jd.job_id && (
                          <span className="px-2 py-0.5 bg-brand-blue/10 text-brand-blue rounded text-xs font-medium border border-brand-blue/20">
                            {jd.job_id}
                          </span>
                        )}
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {jd.title || 'Untitled'}
                        </p>
                        <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                          Published
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-600">
                        {jd.department && (
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {jd.department}
                          </span>
                        )}
                        {jd.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {jd.location}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {jd.applicants_count || 0} applicants
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAIMatch(jd);
                      }}
                      className="ml-2 text-brand-orange hover:text-brand-orange-deep hover:bg-brand-orange/10"
                    >
                      <Sparkles className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {publishedJDs.length > 0 && (
              <Button
                variant="ghost"
                className="mt-4 w-full text-brand-blue hover:text-brand-blue-2 hover:bg-brand-blue/5"
                onClick={() => router.push('/recruitment/job-openings?status=published')}
              >
                View all published jobs
                <ArrowUpRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Draft Jobs */}
        <Card className="border-gray-100 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2.5 text-lg font-semibold text-gray-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-orange/10 ring-1 ring-brand-orange/15">
                <FileText className="h-4 w-4 text-brand-orange-deep" />
              </span>
              Draft Jobs
            </CardTitle>
            <CardDescription className="text-gray-600">
              Incomplete job postings waiting to be published
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingJDs ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-brand-orange" />
              </div>
            ) : draftJDs.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-600">No drafts saved</p>
              </div>
            ) : (
              <div className="space-y-3">
                {draftJDs.map((jd) => (
                  <div
                    key={jd.id}
                    className="flex items-start justify-between p-3 rounded-xl border border-gray-100 hover:border-brand-orange/30 hover:bg-brand-orange/[0.02] hover:shadow-sm hover:shadow-brand-orange/5 transition-all"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {jd.job_id && (
                          <span className="px-2 py-0.5 bg-brand-blue/10 text-brand-blue rounded text-xs font-medium border border-brand-blue/20">
                            {jd.job_id}
                          </span>
                        )}
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {jd.title || 'Untitled Draft'}
                        </p>
                        <Badge className="bg-brand-orange/15 text-brand-orange-deep hover:bg-brand-orange/15 border border-brand-orange/20">
                          Draft
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-600">
                        {jd.creation_stage && (
                          <span>Stage: {jd.creation_stage}</span>
                        )}
                        {jd.created_at && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatISTDate(jd.created_at)}
                          </span>
                        )}
                      </div>
                    </div>
                    {canUpdateJD && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewJobDetails(jd)}
                        className="ml-2 border-brand-blue/30 text-brand-blue hover:bg-brand-blue/5 hover:border-brand-blue/50"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {draftJDs.length > 0 && (
              <Button
                variant="ghost"
                className="mt-4 w-full text-brand-orange-deep hover:text-brand-orange-deep hover:bg-brand-orange/10"
                onClick={() => router.push('/recruitment/job-openings?status=draft')}
              >
                View all drafts
                <ArrowUpRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions - only show if user has at least one permission */}
      {(canCreateJD || canUploadResumes || canViewResumes) && (
        <Card className="border-gray-100 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2.5 text-lg font-semibold text-gray-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-cyan/15 ring-1 ring-brand-cyan/20">
                <Sparkles className="h-4 w-4 text-brand-teal" />
              </span>
              Quick Actions
            </CardTitle>
            <CardDescription className="text-gray-600">Common tasks to get you started</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              {canCreateJD && (
                <Button
                  variant="outline"
                  className="group h-auto flex-col gap-2 py-5 border-gray-100 bg-gradient-to-br from-white to-brand-blue/[0.02] hover:border-brand-blue/40 hover:shadow-md hover:shadow-brand-blue/10 hover:-translate-y-0.5 transition-all"
                  onClick={() => router.push('/recruitment/jd-creation')}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 group-hover:bg-brand-blue/15 transition-colors">
                    <Briefcase className="h-5 w-5 text-brand-blue" />
                  </span>
                  <span className="text-sm font-medium text-gray-900">Create Job</span>
                </Button>
              )}
              {canUploadResumes && (
                <Button
                  variant="outline"
                  className="group h-auto flex-col gap-2 py-5 border-gray-100 bg-gradient-to-br from-white to-brand-cyan/[0.03] hover:border-brand-cyan/40 hover:shadow-md hover:shadow-brand-cyan/10 hover:-translate-y-0.5 transition-all"
                  onClick={() => router.push('/recruitment/my-resumes')}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-cyan/10 ring-1 ring-brand-cyan/15 group-hover:bg-brand-cyan/15 transition-colors">
                    <FileText className="h-5 w-5 text-brand-cyan" />
                  </span>
                  <span className="text-sm font-medium text-gray-900">Upload Resumes</span>
                </Button>
              )}
              {canViewResumes && (
                <Button
                  variant="outline"
                  className="group h-auto flex-col gap-2 py-5 border-gray-100 bg-gradient-to-br from-white to-brand-teal/[0.03] hover:border-brand-teal/40 hover:shadow-md hover:shadow-brand-teal/10 hover:-translate-y-0.5 transition-all"
                  onClick={() => router.push('/recruitment/resume-scoring')}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-teal/10 ring-1 ring-brand-teal/15 group-hover:bg-brand-teal/15 transition-colors">
                    <Target className="h-5 w-5 text-brand-teal" />
                  </span>
                  <span className="text-sm font-medium text-gray-900">Score Resumes</span>
                </Button>
              )}
              {canViewResumes && (
                <Button
                  variant="outline"
                  className="group h-auto flex-col gap-2 py-5 border-gray-100 bg-gradient-to-br from-white to-brand-orange/[0.03] hover:border-brand-orange/40 hover:shadow-md hover:shadow-brand-orange/10 hover:-translate-y-0.5 transition-all"
                  onClick={() => router.push('/recruitment/ai-talent-match')}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-orange/10 ring-1 ring-brand-orange/15 group-hover:bg-brand-orange/15 transition-colors">
                    <Sparkles className="h-5 w-5 text-brand-orange-deep" />
                  </span>
                  <span className="text-sm font-medium text-gray-900">AI Talent Match</span>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Activity */}
      <Card className="border-gray-100 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] overflow-hidden">
        <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-4 border-b border-gray-100 bg-gray-50">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2.5 text-lg font-semibold text-gray-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15">
                <Clock className="h-4 w-4 text-brand-blue" />
              </span>
              Recent Activity
            </CardTitle>
            <CardDescription className="text-gray-600 mt-1">
              Your latest actions and updates
            </CardDescription>
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
        </CardHeader>
        <CardContent className="p-0">
          {loadingActivity ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-brand-blue" />
            </div>
          ) : recentActivity24h.length === 0 ? (
            <div className="text-center py-12 px-6">
              <div className="mx-auto h-12 w-12 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center mb-3">
                <Activity className="h-6 w-6 text-brand-blue" />
              </div>
              <p className="text-sm font-medium text-gray-900">No activity in the last 24 hours</p>
              <p className="text-xs text-gray-500 mt-1">Your recent actions will appear here</p>
            </div>
          ) : (
            <ul className="relative divide-y divide-gray-100 max-h-[28rem] overflow-y-auto scrollbar-auto-hide">
              {recentActivity24h.map((activity) => {
                const detail = activity.details as Record<string, any> | null;
                const detailText =
                  detail?.title ||
                  detail?.name ||
                  detail?.email ||
                  detail?.candidate_name ||
                  detail?.jd_number ||
                  activity.entity_type ||
                  '';
                const fullTime = formatIST(activity.created_at);
                return (
                  <li
                    key={activity.id}
                    className="group flex items-start gap-4 px-5 py-4 hover:bg-gray-50/70 transition-colors"
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
                          {detailText && (
                            <p className="text-xs text-gray-500 mt-0.5 truncate">
                              {detailText}
                            </p>
                          )}
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
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
