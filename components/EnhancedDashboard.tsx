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
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { jdService, JDResponse } from '@/lib/services/jdService';
import { resumeService } from '@/lib/services/resumeService';
import { toast } from 'sonner';
import { User, Tenant } from '@/lib/types/tenant';

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

  // Refs to prevent duplicate API calls
  const hasFetchedDashboardData = useRef(false);
  const hasFetchedQuotaStatus = useRef(false);

  // Permission checks
  const isTenantAdmin = user?.role === 'tenant_admin';
  const canCreateJD = isTenantAdmin || user?.permissions?.canCreateJD;
  const canUploadResumes = isTenantAdmin || user?.permissions?.canUploadResumes;
  const canViewResumes = isTenantAdmin || user?.permissions?.canViewResumes;


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
        // Fetch published JDs (filtered by logged-in user)
        const publishedResponse = await jdService.list({
          status: 'published',
          page_size: 5,
          page: 1,
          source: 'my-jds',
        });
        if (controller.signal.aborted) return;
        setPublishedJDs(publishedResponse.items || []);

        // Fetch draft JDs (filtered by logged-in user)
        const draftResponse = await jdService.list({
          status: 'draft',
          page_size: 5,
          page: 1,
          source: 'my-jds',
        });
        if (controller.signal.aborted) return;
        setDraftJDs(draftResponse.items || []);

        // Fetch all JDs for stats and status counts (fetch multiple pages if needed, filtered by user)
        let allJDs: JDResponse[] = [];
        let currentPage = 1;
        let hasMore = true;

        while (hasMore) {
          const response = await jdService.list({
            page_size: 100,
            page: currentPage,
            source: 'my-jds',
          });
          if (controller.signal.aborted) return;

          allJDs = [...allJDs, ...response.items];

          // Check if there are more pages
          if (currentPage >= response.total_pages) {
            hasMore = false;
          } else {
            currentPage++;
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

        // Fetch total resume count from resume API
        let totalResumes = 0;
        try {
          const resumeResponse = await resumeService.list({
            page_size: 1,
            page: 1,
          });
          if (controller.signal.aborted) return;
          totalResumes = resumeResponse.total || 0;
        } catch (resumeError) {
          console.error('Failed to fetch resume count:', resumeError);
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
              const addonRemaining = addon.remaining || 0;
              const baseLimit = isUnlimited ? -1 : (sub.limit || 0);
              const limit = isUnlimited ? -1 : (baseLimit + addonRemaining);
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
        if (!controller.signal.aborted) {
          setLoadingQuota(false);
        }
      }
    };

    fetchQuotaStatus();

    return () => {
      controller.abort();
    };
  }, [user?.id]);

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
    <div className="space-y-6 p-8 bg-gray-50">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
          <p className="text-gray-600">
            Welcome back, {user?.name?.split(' ')[0] || 'there'}! Here's what's happening with your recruitment pipeline.
          </p>
        </div>
      </div>

      {/* JD Status Boxes */}
      <Card className="border-gray-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold text-gray-900">Job Description Status</CardTitle>
              <CardDescription className="text-gray-600">
                Overview of all job descriptions by status
              </CardDescription>
            </div>
            {canCreateJD && (
              <Button
                onClick={() => router.push('/recruitment/jd-creation')}
                className="bg-gray-800 hover:bg-gray-900"
              >
                <Briefcase className="mr-2 h-4 w-4" />
                Create Job
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            {/* Published JDs */}
            <div
              className="p-4 rounded-lg border-2 border-green-200 bg-green-50 hover:border-green-300 transition-all cursor-pointer"
              onClick={() => router.push('/recruitment/job-openings?status=published')}
            >
              <div className="text-4xl font-bold text-green-600 mb-2">
                {jdStatusCounts.published}
              </div>
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-green-100 rounded-lg">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-900">Published</h3>
                  <p className="text-xs text-gray-600">Active job postings</p>
                </div>
              </div>
            </div>

            {/* Draft JDs */}
            <div
              className="p-4 rounded-lg border-2 border-yellow-200 bg-yellow-50 hover:border-yellow-300 transition-all cursor-pointer"
              onClick={() => router.push('/recruitment/job-openings?status=draft')}
            >
              <div className="text-4xl font-bold text-yellow-600 mb-2">
                {jdStatusCounts.draft}
              </div>
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-yellow-100 rounded-lg">
                  <Edit2 className="h-4 w-4 text-yellow-600" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-900">Draft</h3>
                  <p className="text-xs text-gray-600">Incomplete postings</p>
                </div>
              </div>
            </div>

            {/* Disabled JDs */}
            <div
              className="p-4 rounded-lg border-2 border-red-200 bg-red-50 hover:border-red-300 transition-all cursor-pointer"
              onClick={() => router.push('/recruitment/job-openings?status=disabled')}
            >
              <div className="text-4xl font-bold text-red-600 mb-2">
                {jdStatusCounts.disabled}
              </div>
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-red-100 rounded-lg">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-900">Disabled</h3>
                  <p className="text-xs text-gray-600">Temporarily hidden</p>
                </div>
              </div>
            </div>

            {/* Archived JDs */}
            <div
              className="p-4 rounded-lg border-2 border-gray-200 bg-gray-50 hover:border-gray-300 transition-all cursor-pointer"
              onClick={() => router.push('/recruitment/job-openings?status=archived')}
            >
              <div className="text-4xl font-bold text-gray-600 mb-2">
                {jdStatusCounts.archived}
              </div>
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-gray-100 rounded-lg">
                  <Archive className="h-4 w-4 text-gray-600" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-900">Archived</h3>
                  <p className="text-xs text-gray-600">Closed postings</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Plan Quotas & Usage */}
      <Card className="border-gray-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold text-gray-900">
                {quotaStatusData?.plan_name || 'Current Plan'} - Quotas & Usage
              </CardTitle>
              <CardDescription className="text-gray-600">
                Monitor your plan limits and current usage
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/subscription/current-plan')}
            >
              Upgrade Plan
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingQuota ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-600">Loading quota data...</span>
            </div>
          ) : quotaStatusData?.quotas && quotaStatusData.quotas.length > 0 ? (
            <div className="grid grid-cols-4 gap-4">
              {quotaStatusData.quotas.slice(0, 4).map((quota) => {
                const isUnlimited = quota.limit === -1;
                const progressColor = quota.is_exhausted
                  ? 'bg-red-600'
                  : quota.is_low
                  ? 'bg-yellow-600'
                  : 'bg-green-600';

                return (
                  <div key={quota.quota_type} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">{quota.name}</span>
                      <span className="font-medium text-gray-900">
                        {isUnlimited
                          ? 'Unlimited'
                          : `${quota.used} / ${quota.limit}`}
                      </span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${progressColor} transition-all`}
                        style={{
                          width: isUnlimited
                            ? '100%'
                            : `${Math.min(quota.percentage_used, 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-600">
              No quota data available
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Published Jobs */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              <Briefcase className="h-5 w-5 text-gray-600" />
              Published Jobs
            </CardTitle>
            <CardDescription className="text-gray-600">
              Active job postings accepting applications
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingJDs ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : publishedJDs.length === 0 ? (
              <div className="text-center py-8">
                <Briefcase className="h-10 w-10 text-gray-400 mx-auto mb-3" />
                <p className="text-sm text-gray-600">No published jobs yet</p>
                {canCreateJD && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
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
                    className="flex items-start justify-between p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer"
                    onClick={() => handleViewJobDetails(jd)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {jd.job_id && (
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium border border-blue-200">
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
                      className="ml-2"
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
                className="mt-4 w-full"
                onClick={() => router.push('/recruitment/job-openings?status=published')}
              >
                View all published jobs
                <ArrowUpRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Draft Jobs */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              <FileText className="h-5 w-5 text-gray-600" />
              Draft Jobs
            </CardTitle>
            <CardDescription className="text-gray-600">
              Incomplete job postings waiting to be published
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingJDs ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : draftJDs.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="h-10 w-10 text-gray-400 mx-auto mb-3" />
                <p className="text-sm text-gray-600">No drafts saved</p>
              </div>
            ) : (
              <div className="space-y-3">
                {draftJDs.map((jd) => (
                  <div
                    key={jd.id}
                    className="flex items-start justify-between p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {jd.job_id && (
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium border border-blue-200">
                            {jd.job_id}
                          </span>
                        )}
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {jd.title || 'Untitled Draft'}
                        </p>
                        <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100">
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
                            {new Date(jd.created_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewJobDetails(jd)}
                      className="ml-2"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {draftJDs.length > 0 && (
              <Button
                variant="ghost"
                className="mt-4 w-full"
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
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-gray-900">Quick Actions</CardTitle>
            <CardDescription className="text-gray-600">Common tasks to get you started</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              {canCreateJD && (
                <Button
                  variant="outline"
                  className="h-auto flex-col gap-2 py-4 border-gray-200 hover:border-gray-300"
                  onClick={() => router.push('/recruitment/jd-creation')}
                >
                  <Briefcase className="h-6 w-6 text-gray-600" />
                  <span className="text-sm text-gray-900">Create Job</span>
                </Button>
              )}
              {canUploadResumes && (
                <Button
                  variant="outline"
                  className="h-auto flex-col gap-2 py-4 border-gray-200 hover:border-gray-300"
                  onClick={() => router.push('/recruitment/my-resumes')}
                >
                  <FileText className="h-6 w-6 text-gray-600" />
                  <span className="text-sm text-gray-900">Upload Resumes</span>
                </Button>
              )}
              {canViewResumes && (
                <Button
                  variant="outline"
                  className="h-auto flex-col gap-2 py-4 border-gray-200 hover:border-gray-300"
                  onClick={() => router.push('/recruitment/resume-scoring')}
                >
                  <Target className="h-6 w-6 text-gray-600" />
                  <span className="text-sm text-gray-900">Score Resumes</span>
                </Button>
              )}
              {canViewResumes && (
                <Button
                  variant="outline"
                  className="h-auto flex-col gap-2 py-4 border-gray-200 hover:border-gray-300"
                  onClick={() => router.push('/recruitment/ai-talent-match')}
                >
                  <Sparkles className="h-6 w-6 text-gray-600" />
                  <span className="text-sm text-gray-900">AI Talent Match</span>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
