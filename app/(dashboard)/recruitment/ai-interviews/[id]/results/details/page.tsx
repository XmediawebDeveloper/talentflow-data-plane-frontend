'use client';

import { useState, useEffect, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
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
      <div className="flex flex-col items-center justify-center h-64 space-y-3">
        <div className="text-red-500 text-base">No session selected</div>
        <button onClick={handleBack} className="px-3 py-2 bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white rounded-lg text-sm transition-all shadow-md shadow-brand-blue/25 ring-1 ring-white/10">
          Back to Results
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 bg-slate-50">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-blue" />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-3">
        <div className="text-red-500 text-base">{error || 'Session not found'}</div>
        <button onClick={handleBack} className="px-3 py-2 bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white rounded-lg text-sm transition-all shadow-md shadow-brand-blue/25 ring-1 ring-white/10">
          Back to Results
        </button>
      </div>
    );
  }

  return <CandidateResultsView interview={session} onBack={handleBack} />;
}

export default function AIInterviewResultDetailsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64 bg-slate-50">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-blue" />
      </div>
    }>
      <DetailsContent />
    </Suspense>
  );
}
