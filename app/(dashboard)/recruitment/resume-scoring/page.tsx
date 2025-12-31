'use client';

import { useState, useEffect } from 'react';
import ResumeScoringPage from '@/components/ResumeScoringPage';
import { jdService, JDResponse } from '@/lib/services/jdService';
import { resumeService, folderService } from '@/lib/services/resumeService';
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
  experience?: string;
}

export default function ResumeScoringRoute() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [resumes, setResumes] = useState<any[]>([]);
  const [folders, setFolders] = useState<any[]>([]);
  const [scoredHistory, setScoredHistory] = useState<ScoredResumeData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
    loadScoredHistory();
  }, []);

  const loadScoredHistory = () => {
    // Load scored history from localStorage
    try {
      const saved = localStorage.getItem('scoredHistory');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Convert date strings back to Date objects
        const rawHistory = parsed.map((item: any) => ({
          ...item,
          scoredAt: new Date(item.scoredAt),
        }));

        // Consolidate duplicates by jobId - merge entries with same JD
        const consolidatedMap = new Map<string, ScoredResumeData>();

        rawHistory.forEach((item: ScoredResumeData) => {
          if (consolidatedMap.has(item.jobId)) {
            const existing = consolidatedMap.get(item.jobId)!;
            // Get existing resume IDs to avoid duplicates
            const existingResumeIds = new Set(existing.scoredResumes.map((r: any) => r.id));
            // Filter out duplicates from current item
            const newResumes = item.scoredResumes.filter((r: any) => !existingResumeIds.has(r.id));

            // Keep the most recent timestamp
            const latestDate = new Date(existing.scoredAt) > new Date(item.scoredAt)
              ? existing.scoredAt
              : item.scoredAt;

            // Merge
            consolidatedMap.set(item.jobId, {
              ...existing,
              scoredAt: latestDate,
              totalScored: existing.scoredResumes.length + newResumes.length,
              scoredResumes: [...existing.scoredResumes, ...newResumes],
            });
          } else {
            consolidatedMap.set(item.jobId, item);
          }
        });

        // Convert back to array and sort by date (most recent first)
        const consolidatedHistory = Array.from(consolidatedMap.values())
          .sort((a, b) => new Date(b.scoredAt).getTime() - new Date(a.scoredAt).getTime());

        // Save consolidated history back if there were duplicates
        if (consolidatedHistory.length < rawHistory.length) {
          console.log('[ResumeScoringPage] Consolidated duplicates:', rawHistory.length, '->', consolidatedHistory.length);
          localStorage.setItem('scoredHistory', JSON.stringify(consolidatedHistory));
        }

        setScoredHistory(consolidatedHistory);
      }
    } catch (error) {
      console.error('Failed to load scored history:', error);
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
      // Fetch JDs from tenant database
      const [jdResponse, resumeResponse, folderResponse] = await Promise.all([
        jdService.list({ page_size: 100 }),
        resumeService.list({ page_size: 100 }).catch(() => ({ items: [] })),
        folderService.list().catch(() => []),
      ]);

      // Convert JDResponse to Job type for component compatibility
      const convertedJobs = jdResponse.items.map((jd: JDResponse) => ({
        id: jd.id,
        title: jd.title,
        department: jd.department || 'General',
        location: jd.location || 'Remote',
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
    />
  );
}
