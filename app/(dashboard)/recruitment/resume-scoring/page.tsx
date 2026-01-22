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
  const [showProgress, setShowProgress] = useState(false);
  const [pendingScoringData, setPendingScoringData] = useState<{
    jobId: string;
    jobTitle: string;
    resumeIds: string[];
    resumeNames: string[];
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
      status: 'queued' | 'processing' | 'completed' | 'failed';
      score?: number;
      errorMessage?: string;
    }[];
  } | null>(null);

  useEffect(() => {
    // Check if there's a jd_id in URL params
    const jdId = searchParams.get('jd_id');
    const showProgressParam = searchParams.get('show_progress');
    const startScoringParam = searchParams.get('start_scoring');
    const batchIdParam = searchParams.get('batch_id');

    if (jdId) {
      console.log('[ResumeScoringRoute] Found jd_id in URL:', jdId);
      setInitialJdId(jdId);
    }
    if (showProgressParam === 'true') {
      console.log('[ResumeScoringRoute] Show progress requested');
      setShowProgress(true);
    }

    // Handle batch_id from async scoring (Celery)
    if (batchIdParam) {
      console.log('[ResumeScoringRoute] Found batch_id:', batchIdParam);
      setPendingBatchId(batchIdParam);

      // Immediately fetch current batch status from API (don't wait for poll interval)
      const fetchInitialStatus = async () => {
        try {
          const status = await scoringService.getBatchStatus(batchIdParam);
          console.log('[ResumeScoringRoute] Initial batch status:', status);
          setBatchProgress({
            jobId: status.jd_id,
            jobTitle: status.jd_title,
            total: status.total,
            queued: status.queued,
            processing: status.processing,
            completed: status.completed,
            failed: status.failed,
            items: status.items?.map(item => ({
              resumeId: item.resume_id,
              candidateName: item.candidate_name || 'Unknown',
              status: item.status,
              score: item.overall_score,
              errorMessage: item.error_message,
            })),
          });
        } catch (e) {
          console.error('[ResumeScoringRoute] Error fetching initial status:', e);
          // Fallback to sessionStorage data if API fails
          try {
            const storedData = sessionStorage.getItem('pendingScoringBatch');
            if (storedData) {
              const data = JSON.parse(storedData);
              setBatchProgress({
                jobId: data.jobId,
                jobTitle: data.jobTitle,
                total: data.totalResumes,
                queued: data.totalResumes,
                processing: 0,
                completed: 0,
                failed: 0,
              });
            }
          } catch (e2) {
            console.error('[ResumeScoringRoute] Error reading stored data:', e2);
          }
        }
      };
      fetchInitialStatus();
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

    fetchData();
    loadScoredHistory();
  }, []);

  // Poll for batch status when we have a pending batch
  useEffect(() => {
    if (!pendingBatchId) return;

    const pollInterval = setInterval(async () => {
      try {
        const status = await scoringService.getBatchStatus(pendingBatchId);
        console.log('[ResumeScoringRoute] Batch status:', status);

        // Map items from API response to our format
        const items = status.items?.map(item => ({
          resumeId: item.resume_id,
          candidateName: item.candidate_name || 'Unknown',
          status: item.status,
          score: item.overall_score,
          errorMessage: item.error_message,
        }));

        setBatchProgress({
          jobId: status.jd_id,
          jobTitle: status.jd_title,
          total: status.total,
          queued: status.queued,
          processing: status.processing,
          completed: status.completed,
          failed: status.failed,
          items: items,
        });

        // Stop polling when batch is complete
        if (status.status === 'completed' || status.status === 'failed') {
          console.log('[ResumeScoringRoute] Batch completed, stopping poll');
          clearInterval(pollInterval);
          setPendingBatchId(null);

          // Clear the pending batch from sessionStorage now that scoring is done
          try {
            sessionStorage.removeItem('pendingScoringBatch');
            console.log('[ResumeScoringRoute] Cleared pendingScoringBatch from sessionStorage');
          } catch (e) {
            console.error('[ResumeScoringRoute] Error clearing pendingScoringBatch:', e);
          }

          // Reload scored history to show new results, then redirect
          setTimeout(async () => {
            await loadScoredHistory();
            // Redirect to show the scored results after history is loaded
            window.location.href = `/recruitment/resume-scoring?jd_id=${status.jd_id}`;
          }, 2000);
        }
      } catch (e) {
        console.error('[ResumeScoringRoute] Error polling batch status:', e);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [pendingBatchId]);

  const loadScoredHistory = async () => {
    // Load scored history from the API - fetch scored resumes for all JDs (including disabled/archived)
    try {
      // Get list of all JDs (no status filter - include published, disabled, archived)
      const jdResponse = await jdService.list({ page_size: 100 });

      const historyPromises = jdResponse.items.map(async (jd: JDResponse) => {
        try {
          const scoredResponse = await jdService.getScoredResumes(jd.id, { page_size: 100 });
          if (scoredResponse.items && scoredResponse.items.length > 0) {
            // Convert API response to ScoredResumeData format - same as JobDetailView
            const convertedResumes = scoredResponse.items.map((item: any) => {
              // Map match_status from API to display format - use "Exact Match" for consistency
              let matchStatus = 'No Match';
              if (item.match_status === 'exact_match' || item.match_status === 'excellent') {
                matchStatus = 'Exact Match';
              } else if (item.match_status === 'partial_match' || item.match_status === 'partial') {
                matchStatus = 'Partial Match';
              }

              // Calculate matchScore from overall_score
              const matchScore = Math.round(item.overall_score || 0);

              return {
                id: item.id,
                candidateName: item.candidate_name || 'Unknown',
                candidateEmail: item.candidate_email || '',
                email: item.candidate_email || '',
                phone: item.phone || '',
                matchScore: matchScore,
                matchStatus: matchStatus,
                scorePercentage: matchScore, // Also include scorePercentage for CandidateScoringDetailPage
                scoredDate: item.created_at || new Date().toISOString(),
                scoredBy: item.scored_by_name || 'System',
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
              };
            });

            return {
              id: jd.id,
              jobId: jd.id,
              jobTitle: jd.title,
              scoredAt: new Date(scoredResponse.items[0]?.created_at || new Date()),
              source: 'database' as const,
              totalScored: scoredResponse.total || convertedResumes.length,
              scoredResumes: convertedResumes,
            };
          }
          return null;
        } catch {
          return null;
        }
      });

      const results = await Promise.all(historyPromises);
      const validHistory = results.filter((item): item is NonNullable<typeof item> => item !== null) as ScoredResumeData[];

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

  const saveScoredHistory = (data: ScoredResumeData) => {
    // Check if there's already an entry for the same JD
    const existingIndex = scoredHistory.findIndex(item => item.jobId === data.jobId);

    let newHistory: ScoredResumeData[];

    if (existingIndex !== -1) {
      // Merge with existing entry - combine scored resumes and remove duplicates
      const existingItem = scoredHistory[existingIndex];

      // Get existing resume IDs to avoid duplicates
      const existingResumeIds = new Set(existingItem.scoredResumes.map(r => r.id));

      // Filter out duplicates from new resumes
      const newResumes = data.scoredResumes.filter(r => !existingResumeIds.has(r.id));

      // Create merged entry
      const mergedEntry: ScoredResumeData = {
        ...existingItem,
        scoredAt: new Date(), // Update timestamp to latest
        totalScored: existingItem.totalScored + newResumes.length,
        scoredResumes: [...existingItem.scoredResumes, ...newResumes],
      };

      // Replace existing entry and move to top
      newHistory = [
        mergedEntry,
        ...scoredHistory.filter((_, idx) => idx !== existingIndex)
      ];

      toast.success(`Added ${newResumes.length} new candidate(s) to existing scoring for "${data.jobTitle}"`);
    } else {
      // New JD entry - add to front
      newHistory = [data, ...scoredHistory];
      toast.success('Scoring results saved successfully');
    }

    setScoredHistory(newHistory);

    // Update URL to persist the view across refreshes
    router.push(`/recruitment/resume-scoring?jd_id=${data.jobId}`);

    // Save to localStorage
    try {
      localStorage.setItem('scoredHistory', JSON.stringify(newHistory));
    } catch (error) {
      console.error('Failed to save scored history:', error);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch JDs from tenant database - only published JDs for scoring dropdown
      const [jdResponse, resumeResponse, folderResponse] = await Promise.all([
        jdService.list({ status: 'published', page_size: 100 }),
        resumeService.list({ page_size: 100 }).catch(() => ({ items: [] })),
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
        uploadedBy: 'System',
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

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-gray-800" />
        <span className="ml-3 text-gray-600">Loading job descriptions...</span>
      </div>
    );
  }

  return (
    <ResumeScoringPage
      jobs={jobs}
      resumes={resumes}
      folders={folders}
      scoredHistory={scoredHistory}
      onSaveScores={saveScoredHistory}
      initialJdId={initialJdId}
      initialShowProgress={showProgress}
      pendingScoringData={pendingScoringData}
      batchProgress={batchProgress}
    />
  );
}
