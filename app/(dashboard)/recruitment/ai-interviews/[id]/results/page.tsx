'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AIInterviewResults from '@/components/ai-interview/AIInterviewResults';
import { aiInterviewService } from '@/lib/services/aiInterviewService';

export default function AIInterviewResultsPage() {
  const params = useParams();
  const router = useRouter();
  const configId = params.id as string;

  const [configTitle, setConfigTitle] = useState('');
  const [jdTitle, setJdTitle] = useState('');
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
    router.push('/recruitment/ai-interviews');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 bg-slate-50">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-blue" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-3 bg-slate-50">
        <div className="text-red-500 text-base">{error}</div>
        <button
          onClick={() => router.push('/recruitment/ai-interviews')}
          className="px-3 py-2 bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white rounded-lg text-sm transition-all shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
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
    />
  );
}
