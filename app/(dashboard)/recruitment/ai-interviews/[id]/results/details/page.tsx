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
  // Opened from the AI Interviews list's Candidate Results tab, which spans
  // every interview. Drives Back and the Prev/Next origin so both return to the
  // list they actually came from — the trail names the interview either way.
  const fromCandidateResults = searchParams.get('from') === 'candidate-results';

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
  // Carries the origin across Prev/Next — without it, paging to the next
  // candidate would silently re-add the Results crumb mid-session.
  const buildNavUrl = (entry: { id: string }) =>
    `/recruitment/ai-interviews/${configId}/results/details?session_id=${entry.id}` +
    (fromCandidateResults ? '&from=candidate-results' : '');

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
    router.push(
      fromCandidateResults
        ? '/recruitment/ai-interviews'
        : `/recruitment/ai-interviews/${configId}/results`
    );
  };
  const backLabel = fromCandidateResults ? 'Back to AI Interviews' : 'Back to Results';

  if (!sessionId) {
    return (
      <div className="w-full max-w-[1400px] mx-auto py-4 md:py-8">
        <div className="flex flex-col items-center justify-center h-64 space-y-3">
          <div className="text-red-500 text-base">No session selected</div>
          <button onClick={handleBack} className="px-4 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg text-sm transition-all shadow-md shadow-brand-blue/25 ring-1 ring-white/10">
            {backLabel}
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="tf-loader-page bg-slate-50">
        <Loader2 className="h-6 w-6 text-brand-blue animate-spin" />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="w-full max-w-[1400px] mx-auto py-4 md:py-8">
        <div className="flex flex-col items-center justify-center h-64 space-y-3">
          <div className="text-red-500 text-base">{error || 'Session not found'}</div>
          <button onClick={handleBack} className="px-4 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg text-sm transition-all shadow-md shadow-brand-blue/25 ring-1 ring-white/10">
            {backLabel}
          </button>
        </div>
      </div>
    );
  }

  // Rendered WITHOUT a wrapper div, deliberately. CandidateResultsView's own
  // <main> is `flex-1 … overflow-y-auto`, which only resolves to a real scroll
  // container when it's a direct child of the dashboard layout's flex column.
  // Nested inside a plain div it had no height constraint and never scrolled, so
  // the sticky breadcrumb pinned to a scrollport that never moved. The wrapper
  // was also a second max-w-[1400px] mx-auto on top of the one the component
  // already applies.
  return (
    <CandidateResultsView
      interview={session}
      onBack={handleBack}
      // Always the full chain: Dashboard › AI Interviews › <interview> ›
      // <candidate>. The interview the candidate sat is a real step between the
      // list and this page, so it stays in the trail no matter which route the
      // recruiter came in by — including the cross-interview Candidate Results
      // tab, where it's the only thing naming which interview this result is
      // for. Back and the pager still return them to where they came from.
      breadcrumbTrail={[{
        // Same label the Results page shows for this interview, so the crumb
        // the recruiter clicks through reads identically here.
        label: session.position || session.jd_title || 'Results',
        href: `/recruitment/ai-interviews/${configId}/results`,
      }]}
      currentIndex={navIndex >= 0 ? navIndex : undefined}
      totalCount={navList.length || undefined}
      onPrev={prevSession ? () => router.replace(buildNavUrl(prevSession)) : undefined}
      onNext={nextSession ? () => router.replace(buildNavUrl(nextSession)) : undefined}
    />
  );
}

export default function AIInterviewResultDetailsPage() {
  return (
    <Suspense fallback={
      <div className="tf-loader-page bg-slate-50">
        <Loader2 className="h-6 w-6 text-brand-blue animate-spin" />
      </div>
    }>
      <DetailsContent />
    </Suspense>
  );
}
