'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Clock, Loader2, ChevronLeft, ChevronRight, Search, X, Trash2, ShieldAlert, Lock, AlertCircle, HelpCircle, Download, FileArchive, Users, Info } from 'lucide-react';
import { useAuth } from '@/lib/hooks/useAuth';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import ResumeTable from '@/components/ResumeTable';
import StatsCards from '@/components/StatsCards';
import SearchFilterBarCompact from '@/components/SearchFilterBarCompact';
import BulkActionsBar from '@/components/BulkActionsBar';
import UploadHistoryPanel from '@/components/UploadHistoryPanel';
import UploadModal from '@/components/UploadModal';
import { FOLDER_NAME_MAX_LENGTH } from '@/components/FolderTree';
import ResumeDetailView from '@/components/ResumeDetailView';
import ResumeTextPreviewModal from '@/components/ResumeTextPreviewModal';
import ApplyToJobModal from '@/components/ApplyToJobModal';
import AITalentMatchSelectJobModal from '@/components/AITalentMatchSelectJobModal';
import VersionHistoryModal from '@/components/VersionHistoryModal';
import InviteToAIInterviewFlow from '@/components/InviteToAIInterviewFlow';
import { useListSearch } from '@/lib/hooks/useListSearch';
import { Resume, Folder, Job } from '@/lib/types/types';
import { resumeService, folderService, ResumeSearchParams } from '@/lib/services/resumeService';
import { Resume as ApiResume, Folder as ApiFolder } from '@/lib/services/resumeService';
import { jdService } from '@/lib/services/jdService';
import { scoringService } from '@/lib/services/scoringService';
import { toast } from 'sonner';
import { handleQuotaError } from '@/lib/utils/quotaErrorHandler';
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
import FeatureGate from '@/components/shared/FeatureGate';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { usePlanFeatures } from '@/lib/hooks/usePlanFeature';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';

interface SearchFilters {
  skills?: string[];
  experienceRange?: { min?: number; max?: number };
  education?: string;
  location?: string;
  currentCompany?: string;
  previousCompany?: string;
  noticePeriod?: string;
  uploadDateRange?: { start?: string; end?: string };
  sourceType?: string;
}

export default function ResumeDatabasePage() {
  const router = useRouter();
  const { user, isTenantAdmin, hasPermission, hasPermissionCode } = useAuth();
  const { hasPlanFeature } = usePlanFeatures();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedResumes, setSelectedResumes] = useState<string[]>([]);
  // AI Interview invite — same shared flow the My Resumes list uses.
  const [isAIInterviewFlowOpen, setIsAIInterviewFlowOpen] = useState(false);
  const [isDownloadingSelection, setIsDownloadingSelection] = useState(false);
  // ZIP download confirmation modal — shown when more than one resume is selected.
  const [isZipDownloadModalOpen, setIsZipDownloadModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  // Search + filters in the shared hook. `appliedQuery` is the settled value —
  // it is what the API request and the row highlighting are built from.
  const search = useListSearch<Record<string, unknown>>({ initialFilters: {} });
  const searchQuery = search.query;
  const appliedSearchQuery = search.appliedQuery;
  const filters = search.filters as SearchFilters;
  const [sortBy, setSortBy] = useState('latest');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalResumes, setTotalResumes] = useState(0);
  const [pageSize] = useState(25);

  // Track if initial load is done
  const initialLoadDone = useRef(false);

  // Modal states
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [showUploadHistory, setShowUploadHistory] = useState(false);
  const [uploadHistory, setUploadHistory] = useState<any[]>([]);
  const [viewingResume, setViewingResume] = useState<Resume | null>(null);
  const [quickViewResume, setQuickViewResume] = useState<Resume | null>(null);

  // Apply to Job modal states
  const [showApplyToJobModal, setShowApplyToJobModal] = useState(false);
  const [resumesForApply, setResumesForApply] = useState<Resume[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);

  // AI Talent Match modal state
  const [showAITalentMatchModal, setShowAITalentMatchModal] = useState(false);

  // Assessment modal state
  const [showAssessmentJobModal, setShowAssessmentJobModal] = useState(false);

  // Version History modal state
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [selectedResumeForVersion, setSelectedResumeForVersion] = useState<Resume | null>(null);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);

  // Restore/persist the list's view state + scroll position so returning from a
  // resume detail page (route push to /recruitment/resume-view/:id) lands the
  // user exactly where they left off instead of on a reset list at the top.
  const rootRef = useScrollRestoration<HTMLElement>('resume-database', !loading);
  useListStatePersistence(
    'resume-database',
    { searchQuery, appliedSearchQuery, filters, sortBy, currentPage },
    (s) => {
      if (typeof s.searchQuery === 'string') search.setQuery(s.searchQuery);
      if (s.filters && typeof s.filters === 'object') {
        search.setFilters(s.filters as Record<string, unknown>);
      }
      if (typeof s.sortBy === 'string') setSortBy(s.sortBy);
      if (typeof s.currentPage === 'number') setCurrentPage(s.currentPage);
    },
  );

  // Build search params from filters
  const buildSearchParams = useCallback((): ResumeSearchParams => {
    const params: ResumeSearchParams = {
      source: 'internal-db',
      page: 1,
    };

    // NOTE: Search is done client-side to include phone and skills
    // The API search param is NOT used here

    // Add skills filter
    if (filters.skills && filters.skills.length > 0) {
      params.skills = filters.skills.join(',');
    }

    // Add experience range
    if (filters.experienceRange) {
      if (filters.experienceRange.min !== undefined) {
        params.experience_min = filters.experienceRange.min;
      }
      if (filters.experienceRange.max !== undefined) {
        params.experience_max = filters.experienceRange.max;
      }
    }

    // Add location
    if (filters.location) {
      params.location = filters.location;
    }

    // Add education
    if (filters.education) {
      params.education = filters.education;
    }

    // Add company filters
    if (filters.currentCompany) {
      params.current_company = filters.currentCompany;
    }
    if (filters.previousCompany) {
      params.previous_company = filters.previousCompany;
    }

    // Add notice period
    if (filters.noticePeriod) {
      params.notice_period = filters.noticePeriod;
    }

    // Add upload date range
    if (filters.uploadDateRange) {
      if (filters.uploadDateRange.start) {
        params.upload_date_from = filters.uploadDateRange.start;
      }
      if (filters.uploadDateRange.end) {
        params.upload_date_to = filters.uploadDateRange.end;
      }
    }

    // Add source type
    if (filters.sourceType) {
      params.source_type = filters.sourceType;
    }

    return params;
  }, [filters]);

  // Fetch data with filters
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = buildSearchParams();
      // Probe with the smallest possible window to learn the true total,
      // then issue one full-size request so the UI shows every record.
      const [probe, folderResponse] = await Promise.all([
        resumeService.list({ ...params, page_size: 1 }),
        folderService.list().catch(() => []),
      ]);
      const resumeResponse =
        probe.total > probe.items.length
          ? await resumeService.list({ ...params, page_size: probe.total })
          : probe;

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
        attachments: r.version_count || 1, // Show version count as file count
        uploadedBy: r.uploaded_by_name || 'System',
        versionCount: r.version_count || 1,
        version: r.version || 1,
        currentCompany: r.current_company,
        previousCompany: r.previous_company,
        noticePeriod: r.notice_period,
        lastUpdated: r.updated_at,
        // Extended fields for detailed view
        professionalSummary: r.professional_summary,
        technicalSkills: r.technical_skills,
        softSkills: r.soft_skills,
        educationDetails: (r.education as any[])?.map((edu: any) => ({
          degree: edu.degree || '',
          school: edu.school || edu.institution || '',
          location: edu.location || '',
          year: edu.year || edu.graduation_year || '',
          gpa: edu.gpa || '',
          honors: edu.honors || '',
        })),
        experienceDetails: (r.experience as any[])?.map((exp: any) => ({
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
        // Store search query for highlighting
        _searchQuery: appliedSearchQuery,
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
      setTotalPages(resumeResponse.total_pages || 1);
      setTotalResumes(resumeResponse.total || 0);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error('Failed to load resume database');
    } finally {
      setLoading(false);
    }
  }, [buildSearchParams, appliedSearchQuery]);

  // Fetch data when search params change
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Self-heal admin-API resume usage on page mount. Fire-and-forget — never
  // blocks rendering. The backend caps deltas at ±200 to keep this safe.
  useEffect(() => {
    resumeService.reconcileUsage();
  }, []);

  // Reset to page 1 when filters or search change
  useEffect(() => {
    if (initialLoadDone.current) {
      setCurrentPage(1);
    }
  }, [appliedSearchQuery, filters]);

  // Handle search change from SearchFilterBarCompact (already debounced)
  // The hook holds the typed value and debounces it into `appliedSearchQuery`,
  // which the request is keyed on.
  const handleSearchChange = useCallback((query: string) => {
    search.setQuery(query);
    initialLoadDone.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectResume = (id: string) => {
    setSelectedResumes(prev =>
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    );
  };

  const handleSelectAll = (selected: boolean) => {
    setSelectedResumes(selected ? resumes.map(r => r.id) : []);
  };

  const [deleteConfirm, setDeleteConfirm] = useState<{ ids: string[] } | null>(null);

  const executeDelete = async (ids: string[]) => {
    try {
      await Promise.all(ids.map(id => resumeService.delete(id)));
      setResumes(prev => prev.filter(r => !ids.includes(r.id)));
      setSelectedResumes(prev => prev.filter(r => !ids.includes(r)));
      toast.success(ids.length === 1 ? 'Resume deleted' : `${ids.length} resume(s) deleted`);
    } catch (error) {
      toast.error('Failed to delete resume(s)');
    }
  };

  const handleDelete = (id: string) => {
    setDeleteConfirm({ ids: [id] });
  };

  const handleDeleteResumes = (ids: string[]) => {
    setDeleteConfirm({ ids });
  };

  // Returns a result because UploadModal's onUpload contract is
  // Promise<{ success: boolean; ... }> and handleValidateAndUpload reads
  // result.existingResume. This returned void, so that read threw and fell into the
  // modal's catch - meaning a successful upload showed this page's success toast AND
  // the modal's "Upload failed" toast. This page reports its own outcome via toasts
  // and closes the modal itself, so { success: true } keeps the modal silent.
  const handleUploadResumes = async (
    files: File[],
    folderId?: string,
  ): Promise<{ success: boolean; error?: string }> => {
    setIsUploadModalOpen(false);

    // For single file, use single upload endpoint
    if (files.length === 1) {
      try {
        const r = await resumeService.upload(files[0], folderId);
        const converted = convertApiResume(r);
        setResumes(prev => [converted, ...prev]);
        toast.success('Resume uploaded successfully');
      } catch (error) {
        handleQuotaError(error, router, `Failed to upload ${files[0].name}`);
      }
      return { success: true };
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

    } catch (error) {
      handleQuotaError(error, router, 'Failed to start bulk upload');
      console.error('Bulk upload error:', error);
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
    attachments: r.version_count || 1, // Show version count as file count
    uploadedBy: r.uploaded_by_name || 'System',
    versionCount: r.version_count || 1,
    version: r.version || 1,
    currentCompany: r.current_company,
    previousCompany: r.previous_company,
    noticePeriod: r.notice_period,
    lastUpdated: r.updated_at,
    professionalSummary: r.professional_summary,
    technicalSkills: r.technical_skills,
    softSkills: r.soft_skills,
    educationDetails: (r.education as any[])?.map((edu: any) => ({
      degree: edu.degree || '',
      school: edu.school || edu.institution || '',
      location: edu.location || '',
      year: edu.year || edu.graduation_year || '',
      gpa: edu.gpa || '',
      honors: edu.honors || '',
    })),
    experienceDetails: (r.experience as any[])?.map((exp: any) => ({
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

  // Fetch jobs for Apply to Job modal
  const fetchJobs = async () => {
    try {
      const probe = await jdService.list({ page_size: 1, source: 'my-jds' });
      const response = probe.total > probe.items.length
        ? await jdService.list({ page_size: probe.total, source: 'my-jds' })
        : probe;
      const convertedJobs: Job[] = response.items.map((jd: any) => ({
        id: jd.id,
        job_id: jd.job_id,
        title: jd.title || 'Untitled',
        status: mapJobStatus(jd.status),
        location: jd.location || '',
        daysActive: calculateDaysActive(jd.created_at),
        requiredMatch: jd.required_match || 70,
        department: jd.department,
        industry_type: jd.industry_type,
        experience: jd.experience_required || (jd.experience_min && jd.experience_max ? `${jd.experience_min}-${jd.experience_max}` : jd.experience_min ? `${jd.experience_min}+` : undefined),
        applicants: jd.applicants_count || 0,
        description: jd.description,
        skills: jd.skills || [],
        postedDate: jd.published_at || jd.created_at,
        postedBy: jd.created_by_name || jd.created_by,
        employmentType: jd.employment_type,
        workMode: jd.remote_type,
        created_at: jd.created_at,
        updated_at: jd.updated_at,
        creation_stage: jd.creation_stage,
        creation_method: jd.creation_method,
        currentVersion: jd.current_version,
      }));
      setJobs(convertedJobs);
    } catch (error) {
      console.error('Failed to fetch jobs:', error);
    }
  };

  const mapJobStatus = (status: string): 'Published' | 'Draft' | 'Closed' | 'Archived' | 'Disabled' => {
    const statusMap: Record<string, 'Published' | 'Draft' | 'Closed' | 'Archived' | 'Disabled'> = {
      'published': 'Published',
      'active': 'Published',
      'draft': 'Draft',
      'closed': 'Closed',
      'archived': 'Archived',
      'disabled': 'Disabled',
    };
    return statusMap[status?.toLowerCase()] || 'Draft';
  };

  const calculateDaysActive = (createdAt: string): number => {
    if (!createdAt) return 0;
    const created = new Date(createdAt);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - created.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  // Handle Apply to Job for single resume
  const handleApplyToJob = (resume: Resume) => {
    setResumesForApply([resume]);
    fetchJobs();
    setShowApplyToJobModal(true);
  };

  // Handle Apply to Job for bulk selected resumes
  const handleBulkApplyToJob = () => {
    const selectedResumesList = resumes.filter(r => selectedResumes.includes(r.id));
    if (selectedResumesList.length === 0) {
      toast.error('Please select at least one resume');
      return;
    }
    setResumesForApply(selectedResumesList);
    fetchJobs();
    setShowApplyToJobModal(true);
  };

  // Handle AI Talent Match for bulk selected resumes
  const handleBulkAITalentMatch = () => {
    const selectedResumesList = resumes.filter(r => selectedResumes.includes(r.id));
    if (selectedResumesList.length === 0) {
      toast.error('Please select at least one resume');
      return;
    }
    setResumesForApply(selectedResumesList);
    fetchJobs();
    setShowAITalentMatchModal(true);
  };

  const handleBulkAIInterview = () => {
    if (selectedResumes.length === 0) {
      toast.error('Please select at least one resume');
      return;
    }
    setIsAIInterviewFlowOpen(true);
  };

  /**
   * Bulk download, matching My Resumes: a single selection downloads straight
   * through, several are zipped client-side (there is no server-side archive
   * endpoint) so the recruiter gets one file instead of a burst of prompts.
   */
  const handleBulkDownload = async () => {
    if (selectedResumes.length === 0 || isDownloadingSelection) return;

    // More than one resume selected — confirm before zipping and downloading.
    if (selectedResumes.length > 1) {
      setIsZipDownloadModalOpen(true);
      return;
    }

    const selected = resumes.filter(r => selectedResumes.includes(r.id));
    const resume = selected[0];
    toast.loading('Downloading resume...', { id: 'db-download' });
    try {
      const blob = await resumeService.download(resume.id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      // Original fileName keeps the real extension (pdf, docx, …).
      link.download = resume.fileName || `${resume.name || 'resume'}.pdf`;
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);
      toast.success('Resume downloaded', { id: 'db-download' });
      setSelectedResumes([]);
    } catch (error) {
      console.error('[TalentFlow] Download failed:', error);
      toast.error('Failed to download resume', { id: 'db-download' });
    }
  };

  // Zips and downloads the current selection — invoked from the ZIP download
  // confirmation modal's Continue button.
  const handleZipDownload = async () => {
    if (selectedResumes.length === 0) return;
    const selected = resumes.filter(r => selectedResumes.includes(r.id));

    setIsDownloadingSelection(true);
    toast.loading(`Preparing ${selected.length} resumes for download...`, { id: 'db-download' });
    try {
      const { zipSync } = await import('fflate');
      const files: { [path: string]: Uint8Array } = {};
      let failed = 0;

      for (let i = 0; i < selected.length; i++) {
        const resume = selected[i];
        const fileName = resume.fileName || `${resume.name || `resume_${i + 1}`}_resume`;
        try {
          const blob = await resumeService.download(resume.id);
          files[`resumes/${fileName}`] = new Uint8Array(await blob.arrayBuffer());
        } catch (error) {
          // One unreadable file shouldn't cost the recruiter the whole archive.
          console.error(`[TalentFlow] Failed to download ${fileName}:`, error);
          failed++;
        }
      }

      if (Object.keys(files).length === 0) {
        toast.error('Could not download any of the selected resumes', { id: 'db-download' });
        return;
      }

      const zipped = zipSync(files);
      const url = window.URL.createObjectURL(new Blob([zipped as unknown as BlobPart], { type: 'application/zip' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `resumes_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);

      toast.success(
        failed > 0
          ? `Downloaded ${Object.keys(files).length} resumes — ${failed} could not be read`
          : `Downloaded ${Object.keys(files).length} resumes`,
        { id: 'db-download' }
      );
      setSelectedResumes([]);
      setIsZipDownloadModalOpen(false);
    } catch (error) {
      console.error('[TalentFlow] ZIP download failed:', error);
      toast.error('Failed to prepare the download', { id: 'db-download' });
    } finally {
      setIsDownloadingSelection(false);
    }
  };

  // ✅ NEW: Handle bulk Resume Scoring
  const handleBulkResumeScoring = () => {
    const selectedResumesList = resumes.filter(r => selectedResumes.includes(r.id));
    if (selectedResumesList.length === 0) {
      toast.error('Please select at least one resume');
      return;
    }
    setResumesForApply(selectedResumesList);
    fetchJobs();
    setShowApplyToJobModal(true); // Use the same modal for selecting JD
  };

  // ✅ Handle bulk Assessment creation - Show job selection modal first
  const handleBulkAssessment = () => {
    const selectedResumesList = resumes.filter(r => selectedResumes.includes(r.id));
    if (selectedResumesList.length === 0) {
      toast.error('Please select at least one resume');
      return;
    }
    setResumesForApply(selectedResumesList);
    fetchJobs();
    setShowAssessmentJobModal(true); // Show job selection modal
  };

  // Handle job selection for Assessment creation
  const handleAssessmentJobSelect = async (resumeIds: string[], jobIds: string[], jobRecords?: Job[]) => {
    if (jobIds.length === 0 || resumeIds.length === 0) return;

    setShowAssessmentJobModal(false);

    // Get the selected job and resumes
    const jobId = jobIds[0]; // Take first selected job
    const selectedJob = jobRecords?.[0] || jobs.find(j => j.id === jobId);
    const selectedResumesList = resumeIds.map(id => {
      const resume = resumes.find(r => r.id === id);
      return {
        id: id,
        candidateName: resume?.candidateName || resume?.candidate_name || resume?.name || 'Unknown',
        email: resume?.email || '',
      };
    });

    // Store resumes in session storage for assessment page
    sessionStorage.setItem('assessmentResumes', JSON.stringify(selectedResumesList));

    // Clear selection
    setSelectedResumes([]);
    setResumesForApply([]);

    // Navigate to assessment creation page with job pre-selected
    const encodedTitle = encodeURIComponent(selectedJob?.title || '');
    router.push(`/recruitment/assessments?create=true&jd_id=${jobId}&jd_title=${encodedTitle}`);
  };

  // Handle actual apply action from modal - using async Celery scoring
  const handleApply = async (resumeIds: string[], jobIds: string[], jobRecords?: Job[]) => {
    if (jobIds.length === 0 || resumeIds.length === 0) return;

    setShowApplyToJobModal(false);

    /* The dialog reads the job list itself, so take the record it hands back;
       the local list is only a fallback. */
    const jobId = jobIds[0];
    const selectedJob = jobRecords?.[0] || jobs.find(j => j.id === jobId);

    try {
      // Check for already-scored resumes before proceeding
      const checkResult = await scoringService.checkExistingScores(jobId, resumeIds);

      if (checkResult.existing_count > 0) {
        const alreadyScoredNames = checkResult.existing_scores
          .map((s: any) => `${s.candidate_name} (${s.overall_score}%)`)
          .join(', ');

        if (checkResult.new_count === 0) {
          // ALL resumes already scored - block entirely
          toast.error(
            `All ${checkResult.existing_count} resume(s) already scored for "${checkResult.jd_title}": ${alreadyScoredNames}`,
            { duration: 6000 }
          );
          return;
        }

        // Some already scored, some new - alert and continue with only new ones
        toast.warning(
          `${checkResult.existing_count} resume(s) already scored and will be skipped: ${alreadyScoredNames}`,
          { duration: 5000 }
        );
        // Filter to only new (unscored) resume IDs
        const existingIds = new Set(checkResult.existing_scores.map((s: any) => s.resume_id));
        resumeIds = resumeIds.filter(id => !existingIds.has(id));
      }

      // Start async bulk scoring via Celery (only for new/unscored resumes)
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
      setResumesForApply([]);
      router.push(`/recruitment/resume-scoring?batch_id=${response.batch_id}`);
    } catch (error: any) {
      console.error('Failed to start scoring:', error);
      toast.error(error.message || 'Failed to start scoring');
    }
  };

  const handleCreateFolder = async (name: string, parentId?: string) => {
    try {
      // Same cap as My Resumes. The upload modal's input already stops typing
      // and pasting past it; this is the backstop on the submit path.
      if (name.trim().length > FOLDER_NAME_MAX_LENGTH) {
        toast.error(`Folder name must be ${FOLDER_NAME_MAX_LENGTH} characters or fewer`);
        return;
      }
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

  // Client-side search helper - searches across all text fields including phone, skills, and resume content
  const matchesSearch = useCallback((resume: Resume, query: string): boolean => {
    if (!query) return true;

    const searchTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 0);
    if (searchTerms.length === 0) return true;

    // Create searchable text from all relevant fields INCLUDING resume content
    const searchableFields = [
      resume.name,
      resume.email,
      resume.phone,
      resume.title,
      resume.location,
      resume.currentCompany,
      resume.previousCompany,
      resume.professionalSummary, // Search inside resume summary
      ...(resume.skills || []), // Skills from resume
      ...(resume.technicalSkills || []), // Technical skills from resume content
      ...(resume.softSkills || []), // Soft skills from resume content
    ].filter(Boolean).map(field => field?.toLowerCase() || '');

    const searchableText = searchableFields.join(' ');

    // Check if any search term matches (partial matching)
    return searchTerms.some(term => searchableText.includes(term));
  }, []);

  // Filter and sort resumes client-side
  const filteredAndSortedResumes = useMemo(() => {
    // Apply client-side search filtering for all fields including phone and skills
    let filtered = resumes;
    if (appliedSearchQuery) {
      filtered = resumes.filter(resume => matchesSearch(resume, appliedSearchQuery));
    }

    const sorted = [...filtered];
    switch (sortBy) {
      case 'latest':
        return sorted.sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime());
      case 'lastUpdated':
        return sorted.sort((a, b) => new Date(b.lastUpdated || b.uploadDate).getTime() - new Date(a.lastUpdated || a.uploadDate).getTime());
      case 'name-asc':
        return sorted.sort((a, b) => a.name.localeCompare(b.name));
      case 'name-desc':
        return sorted.sort((a, b) => b.name.localeCompare(a.name));
      case 'experience-high':
        return sorted.sort((a, b) => {
          const aExp = parseInt(a.experience as string) || 0;
          const bExp = parseInt(b.experience as string) || 0;
          return bExp - aExp;
        });
      case 'experience-low':
        return sorted.sort((a, b) => {
          const aExp = parseInt(a.experience as string) || 0;
          const bExp = parseInt(b.experience as string) || 0;
          return aExp - bExp;
        });
      default:
        return sorted;
    }
  }, [resumes, sortBy, appliedSearchQuery, matchesSearch]);

  // Client-side pagination
  const paginatedResumes = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredAndSortedResumes.slice(startIndex, endIndex);
  }, [filteredAndSortedResumes, currentPage, pageSize]);

  // Calculate total pages based on filtered results
  const calculatedTotalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredAndSortedResumes.length / pageSize));
  }, [filteredAndSortedResumes.length, pageSize]);

  // Calculate active filter count
  const activeFilterCount = Object.entries(filters).filter(([key, value]) => {
    if (key === 'skills' && Array.isArray(value)) return value.length > 0;
    if (key === 'experienceRange') return value && ((value as any).min !== undefined || (value as any).max !== undefined);
    if (key === 'uploadDateRange') return value && ((value as any).start || (value as any).end);
    return value !== null && value !== undefined && value !== '';
  }).length;

  // Pagination handlers
  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= calculatedTotalPages) {
      setCurrentPage(page);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // "Go to page" input — local text so a partial edit isn't clobbered by the
  // currentPage state until Enter/blur commits it.
  const [goToPage, setGoToPage] = useState(String(currentPage));
  useEffect(() => {
    setGoToPage(String(currentPage));
  }, [currentPage]);
  const commitGoToPage = () => {
    const page = Math.round(Number(goToPage));
    if (Number.isFinite(page) && page >= 1 && page <= calculatedTotalPages) {
      handlePageChange(page);
    } else {
      setGoToPage(String(currentPage));
    }
  };

  // Handle showing version history
  const handleShowVersionHistory = async (resume: Resume) => {
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
              size: v.file_size ? `${(v.file_size / 1024).toFixed(0)} KB` : undefined,
            }))
          : [{
              id: resume.id,
              name: resume.name || 'Resume',
              uploadDate: resume.uploadDate,
              version: resume.version || 1,
              uploadedBy: resume.uploadedBy || 'Unknown',
            }],
      };
      setSelectedResumeForVersion(resumeWithVersions);
      setShowVersionHistory(true);
    } catch (error) {
      console.error('Failed to fetch versions:', error);
      toast.error('Failed to load version history');
    } finally {
      setIsLoadingVersions(false);
    }
  };

  if (loading && resumes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <Loader2 className="w-6 h-6 animate-spin text-brand-blue" />
        <span className="ml-3 text-sm text-gray-600 dark:text-slate-400">Loading resume database...</span>
      </div>
    );
  }

  return (
    <FeatureGate feature="resume_upload">
    <DndProvider backend={HTML5Backend}>
    <main ref={rootRef} className="flex-1 overflow-x-clip bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
      <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Internal Database' }]} />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-start gap-3">
          <div className="hidden sm:flex w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 dark:bg-brand-blue/20 dark:ring-brand-blue/30 items-center justify-center shrink-0">
            <Search className="w-4 h-4 text-brand-blue" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1">
              <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-slate-50 tracking-tight">Internal Resume Database</h1>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-brand-blue/10 dark:bg-brand-blue/20 text-brand-blue ring-1 ring-brand-blue/20 dark:ring-brand-blue/30">
                {resumes.length.toLocaleString()} Resumes
              </span>
            </div>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400">
              Search and filter resumes from your organization's database
            </p>
          </div>
        </div>
      </div>

      {selectedResumes.length > 0 && (
        <div className="mb-5">
          <BulkActionsBar
            selectedCount={selectedResumes.length}
            onCancel={() => setSelectedResumes([])}
            // Same action set as My Resumes, in the same order. `onResumeScoring`
            // is deliberately not passed: its handler was identical to
            // `handleBulkApplyToJob` (same modal, same job picker), so the bar
            // showed "Score Resume" and "Resume Scoring" as two buttons doing
            // one thing.
            onApplyToJob={hasPlanFeature('resume_scoring') && (isTenantAdmin || (hasPermission('canRunScoring') && hasPermissionCode('internal_db:apply_job'))) ? handleBulkApplyToJob : undefined}
            onAssessment={hasPlanFeature('assessment') && (isTenantAdmin || (hasPermission('canCreateAssessments') && hasPermissionCode('internal_db:assessment'))) ? handleBulkAssessment : undefined}
            onAIInterview={hasPlanFeature('ai_interview') && (isTenantAdmin || hasPermission('canShareAIInterviews')) ? handleBulkAIInterview : undefined}
            onAITalentMatch={hasPlanFeature('ai_talent_match') && (isTenantAdmin || (hasPermission('canRunAiMatch') && hasPermissionCode('internal_db:ai_match'))) ? handleBulkAITalentMatch : undefined}
            onDownload={handleBulkDownload}
            onDelete={isTenantAdmin || hasPermissionCode('internal_db:delete') ? () => handleDeleteResumes(selectedResumes) : undefined}
          />
        </div>
      )}

      {/* tf-round-edges, not overflow-hidden: SearchFilterBarCompact opens its
          filter panel and sort menu as absolutely positioned children, and
          clipping the card would cut them off. Without it the bar's white and
          the pager's slate square off the corners they sit in. */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 tf-round-edges">
        <SearchFilterBarCompact
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          filters={filters}
          onFiltersChange={(next: SearchFilters) => search.setFilters(next as Record<string, unknown>)}
          sortBy={sortBy}
          onSortChange={setSortBy}
        />

        {/* Loading indicator for filter changes */}
        {loading && (
          <div className="flex items-center justify-center py-3 border-b border-gray-100 dark:border-slate-700 bg-brand-blue/5 dark:bg-brand-blue/10">
            <Loader2 className="w-4 h-4 animate-spin text-brand-blue mr-2" />
            <span className="text-xs sm:text-sm text-brand-blue">Searching...</span>
          </div>
        )}

        {/* Search Results Summary */}
        {(appliedSearchQuery || activeFilterCount > 0) && !loading && (
          <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-brand-blue" />
              <span className="text-sm text-gray-700 dark:text-slate-300">
                Found <span className="font-semibold">{filteredAndSortedResumes.length.toLocaleString()}</span> matching resume{filteredAndSortedResumes.length !== 1 ? 's' : ''}
                {appliedSearchQuery && (
                  <span> for "<span className="font-medium text-brand-blue">{appliedSearchQuery}</span>"</span>
                )}
              </span>
            </div>
            {(appliedSearchQuery || activeFilterCount > 0) && (
              <button
                // One reset for the query and every filter.
                onClick={search.reset}
                className="text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:underline"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}

        <ResumeTable
          resumes={paginatedResumes}
          selectedResumes={selectedResumes}
          draggable={false}
          onSelectResume={handleSelectResume}
          onSelectAll={handleSelectAll}
          onQuickView={(resume) => setQuickViewResume(resume)}
          onApplyToJob={hasPlanFeature('resume_scoring') && (isTenantAdmin || (hasPermission('canRunScoring') && hasPermissionCode('internal_db:apply_job'))) ? handleApplyToJob : undefined}
          onDelete={isTenantAdmin ? (id) => handleDelete(id) : undefined}
          onViewDetails={(resume) => {
            sessionStorage.setItem('resumeNavList', JSON.stringify(paginatedResumes.map((r) => r.id)));
            sessionStorage.setItem('resumeNavSource', 'resume-database');
            router.push(`/recruitment/resume-view/${resume.id}`);
          }}
          onVersion={handleShowVersionHistory}
          highlightQuery={appliedSearchQuery}
        />

        {/* Pagination */}
        {calculatedTotalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
            <div className="text-sm text-gray-600 dark:text-slate-400">
              Showing {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, filteredAndSortedResumes.length)} of {filteredAndSortedResumes.length.toLocaleString()} resumes
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 whitespace-nowrap">Go to</span>
                <input
                  type="number"
                  min={1}
                  max={calculatedTotalPages}
                  value={goToPage}
                  onChange={(e) => setGoToPage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.currentTarget.blur();
                      commitGoToPage();
                    }
                  }}
                  onBlur={commitGoToPage}
                  aria-label="Go to page"
                  className="w-14 h-8 sm:h-9 px-2 text-sm text-center border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100"
                />
              </div>

              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                aria-label="Previous page" title="Previous page"
              >
                <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>

              <span className="text-sm font-medium text-gray-700 dark:text-slate-300 px-1 whitespace-nowrap">
                <span className="text-brand-blue font-semibold">{currentPage}</span> / {calculatedTotalPages}
              </span>

              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === calculatedTotalPages}
                className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                aria-label="Next page" title="Next page"
              >
                <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* AI Interview invite — the same component My Resumes uses, so the two
          lists can't drift apart again. */}
      <InviteToAIInterviewFlow
        open={isAIInterviewFlowOpen}
        onClose={() => setIsAIInterviewFlowOpen(false)}
        candidates={resumes
          .filter((r) => selectedResumes.includes(r.id))
          .map((r) => ({ id: r.id, name: r.name, email: r.email }))}
        /* The full rows too, so the dialog can show the shared Candidates
           Selected panel rather than a bare count. */
        resumes={resumes.filter((r) => selectedResumes.includes(r.id)) as any}
        onInvited={() => setSelectedResumes([])}
      />

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
        <ResumeDetailView
          resume={viewingResume}
          onClose={() => setViewingResume(null)}
          onDelete={isTenantAdmin ? (id) => handleDelete(id) : undefined}
        />
      )}

      {/* Same document preview the version lists open, so viewing a resume
          looks the same wherever it is opened from. */}
      {quickViewResume && (
        <ResumeTextPreviewModal
          resumeId={quickViewResume.id}
          title={quickViewResume.name}
          subtitle={quickViewResume.fileName}
          onClose={() => setQuickViewResume(null)}
        />
      )}

      {showApplyToJobModal && (
        <ApplyToJobModal
          resumes={resumesForApply}
          jobs={jobs}
          mode="apply"
          onClose={() => {
            setShowApplyToJobModal(false);
            setResumesForApply([]);
          }}
          onApply={handleApply}
        />
      )}

      {/* AI Talent Match Modal */}
      {showAITalentMatchModal && (
        <AITalentMatchSelectJobModal
          resumes={resumesForApply}
          jobs={jobs}
          onClose={() => {
            setShowAITalentMatchModal(false);
            setResumesForApply([]);
          }}
          onMatch={(resumeIds, jobId) => {
            // Store selected resumes in sessionStorage for the AI Talent Match page
            const resumeData = resumesForApply.map(r => ({
              id: r.id,
              candidateName: r.name,
              email: r.email,
            }));
            sessionStorage.setItem('aiTalentMatchResumes', JSON.stringify(resumeData));

            // Close modal and clear selection
            setShowAITalentMatchModal(false);
            setResumesForApply([]);
            setSelectedResumes([]);

            // Navigate to AI Talent Match page with the selected JD
            router.push(`/recruitment/ai-talent-match?jdId=${jobId}&view=new`);
          }}
        />
      )}

      {/* Assessment Job Selection Modal */}
      {showAssessmentJobModal && (
        <ApplyToJobModal
          resumes={resumesForApply}
          jobs={jobs}
          mode="assessment"
          onClose={() => {
            setShowAssessmentJobModal(false);
            setResumesForApply([]);
          }}
          onApply={handleAssessmentJobSelect}
        />
      )}

      {/* Version History Modal */}
      {showVersionHistory && selectedResumeForVersion && (
        <VersionHistoryModal
          // VersionHistoryModal takes candidateName + versions, not a whole resume.
          // Passing `resume` meant `versions` was undefined and the modal rendered an
          // empty history - even though handleShowVersionHistory had already fetched
          // and attached them.
          candidateName={selectedResumeForVersion.candidateName}
          versions={selectedResumeForVersion.versions}
          onClose={() => {
            setShowVersionHistory(false);
            setSelectedResumeForVersion(null);
          }}
          onDownload={async (versionId: string) => {
            try {
              toast.loading('Downloading resume...', { id: 'download' });
              const blob = await resumeService.download(versionId);
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              const version = selectedResumeForVersion.versions?.find(v => v.id === versionId);
              a.download = version?.name || `${selectedResumeForVersion.name}_resume.pdf`;
              document.body.appendChild(a);
              a.click();
              window.URL.revokeObjectURL(url);
              document.body.removeChild(a);
              toast.success('Resume downloaded', { id: 'download' });
            } catch (error) {
              console.error('Download failed:', error);
              toast.error('Failed to download resume', { id: 'download' });
            }
          }}
        />
      )}
      {/* Delete Resume Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <AlertDialogContent className="max-w-md sm:max-w-lg">
          <button
            type="button"
            onClick={() => setDeleteConfirm(null)}
            className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
          <AlertDialogHeader>
            <div className="flex items-start gap-4 pr-8">
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
                <Trash2 className="h-6 w-6 text-red-600" />
              </div>
              <div className="flex-1 pt-1">
                <AlertDialogTitle className="text-2xl font-bold text-gray-900">
                  Delete {deleteConfirm && deleteConfirm.ids.length > 1 ? `${deleteConfirm.ids.length} Resumes` : 'Resume'}
                </AlertDialogTitle>
                <p className="mt-1 text-sm text-gray-500">This action is permanent and cannot be undone.</p>
              </div>
            </div>
            <AlertDialogDescription asChild>
              <div className="mt-2 space-y-4">
                <div className="space-y-4 rounded-xl border border-red-100 bg-red-50/60 p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-red-600 text-white">
                      <ShieldAlert className="h-4 w-4" />
                    </span>
                    <span className="h-6 w-px flex-shrink-0 bg-red-200" aria-hidden="true" />
                    <p className="text-sm text-gray-800">
                      This action is <span className="font-semibold text-red-600">permanent</span> and{' '}
                      <span className="font-semibold text-red-600">cannot be undone</span>.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-red-600 text-white">
                      <Lock className="h-4 w-4" />
                    </span>
                    <span className="h-6 w-px flex-shrink-0 bg-red-200" aria-hidden="true" />
                    <p className="text-sm text-gray-800">
                      Deleted {deleteConfirm && deleteConfirm.ids.length > 1 ? 'resumes' : 'resume'}{' '}
                      <span className="font-semibold text-red-600">cannot be recovered</span>.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-red-600 text-white">
                      <AlertCircle className="h-4 w-4" />
                    </span>
                    <span className="h-6 w-px flex-shrink-0 bg-red-200" aria-hidden="true" />
                    <p className="text-sm text-gray-800">
                      All associated data will be <span className="font-semibold text-red-600">permanently removed</span>.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 border-t border-gray-100 pt-4">
                  <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-2 border-brand-orange text-brand-orange">
                    <HelpCircle className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {deleteConfirm && deleteConfirm.ids.length > 1
                        ? <>Are you sure you want to delete <span className="font-semibold text-gray-900">{deleteConfirm.ids.length} resumes</span>?</>
                        : 'Are you sure you want to delete this resume?'
                      }
                    </p>
                    <p className="mt-0.5 text-sm text-gray-500">This action cannot be reversed.</p>
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="border-t border-gray-100 pt-4">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="gap-2 bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                if (deleteConfirm) {
                  executeDelete(deleteConfirm.ids);
                  setDeleteConfirm(null);
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
              Delete {deleteConfirm && deleteConfirm.ids.length > 1 ? 'Resumes' : 'Resume'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ZIP Download Confirmation Modal */}
      {isZipDownloadModalOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-50 animate-in fade-in duration-200"
            onClick={() => !isDownloadingSelection && setIsZipDownloadModalOpen(false)}
          />
          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[95vw] sm:max-w-md animate-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="flex items-start justify-between gap-4 p-6 border-b border-gray-200">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-brand-blue/10 rounded-2xl flex items-center justify-center flex-shrink-0">
                    <FileArchive className="w-7 h-7 text-brand-blue" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 tracking-tight">Download as ZIP</h3>
                    <p className="text-sm text-gray-500 mt-0.5">Multiple files selected</p>
                  </div>
                </div>
                <button
                  onClick={() => !isDownloadingSelection && setIsZipDownloadModalOpen(false)}
                  disabled={isDownloadingSelection}
                  className="p-1 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 flex items-center gap-4 border-b border-gray-200">
                <div className="w-16 h-16 bg-brand-blue/5 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <Users className="w-7 h-7 text-brand-blue" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-brand-blue">
                    {selectedResumes.length}
                    <span className="text-base font-semibold text-gray-900 ml-2">candidates selected</span>
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    All selected resumes will be downloaded and packed in a ZIP file.
                  </p>
                </div>
              </div>

              {/* Info */}
              <div className="flex items-center gap-3 px-6 py-4">
                <div className="w-7 h-7 bg-brand-blue/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <Info className="w-4 h-4 text-brand-blue" />
                </div>
                <p className="text-sm text-gray-700">
                  Do you want to download all selected resumes as a ZIP file?
                </p>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 rounded-b-2xl border-t border-gray-200">
                <button
                  onClick={() => setIsZipDownloadModalOpen(false)}
                  disabled={isDownloadingSelection}
                  className="px-5 py-2.5 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={handleZipDownload}
                  disabled={isDownloadingSelection}
                  className="flex items-center gap-2 px-5 py-2.5 text-white bg-brand-blue hover:bg-brand-blue-2 rounded-lg transition-all shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDownloadingSelection ? (
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
      </div>
      </div>
    </main>
    </DndProvider>
    </FeatureGate>
  );
}
