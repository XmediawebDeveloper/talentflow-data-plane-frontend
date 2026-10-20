'use client';

import JobIdBadge from '@/components/jobs/JobIdBadge';
import { ArrowLeft, Briefcase, Plus, Building2, MapPin, Clock, TrendingUp, Calendar, User, Sparkles, ClipboardList, Search } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { jdService, JDResponse } from '@/lib/services/jdService';
import { toast } from 'sonner';
import { formatISTDate } from '@/lib/utils/dateUtils';
import { formatEmploymentType } from '@/lib/utils/jobOpeningDisplay';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import JDVersionHistory from '@/components/JDVersionHistory';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function ResumeScoringJDSelection() {
  const router = useRouter();
  const { user, isTenantAdmin } = useAuth();
  const canCreateJD = isTenantAdmin || !!user?.permissions?.canCreateJD;
  const canViewScoring = isTenantAdmin || !!user?.permissions?.canViewScoring;
  const [jds, setJds] = useState<JDResponse[]>([]);
  const [loadingJds, setLoadingJds] = useState(true);
  const [jdSearch, setJdSearch] = useState('');

  const loadJDs = useCallback(async () => {
    try {
      setLoadingJds(true);
      // Probe for the total, then pull every published JD in one request —
      // the same pattern the Resume Scoring page uses for its job list. A
      // flat page_size of 50 silently dropped every JD past the 50th.
      const params = { status: 'published' as const };
      const probe = await jdService.list({ ...params, page: 1, page_size: 1 });
      const result = probe.total > (probe.items || []).length
        ? await jdService.list({ ...params, page: 1, page_size: probe.total })
        : probe;
      setJds(result.items || []);
    } catch (error) {
      console.error('Failed to load JDs:', error);
      toast.error('Failed to load job descriptions');
    } finally {
      setLoadingJds(false);
    }
  }, []);

  useEffect(() => {
    loadJDs();
  }, [loadJDs]);

  const filteredJds = jds.filter(jd =>
    jd.title?.toLowerCase().includes(jdSearch.toLowerCase()) ||
    (jd.department || '').toLowerCase().includes(jdSearch.toLowerCase())
  );

  const handleSelectJd = (jd: JDResponse) => {
    router.push(`/recruitment/resume-scoring?jd_id=${jd.id}`);
  };

  return (
    <main className="flex-1 overflow-x-clip bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full min-h-[calc(100dvh-7rem)] bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl">
          <PageBreadcrumb
            className="mb-4 md:mb-6"
            items={[
              { label: 'Dashboard', href: '/dashboard' },
              { label: 'Resume Scoring', href: '/recruitment/resume-scoring' },
              { label: 'Select Job Description' },
            ]}
          />
        {/* Header — shared PageHeader (User Management uniform) */}
        <PageHeader
          icon={<ClipboardList className="h-5 w-5" />}
          title="Select Job Description"
          description={
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-brand-blue" />
              Select a job and let AI score candidates.
            </span>
          }
          actions={
            <div className="flex items-center gap-2 sm:justify-end">
              <Button
                variant="secondary"
                onClick={() => router.push('/dashboard')}
                icon={<ArrowLeft className="w-4 h-4" />}
                aria-label="Back to Dashboard" title="Back to Dashboard"
              >
                Back
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  if (!canCreateJD) return;
                  router.push('/recruitment/jd-creation?from=resume-scoring');
                }}
                aria-disabled={!canCreateJD}
                className={!canCreateJD ? 'opacity-60 cursor-not-allowed' : ''}
                title={!canCreateJD ? 'You do not have permission to create job descriptions' : undefined}
                icon={<Plus className="w-4 h-4" />}
              >
                Create New Job
              </Button>
            </div>
          }
        />

        {/* Search — shared Input (User Management uniform) */}
        <div className="mb-5 relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-slate-500" />
          <Input
            type="text"
            placeholder="Search job descriptions..."
            value={jdSearch}
            onChange={e => setJdSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* JD List */}
        {loadingJds ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-5 bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5"
              >
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  <Skeleton className="w-10 h-10 rounded-xl flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Skeleton className="h-5 w-16 rounded-md" />
                      <Skeleton className="h-5 w-48" />
                      <Skeleton className="h-5 w-20 rounded-full" />
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      <Skeleton className="h-3.5 w-24" />
                      <Skeleton className="h-3.5 w-20" />
                      <Skeleton className="h-3.5 w-24" />
                      <Skeleton className="h-3.5 w-28" />
                    </div>
                    <Skeleton className="h-4 w-32 mt-2" />
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 sm:ml-4">
                  <Skeleton className="h-9 w-32 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredJds.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5">
            <EmptyState
              icon={Briefcase}
              title="No published job descriptions found"
              description="Create and publish a JD first to score resumes against it."
              action={{
                label: 'Create Job Description',
                disabledReason: !canCreateJD ? 'You do not have permission to create job descriptions' : undefined,
                onClick: () => {
                  if (!canCreateJD) return;
                  router.push('/recruitment/jd-creation?from=resume-scoring');
                },
              }}
            />
          </div>
        ) : (
          <div className="space-y-3">
            {filteredJds.map(jd => {
              const postedDate = jd.published_at
                ? formatISTDate(jd.published_at)
                : jd.created_at
                  ? formatISTDate(jd.created_at)
                  : null;
              const applicants = jd.applicants_count ?? 0;
              const scored = jd.scored_resumes_count ?? 0;

              return (
                <div
                  key={jd.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-5 bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 hover:border-brand-blue/30 hover:shadow-md hover:shadow-brand-blue/10 transition-all"
                >
                  {/* Left: icon + info */}
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Building2 className="w-5 h-5 text-brand-blue" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {/* Title row */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {jd.job_id && (
                          <JobIdBadge>{jd.job_id}</JobIdBadge>
                        )}
                        <h3 className="font-semibold text-gray-900 truncate min-w-0 tracking-tight" title={jd.title}>{jd.title}</h3>
                        <span className="flex items-center gap-1 px-2 py-0.5 text-xs text-green-700 bg-green-100 rounded-full ring-1 ring-green-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                          Published
                        </span>
                        {scored > 0 && (
                          <span className="flex items-center gap-1 px-2 py-0.5 text-xs text-brand-blue bg-brand-blue/10 rounded-full ring-1 ring-brand-blue/20">
                            <ClipboardList className="w-3 h-3" />
                            {scored} scored
                          </span>
                        )}
                      </div>
                      {/* Metadata row */}
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-600 flex-wrap">
                        {jd.department && (
                          <span className="flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            {jd.department}
                          </span>
                        )}
                        {jd.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {jd.location}
                          </span>
                        )}
                        {jd.employment_type && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatEmploymentType(jd.employment_type)}
                          </span>
                        )}
                        {jd.experience_min != null && (
                          <span className="flex items-center gap-1">
                            <TrendingUp className="w-3 h-3" />
                            {jd.experience_min}{jd.experience_max ? `-${jd.experience_max}` : '+'} years
                          </span>
                        )}
                        {applicants > 0 && (
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {applicants} applicants
                          </span>
                        )}
                        {postedDate && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Posted {postedDate}
                          </span>
                        )}
                      </div>
                      <JDVersionHistory jdId={jd.id} version={jd.current_version} className="mt-2" />
                    </div>
                  </div>

                  {/* Right: action */}
                  <div className="flex items-center gap-2 flex-shrink-0 sm:ml-4">
                    <button
                      onClick={() => { if (!canViewScoring) return; handleSelectJd(jd); }}
                      aria-disabled={!canViewScoring}
                      title={!canViewScoring ? 'You do not have permission to score resumes' : undefined}
                      className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-lg transition-colors w-full sm:w-auto justify-center ${
                        canViewScoring
                          ? 'bg-brand-blue hover:bg-brand-blue-2 text-white shadow-md shadow-brand-blue/25 ring-1 ring-white/10'
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed opacity-60'
                      }`}
                    >
                      <ClipboardList className="w-4 h-4" />
                      Score Resumes
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </div>
      </div>
    </main>
  );
}
