'use client';

import { useState, useEffect } from 'react';
import ResumeTable from '@/components/ResumeTable';
import { resumeService, folderService } from '@/lib/services/resumeService';
import { Resume as ApiResume, Folder as ApiFolder } from '@/lib/services/resumeService';
import { Resume, Folder } from '@/lib/types/types';
import { Database, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ResumeDatabaseRoute() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedResumes, setSelectedResumes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resumeResponse, folderResponse] = await Promise.all([
        resumeService.list({ page_size: 100 }),
        folderService.list().catch(() => []),
      ]);

      // Convert API Resume to component Resume type
      const convertedResumes: Resume[] = resumeResponse.items.map((r: ApiResume) => ({
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
      const convertedFolders: Folder[] = (Array.isArray(folderResponse) ? folderResponse : []).map((f: ApiFolder) => ({
        id: f.id,
        name: f.name,
        parentId: f.parent_id,
        resumeCount: f.resume_count || 0,
        children: f.children || [],
        color: '#3B82F6',
      }));

      setResumes(convertedResumes);
      setFolders(convertedFolders);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error('Failed to load resume database');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectResume = (id: string) => {
    setSelectedResumes(prev =>
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    );
  };

  const handleSelectAll = (selected: boolean) => {
    setSelectedResumes(selected ? resumes.map(r => r.id) : []);
  };

  const handleDelete = async (id: string) => {
    try {
      await resumeService.delete(id);
      setResumes(prev => prev.filter(r => r.id !== id));
      setSelectedResumes(prev => prev.filter(r => r !== id));
      toast.success('Resume deleted');
    } catch (error) {
      toast.error('Failed to delete resume');
    }
  };

  const handleMoveToFolder = async (resumeIds: string[], folderId: string) => {
    try {
      await Promise.all(resumeIds.map(id => resumeService.move(id, folderId)));
      setResumes(prev => prev.map(r =>
        resumeIds.includes(r.id) ? { ...r, folderId } : r
      ));
      toast.success(`${resumeIds.length} resume(s) moved`);
    } catch (error) {
      toast.error('Failed to move resumes');
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-3 text-gray-600">Loading resume database...</span>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 bg-gray-50">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-purple-700 rounded-lg flex items-center justify-center shadow-md">
            <Database className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Internal Resume Database</h1>
            <p className="text-sm text-gray-600">Access your organization&apos;s centralized resume pool ({resumes.length} resumes)</p>
          </div>
        </div>
      </div>
      <ResumeTable
        resumes={resumes}
        selectedResumes={selectedResumes}
        onSelectResume={handleSelectResume}
        onSelectAll={handleSelectAll}
        onQuickView={(resume) => console.log('Quick view:', resume)}
        onApplyToJob={(resume) => console.log('Apply to job:', resume)}
        onDelete={handleDelete}
        onMoveToFolder={handleMoveToFolder}
        folders={folders}
      />
    </div>
  );
}
