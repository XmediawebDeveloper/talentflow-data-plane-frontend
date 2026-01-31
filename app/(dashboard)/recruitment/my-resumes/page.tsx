'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Copy, GitBranch, Upload, Loader2, Search, History, X, CheckCircle, AlertCircle, Clock, Calendar, ChevronRight, ArrowLeft, FileText, Maximize2, LayoutGrid, List, Folder, FolderOpen, MapPin, Briefcase, Mail, Phone, Download, Eye, MoreHorizontal, Trash2, Archive, ClipboardCheck, UserPlus } from 'lucide-react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import ResumeTable from '@/components/ResumeTable';
import StatsCards from '@/components/StatsCards';
import SearchFilterBarCompact from '@/components/SearchFilterBarCompact';
import FolderTree from '@/components/FolderTree';
import BulkActionsBar from '@/components/BulkActionsBar';
import UploadModal from '@/components/UploadModal';
import DuplicateResumeModal, { DuplicateFile, ExistingResume } from '@/components/DuplicateResumeModal';
import ResumeQuickViewModal from '@/components/ResumeQuickViewModal';
import UploadHistoryDetailModal, { UploadHistoryItem } from '@/components/UploadHistoryDetailModal';
import ApplyToJobModal from '@/components/ApplyToJobModal';
import ResumeVersionSelector from '@/components/ResumeVersionSelector';
import { Resume, Folder as FolderType, Job } from '@/lib/types/types';
import { resumeService, folderService } from '@/lib/services/resumeService';
import { Resume as ApiResume, Folder as ApiFolder } from '@/lib/services/resumeService';
import { jdService } from '@/lib/services/jdService';
import { scoringService } from '@/lib/services/scoringService';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// Helper function to format date in IST (UTC+5:30)
const formatDateIST = (dateString: string | null | undefined): string => {
  if (!dateString) return '-';
  try {
    const date = new Date(dateString);
    // Format in IST timezone
    return date.toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '-';
  }
};

// Helper function to format date with time in IST
const formatDateTimeIST = (dateString: string | null | undefined): string => {
  if (!dateString) return '-';
  try {
    const date = new Date(dateString);
    return date.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '-';
  }
};

export default function MyResumesPage() {
  const router = useRouter();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [selectedResumes, setSelectedResumes] = useState<string[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [appliedSearchQuery, setAppliedSearchQuery] = useState(''); // For highlighting
  const [filters, setFilters] = useState({});
  const [sortBy, setSortBy] = useState('date');
  const [folderTreeWidth, setFolderTreeWidth] = useState(240);
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');
  const [cardViewFolder, setCardViewFolder] = useState<string | null>(null); // Selected folder in card view

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
  const [isUploadHistoryMinimized, setIsUploadHistoryMinimized] = useState(false);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<UploadHistoryItem | null>(null);

  // Apply to Job modal state
  const [isApplyToJobModalOpen, setIsApplyToJobModalOpen] = useState(false);
  const [publishedJobs, setPublishedJobs] = useState<Job[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [uploadedResumeToScore, setUploadedResumeToScore] = useState<{ id: string; candidateName: string } | null>(null);
  const [singleResumeToApply, setSingleResumeToApply] = useState<Resume | null>(null);

  // Version selector state (for single candidate apply)
  const [versionSelectorResume, setVersionSelectorResume] = useState<Resume | null>(null);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);

  // ZIP download confirmation modal state
  const [isZipDownloadModalOpen, setIsZipDownloadModalOpen] = useState(false);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);

  // Assessment modal state
  const [isAssessmentModalOpen, setIsAssessmentModalOpen] = useState(false);
  const [selectedJobForAssessment, setSelectedJobForAssessment] = useState<string | null>(null);

  // Delete folder confirmation state
  const [deleteFolderConfirm, setDeleteFolderConfirm] = useState<{
    isOpen: boolean;
    folderId: string | null;
    folderName: string;
    resumeCount: number;
  }>({ isOpen: false, folderId: null, folderName: '', resumeCount: 0 });

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
            candidateName: item.candidate_name,
            resumeId: item.resume_id,
          })) || [],
        }));
        setUploadHistory(history);
      }
    } catch (error) {
      console.error('Failed to fetch upload history:', error);
    }
  };

  const handleCloseUploadHistory = async () => {
    // Filter only my-resumes batches
    const myResumesHistory = uploadHistory.filter(r => r.source === 'my-resumes');

    // Check if there are any pending items
    const hasPendingItems = myResumesHistory.some(batch => batch.pending > 0);

    if (!hasPendingItems && myResumesHistory.length > 0) {
      // All batches are completed, delete them from the backend
      try {
        await resumeService.deleteCompletedBatches();
        // Clear local state
        setUploadHistory([]);
      } catch (error) {
        console.error('Failed to delete completed batches:', error);
      }
    }

    // Close the modal
    setIsUploadHistoryModalOpen(false);
    setIsUploadHistoryMinimized(false);
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
        uploadedBy: r.uploaded_by_name || 'Unknown',
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
        fileName: r.file_name, // Original file name with extension
        fileType: r.file_type, // File type (pdf, doc, docx)
        // Version info
        version: r.version || 1,
        versionCount: r.version_count || 1,
        // Archive status
        isArchived: r.is_archived || false,
        archivedAt: r.archived_at,
      }));

      // Convert API Folder to component Folder type
      const convertApiFolder = (f: ApiFolder): FolderType => ({
        id: f.id,
        name: f.name,
        count: f.resume_count || 0,
        parentId: f.parent_id,
        children: f.children?.map(convertApiFolder),
      });
      let apiFolders: FolderType[] = (Array.isArray(folderResponse) ? folderResponse : []).map(convertApiFolder);

      // Ensure "root" folder always exists (default folder for uploads)
      const hasRootFolder = apiFolders.some(f => f.name.toLowerCase() === 'root' && !f.parentId);
      if (!hasRootFolder) {
        try {
          const newRootFolder = await folderService.create('root');
          const rootFolderConverted: FolderType = {
            id: newRootFolder.id,
            name: newRootFolder.name,
            count: 0,
            parentId: newRootFolder.parent_id,
          };
          apiFolders = [rootFolderConverted, ...apiFolders];
        } catch (error) {
          console.error('Failed to create root folder:', error);
        }
      }

      // Ensure "Archived Resumes" folder always exists
      const hasArchivedFolder = apiFolders.some(f => f.name === 'Archived Resumes' && !f.parentId);
      if (!hasArchivedFolder) {
        try {
          const newArchivedFolder = await folderService.create('Archived Resumes');
          const archivedFolderConverted: FolderType = {
            id: newArchivedFolder.id,
            name: newArchivedFolder.name,
            count: 0,
            parentId: newArchivedFolder.parent_id,
          };
          apiFolders = [...apiFolders, archivedFolderConverted];
        } catch (error) {
          console.error('Failed to create Archived Resumes folder:', error);
        }
      }

      // Add "All Resumes" virtual folder at the top
      const allResumesFolder: FolderType = {
        id: 'all',
        name: 'All Resumes',
        count: convertedResumes.length,
      };
      const convertedFolders: FolderType[] = [allResumesFolder, ...apiFolders];

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
      setSelectedResumes([]);
      toast.success(`${resumeIds.length} resume(s) moved`);
    } catch (error) {
      toast.error('Failed to move resumes');
    }
  };

  // Handle archive resumes - sets is_archived AND moves to Archived Resumes folder
  const handleArchiveResumes = async (resumeIds: string[]) => {
    try {
      // Find the "Archived Resumes" folder
      const archivedFolder = folders.find(f => f.name === 'Archived Resumes' && !f.parentId);
      if (!archivedFolder) {
        toast.error('Archived Resumes folder not found');
        return;
      }

      // Get old folder IDs for count update
      const oldFolderIds = resumeIds.map(id => {
        const resume = resumes.find(r => r.id === id);
        return resume?.folderId;
      }).filter(Boolean);

      // Archive and move each resume
      await Promise.all(resumeIds.map(async (id) => {
        await resumeService.archive(id, true);
        await resumeService.move(id, archivedFolder.id);
      }));

      // Update local state - set archived flag AND move to archived folder
      setResumes(prev => prev.map(r =>
        resumeIds.includes(r.id)
          ? { ...r, isArchived: true, archivedAt: new Date().toISOString(), folderId: archivedFolder.id }
          : r
      ));

      // Update folder counts
      setFolders(prev => prev.map(f => {
        if (f.id === archivedFolder.id) {
          return { ...f, count: f.count + resumeIds.length };
        }
        // Decrease count from old folders
        const decreaseCount = oldFolderIds.filter(fid => fid === f.id).length;
        if (decreaseCount > 0) {
          return { ...f, count: Math.max(0, f.count - decreaseCount) };
        }
        return f;
      }));

      setSelectedResumes([]);
      toast.success(`${resumeIds.length} resume(s) archived`);
    } catch (error) {
      toast.error('Failed to archive resumes');
    }
  };

  // Handle bulk download of selected resumes
  const handleBulkDownload = async () => {
    if (selectedResumes.length === 0) return;

    // If more than 1 resume selected, show confirmation popup
    if (selectedResumes.length > 1) {
      setIsZipDownloadModalOpen(true);
      return;
    }

    // For single resume, download directly
    toast.loading('Downloading resume...', { id: 'bulk-download' });
    try {
      const resumeId = selectedResumes[0];
      const resume = resumes.find(r => r.id === resumeId);
      const blob = await resumeService.download(resumeId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Use original fileName to preserve file extension (pdf, doc, docx, rtf, txt, etc.)
      a.download = resume?.fileName || `${resume?.name || 'resume'}.${resume?.fileType || 'pdf'}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Resume downloaded', { id: 'bulk-download' });
      setSelectedResumes([]);
    } catch (error) {
      console.error('Download failed:', error);
      toast.error('Failed to download resume', { id: 'bulk-download' });
    }
  };

  // Handle ZIP download of multiple resumes
  const handleZipDownload = async () => {
    if (selectedResumes.length === 0) return;

    setIsDownloadingZip(true);
    toast.loading(`Preparing ${selectedResumes.length} resumes for download...`, { id: 'zip-download' });

    try {
      // Dynamically import fflate to avoid SSR issues
      const { zipSync, strToU8 } = await import('fflate');

      const files: { [key: string]: Uint8Array } = {};

      // Download each resume and add to ZIP
      for (let i = 0; i < selectedResumes.length; i++) {
        const resumeId = selectedResumes[i];
        const resume = resumes.find(r => r.id === resumeId);
        // Use original fileName to preserve file extension (pdf, doc, docx, etc.)
        const fileName = resume?.fileName || `${resume?.name || `resume_${i + 1}`}_resume`;
        const zipPath = `resumes/${fileName}`;

        try {
          const blob = await resumeService.download(resumeId);
          const arrayBuffer = await blob.arrayBuffer();
          files[zipPath] = new Uint8Array(arrayBuffer);
        } catch (err) {
          console.error(`Failed to download ${fileName}:`, err);
        }
      }

      // Generate ZIP file
      const zipped = zipSync(files);
      const zipBlob = new Blob([zipped], { type: 'application/zip' });

      const url = window.URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `resumes_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success(`${selectedResumes.length} resumes downloaded as ZIP`, { id: 'zip-download' });
      setSelectedResumes([]);
      setIsZipDownloadModalOpen(false);
    } catch (error) {
      console.error('ZIP download failed:', error);
      toast.error('Failed to create ZIP file', { id: 'zip-download' });
    } finally {
      setIsDownloadingZip(false);
    }
  };

  // Handle Assessment button click
  const handleAssessment = async () => {
    if (selectedResumes.length === 0) {
      toast.error('Please select at least one resume');
      return;
    }
    // Fetch published jobs if not already loaded
    if (publishedJobs.length === 0) {
      await fetchPublishedJobs();
    }
    setIsAssessmentModalOpen(true);
  };

  // Fetch published jobs for the Apply to Job modal
  const fetchPublishedJobs = async () => {
    setLoadingJobs(true);
    try {
      const response = await jdService.list({ status: 'published', page_size: 100 });
      const convertedJobs: Job[] = response.items.map((jd: any) => ({
        id: jd.id,
        job_id: jd.job_id,
        title: jd.title || 'Untitled',
        status: 'Published' as const,
        location: jd.location || '',
        daysActive: jd.created_at ? Math.ceil((new Date().getTime() - new Date(jd.created_at).getTime()) / (1000 * 60 * 60 * 24)) : 0,
        requiredMatch: jd.required_match || 70,
        department: jd.department,
        industry_type: jd.industry_type,
        applicants: jd.applicants_count || 0,
        description: jd.description,
        skills: jd.skills || jd.must_have_skills || [],
        postedDate: jd.published_at || jd.created_at,
        postedBy: jd.created_by_name,
        employmentType: jd.employment_type,
        workMode: jd.remote_type,
        created_at: jd.created_at,
        updated_at: jd.updated_at,
        creation_method: jd.creation_method,
      }));
      setPublishedJobs(convertedJobs);
    } catch (error) {
      console.error('Failed to fetch jobs:', error);
      toast.error('Failed to load jobs');
    } finally {
      setLoadingJobs(false);
    }
  };

  // Handle apply to job
  // Single candidate: show version selector first
  // Multiple candidates: use latest version directly
  const handleApplyToJob = async () => {
    if (selectedResumes.length === 0) return;

    if (selectedResumes.length === 1) {
      // Single candidate - show version selector first
      const resume = resumes.find(r => r.id === selectedResumes[0]);
      if (resume) {
        await showVersionSelector(resume);
        return;
      }
    }

    // Multiple candidates - use latest versions directly (resumes in list are already latest)
    await fetchPublishedJobs();
    setIsApplyToJobModalOpen(true);
  };

  // Show version selector for a single resume
  const showVersionSelector = async (resume: Resume) => {
    setIsLoadingVersions(true);
    try {
      const versions = await resumeService.getVersions(resume.id);
      const resumeWithVersions = {
        ...resume,
        versions: versions && versions.length > 0
          ? versions.map((v: any) => ({
              id: v.id,
              name: v.file_name || v.candidate_name || 'Resume',
              uploadDate: v.created_at,
              version: v.version || 1,
              uploadedBy: v.uploaded_by_name || 'Unknown',
            }))
          : [{
              id: resume.id,
              name: resume.fileName || resume.name || 'Resume',
              uploadDate: resume.uploadDate,
              version: resume.version || 1,
              uploadedBy: resume.uploadedBy || 'Unknown',
            }],
      };
      setVersionSelectorResume(resumeWithVersions);
    } catch (error) {
      console.error('Failed to fetch versions:', error);
      // On error, create single version entry
      const resumeWithVersions = {
        ...resume,
        versions: [{
          id: resume.id,
          name: resume.fileName || resume.name || 'Resume',
          uploadDate: resume.uploadDate,
          version: resume.version || 1,
          uploadedBy: resume.uploadedBy || 'Unknown',
        }],
      };
      setVersionSelectorResume(resumeWithVersions);
    } finally {
      setIsLoadingVersions(false);
    }
  };

  // Handle version selection - proceed to job modal with selected version
  const handleVersionSelect = async (versionId: string) => {
    // Capture resume data immediately (before component's onClose runs)
    const currentResume = versionSelectorResume;
    if (!currentResume || !currentResume.versions) return;

    const selectedVersion = currentResume.versions.find((v: any) => v.id === versionId);
    if (!selectedVersion) return;

    // Create resume with selected version ID
    const resumeWithSelectedVersion = {
      ...currentResume,
      id: versionId,
      version: selectedVersion.version,
    };

    // Set the resume to apply and fetch jobs
    setSingleResumeToApply(resumeWithSelectedVersion);

    // Fetch published jobs then open modal
    await fetchPublishedJobs();
    setIsApplyToJobModalOpen(true);
  };

  // Handle apply to job for a single resume (from table action button)
  // This is called from ResumeTable after version is selected there
  const handleSingleResumeApplyToJob = async (resume: Resume) => {
    // Resume already has selected version ID from ResumeTable's version selector
    setSingleResumeToApply(resume);
    await fetchPublishedJobs();
    setIsApplyToJobModalOpen(true);
  };

  // Handle scoring an uploaded resume - called from UploadModal success state
  const handleScoreUploadedResume = async (resumeId: string, candidateName: string) => {
    // Store the uploaded resume info for scoring
    setUploadedResumeToScore({ id: resumeId, candidateName });

    // Fetch published jobs and open modal
    await fetchPublishedJobs();
    setIsApplyToJobModalOpen(true);
  };

  // Handle applying resumes to selected jobs (scoring) - using async Celery
  const handleApplyToJobSubmit = async (resumeIds: string[], jobIds: string[]) => {
    if (jobIds.length === 0 || resumeIds.length === 0) return;

    setIsApplyToJobModalOpen(false);

    // Get the selected job details
    const jobId = jobIds[0];
    const selectedJob = publishedJobs.find(j => j.id === jobId);

    try {
      // Start async bulk scoring via Celery (resumeIds already have correct version IDs)
      const response = await scoringService.startBulkScoringAsync(jobId, resumeIds);

      // Get candidate names for the selected resumes
      const resumeItems = resumeIds.map(id => {
        const resume = resumes.find(r => r.id === id);
        return {
          resumeId: id,
          candidateName: resume?.candidateName || resume?.candidate_name || resume?.name || 'Unknown',
        };
      });

      // Store batch info for the resume-scoring page to poll (including resume items for fallback)
      const scoringData = {
        batchId: response.batch_id,
        jobId: response.jd_id,
        jobTitle: response.jd_title,
        totalResumes: response.total_resumes,
        resumeItems: resumeItems,
      };
      sessionStorage.setItem('pendingScoringBatch', JSON.stringify(scoringData));

      // Clear selection and navigate to resume scoring page
      setSelectedResumes([]);
      router.push(`/recruitment/resume-scoring?batch_id=${response.batch_id}`);
    } catch (error: any) {
      console.error('Failed to start scoring:', error);
      toast.error(error.message || 'Failed to start scoring');
    }
  };

  const handleCreateFolder = async (name: string, parentId?: string) => {
    try {
      // Helper to get all folders including nested children
      const getAllFolders = (folderList: FolderType[]): FolderType[] => {
        const result: FolderType[] = [];
        const traverse = (list: FolderType[]) => {
          for (const f of list) {
            result.push(f);
            if (f.children) traverse(f.children);
          }
        };
        traverse(folderList);
        return result;
      };

      // Check if folder with same name already exists ANYWHERE (globally unique)
      const allFolders = getAllFolders(folders);
      const existingFolder = allFolders.find(f =>
        f.name.toLowerCase() === name.toLowerCase() &&
        f.id !== 'all'
      );

      if (existingFolder) {
        toast.error(`Folder "${name}" already exists`);
        return;
      }

      console.log('[DEBUG] Creating folder:', { name, parentId });
      const newFolder = await folderService.create(name, parentId);
      console.log('[DEBUG] Folder created:', newFolder);

      // Reload folders from backend to get proper tree structure
      const folderResponse = await folderService.list();
      const convertApiFolder = (f: ApiFolder): FolderType => ({
        id: f.id,
        name: f.name,
        count: f.resume_count || 0,
        parentId: f.parent_id,
        children: f.children?.map(convertApiFolder),
      });
      const apiFolders: FolderType[] = (Array.isArray(folderResponse) ? folderResponse : []).map(convertApiFolder);

      // Add "All Resumes" virtual folder at the top
      const allResumesFolder: FolderType = {
        id: 'all',
        name: 'All Resumes',
        count: resumes.length,
      };
      setFolders([allResumesFolder, ...apiFolders]);

      toast.success('Folder created');
    } catch (error: any) {
      console.error('[DEBUG] Failed to create folder:', error);
      const message = error?.response?.data?.detail || error?.message || 'Unknown error';
      toast.error(`Failed to create folder: ${message}`);
    }
  };

  const handleRenameFolder = async (id: string, name: string) => {
    try {
      // Prevent renaming "Archived Resumes" folder
      const folderToRename = folders.find(f => f.id === id);
      if (folderToRename && folderToRename.name === 'Archived Resumes' && !folderToRename.parentId) {
        toast.error('Archived Resumes folder cannot be renamed');
        return;
      }

      // Helper to get all folders including nested children
      const getAllFolders = (folderList: FolderType[]): FolderType[] => {
        const result: FolderType[] = [];
        const traverse = (list: FolderType[]) => {
          for (const f of list) {
            result.push(f);
            if (f.children) traverse(f.children);
          }
        };
        traverse(folderList);
        return result;
      };

      // Check if folder with same name already exists ANYWHERE (globally unique)
      const allFolders = getAllFolders(folders);
      const existingFolder = allFolders.find(f =>
        f.name.toLowerCase() === name.toLowerCase() &&
        f.id !== id &&
        f.id !== 'all'
      );

      if (existingFolder) {
        toast.error(`Folder "${name}" already exists`);
        return;
      }

      await folderService.update(id, { name });
      setFolders(prev => prev.map(f => f.id === id ? { ...f, name } : f));
      toast.success('Folder renamed');
    } catch (error) {
      toast.error('Failed to rename folder');
    }
  };

  const handleDeleteFolder = (id: string) => {
    // Find the folder to check if it's a system folder
    const folderToDelete = folders.find(f => f.id === id);

    // Prevent deletion of root folder
    if (folderToDelete && folderToDelete.name.toLowerCase() === 'root' && !folderToDelete.parentId) {
      toast.error('Root folder cannot be deleted');
      return;
    }

    // Prevent deletion of "Archived Resumes" folder
    if (folderToDelete && folderToDelete.name === 'Archived Resumes' && !folderToDelete.parentId) {
      toast.error('Archived Resumes folder cannot be deleted');
      return;
    }

    // Count resumes in this folder
    const resumesInFolder = resumes.filter(r => r.folderId === id);

    // Show confirmation dialog
    setDeleteFolderConfirm({
      isOpen: true,
      folderId: id,
      folderName: folderToDelete?.name || 'this folder',
      resumeCount: resumesInFolder.length,
    });
  };

  const confirmDeleteFolder = async () => {
    const { folderId, resumeCount } = deleteFolderConfirm;
    if (!folderId) return;

    // Delete all resumes in the folder first if any
    if (resumeCount > 0) {
      const resumesInFolder = resumes.filter(r => r.folderId === folderId);
      try {
        await Promise.all(resumesInFolder.map(r => resumeService.delete(r.id)));
        setResumes(prev => prev.filter(r => r.folderId !== folderId));
      } catch (error) {
        toast.error('Failed to delete resumes in folder');
        setDeleteFolderConfirm({ isOpen: false, folderId: null, folderName: '', resumeCount: 0 });
        return;
      }
    }

    try {
      await folderService.delete(folderId);
      setFolders(prev => prev.filter(f => f.id !== folderId));
      toast.success('Folder deleted successfully');
    } catch (error) {
      toast.error('Failed to delete folder');
    }

    // Close dialog
    setDeleteFolderConfirm({ isOpen: false, folderId: null, folderName: '', resumeCount: 0 });
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
      const converted: FolderType = {
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

  // Helper function to find or create "Archived Resumes" folder
  const getOrCreateArchivedFolder = async (existingFolders: FolderType[]): Promise<FolderType | null> => {
    // Check if "Archived Resumes" folder already exists
    const existingArchived = existingFolders.find(f => f.name === 'Archived Resumes' && !f.parentId);
    if (existingArchived) {
      return existingArchived;
    }

    // Create "Archived Resumes" folder
    try {
      const newFolder = await folderService.create('Archived Resumes');
      const converted: FolderType = {
        id: newFolder.id,
        name: newFolder.name,
        count: 0,
        parentId: newFolder.parent_id,
      };
      return converted;
    } catch (error: any) {
      console.error('Failed to create Archived Resumes folder:', error);
      return null;
    }
  };

  const handleUploadResumes = async (files: File[], folderId?: string): Promise<{
    success: boolean;
    error?: string;
    existingResume?: { id: string; candidateName: string; uploadedAt?: string };
  }> => {
    // If no folder is selected or "All Resumes" is selected, use or create "root" folder
    let targetFolderId = folderId;
    if (!targetFolderId || targetFolderId === 'all') {
      try {
        targetFolderId = await getOrCreateRootFolder();
      } catch (error) {
        return { success: false, error: 'Failed to create root folder for upload' };
      }
    }

    // Auto-open upload history panel immediately when upload starts (for multiple files)
    if (files.length > 1) {
      console.log('[UPLOAD] Auto-opening upload history panel for', files.length, 'files');
      setIsUploadHistoryModalOpen(true);
      setIsUploadHistoryMinimized(false);

      // Show "Uploading..." record immediately BEFORE API call
      const tempId = `temp-${Date.now()}`;
      const uploadingRecord = {
        id: tempId,
        date: new Date().toISOString(),
        fileName: `Uploading ${files.length} files...`,
        totalFiles: files.length,
        completed: 0,
        pending: files.length,
        duplicated: 0,
        versioned: 0,
        errors: 0,
        status: 'uploading',
        source: 'my-resumes' as const,
        statuses: files.map((f, idx) => ({
          id: `temp-file-${idx}`,
          fileName: f.name,
          status: 'pending',
          errorMessage: null,
          candidateName: null,
        })),
      };
      setUploadHistory(prev => [uploadingRecord, ...prev]);
    }

    // For single file, use single upload endpoint
    if (files.length === 1) {
      try {
        const r = await resumeService.upload(files[0], targetFolderId);
        const converted = convertApiResume(r);
        setResumes(prev => [converted, ...prev]);
        toast.success('Resume uploaded successfully');
        return {
          success: true,
          resumeId: r.id,
          candidateName: r.candidate_name || files[0].name
        };
      } catch (error: any) {
        console.log('[UPLOAD-ERROR] Caught error:', error);
        console.log('[UPLOAD-ERROR] Response status:', error?.response?.status);
        console.log('[UPLOAD-ERROR] Response data:', error?.response?.data);

        // Check for duplicate error (409 Conflict)
        if (error?.response?.status === 409) {
          const detail = error?.response?.data?.detail;
          console.log('[UPLOAD-ERROR] 409 detail:', detail);
          const existingResume = detail?.existing_resume;
          const isExactDuplicate = detail?.is_exact_duplicate ?? true;
          const contentDifferences = detail?.content_differences || [];
          console.log('[UPLOAD-ERROR] existingResume:', existingResume);

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
        }
        // Check for validation errors (400 Bad Request)
        else if (error?.response?.status === 400) {
          const detail = error?.response?.data?.detail;

          // Handle INVALID_RESUME error
          if (detail?.error === 'INVALID_RESUME') {
            return {
              success: false,
              error: detail?.message || 'The uploaded file does not appear to be a valid resume. It may be a scorecard, invoice, or other document type.',
            };
          }

          // Handle NO_CONTENT error
          if (detail?.error === 'NO_CONTENT') {
            return {
              success: false,
              error: detail?.message || 'The resume file has no readable content. The file may be blank, image-only, or heavily formatted.',
            };
          }

          // Handle other 400 errors
          return {
            success: false,
            error: detail?.message || `Failed to upload ${files[0].name}`,
          };
        }
        else {
          return { success: false, error: `Failed to upload ${files[0].name}` };
        }
      }
    }

    // For multiple files, use bulk upload with async processing
    try {
      // Start bulk upload - returns immediately with batch info
      const batch = await resumeService.uploadBulk(files, targetFolderId);

      // Fetch full status with items immediately
      let initialStatuses: any[] = [];
      try {
        const fullStatus = await resumeService.getBatchStatus(batch.id);
        initialStatuses = fullStatus.items?.map((item: any) => ({
          id: item.id,
          fileName: item.file_name,
          status: item.status,
          errorMessage: item.error_message,
          candidateName: item.candidate_name,
          resumeId: item.resume_id,
        })) || [];
      } catch (e) {
        console.error('Error fetching initial batch status:', e);
      }

      // Replace temp "Uploading..." record with real batch data
      const newBatchRecord = {
        id: batch.id,
        date: new Date().toISOString(),
        fileName: `Bulk Upload (${batch.total_files} files)`,
        totalFiles: batch.total_files,
        completed: batch.completed || 0,
        pending: batch.pending || batch.total_files,
        duplicated: batch.duplicates || 0,
        versioned: batch.versions || 0,
        errors: batch.errors || 0,
        status: batch.status || 'processing',
        source: 'my-resumes' as const,
        statuses: initialStatuses,
      };
      // Remove temp record and add real one
      setUploadHistory(prev => [newBatchRecord, ...prev.filter(r => !r.id.startsWith('temp-'))]);

      // Poll for batch status until complete (every 1 second)
      const pollInterval = setInterval(async () => {
        try {
          const status = await resumeService.getBatchStatus(batch.id);

          const processed = status.completed + status.errors + status.duplicates;
          const total = status.total_files;
          const percentage = Math.round((processed / total) * 100);

          // Update upload history to show progress including individual file statuses
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
                  statuses: status.items?.map((item: any) => ({
                    id: item.id,
                    fileName: item.file_name,
                    status: item.status,
                    errorMessage: item.error_message,
                    candidateName: item.candidate_name,
                    resumeId: item.resume_id,
                  })) || [],
                }
              : record
          ));

          // Check if batch is complete
          if (status.status === 'completed' || status.pending === 0) {
            clearInterval(pollInterval);

            // Refresh upload history and resume list
            fetchUploadHistory();
            fetchData();
          }
        } catch (pollError) {
          console.error('Error polling batch status:', pollError);
        }
      }, 1000); // Poll every 1 second for faster updates

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
    attachments: r.file_name ? 1 : 0,
    uploadedBy: r.uploaded_by_name || 'Unknown',
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
    version: r.version || 1,
    versionCount: r.version_count || 1,
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

    // Filter by folder (skip filtering if 'all' is selected - show all resumes)
    if (selectedFolder && selectedFolder !== 'all') {
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

          if (resolution.action === 'overwrite') {
            // Overwrite updates the SAME row (same ID), so REPLACE the existing item in list
            setResumes(prev => prev.map(r =>
              r.id === duplicateFile.existingResume.id ? converted : r
            ));
            toast.success('Resume overwritten successfully', { id: toastId });
          } else {
            // Version creates NEW row (new ID), so add new and remove old
            setResumes(prev => [converted, ...prev.filter(r => r.id !== duplicateFile.existingResume.id)]);
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
    <DndProvider backend={HTML5Backend}>
    <main className="flex-1 p-8 bg-gray-50">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-semibold text-gray-900">My Resume Database</h1>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-700">
              {resumes.length} Resumes
            </span>
          </div>
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

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {/* Bulk Actions Bar - Shows at TOP when resumes selected */}
        {selectedResumes.length > 0 && (
          <BulkActionsBar
            selectedCount={selectedResumes.length}
            onCancel={() => setSelectedResumes([])}
            onMoveToFolder={(folderId) => handleMoveToFolder(selectedResumes, folderId)}
            onApplyToJob={handleApplyToJob}
            onDownload={handleBulkDownload}
            onDelete={() => handleDeleteResumes(selectedResumes)}
            folders={folders.filter(f => f.id !== 'all' && !(f.name.toLowerCase() === 'root' && !f.parentId))}
            onAssessment={handleAssessment}
            onArchive={() => handleArchiveResumes(selectedResumes)}
          />
        )}

        <div className="flex items-center justify-between border-b border-gray-200">
          <div className="flex-1">
            <SearchFilterBarCompact
              searchQuery={searchQuery}
              onSearchChange={handleSearchChange}
              filters={filters}
              onFiltersChange={setFilters}
              sortBy={sortBy}
              onSortChange={setSortBy}
            />
          </div>
          {/* View Toggle */}
          <div className="flex items-center gap-1 px-4 py-3 border-l border-gray-200">
            <span className="text-xs text-gray-500 mr-2">View:</span>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-colors ${
                viewMode === 'list'
                  ? 'bg-gray-800 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              title="List View"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('card')}
              className={`p-2 rounded-lg transition-colors ${
                viewMode === 'card'
                  ? 'bg-gray-800 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              title="Card View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>

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

        {viewMode === 'list' ? (
          // List View with Folder Tree
          <div className="flex">
            <FolderTree
              folders={folders}
              selectedFolder={selectedFolder}
              onSelectFolder={setSelectedFolder}
              onCreateFolder={handleCreateFolder}
              onRenameFolder={handleRenameFolder}
              onDeleteFolder={handleDeleteFolder}
              onUploadToFolder={(folderId) => {
                setSelectedFolder(folderId);
                setIsUploadModalOpen(true);
              }}
              onMoveToFolder={handleMoveToFolder}
              selectedResumes={selectedResumes}
              resumes={resumes}
              width={folderTreeWidth}
              onWidthChange={setFolderTreeWidth}
            />

            <ResumeTable
              resumes={filteredResumes}
              selectedResumes={selectedResumes}
              onSelectResume={handleSelectResume}
              onSelectAll={handleSelectAll}
              onQuickView={(resume) => setQuickViewResume(resume)}
              onApplyToJob={handleSingleResumeApplyToJob}
              onDelete={(id) => handleDelete(id)}
              onMoveToFolder={handleMoveToFolder}
              folders={folders.filter(f => f.id !== 'all' && !(f.name.toLowerCase() === 'root' && !f.parentId))}
              onViewDetails={(resume) => router.push(`/recruitment/resume-view/${resume.id}`)}
              highlightQuery={appliedSearchQuery}
              onArchive={(resumeId) => handleArchiveResumes([resumeId])}
            />
          </div>
        ) : (
          // Card View - Folders as Cards OR Resumes List when folder selected
          <div className="p-6">
            {cardViewFolder === null ? (
              // Show Folder Cards
              (() => {
                // Filter out only 'all' virtual folder - show root and Archived Resumes
                const realFolders = folders.filter(f => f.id !== 'all');

                // Group resumes by folder to get counts
                const resumesByFolder = new Map<string, Resume[]>();
                const unfolderedResumes: Resume[] = [];

                filteredResumes.forEach(resume => {
                  if (resume.folderId) {
                    const existing = resumesByFolder.get(resume.folderId) || [];
                    resumesByFolder.set(resume.folderId, [...existing, resume]);
                  } else {
                    unfolderedResumes.push(resume);
                  }
                });

                const folderCards = realFolders.map((folder) => {
                  const folderResumes = resumesByFolder.get(folder.id) || [];

                  const isArchived = folder.name === 'Archived Resumes' && !folder.parentId;
                  const isRoot = folder.name.toLowerCase() === 'root' && !folder.parentId;

                  return (
                    <div
                      key={folder.id}
                      className={`bg-white border rounded-xl shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-all ${
                        isArchived
                          ? 'border-amber-200 hover:border-amber-400'
                          : isRoot
                            ? 'border-green-200 hover:border-green-400'
                            : 'border-gray-200 hover:border-blue-300'
                      }`}
                      onClick={() => setCardViewFolder(folder.id)}
                    >
                      <div className="flex items-center gap-3 p-4">
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                          isArchived
                            ? 'bg-amber-100'
                            : isRoot
                              ? 'bg-green-100'
                              : 'bg-blue-100'
                        }`}>
                          {isArchived ? (
                            <Archive className="w-6 h-6 text-amber-600" />
                          ) : (
                            <Folder className={`w-6 h-6 ${isRoot ? 'text-green-600' : 'text-blue-600'}`} />
                          )}
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900">
                            {isRoot ? 'Root (Default)' : folder.name}
                          </h3>
                          <p className="text-sm text-gray-500">{folderResumes.length} resume{folderResumes.length !== 1 ? 's' : ''}</p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-400" />
                      </div>
                    </div>
                  );
                });

                const uncategorizedCard = unfolderedResumes.length > 0 ? (
                  <div
                    key="unfoldered"
                    className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden cursor-pointer hover:shadow-md hover:border-gray-400 transition-all"
                    onClick={() => setCardViewFolder('uncategorized')}
                  >
                    <div className="flex items-center gap-3 p-4">
                      <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                        <Folder className="w-6 h-6 text-gray-600" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900">Uncategorized</h3>
                        <p className="text-sm text-gray-500">{unfolderedResumes.length} resume{unfolderedResumes.length !== 1 ? 's' : ''}</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    </div>
                  </div>
                ) : null;

                return (
                  <>
                    {(realFolders.length > 0 || uncategorizedCard) ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {folderCards}
                        {uncategorizedCard}
                      </div>
                    ) : (
                      <div className="text-center py-12">
                        <Folder className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No folders found</h3>
                        <p className="text-gray-500">Create folders to organize your resumes</p>
                      </div>
                    )}
                  </>
                );
              })()
            ) : (
              // Show Resumes List for selected folder
              (() => {
                const selectedFolderData = folders.find(f => f.id === cardViewFolder);
                const folderName = cardViewFolder === 'uncategorized'
                  ? 'Uncategorized'
                  : selectedFolderData?.name || 'Unknown Folder';

                // Get resumes for this folder
                const folderResumes = cardViewFolder === 'uncategorized'
                  ? filteredResumes.filter(r => !r.folderId)
                  : filteredResumes.filter(r => r.folderId === cardViewFolder);

                return (
                  <div>
                    {/* Header with Back Button */}
                    <div className="flex items-center gap-4 mb-6">
                      <button
                        onClick={() => setCardViewFolder(null)}
                        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
                      >
                        <ArrowLeft className="w-5 h-5" />
                        <span>Back to Folders</span>
                      </button>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                          <FolderOpen className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <h2 className="font-semibold text-gray-900">{folderName}</h2>
                          <p className="text-sm text-gray-500">{folderResumes.length} resume{folderResumes.length !== 1 ? 's' : ''}</p>
                        </div>
                      </div>
                    </div>

                    {/* Resumes Table */}
                    {folderResumes.length > 0 ? (
                      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                        {/* Table Header */}
                        <div className="grid grid-cols-[auto_1fr_1fr_1fr_1fr_1fr_80px_100px_80px_60px_100px] gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase tracking-wider">
                          <div className="flex items-center">
                            <input
                              type="checkbox"
                              checked={folderResumes.length > 0 && folderResumes.every(r => selectedResumes.includes(r.id))}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedResumes(prev => [...new Set([...prev, ...folderResumes.map(r => r.id)])]);
                                } else {
                                  setSelectedResumes(prev => prev.filter(id => !folderResumes.find(r => r.id === id)));
                                }
                              }}
                              className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                            />
                          </div>
                          <div>Candidate Name</div>
                          <div>Email</div>
                          <div>Phone</div>
                          <div>Skills</div>
                          <div>Experience</div>
                          <div>Source</div>
                          <div>Upload Date</div>
                          <div>Uploaded By</div>
                          <div>Files</div>
                          <div>Actions</div>
                        </div>
                        {/* Table Body */}
                        {folderResumes.map((resume, index) => (
                          <div
                            key={resume.id}
                            className={`grid grid-cols-[auto_1fr_1fr_1fr_1fr_1fr_80px_100px_80px_60px_100px] gap-2 px-4 py-3 hover:bg-gray-50 cursor-pointer group transition-colors items-center ${
                              index !== folderResumes.length - 1 ? 'border-b border-gray-100' : ''
                            } ${selectedResumes.includes(resume.id) ? 'bg-blue-50' : ''}`}
                            onClick={() => router.push(`/recruitment/resume-view/${resume.id}`)}
                          >
                            {/* Checkbox */}
                            <div className="flex items-center">
                              <input
                                type="checkbox"
                                checked={selectedResumes.includes(resume.id)}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  handleSelectResume(resume.id);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                              />
                            </div>
                            {/* Candidate Name */}
                            <div className="flex items-center min-w-0">
                              <span className="font-medium text-gray-900 text-sm truncate">{resume.name}</span>
                            </div>
                            {/* Email */}
                            <div className="text-sm text-gray-600 truncate">{resume.email || '-'}</div>
                            {/* Phone */}
                            <div className="text-sm text-gray-600 truncate">{resume.phone || '-'}</div>
                            {/* Skills */}
                            <div className="flex flex-wrap gap-1">
                              {resume.skills && resume.skills.length > 0 ? (
                                <>
                                  {resume.skills.slice(0, 2).map((skill, idx) => (
                                    <span key={idx} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs truncate max-w-[60px]">
                                      {skill}
                                    </span>
                                  ))}
                                  {resume.skills.length > 2 && (
                                    <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">
                                      +{resume.skills.length - 2}
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span className="text-sm text-gray-400">-</span>
                              )}
                            </div>
                            {/* Experience */}
                            <div className="text-sm text-gray-600">{resume.experience || '-'}</div>
                            {/* Source */}
                            <div>
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                resume.source === 'TalentFlow'
                                  ? 'bg-purple-100 text-purple-700'
                                  : 'bg-gray-100 text-gray-700'
                              }`}>
                                {resume.source || 'Manual'}
                              </span>
                            </div>
                            {/* Upload Date */}
                            <div className="text-sm text-gray-600">
                              {formatDateIST(resume.uploadDate)}
                            </div>
                            {/* Uploaded By */}
                            <div className="text-sm text-gray-600 truncate">{resume.uploadedBy || '-'}</div>
                            {/* Files */}
                            <div className="flex items-center gap-1 text-sm text-gray-600">
                              <FileText className="w-4 h-4" />
                              <span>{resume.attachments || 1}</span>
                            </div>
                            {/* Actions */}
                            <div className="flex items-center gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setQuickViewResume(resume);
                                }}
                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                                title="Quick View"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    const blob = await resumeService.download(resume.id);
                                    const url = window.URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    // Use original fileName to preserve file extension (pdf, doc, docx, rtf, txt, etc.)
                                    a.download = resume.fileName || `${resume.name}.${resume.fileType || 'pdf'}`;
                                    a.click();
                                    window.URL.revokeObjectURL(url);
                                  } catch (err) {
                                    toast.error('Failed to download');
                                  }
                                }}
                                className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded"
                                title="Download"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(resume.id);
                                }}
                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-12 bg-white border border-gray-200 rounded-xl">
                        <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No resumes in this folder</h3>
                        <p className="text-gray-500">Upload resumes to this folder to get started</p>
                      </div>
                    )}
                  </div>
                );
              })()
            )}
          </div>
        )}
      </div>

      {isUploadModalOpen && (
        <UploadModal
          folders={folders.filter(f => f.id !== 'all' && !(f.name === 'Archived Resumes' && !f.parentId))}
          tenant={null}
          targetFolder={selectedFolder !== 'all' ? selectedFolder || undefined : undefined}
          onClose={() => setIsUploadModalOpen(false)}
          onUpload={handleUploadResumes}
          onCreateFolder={handleCreateFolder}
          onViewResume={(resumeId) => {
            setIsUploadModalOpen(false);
            router.push(`/recruitment/resume-detail/${resumeId}`);
          }}
          onScoreResume={handleScoreUploadedResume}
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

      {/* Loading overlay for version fetch */}
      {isLoadingVersions && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 flex items-center gap-3">
            <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
            <span className="text-gray-700">Loading versions...</span>
          </div>
        </div>
      )}

      {/* Version Selector Modal (for single candidate apply) */}
      {versionSelectorResume && versionSelectorResume.versions && versionSelectorResume.versions.length > 0 && (
        <ResumeVersionSelector
          resume={versionSelectorResume}
          onSelect={handleVersionSelect}
          onClose={() => setVersionSelectorResume(null)}
        />
      )}

      {/* Apply to Job Modal */}
      {isApplyToJobModalOpen && (
        <ApplyToJobModal
          resumes={
            singleResumeToApply
              ? [singleResumeToApply]
              : uploadedResumeToScore
                ? resumes.filter(r => r.id === uploadedResumeToScore.id)
                : resumes.filter(r => selectedResumes.includes(r.id))
          }
          jobs={publishedJobs}
          onClose={() => {
            setIsApplyToJobModalOpen(false);
            setUploadedResumeToScore(null);
            setSingleResumeToApply(null);
          }}
          onApply={handleApplyToJobSubmit}
        />
      )}

      {/* ZIP Download Confirmation Modal */}
      {isZipDownloadModalOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-50 animate-in fade-in duration-200"
            onClick={() => !isDownloadingZip && setIsZipDownloadModalOpen(false)}
          />
          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="flex items-center gap-4 p-6 border-b border-gray-200">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <Archive className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Download as ZIP</h3>
                  <p className="text-sm text-gray-500">Multiple files selected</p>
                </div>
              </div>

              {/* Content */}
              <div className="p-6">
                <p className="text-gray-700">
                  You have selected <span className="font-semibold text-gray-900">{selectedResumes.length} candidates</span>.
                </p>
                <p className="text-gray-600 mt-2">
                  Do you want to download all selected resumes as a ZIP file?
                </p>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 rounded-b-xl border-t border-gray-200">
                <button
                  onClick={() => setIsZipDownloadModalOpen(false)}
                  disabled={isDownloadingZip}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={handleZipDownload}
                  disabled={isDownloadingZip}
                  className="flex items-center gap-2 px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDownloadingZip ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Preparing...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Continue
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Upload History Sheet (Slide-in Panel) */}
      {/* Minimized Upload History Floating Indicator */}
      {isUploadHistoryMinimized && (
        <div
          onClick={() => {
            setIsUploadHistoryMinimized(false);
            setIsUploadHistoryModalOpen(true);
          }}
          className="fixed bottom-6 right-6 z-40 bg-blue-600 text-white px-4 py-3 rounded-xl shadow-lg hover:bg-blue-700 transition-all cursor-pointer flex items-center gap-3 animate-in slide-in-from-bottom duration-300"
        >
          <div className="relative">
            <History className="w-5 h-5" />
            {uploadHistory.filter(r => r.source === 'my-resumes' && (r.status === 'processing' || r.pending > 0)).length > 0 && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
            )}
          </div>
          <div>
            <p className="text-sm font-medium">Upload History</p>
            <p className="text-xs text-blue-200">
              {(() => {
                const processing = uploadHistory.filter(r => r.source === 'my-resumes' && (r.status === 'processing' || r.pending > 0)).length;
                return processing > 0 ? `${processing} processing...` : 'Click to expand';
              })()}
            </p>
          </div>
          <Maximize2 className="w-4 h-4 ml-2" />
        </div>
      )}

      {isUploadHistoryModalOpen && !isUploadHistoryMinimized && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-50 animate-in fade-in duration-300"
            onClick={() => {
              setIsUploadHistoryMinimized(true);
              setIsUploadHistoryModalOpen(false);
            }}
          />
          {/* Centered Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="bg-gradient-to-r from-blue-50 to-white border-b border-gray-200 px-6 py-4 rounded-t-2xl">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">Upload History</h2>
                    <p className="text-sm text-gray-600 mt-0.5">View all past bulk upload reports</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setIsUploadHistoryMinimized(true);
                        setIsUploadHistoryModalOpen(false);
                      }}
                      className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-xl font-medium"
                      title="Minimize"
                    >
                      −
                    </button>
                    <button
                      onClick={handleCloseUploadHistory}
                      className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                      title="Close"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
                {(() => {
                  const myResumesHistory = uploadHistory.filter(r => r.source === 'my-resumes');
                  const processingCount = myResumesHistory.filter(r => r.status === 'processing' || r.pending > 0).length;
                  const completedCount = myResumesHistory.reduce((sum, r) => sum + (r.completed || 0), 0);
                  const duplicatedCount = myResumesHistory.reduce((sum, r) => sum + (r.duplicated || 0), 0);
                  const versionedCount = myResumesHistory.reduce((sum, r) => sum + (r.versioned || 0), 0);
                  const failedCount = myResumesHistory.reduce((sum, r) => sum + (r.errors || 0), 0);
                  const pendingCount = myResumesHistory.reduce((sum, r) => sum + (r.pending || 0), 0);
                  const totalFiles = myResumesHistory.reduce((sum, r) => sum + (r.totalFiles || 0), 0);
                  const successRate = totalFiles > 0 ? Math.round((completedCount / totalFiles) * 100) : 0;

                  return (
                    <>
                      {/* Status Summary Cards - 6 Column Grid */}
                      <div className="grid grid-cols-3 gap-3 mb-6">
                        {/* Completed */}
                        <div className="bg-gradient-to-br from-green-50 to-green-100/50 border border-green-200 rounded-xl p-4">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
                              <CheckCircle className="w-4 h-4 text-white" />
                            </div>
                            <span className="text-xs text-gray-700">Completed</span>
                          </div>
                          <div className="text-2xl font-bold text-green-700">{completedCount}</div>
                        </div>

                        {/* Duplicates */}
                        <div className="bg-gradient-to-br from-yellow-50 to-yellow-100/50 border border-yellow-200 rounded-xl p-4">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="w-8 h-8 bg-yellow-500 rounded-lg flex items-center justify-center">
                              <Copy className="w-4 h-4 text-white" />
                            </div>
                            <span className="text-xs text-gray-700">Duplicates</span>
                          </div>
                          <div className="text-2xl font-bold text-yellow-700">{duplicatedCount}</div>
                        </div>

                        {/* Versioned */}
                        <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-4">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="w-8 h-8 bg-purple-500 rounded-lg flex items-center justify-center">
                              <GitBranch className="w-4 h-4 text-white" />
                            </div>
                            <span className="text-xs text-gray-700">Versioned</span>
                          </div>
                          <div className="text-2xl font-bold text-purple-700">{versionedCount}</div>
                        </div>

                        {/* Failed */}
                        <div className="bg-gradient-to-br from-red-50 to-red-100/50 border border-red-200 rounded-xl p-4">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="w-8 h-8 bg-red-500 rounded-lg flex items-center justify-center">
                              <AlertCircle className="w-4 h-4 text-white" />
                            </div>
                            <span className="text-xs text-gray-700">Failed</span>
                          </div>
                          <div className="text-2xl font-bold text-red-700">{failedCount}</div>
                        </div>

                        {/* Pending */}
                        <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 border border-gray-300 rounded-xl p-4">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="w-8 h-8 bg-gray-500 rounded-lg flex items-center justify-center">
                              <Clock className="w-4 h-4 text-white" />
                            </div>
                            <span className="text-xs text-gray-700">Pending</span>
                          </div>
                          <div className="text-2xl font-bold text-gray-700">{pendingCount}</div>
                        </div>

                        {/* Success Rate */}
                        <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200 rounded-xl p-4">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                              <FileText className="w-4 h-4 text-white" />
                            </div>
                            <span className="text-xs text-gray-700">Success Rate</span>
                          </div>
                          <div className="text-2xl font-bold text-blue-700">{successRate}%</div>
                        </div>
                      </div>

                      {/* Upload History List */}
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-semibold text-gray-900">Recent Uploads</h3>
                        <span className="text-xs text-gray-500">{myResumesHistory.length} batch{myResumesHistory.length !== 1 ? 'es' : ''}</span>
                      </div>

                      {myResumesHistory.length === 0 ? (
                        <div className="flex flex-col items-center justify-center text-center py-12">
                          <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                            <FileText className="w-10 h-10 text-blue-600" />
                          </div>
                          <h3 className="text-lg font-medium text-gray-900 mb-2">No Upload History</h3>
                          <p className="text-sm text-gray-500 max-w-sm">Bulk upload reports will appear here. Upload multiple resumes to see detailed status reports.</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {myResumesHistory
                            .slice(0, 20)
                            .map(record => {
                              const processed = record.completed + record.errors + record.duplicated + (record.versioned || 0);
                              const percentage = record.totalFiles > 0 ? Math.round((record.completed / record.totalFiles) * 100) : 100;
                              const isUploading = record.status === 'uploading';
                              const isProcessing = record.status === 'processing' || record.pending > 0;
                              const hasErrors = record.errors > 0;
                              const hasIssues = record.duplicated > 0 || (record.versioned || 0) > 0 || record.errors > 0;

                              return (
                                <div
                                  key={record.id}
                                  className="bg-white border border-gray-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-lg transition-all cursor-pointer"
                                >
                                  {/* Header Row */}
                                  <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                                        <FileText className="w-5 h-5 text-blue-600" />
                                      </div>
                                      <div>
                                        <span className="font-medium text-gray-900 text-sm block">{record.fileName}</span>
                                        {record.date && (
                                          <span className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                            <Calendar className="w-3 h-3" />
                                            {formatDateTimeIST(record.date)}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      {isUploading && (
                                        <span className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-100 text-blue-700 text-xs rounded-full border border-blue-200 animate-pulse">
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                          Uploading...
                                        </span>
                                      )}
                                      {!isUploading && hasIssues && (
                                        <span className="flex items-center gap-1.5 px-2.5 py-1 bg-yellow-100 text-yellow-700 text-xs rounded-full border border-yellow-200">
                                          <AlertCircle className="w-3 h-3" />
                                          Needs Review
                                        </span>
                                      )}
                                      {!isUploading && (
                                        <div className="text-right">
                                          <div className={`text-xl font-bold ${
                                            percentage === 100 ? 'text-green-600' :
                                            percentage >= 90 ? 'text-blue-600' :
                                            percentage >= 70 ? 'text-yellow-600' :
                                            'text-red-600'
                                          }`}>
                                            {percentage}%
                                          </div>
                                          <div className="text-xs text-gray-500">Success</div>
                                        </div>
                                      )}
                                      <ChevronRight className="w-5 h-5 text-gray-400" />
                                    </div>
                                  </div>

                                  {/* Mini Stats */}
                                  <div className="grid grid-cols-5 gap-2 mb-4">
                                    <div className="text-center p-2 bg-green-50 rounded-lg border border-green-100">
                                      <div className="text-sm font-semibold text-green-700">{record.completed}</div>
                                      <div className="text-xs text-gray-600">Done</div>
                                    </div>
                                    <div className="text-center p-2 bg-yellow-50 rounded-lg border border-yellow-100">
                                      <div className="text-sm font-semibold text-yellow-700">{record.duplicated}</div>
                                      <div className="text-xs text-gray-600">Dup</div>
                                    </div>
                                    <div className="text-center p-2 bg-purple-50 rounded-lg border border-purple-100">
                                      <div className="text-sm font-semibold text-purple-700">{record.versioned || 0}</div>
                                      <div className="text-xs text-gray-600">Ver</div>
                                    </div>
                                    <div className="text-center p-2 bg-red-50 rounded-lg border border-red-100">
                                      <div className="text-sm font-semibold text-red-700">{record.errors}</div>
                                      <div className="text-xs text-gray-600">Failed</div>
                                    </div>
                                    <div className="text-center p-2 bg-blue-50 rounded-lg border border-blue-100">
                                      <div className="text-sm font-semibold text-blue-700">{record.pending}</div>
                                      <div className="text-xs text-gray-600">Pend</div>
                                    </div>
                                  </div>

                                  {/* Progress Bar */}
                                  <div className="mb-4">
                                    <div className="flex items-center justify-between text-xs text-gray-600 mb-1.5">
                                      <span>Progress</span>
                                      <span>{processed} of {record.totalFiles}</span>
                                    </div>
                                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full transition-all ${
                                          percentage === 100 ? 'bg-green-500' :
                                          percentage >= 90 ? 'bg-blue-500' :
                                          percentage >= 70 ? 'bg-yellow-500' :
                                          'bg-red-500'
                                        }`}
                                        style={{ width: `${Math.min((processed / record.totalFiles) * 100, 100)}%` }}
                                      />
                                    </div>
                                  </div>

                                  {/* Individual File Statuses */}
                                  {record.statuses && record.statuses.length > 0 && (
                                    <div className="border-t border-gray-100 pt-4">
                                      <div className="flex items-center justify-between mb-3">
                                        <div className="text-xs font-semibold text-gray-700">Files ({record.statuses.length})</div>
                                        <div className="flex items-center gap-2 text-xs">
                                          <span className="flex items-center gap-1 text-green-600">
                                            <CheckCircle className="w-3 h-3" />
                                            {record.statuses.filter((f: any) => f.status === 'completed' || f.status === 'versioned').length}
                                          </span>
                                          <span className="flex items-center gap-1 text-blue-600">
                                            <Loader2 className="w-3 h-3" />
                                            {record.statuses.filter((f: any) => f.status === 'processing' || f.status === 'pending').length}
                                          </span>
                                          <span className="flex items-center gap-1 text-red-600">
                                            <AlertCircle className="w-3 h-3" />
                                            {record.statuses.filter((f: any) => f.status === 'error' || f.status === 'duplicate').length}
                                          </span>
                                        </div>
                                      </div>
                                      <div className="space-y-1.5 max-h-64 overflow-y-auto">
                                        {record.statuses.map((file: any, idx: number) => {
                                          const isClickable = ['completed', 'versioned', 'duplicate', 'error'].includes(file.status);
                                          return (
                                          <div
                                            key={file.id || idx}
                                            onClick={() => {
                                              if (isClickable) {
                                                setSelectedHistoryItem({
                                                  id: file.id,
                                                  fileName: file.fileName,
                                                  status: file.status,
                                                  errorMessage: file.errorMessage,
                                                  candidateName: file.candidateName,
                                                  resumeId: file.resumeId,
                                                });
                                              }
                                            }}
                                            className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all ${
                                              file.status === 'completed' ? 'bg-green-50 border-green-200 hover:bg-green-100 hover:border-green-300' :
                                              file.status === 'versioned' ? 'bg-purple-50 border-purple-200 hover:bg-purple-100 hover:border-purple-300' :
                                              file.status === 'processing' ? 'bg-blue-50 border-blue-200' :
                                              file.status === 'duplicate' ? 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100 hover:border-yellow-300' :
                                              file.status === 'error' ? 'bg-red-50 border-red-200 hover:bg-red-100 hover:border-red-300' :
                                              'bg-gray-50 border-gray-200'
                                            } ${isClickable ? 'cursor-pointer' : ''}`}
                                          >
                                            {/* Status Icon */}
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                              file.status === 'completed' ? 'bg-green-500' :
                                              file.status === 'versioned' ? 'bg-purple-500' :
                                              file.status === 'processing' ? 'bg-blue-500' :
                                              file.status === 'duplicate' ? 'bg-yellow-500' :
                                              file.status === 'error' ? 'bg-red-500' :
                                              'bg-gray-400'
                                            }`}>
                                              {file.status === 'completed' && <CheckCircle className="w-4 h-4 text-white" />}
                                              {file.status === 'versioned' && <GitBranch className="w-4 h-4 text-white" />}
                                              {file.status === 'processing' && <Loader2 className="w-4 h-4 text-white animate-spin" />}
                                              {file.status === 'duplicate' && <Copy className="w-4 h-4 text-white" />}
                                              {file.status === 'error' && <AlertCircle className="w-4 h-4 text-white" />}
                                              {file.status === 'pending' && <Clock className="w-4 h-4 text-white animate-pulse" />}
                                            </div>
                                            {/* File Info */}
                                            <div className="flex-1 min-w-0">
                                              <div className="font-medium text-gray-900 text-sm truncate">{file.fileName}</div>
                                              <div className="text-xs text-gray-500 mt-0.5">
                                                {file.status === 'completed' && (file.candidateName ? `✓ ${file.candidateName}` : '✓ Uploaded successfully')}
                                                {file.status === 'versioned' && (file.candidateName ? `↑ ${file.candidateName} - New version` : '↑ Saved as new version')}
                                                {file.status === 'processing' && '⚡ Processing...'}
                                                {file.status === 'pending' && '⏳ Waiting in queue...'}
                                                {file.status === 'duplicate' && (file.errorMessage || '⚠ Duplicate - already exists')}
                                                {file.status === 'error' && (file.errorMessage || '✗ Failed to process')}
                                              </div>
                                            </div>
                                            {/* Status Badge */}
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                                              file.status === 'completed' ? 'bg-green-100 text-green-700' :
                                              file.status === 'versioned' ? 'bg-purple-100 text-purple-700' :
                                              file.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                                              file.status === 'duplicate' ? 'bg-yellow-100 text-yellow-700' :
                                              file.status === 'error' ? 'bg-red-100 text-red-700' :
                                              'bg-gray-100 text-gray-600'
                                            }`}>
                                              {file.status === 'completed' ? '✓ Done' :
                                               file.status === 'versioned' ? '↑ Version' :
                                               file.status === 'processing' ? '⚡ Running' :
                                               file.status === 'duplicate' ? '⚠ Duplicate' :
                                               file.status === 'error' ? '✗ Failed' :
                                               '⏳ Queued'}
                                            </span>
                                          </div>
                                        );
                                        })}
                                      </div>
                                    </div>
                                  )}
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
              <div className="border-t border-gray-200 px-6 py-4 bg-white rounded-b-2xl">
                <button
                  onClick={handleCloseUploadHistory}
                  className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Upload History Item Detail Modal */}
      {selectedHistoryItem && (
        <UploadHistoryDetailModal
          item={selectedHistoryItem}
          onClose={() => setSelectedHistoryItem(null)}
        />
      )}

      {/* Assessment Modal - Select Job First */}
      {isAssessmentModalOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-50 animate-in fade-in duration-200"
            onClick={() => setIsAssessmentModalOpen(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden animate-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="flex items-center gap-4 p-6 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
                <div className="w-12 h-12 bg-gray-800 rounded-xl flex items-center justify-center">
                  <ClipboardCheck className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">Invite to Assessment</h3>
                  <p className="text-sm text-gray-500">
                    {selectedResumes.length} candidate{selectedResumes.length !== 1 ? 's' : ''} selected
                  </p>
                </div>
                <button
                  onClick={() => setIsAssessmentModalOpen(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 overflow-y-auto max-h-[calc(80vh-200px)]">
                {/* Selected Candidates Preview */}
                <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Selected Candidates</h4>
                  <div className="space-y-1">
                    {resumes.filter(r => selectedResumes.includes(r.id)).slice(0, 5).map(resume => (
                      <div key={resume.id} className="flex items-center gap-2 text-sm text-gray-600">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        <span>{resume.name}</span>
                        <span className="text-gray-400">- {resume.email || 'No email'}</span>
                      </div>
                    ))}
                    {selectedResumes.length > 5 && (
                      <p className="text-sm text-gray-500 italic">+{selectedResumes.length - 5} more</p>
                    )}
                  </div>
                </div>

                {/* Job Selection */}
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Select a Job for Assessment</h4>
                  {loadingJobs ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                    </div>
                  ) : publishedJobs.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <Briefcase className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p>No published jobs found</p>
                      <p className="text-sm">Create and publish a job first to send assessment invitations</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {publishedJobs.map(job => (
                        <button
                          key={job.id}
                          onClick={() => setSelectedJobForAssessment(job.id)}
                          className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                            selectedJobForAssessment === job.id
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <h5 className="font-medium text-gray-900">{job.title}</h5>
                              <p className="text-sm text-gray-500">{job.location || 'No location'}</p>
                            </div>
                            {selectedJobForAssessment === job.id && (
                              <CheckCircle className="w-5 h-5 text-blue-500" />
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-200">
                <button
                  onClick={() => setIsAssessmentModalOpen(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (!selectedJobForAssessment) {
                      toast.error('Please select a job first');
                      return;
                    }
                    // Navigate to assessment page with job and candidates
                    const selectedJob = publishedJobs.find(j => j.id === selectedJobForAssessment);
                    if (selectedJob) {
                      // Store selected candidates in session storage for the assessment page
                      const candidateData = resumes
                        .filter(r => selectedResumes.includes(r.id))
                        .map(r => ({
                          name: r.name,
                          email: r.email,
                          resumeId: r.id
                        }));
                      sessionStorage.setItem('assessmentCandidates', JSON.stringify(candidateData));
                      router.push(`/recruitment/assessments?job_id=${selectedJobForAssessment}&invite=true`);
                    }
                  }}
                  disabled={!selectedJobForAssessment}
                  className="flex items-center gap-2 px-6 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <UserPlus className="w-4 h-4" />
                  Continue to Assessment
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Delete Folder Confirmation Dialog */}
      <AlertDialog
        open={deleteFolderConfirm.isOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteFolderConfirm({ isOpen: false, folderId: null, folderName: '', resumeCount: 0 });
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Folder</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteFolderConfirm.folderName}&quot;?
              {deleteFolderConfirm.resumeCount > 0 && (
                <span className="block mt-2 text-red-600 font-medium">
                  This will also permanently delete {deleteFolderConfirm.resumeCount} resume{deleteFolderConfirm.resumeCount !== 1 ? 's' : ''} inside this folder.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteFolder}
              className="bg-red-600 text-white hover:bg-red-700 focus:ring-red-500"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
    </DndProvider>
  );
}
