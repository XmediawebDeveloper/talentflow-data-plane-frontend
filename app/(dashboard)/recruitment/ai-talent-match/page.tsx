'use client';

import { useState, useEffect } from 'react';
import AITalentMatchPage from '@/components/AITalentMatchPage';
import { jdService, JDResponse } from '@/lib/services/jdService';
import { aiMatchService, AIMatchSessionResponse } from '@/lib/services/aiMatchService';
import { Loader2 } from 'lucide-react';
import FeatureGate from '@/components/shared/FeatureGate';

interface Job {
  id: string;
  title: string;
  department?: string;
  location: string;
  status: string;
  applicants: number;
  employmentType?: string;
  experience?: string;
  jobId?: string;
  currentVersion?: number;
}

interface MatchHistory {
  id: string;
  jobId: string;
  jobTitle: string;
  matchedAt: Date;
  totalMatches: number;
  matchedCandidates: any[];
}

// Transform JD API response to Job format for the component
function transformJDToJob(jd: JDResponse): Job {
  // Map status to display format
  const statusMap: Record<string, string> = {
    'published': 'Published',
    'draft': 'Draft',
    'disabled': 'Disabled',
    'archived': 'Archived',
    'active': 'Active',
  };

  return {
    id: jd.id,
    title: jd.title,
    department: jd.department,
    location: jd.location || '',
    status: statusMap[jd.status?.toLowerCase()] || jd.status,
    applicants: jd.applicants_count || 0,
    employmentType: jd.employment_type,
    experience: jd.experience_min && jd.experience_max
      ? `${jd.experience_min}-${jd.experience_max} years`
      : jd.experience_min
        ? `${jd.experience_min}+ years`
        : undefined,
    jobId: jd.job_id,
    currentVersion: jd.current_version,
  };
}

export default function AITalentMatchRoute() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [matchHistory, setMatchHistory] = useState<MatchHistory[]>([]);
  const [matchSessionCounts, setMatchSessionCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);

        // Fetch ALL jobs (not just published) so we can show disabled jobs in history
        // and match history in parallel
        const [jobsResponse, historyResponse] = await Promise.all([
          jdService.list({ page_size: 100, source: 'my-jds' }), // Fetch user's jobs to show disabled jobs in history
          aiMatchService.listSessions({ page_size: 100 }).catch(() => ({ items: [], total: 0 })),
        ]);

        const transformedJobs = jobsResponse.items.map(transformJDToJob);
        setJobs(transformedJobs);

        // Group sessions by job - only keep the latest session per job
        const sessionsByJob = new Map<string, AIMatchSessionResponse>();
        // How many match runs a job has across its whole lineage, so the card
        // can show "View Version History" only when there is more than one run
        // to look back at. Keyed by the human JD-xxx code rather than the raw
        // session.jd_id: a republish forks the JD into a new row with its own
        // id, so a job matched once, republished, then matched again produces
        // two sessions with two DIFFERENT jd_ids — counting by jd_id alone
        // would read as "1 run" on each version and never show the button.
        const sessionCounts: Record<string, number> = {};
        for (const session of historyResponse.items) {
          const jobId = session.jd_id || session.search_query || 'unknown';
          const ownerJob = transformedJobs.find(j => j.id === session.jd_id);
          const countKey = ownerJob?.jobId || jobId;
          sessionCounts[countKey] = (sessionCounts[countKey] || 0) + 1;
          const existing = sessionsByJob.get(jobId);
          // Keep the most recent session for each job
          if (!existing || new Date(session.created_at) > new Date(existing.created_at)) {
            sessionsByJob.set(jobId, session);
          }
        }
        setMatchSessionCounts(sessionCounts);

        // Keep route load summary-only.
        // Candidate details are fetched lazily when the user opens a specific session.
        const history: MatchHistory[] = Array.from(sessionsByJob.values()).map((session: AIMatchSessionResponse) => {
          const job = transformedJobs.find(j => j.id === session.jd_id);

          return {
            id: session.id,
            jobId: session.jd_id || '',
            jobTitle: job?.title || session.search_query || 'Unknown Job',
            matchedAt: new Date(session.created_at),
            totalMatches: session.total_matches,
            matchedCandidates: [],
          };
        });

        // Sort by most recent first
        history.sort((a, b) => b.matchedAt.getTime() - a.matchedAt.getTime());

        setMatchHistory(history);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load data');
        setJobs([]);
        setMatchHistory([]);
        setMatchSessionCounts({});
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  if (isLoading) {
    return (
      <div className="tf-loader-page bg-slate-50 p-4">
        <div className="text-center">
          <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 text-brand-blue animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-600 dark:text-slate-400 font-medium">Loading jobs...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="tf-loader-page bg-slate-50 p-4">
        <div className="text-center max-w-md">
          <div className="w-12 h-12 bg-red-100 dark:bg-red-500/20 ring-1 ring-red-200 dark:ring-red-500/40 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-red-600 dark:text-red-400 text-lg sm:text-xl">!</span>
          </div>
          <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50 mb-2 tracking-tight">Failed to Load Jobs</h2>
          <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white text-sm rounded-lg transition-all font-medium shadow-sm shadow-brand-blue/25 ring-1 ring-white/10"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <FeatureGate feature="ai_talent_match">
      <div className="relative flex-1 flex flex-col overflow-x-hidden bg-slate-50">
        <AITalentMatchPage jobs={jobs} matchHistory={matchHistory} matchSessionCounts={matchSessionCounts} />
      </div>
    </FeatureGate>
  );
}
