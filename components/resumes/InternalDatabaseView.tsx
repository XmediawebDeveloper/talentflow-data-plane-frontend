'use client';

import { formatExperienceRange } from '@/lib/utils/jobExperience';
import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Clock, Loader2, Search, Download, FileArchive, Users, Info } from 'lucide-react';
import { useAuth } from '@/lib/hooks/useAuth';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import ResumeTable, { ResumeTableSkeleton } from '@/components/ResumeTable';
import ListPagination from '@/components/ListPagination';
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
import { useInviteDialog } from '@/components/talent-match-invite/InviteDialogProvider';
import type { InviteCandidate } from '@/components/talent-match-invite/inviteVersions';
import { useListSearch } from '@/lib/hooks/useListSearch';
import { formatOverallScore } from '@/lib/utils/matchStatus';
import { formatCandidateExperience } from '@/lib/utils/resumeExperience';
import { Resume, Folder, Job } from '@/lib/types/types';
import { resumeService, folderService, ResumeSearchParams } from '@/lib/services/resumeService';
import { Resume as ApiResume, Folder as ApiFolder } from '@/lib/services/resumeService';
import { jdService } from '@/lib/services/jdService';
import { scoringService } from '@/lib/services/scoringService';
import { toast } from 'sonner';
import { friendlyErrorMessage } from '@/lib/utils/friendlyError';
import { handleQuotaError } from '@/lib/utils/quotaErrorHandler';
import DeleteResumeDialog from '@/components/resumes/DeleteResumeDialog';
import FeatureGate from '@/components/shared/FeatureGate';
import { Skeleton } from '@/components/ui/skeleton';
import { usePlanFeatures, usePlanLock } from '@/lib/hooks/usePlanFeature';
import { PLAN_LOCKED_MESSAGE } from '@/lib/types/planFeatures';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import { RESUME_VIEW_SOURCE_PARAM } from '@/lib/constants/resumePools';
import { fetchAllRows } from '@/lib/utils/fetchAllRows';

interface SearchFilters {
  skills?: string[];
  experienceRange?: { min?: number; max?: number };
  education?: string;
  location?: string;
  currentCompany?: string;
  previousCompany?: string;
  noticePeriod?: string;
  uploadDateRange?: { start?: string; end?: string };
  uploadedBy?: string;
  sourceType?: string;
}

/**
 * The "Shared Database" tab of the Resume Database page — every resume in the
 * tenant, flat (no folders). Rendered by the tabbed shell at
 * app/(dashboard)/recruitment/resume-database/page.tsx, which owns the
 * breadcrumb and the tab strip and passes them down as `header`.
 */
export default function InternalDatabaseView({ header }: { header?: ReactNode }) {
  const router = useRouter();
  const { user, isTenantAdmin, hasPermission, hasPermissionCode } = useAuth();
  const { hasPlanFeature } = usePlanFeatures();
  // Plan-gated actions stay visible but disabled (hover: PLAN_LOCKED_MESSAGE),
  // never hidden — see usePlanLock.
  const { isPlanLocked } = usePlanLock();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedResumes, setSelectedResumes] = useState<string[]>([]);
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
  const [totalIncludingVersions, setTotalIncludingVersions] = useState<number | undefined>(undefined);
  const [pageSize] = useState(10);

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

  // Invite Assessment / Invite AI Interview both open the one shared invite
  // popup (VersionInviteDialog); it asks for the assessment / interview itself.
  const { open: openInvite } = useInviteDialog();

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

    // Add uploaded by (uploader name, partial match)
    if (filters.uploadedBy) {
      params.uploaded_by_name = filters.uploadedBy;
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

  /* Bumped by every fetchData run and on unmount, so a response belonging to
     an older run (e.g. one for filters the user has since changed) is dropped
     instead of overwriting newer data. */
  const fetchSeqRef = useRef(0);

  // Fetch data with filters. Not keyed on the search text: search runs
  // client-side over the full list (see filteredAndSortedResumes), so typing
  // must not refetch the whole database on every debounced keystroke.
  const fetchData = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    const isStale = () => seq !== fetchSeqRef.current;
    setLoading(true);
    try {
      const params = buildSearchParams();
      // Probe with the smallest possible window to learn the true total,
      // then issue one full-size request so the UI shows every record.
      const [resumeResponse, folderResponse] = await Promise.all([
        fetchAllRows((page_size, page) => resumeService.list({ ...params, page_size, page })),
        folderService.list().catch(() => []),
      ]);
      if (isStale()) return;

      // Convert API Resume to component Resume type
      const convertedResumes: Resume[] = resumeResponse.items.map((r: ApiResume) => ({
        id: r.id,
        name: r.candidate_name || r.file_name?.replace(/\.[^/.]+$/, '') || 'Unknown',
        email: r.email || 'No email',
        phone: r.phone || 'No phone',
        title: r.current_title || 'N/A',
        experience: formatCandidateExperience(r.experience_months, r.experience_years) || 'N/A',
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
        is_archived: r.is_archived || false,
        isArchived: r.is_archived || false,
        is_tenant_user_email: r.is_tenant_user_email || false,
        isTenantUserEmail: r.is_tenant_user_email || false,
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
      setTotalIncludingVersions(resumeResponse.total_including_versions);
    } catch (error) {
      if (isStale()) return;
      console.error('Failed to fetch data:', error);
      toast.error('Failed to load resume database');
    } finally {
      // A stale run leaves the loading state to the run that replaced it.
      if (!isStale()) setLoading(false);
    }
  }, [buildSearchParams]);

  // Fetch data when search params change
  useEffect(() => {
    fetchData();
  }, [fetchData]);
  // Invalidate the in-flight run on unmount.
  useEffect(() => () => { fetchSeqRef.current += 1; }, []);

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

  // A resume whose email matches an existing team member is locked out of
  // selection entirely — ResumeTable disables its checkbox, but these guard
  // any other path (e.g. a stale click) from slipping it into the selection.
  const isTenantUserEmailResume = (resume: Resume): boolean =>
    !!(resume.is_tenant_user_email ?? resume.isTenantUserEmail);

  const handleSelectResume = (id: string) => {
    const target = resumes.find(r => r.id === id);
    if (target && isTenantUserEmailResume(target)) return;
    setSelectedResumes(prev =>
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    );
  };

  const handleSelectAll = (selected: boolean) => {
    setSelectedResumes(selected ? resumes.filter(r => !isTenantUserEmailResume(r)).map(r => r.id) : []);
  };

  const [deleteConfirm, setDeleteConfirm] = useState<{ ids: string[]; names: string[] } | null>(null);

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

  const resumeName = (id: string) => {
    const r = resumes.find(r => r.id === id);
    return r?.candidate_name || r?.file_name || 'this resume';
  };

  const handleDelete = (id: string) => {
    setDeleteConfirm({ ids: [id], names: [resumeName(id)] });
  };

  const handleDeleteResumes = (ids: string[]) => {
    setDeleteConfirm({ ids, names: ids.map(resumeName) });
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
    experience: formatCandidateExperience(r.experience_months, r.experience_years) || 'N/A',
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
      const response = await fetchAllRows((page_size, page) => jdService.list({ page_size, page, source: 'my-jds' }));
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
        experience: jd.experience_required || formatExperienceRange(jd.experience_min, jd.experience_max),
        experience_level: jd.job_level || jd.experience_level || undefined,
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

  // Archived resumes are off-limits for Score / AI Talent Match / Assessment /
  // AI Interview — same rule My Resumes applies (MyResumesView.tsx's own
  // isResumeArchived), just without that view's "Archived Resumes" folder
  // concept, which doesn't exist here.
  const isResumeArchived = (resume: Resume): boolean => !!(resume.is_archived ?? resume.isArchived);

  // Handle Apply to Job for single resume
  const handleApplyToJob = (resume: Resume) => {
    if (isResumeArchived(resume)) {
      toast.error('Archived resume cannot be applied to any job. Please select an active resume.');
      return;
    }
    if (isTenantUserEmailResume(resume)) {
      toast.error('This resume belongs to an existing team member and cannot be applied to any job.');
      return;
    }
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
    const archivedCount = selectedResumesList.filter(isResumeArchived).length;
    if (archivedCount > 0) {
      toast.error(`Archived resume${archivedCount > 1 ? 's' : ''} cannot be applied to any job. Please select active resumes only.`);
      return;
    }
    const tenantUserCount = selectedResumesList.filter(isTenantUserEmailResume).length;
    if (tenantUserCount > 0) {
      toast.error(`${tenantUserCount} selected resume${tenantUserCount > 1 ? 's belong' : ' belongs'} to an existing team member and cannot be applied to any job.`);
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
    const archivedCount = selectedResumesList.filter(isResumeArchived).length;
    if (archivedCount > 0) {
      toast.error(`Archived resume${archivedCount > 1 ? 's' : ''} cannot be used with AI Talent Match. Please select active resumes only.`);
      return;
    }
    const tenantUserCount = selectedResumesList.filter(isTenantUserEmailResume).length;
    if (tenantUserCount > 0) {
      toast.error(`${tenantUserCount} selected resume${tenantUserCount > 1 ? 's belong' : ' belongs'} to an existing team member and cannot be used with AI Talent Match.`);
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
    const archivedCount = resumes
      .filter(r => selectedResumes.includes(r.id))
      .filter(isResumeArchived).length;
    if (archivedCount > 0) {
      toast.error(`Archived resume${archivedCount > 1 ? 's' : ''} cannot be invited to an AI interview. Please select active resumes only.`);
      return;
    }
    const tenantUserCount = resumes
      .filter(r => selectedResumes.includes(r.id))
      .filter(isTenantUserEmailResume).length;
    if (tenantUserCount > 0) {
      toast.error(`${tenantUserCount} selected resume${tenantUserCount > 1 ? 's belong' : ' belongs'} to an existing team member and cannot be invited to an AI interview.`);
      return;
    }
    openInvite({
      kind: 'interview',
      candidates: selectedInviteCandidates(),
      // Shown ticked in the popup's Resume Database › Shared Database, which opens first.
      pickInto: 'internal-db',
      onSent: () => setSelectedResumes([]),
    });
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

  /* The ticked resumes as invite-popup candidates. Resumes without an email
     are still passed — the popup lists them as disabled "No email" rows.
     Rows carry "No email" / "No phone" placeholders, stripped back here. */
  const selectedInviteCandidates = (): InviteCandidate[] =>
    resumes
      .filter((r) => selectedResumes.includes(r.id))
      .map((r) => {
        const email = typeof r.email === 'string' && r.email.includes('@') ? r.email.trim() : '';
        const rawPhone = (r as any).phone;
        const phone = typeof rawPhone === 'string' && rawPhone && rawPhone !== 'No phone' ? rawPhone : undefined;
        return {
          id: r.id,
          name: r.name,
          email,
          phone,
          resumeId: r.id,
          inviteSource: 'Internal DB',
        };
      });

  // Bulk Invite Assessment — opens the shared invite popup, which starts with
  // a picker of every published assessment. (It used to pick a job and route
  // to the assessments page with candidates in sessionStorage that nothing
  // read, so no invite was ever sent.)
  const handleBulkAssessment = () => {
    if (selectedResumes.length === 0) {
      toast.error('Please select at least one resume');
      return;
    }
    const archivedCount = resumes
      .filter(r => selectedResumes.includes(r.id))
      .filter(isResumeArchived).length;
    if (archivedCount > 0) {
      toast.error(`Archived resume${archivedCount > 1 ? 's' : ''} cannot be invited to an assessment. Please select active resumes only.`);
      return;
    }
    const tenantUserCount = resumes
      .filter(r => selectedResumes.includes(r.id))
      .filter(isTenantUserEmailResume).length;
    if (tenantUserCount > 0) {
      toast.error(`${tenantUserCount} selected resume${tenantUserCount > 1 ? 's belong' : ' belongs'} to an existing team member and cannot be invited to an assessment.`);
      return;
    }
    openInvite({
      kind: 'assessment',
      candidates: selectedInviteCandidates(),
      // Shown ticked in the popup's Resume Database › Shared Database, which opens first.
      pickInto: 'internal-db',
      onSent: () => setSelectedResumes([]),
    });
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
          .map((s: any) => `${s.candidate_name} (${formatOverallScore(s.overall_rating_10, s.overall_score)})`)
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
      toast.error(friendlyErrorMessage(error, "Couldn't start scoring. Please try again."));
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
    // Exact-match skeleton: the same page chrome (breadcrumb, header, search bar)
    // and a table skeleton that mirrors ResumeTable's real columns — so the
    // placeholder lines up with the content that replaces it, not a generic block.
    return (
      <main className="tf-page">
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="tf-page-sheet">
            {/* Breadcrumb + tab strip — rendered for real even while the list
                loads, so switching tabs stays possible and nothing shifts. */}
            {header}
            {/* Header: icon, title + count pill, description */}
            <div className="flex items-start gap-3 mb-5">
              <Skeleton className="hidden sm:block h-9 w-9 rounded-lg shrink-0" />
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-6 w-52" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
                <Skeleton className="h-4 w-80 max-w-full" />
              </div>
            </div>
            {/* Search + table card */}
            <div className="tf-card tf-round-edges overflow-hidden">
              <div className="p-3 flex gap-2 items-center border-b border-gray-200">
                <Skeleton className="h-9 flex-1 rounded-lg" />
                <Skeleton className="h-9 w-24 rounded-lg" />
                <Skeleton className="h-9 w-20 rounded-lg" />
              </div>
              <ResumeTableSkeleton rows={8} />
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <FeatureGate feature="resume_upload">
    <DndProvider backend={HTML5Backend}>
    <main ref={rootRef} className="tf-page">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="tf-page-sheet">
      {header}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-start gap-3">
          <div className="hidden sm:flex w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 dark:bg-brand-blue/20 dark:ring-brand-blue/30 items-center justify-center shrink-0">
            <Search className="w-4 h-4 text-brand-blue" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1">
              <h1 className="tf-page-title">Shared Resume Database</h1>
              <span className="tf-badge bg-brand-blue/10 dark:bg-brand-blue/20 text-brand-blue ring-1 ring-brand-blue/20 dark:ring-brand-blue/30">
                {/* The same rows the table lists (search applied). The
                    versions note is a server total for the whole list, so it
                    only shows while no search is narrowing it. */}
                {filteredAndSortedResumes.length.toLocaleString()} Resumes
                {!appliedSearchQuery && typeof totalIncludingVersions === 'number' && totalIncludingVersions > totalResumes && (
                  <> ({totalIncludingVersions - totalResumes} versions)</>
                )}
              </span>
            </div>
            <p className="tf-body-secondary">
              Search and filter resumes shared across your organization
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
            onApplyToJob={handleBulkApplyToJob}
            onApplyToJobDisabled={isPlanLocked('resume_scoring') || !(isTenantAdmin || (hasPermission('canRunScoring') && hasPermissionCode('internal_db:score')))}
            onApplyToJobDisabledReason={!(isTenantAdmin || (hasPermission('canRunScoring') && hasPermissionCode('internal_db:score'))) ? "You do not have permission to score resumes" : PLAN_LOCKED_MESSAGE}
            onAssessment={handleBulkAssessment}
            onAssessmentDisabled={isPlanLocked('assessment') || !(isTenantAdmin || (hasPermission('canCreateAssessments') && hasPermissionCode('internal_db:assessment')))}
            onAssessmentDisabledReason={!(isTenantAdmin || (hasPermission('canCreateAssessments') && hasPermissionCode('internal_db:assessment'))) ? "You do not have permission to invite candidates to an assessment" : PLAN_LOCKED_MESSAGE}
            onAIInterview={handleBulkAIInterview}
            onAIInterviewDisabled={isPlanLocked('ai_interview') || !(isTenantAdmin || (hasPermission('canInviteAIInterviews') && hasPermissionCode('internal_db:invite_ai_interview')))}
            onAIInterviewDisabledReason={!(isTenantAdmin || (hasPermission('canInviteAIInterviews') && hasPermissionCode('internal_db:invite_ai_interview'))) ? "You do not have permission to invite candidates to an AI interview" : PLAN_LOCKED_MESSAGE}
            onAITalentMatch={handleBulkAITalentMatch}
            onAITalentMatchDisabled={isPlanLocked('ai_talent_match') || !(isTenantAdmin || (hasPermission('canRunAiMatch') && hasPermissionCode('internal_db:ai_match')))}
            onAITalentMatchDisabledReason={!(isTenantAdmin || (hasPermission('canRunAiMatch') && hasPermissionCode('internal_db:ai_match'))) ? "You do not have permission to run AI talent match" : PLAN_LOCKED_MESSAGE}
            onDownload={handleBulkDownload}
            onDelete={() => handleDeleteResumes(selectedResumes)}
            onDeleteDisabled={!(isTenantAdmin || hasPermissionCode('internal_db:delete'))}
            onDeleteDisabledReason="You do not have permission to delete resumes"
          />
        </div>
      )}

      {/* No frame of its own: this wraps the page's whole list inside the white
          page panel, so a border/ring/shadow here was a card-in-panel double
          frame that pushed the search and cards in from the panel's 16/32px
          content inset. Not overflow-hidden either — SearchFilterBarCompact
          opens its filter panel and sort menu as absolutely positioned
          children, and clipping would cut them off. */}
      <div className="bg-white dark:bg-slate-900">
        {/* Search pinned to the top of the scroll viewport so it stays reachable
            while the list scrolls. Opaque background so rows can't show through,
            and z above the rows below it. The filter panel/sort menu open as
            children, so they ride along with the sticky bar — no
            overflow-hidden, which would clip the open filter panel. Offset by
            --crumb-h (set by the page) so it pins just below the sticky
            breadcrumb instead of under it. */}
        <div className="sticky top-[var(--crumb-h,0px)] z-20 bg-white dark:bg-slate-900">
          <SearchFilterBarCompact
            searchQuery={searchQuery}
            onSearchChange={handleSearchChange}
            filters={filters}
            onFiltersChange={(next: SearchFilters) => search.setFilters(next as Record<string, unknown>)}
            sortBy={sortBy}
            onSortChange={setSortBy}
          />
        </div>

        {/* Loading indicator for filter changes */}
        {loading && (
          <div className="flex items-center justify-center py-3 border-b border-gray-100 dark:border-slate-700 bg-brand-blue/5 dark:bg-brand-blue/10">
            <Loader2 className="w-4 h-4 animate-spin text-brand-blue mr-2" />
            <span className="text-sm text-brand-blue">Searching...</span>
          </div>
        )}

        {/* Search Results Summary */}
        {(appliedSearchQuery || activeFilterCount > 0) && !loading && (
          <div className="py-3 border-b border-gray-100 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-brand-blue" />
              <span className="tf-body">
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
          flushCards
          showTeamMemberBadge
          resumes={paginatedResumes}
          selectedResumes={selectedResumes}
          draggable={false}
          onSelectResume={handleSelectResume}
          onSelectAll={handleSelectAll}
          onQuickView={(resume) => setQuickViewResume(resume)}
          onApplyToJob={handleApplyToJob}
          onApplyToJobDisabled={isPlanLocked('resume_scoring') || !(isTenantAdmin || (hasPermission('canRunScoring') && hasPermissionCode('internal_db:score')))}
          onApplyToJobDisabledReason={!(isTenantAdmin || (hasPermission('canRunScoring') && hasPermissionCode('internal_db:score'))) ? "You do not have permission to score resumes" : PLAN_LOCKED_MESSAGE}
          canShare={isTenantAdmin || hasPermissionCode('internal_db:share')}
          onDelete={(id) => handleDelete(id)}
          onDeleteDisabled={!(isTenantAdmin || hasPermissionCode('internal_db:delete'))}
          onDeleteDisabledReason="You do not have permission to delete resumes"
          onViewDetails={(resume) => {
            sessionStorage.setItem('resumeNavList', JSON.stringify(paginatedResumes.map((r) => r.id)));
            sessionStorage.setItem('resumeNavSource', 'resume-database');
            router.push(`/recruitment/resume-view/${resume.id}?${RESUME_VIEW_SOURCE_PARAM}=internal-db`);
          }}
          onVersion={handleShowVersionHistory}
          highlightQuery={appliedSearchQuery}
        />

        {/* The Job Descriptions pager (shared ListPagination). This list
            pages a fixed 10 at a time, so 10 is its only size. */}
        <ListPagination
          currentPage={currentPage}
          itemsPerPage={pageSize}
          totalItems={filteredAndSortedResumes.length}
          onPageChange={handlePageChange}
          onItemsPerPageChange={() => {}}
          itemLabel="resumes"
          pageSizeOptions={[pageSize]}
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
        <ResumeDetailView
          resume={viewingResume}
          onClose={() => setViewingResume(null)}
          onDelete={(id) => handleDelete(id)}
          onDeleteDisabled={!(isTenantAdmin || hasPermissionCode('internal_db:delete'))}
          onDeleteDisabledReason="You do not have permission to delete resumes"
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
          /* Scores the resumes — so the scoring title, steps and button. */
          mode="scoring"
          /* Score Resume: the All Jobs list - Archived / Disabled shown, not pickable. */
          excludeDraftsOnly
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
      <DeleteResumeDialog
        open={!!deleteConfirm}
        names={deleteConfirm?.names ?? []}
        onCancel={() => setDeleteConfirm(null)}
        onConfirm={() => {
          if (deleteConfirm) {
            executeDelete(deleteConfirm.ids);
            setDeleteConfirm(null);
          }
        }}
      />

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
                    <p className="tf-body-muted mt-0.5">Multiple files selected</p>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-4 sm:p-6 flex items-center gap-4 border-b border-gray-200">
                <div className="w-14 h-14 sm:w-16 sm:h-16 bg-brand-blue/5 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <Users className="w-7 h-7 text-brand-blue" />
                </div>
                <div className="min-w-0">
                  <p className="text-2xl font-bold text-brand-blue">
                    {selectedResumes.length}
                    <span className="tf-section-title ml-2">candidates selected</span>
                  </p>
                  <p className="tf-body-muted mt-1">
                    All selected resumes will be downloaded and packed in a ZIP file.
                  </p>
                </div>
              </div>

              {/* Info */}
              <div className="flex items-center gap-3 px-6 py-4">
                <div className="w-7 h-7 bg-brand-blue/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <Info className="w-4 h-4 text-brand-blue" />
                </div>
                <p className="tf-body">
                  Do you want to download all selected resumes as a ZIP file?
                </p>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 rounded-b-2xl border-t border-gray-200">
                <button
                  onClick={() => setIsZipDownloadModalOpen(false)}
                  disabled={isDownloadingSelection}
                  className="tf-btn tf-btn-secondary px-5 py-2.5 text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 hover:border-brand-blue/30 whitespace-normal gap-0"
                >
                  Cancel
                </button>
                <button
                  onClick={handleZipDownload}
                  disabled={isDownloadingSelection}
                  className="tf-btn tf-btn-primary flex px-5 py-2.5 bg-brand-blue hover:bg-brand-blue-2 shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 whitespace-normal justify-start"
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
