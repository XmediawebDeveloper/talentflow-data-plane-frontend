'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Briefcase,
  Users,
  FileText,
  TrendingUp,
  ArrowUpRight,
  Clock,
  Target,
  CheckCircle,
  AlertCircle,
  Calendar,
  Activity,
  Loader2,
  Sparkles,
  Video,
  MapPin,
  Building2,
  Edit2,
  Archive,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { jdService, JDResponse } from '@/lib/services/jdService';
import { resumeService } from '@/lib/services/resumeService';
import { toast } from 'sonner';
import { User, Tenant } from '@/lib/types/tenant';

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

  // Permission checks
  const isTenantAdmin = user?.role === 'tenant_admin';
  const canCreateJD = isTenantAdmin || user?.permissions?.canCreateJD;
  const canUploadResumes = isTenantAdmin || user?.permissions?.canUploadResumes;
  const canViewResumes = isTenantAdmin || user?.permissions?.canViewResumes;

  // Get usage data from tenant
  const subscription = tenant?.subscription;
  const usage = subscription?.usage;
  const limits = subscription?.limits;

  // Fetch JDs and calculate stats
  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoadingJDs(true);
      try {
        // Fetch published JDs
        const publishedResponse = await jdService.list({
          status: 'published',
          page_size: 5,
          page: 1,
        });
        setPublishedJDs(publishedResponse.items || []);

        // Fetch draft JDs
        const draftResponse = await jdService.list({
          status: 'draft',
          page_size: 5,
          page: 1,
        });
        setDraftJDs(draftResponse.items || []);

        // Fetch all JDs for stats and status counts (fetch multiple pages if needed)
        let allJDs: JDResponse[] = [];
        let currentPage = 1;
        let hasMore = true;

        while (hasMore) {
          const response = await jdService.list({
            page_size: 100,
            page: currentPage,
          });

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
          totalResumes = resumeResponse.total || 0;
        } catch (resumeError) {
          console.error('Failed to fetch resume count:', resumeError);
        }

        setStats({
          activeJobs: statusCounts.published,
          totalCandidates: totalResumes,
          resumesScored: totalScored,
          assessmentsCompleted: totalAssessments,
        });
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
        toast.error('Failed to load dashboard data');
      } finally {
        setLoadingJDs(false);
      }
    };

    fetchDashboardData();
  }, []);

  const statsCards = [
    {
      name: 'Active Jobs',
      value: stats.activeJobs.toString(),
      change: '+12%',
      changeType: 'positive' as const,
      icon: Briefcase,
    },
    {
      name: 'Total Candidates',
      value: stats.totalCandidates.toLocaleString(),
      change: '+18%',
      changeType: 'positive' as const,
      icon: Users,
    },
    {
      name: 'Resumes Scored',
      value: stats.resumesScored.toLocaleString(),
      change: '+8%',
      changeType: 'positive' as const,
      icon: Target,
    },
    {
      name: 'Assessments Completed',
      value: stats.assessmentsCompleted.toString(),
      change: '+23%',
      changeType: 'positive' as const,
      icon: CheckCircle,
    },
  ];

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
        <div className="flex gap-2">
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
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statsCards.map((stat) => (
          <Card key={stat.name} className="border-gray-200">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                {stat.name}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
              <div className="flex items-center text-xs text-gray-600">
                <span
                  className={
                    stat.changeType === 'positive'
                      ? 'text-green-600'
                      : 'text-red-600'
                  }
                >
                  {stat.change}
                </span>
                <span className="ml-1">from last month</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* JD Status Boxes */}
      <Card className="border-gray-200">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900">Job Description Status</CardTitle>
          <CardDescription className="text-gray-600">
            Overview of all job descriptions by status
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            {/* Published JDs */}
            <div
              className="p-4 rounded-lg border-2 border-green-200 bg-green-50 hover:border-green-300 transition-all cursor-pointer"
              onClick={() => router.push('/recruitment/jd-list?status=published')}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                </div>
                <Badge className="bg-green-600 hover:bg-green-700 text-white">
                  {jdStatusCounts.published}
                </Badge>
              </div>
              <h3 className="text-sm font-medium text-gray-900 mb-1">Published</h3>
              <p className="text-xs text-gray-600">Active job postings</p>
            </div>

            {/* Draft JDs */}
            <div
              className="p-4 rounded-lg border-2 border-yellow-200 bg-yellow-50 hover:border-yellow-300 transition-all cursor-pointer"
              onClick={() => router.push('/recruitment/jd-list?status=draft')}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <Edit2 className="h-5 w-5 text-yellow-600" />
                </div>
                <Badge className="bg-yellow-600 hover:bg-yellow-700 text-white">
                  {jdStatusCounts.draft}
                </Badge>
              </div>
              <h3 className="text-sm font-medium text-gray-900 mb-1">Draft</h3>
              <p className="text-xs text-gray-600">Incomplete postings</p>
            </div>

            {/* Disabled JDs */}
            <div
              className="p-4 rounded-lg border-2 border-red-200 bg-red-50 hover:border-red-300 transition-all cursor-pointer"
              onClick={() => router.push('/recruitment/jd-list?status=disabled')}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="p-2 bg-red-100 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                </div>
                <Badge className="bg-red-600 hover:bg-red-700 text-white">
                  {jdStatusCounts.disabled}
                </Badge>
              </div>
              <h3 className="text-sm font-medium text-gray-900 mb-1">Disabled</h3>
              <p className="text-xs text-gray-600">Temporarily hidden</p>
            </div>

            {/* Archived JDs */}
            <div
              className="p-4 rounded-lg border-2 border-gray-200 bg-gray-50 hover:border-gray-300 transition-all cursor-pointer"
              onClick={() => router.push('/recruitment/jd-list?status=archived')}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="p-2 bg-gray-100 rounded-lg">
                  <Archive className="h-5 w-5 text-gray-600" />
                </div>
                <Badge className="bg-gray-600 hover:bg-gray-700 text-white">
                  {jdStatusCounts.archived}
                </Badge>
              </div>
              <h3 className="text-sm font-medium text-gray-900 mb-1">Archived</h3>
              <p className="text-xs text-gray-600">Closed postings</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Plan Quotas & Usage */}
      {tenant && (
        <Card className="border-gray-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-semibold text-gray-900">
                  {subscription?.planName || 'Current Plan'} - Quotas & Usage
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
            <div className="grid grid-cols-4 gap-4">
              {/* Job Postings */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Job Postings</span>
                  <span className="font-medium text-gray-900">
                    {usage?.jobPostings || 0} / {limits?.jobPostings || 100}
                  </span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-600 transition-all"
                    style={{
                      width: `${
                        limits?.jobPostings
                          ? Math.min(
                              ((usage?.jobPostings || 0) / limits.jobPostings) * 100,
                              100
                            )
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>

              {/* Resume Uploads */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Resume Uploads</span>
                  <span className="font-medium text-gray-900">
                    {usage?.resumeUploads || 0} / {limits?.resumeUploads || 2450}
                  </span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gray-800 transition-all"
                    style={{
                      width: `${
                        limits?.resumeUploads
                          ? Math.min(
                              ((usage?.resumeUploads || 0) / limits.resumeUploads) * 100,
                              100
                            )
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>

              {/* Assessments */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Assessments</span>
                  <span className="font-medium text-gray-900">
                    {usage?.assessments || 0} / {limits?.assessments || 500}
                  </span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-yellow-600 transition-all"
                    style={{
                      width: `${
                        limits?.assessments
                          ? Math.min(
                              ((usage?.assessments || 0) / limits.assessments) * 100,
                              100
                            )
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>

              {/* AI Interviews */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">AI Interviews</span>
                  <span className="font-medium text-gray-900">
                    {limits?.aiInterviews === 'unlimited'
                      ? 'Unlimited'
                      : `${usage?.aiInterviews || 0} / ${limits?.aiInterviews || '∞'}`}
                  </span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gray-800 transition-all"
                    style={{
                      width:
                        limits?.aiInterviews === 'unlimited'
                          ? '100%'
                          : `${
                              typeof limits?.aiInterviews === 'number'
                                ? Math.min(
                                    ((usage?.aiInterviews || 0) / limits.aiInterviews) * 100,
                                    100
                                  )
                                : 100
                            }%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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
                onClick={() => router.push('/recruitment/jd-list?status=published')}
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
                onClick={() => router.push('/recruitment/jd-list?status=draft')}
              >
                View all drafts
                <ArrowUpRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
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
                onClick={() => router.push('/resume-management/my-resumes')}
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
    </div>
  );
}
