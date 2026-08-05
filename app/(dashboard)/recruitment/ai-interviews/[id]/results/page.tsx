'use client';

import { useState, useEffect, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import AIInterviewResults from '@/components/ai-interview/AIInterviewResults';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import type { BreadcrumbCrumb } from '@/components/PageBreadcrumb';

function AIInterviewResultsContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const configId = params.id as string;
  // Set when opened from a JD's Job Details page ("AI Interview → Result"), so
  // the breadcrumb and Back stay anchored to that job.
  const fromJobDetails = searchParams.get('from') === 'job-details';

  const [configTitle, setConfigTitle] = useState('');
  const [jdTitle, setJdTitle] = useState('');
  const [jdId, setJdId] = useState('');
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
  }, [configId]);

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
    return (
      <div className="flex items-center justify-center h-64 bg-slate-50">
        <Loader2 className="h-6 w-6 text-brand-blue animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-3 bg-slate-50">
        <div className="text-red-500 text-base">{error}</div>
        <button
          onClick={() => router.push('/recruitment/ai-interviews')}
          className="px-3 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg text-sm transition-all shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
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
      onBack={handleBack}
      breadcrumbItems={breadcrumbItems}
    />
  );
}

export default function AIInterviewResultsPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-64 bg-slate-50">
          <Loader2 className="h-6 w-6 text-brand-blue animate-spin" />
        </div>
      }
    >
      <AIInterviewResultsContent />
    </Suspense>
  );
}
