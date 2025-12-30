'use client';

import { useState, useEffect } from 'react';
import { Plus, Clock, Loader2 } from 'lucide-react';
import ResumeTable from '@/components/ResumeTable';
import StatsCards from '@/components/StatsCards';
import SearchFilterBarCompact from '@/components/SearchFilterBarCompact';
import BulkActionsBar from '@/components/BulkActionsBar';
import UploadHistoryPanel from '@/components/UploadHistoryPanel';
import UploadModal from '@/components/UploadModal';
import ResumeQuickViewModal from '@/components/ResumeQuickViewModal';
import { Resume, Folder } from '@/lib/types/types';
import { resumeService, folderService } from '@/lib/services/resumeService';
import { Resume as ApiResume, Folder as ApiFolder } from '@/lib/services/resumeService';
import { toast } from 'sonner';

export default function ResumeDatabasePage() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedResumes, setSelectedResumes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({});
  const [sortBy, setSortBy] = useState('date');

  // Modal states
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [showUploadHistory, setShowUploadHistory] = useState(false);
  const [uploadHistory, setUploadHistory] = useState<any[]>([]);
  const [viewingResume, setViewingResume] = useState<Resume | null>(null);

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
        source: (r.source === 'ai_match' ? 'TalentFlow' : 'Manual') as 'Manual' | 'TalentFlow',
        folderId: r.folder_id || '',
        uploadDate: r.created_at,
        attachments: r.file_name ? 1 : 0,
        uploadedBy: 'System',
      }));

      // Convert API Folder to component Folder type
      const convertApiFolder = (f: ApiFolder): Folder => ({
        id: f.id,
        name: f.name,
        count: f.resume_count || 0,
        parentId: f.parent_id,
        children: f.children?.map(convertApiFolder),
      });
      const convertedFolders: Folder[] = (Array.isArray(folderResponse) ? folderResponse : []).map(convertApiFolder);

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
    setSelectedResumes(selected ? filteredResumes.map(r => r.id) : []);
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

  const handleDeleteResumes = async (ids: string[]) => {
    try {
      await Promise.all(ids.map(id => resumeService.delete(id)));
      setResumes(prev => prev.filter(r => !ids.includes(r.id)));
      setSelectedResumes([]);
      toast.success(`${ids.length} resume(s) deleted`);
    } catch (error) {
      toast.error('Failed to delete resumes');
    }
  };

  const handleUploadResumes = async (files: File[], folderId?: string) => {
    for (const file of files) {
      try {
        const resume = await resumeService.upload(file, folderId);
        const converted: Resume = {
          id: resume.id,
          name: resume.candidate_name || resume.file_name?.replace(/\.[^/.]+$/, '') || 'Unknown',
          email: resume.email || 'No email',
          phone: resume.phone || 'No phone',
          title: resume.current_title || 'N/A',
          experience: resume.experience_years ? `${resume.experience_years} years` : 'N/A',
          education: resume.education?.[0]?.degree || 'N/A',
          location: resume.location || 'N/A',
          skills: resume.skills || [],
          source: 'Manual',
          folderId: resume.folder_id || '',
          uploadDate: resume.created_at,
          attachments: 1,
          uploadedBy: 'System',
        };
        setResumes(prev => [converted, ...prev]);
      } catch (error) {
        toast.error(`Failed to upload ${file.name}`);
      }
    }
    toast.success('Upload completed');
    setIsUploadModalOpen(false);
  };

  const handleCreateFolder = async (name: string, parentId?: string) => {
    try {
      const newFolder = await folderService.create(name, parentId);
      const converted: Folder = {
        id: newFolder.id,
        name: newFolder.name,
        count: 0,
        parentId: newFolder.parent_id,
      };
      setFolders(prev => [...prev, converted]);
      toast.success('Folder created');
    } catch (error) {
      toast.error('Failed to create folder');
    }
  };

  // Filter resumes
  const filteredResumes = resumes.filter(r => {
    const matchesSearch = !searchQuery ||
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.title.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  // Stats - calculate monthly uploads (last 30 days)
  const monthlyCount = resumes.filter(r => {
    const uploadDate = new Date(r.uploadDate);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return uploadDate >= thirtyDaysAgo;
  }).length;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-gray-800" />
        <span className="ml-3 text-gray-600">Loading resume database...</span>
      </div>
    );
  }

  return (
    <main className="flex-1 p-8 bg-gray-50">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Internal Resume Database</h1>
          <p className="text-sm text-gray-600">All resumes across your organization</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowUploadHistory(true)}
            className="flex items-center gap-2 border border-gray-300 px-4 py-2.5 rounded-md hover:bg-gray-50 transition-colors relative"
          >
            <Clock className="w-5 h-5" />
            Upload History
            {uploadHistory.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-xs w-5 h-5 flex items-center justify-center rounded-full">
                {uploadHistory.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="flex items-center gap-2 bg-gray-800 text-white px-6 py-2.5 rounded-md hover:bg-gray-900 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Upload Resume
          </button>
        </div>
      </div>

      <StatsCards
        cards={[
          { type: 'total', value: resumes.length },
          { type: 'monthly', value: monthlyCount }
        ]}
      />

      {selectedResumes.length > 0 && (
        <div className="mt-6">
          <BulkActionsBar
            selectedCount={selectedResumes.length}
            onCancel={() => setSelectedResumes([])}
            onApplyToJob={() => {}}
            onDelete={() => handleDeleteResumes(selectedResumes)}
            onResumeScoring={() => {}}
            onAssessment={() => {}}
          />
        </div>
      )}

      <div className="mt-6 bg-white rounded-lg shadow-sm border border-gray-200">
        <SearchFilterBarCompact
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          filters={filters}
          onFiltersChange={setFilters}
          sortBy={sortBy}
          onSortChange={setSortBy}
        />

        <ResumeTable
          resumes={filteredResumes}
          selectedResumes={selectedResumes}
          onSelectResume={handleSelectResume}
          onSelectAll={handleSelectAll}
          onQuickView={(resume) => setViewingResume(resume)}
          onApplyToJob={(resume) => console.log('Apply to job:', resume)}
          onDelete={(id) => handleDelete(id)}
          onViewDetails={(resume) => setViewingResume(resume)}
        />
      </div>

      {isUploadModalOpen && (
        <UploadModal
          folders={folders}
          onClose={() => setIsUploadModalOpen(false)}
          onUpload={handleUploadResumes}
          onCreateFolder={handleCreateFolder}
        />
      )}

      {showUploadHistory && (
        <UploadHistoryPanel
          records={uploadHistory}
          onClose={() => setShowUploadHistory(false)}
          currentSource="internal-db"
        />
      )}

      {viewingResume && (
        <ResumeQuickViewModal
          resume={viewingResume}
          onClose={() => setViewingResume(null)}
        />
      )}
    </main>
  );
}
