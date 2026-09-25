'use client';

import { formatISTDate } from '@/lib/utils/dateUtils';
import { formatSalaryRange } from '@/lib/utils/salary';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Calendar,
  Clock,
  Users,
  Building2,
  Briefcase,
  DollarSign,
  GraduationCap,
  Award,
  Code,
  Eye,
  Edit2,
  Trash2,
  CheckCircle,
  Ban,
  RefreshCw,
  Copy,
  Download,
  Share2,
  FileText,
  Target,
  ClipboardList,
  TrendingUp,
  Activity,
  UserCheck,
  UserX,
  ExternalLink,
  MoreHorizontal,
  Brain,
  Plus,
  Lock,
  BarChart,
  BarChart3
} from 'lucide-react';
import { jdService, JDResponse } from '@/lib/services/jdService';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import RecordPager from '@/components/RecordPager';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { User, Tenant } from '@/lib/types/tenant';
import AssessmentsForJD from './AssessmentsForJD';
import { Skeleton } from '@/components/ui/skeleton';

type TabType = 'overview' | 'scored-resumes' | 'assessment-results';

interface JobDetailsPageProps {
  user?: User;
  tenant?: Tenant;
}

// ✅ Reusable Quick Action Button Component
interface QuickActionButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  disabledTooltip?: string;
  variant?: 'primary' | 'secondary' | 'success';
}

function QuickActionButton({
  icon,
  label,
  onClick,
  disabled = false,
  disabledTooltip,
  variant = 'secondary'
}: QuickActionButtonProps) {
  const variantStyles = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
    success: 'bg-success text-white hover:bg-success',
  };

  return (
    <div className="relative group">
      <button
        onClick={onClick}
        disabled={disabled}
        className={`
          w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors
          ${disabled
            ? 'bg-gray-200 text-gray-400 cursor-not-allowed opacity-60'
            : variantStyles[variant]
          }
        `}
      >
        {icon}
        <span className="flex-1 text-left">{label}</span>
        {disabled && <Lock className="w-3 h-3" />}
      </button>

      {/* Tooltip on hover when disabled */}
      {disabled && disabledTooltip && (
        <div className="absolute left-0 top-full mt-2 z-30 w-max max-w-[min(18rem,calc(100vw-2rem))] px-3 py-2 bg-gray-900 text-white text-xs leading-snug rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-normal break-words">
          {disabledTooltip}
        </div>
      )}
    </div>
  );
}

export default function JobDetailsPage({ user, tenant }: JobDetailsPageProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = searchParams.get('id');

  const [job, setJob] = useState<JDResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [allJDIds, setAllJDIds] = useState<string[]>([]);
  const currentIndex = allJDIds.indexOf(jobId ?? '');
  const prevId = currentIndex > 0 ? allJDIds[currentIndex - 1] : null;
  const nextId = currentIndex >= 0 && currentIndex < allJDIds.length - 1 ? allJDIds[currentIndex + 1] : null;

  // ✅ Permission checking function
  const hasPermission = (permission: string): boolean => {
    if (!user) return false;
    if (user.role === 'tenant_admin') return true; // Admin has all permissions
    if (!user.permissions) return false;
    return user.permissions[permission as keyof typeof user.permissions] === true;
  };

  // ✅ Feature flag checking (tenant-level)
  const isFeatureEnabled = (feature: string): boolean => {
    if (!tenant?.features) return true; // If no feature flags, assume enabled
    return tenant.features[feature as keyof typeof tenant.features] === true;
  };

  // Get permissions for Quick Actions (using camelCase as per tenant.ts)
  const permissions = {
    canCreateAssessments: hasPermission('canCreateAssessments'),
    canRunAiMatch: hasPermission('canRunAiMatch'),
    canReadJD: hasPermission('canReadJD'),
    canViewAssessments: hasPermission('canViewAssessments'),
    canUploadResumes: hasPermission('canUploadResumes'),
    canRunScoring: hasPermission('canRunScoring'),
  };

  // Get feature flags for Quick Actions
  const features = {
    assessment: isFeatureEnabled('assessment'),
    ai_talent_match: isFeatureEnabled('ai_talent_match'),
    resume_scoring: isFeatureEnabled('resume_scoring'),
  };

  useEffect(() => {
    if (jobId) {
      fetchJobDetails();
    }
  }, [jobId]);

  useEffect(() => {
    // Fetch all published JDs across pages (backend caps at 100 per page)
    const fetchAllPublished = async () => {
      const ids: string[] = [];
      let page = 1;
      while (true) {
        const res = await jdService.list({ status: 'published', page_size: 100, page });
        const items = res.items ?? [];
        ids.push(...items.map((j: JDResponse) => j.id));
        if (ids.length >= res.total || items.length < 100) break;
        page++;
      }
      setAllJDIds(ids);
    };
    fetchAllPublished().catch(() => {});
  }, []);

  const fetchJobDetails = async () => {
    if (!jobId) return;
    setLoading(true);
    try {
      const data = await jdService.getById(jobId);
      setJob(data);
    } catch (error) {
      console.error('Failed to fetch job details:', error);
      toast.error('Failed to load job details');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!jobId) return;
    try {
      await jdService.updateStatus(jobId, newStatus);
      toast.success(`Job status updated to ${newStatus}`);
      fetchJobDetails();
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const handleCopy = () => {
    if (job) {
      const text = `${job.title}\n\n${job.description}`;
      navigator.clipboard.writeText(text);
      toast.success('Job description copied to clipboard');
    }
  };

  const handleDownload = () => {
    if (job) {
      const content = `
Job Title: ${job.title}
Department: ${job.department || 'N/A'}
Employment Type: ${job.employment_type || 'N/A'}
Experience: ${job.experience_min || 0} - ${job.experience_max || 0} years

Description:
${job.description}

Must Have Skills:
${job.must_have_skills?.join(', ') || 'N/A'}

Nice to Have Skills:
${job.nice_to_have_skills?.join(', ') || 'N/A'}

Certifications:
${job.certifications?.join(', ') || 'N/A'}
      `.trim();

      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${job.title.replace(/\s+/g, '_')}_JD.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Job description downloaded');
    }
  };


  const getStatusBadge = (status: string) => {
    const map: Record<string, { variant: 'success' | 'info' | 'destructive' | 'muted'; label: string }> = {
      published: { variant: 'success', label: 'Published' },
      draft: { variant: 'info', label: 'Draft' },
      closed: { variant: 'muted', label: 'Closed' },
      disabled: { variant: 'destructive', label: 'Disabled' },
      archived: { variant: 'muted', label: 'Archived' },
    };
    const config = map[status] || map.draft;
    return <Badge variant={config.variant} className="px-3 py-1 text-sm">{config.label}</Badge>;
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: FileText },
    { id: 'scored-resumes', label: 'Scored Resumes', icon: ClipboardList },
    { id: 'assessment-results', label: 'Assessment Results', icon: BarChart3 },
  ];

  // Mock data for recent activity
  const recentActivity = [
    { id: 1, action: 'New application received', user: 'John Smith', time: '2 hours ago', type: 'application' },
    { id: 2, action: 'Resume scored', user: 'Sarah Johnson', time: '4 hours ago', type: 'score' },
    { id: 3, action: 'Assessment completed', user: 'Mike Wilson', time: '1 day ago', type: 'assessment' },
    { id: 4, action: 'New application received', user: 'Emily Brown', time: '2 days ago', type: 'application' },
  ];

  if (loading) {
    // Structure-matched skeleton — mirrors this page's real layout: the header
    // (back nav + pager, title/status/meta, action buttons), the tabs bar, and
    // the 12-col grid (overview section cards + the sidebar's three cards).
    return (
      <div className="flex-1 bg-gray-50 overflow-y-auto">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-8 py-4">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-8 w-28 rounded-lg" />
            </div>
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-7 w-64" />
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
                <div className="flex items-center gap-4">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-32" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <Skeleton className="h-9 w-9 rounded-lg" />
                <Skeleton className="h-9 w-20 rounded-lg" />
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white border-b border-gray-200 px-8">
          <div className="max-w-7xl mx-auto flex items-center gap-6 py-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-32" />
            ))}
          </div>
        </div>

        {/* Content grid */}
        <div className="max-w-7xl mx-auto px-8 py-6">
          <div className="grid grid-cols-12 gap-6">
            {/* Main column — Job Description, Requirements, Job Details cards */}
            <div className="col-span-9 space-y-6">
              {/* Job Description */}
              <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
                <Skeleton className="h-6 w-40 mb-2" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-4/6" />
              </div>
              {/* Requirements */}
              <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
                <Skeleton className="h-6 w-36 mb-2" />
                <Skeleton className="h-4 w-24" />
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-6 w-20 rounded-full" />
                  ))}
                </div>
                <Skeleton className="h-4 w-24" />
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-6 w-20 rounded-full" />
                  ))}
                </div>
              </div>
              {/* Job Details grid */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <Skeleton className="h-6 w-32 mb-4" />
                <div className="grid grid-cols-2 gap-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <Skeleton className="h-5 w-5 rounded" />
                      <div className="space-y-1.5">
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="h-4 w-28" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Sidebar — Quick Actions, Applicant Statistics, Recent Activity */}
            <div className="col-span-3 space-y-6">
              <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
                <Skeleton className="h-4 w-28 mb-2" />
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-lg" />
                ))}
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                <Skeleton className="h-4 w-36 mb-2" />
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-8 w-8 rounded-lg" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                    <Skeleton className="h-6 w-8" />
                  </div>
                ))}
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
                <Skeleton className="h-4 w-28 mb-2" />
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <Skeleton className="h-8 w-8 rounded-lg flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-3 w-2/3" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Briefcase className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Job not found</h3>
          <button
            onClick={() => router.push('/recruitment/job-openings')}
            className="text-gray-800 hover:underline"
          >
            Back to Job Openings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-gray-50 overflow-y-auto">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => router.push('/recruitment/job-openings')}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Job Openings
            </button>
            <RecordPager
              currentIndex={currentIndex}
              totalCount={allJDIds.length}
              onPrev={prevId ? () => router.push(`/recruitment/job-details?id=${prevId}`) : undefined}
              onNext={nextId ? () => router.push(`/recruitment/job-details?id=${nextId}`) : undefined}
            />
          </div>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-semibold text-gray-900">{job.title}</h1>
                {getStatusBadge(job.status)}
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-500">
                {job.department && (
                  <span className="flex items-center gap-1">
                    <Building2 className="w-4 h-4" />
                    {job.department}
                  </span>
                )}
                {job.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    {job.location}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  Created {formatISTDate(job.created_at)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleCopy}
                className="px-2"
                aria-label="Copy" title="Copy"
              >
                <Copy className="w-5 h-5" />
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDownload}
                className="px-2"
                aria-label="Download" title="Download"
              >
                <Download className="w-5 h-5" />
              </Button>
              <Button
                variant="secondary"
                onClick={() => router.push(`/recruitment/jd-creation?id=${job.id}&edit=true`)}
                icon={<Edit2 className="w-4 h-4" />}
              >
                Edit
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'text-gray-800 border-gray-800'
                    : 'text-gray-600 border-transparent hover:text-gray-900'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-8 py-6">
        <div className="grid grid-cols-12 gap-6">
          {/* Main Content */}
          <div className="col-span-9 space-y-6">
            {activeTab === 'overview' && (
              <>
                {/* Job Description */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Job Description</h2>
                  <div className="markdown-content text-gray-700 leading-relaxed">
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{job.description || ''}</ReactMarkdown>
                  </div>
                </div>

                {/* Requirements */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Requirements</h2>

                  {/* Experience */}
                  <div className="mb-6">
                    <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-gray-400" />
                      Experience
                    </h3>
                    <p className="text-gray-600">
                      {job.experience_min && job.experience_max
                        ? `${job.experience_min} - ${job.experience_max} years`
                        : job.experience_min
                        ? `${job.experience_min}+ years`
                        : 'Not specified'}
                    </p>
                  </div>

                  {/* Must Have Skills */}
                  {job.must_have_skills && job.must_have_skills.length > 0 && (
                    <div className="mb-6">
                      <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-success" />
                        Must Have Skills
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {job.must_have_skills.map((skill, index) => (
                          <span key={index} className="px-3 py-1 bg-success-subtle text-success rounded-full text-sm">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Nice to Have Skills */}
                  {job.nice_to_have_skills && job.nice_to_have_skills.length > 0 && (
                    <div className="mb-6">
                      <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                        <Target className="w-4 h-4 text-gray-700" />
                        Nice to Have Skills
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {job.nice_to_have_skills.map((skill, index) => (
                          <span key={index} className="px-3 py-1 bg-gray-50 text-gray-900 rounded-full text-sm">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Certifications */}
                  {job.certifications && job.certifications.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                        <Award className="w-4 h-4 text-gray-700" />
                        Certifications
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {job.certifications.map((cert, index) => (
                          <span key={index} className="px-3 py-1 bg-gray-50 text-gray-900 rounded-full text-sm">
                            {cert}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Job Details Grid */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Job Details</h2>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <Briefcase className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="text-xs text-gray-500">Employment Type</p>
                        <p className="text-sm font-medium text-gray-900">{job.employment_type || 'Not specified'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <MapPin className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="text-xs text-gray-500">Remote Type</p>
                        <p className="text-sm font-medium text-gray-900">{job.remote_type || 'Not specified'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <TrendingUp className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="text-xs text-gray-500">Job Level</p>
                        <p className="text-sm font-medium text-gray-900">{job.job_level || 'Not specified'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <Building2 className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="text-xs text-gray-500">Industry</p>
                        <p className="text-sm font-medium text-gray-900">{job.industry_type || 'Not specified'}</p>
                      </div>
                    </div>
                    {(job.salary_min || job.salary_max) && (
                      <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg col-span-2">
                        <DollarSign className="w-5 h-5 text-gray-400" />
                        <div>
                          <p className="text-xs text-gray-500">Salary Range</p>
                          <p className="text-sm font-medium text-gray-900">
                            {formatSalaryRange({
                              min: job.salary_min,
                              max: job.salary_max,
                              currency: job.salary_currency,
                            })}
                            {job.compensation_type && ` (${job.compensation_type})`}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {activeTab === 'scored-resumes' && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-semibold text-gray-900">Scored Resumes</h2>
                  <Button
                    variant="primary"
                    onClick={() => router.push(`/recruitment/resume-scoring?jd_id=${job.id}`)}
                    icon={<ClipboardList className="w-4 h-4" />}
                  >
                    Score New Resumes
                  </Button>
                </div>
                {job.scored_resumes_count === 0 ? (
                  <div className="text-center py-12">
                    <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No scored resumes yet</h3>
                    <p className="text-gray-500 mb-4">Start scoring resumes against this job description</p>
                    {permissions.canRunScoring && (
                      <Button
                        variant="primary"
                        onClick={() => router.push(`/recruitment/resume-scoring?jd_id=${job.id}`)}
                        icon={<ClipboardList className="w-4 h-4" />}
                      >
                        Score Resumes
                      </Button>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-600">{job.scored_resumes_count} resumes have been scored</p>
                )}
              </div>
            )}

            {activeTab === 'assessment-results' && (
              <AssessmentsForJD jdId={job.id} jdTitle={job.title} />
            )}
          </div>

          {/* Sidebar */}
          <div className="col-span-3 space-y-6">
            {/* Quick Actions */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Quick Actions</h3>
              <div className="space-y-2">
                {/* Status Change Actions */}
                {job.status === 'draft' && (
                  <QuickActionButton
                    icon={<CheckCircle className="w-4 h-4" />}
                    label="Publish Job"
                    onClick={() => handleStatusChange('published')}
                    variant="success"
                  />
                )}
                {job.status === 'published' && (
                  <QuickActionButton
                    icon={<Ban className="w-4 h-4" />}
                    label="Disable Job"
                    onClick={() => handleStatusChange('disabled')}
                  />
                )}
                {job.status === 'disabled' && (
                  <QuickActionButton
                    icon={<RefreshCw className="w-4 h-4" />}
                    label="Republish Job"
                    onClick={() => handleStatusChange('published')}
                    variant="primary"
                  />
                )}

                {/* 1. Invite for Assessment - Permission + Feature flag */}
                {permissions.canCreateAssessments && (
                  <QuickActionButton
                    icon={<Users className="w-4 h-4" />}
                    label="Invite for Assessment"
                    onClick={() => router.push(`/recruitment/assessments/create?jd_id=${job.id}`)}
                    disabled={!features.assessment}
                    disabledTooltip="Assessments module is not enabled for your organization"
                  />
                )}

                {/* 2. AI Talent Match - Permission + Feature flag */}
                {permissions.canRunAiMatch && (
                  <QuickActionButton
                    icon={<Brain className="w-4 h-4" />}
                    label="AI Talent Match"
                    onClick={() => router.push(`/recruitment/ai-talent-match?jd_id=${job.id}`)}
                    disabled={!features.ai_talent_match}
                    disabledTooltip="AI Match feature is not enabled for your organization"
                  />
                )}

                {/* 3. View JD History - Permission (always available if user can view JD) */}
                {permissions.canReadJD && (
                  <QuickActionButton
                    icon={<FileText className="w-4 h-4" />}
                    label="View JD History"
                    onClick={() => router.push(`/recruitment/job-openings/${job.id}/history`)}
                  />
                )}

                {/* 4. Assessment Status - Permission + Feature flag */}
                {permissions.canViewAssessments && (
                  <QuickActionButton
                    icon={<BarChart className="w-4 h-4" />}
                    label="Assessment Status"
                    onClick={() => router.push(`/recruitment/assessments?jd_id=${job.id}`)}
                    disabled={!features.assessment}
                    disabledTooltip="Assessments module is not enabled"
                  />
                )}

                {/* 5. Add Applicants - Permission (always available) */}
                {permissions.canUploadResumes && (
                  <QuickActionButton
                    icon={<Plus className="w-4 h-4" />}
                    label="Add Applicants"
                    onClick={() => router.push(`/recruitment/resume-database?tab=my-resumes&jd_id=${job.id}`)}
                  />
                )}

                {/* Score Resumes - Permission + Feature flag */}
                {permissions.canRunScoring && (
                  <QuickActionButton
                    icon={<ClipboardList className="w-4 h-4" />}
                    label="Score Resumes"
                    onClick={() => router.push(`/recruitment/resume-scoring?jd_id=${job.id}`)}
                    disabled={!features.resume_scoring}
                    disabledTooltip="Resume scoring is not enabled"
                  />
                )}
              </div>
            </div>

            {/* Applicant Statistics */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Applicant Statistics</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center">
                      <Users className="w-4 h-4 text-gray-800" />
                    </div>
                    <span className="text-sm text-gray-600">Total Applicants</span>
                  </div>
                  <span className="text-lg font-semibold text-gray-900">{job.applicants_count || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-success-subtle rounded-lg flex items-center justify-center">
                      <UserCheck className="w-4 h-4 text-success" />
                    </div>
                    <span className="text-sm text-gray-600">Shortlisted</span>
                  </div>
                  <span className="text-lg font-semibold text-gray-900">0</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center">
                      <ClipboardList className="w-4 h-4 text-gray-800" />
                    </div>
                    <span className="text-sm text-gray-600">Scored</span>
                  </div>
                  <span className="text-lg font-semibold text-gray-900">{job.scored_resumes_count || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-warning-subtle rounded-lg flex items-center justify-center">
                      <BarChart3 className="w-4 h-4 text-warning" />
                    </div>
                    <span className="text-sm text-gray-600">Assessments</span>
                  </div>
                  <span className="text-lg font-semibold text-gray-900">{job.assessments_count || 0}</span>
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Recent Activity</h3>
              <div className="space-y-3">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      activity.type === 'application' ? 'bg-gray-50' :
                      activity.type === 'score' ? 'bg-success-subtle' : 'bg-gray-50'
                    }`}>
                      {activity.type === 'application' && <Users className="w-4 h-4 text-gray-800" />}
                      {activity.type === 'score' && <ClipboardList className="w-4 h-4 text-success" />}
                      {activity.type === 'assessment' && <BarChart3 className="w-4 h-4 text-gray-800" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900">{activity.action}</p>
                      <p className="text-xs text-gray-500">{activity.user} • {activity.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
