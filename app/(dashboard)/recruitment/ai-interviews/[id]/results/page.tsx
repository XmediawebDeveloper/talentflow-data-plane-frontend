'use client';

import { useState, useEffect, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import AIInterviewResults, { type ResultsJobScopeEntry } from '@/components/ai-interview/AIInterviewResults';
import { aiInterviewService, isJdDisabled, type AIInterviewResponse } from '@/lib/services/aiInterviewService';
import { interviewVersionOrdinal } from '@/lib/utils/aiInterviewVersion';
import { useInviteDialog } from '@/components/talent-match-invite/InviteDialogProvider';
import { useAuth } from '@/lib/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { UserPlus } from 'lucide-react';

/* Every interview of `own`'s job, any status, each with its job and interview
   version — the set the AI Interviews job row groups (by Job ID, else job
   version id) and its Track popup reads. There is no list-by-job endpoint, so
   every config is fetched and bucketed, as AIInterviewResults' own lookup does. */
async function loadJobScope(own: AIInterviewResponse): Promise<ResultsJobScopeEntry[]> {
  const lineageKey = (c: AIInterviewResponse) => c.jd_short_id || c.jd_id || `__unlinked__:${c.id}`;
  const { live, archived } = await aiInterviewService.listAllConfigsSplit();
  const all = [...live, ...archived];
  const lineage = all.filter((c) => lineageKey(c) === lineageKey(own));
  if (!lineage.some((c) => c.id === own.id)) lineage.push(own);
  return lineage.map((c) => ({
    configId: c.id,
    jobVersion: c.jd_version ?? 1,
    interviewVersion: interviewVersionOrdinal(c, all),
  }));
}
import type { BreadcrumbCrumb } from '@/components/PageBreadcrumb';
import { Skeleton } from '@/components/ui/skeleton';

// Neutral-gray skeleton mirroring the AI Interview results page: breadcrumb,
// header (icon + title + subtitle), 4 stat cards, then the candidate-sessions
// results table (~6 columns × 8 rows).
function AIInterviewResultsSkeleton() {
  return (
    <main className="tf-page">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="tf-page-sheet">
          {/* Breadcrumb */}
          <div className="mb-4 md:mb-6 flex items-center gap-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-3" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-3" />
            <Skeleton className="h-3 w-28" />
          </div>

          {/* Header: icon + title + subtitle */}
          <div className="flex items-center gap-3 mb-6">
            <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-64" />
              <Skeleton className="h-4 w-44" />
            </div>
          </div>

          {/* Stat cards */}
          <div className="tf-grid-stats mb-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="tf-panel p-4 sm:p-5">
                <Skeleton className="h-3.5 w-20 mb-3" />
                <Skeleton className="h-7 w-16" />
              </div>
            ))}
          </div>

          {/* Results table — 6 columns × 8 rows */}
          <div className="rounded-xl border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between gap-4 border-b border-gray-100 bg-gray-50 px-4 py-4">
              <Skeleton className="h-9 w-64 rounded-lg" />
              <Skeleton className="h-9 w-24 rounded-lg" />
            </div>
            <div
              className="hidden md:grid border-b border-gray-100 px-4 py-3"
              style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}
            >
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-3.5 w-20" />
              ))}
            </div>
            <div className="divide-y divide-gray-100">
              {Array.from({ length: 8 }).map((_, r) => (
                <div
                  key={r}
                  className="grid items-center gap-4 px-4 py-4"
                  style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}
                >
                  {Array.from({ length: 6 }).map((_, c) => (
                    <Skeleton key={c} className="h-4" style={{ width: `${55 + ((r + c) * 7) % 40}%` }} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function AIInterviewResultsContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const configId = params.id as string;
  // Set when opened from a JD's Job Details page ("AI Interview → Result"), so
  // the breadcrumb and Back stay anchored to that job.
  const fromJobDetails = searchParams.get('from') === 'job-details';
  // Opened from a version row's View Results: one version, so no version
  // columns or filters. A job row's Result opens `scope=job`: every interview
  // version of the job, as that row's Track popup lists them.
  const versionScoped = searchParams.get('scope') === 'version';
  const jobScoped = searchParams.get('scope') === 'job';
  const [jobScope, setJobScope] = useState<ResultsJobScopeEntry[] | null>(null);

  const [configTitle, setConfigTitle] = useState('');
  const [jdTitle, setJdTitle] = useState('');
  const [jdId, setJdId] = useState('');
  const [jdShortId, setJdShortId] = useState('');
  const [jdVersion, setJdVersion] = useState<number | undefined>(undefined);
  const [jdDisabled, setJdDisabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!configId) return;
    const fetchConfig = async () => {
      try {
        const response = await aiInterviewService.get(configId);
        if (response) {
          setConfigTitle(response.position || response.jd_title || 'AI Interview');
          setJdTitle(response.jd_title || '');
          // Taken from the config rather than the URL — the JD this interview
          // belongs to is the authoritative link target for the breadcrumb.
          setJdId(response.jd_id || '');
          setJdShortId(response.jd_short_id || '');
          setJdVersion(response.jd_version ?? undefined);
          setJdDisabled(isJdDisabled(response.jd_status));
          // Failing that lookup still shows this interview's own results.
          if (jobScoped) setJobScope(await loadJobScope(response).catch(() => null));
        } else {
          setError('AI Interview config not found');
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load config');
      } finally {
        setIsLoading(false);
      }
    };
    fetchConfig();
  }, [configId, jobScoped]);

  /* Invite — THE invite popup on this job (its AI Interview step lists the
     job's interview versions), as Job Details' AI Interview Result tab
     offers. The AI Interviews page's own invite permission; a disabled job
     greys it, with the reason. */
  const { open: openInvite } = useInviteDialog();
  const { user, isTenantAdmin } = useAuth();
  const canInvite = isTenantAdmin || !!user?.permissions?.canInviteAIInterviews;
  const inviteBlocked = !canInvite ? 'You do not have permission to invite candidates'
    : jdDisabled ? 'This job description is disabled, so nothing can be sent for it.'
    : !jdId ? 'This AI interview is not linked to a job' : null;
  const inviteAction = (
    <Button
      variant="primary"
      size="sm"
      onClick={() => {
        if (inviteBlocked) return;
        openInvite({
          kind: 'interview',
          job: { jdId, jdTitle: jdTitle || configTitle, jdCode: jdShortId || undefined, versionNumber: jdVersion },
          preselect: false,
          hideDuplicate: true,
        });
      }}
      aria-disabled={!!inviteBlocked || undefined}
      title={inviteBlocked ?? "Invite candidates to this job's AI interview"}
      className={`whitespace-nowrap !h-9 !text-sm ${inviteBlocked ? 'opacity-60 cursor-not-allowed' : ''}`}
      icon={<UserPlus className="w-4 h-4" />}
    >
      Invite
    </Button>
  );

  const handleBack = () => {
    router.push(
      fromJobDetails && jdId
        ? `/recruitment/job-details?id=${encodeURIComponent(jdId)}`
        : '/recruitment/ai-interviews',
    );
  };

  // Repeat the Job Details trail and link the JD crumb back to it, so opening
  // results from a job never resets the breadcrumb to the AI Interviews trail.
  const breadcrumbItems: BreadcrumbCrumb[] | undefined =
    fromJobDetails && jdId
      ? [
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Job Descriptions', href: '/recruitment/job-openings' },
          { label: jdTitle || configTitle || 'Job Details', href: `/recruitment/job-details?id=${encodeURIComponent(jdId)}` },
          { label: 'AI Interview Results' },
        ]
      : undefined;

  if (isLoading) {
    return <AIInterviewResultsSkeleton />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-3 bg-slate-50">
        <div className="text-red-500 text-base">{error}</div>
        <button
          onClick={() => router.push('/recruitment/ai-interviews')}
          className="tf-btn tf-btn-primary px-3 py-2 bg-brand-blue hover:bg-brand-blue-2 text-sm shadow-md shadow-brand-blue/25 ring-1 ring-white/10 whitespace-normal gap-0 font-normal"
        >
          Back to AI Interviews
        </button>
      </div>
    );
  }

  return (
    <AIInterviewResults
      configId={configId}
      configTitle={configTitle}
      jdTitle={jdTitle}
      jdShortId={jdShortId}
      hideVersionDetails={versionScoped}
      jobScope={jobScope}
      readOnly={jdDisabled}
      onBack={handleBack}
      breadcrumbItems={breadcrumbItems}
      toolbarActions={inviteAction}
    />
  );
}

export default function AIInterviewResultsPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={<AIInterviewResultsSkeleton />}>
      <AIInterviewResultsContent />
    </Suspense>
  );
}
