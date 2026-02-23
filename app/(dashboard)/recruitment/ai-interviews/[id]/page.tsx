'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AIInterviewDetailsView from '@/components/ai-interview/AIInterviewDetailsView';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import type { AIInterviewResponse } from '@/lib/services/aiInterviewService';

export default function AIInterviewDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const interviewId = params.id as string;

  const [config, setConfig] = useState<AIInterviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const handleBack = () => {
    router.push('/recruitment/ai-interviews');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="text-red-500 text-lg">{error || 'AI Interview config not found'}</div>
        <button
          onClick={handleBack}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm"
        >
          Back to AI Interviews
        </button>
      </div>
    );
  }

  return (
    <AIInterviewDetailsView
      config={config}
      onBack={handleBack}
      onRefresh={fetchConfig}
    />
  );
}
