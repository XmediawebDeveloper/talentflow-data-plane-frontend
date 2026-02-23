'use client';

import { ArrowLeft, Briefcase, Plus, Loader2, Building2, MapPin, Clock, TrendingUp, Calendar, User, Users } from 'lucide-react';
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
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/recruitment/ai-interviews')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div>
              <h1 className="text-gray-900 text-lg font-semibold">Select Job Description</h1>
              <p className="text-sm text-gray-500">Choose the JD that this AI interview will be based on</p>
            </div>
          </div>
          <button
            onClick={() => router.push('/recruitment/jd-creation?from=ai-interview')}
            className="flex items-center gap-2 px-4 py-2.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Create New Job
          </button>
        </div>

        {/* Search */}
        <div className="mb-5">
          <input
            type="text"
            placeholder="Search job descriptions..."
            value={jdSearch}
            onChange={e => setJdSearch(e.target.value)}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-600"
          />
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
          <div className="space-y-3">
            {filteredJds.map(jd => {
              const isUsed = jd.has_published_config === true;
              const postedDate = jd.published_at
                ? new Date(jd.published_at).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
                : jd.created_at
                  ? new Date(jd.created_at).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
                  : null;

              return (
                <div
                  key={jd.id}
                  className="flex items-center justify-between p-5 bg-white border border-gray-200 rounded-lg"
                >
                  {/* Left: icon + info */}
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Building2 className="w-5 h-5 text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {/* Title row */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {jd.job_id && (
                          <span className="px-2 py-0.5 text-xs font-mono font-semibold bg-gray-800 text-white rounded">
                            {jd.job_id}
                          </span>
                        )}
                        <h3 className="font-semibold text-gray-900 truncate">{jd.title}</h3>
                        <span className="flex items-center gap-1 px-2 py-0.5 text-xs text-green-700 bg-green-50 rounded-full border border-green-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                          Published
                        </span>
                        {isUsed && (
                          <span className="flex items-center gap-1 px-2 py-0.5 text-xs text-blue-700 bg-blue-50 rounded-full border border-blue-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                            AI
                          </span>
                        )}
                      </div>
                      {/* Metadata row */}
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500 flex-wrap">
                        {jd.department && (
                          <span className="flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            {jd.department}
                          </span>
                        )}
                        {jd.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {jd.location}
                          </span>
                        )}
                        {jd.employment_type && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {jd.employment_type}
                          </span>
                        )}
                        {jd.experience_min != null && (
                          <span className="flex items-center gap-1">
                            <TrendingUp className="w-3 h-3" />
                            {jd.experience_min}{jd.experience_max ? `-${jd.experience_max}` : '+'} years
                          </span>
                        )}
                        {postedDate && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Posted {postedDate}
                          </span>
                        )}
                        {jd.created_by_name && (
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            By {jd.created_by_name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: action */}
                  <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                    {isUsed ? (
                      <span className="px-3 py-1.5 text-xs text-green-700 bg-green-50 rounded-lg border border-green-200">
                        AI Config Created
                      </span>
                    ) : (
                      <button
                        onClick={() => handleSelectJd(jd)}
                        className="px-4 py-1.5 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                      >
                        Select
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
