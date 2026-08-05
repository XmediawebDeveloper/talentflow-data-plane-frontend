'use client';

import { useState, useEffect, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import AIInterviewDetailsView from '@/components/ai-interview/AIInterviewDetailsView';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import type { AIInterviewResponse } from '@/lib/services/aiInterviewService';

function AIInterviewDetailsContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const interviewId = params.id as string;
  // Set when redirected here from a JD's Job Details page — "AI Interview →
  // Create" on a job that already has a live interview lands here. Keeps the
  // breadcrumb and Back anchored to that job instead of the AI Interviews list.
  const fromJobDetails = searchParams.get('from') === 'job-details';

  const [config, setConfig] = useState<AIInterviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allIds, setAllIds] = useState<string[]>([]);

  useEffect(() => {
    const fetchAllIds = async () => {
      try {
        const probe = await aiInterviewService.listConfigs({ page_size: 1, page: 1, compact: true });
        const res = probe.total > probe.items.length
          ? await aiInterviewService.listConfigs({ page_size: probe.total, page: 1, compact: true })
          : probe;
        setAllIds(res.items.map((a: any) => a.id));
      } catch { /* ignore */ }
    };
    fetchAllIds();
  }, []);

  const fetchConfig = async () => {
    try {
      setIsLoading(true);
      const response = await aiInterviewService.get(interviewId);
      if (response) {
        setConfig(response);
      } else {
        setError('AI Interview config not found');
      }
    } catch (err: any) {
      console.error('[TalentFlow] Failed to fetch AI interview config:', err);
      setError(err.message || 'Failed to load AI interview config');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (interviewId) {
      fetchConfig();
    }
  }, [interviewId]);

  // jd_id comes from the fetched config rather than the URL — the JD this
  // interview belongs to is the authoritative link target, same as the results
  // page does.
  const jdId = config?.jd_id || '';

  const handleBack = () => {
    router.push(
      fromJobDetails && jdId
        ? `/recruitment/job-details?id=${encodeURIComponent(jdId)}`
        : '/recruitment/ai-interviews',
    );
  };

  // Shape is inferred and checked against the prop type at the call site — no
  // need to import BreadcrumbCrumb into a route module just for an annotation.
  const breadcrumbItems =
    fromJobDetails && jdId
      ? [
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Job Descriptions', href: '/recruitment/job-openings' },
          { label: config?.jd_title || config?.position || 'Job Details', href: `/recruitment/job-details?id=${encodeURIComponent(jdId)}` },
          { label: 'AI Interview' },
        ]
      : undefined;

  if (isLoading) {
    return (
      <div className="w-full max-w-[1400px] mx-auto py-4 md:py-8">
        <div className="flex items-center justify-center h-64 bg-slate-50">
          <Loader2 className="h-6 w-6 text-brand-blue animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="w-full max-w-[1400px] mx-auto py-4 md:py-8">
        <div className="flex flex-col items-center justify-center h-64 space-y-3 bg-slate-50">
          <div className="text-red-500 text-base">{error || 'AI Interview config not found'}</div>
          <button
            onClick={handleBack}
            className="px-4 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg text-sm transition-all shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
          >
            Back to AI Interviews
          </button>
        </div>
      </div>
    );
  }

  // No wrapper div — this view's own <main> is `flex-1 … overflow-y-auto`, which
  // only becomes a real scroll container as a direct child of the dashboard
  // layout's flex column. Nesting it broke sticky positioning inside (its own
  // breadcrumb, and the CandidateResultsView it renders for Invites → View
  // Details) and applied max-w-[1400px] mx-auto twice.
  return (
    <AIInterviewDetailsView
      config={config}
      onBack={handleBack}
      onRefresh={fetchConfig}
      currentIndex={allIds.indexOf(interviewId)}
      totalCount={allIds.length}
      onPrev={allIds.indexOf(interviewId) > 0
        ? () => router.replace(`/recruitment/ai-interviews/${allIds[allIds.indexOf(interviewId) - 1]}`)
        : undefined}
      onNext={allIds.indexOf(interviewId) >= 0 && allIds.indexOf(interviewId) < allIds.length - 1
        ? () => router.replace(`/recruitment/ai-interviews/${allIds[allIds.indexOf(interviewId) + 1]}`)
        : undefined}
      breadcrumbItems={breadcrumbItems}
    />
  );
}

export default function AIInterviewDetailsPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense
      fallback={
        <div className="w-full max-w-[1400px] mx-auto py-4 md:py-8">
          <div className="flex items-center justify-center h-64 bg-slate-50">
            <Loader2 className="h-6 w-6 text-brand-blue animate-spin" />
          </div>
        </div>
      }
    >
      <AIInterviewDetailsContent />
    </Suspense>
  );
}
