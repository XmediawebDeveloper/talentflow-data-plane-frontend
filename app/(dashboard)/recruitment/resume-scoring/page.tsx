'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ResumeScoringPage from '@/components/ResumeScoringPage';
import { jdService, JDResponse } from '@/lib/services/jdService';
import { resumeService, folderService } from '@/lib/services/resumeService';
import { scoringService } from '@/lib/services/scoringService';
import { Resume, Folder } from '@/lib/types/types';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import FeatureGate from '@/components/shared/FeatureGate';

interface ScoredResumeData {
  id: string;
  jobId: string;
  jobTitle: string;
  scoredAt: Date;
  source: 'my-resumes' | 'database';
  totalScored: number;
  scoredResumes: any[];
}

interface Job {
  id: string;
  title: string;
  location: string;
  department: string;
  status: string;
  applicants: number;
  employmentType?: string;
  remoteType?: string;
  mustHaveComments?: string[];
  experience?: string;
}

export default function ResumeScoringRoute() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [resumes, setResumes] = useState<any[]>([]);
  const [folders, setFolders] = useState<any[]>([]);
  const [scoredHistory, setScoredHistory] = useState<ScoredResumeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialJdId, setInitialJdId] = useState<string | null>(null);
  const [initialScoreId, setInitialScoreId] = useState<string | null>(null);
  const [showProgress, setShowProgress] = useState(false);
  const [initialNewScoring, setInitialNewScoring] = useState(false);
  const [pendingScoringData, setPendingScoringData] = useState<{
    jobId: string;
    jobTitle: string;
    resumeIds: string[];
    resumeNames: string[];
    alreadyScoredItems?: Array<{
      resumeId: string;
      candidateName: string;
      score: number;
    }>;
  } | null>(null);
  const [pendingBatchId, setPendingBatchId] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<{
    jobId: string;
    jobTitle: string;
    total: number;
    queued: number;
    processing: number;
    completed: number;
    failed: number;
    items?: {
      resumeId: string;
      candidateName: string;
      status: 'queued' | 'processing' | 'completed' | 'failed' | 'already_scored';
      score?: number;
      matchStatus?: string;
      errorMessage?: string;
    }[];
  } | null>(null);

  useEffect(() => {
    // Check if there's a jd_id in URL params
    const jdId = searchParams.get('jd_id');
    const scoreId = searchParams.get('score_id');
    const showProgressParam = searchParams.get('show_progress');
    const startScoringParam = searchParams.get('start_scoring');
    const batchIdParam = searchParams.get('batch_id');

    if (jdId) {
      console.log('[ResumeScoringRoute] Found jd_id in URL:', jdId);
      setInitialJdId(jdId);
    }
    if (scoreId) {
      console.log('[ResumeScoringRoute] Found score_id in URL:', scoreId);
      setInitialScoreId(scoreId);
    }
    if (showProgressParam === 'true') {
      console.log('[ResumeScoringRoute] Show progress requested');
      setShowProgress(true);
    }

    // Handle mode=new from JD module (JD-first scoring flow)
    const modeParam = searchParams.get('mode');
    if (modeParam === 'new' && jdId) {
      console.log('[ResumeScoringRoute] JD-first scoring flow: mode=new with jd_id:', jdId);
      setInitialNewScoring(true);
    }

    // Handle batch_id from async scoring (Celery)
    if (batchIdParam) {
      console.log('[ResumeScoringRoute] Found batch_id:', batchIdParam);
      setPendingBatchId(batchIdParam);

      // Immediately fetch current batch status from API (don't wait for poll interval)
      const fetchInitialStatus = async () => {
        let storedResumeItems: { resumeId: string; candidateName: string }[] = [];
        let alreadyScoredItems: { resumeId: string; candidateName: string; score?: number; matchStatus?: string }[] = [];
        try {
          const storedData = sessionStorage.getItem('pendingScoringBatch');
          if (storedData) {
            const data = JSON.parse(storedData);
            storedResumeItems = data.resumeItems || [];
            alreadyScoredItems = data.alreadyScoredItems || [];
          }
        } catch (e) {
          console.error('[ResumeScoringRoute] Error reading sessionStorage:', e);
        }

        const candidateNameMap = new Map<string, string>();
        storedResumeItems.forEach(item => {
          candidateNameMap.set(item.resumeId, item.candidateName);
        });

        const alreadyScoredProgressItems = alreadyScoredItems.map(item => ({
          resumeId: item.resumeId,
          candidateName: item.candidateName || 'Unknown',
          status: 'already_scored' as const,
          score: item.score,
          matchStatus: item.matchStatus,
        }));

        try {
          const status = await scoringService.getBatchStatus(batchIdParam);

          let batchItems: { resumeId: string; candidateName: string; status: 'queued' | 'processing' | 'completed' | 'failed' | 'already_scored'; score?: number; matchStatus?: string; errorMessage?: string }[];

          if (status.items && status.items.length > 0) {
            batchItems = status.items.map((item: any) => ({
              resumeId: item.resume_id,
              candidateName: candidateNameMap.get(item.resume_id) || item.candidate_name || 'Unknown',
              status: item.status,
              score: item.overall_score,
              matchStatus: item.match_status,
              errorMessage: item.error_message,
            }));
          } else if (storedResumeItems.length > 0) {
            batchItems = storedResumeItems.map(item => ({
              resumeId: item.resumeId,
              candidateName: item.candidateName || 'Unknown',
              status: 'queued' as const,
            }));
          } else {
            batchItems = [];
          }

          const allItems = [...alreadyScoredProgressItems, ...batchItems];

          setBatchProgress({
            jobId: status.jd_id,
            jobTitle: status.jd_title,
            total: (status.total || storedResumeItems.length) + alreadyScoredItems.length,
            queued: status.queued,
            processing: status.processing,
            completed: status.completed,
            failed: status.failed,
            items: allItems,
          });
        } catch (e) {
          console.error('[ResumeScoringRoute] Error fetching initial status:', e);
          if (storedResumeItems.length > 0 || alreadyScoredItems.length > 0) {
            try {
              const storedData = sessionStorage.getItem('pendingScoringBatch');
              if (storedData) {
                const data = JSON.parse(storedData);
                const batchItems = storedResumeItems.map(item => ({
                  resumeId: item.resumeId,
                  candidateName: item.candidateName || 'Unknown',
                  status: 'queued' as const,
                }));
                const allItems = [...alreadyScoredProgressItems, ...batchItems];
                setBatchProgress({
                  jobId: data.jobId,
                  jobTitle: data.jobTitle,
                  total: data.totalResumes,
                  queued: data.totalResumes - alreadyScoredItems.length,
                  processing: 0,
                  completed: 0,
                  failed: 0,
                  items: allItems,
                });
              }
            } catch (e2) {
              console.error('[ResumeScoringRoute] Error reading stored data:', e2);
            }
          }
        }
      };
      fetchInitialStatus();
    } else {
      // No batch_id in URL - clear any stale sessionStorage data to prevent modal from appearing
      try {
        sessionStorage.removeItem('pendingScoringBatch');
      } catch (e) {
        // Ignore sessionStorage errors
      }
    }

    // Check for pending scoring data from my-resumes page (old sync method)
    if (startScoringParam === 'true') {
      try {
        const storedData = sessionStorage.getItem('pendingScoringData');
        if (storedData) {
          const data = JSON.parse(storedData);
          console.log('[ResumeScoringRoute] Found pending scoring data:', data);
          setPendingScoringData(data);
          sessionStorage.removeItem('pendingScoringData');
        }
      } catch (e) {
        console.error('[ResumeScoringRoute] Error reading pending scoring data:', e);
      }
    }

    // Fetch essential data first (fast), then load history in background
    fetchData().then(() => {
      // Load scored history after page is rendered (non-blocking)
      loadScoredHistory();
    });
  }, []);

  // Poll for batch status when we have a pending batch
  useEffect(() => {
    if (!pendingBatchId) return;

    // Get candidate names and already-scored items from sessionStorage once at the start of polling
    let storedResumeItems: { resumeId: string; candidateName: string }[] = [];
    let alreadyScoredItems: { resumeId: string; candidateName: string; score?: number; matchStatus?: string; scoredAt?: string }[] = [];
    try {
      const storedData = sessionStorage.getItem('pendingScoringBatch');
      if (storedData) {
        const data = JSON.parse(storedData);
        storedResumeItems = data.resumeItems || [];
        alreadyScoredItems = data.alreadyScoredItems || [];
      }
    } catch (e) {
      // Ignore sessionStorage errors
    }

    // Create a map for quick lookup of candidate names by resumeId
    const candidateNameMap = new Map<string, string>();
    storedResumeItems.forEach(item => {
      candidateNameMap.set(item.resumeId, item.candidateName);
    });

    // Pre-build already-scored items with fixed status
    const alreadyScoredProgressItems = alreadyScoredItems.map(item => ({
      resumeId: item.resumeId,
      candidateName: item.candidateName || 'Unknown',
      status: 'already_scored' as const,
      score: item.score,
      matchStatus: item.matchStatus,
    }));

    const pollInterval = setInterval(async () => {
      try {
        const status = await scoringService.getBatchStatus(pendingBatchId);

        let batchItems: { resumeId: string; candidateName: string; status: 'queued' | 'processing' | 'completed' | 'failed' | 'already_scored'; score?: number; matchStatus?: string; errorMessage?: string }[];

        if (status.items && status.items.length > 0) {
          // Map items from API response, but use sessionStorage for candidate names if API has 'Unknown'
          batchItems = status.items.map((item: any) => ({
            resumeId: item.resume_id,
            candidateName: candidateNameMap.get(item.resume_id) || item.candidate_name || 'Unknown',
            status: item.status,
            score: item.overall_score,
            matchStatus: item.match_status,
            errorMessage: item.error_message,
          }));
        } else if (storedResumeItems.length > 0) {
          // API returned empty items, use sessionStorage items as placeholders
          batchItems = storedResumeItems.map(item => ({
            resumeId: item.resumeId,
            candidateName: item.candidateName || 'Unknown',
            status: 'queued' as const,
          }));
        } else {
          batchItems = [];
        }

        // Merge batch items with already-scored items
        const allItems = [...alreadyScoredProgressItems, ...batchItems];

        setBatchProgress({
          jobId: status.jd_id,
          jobTitle: status.jd_title,
          total: (status.total || storedResumeItems.length) + alreadyScoredItems.length,
          queued: status.queued,
          processing: status.processing,
          completed: status.completed,
          failed: status.failed,
          items: allItems,
        });

        // Stop polling when batch is complete
        if (status.status === 'completed' || status.status === 'failed') {
          console.log('[ResumeScoringRoute] Batch completed, stopping poll');
          clearInterval(pollInterval);
          setPendingBatchId(null);

          // Reload scored history to show new results
          setTimeout(async () => {
            await loadScoredHistory();
            // Clear sessionStorage after loading history
            try {
              sessionStorage.removeItem('pendingScoringBatch');
              console.log('[ResumeScoringRoute] Cleared pendingScoringBatch from sessionStorage');
            } catch (e) {
              console.error('[ResumeScoringRoute] Error clearing pendingScoringBatch:', e);
            }
            // Update URL without full page reload to preserve state
            router.push(`/recruitment/resume-scoring?jd_id=${status.jd_id}`);
          }, 2000);
        }
      } catch (e) {
        console.error('[ResumeScoringRoute] Error polling batch status:', e);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [pendingBatchId]);

  const loadScoredHistory = async () => {
    // Load scored history sidebar from the API - only page 1 (sorted by created_at DESC)
    // Recently scored items always appear on page 1. Full JD scores are loaded on-demand via loadJdScores.
    try {
      const firstPage = await scoringService.getAllScoredResumes({ page_size: 500, page: 1 });
      const allItems = firstPage.items || [];

      // Group scores by JD
      const scoresByJd = new Map<string, { jdTitle: string; scores: any[] }>();

      for (const item of allItems) {
        const jdId = item.jd_id;
        if (!scoresByJd.has(jdId)) {
          scoresByJd.set(jdId, { jdTitle: item.jd_title || 'Unknown Job', scores: [] });
        }

        // Convert score to display format - use backend match_status as source of truth
        const matchScore = Math.round(item.overall_score || 0);
        let matchStatus = 'No Match';
        if (item.match_status === 'exact_match' || item.match_status === 'Exact Match') {
          matchStatus = 'Exact Match';
        } else if (item.match_status === 'partial_match' || item.match_status === 'Partial Match') {
          matchStatus = 'Partial Match';
        } else if (item.match_status === 'no_match' || item.match_status === 'No Match') {
          matchStatus = 'No Match';
        } else if (matchScore >= 70) {
          // Fallback: score-based only when backend doesn't provide match_status
          matchStatus = 'Exact Match';
        } else if (matchScore >= 50) {
          matchStatus = 'Partial Match';
        }

        scoresByJd.get(jdId)!.scores.push({
          id: item.id,
          resumeId: item.resume_id || item.resumeId || '',  // CRITICAL: Resume ID for fetching details
          candidateName: item.candidate_name || 'Unknown',
          candidateEmail: item.email || item.candidate_email || '',
          email: item.email || item.candidate_email || '',
          phone: item.phone || '',
          overall_score: matchScore,  // Use overall_score as primary field
          matchScore: matchScore,
          matchStatus: matchStatus,
          scorePercentage: matchScore,
          scoredDate: item.created_at || new Date().toISOString(),
          scoredBy: item.scored_by_name || item.scored_by || 'System',
          // Version info
          version: item.resume_version || item.version || 1,
          resumeVersion: item.resume_version || item.version || 1,
          // Source, Status, Error Reason fields
          source: item.source || 'database',
          status: item.status || 'completed',
          errorReason: item.error_message || item.error_reason || '',
          experience: item.experience_years ? `${item.experience_years} years` : undefined,
          education: item.education,
          certifications: item.certifications || [],
          aiSummary: item.ai_summary,
          strengths: item.strengths || [],
          gaps: item.gaps || [],
          title: item.current_title,
          currentCompany: item.current_company,
          location: item.location,
          skills: item.skills || [],
          matchedSkills: item.matched_skills || item.matchedSkills || item.skills || [],
          missingSkills: item.missing_skills || item.missingSkills || item.gaps || [],
          scoreBreakdown: item.score_breakdown || [],
          criteriaScores: item.criteria_scores || {},
          technicalSkills: item.technical_skills || item.skills || [],
          softSkills: item.soft_skills || [],
          experienceDetails: item.experience_details || [],
          educationDetails: item.education_details || [],
          languages: item.languages || [],
          professionalSummary: item.professional_summary || item.ai_summary || '',
        });
      }

      // Convert to ScoredResumeData array
      const validHistory: ScoredResumeData[] = [];
      scoresByJd.forEach((data, jdId) => {
        if (data.scores.length > 0) {
          // Sort scored resumes by score descending for consistent ordering
          data.scores.sort((a: any, b: any) => (b.overall_score || b.matchScore || 0) - (a.overall_score || a.matchScore || 0));
          validHistory.push({
            id: jdId,
            jobId: jdId,
            jobTitle: data.jdTitle,
            scoredAt: new Date(data.scores[0]?.scoredDate || new Date()),
            source: 'database' as const,
            totalScored: data.scores.length,
            scoredResumes: data.scores,
          });
        }
      });

      // Sort by scored date (most recent first)
      validHistory.sort((a, b) => new Date(b.scoredAt).getTime() - new Date(a.scoredAt).getTime());

      setScoredHistory(validHistory);

      // Clear old localStorage data to ensure consistency with API data
      try {
        localStorage.removeItem('scoredHistory');
      } catch (e) {
        // Ignore localStorage errors
      }
    } catch (error) {
      console.error('Failed to load scored history from API:', error);
      // Fallback to localStorage if API fails
      try {
        const saved = localStorage.getItem('scoredHistory');
        if (saved) {
          const parsed = JSON.parse(saved);
          const rawHistory = parsed.map((item: any) => ({
            ...item,
            scoredAt: new Date(item.scoredAt),
          }));
          setScoredHistory(rawHistory);
        }
      } catch (e) {
        console.error('Failed to load from localStorage:', e);
      }
    }
  };

  // Load ALL scores for a specific JD on-demand via /jd/{jd_id} (paginated, deduped latest-per-resume)
  const loadJdScores = async (jdId: string, jdTitle?: string) => {
    try {
      const firstPage = await scoringService.getJDScoredResumes(jdId, { page_size: 500, page: 1 });
      let allItems = [...(firstPage.items || [])];

      for (let page = 2; page <= (firstPage.total_pages || 1); page++) {
        const nextPage = await scoringService.getJDScoredResumes(jdId, { page_size: 500, page });
        allItems = allItems.concat(nextPage.items || []);
      }

      const scores = allItems.map((item: any) => {
        const matchScore = Math.round(item.overall_score || 0);
        let matchStatus = 'No Match';
        if (item.match_status === 'exact_match' || item.match_status === 'Exact Match') {
          matchStatus = 'Exact Match';
        } else if (item.match_status === 'partial_match' || item.match_status === 'Partial Match') {
          matchStatus = 'Partial Match';
        } else if (item.match_status === 'no_match' || item.match_status === 'No Match') {
          matchStatus = 'No Match';
        } else if (matchScore >= 70) {
          matchStatus = 'Exact Match';
        } else if (matchScore >= 50) {
          matchStatus = 'Partial Match';
        }
        return {
          id: item.id,
          resumeId: item.resume_id || '',
          candidateName: item.candidate_name || 'Unknown',
          candidateEmail: item.candidate_email || '',
          email: item.candidate_email || '',
          phone: item.phone || '',
          overall_score: matchScore,
          matchScore: matchScore,
          matchStatus: matchStatus,
          scorePercentage: matchScore,
          scoredDate: item.created_at || new Date().toISOString(),
          scoredBy: item.scored_by_name || item.scored_by || 'System',
          version: item.resume_version || 1,
          resumeVersion: item.resume_version || 1,
          source: 'database',
          status: 'completed',
          errorReason: '',
          experience: item.experience_years ? `${item.experience_years} years` : undefined,
          education: item.education,
          certifications: item.certifications || [],
          aiSummary: item.ai_summary,
          strengths: item.strengths || [],
          gaps: item.gaps || [],
          title: item.current_title,
          currentCompany: item.current_company,
          location: item.location,
          skills: item.skills || [],
          matchedSkills: item.matched_skills || item.skills || [],
          missingSkills: item.missing_skills || item.gaps || [],
          scoreBreakdown: item.score_breakdown || [],
          criteriaScores: item.criteria_scores || {},
          technicalSkills: item.technical_skills || item.skills || [],
          softSkills: item.soft_skills || [],
          experienceDetails: item.experience_details || [],
          educationDetails: item.education_details || [],
          languages: item.languages || [],
          professionalSummary: item.professional_summary || item.ai_summary || '',
        };
      });

      scores.sort((a: any, b: any) => (b.overall_score || 0) - (a.overall_score || 0));

      setScoredHistory(prev => {
        const existing = prev.find(h => h.jobId === jdId);
        const title = jdTitle || existing?.jobTitle || 'Unknown Job';
        const updatedEntry: ScoredResumeData = {
          id: jdId,
          jobId: jdId,
          jobTitle: title,
          scoredAt: scores[0]?.scoredDate ? new Date(scores[0].scoredDate) : (existing?.scoredAt || new Date()),
          source: 'database' as const,
          totalScored: firstPage.total || scores.length,
          scoredResumes: scores,
        };
        if (existing) {
          return prev.map(h => h.jobId === jdId ? updatedEntry : h);
        } else {
          return [updatedEntry, ...prev];
        }
      });
    } catch (error) {
      console.error('[loadJdScores] Failed to load scores for JD:', jdId, error);
    }
  };

  const saveScoredHistory = async (data: ScoredResumeData) => {
    toast.success('Scoring completed! Refreshing data...');

    // Update URL to persist the view across refreshes
    router.push(`/recruitment/resume-scoring?jd_id=${data.jobId}`);

    // Refresh data from API to get the latest scores
    await loadScoredHistory();
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch JDs from tenant database - only published JDs for scoring dropdown
      const [jdResponse, resumeResponse, folderResponse] = await Promise.all([
        jdService.list({ status: 'published', page_size: 100, source: 'my-jds' }),
        resumeService.list({ page_size: 500, include_archived: true }).catch(() => ({ items: [] })),
        folderService.list().catch(() => []),
      ]);

      // Convert JDResponse to Job type for component compatibility
      const convertedJobs = jdResponse.items.map((jd: JDResponse) => ({
        id: jd.id,
        title: jd.title,
        department: jd.department || 'General',
        location: jd.location || '',
        status: jd.status === 'published' ? 'Published' :
                jd.status === 'draft' ? 'Draft' :
                jd.status === 'archived' ? 'Archived' : 'Draft',
        applicants: jd.applicants_count || 0,
        employmentType: jd.employment_type || 'Full-time',
        experience: jd.experience_min ? `${jd.experience_min}+ years` : undefined,
        job_id: jd.job_id,
        current_version: jd.current_version,
      }));

      // Convert API Resume to component Resume type
      const convertedResumes: Resume[] = resumeResponse.items.map((r: any) => ({
        id: r.id,
        name: r.candidate_name || r.file_name?.replace(/\.[^/.]+$/, '') || 'Unknown',
        email: r.email || 'No email',
        phone: r.phone || 'No phone',
        title: r.current_title || 'N/A',
        experience: r.experience_years ? `${r.experience_years} years` : 'N/A',
        education: r.education?.[0]?.degree || 'N/A',
        location: r.location || 'N/A',
        skills: r.skills || [],
        source: (r.source === 'ai_match' ? 'TalentFlow' : 'Manual') as 'Manual' | 'TalentFlow',
        folderId: r.folder_id || '',
        uploadDate: r.created_at,
        attachments: r.file_name ? 1 : 0,
        uploadedBy: r.uploaded_by || 'System',
        // Version info for scoring version selection
        version: r.version || 1,
        versionCount: r.version_count || 1,
        fileName: r.file_name,
        fileSizeKb: r.file_size_kb,
        isArchived: r.is_archived || false,
        archivedAt: r.archived_at,
      }));

      // Convert API Folder to component Folder type
      const convertApiFolder = (f: any): Folder => ({
        id: f.id,
        name: f.name,
        count: f.resume_count || 0,
        parentId: f.parent_id,
        children: f.children?.map(convertApiFolder),
      });
      const convertedFolders: Folder[] = (Array.isArray(folderResponse) ? folderResponse : []).map(convertApiFolder);

      setJobs(convertedJobs);
      setResumes(convertedResumes);
      setFolders(convertedFolders);

    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error('Failed to load data from database');
    } finally {
      setLoading(false);
    }
  };

  // Refresh only resumes (lightweight, no loading state)
  const refreshResumes = async () => {
    try {
      const resumeResponse = await resumeService.list({ page_size: 500, include_archived: true });
      const convertedResumes: Resume[] = resumeResponse.items.map((r: any) => ({
        id: r.id,
        name: r.candidate_name || r.file_name?.replace(/\.[^/.]+$/, '') || 'Unknown',
        email: r.email || 'No email',
        phone: r.phone || 'No phone',
        title: r.current_title || 'N/A',
        experience: r.experience_years ? `${r.experience_years} years` : 'N/A',
        education: r.education?.[0]?.degree || 'N/A',
        location: r.location || 'N/A',
        skills: r.skills || [],
        source: (r.source === 'ai_match' ? 'TalentFlow' : 'Manual') as 'Manual' | 'TalentFlow',
        folderId: r.folder_id || '',
        uploadDate: r.created_at,
        attachments: r.file_name ? 1 : 0,
        uploadedBy: r.uploaded_by || 'System',
        version: r.version || 1,
        versionCount: r.version_count || 1,
        fileName: r.file_name,
        fileSizeKb: r.file_size_kb,
        isArchived: r.is_archived || false,
        archivedAt: r.archived_at,
      }));
      setResumes(convertedResumes);
      console.log('[ResumeScoringRoute] Refreshed resumes from API:', convertedResumes.length);
    } catch (error) {
      console.error('[ResumeScoringRoute] Failed to refresh resumes:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-gray-800" />
        <span className="ml-3 text-gray-600">Loading job descriptions...</span>
      </div>
    );
  }

  return (
    <FeatureGate feature="resume_scoring">
      <ResumeScoringPage
        jobs={jobs}
        resumes={resumes}
        folders={folders}
        scoredHistory={scoredHistory}
        onSaveScores={saveScoredHistory}
        onRefreshHistory={loadScoredHistory}
        onLoadJdScores={loadJdScores}
        onRefreshResumes={refreshResumes}
        initialJdId={initialJdId}
        initialScoreId={initialScoreId}
        initialShowProgress={showProgress}
        initialNewScoring={initialNewScoring}
        pendingScoringData={pendingScoringData}
        batchProgress={batchProgress}
      />
    </FeatureGate>
  );
}
