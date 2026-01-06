'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Copy, GitBranch, Upload, Loader2, Search, History, X, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import ResumeTable from '@/components/ResumeTable';
import StatsCards from '@/components/StatsCards';
import SearchFilterBarCompact from '@/components/SearchFilterBarCompact';
import FolderTree from '@/components/FolderTree';
import BulkActionsBar from '@/components/BulkActionsBar';
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
  const [appliedSearchQuery, setAppliedSearchQuery] = useState(''); // For highlighting
  const [filters, setFilters] = useState({});
  const [sortBy, setSortBy] = useState('date');
  const [folderTreeWidth, setFolderTreeWidth] = useState(240);

  // Modal states
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadHistory, setUploadHistory] = useState<any[]>([]);
  const [quickViewResume, setQuickViewResume] = useState<Resume | null>(null);

  // Duplicate detection state
  const [duplicateFiles, setDuplicateFiles] = useState<DuplicateFile[]>([]);
  const [pendingUploadFolderId, setPendingUploadFolderId] = useState<string | undefined>();
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);

  // Upload history modal state
  const [isUploadHistoryModalOpen, setIsUploadHistoryModalOpen] = useState(false);

  useEffect(() => {
    fetchData();
    fetchUploadHistory();
  }, []);

  const fetchUploadHistory = async () => {
    try {
      const response = await resumeService.listUploadBatches(50);
      if (response?.batches) {
        const history = response.batches.map((batch: any) => ({
          id: batch.id,
          date: batch.date,
          fileName: batch.batch_name,
          totalFiles: batch.total_files,
          completed: batch.completed,
          pending: batch.pending,
          duplicated: batch.duplicates,
          versioned: batch.versions,
          errors: batch.errors,
          status: batch.status,
          source: 'my-resumes' as const,
          statuses: batch.items?.map((item: any) => ({
            id: item.id,
            fileName: item.file_name,
            status: item.status,
            errorMessage: item.error_message,
          })) || [],
        }));
        setUploadHistory(history);
      }
    } catch (error) {
      console.error('Failed to fetch upload history:', error);
    }
  };

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
    const confirmed = window.confirm('Are you sure you want to delete this resume?');
    if (!confirmed) return;

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
    // Find the folder to check if it's the root folder
    const folderToDelete = folders.find(f => f.id === id);

    // Prevent deletion of root folder
    if (folderToDelete && folderToDelete.name.toLowerCase() === 'root' && !folderToDelete.parentId) {
      toast.error('Root folder cannot be deleted');
      return;
    }

    // Count resumes in this folder
    const resumesInFolder = resumes.filter(r => r.folderId === id);

    if (resumesInFolder.length > 0) {
      // Confirm deletion with user
      const confirmed = window.confirm(
        `This folder contains ${resumesInFolder.length} resume(s). Deleting the folder will also delete all resumes inside. Are you sure?`
      );
      if (!confirmed) return;

      // Delete all resumes in the folder first
      try {
        await Promise.all(resumesInFolder.map(r => resumeService.delete(r.id)));
        setResumes(prev => prev.filter(r => r.folderId !== id));
      } catch (error) {
        toast.error('Failed to delete resumes in folder');
        return;
      }
    }

    try {
      await folderService.delete(id);
      setFolders(prev => prev.filter(f => f.id !== id));
      toast.success('Folder and its contents deleted');
    } catch (error) {
      toast.error('Failed to delete folder');
    }
  };

  // Helper function to find or create "root" folder
  const getOrCreateRootFolder = async (): Promise<string> => {
    // Check if "root" folder already exists
    const existingRoot = folders.find(f => f.name.toLowerCase() === 'root' && !f.parentId);
    if (existingRoot) {
      return existingRoot.id;
    }

    // Create "root" folder
    try {
      const newFolder = await folderService.create('root');
      const converted: Folder = {
        id: newFolder.id,
        name: newFolder.name,
        count: 0,
        parentId: newFolder.parent_id,
      };
      setFolders(prev => [...prev, converted]);
      return newFolder.id;
    } catch (error: any) {
      console.error('Failed to create root folder:', error);
      throw error;
    }
  };

  const handleUploadResumes = async (files: File[], folderId?: string): Promise<{
    success: boolean;
    error?: string;
    existingResume?: { id: string; candidateName: string; uploadedAt?: string };
  }> => {
    // If no folder is selected, use or create "root" folder
    let targetFolderId = folderId;
    if (!targetFolderId) {
      try {
        targetFolderId = await getOrCreateRootFolder();
      } catch (error) {
        return { success: false, error: 'Failed to create root folder for upload' };
      }
    }

    // For single file, use single upload endpoint
    if (files.length === 1) {
      try {
        const r = await resumeService.upload(files[0], targetFolderId);
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
            setPendingUploadFolderId(targetFolderId);
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
      const batch = await resumeService.uploadBulk(files, targetFolderId);

      toast.loading(`Processing ${batch.total_files} resumes...`, { id: toastId });

      // Add batch to upload history immediately and show the panel
      const newBatchRecord = {
        id: batch.id,
        date: new Date().toISOString(),
        fileName: `Bulk Upload (${batch.total_files} files)`,
        totalFiles: batch.total_files,
        completed: 0,
        pending: batch.total_files,
        duplicated: 0,
        versioned: 0,
        errors: 0,
        status: 'processing',
        source: 'my-resumes' as const,
        statuses: [],
      };
      setUploadHistory(prev => [newBatchRecord, ...prev]);

      // Poll for batch status until complete
      const pollInterval = setInterval(async () => {
        try {
          const status = await resumeService.getBatchStatus(batch.id);

          const processed = status.completed + status.errors + status.duplicates;
          const total = status.total_files;
          const percentage = Math.round((processed / total) * 100);

          // Update upload history to show progress
          setUploadHistory(prev => prev.map(record =>
            record.id === batch.id
              ? {
                  ...record,
                  completed: status.completed,
                  pending: status.pending,
                  duplicated: status.duplicates,
                  versioned: status.versions,
                  errors: status.errors,
                  status: status.status,
                }
              : record
          ));

          toast.loading(`Processing resumes: ${processed}/${total} (${percentage}%)`, { id: toastId });

          // Check if batch is complete
          if (status.status === 'completed' || status.pending === 0) {
            clearInterval(pollInterval);

            const successCount = status.completed + status.versions;
            if (status.errors > 0) {
              toast.warning(
                `Upload complete: ${successCount} succeeded, ${status.duplicates} duplicates, ${status.errors} failed`,
                { id: toastId, duration: 5000 }
              );
            } else {
              toast.success(
                `Successfully uploaded ${successCount} resumes${status.duplicates > 0 ? `, ${status.duplicates} duplicates skipped` : ''}`,
                { id: toastId, duration: 3000 }
              );
            }

            // Refresh upload history and resume list
            fetchUploadHistory();
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

  // Handle search change from SearchFilterBarCompact (already debounced)
  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    setAppliedSearchQuery(query);
  }, []);

  // Client-side search helper - searches across all text fields including phone and skills
  const matchesSearch = useCallback((resume: Resume, query: string): boolean => {
    if (!query) return true;

    const searchTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 0);
    if (searchTerms.length === 0) return true;

    // Create searchable text from all relevant fields
    const searchableFields = [
      resume.name,
      resume.email,
      resume.phone,
      resume.title,
      resume.location,
      resume.currentCompany,
      resume.previousCompany,
      ...(resume.skills || []),
    ].filter(Boolean).map(field => field?.toLowerCase() || '');

    const searchableText = searchableFields.join(' ');

    // Check if any search term matches (partial matching)
    return searchTerms.some(term => searchableText.includes(term));
  }, []);

  // Filter and sort resumes client-side
  const filteredResumes = useMemo(() => {
    let filtered = resumes;

    // Filter by folder
    if (selectedFolder) {
      filtered = filtered.filter(r => r.folderId === selectedFolder);
    }

    // Apply search filter (name, email, phone, skills, keywords)
    if (appliedSearchQuery) {
      filtered = filtered.filter(resume => matchesSearch(resume, appliedSearchQuery));
    }

    // Sort resumes
    const sorted = [...filtered];
    switch (sortBy) {
      case 'date':
      case 'latest':
        return sorted.sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime());
      case 'oldest':
        return sorted.sort((a, b) => new Date(a.uploadDate).getTime() - new Date(b.uploadDate).getTime());
      case 'name-asc':
        return sorted.sort((a, b) => a.name.localeCompare(b.name));
      case 'name-desc':
        return sorted.sort((a, b) => b.name.localeCompare(a.name));
      default:
        return sorted;
    }
  }, [resumes, selectedFolder, appliedSearchQuery, sortBy, matchesSearch]);

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
            onClick={() => setIsUploadHistoryModalOpen(true)}
            className="relative flex items-center gap-2 bg-white text-gray-700 px-4 py-2.5 rounded-md border border-gray-300 hover:bg-gray-50 transition-colors"
          >
            <History className="w-5 h-5" />
            Upload History
            {uploadHistory.filter(r => r.source === 'my-resumes' && (r.status === 'processing' || r.pending > 0)).length > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-5 w-5 bg-blue-500 text-white text-xs items-center justify-center">
                  {uploadHistory.filter(r => r.source === 'my-resumes' && (r.status === 'processing' || r.pending > 0)).length}
                </span>
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
          onSearchChange={handleSearchChange}
          filters={filters}
          onFiltersChange={setFilters}
          sortBy={sortBy}
          onSortChange={setSortBy}
        />

        {/* Search Results Summary */}
        {appliedSearchQuery && (
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-700">
                Found <span className="font-semibold">{filteredResumes.length}</span> matching resume{filteredResumes.length !== 1 ? 's' : ''}
                {appliedSearchQuery && (
                  <span> for "<span className="font-medium text-blue-600">{appliedSearchQuery}</span>"</span>
                )}
              </span>
            </div>
            <button
              onClick={() => {
                setSearchQuery('');
                setAppliedSearchQuery('');
              }}
              className="text-sm text-red-600 hover:text-red-700 hover:underline"
            >
              Clear search
            </button>
          </div>
        )}

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
            highlightQuery={appliedSearchQuery}
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

      {/* Upload History Sheet (Slide-in Panel) */}
      {isUploadHistoryModalOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-50 animate-in fade-in duration-300"
            onClick={() => setIsUploadHistoryModalOpen(false)}
          />
          {/* Sheet Panel */}
          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-white shadow-xl animate-in slide-in-from-right duration-300">
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Upload History</h2>
                  <p className="text-sm text-gray-500">Track your resume upload progress</p>
                </div>
                <button
                  onClick={() => setIsUploadHistoryModalOpen(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-4">
                {(() => {
                  const myResumesHistory = uploadHistory.filter(r => r.source === 'my-resumes');
                  const processingCount = myResumesHistory.filter(r => r.status === 'processing' || r.pending > 0).length;
                  const completedCount = myResumesHistory.filter(r => r.status === 'completed' && r.pending === 0 && r.errors === 0).length;
                  const failedCount = myResumesHistory.filter(r => r.errors > 0).length;
                  const totalUploaded = myResumesHistory.reduce((sum, r) => sum + (r.completed || 0), 0);

                  return (
                    <>
                      {/* Status Summary Boxes - Dashboard Style */}
                      <div className="grid grid-cols-2 gap-3 mb-6">
                        {/* Processing */}
                        <div className="p-4 rounded-lg border-2 border-blue-200 bg-blue-50">
                          <div className="text-3xl font-bold text-blue-600 mb-1">
                            {processingCount}
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-blue-100 rounded-lg">
                              <Loader2 className="h-4 w-4 text-blue-600" />
                            </div>
                            <div>
                              <h3 className="text-sm font-medium text-gray-900">Processing</h3>
                              <p className="text-xs text-gray-600">In progress</p>
                            </div>
                          </div>
                        </div>

                        {/* Completed */}
                        <div className="p-4 rounded-lg border-2 border-green-200 bg-green-50">
                          <div className="text-3xl font-bold text-green-600 mb-1">
                            {completedCount}
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-green-100 rounded-lg">
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            </div>
                            <div>
                              <h3 className="text-sm font-medium text-gray-900">Completed</h3>
                              <p className="text-xs text-gray-600">Successful uploads</p>
                            </div>
                          </div>
                        </div>

                        {/* Failed */}
                        <div className="p-4 rounded-lg border-2 border-red-200 bg-red-50">
                          <div className="text-3xl font-bold text-red-600 mb-1">
                            {failedCount}
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-red-100 rounded-lg">
                              <AlertCircle className="h-4 w-4 text-red-600" />
                            </div>
                            <div>
                              <h3 className="text-sm font-medium text-gray-900">Has Errors</h3>
                              <p className="text-xs text-gray-600">Needs attention</p>
                            </div>
                          </div>
                        </div>

                        {/* Total Uploaded */}
                        <div className="p-4 rounded-lg border-2 border-gray-200 bg-gray-50">
                          <div className="text-3xl font-bold text-gray-600 mb-1">
                            {totalUploaded}
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-gray-100 rounded-lg">
                              <Upload className="h-4 w-4 text-gray-600" />
                            </div>
                            <div>
                              <h3 className="text-sm font-medium text-gray-900">Total Files</h3>
                              <p className="text-xs text-gray-600">Resumes uploaded</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Upload History List */}
                      <div className="mb-3">
                        <h3 className="text-sm font-semibold text-gray-900 mb-3">Recent Uploads</h3>
                      </div>

                      {myResumesHistory.length === 0 ? (
                        <div className="flex flex-col items-center justify-center text-center py-8">
                          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                            <History className="w-8 h-8 text-gray-400" />
                          </div>
                          <h3 className="font-medium text-gray-900 mb-1">No upload history</h3>
                          <p className="text-sm text-gray-500">Your upload history will appear here</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {myResumesHistory
                            .slice(0, 20)
                            .map(record => {
                              const processed = record.completed + record.errors + record.duplicated + (record.versioned || 0);
                              const percentage = record.totalFiles > 0 ? Math.round((processed / record.totalFiles) * 100) : 100;
                              const isProcessing = record.status === 'processing' || record.pending > 0;
                              const hasErrors = record.errors > 0;
                              const isComplete = !isProcessing && percentage === 100;

                              return (
                                <div
                                  key={record.id}
                                  className={`rounded-lg p-4 border-2 transition-all ${
                                    isProcessing
                                      ? 'bg-blue-50 border-blue-200'
                                      : hasErrors
                                        ? 'bg-red-50 border-red-200'
                                        : 'bg-green-50 border-green-200'
                                  }`}
                                >
                                  <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                      {isProcessing ? (
                                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                                          <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                                        </div>
                                      ) : hasErrors ? (
                                        <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                                          <AlertCircle className="w-4 h-4 text-red-600" />
                                        </div>
                                      ) : (
                                        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                                          <CheckCircle className="w-4 h-4 text-green-600" />
                                        </div>
                                      )}
                                      <div>
                                        <span className="font-medium text-gray-900 text-sm block">{record.fileName}</span>
                                        {record.date && (
                                          <span className="text-xs text-gray-500">
                                            {new Date(record.date).toLocaleString()}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                                      isProcessing
                                        ? 'bg-blue-100 text-blue-700'
                                        : hasErrors
                                          ? 'bg-red-100 text-red-700'
                                          : 'bg-green-100 text-green-700'
                                    }`}>
                                      {isProcessing ? `${percentage}%` : isComplete ? 'Completed' : 'Has errors'}
                                    </span>
                                  </div>

                                  {isProcessing && (
                                    <div className="h-2 bg-blue-100 rounded-full overflow-hidden mb-3">
                                      <div
                                        className="h-full bg-blue-500 transition-all duration-300 rounded-full"
                                        style={{ width: `${percentage}%` }}
                                      />
                                    </div>
                                  )}

                                  <div className="flex flex-wrap gap-2 text-xs">
                                    {record.completed > 0 && (
                                      <span className="flex items-center gap-1 bg-green-100 text-green-700 px-2 py-1 rounded">
                                        <CheckCircle className="w-3 h-3" />
                                        {record.completed} uploaded
                                      </span>
                                    )}
                                    {(record.versioned || 0) > 0 && (
                                      <span className="flex items-center gap-1 bg-purple-100 text-purple-700 px-2 py-1 rounded">
                                        <GitBranch className="w-3 h-3" />
                                        {record.versioned} versioned
                                      </span>
                                    )}
                                    {record.duplicated > 0 && (
                                      <span className="flex items-center gap-1 bg-yellow-100 text-yellow-700 px-2 py-1 rounded">
                                        <Copy className="w-3 h-3" />
                                        {record.duplicated} duplicate
                                      </span>
                                    )}
                                    {record.errors > 0 && (
                                      <span className="flex items-center gap-1 bg-red-100 text-red-700 px-2 py-1 rounded">
                                        <AlertCircle className="w-3 h-3" />
                                        {record.errors} failed
                                      </span>
                                    )}
                                    {record.pending > 0 && (
                                      <span className="flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-1 rounded">
                                        <Clock className="w-3 h-3" />
                                        {record.pending} pending
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-gray-200 bg-gray-50">
                <button
                  onClick={() => setIsUploadHistoryModalOpen(false)}
                  className="w-full px-4 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
