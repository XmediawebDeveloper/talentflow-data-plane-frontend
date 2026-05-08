'use client';

import { X, Users, Database, Search, CheckSquare, Square, MinusSquare, Loader2, Mail, Phone, Briefcase, MapPin, Calendar, Target, ArrowLeft, FolderOpen, ChevronRight, ChevronDown, Folder, Clock, CheckCircle2, XCircle, User, Timer, Minus, RotateCcw, Upload } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { resumeService, folderService, Resume, Folder as FolderType } from '@/lib/services/resumeService';
import { scoringService } from '@/lib/services/scoringService';
import { dispatchUnitsConsumed } from '@/lib/services/api';
import { toast } from 'sonner';
import { handleQuotaError } from '@/lib/utils/quotaErrorHandler';
import { useAuth } from '@/components/providers/AuthProvider';
import BulkScoringProgressModal, { ScoringProgressItem } from './BulkScoringProgressModal';
import UploadModal from './UploadModal';
import { useScoringProgress } from '@/contexts/ScoringProgressContext';

// Progress item interface (internal)
interface ProgressItem {
  resumeId: string;
  candidateName: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'already_scored';
  score?: number;
  matchStatus?: string;
  errorMessage?: string;
}

interface SelectSourceModalProps {
  onClose: () => void;
  jobTitle: string;
  jobId: string;
  onScoringComplete?: () => void;
}

export default function SelectSourceModal({
  onClose,
  jobTitle,
  jobId,
  onScoringComplete
}: SelectSourceModalProps) {
  const router = useRouter();
  const { user, tenant, isTenantAdmin, hasPermissionCode } = useAuth();
  const { startScoringJob, updateItemStatus, setMainPanelOpen, setOnRestorePanel, setMinimized } = useScoringProgress();

  // Check if user has Internal DB access permission
  const hasInternalDBAccess = user?.permissions?.canAccessInternalDB || user?.permissions?.canViewInternalDB || false;

  // Check if user has scoring permission
  const canRunScoring = isTenantAdmin || (user?.permissions?.canRunScoring ?? false);

  // Check if user has upload permission (matches My Resumes page RBAC check)
  const canUploadResumes = isTenantAdmin || hasPermissionCode('my_resumes:upload') || hasPermissionCode('my_resumes:create');

  // State
  const [activeTab, setActiveTab] = useState<'my-resumes' | 'internal-db'>('my-resumes');
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedResumes, setSelectedResumes] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string>('all');
  const [expandedFolders, setExpandedFolders] = useState<string[]>([]);

  // Progress modal state
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [progressItems, setProgressItems] = useState<ProgressItem[]>([]);
  const [scoringStats, setScoringStats] = useState({ queued: 0, processing: 0, completed: 0, failed: 0 });
  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Hide global floating widget while this modal is open (overlay covers everything)
  useEffect(() => {
    setMainPanelOpen(showProgressModal);
    return () => { setMainPanelOpen(false); };
  }, [showProgressModal, setMainPanelOpen]);

  // Fetch resumes and folders on mount and tab change
  useEffect(() => {
    fetchData();
  }, [activeTab]);

  // Auto-expand all folders when they load
  useEffect(() => {
    if (folders.length > 0) {
      const allFolderIds = folders.map(f => f.id);
      setExpandedFolders(allFolderIds);
    }
  }, [folders]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch resumes based on active tab (include archived so they show as disabled)
      const resumeResponse = await resumeService.list({
        source: activeTab,
        page_size: 100,
        include_archived: true
      });
      setResumes(resumeResponse.items || []);

      // Fetch folders only for my-resumes tab
      if (activeTab === 'my-resumes') {
        try {
          const folderData = await folderService.list();
          console.log('[SelectSourceModal] Fetched folders:', folderData);
          console.log('[SelectSourceModal] Folders count:', folderData?.length || 0);

          // Log each folder's details
          folderData?.forEach((folder, index) => {
            console.log(`[SelectSourceModal] Folder ${index + 1}:`, {
              id: folder.id,
              name: folder.name,
              parent_id: folder.parent_id,
              resume_count: folder.resume_count
            });
          });

          setFolders(folderData || []);
        } catch (e) {
          console.error('Failed to fetch folders:', e);
          setFolders([]);
        }
      }
    } catch (error) {
      console.error('Failed to fetch resumes:', error);
      toast.error('Failed to load resumes. Please try again.');
      setResumes([]);
    } finally {
      setLoading(false);
    }
  };

  // Set a timeout to stop loading if API is too slow
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (loading) {
        setLoading(false);
        console.warn('Resume fetch timed out');
      }
    }, 10000);

    return () => clearTimeout(timeoutId);
  }, [loading]);

  // Filter resumes based on search and folder
  const getFilteredResumes = () => {
    let filtered = resumes;

    // Filter by folder (only for my-resumes)
    if (activeTab === 'my-resumes' && selectedFolder !== 'all') {
      filtered = filtered.filter(r => r.folder_id === selectedFolder);
    }

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(resume =>
        (resume.candidate_name || '').toLowerCase().includes(term) ||
        (resume.email || '').toLowerCase().includes(term) ||
        (resume.current_title || '').toLowerCase().includes(term) ||
        (resume.skills || []).some(skill => skill.toLowerCase().includes(term))
      );
    }

    return filtered;
  };

  const filteredResumes = getFilteredResumes();

  // Toggle resume selection
  const handleToggleResume = (resumeId: string) => {
    // Check if resume is archived OR if we're in the Archived folder
    const resume = resumes.find(r => r.id === resumeId);

    // Check if currently viewing Archived folder
    const selectedFolderData = folders.find(f => f.id === selectedFolder);
    const isArchivedFolder = selectedFolderData?.name?.toLowerCase().includes('archived') || false;

    // Block if resume is archived OR if viewing archived folder
    if (resume?.is_archived || isArchivedFolder) {
      toast.error('Archived resumes cannot be scored. Please select an active resume.');
      return;
    }

    setSelectedResumes(prev =>
      prev.includes(resumeId)
        ? prev.filter(id => id !== resumeId)
        : [...prev, resumeId]
    );
  };

  // Select/deselect all VISIBLE resumes — preserves picks in other folders.
  const handleSelectAll = () => {
    const selectedFolderData = folders.find(f => f.id === selectedFolder);
    const isArchivedFolder = selectedFolderData?.name?.toLowerCase().includes('archived') || false;
    if (isArchivedFolder) {
      toast.error('Archived resumes cannot be scored. Please select an active resume.');
      return;
    }
    const visibleIds = filteredResumes.filter(r => !r.is_archived).map(r => r.id);
    if (visibleIds.length === 0) return;
    const allVisibleSelected = visibleIds.every(id => selectedResumes.includes(id));
    setSelectedResumes(prev => {
      if (allVisibleSelected) {
        return prev.filter(id => !visibleIds.includes(id));
      }
      const merged = new Set(prev);
      visibleIds.forEach(id => merged.add(id));
      return Array.from(merged);
    });
  };

  // Tab change
  const handleTabChange = (tab: 'my-resumes' | 'internal-db') => {
    setActiveTab(tab);
    setSelectedResumes([]);
    setSearchTerm('');
    setSelectedFolder('all');
  };

  // Submit for scoring with progress tracking
  const handleSubmitForScoring = async () => {
    if (selectedResumes.length === 0) return;

    // Check for already-scored resumes before proceeding
    let resumesToScore = [...selectedResumes];
    try {
      const checkResult = await scoringService.checkExistingScores(jobId, resumesToScore);
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

        // SOME already scored - warn and filter them out
        toast.warning(
          `${checkResult.existing_count} resume(s) already scored and will be skipped: ${alreadyScoredNames}`,
          { duration: 5000 }
        );
        const existingIds = new Set(checkResult.existing_scores.map((s: any) => s.resume_id));
        resumesToScore = resumesToScore.filter(id => !existingIds.has(id));

        if (resumesToScore.length === 0) return;
      }
    } catch (error) {
      console.error('Error checking existing scores:', error);
      // Continue with scoring even if check fails
    }

    setSubmitting(true);

    try {
      // Use async Celery-based bulk scoring (same as Resume Scoring module)
      const response = await scoringService.startBulkScoringAsync(jobId, resumesToScore);

      // Build resume items for progress display
      const resumeItems = resumesToScore.map(resumeId => {
        const resume = resumes.find(r => r.id === resumeId);
        return {
          resumeId,
          candidateName: resume?.candidate_name || 'Unknown',
        };
      });

      // Initialize progress items and show modal
      const initialItems: ProgressItem[] = resumeItems.map(item => ({
        resumeId: item.resumeId,
        candidateName: item.candidateName,
        status: 'queued' as const,
      }));
      setProgressItems(initialItems);
      setScoringStats({ queued: initialItems.length, processing: 0, completed: 0, failed: 0 });
      setShowProgressModal(true);

      // Register in persistent scoring context so GlobalScoringProgressIndicator works when minimized
      const contextItems = resumeItems.map(item => ({
        id: `${jobId}-${item.resumeId}`,
        resumeId: item.resumeId,
        candidateName: item.candidateName,
        jobTitle: jobTitle,
        jobId: jobId,
        source: (activeTab === 'my-resumes' ? 'My Resumes' : 'Internal DB') as 'My Resumes' | 'Internal DB',
      }));
      startScoringJob(jobId, jobTitle, contextItems, typeof window !== 'undefined' ? window.location.pathname + window.location.search : undefined);

      // Poll batch status until all items are done
      const batchId = response.batch_id;
      const poll = async () => {
        try {
          const batchStatus = await scoringService.getBatchStatus(batchId);

          // Update progress items from batch status
          setProgressItems(prev => prev.map(item => {
            const batchItem = batchStatus.items.find((b: any) => b.resume_id === item.resumeId);
            if (!batchItem) return item;
            let status: ProgressItem['status'] = item.status;
            if (batchItem.status === 'completed') status = 'completed';
            else if (batchItem.status === 'failed') status = 'failed';
            else if (batchItem.status === 'processing') status = 'processing';
            else status = 'queued';
            return { ...item, status, score: batchItem.overall_score, matchStatus: batchItem.match_status };
          }));
          setScoringStats({
            queued: batchStatus.queued,
            processing: batchStatus.processing,
            completed: batchStatus.completed,
            failed: batchStatus.failed,
          });

          // Sync status updates into the persistent context (drives GlobalScoringProgressIndicator)
          for (const batchItem of (batchStatus.items || [])) {
            const itemId = `${jobId}-${batchItem.resume_id}`;
            if (batchItem.status === 'completed') {
              updateItemStatus(jobId, itemId, 'Scored successfully', { score: batchItem.overall_score });
            } else if (batchItem.status === 'failed') {
              updateItemStatus(jobId, itemId, 'Failed', { errorReason: batchItem.error_message || 'Scoring failed' });
            } else if (batchItem.status === 'processing') {
              updateItemStatus(jobId, itemId, 'Scoring in progress');
            }
          }

          const allDone = batchStatus.status === 'completed' || batchStatus.status === 'failed' ||
            (batchStatus.queued === 0 && batchStatus.processing === 0);

          if (allDone) {
            setSubmitting(false);
            // Refresh header quota dropdown — RS deductions landed on CP
            dispatchUnitsConsumed();
            // Redirect to Scored Resumes tab after a short delay so user sees final state
            setTimeout(() => {
              setShowProgressModal(false);
              if (onScoringComplete) {
                onScoringComplete();
              } else {
                onClose();
              }
            }, 1500);
          } else {
            setTimeout(poll, 3000);
          }
        } catch {
          setTimeout(poll, 5000);
        }
      };
      setTimeout(poll, 3000);

    } catch (error: any) {
      console.error('Failed to start scoring:', error);
      toast.error(error.message || 'Failed to start scoring');
      setSubmitting(false);
    }
  };

  // Retry failed scoring
  const handleRetryFailed = async (resumeId: string) => {
    const item = progressItems.find(i => i.resumeId === resumeId);
    if (!item || item.status !== 'failed') return;

    // Update to processing
    setProgressItems(prev => prev.map(i =>
      i.resumeId === resumeId ? { ...i, status: 'processing' as const, errorMessage: undefined } : i
    ));
    setScoringStats(prev => ({ ...prev, failed: prev.failed - 1, processing: prev.processing + 1 }));

    try {
      const result = await scoringService.scoreResume(jobId, resumeId);
      setProgressItems(prev => prev.map(i =>
        i.resumeId === resumeId
          ? { ...i, status: 'completed' as const, score: Math.round(result.overall_score), matchStatus: result.match_status }
          : i
      ));
      setScoringStats(prev => ({ ...prev, processing: prev.processing - 1, completed: prev.completed + 1 }));
      toast.success('Retry successful');
      if (onScoringComplete) onScoringComplete();
    } catch (error: any) {
      setProgressItems(prev => prev.map(i =>
        i.resumeId === resumeId
          ? { ...i, status: 'failed' as const, errorMessage: error?.message || 'Retry failed' }
          : i
      ));
      setScoringStats(prev => ({ ...prev, processing: prev.processing - 1, failed: prev.failed + 1 }));
      toast.error('Retry failed');
    }
  };

  // Close progress modal
  const handleCloseProgress = () => {
    if (!submitting) {
      setShowProgressModal(false);
      onClose();
    }
  };

  // Handle resume upload
  const handleUpload = async (files: File[], folderId?: string) => {
    try {
      if (files.length === 0) {
        return {
          success: false,
          error: 'No file provided'
        };
      }

      // For bulk upload, upload all files sequentially
      if (files.length > 1) {
        const results = await Promise.allSettled(
          files.map(file => resumeService.upload(file, folderId))
        );
        await fetchData();
        const firstSuccess = results.find(r => r.status === 'fulfilled') as PromiseFulfilledResult<any> | undefined;
        return {
          success: true,
          resumeId: firstSuccess?.value?.id,
          candidateName: firstSuccess?.value?.candidate_name
        };
      }

      const response = await resumeService.upload(files[0], folderId);
      await fetchData();

      return {
        success: true,
        resumeId: response.id,
        candidateName: response.candidate_name
      };
    } catch (error: any) {
      console.error('Upload error:', error);

      // Handle 409 duplicate resume
      if (error?.response?.status === 409) {
        const detail = error?.response?.data?.detail;
        const existingResume = detail?.existing_resume;
        const isExactDuplicate = detail?.is_exact_duplicate ?? true;
        const contentDifferences = detail?.content_differences || [];

        if (existingResume) {
          return {
            success: false,
            error: `A resume for ${existingResume.candidate_name || 'this candidate'} already exists in your Internal Resume Database.`,
            existingResume: {
              id: existingResume.id,
              candidateName: existingResume.candidate_name || existingResume.file_name || 'Unknown',
              email: existingResume.email || '',
              currentTitle: existingResume.current_title || '',
              folderName: existingResume.folder_name || '',
              uploadedAt: existingResume.upload_date || '',
              version: existingResume.version || 1,
            },
            duplicateData: {
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
                version_count: existingResume.version_count || existingResume.version || 1,
              },
              contentDifferences,
              isDuplicate: isExactDuplicate,
            }
          };
        }

        return {
          success: false,
          error: 'This resume already exists in the system.',
        };
      }

      // Handle 400 validation errors
      if (error?.response?.status === 400) {
        const detail = error?.response?.data?.detail;

        if (detail?.error === 'INVALID_RESUME') {
          return {
            success: false,
            error: detail?.message || 'The uploaded file does not appear to be a valid resume. It may be a scorecard, invoice, or other document type.',
          };
        }

        if (detail?.error === 'NO_CONTENT') {
          return {
            success: false,
            error: detail?.message || 'The resume file has no readable content. The file may be blank, image-only, or heavily formatted.',
          };
        }

        return {
          success: false,
          error: detail?.message || `Failed to upload ${files[0]?.name || 'file'}`,
        };
      }

      // Handle 403 — read-only mode, quota exhausted, or permission denied
      if (error?.response?.status === 403) {
        const detail = error?.response?.data?.detail;

        if (detail?.error === 'READ_ONLY_MODE') {
          return {
            success: false,
            error: 'Uploads are disabled because your account is in read-only mode. Please contact your administrator.',
          };
        }

        if (detail?.error === 'QUOTA_EXHAUSTED') {
          return {
            success: false,
            error: detail?.message || 'Resume upload quota exhausted. Please upgrade your plan to upload more resumes.',
          };
        }

        return {
          success: false,
          error: 'You do not have permission to upload resumes. Please contact your administrator.',
        };
      }

      return {
        success: false,
        error: `Failed to upload ${files[0]?.name || 'file'}`,
      };
    }
  };

  // Handle upload complete - auto-select the uploaded resume
  const handleUploadComplete = () => {
    setShowUploadModal(false);
    fetchData(); // Refresh the list
  };

  const handleCreateFolder = async (name: string, parentId?: string) => {
    try {
      if (/<[^>]+>/.test(name) || /javascript:|data:|vbscript:/i.test(name)) {
        toast.error('Folder name must not contain HTML or script content');
        return;
      }
      const allFolders = (function flatten(list: FolderType[]): FolderType[] {
        return list.flatMap(f => [f, ...flatten(f.children || [])]);
      })(folders);
      if (allFolders.find(f => f.name.toLowerCase() === name.toLowerCase() && f.id !== 'all')) {
        toast.error(`Folder "${name}" already exists`);
        return;
      }
      await folderService.create(name, parentId);
      const folderData = await folderService.list();
      setFolders(folderData || []);
      toast.success('Folder created');
    } catch (error: any) {
      toast.error(`Failed to create folder: ${error?.response?.data?.detail || error?.message || 'Unknown error'}`);
    }
  };

  // Handle auto-select after upload
  const handleAutoSelectAfterUpload = async (resumeId: string, candidateName: string) => {
    // Close upload modal
    setShowUploadModal(false);

    // Refresh the list to include the new resume
    await fetchData();

    // Auto-select the uploaded resume
    setSelectedResumes(prev => {
      if (!prev.includes(resumeId)) {
        return [...prev, resumeId];
      }
      return prev;
    });

    // Show success message
    toast.success(`Resume uploaded! "${candidateName}" is now selected. Add more or click "Score Resumes" to continue.`);
  };

  // Toggle folder expansion
  const toggleFolder = (id: string) => {
    setExpandedFolders(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  };

  // Get resume count for folder
  const getResumeCount = (folderId: string) => {
    if (folderId === 'all') return resumes.length;
    return resumes.filter(r => r.folder_id === folderId).length;
  };

  // Recursively collect a folder's own ID and all descendant folder IDs.
  // Used so ticking a parent folder cascades selection to subfolders.
  const collectDescendantFolderIds = (folderId: string): string[] => {
    const result = [folderId];
    const queue = [folderId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const f of folders) {
        if (f.parent_id === current) {
          result.push(f.id);
          queue.push(f.id);
        }
      }
    }
    return result;
  };

  // Selectable (non-archived) resume IDs in a given folder *and all its
  // descendants*. "all" = every resume the user can score across all folders.
  const getFolderResumeIds = (folderId: string): string[] => {
    const archivedFolder = folders.find(f => f.name?.toLowerCase().includes('archived'));
    const isArchivedTarget = folderId !== 'all'
      && (folders.find(f => f.id === folderId)?.name?.toLowerCase().includes('archived') ?? false);
    if (isArchivedTarget) return [];

    let pool: Resume[];
    if (folderId === 'all') {
      pool = resumes.filter(r => {
        if (r.is_archived === true) return false;
        if (archivedFolder && r.folder_id === archivedFolder.id) return false;
        return true;
      });
    } else {
      const branchFolderIds = new Set(collectDescendantFolderIds(folderId));
      const target = folders.find(f => f.id === folderId);
      const isRoot = target?.name?.toLowerCase() === 'root';

      pool = resumes.filter(r => {
        if (r.is_archived === true) return false;
        if (archivedFolder && !branchFolderIds.has(archivedFolder.id)
            && r.folder_id === archivedFolder.id) return false;
        if (isRoot && (!r.folder_id || branchFolderIds.has(r.folder_id))) return true;
        return r.folder_id ? branchFolderIds.has(r.folder_id) : false;
      });
    }
    return pool.map(r => r.id);
  };

  const getFolderSelectionState = (folderId: string): 'none' | 'partial' | 'all' => {
    const ids = getFolderResumeIds(folderId);
    if (ids.length === 0) return 'none';
    const selectedCount = ids.filter(id => selectedResumes.includes(id)).length;
    if (selectedCount === 0) return 'none';
    if (selectedCount === ids.length) return 'all';
    return 'partial';
  };

  const getFolderSelectedCount = (folderId: string): number => {
    const ids = getFolderResumeIds(folderId);
    return ids.filter(id => selectedResumes.includes(id)).length;
  };

  // Toggle the entire folder (and its descendants) in/out of selection,
  // preserving picks in OTHER folders. Auto-expands on select so user sees
  // the cascade.
  const toggleFolderSelection = (folderId: string) => {
    const folderIds = getFolderResumeIds(folderId);
    if (folderIds.length === 0) return;
    const state = getFolderSelectionState(folderId);
    setSelectedResumes(prev => {
      if (state === 'all') {
        return prev.filter(id => !folderIds.includes(id));
      }
      const next = new Set(prev);
      folderIds.forEach(id => next.add(id));
      return Array.from(next);
    });
    if (state !== 'all' && folderId !== 'all') {
      const descendants = collectDescendantFolderIds(folderId);
      const toExpand = descendants.filter(id => folders.some(f => f.parent_id === id));
      if (toExpand.length > 0) {
        setExpandedFolders(prev => Array.from(new Set([...prev, ...toExpand])));
      }
    }
  };

  // Render folder tree
  const renderFolderTree = (parentId?: string, level: number = 0) => {
    // Find root folder first
    const rootFolder = folders.find(f => f.name.toLowerCase() === 'root' && (!f.parent_id || f.parent_id === null));
    const rootId = rootFolder?.id;

    // If no parentId specified, show top-level folders (including root)
    let childFolders: typeof folders;
    if (parentId === undefined) {
      if (rootId) {
        // Show root folder first, then any other truly top-level folders (no parent, not root)
        childFolders = folders.filter(f =>
          (f.name.toLowerCase() === 'root' && (!f.parent_id || f.parent_id === null)) ||
          (!f.parent_id || f.parent_id === null || f.parent_id === '')
        );
        // Put root first
        childFolders = [
          ...childFolders.filter(f => f.id === rootId),
          ...childFolders.filter(f => f.id !== rootId),
        ];
      } else {
        childFolders = folders.filter(f => !f.parent_id || f.parent_id === null || f.parent_id === '');
      }
    } else {
      // Show children of specified parent
      childFolders = folders.filter(f => f.parent_id === parentId);
    }

    console.log('[SelectSourceModal] renderFolderTree - parentId:', parentId, 'rootId:', rootId, 'folders.length:', folders.length, 'childFolders:', childFolders.length);
    console.log('[SelectSourceModal] childFolders names:', childFolders.map(f => f.name));

    return childFolders.map(folder => {
      const isExpanded = expandedFolders.includes(folder.id);
      const isSelected = selectedFolder === folder.id;
      const hasChildren = folders.some(f => f.parent_id === folder.id);
      const count = getResumeCount(folder.id);
      const selectionState = getFolderSelectionState(folder.id);
      const selectedInFolder = getFolderSelectedCount(folder.id);
      const isArchivedFolder = folder.name?.toLowerCase().includes('archived');

      return (
        <div key={folder.id}>
          <button
            onClick={() => setSelectedFolder(folder.id)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-sm group ${
              isSelected
                ? 'bg-blue-100 text-blue-900 font-medium'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
            style={{ paddingLeft: `${level * 16 + 12}px` }}
          >
            {/* Folder selection checkbox: adds/removes ALL of this folder's
                (and descendants') resumes from selection, without changing the
                active folder filter. */}
            {!isArchivedFolder ? (
              <span
                role="checkbox"
                aria-checked={selectionState === 'all'}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFolderSelection(folder.id);
                }}
                className="flex-shrink-0 cursor-pointer p-0.5 -ml-1 rounded hover:bg-gray-200"
                title={
                  selectionState === 'all'
                    ? `Deselect all ${count} resumes in this folder`
                    : `Select all ${count} resumes in this folder`
                }
              >
                {selectionState === 'all' ? (
                  <CheckSquare className="w-4 h-4 text-blue-600" />
                ) : selectionState === 'partial' ? (
                  <MinusSquare className="w-4 h-4 text-blue-600" />
                ) : (
                  <Square className="w-4 h-4 text-gray-400" />
                )}
              </span>
            ) : (
              <div className="w-4 flex-shrink-0" />
            )}

            {hasChildren && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFolder(folder.id);
                }}
                className="p-0.5 hover:bg-gray-200 rounded"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
            )}
            {!hasChildren && <div className="w-5" />}
            {isExpanded ? (
              <FolderOpen className="w-4 h-4" />
            ) : (
              <Folder className="w-4 h-4" />
            )}
            <span className="flex-1 text-left truncate">{folder.name}</span>
            {selectedInFolder > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                {selectedInFolder} sel
              </span>
            )}
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              isSelected
                ? 'bg-blue-200 text-blue-900'
                : 'bg-gray-200 text-gray-600'
            }`}>
              {count}
            </span>
          </button>
          {isExpanded && hasChildren && (
            <div>
              {renderFolderTree(folder.id, level + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-6">
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-6xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-4 sm:p-6 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white flex-shrink-0">
          <div className="flex items-start gap-2 sm:gap-4 min-w-0">
            <div className="w-9 h-9 sm:w-12 sm:h-12 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center shadow-md flex-shrink-0">
              <Target className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-xl font-semibold text-gray-900 mb-0.5 sm:mb-1">
                <span className="hidden sm:inline">Select Applicants to Score</span>
                <span className="sm:hidden">Select Applicants</span>
              </h2>
              <p className="text-xs sm:text-sm text-gray-600 truncate">
                Job: <span className="font-medium text-gray-900">{jobTitle}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
           aria-label="Close">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 px-3 sm:px-6 pt-3 sm:pt-4 bg-gray-50 flex-shrink-0">
          <div className="flex gap-1 sm:gap-2">
            <button
              onClick={() => handleTabChange('my-resumes')}
              className={`px-3 sm:px-5 py-2 sm:py-3 text-xs sm:text-sm font-medium rounded-t-lg transition-all flex items-center gap-1.5 sm:gap-2 ${
                activeTab === 'my-resumes'
                  ? 'bg-white text-blue-600 border-b-2 border-blue-600 shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">My Resumes</span>
              <span className="sm:hidden">Resumes</span>
              <span className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs ${
                activeTab === 'my-resumes'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-200 text-gray-600'
              }`}>
                {activeTab === 'my-resumes' ? resumes.length : '...'}
              </span>
            </button>
            {/* Only show Internal Database tab if user has permission */}
            {hasInternalDBAccess && (
              <button
                onClick={() => handleTabChange('internal-db')}
                className={`px-3 sm:px-5 py-2 sm:py-3 text-xs sm:text-sm font-medium rounded-t-lg transition-all flex items-center gap-1.5 sm:gap-2 ${
                  activeTab === 'internal-db'
                    ? 'bg-white text-green-600 border-b-2 border-green-600 shadow-sm'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <Database className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Internal Database</span>
                <span className="sm:hidden">Internal DB</span>
                <span className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs ${
                  activeTab === 'internal-db'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-200 text-gray-600'
                }`}>
                  {activeTab === 'internal-db' ? resumes.length : '...'}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar - Folder Tree (Only for My Resumes) - hidden on mobile */}
          {activeTab === 'my-resumes' && (
            <div className="hidden lg:block w-56 border-r border-gray-200 bg-gray-50 overflow-y-auto flex-shrink-0">
              <div className="p-4">
                <h3 className="text-xs font-medium text-gray-500 uppercase mb-3 px-3">Folders</h3>

                {/* All Resumes */}
                {(() => {
                  const allState = getFolderSelectionState('all');
                  const allSelectedCount = getFolderSelectedCount('all');
                  return (
                    <button
                      onClick={() => setSelectedFolder('all')}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-sm mb-2 ${
                        selectedFolder === 'all'
                          ? 'bg-blue-100 text-blue-900 font-medium'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      {/* Master checkbox: select/deselect every non-archived resume */}
                      <span
                        role="checkbox"
                        aria-checked={allState === 'all'}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFolderSelection('all');
                        }}
                        className="flex-shrink-0 cursor-pointer p-0.5 -ml-1 rounded hover:bg-gray-200"
                        title={
                          allState === 'all'
                            ? 'Deselect all resumes'
                            : 'Select all resumes across all folders'
                        }
                      >
                        {allState === 'all' ? (
                          <CheckSquare className="w-4 h-4 text-blue-600" />
                        ) : allState === 'partial' ? (
                          <MinusSquare className="w-4 h-4 text-blue-600" />
                        ) : (
                          <Square className="w-4 h-4 text-gray-400" />
                        )}
                      </span>
                      <FolderOpen className="w-4 h-4" />
                      <span className="flex-1 text-left">All Resumes</span>
                      {allSelectedCount > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                          {allSelectedCount} sel
                        </span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        selectedFolder === 'all'
                          ? 'bg-blue-200 text-blue-900'
                          : 'bg-gray-200 text-gray-600'
                      }`}>
                        {resumes.length}
                      </span>
                    </button>
                  );
                })()}

                {/* Folder Tree */}
                {folders.length > 0 ? (
                  <div className="space-y-1">
                    {renderFolderTree(undefined, 0)}
                  </div>
                ) : (
                  <div className="px-3 py-4 text-xs text-gray-500 text-center">
                    <p className="mb-2">No folders yet</p>
                    <p className="text-gray-400">Create folders from My Resumes page</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Main Content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Search and Bulk Actions */}
            <div className="px-3 sm:px-6 py-3 sm:py-4 bg-white border-b border-gray-200">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by name, email, skills..."
                    className="w-full pl-10 pr-4 py-2 sm:py-2.5 border border-gray-300 rounded-lg text-black text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div className="flex items-center gap-2 sm:gap-4">
                  {/* Upload Resume button - only for My Resumes tab + canUploadResumes RBAC */}
                  {activeTab === 'my-resumes' && canUploadResumes && (
                    <button
                      onClick={() => setShowUploadModal(true)}
                      className="px-3 sm:px-4 py-2 sm:py-2.5 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg hover:from-green-700 hover:to-green-800 transition-all font-medium shadow-md hover:shadow-lg flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm"
                    >
                      <Upload className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span className="hidden sm:inline">Upload Resume</span>
                      <span className="sm:hidden">Upload</span>
                    </button>
                  )}
                  {(() => {
                    // Track selection state of the *visible* folder only — the
                    // master count can include resumes from other folders.
                    const visibleIds = filteredResumes.filter(r => !r.is_archived).map(r => r.id);
                    const visibleSelectedCount = visibleIds.filter(id => selectedResumes.includes(id)).length;
                    const allVisibleSelected = visibleIds.length > 0 && visibleSelectedCount === visibleIds.length;
                    const someVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected;
                    return (
                      <button
                        onClick={handleSelectAll}
                        disabled={filteredResumes.length === 0}
                        className="px-3 sm:px-4 py-2 sm:py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-xs sm:text-sm font-medium text-gray-700 flex items-center gap-1.5 sm:gap-2 disabled:opacity-50 whitespace-nowrap"
                      >
                        {allVisibleSelected ? (
                          <>
                            <CheckSquare className="w-4 h-4 text-blue-600" />
                            <span className="hidden sm:inline">Deselect All</span>
                            <span className="sm:hidden">Deselect</span>
                          </>
                        ) : someVisibleSelected ? (
                          <>
                            <MinusSquare className="w-4 h-4 text-blue-600" />
                            <span className="hidden sm:inline">Select All</span>
                            <span className="sm:hidden">All</span>
                          </>
                        ) : (
                          <>
                            <Square className="w-4 h-4" />
                            <span className="hidden sm:inline">Select All</span>
                            <span className="sm:hidden">All</span>
                          </>
                        )}
                      </button>
                    );
                  })()}
                  <div className="text-xs sm:text-sm text-gray-700 bg-blue-50 px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-lg border border-blue-200 font-medium whitespace-nowrap">
                    <span className="text-blue-700">{selectedResumes.length}</span> <span className="hidden sm:inline">selected</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Resume List */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-6">
              {loading ? (
                <div className="flex items-center justify-center py-10 sm:py-16">
                  <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin text-blue-600" />
                  <span className="ml-2 sm:ml-3 text-xs sm:text-base text-gray-600">Loading resumes...</span>
                </div>
              ) : filteredResumes.length > 0 ? (
                <div className="space-y-2">
                  {/* Desktop Table Header - hidden on mobile */}
                  <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-3 bg-gray-100 rounded-lg text-xs font-medium text-gray-600 uppercase sticky top-0">
                    <div className="col-span-1 flex items-center justify-center">
                      {(() => {
                        const visibleIds = filteredResumes.filter(r => !r.is_archived).map(r => r.id);
                        const visibleSelectedCount = visibleIds.filter(id => selectedResumes.includes(id)).length;
                        const allVisibleSelected = visibleIds.length > 0 && visibleSelectedCount === visibleIds.length;
                        const someVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected;
                        return (
                      <button
                        onClick={handleSelectAll}
                        className="p-1 hover:bg-gray-200 rounded"
                      >
                        {allVisibleSelected ? (
                          <CheckSquare className="w-4 h-4 text-blue-600" />
                        ) : someVisibleSelected ? (
                          <MinusSquare className="w-4 h-4 text-blue-600" />
                        ) : (
                          <Square className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                        );
                      })()}
                    </div>
                    <div className="col-span-3">Candidate</div>
                    <div className="col-span-2">Current Role</div>
                    <div className="col-span-2">Contact</div>
                    <div className="col-span-2">Experience</div>
                    <div className="col-span-2">Skills</div>
                  </div>

                  {/* Resume Items */}
                  {filteredResumes.map((resume) => {
                    const isSelected = selectedResumes.includes(resume.id);
                    const selectedFolderData = folders.find(f => f.id === selectedFolder);
                    const isArchivedFolder = selectedFolderData?.name?.toLowerCase().includes('archived') || false;
                    const isArchived = resume.is_archived === true || isArchivedFolder;

                    return (
                      <div key={resume.id}>
                        {/* Mobile Card View */}
                        <div
                          className="md:hidden"
                          onClick={() => {
                            if (isArchived) {
                              toast.error('Archived resumes cannot be scored.');
                              return;
                            }
                            handleToggleResume(resume.id);
                          }}
                        >
                          <div className={`p-3 border-2 rounded-lg transition-all ${
                            isArchived
                              ? 'border-amber-100 bg-amber-50 opacity-60 cursor-not-allowed'
                              : isSelected
                                ? 'border-blue-400 bg-blue-50 cursor-pointer'
                                : 'border-gray-200 bg-white cursor-pointer'
                          }`}>
                            <div className="flex items-start gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!isArchived) handleToggleResume(resume.id);
                                }}
                                disabled={isArchived}
                                className="p-0.5 mt-0.5 flex-shrink-0"
                              >
                                {isSelected ? (
                                  <CheckSquare className="w-4 h-4 text-blue-600" />
                                ) : (
                                  <Square className="w-4 h-4 text-gray-400" />
                                )}
                              </button>
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                                {(resume.candidate_name || 'U').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-gray-900 truncate">{resume.candidate_name || 'Unknown'}</span>
                                  {isArchived && (
                                    <span className="text-[10px] text-amber-700 bg-amber-100 px-1 py-0.5 rounded flex-shrink-0">Archived</span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-600 truncate">{resume.current_title || 'N/A'}{resume.current_company ? ` · ${resume.current_company}` : ''}</p>
                                <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-500 flex-wrap">
                                  {resume.location && (
                                    <span className="flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" />{resume.location}</span>
                                  )}
                                  {resume.experience_years && (
                                    <span className="flex items-center gap-0.5"><Briefcase className="w-2.5 h-2.5" />{resume.experience_years}y</span>
                                  )}
                                </div>
                                {resume.skills && resume.skills.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1.5">
                                    {resume.skills.slice(0, 3).map((skill, idx) => (
                                      <span key={idx} className="px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded text-[10px]">{skill}</span>
                                    ))}
                                    {resume.skills.length > 3 && (
                                      <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px]">+{resume.skills.length - 3}</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Desktop Table Row */}
                        <div
                          className={`hidden md:grid grid-cols-12 gap-4 p-4 border-2 rounded-lg transition-all items-center ${
                            isArchived
                              ? 'border-amber-100 bg-amber-50 opacity-60 cursor-not-allowed'
                              : isSelected
                                ? 'border-blue-400 bg-blue-50 shadow-sm cursor-pointer'
                                : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm cursor-pointer'
                          }`}
                          onClick={() => {
                            if (isArchived) {
                              toast.error('Archived resumes cannot be scored. Please select an active resume.');
                              return;
                            }
                            handleToggleResume(resume.id);
                          }}
                        >
                          {/* Checkbox */}
                          <div className="col-span-1 flex items-center justify-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isArchived) {
                                  toast.error('Archived resumes cannot be scored. Please select an active resume.');
                                  return;
                                }
                                handleToggleResume(resume.id);
                              }}
                              disabled={isArchived}
                              className="p-1 hover:bg-gray-100 rounded disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-5 h-5 text-blue-600" />
                              ) : (
                                <Square className="w-5 h-5 text-gray-400" />
                              )}
                            </button>
                          </div>

                          {/* Candidate Name */}
                          <div className="col-span-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
                                {(resume.candidate_name || 'U').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <div className="font-medium text-gray-900 truncate">{resume.candidate_name || 'Unknown'}</div>
                                {isArchived && (
                                  <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded mt-0.5">
                                    Archived
                                  </span>
                                )}
                                {resume.location && (
                                  <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                                    <MapPin className="w-3 h-3" />
                                    {resume.location}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Current Role */}
                          <div className="col-span-2">
                            <div className="text-sm text-gray-900">{resume.current_title || 'N/A'}</div>
                            {resume.current_company && (
                              <div className="text-xs text-gray-500 mt-0.5">{resume.current_company}</div>
                            )}
                          </div>

                          {/* Contact */}
                          <div className="col-span-2">
                            {resume.email && (
                              <div className="flex items-center gap-1.5 mb-1">
                                <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                <span className="text-xs text-gray-600 truncate">{resume.email}</span>
                              </div>
                            )}
                            {resume.phone && (
                              <div className="flex items-center gap-1.5">
                                <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                <span className="text-xs text-gray-600">{resume.phone}</span>
                              </div>
                            )}
                          </div>

                          {/* Experience */}
                          <div className="col-span-2">
                            <div className="flex items-center gap-1.5">
                              <Briefcase className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                              <span className="text-sm text-gray-700">
                                {resume.experience_years ? `${resume.experience_years} years` : 'N/A'}
                              </span>
                            </div>
                            {resume.notice_period && (
                              <div className="flex items-center gap-1.5 mt-1">
                                <Calendar className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                <span className="text-xs text-gray-500">{resume.notice_period}</span>
                              </div>
                            )}
                          </div>

                          {/* Skills */}
                          <div className="col-span-2">
                            {resume.skills && resume.skills.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {resume.skills.slice(0, 3).map((skill, idx) => (
                                  <span
                                    key={idx}
                                    className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs"
                                  >
                                    {skill}
                                  </span>
                                ))}
                                {resume.skills.length > 3 && (
                                  <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">
                                    +{resume.skills.length - 3}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">No skills listed</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-10 sm:py-16">
                  <Database className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 text-gray-300" />
                  <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">No Resumes Found</h3>
                  <p className="text-xs sm:text-sm text-gray-600 max-w-md mx-auto">
                    {searchTerm
                      ? 'No resumes match your search. Try different keywords.'
                      : activeTab === 'my-resumes'
                      ? 'Upload resumes to My Resumes to get started.'
                      : 'No resumes available in the internal database.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-3 sm:px-6 py-3 sm:py-4 border-t border-gray-200 bg-gray-50 flex-shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
            <div className="text-xs sm:text-sm text-gray-600">
              {selectedResumes.length > 0 ? (
                <span>
                  <span className="font-medium text-gray-900">{selectedResumes.length}</span> resume{selectedResumes.length === 1 ? '' : 's'} selected
                </span>
              ) : (
                <span>Select resumes to score</span>
              )}
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={onClose}
                className="px-3 sm:px-5 py-2 sm:py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-white transition-colors font-medium text-xs sm:text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitForScoring}
                disabled={(() => {
                  if (!canRunScoring) return true;
                  if (selectedResumes.length === 0) return true;
                  if (submitting) return true;
                  const selectedFolderData = folders.find(f => f.id === selectedFolder);
                  const isArchivedFolder = selectedFolderData?.name?.toLowerCase().includes('archived') || false;
                  if (isArchivedFolder && selectedResumes.length > 0) return true;
                  const selectedResumeObjects = resumes.filter(r => selectedResumes.includes(r.id));
                  const hasArchivedResumes = selectedResumeObjects.some(r => r.is_archived === true);
                  return hasArchivedResumes;
                })()}
                title={!canRunScoring ? 'You do not have permission to score resumes' : ''}
                className="px-4 sm:px-6 py-2 sm:py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium shadow-md hover:shadow-lg flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="hidden sm:inline">Submitting...</span>
                    <span className="sm:hidden">...</span>
                  </>
                ) : (
                  <>
                    <Target className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    Score {selectedResumes.length > 0 && `${selectedResumes.length} `}<span className="hidden sm:inline">Resume{selectedResumes.length === 1 ? '' : 's'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Modal - Using BulkScoringProgressModal */}
      {showProgressModal && (
        <BulkScoringProgressModal
          onClose={handleCloseProgress}
          progressData={progressItems.map((item): ScoringProgressItem => ({
            id: item.resumeId,
            resumeId: item.resumeId,
            candidateName: item.candidateName,
            jobTitle: jobTitle,
            jobId: jobId,
            source: activeTab === 'internal-db' ? 'Internal DB' : 'My Resumes',
            status: item.status === 'queued' ? 'Queued' :
                    item.status === 'processing' ? 'Scoring in progress' :
                    item.status === 'completed' ? 'Scored successfully' :
                    item.status === 'already_scored' ? 'Already Scored - Skipped' :
                    'Failed',
            errorReason: item.errorMessage,
            scoredDateTime: item.status === 'completed' ? new Date() : undefined,
            matchResult: item.status === 'completed'
              ? item.matchStatus
                ? (item.matchStatus === 'exact_match' || item.matchStatus === 'excellent' ? 'Exact Match'
                  : item.matchStatus === 'partial_match' || item.matchStatus === 'partial' ? 'Partial Match'
                  : 'No Match')
                : undefined
              : undefined,
            score: item.score,
          }))}
          filterByJobId={jobId}
          showJobTitleColumn={false}
          onRetryFailed={async (scoringItem) => {
            await handleRetryFailed(scoringItem.resumeId);
          }}
          onMinimize={() => {
            // Close the full-screen overlay so the user can navigate freely.
            // The context keeps the job alive and GlobalScoringProgressIndicator
            // shows the small floating button in the bottom-right corner.
            setMinimized(true);
            setOnRestorePanel(undefined);
            onClose();
          }}
        />
      )}

      {/* Upload Modal — pre-selects the currently-viewed folder so the user
          doesn't have to re-pick. "all" is a UI filter (not a real folder),
          so we leave it unset and let the modal default to root. */}
      {showUploadModal && (
        <UploadModal
          folders={folders}
          tenant={tenant}
          uploadSection="my-resumes"
          targetFolder={selectedFolder !== 'all' ? selectedFolder : undefined}
          onClose={() => setShowUploadModal(false)}
          onUpload={handleUpload}
          onUploadComplete={handleUploadComplete}
          onCreateFolder={handleCreateFolder}
          onScoreResume={handleAutoSelectAfterUpload}
        />
      )}
    </div>
  );
}
