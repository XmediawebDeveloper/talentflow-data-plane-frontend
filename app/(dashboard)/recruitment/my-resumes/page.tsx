'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Clock, Copy, GitBranch, Upload, Loader2 } from 'lucide-react';
import ResumeTable from '@/components/ResumeTable';
import StatsCards from '@/components/StatsCards';
import SearchFilterBarCompact from '@/components/SearchFilterBarCompact';
import FolderTree from '@/components/FolderTree';
import BulkActionsBar from '@/components/BulkActionsBar';
import UploadHistoryPanel from '@/components/UploadHistoryPanel';
import UploadModal from '@/components/UploadModal';
import DuplicateResumeModal, { DuplicateFile, ExistingResume } from '@/components/DuplicateResumeModal';
import ResumeQuickViewModal from '@/components/ResumeQuickViewModal';
import { Resume, Folder } from '@/lib/types/types';
import { resumeService, folderService } from '@/lib/services/resumeService';
import { Resume as ApiResume, Folder as ApiFolder } from '@/lib/services/resumeService';
import { toast } from 'sonner';

export default function MyResumesPage() {
  const router = useRouter();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedResumes, setSelectedResumes] = useState<string[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({});
  const [sortBy, setSortBy] = useState('date');
  const [folderTreeWidth, setFolderTreeWidth] = useState(240);

  // Modal states
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [showUploadHistory, setShowUploadHistory] = useState(false);
  const [uploadHistory, setUploadHistory] = useState<any[]>([]);
  const [quickViewResume, setQuickViewResume] = useState<Resume | null>(null);

  // Duplicate detection state
  const [duplicateFiles, setDuplicateFiles] = useState<DuplicateFile[]>([]);
  const [pendingUploadFolderId, setPendingUploadFolderId] = useState<string | undefined>();
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resumeResponse, folderResponse] = await Promise.all([
        resumeService.list({ source: 'my-resumes', page_size: 100 }),
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
        uploadedBy: 'current-user',
        currentCompany: r.current_company,
        previousCompany: r.previous_company,
        noticePeriod: r.notice_period,
        lastUpdated: r.updated_at,
        // Extended fields for detailed view
        professionalSummary: r.professional_summary,
        technicalSkills: r.technical_skills,
        softSkills: r.soft_skills,
        educationDetails: r.education?.map((edu: any) => ({
          degree: edu.degree || '',
          school: edu.school || edu.institution || '',
          location: edu.location || '',
          year: edu.year || edu.graduation_year || '',
          gpa: edu.gpa || '',
          honors: edu.honors || '',
        })),
        experienceDetails: r.experience?.map((exp: any) => ({
          title: exp.title || exp.position || '',
          company: exp.company || '',
          location: exp.location || '',
          startDate: exp.start_date || '',
          endDate: exp.end_date || 'Present',
          duration: exp.duration || '',
          description: exp.description || '',
          achievements: exp.achievements || exp.responsibilities || [],
        })),
        certifications: r.certifications?.map((cert: any) => ({
          name: cert.name || cert.title || '',
          issuer: cert.issuer || cert.organization || '',
          date: cert.date || cert.issued_date || '',
          credentialId: cert.credential_id || cert.credentialId || '',
        })),
        languages: r.languages?.map((lang: any) => ({
          name: typeof lang === 'string' ? lang : (lang.name || lang.language || ''),
          proficiency: typeof lang === 'string' ? 'Fluent' : (lang.proficiency || lang.level || 'Fluent'),
        })),
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
      toast.error('Failed to load resumes');
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

  const handleCreateFolder = async (name: string, parentId?: string) => {
    try {
      console.log('[DEBUG] Creating folder:', { name, parentId });
      const newFolder = await folderService.create(name, parentId);
      console.log('[DEBUG] Folder created:', newFolder);
      const converted: Folder = {
        id: newFolder.id,
        name: newFolder.name,
        count: 0,
        parentId: newFolder.parent_id,
      };
      setFolders(prev => [...prev, converted]);
      toast.success('Folder created');
    } catch (error: any) {
      console.error('[DEBUG] Failed to create folder:', error);
      const message = error?.response?.data?.detail || error?.message || 'Unknown error';
      toast.error(`Failed to create folder: ${message}`);
    }
  };

  const handleRenameFolder = async (id: string, name: string) => {
    try {
      await folderService.update(id, { name });
      setFolders(prev => prev.map(f => f.id === id ? { ...f, name } : f));
      toast.success('Folder renamed');
    } catch (error) {
      toast.error('Failed to rename folder');
    }
  };

  const handleDeleteFolder = async (id: string) => {
    try {
      await folderService.delete(id);
      setFolders(prev => prev.filter(f => f.id !== id));
      toast.success('Folder deleted');
    } catch (error) {
      toast.error('Failed to delete folder');
    }
  };

  const handleUploadResumes = async (files: File[], folderId?: string): Promise<{
    success: boolean;
    error?: string;
    existingResume?: { id: string; candidateName: string; uploadedAt?: string };
  }> => {
    // For single file, use single upload endpoint
    if (files.length === 1) {
      try {
        const r = await resumeService.upload(files[0], folderId);
        const converted = convertApiResume(r);
        setResumes(prev => [converted, ...prev]);
        toast.success('Resume uploaded successfully');
        return { success: true };
      } catch (error: any) {
        // Check for duplicate error (409 Conflict)
        if (error?.response?.status === 409) {
          const detail = error?.response?.data?.detail;
          const existingResume = detail?.existing_resume;
          const isExactDuplicate = detail?.is_exact_duplicate ?? true;
          const contentDifferences = detail?.content_differences || [];

          if (existingResume) {
            // Show duplicate modal instead of simple error
            const duplicateFile: DuplicateFile = {
              file: files[0],
              existingResume: {
                id: existingResume.id,
                candidate_name: existingResume.candidate_name || existingResume.file_name || 'Unknown',
                email: existingResume.email || '',
                folder_name: existingResume.folder_name,
                folder_path: existingResume.folder_path || 'My Resumes',
                upload_date: existingResume.upload_date || '',
                file_size: existingResume.file_size || 0,
                file_name: existingResume.file_name || '',
                version: existingResume.version || 1,
              },
              contentDifferences: contentDifferences,
              isDuplicate: isExactDuplicate,
            };

            setDuplicateFiles([duplicateFile]);
            setPendingUploadFolderId(folderId);
            setIsUploadModalOpen(false);
            setIsDuplicateModalOpen(true);

            return { success: true }; // Return success to close upload modal
          }

          return {
            success: false,
            error: 'This resume already exists in the system.',
          };
        } else {
          return { success: false, error: `Failed to upload ${files[0].name}` };
        }
      }
    }

    // For multiple files, use bulk upload with async processing
    try {
      const toastId = toast.loading(`Uploading ${files.length} resumes...`);

      // Start bulk upload - returns immediately with batch info
      const batch = await resumeService.uploadBulk(files, folderId);

      toast.loading(`Processing ${batch.total_files} resumes...`, { id: toastId });

      // Poll for batch status until complete
      const pollInterval = setInterval(async () => {
        try {
          const status = await resumeService.getBatchStatus(batch.id);

          const processed = status.completed + status.errors;
          const total = status.total_files;
          const percentage = Math.round((processed / total) * 100);

          toast.loading(`Processing resumes: ${processed}/${total} (${percentage}%)`, { id: toastId });

          // Check if batch is complete
          if (status.status === 'completed' || status.pending === 0) {
            clearInterval(pollInterval);

            if (status.errors > 0) {
              toast.warning(
                `Upload complete: ${status.completed} succeeded, ${status.errors} failed`,
                { id: toastId, duration: 5000 }
              );
            } else {
              toast.success(
                `Successfully uploaded ${status.completed} resumes`,
                { id: toastId, duration: 3000 }
              );
            }

            // Refresh the resume list
            fetchData();
          }
        } catch (pollError) {
          console.error('Error polling batch status:', pollError);
        }
      }, 2000); // Poll every 2 seconds

      // Set a timeout to stop polling after 10 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
      }, 600000);

      return { success: true };
    } catch (error: any) {
      // Check for duplicate error (409 Conflict)
      if (error?.response?.status === 409) {
        const detail = error?.response?.data?.detail;
        return {
          success: false,
          error: detail?.message || 'All files are duplicates',
        };
      }
      return { success: false, error: 'Failed to start bulk upload' };
    }
  };

  // Helper function to convert API resume to component type
  const convertApiResume = (r: ApiResume): Resume => ({
    id: r.id,
    name: r.candidate_name || r.file_name?.replace(/\.[^/.]+$/, '') || 'Unknown',
    email: r.email || 'No email',
    phone: r.phone || 'No phone',
    title: r.current_title || 'N/A',
    experience: r.experience_years ? `${r.experience_years} years` : 'N/A',
    education: r.education?.[0]?.degree || 'N/A',
    location: r.location || 'N/A',
    skills: r.skills || [],
    source: 'Manual',
    folderId: r.folder_id || '',
    uploadDate: r.created_at,
    attachments: 1,
    uploadedBy: 'current-user',
    currentCompany: r.current_company,
    previousCompany: r.previous_company,
    noticePeriod: r.notice_period,
    lastUpdated: r.updated_at,
    professionalSummary: r.professional_summary,
    technicalSkills: r.technical_skills,
    softSkills: r.soft_skills,
    educationDetails: r.education?.map((edu: any) => ({
      degree: edu.degree || '',
      school: edu.school || edu.institution || '',
      location: edu.location || '',
      year: edu.year || edu.graduation_year || '',
      gpa: edu.gpa || '',
      honors: edu.honors || '',
    })),
    experienceDetails: r.experience?.map((exp: any) => ({
      title: exp.title || exp.position || '',
      company: exp.company || '',
      location: exp.location || '',
      startDate: exp.start_date || '',
      endDate: exp.end_date || 'Present',
      duration: exp.duration || '',
      description: exp.description || '',
      achievements: exp.achievements || exp.responsibilities || [],
    })),
    certifications: r.certifications?.map((cert: any) => ({
      name: cert.name || cert.title || '',
      issuer: cert.issuer || cert.organization || '',
      date: cert.date || cert.issued_date || '',
      credentialId: cert.credential_id || cert.credentialId || '',
    })),
    languages: r.languages?.map((lang: any) => ({
      name: typeof lang === 'string' ? lang : (lang.name || lang.language || ''),
      proficiency: typeof lang === 'string' ? 'Fluent' : (lang.proficiency || lang.level || 'Fluent'),
    })),
  });

  // Filter resumes (user filtering is done by API via source: 'my-resumes')
  const filteredResumes = resumes.filter(r => {
    const matchesFolder = !selectedFolder || r.folderId === selectedFolder;
    const matchesSearch = !searchQuery ||
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.title.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFolder && matchesSearch;
  });

  // Stats (all resumes returned are user's own resumes)
  const totalResumes = resumes.length;
  const appliedResumes = 0; // Would need job applications data
  const availableResumes = totalResumes - appliedResumes;

  // Handle duplicate resolution
  const handleResolveDuplicates = async (resolutions: { fileIndex: number; action: 'discard' | 'overwrite' | 'version' }[]) => {
    const toastId = toast.loading('Processing duplicate resolution...');

    try {
      for (const resolution of resolutions) {
        const duplicateFile = duplicateFiles[resolution.fileIndex];
        if (!duplicateFile) continue;

        if (resolution.action === 'discard') {
          // Just skip this file
          toast.success('New resume discarded, keeping existing', { id: toastId });
        } else {
          // Use the resolve duplicate and upload endpoint
          const result = await resumeService.resolveDuplicateAndUpload(
            duplicateFile.file,
            duplicateFile.existingResume.id,
            resolution.action,
            pendingUploadFolderId
          );

          const converted = convertApiResume(result);
          setResumes(prev => [converted, ...prev]);

          if (resolution.action === 'overwrite') {
            // Remove the old resume from the list
            setResumes(prev => prev.filter(r => r.id !== duplicateFile.existingResume.id));
            toast.success('Resume overwritten successfully', { id: toastId });
          } else {
            toast.success(`Resume saved as version ${(duplicateFile.existingResume.version || 1) + 1}`, { id: toastId });
          }
        }
      }
    } catch (error: any) {
      console.error('Error resolving duplicates:', error);
      toast.error('Failed to resolve duplicate', { id: toastId });
    } finally {
      setDuplicateFiles([]);
      setPendingUploadFolderId(undefined);
      setIsDuplicateModalOpen(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-gray-800" />
        <span className="ml-3 text-gray-600">Loading resumes...</span>
      </div>
    );
  }

  return (
    <main className="flex-1 p-8 bg-gray-50">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">My Resume Database</h1>
          <p className="text-sm text-gray-600">Resumes uploaded by you</p>
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
          { type: 'total', value: totalResumes },
          { type: 'applied', value: appliedResumes },
          { type: 'available', value: availableResumes }
        ]}
      />

      {selectedResumes.length > 0 && (
        <div className="mt-6">
          <BulkActionsBar
            selectedCount={selectedResumes.length}
            onCancel={() => setSelectedResumes([])}
            onMoveToFolder={(folderId) => handleMoveToFolder(selectedResumes, folderId)}
            onApplyToJob={() => {}}
            onDelete={() => handleDeleteResumes(selectedResumes)}
            folders={folders}
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

        <div className="flex">
          <FolderTree
            folders={folders}
            selectedFolder={selectedFolder}
            onSelectFolder={setSelectedFolder}
            onCreateFolder={handleCreateFolder}
            onRenameFolder={handleRenameFolder}
            onDeleteFolder={handleDeleteFolder}
            onUploadToFolder={(folderId) => {
              setIsUploadModalOpen(true);
            }}
            resumes={filteredResumes}
            width={folderTreeWidth}
            onWidthChange={setFolderTreeWidth}
          />

          <ResumeTable
            resumes={filteredResumes}
            selectedResumes={selectedResumes}
            onSelectResume={handleSelectResume}
            onSelectAll={handleSelectAll}
            onQuickView={(resume) => setQuickViewResume(resume)}
            onApplyToJob={(resume) => console.log('Apply to job:', resume)}
            onDelete={(id) => handleDelete(id)}
            onMoveToFolder={handleMoveToFolder}
            folders={folders}
            onViewDetails={(resume) => router.push(`/recruitment/resume-view/${resume.id}`)}
          />
        </div>
      </div>

      {isUploadModalOpen && (
        <UploadModal
          folders={folders}
          tenant={null}
          onClose={() => setIsUploadModalOpen(false)}
          onUpload={handleUploadResumes}
          onCreateFolder={handleCreateFolder}
          onViewResume={(resumeId) => {
            setIsUploadModalOpen(false);
            router.push(`/recruitment/resume-detail/${resumeId}`);
          }}
        />
      )}

      {showUploadHistory && (
        <UploadHistoryPanel
          records={uploadHistory}
          onClose={() => setShowUploadHistory(false)}
          currentSource="my-resumes"
        />
      )}

      {quickViewResume && (
        <ResumeQuickViewModal
          resume={quickViewResume}
          onClose={() => setQuickViewResume(null)}
        />
      )}

      {/* Duplicate Resume Modal */}
      {isDuplicateModalOpen && duplicateFiles.length > 0 && (
        <DuplicateResumeModal
          duplicates={duplicateFiles}
          onClose={() => {
            setIsDuplicateModalOpen(false);
            setDuplicateFiles([]);
            setPendingUploadFolderId(undefined);
          }}
          onResolve={handleResolveDuplicates}
        />
      )}
    </main>
  );
}
