import { X, Mail, Plus, Trash2, Send, CheckCircle, FileText, AlertTriangle, Loader2, Sparkles, ShieldAlert, Info, Database, FolderOpen, Folder, ChevronRight, ChevronDown, Users, Upload } from 'lucide-react';
import React, { useState, useEffect, useRef } from 'react';
import { toast } from '@/components/ui/enhanced-toast';
import { assessmentService } from '@/lib/services/assessmentService';
import { useAuth } from '@/lib/hooks/useAuth';
import api from '@/lib/services/api';
import { Skeleton } from '@/components/ui/skeleton';
import ResumeSelectionSummary from '@/components/ResumeSelectionSummary';
import { togglePick, toggleAllPicks, partitionPicks, countBySource, sourceBreakdown, type ResumePicks, type PickSource } from '@/lib/utils/resumeSelection';
import { isValidCandidateName, NAME_FORMAT_ERROR } from '@/lib/utils/name';

interface InviteToAssessmentModalProps {
  onClose: () => void;
  jobTitle: string;
  jobId: string;
  candidate?: {
    name?: string;
    candidateName?: string;
    email: string;
  };
}

interface CandidateEmail {
  id: string;
  name: string;
  email: string;
  source?: 'manual' | 'database';
  origin?: PickSource;
  resumeId?: string;
}

/* A typed name with anything but letters and spaces. Database rows are
   exempt: their name comes read-only from the resume. */
const hasInvalidName = (c: CandidateEmail) =>
  c.source !== 'database' && !!c.name.trim() && !isValidCandidateName(c.name);

interface Assessment {
  id: string;
  title: string;
  duration_minutes: number;
  status: string;
  hr_enabled: boolean;
  technical_enabled: boolean;
  coding_enabled: boolean;
}

type ModalView = 'loading' | 'no-assessment' | 'invite';

export default function InviteToAssessmentModal({ onClose, jobTitle, jobId, candidate }: InviteToAssessmentModalProps) {
  const { user } = useAuth();
  const [view, setView] = useState<ModalView>('loading');
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [selectedAssessment, setSelectedAssessment] = useState<string>('');
  const [isLoadingAssessments, setIsLoadingAssessments] = useState(true);

  // Quota stats
  const [quotaStats, setQuotaStats] = useState<{
    total_quota: number; consumed: number; pending: number; available: number;
  } | null>(null);
  const [quotaStatsLoading, setQuotaStatsLoading] = useState(false);

  // Candidate state
  const candidateName = candidate?.name || candidate?.candidateName || '';
  const [candidates, setCandidates] = useState<CandidateEmail[]>(
    candidateName && candidate?.email
      ? [{ id: '1', name: candidateName, email: candidate.email, source: 'manual' }]
      : [{ id: '1', name: '', email: '', source: 'manual' }]
  );

  // Invite state
  const [expiryDays, setExpiryDays] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Duplicate invitation popup state
  const [showDuplicateError, setShowDuplicateError] = useState(false);
  const [duplicateEmails, setDuplicateEmails] = useState<string[]>([]);

  // Input mode & DB selection state
  const [inputMode, setInputMode] = useState<'manual' | 'database'>('manual');
  const [dbTab, setDbTab] = useState<'my-resumes' | 'internal-db'>('my-resumes');
  const [myResumesData, setMyResumesData] = useState<{ id: string; name: string; email: string; position: string; experience: string }[]>([]);
  const [internalDbData, setInternalDbData] = useState<{ id: string; name: string; email: string; position: string; experience: string }[]>([]);
  const [myFolders, setMyFolders] = useState<{ id: string; name: string; parentId?: string | null }[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>('all');
  const [expandedFolders, setExpandedFolders] = useState<string[]>([]);
  /* Ticked "Select From" resumes, kept across tabs and folders so a pick can
     mix My Resumes and the Shared Database (switching tabs used to wipe it). */
  const [picks, setPicks] = useState<ResumePicks>({});
  const pickCount = Object.keys(picks).length;
  const [dbSearchQuery, setDbSearchQuery] = useState('');
  const [myResumesLoaded, setMyResumesLoaded] = useState(false);
  const [internalDbLoaded, setInternalDbLoaded] = useState(false);
  // Per source — both tabs now load together, so one flag would clear early.
  const [isLoadingMy, setIsLoadingMy] = useState(false);
  const [isLoadingInternal, setIsLoadingInternal] = useState(false);
  const isLoadingResumes = dbTab === 'my-resumes' ? isLoadingMy : isLoadingInternal;
  const loadingSources = useRef<Set<string>>(new Set());

  const hasMyResumesAccess = !!(user?.permissions?.canUploadResumes || user?.permissions?.canViewResumes);
  const hasInternalDBAccess = !!(user?.permissions?.canAccessInternalDB || user?.permissions?.canViewInternalDB);

  // folderId feeds the folder counts and folder filter — it was never mapped,
  // so every folder read 0 and picking one emptied the list.
  const mapResume = (r: any) => ({
    id: r.id,
    name: r.candidate_name || 'Unknown',
    email: r.email || r.candidate_email || '',
    position: r.current_title || 'Not specified',
    experience: r.experience_years ? `${r.experience_years} years` : '',
    folderId: r.folder_id ?? null,
  });

  /* Every page of a source. One 200-row page silently dropped the rest, and the
     tab badge counted only what came back. */
  const fetchAllResumes = async (source: 'my-resumes' | 'internal-db') => {
    const pageSize = 200;
    const first = await api.get('/resumes', { params: { source, page: 1, page_size: pageSize } });
    const items: any[] = [...(first.data?.items ?? [])];
    const totalPages: number = first.data?.total_pages ?? 1;
    for (let page = 2; page <= totalPages; page++) {
      const res = await api.get('/resumes', { params: { source, page, page_size: pageSize } });
      items.push(...(res.data?.items ?? []));
    }
    return items.map(mapResume);
  };

  const loadMyResumes = async () => {
    if (myResumesLoaded || loadingSources.current.has('my-resumes')) return;
    loadingSources.current.add('my-resumes');
    setIsLoadingMy(true);
    try {
      const [resumes, folderRes] = await Promise.all([
        fetchAllResumes('my-resumes'),
        api.get('/folders'),
      ]);
      setMyResumesData(resumes);
      setMyFolders((folderRes.data ?? []).map((f: any) => ({ id: f.id, name: f.name, parentId: f.parent_id ?? null })));
      setMyResumesLoaded(true);
    } catch { toast.error({ title: 'Error', description: 'Failed to load My Resumes' }); }
    finally { loadingSources.current.delete('my-resumes'); setIsLoadingMy(false); }
  };

  const loadInternalDb = async () => {
    if (internalDbLoaded || loadingSources.current.has('internal-db')) return;
    loadingSources.current.add('internal-db');
    setIsLoadingInternal(true);
    try {
      setInternalDbData(await fetchAllResumes('internal-db'));
      setInternalDbLoaded(true);
    } catch { toast.error({ title: 'Error', description: 'Failed to load Shared Database' }); }
    finally { loadingSources.current.delete('internal-db'); setIsLoadingInternal(false); }
  };

  // Both tabs load up front — the Shared Database badge read 0 until clicked.
  useEffect(() => {
    if (inputMode === 'database') {
      const tab = hasMyResumesAccess ? 'my-resumes' : 'internal-db';
      setDbTab(tab);
      if (hasMyResumesAccess) loadMyResumes();
      if (hasInternalDBAccess || !hasMyResumesAccess) loadInternalDb();
    }
  }, [inputMode]);

  useEffect(() => {
    if (inputMode !== 'database') return;
    if (dbTab === 'my-resumes' && !myResumesLoaded) loadMyResumes();
    if (dbTab === 'internal-db' && !internalDbLoaded) loadInternalDb();
    setSelectedFolder('all');
    setDbSearchQuery('');
  }, [dbTab]);

  const toggleExpandFolder = (id: string) => {
    setExpandedFolders(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]);
  };

  const renderFolderTree = (parentId?: string | null, level = 0): React.ReactNode => {
    const children = myFolders.filter(f => {
      const isTop = !parentId && (f.parentId === null || f.parentId === undefined);
      const isChild = parentId && f.parentId === parentId;
      return isTop || isChild;
    });
    return children.map(folder => {
      const isExpanded = expandedFolders.includes(folder.id);
      const isSelected = selectedFolder === folder.id;
      const hasChildren = myFolders.some(f => f.parentId === folder.id);
      const count = myResumesData.filter(r => (r as any).folderId === folder.id).length;
      return (
        <div key={folder.id}>
          <button
            onClick={() => setSelectedFolder(folder.id)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${isSelected ? 'bg-gray-100 dark:bg-slate-800 text-gray-900 dark:text-slate-50 font-medium' : 'text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700'}`}
            style={{ paddingLeft: `${level * 16 + 12}px` }}
          >
            {hasChildren ? (
              <button onClick={e => { e.stopPropagation(); toggleExpandFolder(folder.id); }} className="p-0.5 hover:bg-gray-200 dark:hover:bg-slate-700 rounded">
                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            ) : <div className="w-5" />}
            {isExpanded ? <FolderOpen className="w-4 h-4 text-brand-orange" /> : <Folder className="w-4 h-4 text-brand-orange" />}
            <span className="flex-1 text-left truncate">{folder.name}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 dark:bg-slate-800 text-gray-600 dark:text-slate-400">{count}</span>
          </button>
          {isExpanded && hasChildren && <div>{renderFolderTree(folder.id, level + 1)}</div>}
        </div>
      );
    });
  };

  const activeDbResumes = dbTab === 'my-resumes' ? myResumesData : internalDbData;
  const folderFiltered = dbTab === 'my-resumes' && selectedFolder !== 'all'
    ? activeDbResumes.filter(r => (r as any).folderId === selectedFolder)
    : activeDbResumes;
  const filteredDbResumes = folderFiltered.filter(r =>
    r.name.toLowerCase().includes(dbSearchQuery.toLowerCase()) ||
    r.email.toLowerCase().includes(dbSearchQuery.toLowerCase()) ||
    r.position.toLowerCase().includes(dbSearchQuery.toLowerCase())
  );

  const pickOrigin: PickSource = dbTab === 'my-resumes' ? 'my-resumes' : 'shared-db';

  /* The candidate list with the ticked resumes merged in — Send and the count
     read this, so ticking is enough (no "Add Selected" needed). A pick with no
     email, or an email already listed/picked, is skipped and named in the
     picker footer instead of silently dropping the count. */
  const validExisting = candidates.filter((c) => c.name.trim() && c.email.trim());
  const pickPartition = partitionPicks(picks, validExisting.map((c) => c.email));
  const mergeSelectedResumes = (): CandidateEmail[] => {
    const newCandidates: CandidateEmail[] = pickPartition.accepted.map((p) => ({
      id: `db-${p.id}`,
      name: p.name,
      email: p.email,
      source: 'database' as const,
      origin: p.origin,
      resumeId: p.id,
    }));
    return validExisting.length > 0 ? [...validExisting, ...newCandidates] : newCandidates.length > 0 ? newCandidates : [{ id: '1', name: '', email: '', source: 'manual' }];
  };

  // Move the picks into the candidate list (Add Selected, or leaving Select From).
  const commitPicks = () => {
    if (pickCount === 0) return;
    const skipped = pickPartition.duplicate.length + pickPartition.noEmail.length;
    if (skipped > 0) {
      toast.warning({ title: 'Some resumes skipped', description: `${skipped} resume${skipped > 1 ? 's' : ''} skipped — no email or already in the list` });
    }
    setCandidates(mergeSelectedResumes());
    setPicks({});
  };

  const handleAddFromDatabase = () => {
    commitPicks();
    setInputMode('manual');
  };

  // What Send acts on: ticked-but-not-yet-added resumes count as added.
  const pendingDbSelection = pickCount > 0;
  const sendCandidates = pendingDbSelection ? mergeSelectedResumes() : candidates;
  const pickedBySource = countBySource(Object.values(picks));
  const shownPickedCount = filteredDbResumes.filter((r) => picks[r.id]).length;
  const allShownPicked = filteredDbResumes.length > 0 && shownPickedCount === filteredDbResumes.length;

  // Note: Assessment creation is now handled by redirecting to /recruitment/assessments/create page
  // No need for inline assessment creation state

  // Fetch assessments for this JD on mount
  useEffect(() => {
    fetchAssessments();
  }, [jobId]);

  // Fetch quota stats when invite view is shown
  useEffect(() => {
    if (view === 'invite') {
      setQuotaStatsLoading(true);
      assessmentService.getInvitationStats()
        .then(stats => setQuotaStats(stats))
        .catch(() => setQuotaStats(null))
        .finally(() => setQuotaStatsLoading(false));
    }
  }, [view]);

  const fetchAssessments = async () => {
    setIsLoadingAssessments(true);
    try {
      const response = await assessmentService.list({ jd_id: jobId });
      // Only show PUBLISHED assessments (not draft, not archived)
      const activeAssessments = response.items.filter(
        (a: any) => a.status === 'published' && !a.is_archived
      );
      setAssessments(activeAssessments);

      if (activeAssessments.length === 0) {
        setView('no-assessment');
      } else {
        setView('invite');
        // Auto-select if only one assessment
        if (activeAssessments.length === 1) {
          setSelectedAssessment(activeAssessments[0].id);
        }
      }
    } catch (error) {
      console.error('Failed to fetch assessments:', error);
      setView('no-assessment');
    } finally {
      setIsLoadingAssessments(false);
    }
  };


  const handleStartCreateAssessment = () => {
    // Close modal and redirect to Create Assessment page
    // Pass jobId and returnUrl as query parameters
    const currentUrl = window.location.pathname;
    const createAssessmentUrl = `/recruitment/assessments/create?jobId=${jobId}&returnUrl=${encodeURIComponent(currentUrl)}`;
    window.location.href = createAssessmentUrl;
    onClose(); // Close the modal
  };

  const addCandidate = () => {
    setCandidates([...candidates, { id: Date.now().toString(), name: '', email: '', source: 'manual' }]);
  };

  const removeCandidate = (id: string) => {
    if (candidates.length > 1) {
      setCandidates(candidates.filter(c => c.id !== id));
    }
  };

  const updateCandidate = (id: string, field: 'name' | 'email', value: string) => {
    setCandidates(candidates.map(c =>
      c.id === id ? { ...c, [field]: value } : c
    ));
  };

  const handleSendInvitations = async () => {
    if (!selectedAssessment) {
      toast.error({ title: 'Select Assessment', description: 'Please select an assessment first' });
      return;
    }

    // Fold the ticked resumes into the list so it matches what was sent.
    if (pendingDbSelection) {
      setCandidates(sendCandidates);
      setPicks({});
    }
    const validCandidates = sendCandidates.filter(c => c.name.trim() && c.email.trim() && c.email.includes('@'));
    if (validCandidates.length === 0) {
      toast.error({ title: 'No Valid Candidates', description: 'Please add at least one candidate with valid name and email' });
      return;
    }
    const invalidNames = sendCandidates.filter(hasInvalidName);
    if (invalidNames.length > 0) {
      toast.error({ title: 'Invalid Name', description: `${invalidNames.map(c => c.name.trim()).join(', ')}: ${NAME_FORMAT_ERROR}` });
      return;
    }

    // Quota check
    if (quotaStats !== null && quotaStats.total_quota < 999999 && quotaStats.available < validCandidates.length) {
      const pendingMsg = quotaStats.pending > 0
        ? ` ${quotaStats.pending} unit(s) are held by pending invitations (released when links expire).`
        : '';
      toast.error({
        title: 'Insufficient Quota',
        description: `You have ${quotaStats.available} unit(s) available but need ${validCandidates.length}.${pendingMsg}`,
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const results = await Promise.allSettled(
        validCandidates.map(candidate =>
          assessmentService.invite(selectedAssessment, {
            candidate_name: candidate.name,
            candidate_email: candidate.email,
            invite_source: 'JD',
            expiry_days: expiryDays,
          })
        )
      );

      // Check for duplicate errors (409 Conflict)
      const duplicates: string[] = [];
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          const error = result.reason;
          const is409Error = error?.response?.status === 409 ||
                            error?.message?.includes('status code 409') ||
                            error?.message?.includes('already been invited') ||
                            error?.message?.includes('DUPLICATE_INVITATION');
          if (is409Error) {
            duplicates.push(validCandidates[index].email);
          }
        }
      });

      const successful = results.filter(r => r.status === 'fulfilled').length;

      if (duplicates.length > 0 && successful === 0) {
        setDuplicateEmails(duplicates);
        setShowDuplicateError(true);
        setIsSubmitting(false);
        return;
      }

      if (duplicates.length > 0 && successful > 0) {
        setShowSuccess(true);
        toast.warning({
          title: 'Partial Success',
          description: `${successful} sent, ${duplicates.length} already invited: ${duplicates.join(', ')}`,
        });
        setTimeout(() => {
          setShowSuccess(false);
          onClose();
        }, 3000);
        setIsSubmitting(false);
        return;
      }

      if (successful > 0) {
        setShowSuccess(true);
        toast.success({
          title: 'Invitations Sent!',
          description: `${successful} invitation${successful > 1 ? 's' : ''} sent successfully`,
        });

        setTimeout(() => {
          setShowSuccess(false);
          onClose();
        }, 2000);
      } else {
        toast.error({ title: 'Failed to Send', description: 'Could not send invitations. Please try again.' });
      }
    } catch (error: any) {
      console.error('Failed to send invitations:', error);
      toast.error({ title: 'Error', description: error.message || 'Failed to send invitations' });
    } finally {
      setIsSubmitting(false);
    }
  };


  const isValid =
    sendCandidates.some(c => c.name.trim() && c.email.trim() && c.email.includes('@')) &&
    !sendCandidates.some(hasInvalidName) &&
    selectedAssessment !== '';

  const selectedAssessmentData = assessments.find(a => a.id === selectedAssessment);

  // Success Screen
  if (showSuccess) {
    return (
      <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-6">
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 max-w-[95vw] sm:max-w-md w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-5 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between gap-2 shrink-0">
            <h3 className="min-w-0 truncate text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50">Invitations Sent</h3>
            <button
              onClick={onClose}
              className="shrink-0 rounded-lg text-gray-400 dark:text-slate-500 hover:text-gray-600 p-1.5"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-gray-500 dark:text-slate-500" />
            </button>
          </div>
          {/* Body */}
          <div className="px-5 sm:px-8 py-5 sm:py-6 text-center overflow-y-auto flex-1 min-h-0">
            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
              <CheckCircle className="w-7 h-7 sm:w-10 sm:h-10 text-green-600" />
            </div>
            <h3 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-slate-50 mb-2">Invitations Sent!</h3>
            <p className="text-gray-600 dark:text-slate-400 text-xs sm:text-sm">
              {candidates.filter(c => c.name.trim() && c.email.trim()).length} candidate{candidates.length > 1 ? 's' : ''} will receive the assessment invitation
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Duplicate Invitation Error Screen
  if (showDuplicateError) {
    return (
      <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-6">
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 max-w-[95vw] sm:max-w-md w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col tf-round-edges">
          {/* Header */}
          <div className="px-5 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between gap-2 shrink-0">
            <h3 className="min-w-0 truncate text-gray-900 dark:text-slate-50 text-base sm:text-lg font-medium">Invitation Already Sent</h3>
            <button
              onClick={() => {
                setShowDuplicateError(false);
                setDuplicateEmails([]);
                onClose();
              }}
              className="shrink-0 rounded-lg text-gray-400 dark:text-slate-500 hover:text-gray-600 p-1.5"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-gray-500 dark:text-slate-500" />
            </button>
          </div>

          {/* Body */}
          <div className="px-5 sm:px-8 py-5 sm:py-6 overflow-y-auto flex-1 min-h-0">
            <div className="text-center mb-4 sm:mb-6">
              <div className="w-12 h-12 sm:w-16 sm:h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
                <AlertTriangle className="w-7 h-7 sm:w-10 sm:h-10 text-amber-600" />
              </div>
              <p className="text-gray-600 dark:text-slate-400 text-xs sm:text-sm">
                {duplicateEmails.length === 1 ? (
                  <>An invitation has already been sent to <span className="font-medium text-gray-800 dark:text-slate-100 [overflow-wrap:anywhere]">{duplicateEmails[0]}</span> for this assessment.</>
                ) : (
                  <>Invitations have already been sent to the following emails for this assessment:</>
                )}
              </p>
              {duplicateEmails.length > 1 && (
                <div className="mt-2 p-2 bg-amber-50 rounded-lg">
                  {duplicateEmails.map((email, idx) => (
                    <p key={idx} className="text-xs sm:text-sm font-medium text-amber-800 [overflow-wrap:anywhere]">{email}</p>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg p-3 sm:p-4">
              <p className="text-xs sm:text-sm text-gray-700 dark:text-slate-300 mb-2">You can:</p>
              <ul className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 space-y-1">
                <li>• Try a <span className="font-medium">different email address</span></li>
                <li>• Send invitation for a <span className="font-medium">different assessment</span></li>
                <li>• Check the candidate&apos;s existing invitation status in Assessment Results</li>
              </ul>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 sm:px-6 py-3 sm:py-4 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 flex flex-col sm:flex-row gap-2 sm:gap-3 shrink-0">
            <button
              onClick={() => {
                setShowDuplicateError(false);
                setDuplicateEmails([]);
              }}
              className="flex-1 px-4 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white text-sm rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors"
            >
              Try Different Email
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Loading Screen — mirrors the invite screen: header, then the
  // "Select Assessment" field and the "Candidates" field the form shows.
  if (view === 'loading' || isLoadingAssessments) {
    return (
      <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-6">
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 max-w-[95vw] sm:max-w-[935px] w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col tf-round-edges">
          {/* Header */}
          <div className="bg-white border-b border-gray-100 px-4 sm:px-6 py-4 sm:py-5 flex items-center gap-2.5 sm:gap-3 shrink-0">
            <Skeleton className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex-shrink-0" />
            <div className="min-w-0 space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-28" />
            </div>
          </div>
          {/* Body */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
            {/* Select Assessment field */}
            <div className="space-y-2">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-11 w-full rounded-lg" />
            </div>
            {/* Candidates field */}
            <div className="space-y-2">
              <Skeleton className="h-3.5 w-24" />
              <div className="space-y-2 sm:space-y-3">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-lg border border-gray-200 dark:border-slate-700">
                    <div className="space-y-1.5">
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-9 w-full rounded-lg" />
                    </div>
                    <div className="space-y-1.5">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-9 w-full rounded-lg" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Expiry field */}
            <div className="space-y-2">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // No Assessment Screen - With blur background
  if (view === 'no-assessment') {
    return (
      <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-6">
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 max-w-[95vw] sm:max-w-[935px] w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col tf-round-edges">
          {/* Header - Grey Theme */}
          <div className="bg-gradient-to-r from-gray-700 to-gray-800 px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-semibold text-white truncate">No Assessment Found</h2>
                <p className="text-gray-300 text-xs sm:text-sm truncate">{jobTitle}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-white hover:bg-opacity-20 p-1.5 sm:p-2 rounded-lg transition-colors flex-shrink-0"
             aria-label="Close">
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 sm:p-6 text-center overflow-y-auto flex-1 min-h-0">
            <div className="w-14 h-14 sm:w-20 sm:h-20 bg-gray-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
              <FileText className="w-7 h-7 sm:w-10 sm:h-10 text-gray-600 dark:text-slate-400" />
            </div>
            <h3 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-slate-50 mb-2">No Assessment Created</h3>
            <p className="text-sm sm:text-base text-gray-600 dark:text-slate-400">
              There is no assessment configured for this job description yet.
              Create an assessment first to invite candidates.
            </p>
          </div>

          {/* Footer */}
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 flex flex-col gap-2 sm:gap-3 shrink-0">
            <button
              onClick={handleStartCreateAssessment}
              className="w-full px-4 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-gray-700 to-gray-800 text-white text-sm sm:text-base rounded-lg hover:from-gray-800 hover:to-gray-900 transition-colors flex items-center justify-center gap-2 font-medium"
            >
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
              Create AI Assessment
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Note: Create assessment view removed - now redirects to /recruitment/assessments/create page

  // Invite Screen (Main) - With blur background
  return (
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-6">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 max-w-[95vw] sm:max-w-[935px] w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col tf-round-edges">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-600 to-teal-600 px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <Mail className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-semibold text-white truncate">Invite Candidates</h2>
              <p className="text-green-100 text-xs sm:text-sm truncate">{jobTitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white hover:bg-opacity-20 p-1.5 sm:p-2 rounded-lg transition-colors flex-shrink-0"
           aria-label="Close">
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
          {/* Assessment Selection */}
          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5 sm:mb-2">Select Assessment *</label>
            <select
              value={selectedAssessment}
              onChange={(e) => setSelectedAssessment(e.target.value)}
              className="w-full min-w-0 h-[38px] px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm text-black"
            >
              <option value="">-- Choose an assessment --</option>
              {assessments.map((assessment) => (
                <option key={assessment.id} value={assessment.id}>
                  {assessment.title} • {assessment.duration_minutes} min • {assessment.status}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 mt-2">
              <p className="text-xs text-gray-500 dark:text-slate-500">
                {assessments.length} assessment{assessments.length !== 1 ? 's' : ''} available for this job
              </p>
              <button
                onClick={handleStartCreateAssessment}
                className="text-xs text-green-600 hover:text-green-700 flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                Create New Assessment
              </button>
            </div>
          </div>

          {/* Quota Banner */}
          {!quotaStatsLoading && quotaStats !== null && (() => {
            const isUnlimited = quotaStats.total_quota >= 999999;
            const isInsufficient = !isUnlimited && quotaStats.available === 0;
            const isLow = !isUnlimited && !isInsufficient && quotaStats.available <= 5;
            if (isUnlimited) {
              return (
                <div className="rounded-lg p-3 sm:p-4 border bg-blue-50 border-blue-200 flex items-center gap-2">
                  <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />
                  <span className="text-xs sm:text-sm font-medium text-blue-800">Unlimited assessment units</span>
                </div>
              );
            }
            return (
              <div className={`rounded-lg p-3 sm:p-4 border flex items-start gap-3 ${
                isInsufficient ? 'bg-red-50 border-red-200' : isLow ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'
              }`}>
                {isInsufficient
                  ? <ShieldAlert className="w-4 h-4 mt-0.5 text-red-500 flex-shrink-0" />
                  : <Info className="w-4 h-4 mt-0.5 text-blue-500 flex-shrink-0" />
                }
                <div className="flex-1 min-w-0">
                  <p className={`text-xs sm:text-sm font-medium ${
                    isInsufficient ? 'text-red-800' : isLow ? 'text-amber-800' : 'text-blue-800'
                  }`}>
                    Assessment Quota
                  </p>
                  <div className={`text-xs mt-1 flex flex-wrap gap-x-4 gap-y-1 ${
                    isInsufficient ? 'text-red-700' : isLow ? 'text-amber-700' : 'text-blue-700'
                  }`}>
                    <span>Total: <strong>{quotaStats.total_quota}</strong></span>
                    <span>Consumed: <strong>{quotaStats.consumed}</strong></span>
                    <span>Pending: <strong>{quotaStats.pending}</strong></span>
                    <span>Available: <strong>{quotaStats.available}</strong></span>
                  </div>
                  {isInsufficient && (
                    <p className="text-xs text-red-600 mt-1">
                      No units available. {quotaStats.pending > 0 ? `${quotaStats.pending} unit(s) will be released when pending invitations expire.` : 'Contact your administrator to increase quota.'}
                    </p>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Candidates */}
          <div>
            <div className="flex items-center justify-between mb-2 sm:mb-3 flex-wrap gap-2">
              <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-300">Candidates *</label>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => { commitPicks(); setInputMode('manual'); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                    inputMode === 'manual' ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10' : 'bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  Type Manually
                </button>
                <button
                  onClick={() => setInputMode('database')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                    inputMode === 'database' ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10' : 'bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue'
                  }`}
                >
                  <Database className="w-3.5 h-3.5" />
                  Select From
                </button>
              </div>
            </div>

            {/* Manual Input */}
            {inputMode === 'manual' && (
              <>
                <div className="flex justify-end mb-2">
                  <button onClick={addCandidate} className="text-xs text-green-600 hover:text-green-700 flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" />
                    Add Candidate
                  </button>
                </div>
                <div className="space-y-2 sm:space-y-3">
                  {candidates.map((cand) => (
                    <div key={cand.id} className={`flex items-start sm:items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-lg border ${cand.source === 'database' ? 'bg-gray-50 dark:bg-slate-800/50 border-gray-300 dark:border-slate-700' : 'bg-gray-50 dark:bg-slate-800/50 border-gray-200 dark:border-slate-700'}`}>
                      <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                        <div>
                          <label className="text-xs text-gray-500 dark:text-slate-500 mb-1 block">Full Name</label>
                          <input
                            type="text"
                            value={cand.name}
                            onChange={(e) => updateCandidate(cand.id, 'name', e.target.value)}
                            placeholder="John Doe"
                            readOnly={cand.source === 'database'}
                            aria-invalid={hasInvalidName(cand) ? 'true' : undefined}
                            className={`w-full min-w-0 h-[38px] px-3 py-2 border ${hasInvalidName(cand) ? 'border-destructive-line' : 'border-gray-300 dark:border-slate-700'} rounded-lg text-sm text-black focus:ring-2 focus:ring-green-500 focus:border-transparent ${cand.source === 'database' ? 'bg-gray-100 dark:bg-slate-800 cursor-not-allowed' : ''}`}
                          />
                          {hasInvalidName(cand) && (
                            <p className="text-xs text-destructive mt-1">{NAME_FORMAT_ERROR}</p>
                          )}
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 dark:text-slate-500 mb-1 block">Email Address</label>
                          <input
                            type="email"
                            value={cand.email}
                            onChange={(e) => updateCandidate(cand.id, 'email', e.target.value)}
                            placeholder="john.doe@email.com"
                            readOnly={cand.source === 'database'}
                            className={`w-full min-w-0 h-[38px] px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg text-sm text-black focus:ring-2 focus:ring-green-500 focus:border-transparent ${cand.source === 'database' ? 'bg-gray-100 dark:bg-slate-800 cursor-not-allowed' : ''}`}
                          />
                        </div>
                      </div>
                      {(candidates.length > 1 || cand.source === 'database') && (
                        <button
                          onClick={() => removeCandidate(cand.id)}
                          className="h-8 w-8 inline-flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0 mt-5 sm:mt-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Database Selection */}
            {inputMode === 'database' && (
              <div className="border-2 border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden">
                {/* Tabs */}
                <div className="flex overflow-x-auto scrollbar-hide border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
                  {hasMyResumesAccess && (
                    <button
                      onClick={() => setDbTab('my-resumes')}
                      className={`flex items-center gap-2 px-3 sm:px-4 py-2.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors border-b-2 ${dbTab === 'my-resumes' ? 'border-gray-800 text-gray-900 dark:text-slate-50 bg-white dark:bg-slate-900' : 'border-transparent text-gray-500 dark:text-slate-500 hover:text-gray-700'}`}
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      My Resumes
                      <span className="px-1.5 py-0.5 rounded-full text-xs bg-gray-200 dark:bg-slate-800 text-gray-700 dark:text-slate-300">{myResumesData.length}</span>
                      {pickedBySource.myResumes > 0 && (
                        <span title="Selected from My Resumes" className="px-1.5 py-0.5 rounded-full text-xs font-semibold bg-brand-blue text-white tabular-nums">✓ {pickedBySource.myResumes}</span>
                      )}
                    </button>
                  )}
                  {(hasInternalDBAccess || (!hasMyResumesAccess && !hasInternalDBAccess)) && (
                    <button
                      onClick={() => setDbTab('internal-db')}
                      className={`flex items-center gap-2 px-3 sm:px-4 py-2.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors border-b-2 ${dbTab === 'internal-db' ? 'border-gray-800 text-gray-900 dark:text-slate-50 bg-white dark:bg-slate-900' : 'border-transparent text-gray-500 dark:text-slate-500 hover:text-gray-700'}`}
                    >
                      <Database className="w-3.5 h-3.5" />
                      Shared Database
                      <span className="px-1.5 py-0.5 rounded-full text-xs bg-gray-200 dark:bg-slate-800 text-gray-700 dark:text-slate-300">{internalDbData.length}</span>
                      {pickedBySource.sharedDb > 0 && (
                        <span title="Selected from Shared Database" className="px-1.5 py-0.5 rounded-full text-xs font-semibold bg-brand-blue text-white tabular-nums">✓ {pickedBySource.sharedDb}</span>
                      )}
                    </button>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row" style={{ minHeight: '260px', maxHeight: '340px' }}>
                  {/* Folder Sidebar */}
                  {dbTab === 'my-resumes' && myFolders.length > 0 && (
                    <div className="w-full sm:w-40 max-h-28 sm:max-h-none border-b sm:border-b-0 sm:border-r border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 overflow-y-auto flex-shrink-0 p-2">
                      <p className="text-xs font-medium text-gray-500 dark:text-slate-500 uppercase mb-1.5 px-1">Folders</p>
                      <button
                        onClick={() => setSelectedFolder('all')}
                        className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs mb-1 ${selectedFolder === 'all' ? 'bg-gray-100 dark:bg-slate-800 text-gray-900 dark:text-slate-50 font-medium' : 'text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700'}`}
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        <span className="flex-1 min-w-0 truncate text-left">All Resumes</span>
                        <span className="shrink-0 text-xs px-1 rounded-full bg-gray-200 dark:bg-slate-800 text-gray-600 dark:text-slate-400">{myResumesData.length}</span>
                      </button>
                      <div className="space-y-0.5">{renderFolderTree(undefined, 0)}</div>
                    </div>
                  )}

                  <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
                    {/* Search + Select All */}
                    <div className="flex flex-wrap items-center gap-2 p-2 border-b border-gray-100 dark:border-slate-700/60">
                      <input
                        type="text"
                        value={dbSearchQuery}
                        onChange={e => setDbSearchQuery(e.target.value)}
                        placeholder="Search by name, email..."
                        className="w-full min-w-0 sm:min-w-[220px] sm:flex-1 h-[38px] px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                      <button
                        onClick={() => setPicks(prev => toggleAllPicks(prev, filteredDbResumes, pickOrigin))}
                        className="h-[38px] shrink-0 px-3 py-2 text-sm border border-gray-300 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 whitespace-nowrap text-gray-700 dark:text-slate-300"
                      >
                        {allShownPicked ? 'Deselect All' : 'Select All'}
                      </button>
                      <span className="text-xs text-gray-500 dark:text-slate-500 whitespace-nowrap">{shownPickedCount} of {filteredDbResumes.length} selected here</span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                      {isLoadingResumes ? (
                        <>
                          {Array.from({ length: 5 }).map((_, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-2 p-2.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                            >
                              <Skeleton className="w-4 h-4 shrink-0 rounded" />
                              <div className="flex-1 min-w-0 space-y-1.5">
                                <div className="flex items-center justify-between gap-2">
                                  <Skeleton className="h-3.5 w-28" />
                                  <Skeleton className="h-3 w-12" />
                                </div>
                                <Skeleton className="h-3 w-40" />
                                <Skeleton className="h-3 w-24" />
                              </div>
                            </div>
                          ))}
                        </>
                      ) : filteredDbResumes.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-gray-400 dark:text-slate-500">
                          <Database className="w-7 h-7 mb-2" />
                          <p className="text-xs">{dbSearchQuery ? 'No resumes match your search' : 'No resumes found'}</p>
                        </div>
                      ) : filteredDbResumes.map(resume => (
                        <div
                          key={resume.id}
                          onClick={() => setPicks(prev => togglePick(prev, resume, pickOrigin))}
                          className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all ${
                            !!picks[resume.id] ? 'bg-brand-blue/5 border-brand-blue/40' : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 hover:border-brand-blue/30 hover:bg-brand-blue/[0.03]'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${
                            !!picks[resume.id] ? 'bg-brand-blue border-brand-blue' : 'border-gray-300 dark:border-slate-700'
                          }`}>
                            {!!picks[resume.id] && <CheckCircle className="w-3 h-3 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-medium text-gray-900 dark:text-slate-50 truncate">{resume.name}</span>
                              <span className="text-xs text-gray-400 dark:text-slate-500 flex-shrink-0">{resume.experience}</span>
                            </div>
                            <div className="text-xs text-gray-500 dark:text-slate-500 truncate" title={resume.email}>{resume.email}</div>
                            <div className="text-xs text-gray-400 dark:text-slate-500 truncate">{resume.position}</div>
                          </div>
                        </div>
                      ))}
                    </div>

                  </div>
                </div>

                {/* Selection footer — outside the scroll-capped area so it's always in view. */}
                <div className="flex flex-wrap items-start justify-between gap-2 px-3 py-2 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
                  <ResumeSelectionSummary partition={pickPartition} onClear={() => setPicks({})} />
                  <button
                    onClick={handleAddFromDatabase}
                    disabled={pickCount === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 text-xs transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    <Users className="w-3.5 h-3.5" />
                    Add Selected
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Expiry Settings */}
          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5 sm:mb-2">Link Expiry</label>
            <select
              value={expiryDays}
              onChange={(e) => setExpiryDays(Number(e.target.value))}
              className="w-full min-w-0 h-[38px] px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm text-black"
            >
              <option value={1}>1 day</option>
              <option value={3}>3 days</option>
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
            </select>
          </div>

          {/* Preview */}
          {selectedAssessment && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-2 sm:mb-3">
                <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
                <span className="text-sm sm:text-base font-medium text-green-800">Ready to Send</span>
              </div>
              <div className="text-xs sm:text-sm text-green-700 space-y-1">
                <p className="[overflow-wrap:anywhere]"><strong>Assessment:</strong> {selectedAssessmentData?.title}</p>
                <p><strong>Duration:</strong> {selectedAssessmentData?.duration_minutes} minutes</p>
                <p><strong>Recipients:</strong> {sendCandidates.filter(c => c.name.trim() && c.email.trim()).length} candidate(s)</p>
                <p><strong>Expires in:</strong> {expiryDays} day{expiryDays > 1 ? 's' : ''}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-200 dark:border-slate-700 flex flex-col sm:flex-row items-stretch sm:items-center sm:justify-between gap-3 shrink-0">
          <div className="text-xs sm:text-sm text-center sm:text-left">
            {(() => {
              const validRows = sendCandidates.filter(c => c.name.trim() && c.email.trim());
              const validCount = validRows.length;
              const breakdown = validCount > 0 ? sourceBreakdown(validRows) : '';
              const insufficient = quotaStats !== null && quotaStats.total_quota < 999999 && quotaStats.available < validCount && validCount > 0;
              return (
                <span className={insufficient ? 'text-red-600 font-medium' : 'text-gray-600 dark:text-slate-400'}>
                  {validCount} candidate{validCount !== 1 ? 's' : ''} will receive invitations
                  {breakdown && <span className="block text-xs text-gray-500 dark:text-slate-500">{breakdown}</span>}
                  {insufficient && ` — only ${quotaStats!.available} unit(s) available`}
                </span>
              );
            })()}
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={handleSendInvitations}
              disabled={!isValid || isSubmitting || (quotaStats !== null && quotaStats.available === 0 && quotaStats.total_quota < 999999)}
              className="flex-1 sm:flex-none px-4 sm:px-6 py-2 bg-gradient-to-r from-green-600 to-teal-600 text-white text-sm sm:text-base rounded-lg hover:from-green-700 hover:to-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="hidden sm:inline">Sending...</span>
                  <span className="sm:hidden">...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">Send Invitations</span>
                  <span className="sm:hidden">Send</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
