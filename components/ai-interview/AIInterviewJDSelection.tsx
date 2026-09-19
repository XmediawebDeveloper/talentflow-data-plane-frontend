'use client';

import JobIdBadge from '@/components/jobs/JobIdBadge';
import { Briefcase, Plus, Building2, MapPin, Clock, TrendingUp, Calendar, User, Users } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import type { PublishedJD } from '@/lib/services/aiInterviewService';
import { toast } from 'sonner';
import { formatISTDate } from '@/lib/utils/dateUtils';
import { AIInterviewStepIndicator } from './AIInterviewStepIndicator';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import JDVersionHistory from '@/components/JDVersionHistory';
import { Skeleton } from '@/components/ui/skeleton';

const normalizeSearchValue = (value?: string | null) => (value || '').toLowerCase().trim();
const normalizeIdentifier = (value?: string | null) => normalizeSearchValue(value).replace(/[^a-z0-9]/g, '');
const normalizeTitleSearch = (value?: string | null) =>
  normalizeSearchValue(value).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

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

  // Only surface JDs that DON'T already have a published AI interview config —
  // a JD can't be configured twice, so configured ones are hidden entirely
  // (previously they showed disabled with an "AI Config Created" badge).
  const selectableJds = jds.filter(jd => jd.has_published_config !== true);
  const searchQuery = normalizeSearchValue(jdSearch);
  const titleSearchQuery = normalizeTitleSearch(jdSearch);
  const searchTerms = titleSearchQuery.split(/\s+/).filter(Boolean);
  const normalizedSearchIdentifier = normalizeIdentifier(jdSearch);
  const filteredJds = selectableJds.filter(jd => {
    if (!searchQuery) return true;

    const normalizedTitle = normalizeTitleSearch(jd.title);
    const matchesTitle = searchTerms.length > 0 && searchTerms.every(term => normalizedTitle.includes(term));
    const matchesIdentifier = normalizedSearchIdentifier
      ? normalizeIdentifier(jd.job_id).includes(normalizedSearchIdentifier)
      : false;

    return matchesTitle || matchesIdentifier;
  });
  // True when JDs exist but every one is already configured — lets the empty
  // state say something accurate instead of "create a JD first".
  const allConfigured = jds.length > 0 && selectableJds.length === 0;

  const handleSelectJd = (jd: PublishedJD) => {
    router.push(`/recruitment/ai-interviews/jd-selection/ai-interview-config?jd_id=${jd.id}`);
  };

  return (
    <main className="flex-1 overflow-x-clip bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full min-h-[calc(100dvh-7rem)] bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl">
          <PageBreadcrumb
            className="mb-4 md:mb-6"
            items={[
              { label: 'Dashboard', href: '/dashboard' },
              { label: 'AI Interviews', href: '/recruitment/ai-interviews' },
              { label: 'Select Job Description' },
            ]}
          />
        {/* Step indicator — inside the card, below the breadcrumb, matching the
            other steps. Sitting outside the card left it flush against the top
            of the scroll container, where it got clipped out of view. */}
        <AIInterviewStepIndicator currentStep={1} />
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                <Briefcase className="w-5 h-5 text-brand-blue" />
              </div>
              <div>
                <h1 className="text-gray-900 text-lg font-semibold tracking-tight">Select Job Description</h1>
                <p className="text-sm text-gray-500">Choose the JD that this AI interview will be based on</p>
              </div>
            </div>
          </div>
          {canCreateJD && (
            <button
              onClick={() => router.push('/recruitment/jd-creation?from=ai-interview')}
              className="flex items-center gap-2 px-4 py-2.5 text-sm border border-gray-200 bg-white text-gray-700 rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors whitespace-nowrap"
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
            placeholder="Search by JD ID or title..."
            value={jdSearch}
            onChange={e => setJdSearch(e.target.value)}
            className="w-full px-4 py-2.5 border border-gray-200 bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
          />
        </div>

        {/* JD List */}
        {loadingJds ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-5 bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5"
              >
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  <Skeleton className="w-10 h-10 rounded-xl flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Skeleton className="h-5 w-16 rounded-md" />
                      <Skeleton className="h-5 w-48" />
                      <Skeleton className="h-5 w-10 rounded-full" />
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </div>
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      <Skeleton className="h-3.5 w-24" />
                      <Skeleton className="h-3.5 w-20" />
                      <Skeleton className="h-3.5 w-24" />
                      <Skeleton className="h-3.5 w-28" />
                    </div>
                    <Skeleton className="h-4 w-32 mt-2" />
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                  <Skeleton className="h-9 w-32 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredJds.length === 0 ? (
          <div className="text-center py-10 sm:py-16 bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 px-4">
            <div className="w-20 h-20 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/15 mx-auto mb-4 flex items-center justify-center">
              <Briefcase className="w-10 h-10 text-brand-blue" />
            </div>
            <p className="text-gray-700 mb-2 text-sm font-medium">
              {allConfigured ? 'All published JDs already have an AI interview' : 'No published job descriptions found'}
            </p>
            <p className="text-xs sm:text-sm text-gray-500 mb-4">
              {allConfigured
                ? 'Every published job description is already configured. Publish a new JD to create another AI interview.'
                : 'Create and publish a JD first to configure an AI interview'}
            </p>
            {canCreateJD && (
              <button
                onClick={() => router.push('/recruitment/jd-creation?from=ai-interview')}
                className="inline-flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors"
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
                          <JobIdBadge>{jd.job_id}</JobIdBadge>
                        )}
                        <h3 className="font-semibold text-gray-900 truncate min-w-0 tracking-tight" title={jd.title}>{jd.title}</h3>
                        {/* Version from the JD row's own `current_version`. A JD
                            that has never been republished carries no value, and
                            that IS v1 — the same reading JDListPage and the JD
                            header use, so the number matches wherever it shows. */}
                        <span className="flex-shrink-0 px-2 py-0.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-full ring-1 ring-gray-200">
                          v{jd.current_version ?? 1}
                        </span>
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
                      <JDVersionHistory jdId={jd.id} version={jd.current_version} className="mt-2" />
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
                        className="px-4 py-1.5 text-sm font-medium bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors"
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
    </main>
  );
}
