'use client';

import { useState, useEffect } from 'react';
import ResumeScoringPage from '@/components/ResumeScoringPage';
import { jdService, JDResponse } from '@/lib/services/jdService';
import { resumeService, folderService } from '@/lib/services/resumeService';
import { Job, Resume, Folder } from '@/lib/types/types';
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

export default function ResumeScoringRoute() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
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
        const history = parsed.map((item: any) => ({
          ...item,
          scoredAt: new Date(item.scoredAt),
        }));
        setScoredHistory(history);
      }
    } catch (error) {
      console.error('Failed to load scored history:', error);
    }
  };

  const saveScoredHistory = (data: ScoredResumeData) => {
    const newHistory = [data, ...scoredHistory];
    setScoredHistory(newHistory);

    // Save to localStorage
    try {
      localStorage.setItem('scoredHistory', JSON.stringify(newHistory));
      toast.success('Scoring results saved successfully');
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
      const convertedJobs: Job[] = jdResponse.items.map((jd: JDResponse) => ({
        id: jd.id,
        title: jd.title,
        department: jd.department || 'General',
        location: jd.location || 'Remote',
        status: jd.status === 'published' ? 'Published' :
                jd.status === 'draft' ? 'Draft' :
                jd.status === 'archived' ? 'Archived' : 'Active',
        postedDate: jd.created_at,
        applicants: jd.applicants_count || 0,
        description: jd.description,
        requirements: jd.must_have_skills || [],
        experience: jd.experience_min && jd.experience_max
          ? `${jd.experience_min}-${jd.experience_max} years`
          : jd.experience_min
          ? `${jd.experience_min}+ years`
          : 'Not specified',
        salary: jd.salary_min && jd.salary_max
          ? `${jd.salary_currency || 'USD'} ${jd.salary_min?.toLocaleString()}-${jd.salary_max?.toLocaleString()}`
          : 'Not specified',
        employmentType: jd.employment_type || 'Full-time',
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
        matchScore: 0,
        appliedDate: r.created_at,
        status: 'New',
        source: r.source || 'manual_upload',
        folderId: r.folder_id,
        certifications: r.certifications || [],
      }));

      // Convert API Folder to component Folder type
      const convertedFolders: Folder[] = (Array.isArray(folderResponse) ? folderResponse : []).map((f: any) => ({
        id: f.id,
        name: f.name,
        parentId: f.parent_id,
        resumeCount: f.resume_count || 0,
        children: f.children || [],
        color: '#3B82F6',
      }));

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
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
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
