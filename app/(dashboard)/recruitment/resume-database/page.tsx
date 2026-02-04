'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Clock, Loader2, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import ResumeTable from '@/components/ResumeTable';
import StatsCards from '@/components/StatsCards';
import SearchFilterBarCompact from '@/components/SearchFilterBarCompact';
import BulkActionsBar from '@/components/BulkActionsBar';
import UploadHistoryPanel from '@/components/UploadHistoryPanel';
import UploadModal from '@/components/UploadModal';
import ResumeDetailView from '@/components/ResumeDetailView';
import ResumeQuickViewModal from '@/components/ResumeQuickViewModal';
import ApplyToJobModal from '@/components/ApplyToJobModal';
import { Resume, Folder, Job } from '@/lib/types/types';
import { resumeService, folderService, ResumeSearchParams } from '@/lib/services/resumeService';
import { Resume as ApiResume, Folder as ApiFolder } from '@/lib/services/resumeService';
import { jdService } from '@/lib/services/jdService';
import { scoringService } from '@/lib/services/scoringService';
import { toast } from 'sonner';
import { handleQuotaError } from '@/lib/utils/quotaErrorHandler';

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
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedResumes, setSelectedResumes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [appliedSearchQuery, setAppliedSearchQuery] = useState(''); // Actual query used for API
  const [filters, setFilters] = useState<SearchFilters>({});
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

  // Build search params from filters
  const buildSearchParams = useCallback((): ResumeSearchParams => {
    const params: ResumeSearchParams = {
      source: 'internal-db',
      page: 1,
      page_size: 100, // API max limit
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
      const [resumeResponse, folderResponse] = await Promise.all([
        resumeService.list(params),
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
        uploadedBy: r.uploaded_by_name || 'System',
        versionCount: r.version_count || 1,
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

  // Reset to page 1 when filters or search change
  useEffect(() => {
    if (initialLoadDone.current) {
      setCurrentPage(1);
    }
  }, [appliedSearchQuery, filters]);

  // Handle search change from SearchFilterBarCompact (already debounced)
  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    setAppliedSearchQuery(query);
    initialLoadDone.current = true;
  }, []);

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
      return;
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
    attachments: 1,
    uploadedBy: r.uploaded_by_name || 'System',
    versionCount: r.version_count || 1,
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

  // Fetch jobs for Apply to Job modal
  const fetchJobs = async () => {
    try {
      const response = await jdService.list({ page_size: 100, source: 'my-jds' });
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

  // Handle actual apply action from modal - using async Celery scoring
  const handleApply = async (resumeIds: string[], jobIds: string[]) => {
    if (jobIds.length === 0 || resumeIds.length === 0) return;

    setShowApplyToJobModal(false);

    // Get the selected job details
    const jobId = jobIds[0];
    const selectedJob = jobs.find(j => j.id === jobId);

    try {
      // Start async bulk scoring via Celery
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
          const aExp = parseInt(a.experience) || 0;
          const bExp = parseInt(b.experience) || 0;
          return bExp - aExp;
        });
      case 'experience-low':
        return sorted.sort((a, b) => {
          const aExp = parseInt(a.experience) || 0;
          const bExp = parseInt(b.experience) || 0;
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

  // Generate page numbers for pagination
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisiblePages = 5;
    const total = calculatedTotalPages;

    if (total <= maxVisiblePages) {
      for (let i = 1; i <= total; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) pages.push(i);
        pages.push('...');
        pages.push(total);
      } else if (currentPage >= total - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = total - 3; i <= total; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
        pages.push('...');
        pages.push(total);
      }
    }
    return pages;
  };

  if (loading && resumes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-gray-800" />
        <span className="ml-3 text-gray-600">Loading resume database...</span>
      </div>
    );
  }

  return (
    <DndProvider backend={HTML5Backend}>
    <main className="flex-1 p-8 bg-gray-50">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-semibold text-gray-900">Internal Resume Database</h1>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-700">
              {resumes.length.toLocaleString()} Resumes
            </span>
          </div>
          <p className="text-sm text-gray-600">
            Search and filter resumes from your organization's database
          </p>
        </div>
      </div>

      {selectedResumes.length > 0 && (
        <div className="mb-6">
          <BulkActionsBar
            selectedCount={selectedResumes.length}
            onCancel={() => setSelectedResumes([])}
            onApplyToJob={handleBulkApplyToJob}
            onDelete={() => handleDeleteResumes(selectedResumes)}
            onResumeScoring={() => {}}
            onAssessment={() => {}}
          />
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <SearchFilterBarCompact
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          filters={filters}
          onFiltersChange={setFilters}
          sortBy={sortBy}
          onSortChange={setSortBy}
        />

        {/* Loading indicator for filter changes */}
        {loading && (
          <div className="flex items-center justify-center py-4 border-b border-gray-200 bg-blue-50">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600 mr-2" />
            <span className="text-sm text-blue-600">Searching...</span>
          </div>
        )}

        {/* Search Results Summary */}
        {(appliedSearchQuery || activeFilterCount > 0) && !loading && (
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-700">
                Found <span className="font-semibold">{filteredAndSortedResumes.length.toLocaleString()}</span> matching resume{filteredAndSortedResumes.length !== 1 ? 's' : ''}
                {appliedSearchQuery && (
                  <span> for "<span className="font-medium text-blue-600">{appliedSearchQuery}</span>"</span>
                )}
              </span>
            </div>
            {(appliedSearchQuery || activeFilterCount > 0) && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setAppliedSearchQuery('');
                  setFilters({});
                }}
                className="text-sm text-red-600 hover:text-red-700 hover:underline"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}

        <ResumeTable
          resumes={paginatedResumes}
          selectedResumes={selectedResumes}
          onSelectResume={handleSelectResume}
          onSelectAll={handleSelectAll}
          onQuickView={(resume) => setQuickViewResume(resume)}
          onApplyToJob={handleApplyToJob}
          onDelete={(id) => handleDelete(id)}
          onViewDetails={(resume) => router.push(`/recruitment/resume-view/${resume.id}`)}
          highlightQuery={appliedSearchQuery}
        />

        {/* Pagination */}
        {calculatedTotalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <div className="text-sm text-gray-600">
              Showing {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, filteredAndSortedResumes.length)} of {filteredAndSortedResumes.length.toLocaleString()} resumes
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="p-2 rounded-md border border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {getPageNumbers().map((page, index) => (
                typeof page === 'number' ? (
                  <button
                    key={index}
                    onClick={() => handlePageChange(page)}
                    className={`px-3 py-1 rounded-md text-sm ${
                      currentPage === page
                        ? 'bg-blue-600 text-white'
                        : 'border border-gray-300 hover:bg-gray-100'
                    }`}
                  >
                    {page}
                  </button>
                ) : (
                  <span key={index} className="px-2 text-gray-500">...</span>
                )
              ))}

              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === calculatedTotalPages}
                className="p-2 rounded-md border border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
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
        />
      )}

      {quickViewResume && (
        <ResumeQuickViewModal
          resume={quickViewResume}
          onClose={() => setQuickViewResume(null)}
        />
      )}

      {showApplyToJobModal && (
        <ApplyToJobModal
          resumes={resumesForApply}
          jobs={jobs}
          onClose={() => {
            setShowApplyToJobModal(false);
            setResumesForApply([]);
          }}
          onApply={handleApply}
        />
      )}
    </main>
    </DndProvider>
  );
}
