'use client';

import { useState, useEffect, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import type { AIInterviewResponse } from '@/lib/services/aiInterviewService';
import CandidateResultsView from '@/components/ai-interview/CandidateResultsView';

function DetailsContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const configId = params.id as string;
  const sessionId = searchParams.get('session_id');

  const [session, setSession] = useState<AIInterviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Prev/Next navigation: AIInterviewResults stores the visible session list in
  // sessionStorage when the user opens the details view, so recruiters can step
  // through candidates without returning to the list each time.
  const [navList, setNavList] = useState<{ id: string }[]>([]);
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('aiInterviewResultNavList');
      if (stored) setNavList(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);
  const navIndex = navList.findIndex(n => n.id === sessionId);
  const prevSession = navIndex > 0 ? navList[navIndex - 1] : null;
  const nextSession = navIndex >= 0 && navIndex < navList.length - 1 ? navList[navIndex + 1] : null;
  const buildNavUrl = (entry: { id: string }) =>
    `/recruitment/ai-interviews/${configId}/results/details?session_id=${entry.id}`;

  useEffect(() => {
    if (!sessionId) {
      setError('No session selected');
      setIsLoading(false);
      return;
    }
    const fetchSession = async () => {
      try {
        const response = await aiInterviewService.get(sessionId);
        if (response) {
          setSession(response);
        } else {
          setError('Session not found');
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load session');
      } finally {
        setIsLoading(false);
      }
    };
    fetchSession();
  }, [sessionId]);

  const handleBack = () => {
    router.push(`/recruitment/ai-interviews/${configId}/results`);
  };

  if (!sessionId) {
    return (
      <div className="w-full max-w-[1400px] mx-auto py-4 md:py-8">
        <div className="flex flex-col items-center justify-center h-64 space-y-3">
          <div className="text-red-500 text-base">No session selected</div>
          <button onClick={handleBack} className="px-4 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg text-sm transition-all shadow-md shadow-brand-blue/25 ring-1 ring-white/10">
            Back to Results
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="w-full max-w-[1400px] mx-auto py-4 md:py-8">
        <div className="flex items-center justify-center h-64 bg-slate-50">
          <Loader2 className="h-6 w-6 text-brand-blue animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="w-full max-w-[1400px] mx-auto py-4 md:py-8">
        <div className="flex flex-col items-center justify-center h-64 space-y-3">
          <div className="text-red-500 text-base">{error || 'Session not found'}</div>
          <button onClick={handleBack} className="px-4 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg text-sm transition-all shadow-md shadow-brand-blue/25 ring-1 ring-white/10">
            Back to Results
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1400px] mx-auto py-4 md:py-8">
      <CandidateResultsView
        interview={session}
        onBack={handleBack}
        breadcrumbTrail={[{ label: 'Results', href: `/recruitment/ai-interviews/${configId}/results` }]}
        currentIndex={navIndex >= 0 ? navIndex : undefined}
        totalCount={navList.length || undefined}
        onPrev={prevSession ? () => router.replace(buildNavUrl(prevSession)) : undefined}
        onNext={nextSession ? () => router.replace(buildNavUrl(nextSession)) : undefined}
      />
    </div>
  );
}

export default function AIInterviewResultDetailsPage() {
  return (
    <Suspense fallback={
      <div className="w-full max-w-[1400px] mx-auto py-4 md:py-8">
        <div className="flex items-center justify-center h-64 bg-slate-50">
          <Loader2 className="h-6 w-6 text-brand-blue animate-spin" />
        </div>
      </div>
    }>
      <DetailsContent />
    </Suspense>
  );
}
