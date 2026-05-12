'use client';

import { ArrowLeft, Briefcase, Plus, Loader2, Building2, MapPin, Clock, TrendingUp, Calendar, User, Users } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import type { PublishedJD } from '@/lib/services/aiInterviewService';
import { toast } from 'sonner';
import { formatISTDate } from '@/lib/utils/dateUtils';

export default function AIInterviewJDSelection() {
  const router = useRouter();
  const { user, isTenantAdmin } = useAuth();
  const canCreateJD = isTenantAdmin || !!user?.permissions?.canCreateJD;
  const canCreateAIInterviews = isTenantAdmin || !!user?.permissions?.canCreateAIInterviews;
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
    <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto bg-slate-50">
      <div className="w-full">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <button
              onClick={() => router.push('/recruitment/ai-interviews')}
              className="p-2 hover:bg-brand-blue/5 rounded-lg transition-colors flex-shrink-0"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
                <Briefcase className="w-5 h-5 text-brand-blue" />
              </div>
              <div className="min-w-0">
                <h1 className="text-gray-900 text-lg font-semibold tracking-tight">Select Job Description</h1>
                <p className="text-sm text-gray-500">Choose the JD that this AI interview will be based on</p>
              </div>
            </div>
          </div>
          {canCreateJD && (
            <button
              onClick={() => router.push('/recruitment/jd-creation?from=ai-interview')}
              className="flex items-center gap-2 px-4 py-2.5 text-sm border border-gray-200 bg-white text-gray-700 rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors whitespace-nowrap flex-shrink-0"
            >
              <Plus className="w-4 h-4" />
              Create New Job
            </button>
          )}
        </div>

        {/* Search */}
        <div className="mb-5">
          <input
            type="text"
            placeholder="Search job descriptions..."
            value={jdSearch}
            onChange={e => setJdSearch(e.target.value)}
            className="w-full px-4 py-2.5 border border-gray-200 bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
          />
        </div>

        {/* JD List */}
        {loadingJds ? (
          <div className="flex items-center justify-center py-10 sm:py-16">
            <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin text-brand-blue" />
            <span className="ml-2 text-xs sm:text-sm text-gray-500">Loading job descriptions...</span>
          </div>
        ) : filteredJds.length === 0 ? (
          <div className="text-center py-10 sm:py-16 bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 px-4">
            <div className="w-20 h-20 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/15 mx-auto mb-4 flex items-center justify-center">
              <Briefcase className="w-10 h-10 text-brand-blue" />
            </div>
            <p className="text-gray-700 mb-2 text-sm font-medium">No published job descriptions found</p>
            <p className="text-xs sm:text-sm text-gray-500 mb-4">Create and publish a JD first to configure an AI interview</p>
            {canCreateJD && (
              <button
                onClick={() => router.push('/recruitment/jd-creation?from=ai-interview')}
                className="inline-flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors"
              >
                <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                Create Job Description
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredJds.map(jd => {
              const isUsed = jd.has_published_config === true;
              const postedDate = jd.published_at
                ? formatISTDate(jd.published_at)
                : jd.created_at
                  ? formatISTDate(jd.created_at)
                  : null;

              return (
                <div
                  key={jd.id}
                  className="flex items-center justify-between p-5 bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 hover:border-brand-blue/30 hover:shadow-md hover:shadow-brand-blue/10 transition-all"
                >
                  {/* Left: icon + info */}
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Building2 className="w-5 h-5 text-brand-blue" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {/* Title row */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {jd.job_id && (
                          <span className="px-2 py-0.5 text-xs font-mono font-semibold bg-brand-blue text-white rounded shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
                            {jd.job_id}
                          </span>
                        )}
                        <h3 className="font-semibold text-gray-900 truncate tracking-tight">{jd.title}</h3>
                        <span className="flex items-center gap-1 px-2 py-0.5 text-xs text-green-700 bg-green-100 rounded-full ring-1 ring-green-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                          Published
                        </span>
                        {isUsed && (
                          <span className="flex items-center gap-1 px-2 py-0.5 text-xs text-brand-blue bg-brand-blue/10 rounded-full ring-1 ring-brand-blue/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-brand-blue" />
                            AI
                          </span>
                        )}
                      </div>
                      {/* Metadata row */}
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-600 flex-wrap">
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
                      <span className="px-3 py-1.5 text-xs text-green-700 bg-green-100 rounded-lg ring-1 ring-green-200">
                        AI Config Created
                      </span>
                    ) : canCreateAIInterviews ? (
                      <button
                        onClick={() => handleSelectJd(jd)}
                        className="px-4 py-1.5 text-sm font-medium bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors"
                      >
                        Select
                      </button>
                    ) : null
                    }
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
