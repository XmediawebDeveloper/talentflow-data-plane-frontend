'use client';

import { ArrowLeft, Briefcase, Plus, Loader2, CheckCircle2 } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import type { PublishedJD } from '@/lib/services/aiInterviewService';
import { toast } from 'sonner';

export default function AIInterviewJDSelection() {
  const router = useRouter();
  const [jds, setJds] = useState<PublishedJD[]>([]);
  const [loadingJds, setLoadingJds] = useState(true);
  const [jdSearch, setJdSearch] = useState('');

  const loadJDs = useCallback(async () => {
    try {
      setLoadingJds(true);
      const result = await aiInterviewService.getPublishedJDs();
      setJds(result.items);
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
    jd.title.toLowerCase().includes(jdSearch.toLowerCase()) ||
    (jd.department || '').toLowerCase().includes(jdSearch.toLowerCase())
  );

  const handleSelectJd = (jd: PublishedJD) => {
    router.push(`/recruitment/ai-interviews/jd-selection/ai-interview-config?jd_id=${jd.id}`);
  };

  return (
    <div className="flex-1 p-8 overflow-y-auto">
      <div className="w-full">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => router.push('/recruitment/ai-interviews')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-gray-900 text-xl font-semibold">AI Interview Configuration</h1>
            <p className="text-sm text-gray-500">Step 1: Select a published Job Description</p>
          </div>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-2 mb-8">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium bg-gray-900 text-white">
              1
            </div>
            <span className="text-sm text-gray-900 font-medium">Select JD</span>
            <div className="w-12 h-px bg-gray-200 mx-1" />
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium bg-gray-100 text-gray-400">
              2
            </div>
            <span className="text-sm text-gray-400">Configure & Publish</span>
          </div>
        </div>

        {/* Search + Create */}
        <div className="flex items-center gap-3 mb-4">
          <input
            type="text"
            placeholder="Search job descriptions..."
            value={jdSearch}
            onChange={e => setJdSearch(e.target.value)}
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-600"
          />
          <button
            onClick={() => router.push('/recruitment/jd-creation?from=ai-interview')}
            className="flex items-center gap-2 px-4 py-2.5 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Create New JD
          </button>
        </div>

        {/* JD List */}
        {loadingJds ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            <span className="ml-2 text-sm text-gray-500">Loading job descriptions...</span>
          </div>
        ) : filteredJds.length === 0 ? (
          <div className="text-center py-16 bg-white border border-gray-200 rounded-lg">
            <Briefcase className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500 mb-2">No published job descriptions found</p>
            <p className="text-sm text-gray-400 mb-4">Create and publish a JD first to configure an AI interview</p>
            <button
              onClick={() => router.push('/recruitment/jd-creation?from=ai-interview')}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Job Description
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {filteredJds.map(jd => (
              <button
                key={jd.id}
                onClick={() => handleSelectJd(jd)}
                className="w-full text-left p-5 bg-white border border-gray-200 rounded-lg hover:border-gray-400 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-gray-900">{jd.title}</h3>
                      <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">Published</span>
                    </div>
                    <div className="flex items-center gap-4 mt-1.5 text-sm text-gray-500">
                      {jd.department && <span>{jd.department}</span>}
                      {jd.job_level && <span className="capitalize">{jd.job_level}</span>}
                      {jd.location && <span>{jd.location}</span>}
                      {jd.experience_min != null && (
                        <span>
                          {jd.experience_min}{jd.experience_max ? `-${jd.experience_max}` : '+'} yrs
                        </span>
                      )}
                    </div>
                    {jd.must_have_skills.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {jd.must_have_skills.slice(0, 6).map(skill => (
                          <span key={skill} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                            {skill}
                          </span>
                        ))}
                        {jd.must_have_skills.length > 6 && (
                          <span className="text-xs text-gray-400">+{jd.must_have_skills.length - 6} more</span>
                        )}
                      </div>
                    )}
                  </div>
                  <ArrowLeft className="w-4 h-4 text-gray-400 rotate-180 flex-shrink-0 mt-1" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
