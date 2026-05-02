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
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="text-red-500 text-lg">{error}</div>
        <button
          onClick={() => router.push('/recruitment/ai-interviews')}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm"
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
