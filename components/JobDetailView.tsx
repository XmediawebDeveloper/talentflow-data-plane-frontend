'use client'

import { ArrowLeft, ChevronLeft, ChevronRight, MapPin, Calendar, Target, Users, Briefcase, X, CheckCircle, Sparkles, UserPlus, ChevronDown, Upload, UserCheck, Mail, Phone, Building2, Clock, TrendingUp, Star, User as UserIcon, Ban, Archive, ArchiveRestore, History, FileText, Edit, XCircle, RefreshCw, Trash2, Eye, Download, Brain, Lock, BarChart, Search, Paperclip, Loader2 } from 'lucide-react';
import { useState, useRef, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Job } from '@/lib/types/types';
import type { User, Tenant } from '@/lib/types/tenant';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { jdService, JDVersion, JDUsageStatus } from '@/lib/services/jdService';
import ResumeUploadModal from './ResumeUploadModal';
import ResumeScoring from './ResumeScoring';
import JobApplicants from './JobApplicants';
import ScoredResumesTable from './ScoredResumesTable';
import InviteToAssessmentModal from './InviteToAssessmentModal';
import ShareAssessmentModal from './ShareAssessmentModal';
import SelectSourceModal from './SelectSourceModal';
import AssessmentResultsTable from './AssessmentResultsTable';
import VersionHistoryModal from './VersionHistoryModal';
import JDVersionHistoryModal from './JDVersionHistoryModal';
import ResumeDetailView from './ResumeDetailView';
import CandidateScoringDetailPage from './CandidateScoringDetailPage';
import CandidateResultDetails from './CandidateResultDetails';
import { Resume } from '@/lib/types/types';
import { scoringService } from '@/lib/services/scoringService';
import { dispatchUnitsConsumed } from '@/lib/services/api';
import { assessmentService } from '@/lib/services/assessmentService';
import { aiMatchService, AIMatchResultItem, AIMatchSessionResponse, MatchedCandidate } from '@/lib/services/aiMatchService';
import AITalentMatchProgressPanel from './AITalentMatchProgressPanel';
import TrackInvitesModal from './TrackInvitesModal';
import { toast } from 'sonner';
import { usePlanFeature, usePlanFeatures } from '@/lib/hooks/usePlanFeature';
import { useScoringProgress } from '@/contexts/ScoringProgressContext';
import { formatIST, formatISTDate } from '@/lib/utils/dateUtils';

// Legacy aliases — both now use the centralized IST formatter
const formatToIST = formatIST;
const formatISTDateTime = formatIST;

// ✅ PERMISSIONS: Reusable Quick Action Button Component
interface QuickActionButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  disabledTooltip?: string;
  className?: string;
}

function QuickActionButton({
  icon,
  label,
  onClick,
  disabled = false,
  disabledTooltip,
  className = ''
}: QuickActionButtonProps) {
  return (
    <div className="relative group">
      <button
        onClick={onClick}
        disabled={disabled}
        className={`
          w-full px-3 py-2.5 text-sm font-medium rounded-lg transition-all text-left flex items-center gap-2.5
          ${disabled
            ? 'bg-gray-50 text-gray-400 cursor-not-allowed border border-gray-200'
            : className || 'bg-brand-blue text-white hover:bg-brand-blue-2 shadow-md shadow-brand-blue/25 ring-1 ring-white/10'
          }
        `}
        title={disabled ? disabledTooltip : undefined}
      >
        {icon}
        <span className="flex-1">{label}</span>
        {disabled && <Lock className="w-3 h-3" />}
      </button>

      {/* Tooltip on hover when disabled */}
      {disabled && disabledTooltip && (
        <div className="absolute left-0 top-full mt-2 px-3 py-2 bg-brand-blue text-white text-xs rounded-md shadow-lg shadow-brand-blue/25 ring-1 ring-white/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
          {disabledTooltip}
        </div>
      )}
    </div>
  );
}

// Extended Job interface with additional fields
interface ExtendedJob extends Job {
  niceToHaveSkills?: string[];
  salaryMin?: number;
  salaryMax?: number;
  compensationType?: string;
  creationStage?: string;
  hasScoredResumes?: boolean;
  hasAiMatchResults?: boolean;
  rawDescription?: string;
  mustHaveComments?: string[];
  education?: string;
  // JD13: Usage status for edit/republish logic
  usageStatus?: JDUsageStatus;
}

interface JobDetailViewProps {
  job: ExtendedJob;
  onBack: () => void;
  initialTab?: 'overview' | 'scored-resumes' | 'assessment-results' | 'ai-talent-match';
  onEdit?: (job: Job) => void;
  resumes?: any[]; // All resumes for selection
  onScoreResumes?: (resumeIds: string[], jobId: string, source: 'my-resumes' | 'internal-db') => void;
  onNavigateToAITalentMatch?: (jobId: string) => void; // Navigate to AI Talent Match page
  onDisable?: (job: Job) => void; // Disable job
  onEnable?: (job: Job) => void; // JD15: Enable job (re-enable disabled JD)
  onArchive?: (job: Job) => void; // Archive job
  onUnarchive?: (job: Job) => void; // Unarchive job
  onDelete?: (job: Job) => void; // Delete job
  onViewAssessmentResult?: (assessmentResult: any, jobTitle: string) => void; // Navigate to assessment result detail
  onRepublish?: (job: Job) => void; // JD13: Republish job after editing
  isTenantAdmin?: boolean; // JD15: Whether user is Owner (for disable/enable buttons)
  user?: User; // ✅ PERMISSIONS: User object for permission checking
  tenant?: Tenant; // ✅ PERMISSIONS: Tenant object for feature flag checking
  prevId?: string | null;
  nextId?: string | null;
  currentIndex?: number;
  totalCount?: number;
}

export default function JobDetailView({ job, onBack, onEdit, resumes = [], onScoreResumes, onNavigateToAITalentMatch, onDisable, onEnable, onArchive, onUnarchive, onDelete, onViewAssessmentResult, onRepublish, isTenantAdmin = false, user, tenant, initialTab, prevId, nextId, currentIndex, totalCount }: JobDetailViewProps) {
  const router = useRouter();
  const { available: aiTalentMatchAvailable } = usePlanFeature('ai_talent_match');
  const { hasPlanFeature } = usePlanFeatures();
  const { startScoringJob, updateItemStatus, setMainPanelOpen } = useScoringProgress();

  const handleEdit = () => {
    if (onEdit) {
      onEdit(job);
    }
  };
  const [showAddApplicantsMenu, setShowAddApplicantsMenu] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showScoringView, setShowScoringView] = useState(false);
  const [showApplicantsView, setShowApplicantsView] = useState(false);
  const [uploadedResumes, setUploadedResumes] = useState<any[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  const [showInviteToAssessmentModal, setShowInviteToAssessmentModal] = useState(false);
  // ShareAssessmentModal (used by the assessment-side flow) reused here so
  // the JD-page "Invite for Assessment" flow matches the same UX. We need
  // the assessment(s) loaded before we can mount it.
  const [showShareAssessmentModal, setShowShareAssessmentModal] = useState(false);
  const [shareAssessments, setShareAssessments] = useState<any[]>([]);
  const [isLoadingShareAssessments, setIsLoadingShareAssessments] = useState(false);

  const handleOpenShareAssessment = async () => {
    if (isLoadingShareAssessments) return;
    setIsLoadingShareAssessments(true);
    try {
      const resp = await assessmentService.list({ jd_id: job.id, page_size: 100 });
      const items = (resp?.items || []).filter((a: any) => a?.status === 'published' || a?.status === 'PUBLISHED' || true);
      if (items.length === 0) {
        // Fallback to the older invite modal if there are no assessments
        // configured under this JD — ShareAssessmentModal needs at least
        // one to mount.
        setShowInviteToAssessmentModal(true);
        return;
      }
      setShareAssessments(items);
      setShowShareAssessmentModal(true);
    } catch (err) {
      console.error('Failed to load assessments for JD:', err);
      setShowInviteToAssessmentModal(true);
    } finally {
      setIsLoadingShareAssessments(false);
    }
  };
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showSelectSourceModal, setShowSelectSourceModal] = useState(false);
  const [showJDHistory, setShowJDHistory] = useState(false);
  const [jdHistory, setJdHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedHistoryVersion, setSelectedHistoryVersion] = useState<any>(null);
  const [downloadingPDF, setDownloadingPDF] = useState(false);

  // Scored resumes state
  const [scoredResumes, setScoredResumes] = useState<any[]>([]);
  const [loadingScoredResumes, setLoadingScoredResumes] = useState(false);
  const [scoredResumesStats, setScoredResumesStats] = useState({
    total: 0,
    exactMatch: 0,
    partialMatch: 0,
    noMatch: 0
  });

  // Resume quick view modal state
  const [viewingResume, setViewingResume] = useState<Resume | null>(null);

  // Scored resume detail modal state
  const [viewingScoredResume, setViewingScoredResume] = useState<any | null>(null);
  const [loadingScoredDetail, setLoadingScoredDetail] = useState(false);

  // AI Talent Match panel state
  const [showAIMatchPanel, setShowAIMatchPanel] = useState(false);

  // Assessment results state
  const [assessmentResults, setAssessmentResults] = useState<any[]>([]);
  const [loadingAssessmentResults, setLoadingAssessmentResults] = useState(false);
  const [viewingAssessmentResult, setViewingAssessmentResult] = useState<any | null>(null);

  // AI Talent Match state
  const [aiMatchSessions, setAiMatchSessions] = useState<AIMatchSessionResponse[]>([]);
  const [aiMatchCandidates, setAiMatchCandidates] = useState<MatchedCandidate[]>([]);
  const [loadingAiMatch, setLoadingAiMatch] = useState(false);

  // ✅ PERMISSIONS: Permission checking function
  const hasPermission = (permission: string): boolean => {
    if (!user) return false;
    if (user.role === 'tenant_admin') return true; // Admin has all permissions
    if (!user.permissions) return false;
    return user.permissions[permission as keyof typeof user.permissions] === true;
  };

  // ✅ PERMISSIONS: Feature flag checking (tenant-level)
  const isFeatureEnabled = (feature: string): boolean => {
    if (!tenant?.features) return true; // If no feature flags, assume enabled
    return tenant.features[feature as keyof typeof tenant.features] === true;
  };

  // ✅ PERMISSIONS: Get permissions for Quick Actions (using camelCase)
  const permissions = {
    canCreateAssessments: hasPermission('canCreateAssessments'),
    canRunAiMatch: hasPermission('canRunAiMatch'),
    canReadJD: hasPermission('canReadJD'),
    canViewAssessments: hasPermission('canViewAssessments'),
    canUploadResumes: hasPermission('canUploadResumes'),
    canRunScoring: hasPermission('canRunScoring'),
  };

  // ✅ PERMISSIONS: Get feature flags for Quick Actions
  const features = {
    assessment: isFeatureEnabled('assessment'),
    ai_talent_match: isFeatureEnabled('ai_talent_match'),
    resume_upload: isFeatureEnabled('resume_upload'),
  };

  // Track Invites modal state
  const [showTrackInvitesModal, setShowTrackInvitesModal] = useState(false);


  // Fetch JD History when modal opens
  useEffect(() => {
    if (showJDHistory && job.id) {
      fetchJDHistory();
    }
  }, [showJDHistory, job.id]);

  // Fetch scored resumes on component mount
  useEffect(() => {
    if (job.id) {
      fetchScoredResumes();
    }
  }, [job.id]);

  // Fetch assessment results on component mount (only if plan includes assessment)
  useEffect(() => {
    if (job.id && hasPlanFeature('assessment')) {
      fetchAssessmentResults();
    }
  }, [job.id, hasPlanFeature]);

  // Fetch AI match data on component mount (only if plan includes ai_talent_match)
  useEffect(() => {
    if (job.id && hasPlanFeature('ai_talent_match')) {
      fetchAiMatchData();
    }
  }, [job.id, hasPlanFeature]);


  const fetchJDHistory = async () => {
    setLoadingHistory(true);
    try {
      const versionData = await jdService.getVersionHistory(job.id);

      // Convert version history to JD history events
      const historyEvents = versionData.versions.map((version, index) => {
        const isLatest = index === 0;
        const isRepublished = version.version_number > 1;
        // Use IST time from backend if available (already in IST), otherwise convert UTC to IST
        const istTimestamp = version.published_at_ist
          ? formatISTDateTime(version.published_at_ist)
          : formatToIST(version.published_at);

        // Show "Republished" for versions > 1, "Published" for version 1
        const actionText = isRepublished
          ? `Republished (v${version.version_number}.0)`
          : `Published (v${version.version_number}.0)`;

        const descriptionText = isLatest
          ? (isRepublished ? 'Current republished version' : 'Current published version')
          : (isRepublished ? `Version ${version.version_number} republished after edit` : `Version ${version.version_number} published`);

        return {
          id: version.id,
          action: actionText,
          description: descriptionText,
          performedBy: version.published_by_name || 'Unknown User',
          performedByRole: version.published_by_role || 'Team Member',
          timestamp: istTimestamp,
          date: istTimestamp.split(',')[0],
          icon: isRepublished ? 'refresh' : 'check-circle',
          color: isRepublished ? 'blue' : 'green',
          version: version,
          isRepublished: isRepublished,
        };
      });

      setJdHistory(historyEvents);
    } catch (error) {
      console.error('Failed to fetch JD history:', error);
      setJdHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Fetch scored resumes from API
  const fetchScoredResumes = async () => {
    setLoadingScoredResumes(true);
    try {
      console.log('[JobDetailView] Fetching scored resumes for JD:', job.id);
      const response = await jdService.getScoredResumes(job.id, {
        page_size: 100,
        sort_by: 'latest'  // Always get latest scores first
      });
      console.log('[JobDetailView] Scored resumes response:', response);

      // Convert API response to ScoredResume format
      const convertedResumes = (response.items || []).map((item: any) => {
        // Map match_status from API to display format - use "Exact Match" for consistency
        let matchStatus = 'No Match';
        if (item.match_status === 'exact_match' || item.match_status === 'excellent') {
          matchStatus = 'Exact Match';
        } else if (item.match_status === 'partial_match' || item.match_status === 'partial') {
          matchStatus = 'Partial Match';
        }

        // Extract matched and missing skills from API response
        // Check multiple possible field names from the scoring API
        const matchedSkills: string[] = item.matched_skills || item.matchedSkills || item.skills || [];
        const missingSkills: string[] = item.missing_skills || item.missingSkills || item.gaps || [];

        return {
          id: item.id,
          resume_id: item.resume_id || '',
          candidateName: item.candidate_name || 'Unknown',
          email: item.candidate_email || '',
          phone: item.phone || '',
          matchStatus: matchStatus,
          scorePercentage: Number((item.overall_score || 0).toFixed(1)),  // Keep 1 decimal for consistency
          scoredDate: item.created_at || new Date().toISOString(),
          scoredBy: item.scored_by || item.scored_by_name || 'System',
          experience: item.experience_years ? `${item.experience_years} years` : undefined,
          education: item.education,
          certifications: item.certifications || [],
          version: item.resume_version || 1,  // Resume version tracking
          resumeVersion: item.resume_version || 1,  // Resume version tracking (alternative field name)
          tenantName: item.tenant_name || item.tenantName,  // Tenant information
          tenantId: item.tenant_id || item.tenantId,
          aiSummary: item.ai_summary,
          strengths: item.strengths || [],
          gaps: item.gaps || [],
          title: item.current_title,
          jobTitle: job.title,  // Show the JD title (job they applied for)
          currentCompany: item.current_company,
          location: item.location,
          // Extended scoring data
          skills: item.skills || [],
          matchedSkills: matchedSkills,
          missingSkills: missingSkills,
          scoreBreakdown: item.score_breakdown || [],
          criteriaScores: item.criteria_scores || {},
          essentialScore: item.essential_score,
          nonEssentialScore: item.non_essential_score,
          // Experience and education details for Personal Info tab
          experienceDetails: item.experience_details || item.experience || [],
          educationDetails: item.education_details || item.education || [],
          technicalSkills: item.technical_skills || item.skills || [],
          softSkills: item.soft_skills || [],
          languages: item.languages || [],
          professionalSummary: item.professional_summary || item.ai_summary || '',
        };
      });

      setScoredResumes(convertedResumes);

      // Update stats from response
      const stats = {
        total: response.total || convertedResumes.length,
        exactMatch: response.excellent_count || convertedResumes.filter((r: any) => r.matchStatus === 'Exact Match').length,
        partialMatch: response.partial_count || convertedResumes.filter((r: any) => r.matchStatus === 'Partial Match').length,
        noMatch: response.no_match_count || convertedResumes.filter((r: any) => r.matchStatus === 'No Match').length,
      };
      console.log('[JobDetailView] Setting scored resumes stats:', stats);
      setScoredResumesStats(stats);
    } catch (error) {
      console.error('[JobDetailView] Failed to fetch scored resumes:', error);
      setScoredResumes([]);
      setScoredResumesStats({ total: 0, exactMatch: 0, partialMatch: 0, noMatch: 0 });
    } finally {
      setLoadingScoredResumes(false);
    }
  };

  // Fetch assessment results for this JD
  const fetchAssessmentResults = async () => {
    setLoadingAssessmentResults(true);
    try {
      // First, get all assessments for this JD
      const assessmentsResponse = await assessmentService.list({ jd_id: job.id, page_size: 100 });
      const assessments = assessmentsResponse.items || [];

      // For each assessment, get the completed results
      const allResults: any[] = [];
      for (const assessment of assessments) {
        try {
          const resultsResponse = await assessmentService.listResults(assessment.id, { page_size: 100 });
          const results = resultsResponse.items || [];

          // Add assessment context to each result and map to expected format
          results.forEach((result: any) => {
            // Calculate score percentage
            const overallScore = result.overall_score ?? 0;
            const maxScore = 100;
            const scorePercentage = Math.round(overallScore);

            // Calculate completion time in minutes
            const completionTime = result.time_spent_seconds
              ? Math.round(result.time_spent_seconds / 60).toString()
              : 'N/A';

            // Build round scores array
            const roundScores: { roundName: string; score: number; maxScore: number; passFail: 'Pass' | 'Fail' }[] = [];
            if (result.hr_score !== null && result.hr_score !== undefined) {
              roundScores.push({
                roundName: 'HR',
                score: Math.round(Number(result.hr_score)),
                maxScore: 100,
                passFail: result.hr_score >= 60 ? 'Pass' : 'Fail'
              });
            }
            if (result.technical_score !== null && result.technical_score !== undefined) {
              roundScores.push({
                roundName: 'Technical',
                score: Math.round(Number(result.technical_score)),
                maxScore: 100,
                passFail: result.technical_score >= 60 ? 'Pass' : 'Fail'
              });
            }
            if (result.coding_score !== null && result.coding_score !== undefined) {
              roundScores.push({
                roundName: 'Coding',
                score: Math.round(Number(result.coding_score)),
                maxScore: 100,
                passFail: result.coding_score >= 60 ? 'Pass' : 'Fail'
              });
            }

            // Format duration properly
            let duration = '-';
            if (result.time_spent_seconds && result.time_spent_seconds > 0) {
              const minutes = Math.floor(result.time_spent_seconds / 60);
              const seconds = result.time_spent_seconds % 60;
              if (minutes > 0) {
                duration = `${minutes}m ${seconds}s`;
              } else {
                duration = `${seconds}s`;
              }
            } else if (result.status === 'pending') {
              duration = '-';
            } else if (result.status === 'in_progress') {
              duration = 'In Progress';
            }

            allResults.push({
              id: result.id || result.invitation_id,
              candidateDisplayId: result.candidate_display_id,
              candidateName: result.candidate_name || 'Unknown',
              email: result.candidate_email || '',
              phone: result.candidate_phone || '',
              assessmentName: result.assessment_title || assessment.title,
              assessmentId: assessment.id,
              totalScore: scorePercentage,
              maxScore: maxScore,
              scorePercentage: scorePercentage,
              passFail: result.passed ? 'Pass' : 'Fail',
              completedDate: result.completed_at
                ? formatISTDate(result.completed_at)
                : result.status === 'pending' ? 'Not started' : 'In Progress',
              completionTime: completionTime,
              duration: duration,
              aiSummary: result.ai_evaluation?.summary || 'Assessment completed.',
              roundScores: roundScores,
              invitedDate: result.started_at
                ? formatISTDate(result.started_at)
                : 'N/A',
              invitedBy: result.invite_source || 'System',
              inviteSource: result.invite_source || 'Manual',
              status: result.status || (result.completed_at ? 'completed' : 'in_progress'),
              // Without scoring_status the JD-side getResultStatus() falls
              // through to the started_at branch and shows In Progress
              // even after the candidate completes. Map it from the API.
              scoring_status: result.scoring_status,
              sent_at: result.sent_at || undefined,
              started_at: result.started_at || undefined,
              completed_at: result.completed_at || undefined,
              created_at: result.created_at || undefined,
            });
          });
        } catch (err) {
          console.warn(`Failed to fetch results for assessment ${assessment.id}:`, err);
        }
      }

      setAssessmentResults(allResults);
    } catch (error) {
      console.error('Failed to fetch assessment results:', error);
      setAssessmentResults([]);
    } finally {
      setLoadingAssessmentResults(false);
    }
  };

  // Fetch AI match sessions for this JD
  const fetchAiMatchData = async () => {
    setLoadingAiMatch(true);
    try {
      const response = await aiMatchService.listSessions({ jd_id: job.id, page_size: 100 });
      const sessions = response.items || [];
      setAiMatchSessions(sessions);

      // listSessions returns sessions with results: [] — fetch each session individually for enriched candidates
      const allCandidatesMap = new Map<string, MatchedCandidate>();
      await Promise.all(
        sessions.map(async (session) => {
          try {
            const { candidates } = await aiMatchService.getSession(session.id);
            candidates.forEach((c) => {
              const existing = allCandidatesMap.get(c.resumeId);
              // Keep the one with the higher match score (from the most recent/best session)
              if (!existing || c.matchScore > existing.matchScore) {
                allCandidatesMap.set(c.resumeId, c);
              }
            });
          } catch (err) {
            console.warn(`Failed to fetch session ${session.id}:`, err);
          }
        })
      );

      // Sort by matchScore descending
      const sorted = Array.from(allCandidatesMap.values()).sort((a, b) => b.matchScore - a.matchScore);
      setAiMatchCandidates(sorted);
    } catch (error) {
      console.error('Failed to fetch AI match data:', error);
      setAiMatchSessions([]);
      setAiMatchCandidates([]);
    } finally {
      setLoadingAiMatch(false);
    }
  };

  const [activeTab, setActiveTab] = useState<'overview' | 'scored-resumes' | 'assessment-results' | 'ai-talent-match'>(initialTab || 'overview');

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowAddApplicantsMenu(false);
      }
    };

    const handleShowApplicants = () => {
      setShowApplicantsView(true);
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('showApplicants' as any, handleShowApplicants);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('showApplicants' as any, handleShowApplicants);
    };
  }, []);
  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'Published':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'Republished':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'Draft':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'Closed':
        return 'bg-gray-100 text-gray-700 border-gray-200';
      case 'Disabled':  // JD15: Disabled status styling
        return 'bg-red-100 text-red-700 border-red-200';
      case 'Archived':
        return 'bg-purple-100 text-purple-700 border-purple-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  // Get display status - show "Republished" if published and version > 1
  const getDisplayStatus = (status: string, currentVersion?: number) => {
    if (status === 'Published' && currentVersion && currentVersion > 1) {
      return 'Republished';
    }
    return status;
  };

  const handleStatusChange = (newStatus: 'Published' | 'Draft' | 'Closed') => {
    // Mock status change
    console.log('Changing status to:', newStatus);
  };

  const handleDisable = () => {
    if (onDisable) {
      onDisable(job);
    }
  };

  const handleArchive = () => {
    if (onArchive) {
      onArchive(job);
    }
  };

  const handleDelete = () => {
    if (onDelete) {
      onDelete(job);
    }
  };

  const handleAITalentMatch = () => {
    // Show AI matching panel directly on this page
    setShowAIMatchPanel(true);
  };

  const handleAIMatchComplete = (results: any[]) => {
    setShowAIMatchPanel(false);
    toast.success(`AI Talent Match completed! Found ${results.length} matching candidates.`);
    fetchAiMatchData();
    setActiveTab('ai-talent-match');
  };

  // Score selected AI match candidates using async Celery bulk scoring
  const startAiMatchScoring = async (candidates: MatchedCandidate[]) => {
    if (candidates.length === 0) return;
    const resumeIds = candidates.map((c) => c.resumeId);
    const returnUrl = `/recruitment/job-details?id=${job.id}&tab=scored-resumes`;
    try {
      const response = await scoringService.startBulkScoringAsync(job.id, resumeIds);
      const batchId = response.batch_id;

      // Register items in floating progress widget
      const initialItems = candidates.map((c) => ({
        id: `${batchId}-${c.resumeId}`,
        resumeId: c.resumeId,
        candidateName: c.name,
        jobTitle: job.title,
        jobId: job.id,
        source: 'Internal DB' as const,
      }));
      startScoringJob(batchId, job.title, initialItems, returnUrl);

      toast.success(`Scoring started for ${resumeIds.length} candidate(s).`);
      setActiveTab('scored-resumes');

      // Poll batch status and update floating widget + scored resumes tab
      const poll = setInterval(async () => {
        try {
          const status = await scoringService.getBatchStatus(batchId);
          const items: any[] = status.items || [];

          items.forEach((item: any) => {
            const itemId = `${batchId}-${item.resume_id}`;
            if (item.status === 'completed') {
              updateItemStatus(batchId, itemId, 'Scored successfully', {
                score: item.overall_score,
                scoredDateTime: new Date().toISOString(),
              });
            } else if (item.status === 'failed') {
              updateItemStatus(batchId, itemId, 'Failed', {
                errorReason: item.error_message || 'Scoring failed',
              });
            } else if (item.status === 'processing') {
              updateItemStatus(batchId, itemId, 'Scoring in progress');
            }
          });

          // Stop polling when batch is finished
          if (status.status === 'completed' || status.status === 'failed') {
            clearInterval(poll);
            fetchScoredResumes();
            // Refresh header quota dropdown — RS deductions landed on CP
            dispatchUnitsConsumed();
          }
        } catch {
          clearInterval(poll);
        }
      }, 3000);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to start scoring');
    }
  };

  const handleAIMatchError = (error: string) => {
    setShowAIMatchPanel(false);
    toast.error(`AI Matching failed: ${error}`);
  };

  const handleAddApplications = () => {
    setShowAddApplicantsMenu(false);
    setShowUploadModal(true);
  };

  const handleSelectApplicants = () => {
    setShowAddApplicantsMenu(false);
    setShowSelectSourceModal(true);
  };

  const handleResumeUpload = (files: File[]) => {
    // Mock scoring data
    const mockResumes = files.map((file, index) => ({
      id: `resume-${Date.now()}-${index}`,
      name: file.name.replace(/\.(pdf|doc|docx)$/, '').replace(/[-_]/g, ' '),
      email: `candidate${index + 1}@example.com`,
      phone: `+1 (555) ${Math.floor(Math.random() * 900) + 100}-${Math.floor(Math.random() * 9000) + 1000}`,
      location: ['New York, NY', 'San Francisco, CA', 'Austin, TX', 'Remote'][Math.floor(Math.random() * 4)],
      score: Math.floor(Math.random() * 30) + 70,
      matchStatus: ['excellent', 'good', 'fair'][Math.floor(Math.random() * 3)] as 'excellent' | 'good' | 'fair',
      experience: ['2-3 years', '3-5 years', '5+ years'][Math.floor(Math.random() * 3)],
      education: ['Bachelor\'s Degree', 'Master\'s Degree', 'PhD'][Math.floor(Math.random() * 3)],
      skills: ['React', 'TypeScript', 'Node.js', 'Python', 'AWS', 'Docker'].sort(() => Math.random() - 0.5).slice(0, 4),
      strengths: [
        'Strong technical background in required technologies',
        'Relevant industry experience',
        'Excellent communication skills',
        'Leadership experience'
      ].sort(() => Math.random() - 0.5).slice(0, 2),
      gaps: [
        'Limited experience with specific framework',
        'Education level below preferred',
        'Geographic location distance'
      ].sort(() => Math.random() - 0.5).slice(0, 2)
    }));

    setUploadedResumes(mockResumes);
    setShowUploadModal(false);
    setShowScoringView(true);
  };

  const handleProceedToApplicants = () => {
    setShowScoringView(false);
    setShowApplicantsView(true);
  };

  const handleBackFromScoring = () => {
    setShowScoringView(false);
  };

  const handleBackFromApplicants = () => {
    setShowApplicantsView(false);
  };

  // Mock applicants data
  const mockApplicants = [
    {
      id: '1',
      name: 'Sarah Johnson',
      email: 'sarah.johnson@example.com',
      phone: '+1 (555) 123-4567',
      location: 'San Francisco, CA',
      score: 92,
      status: 'Shortlisted' as const,
      appliedDate: '2 days ago',
      experience: '5+ years',
      education: 'Master\'s Degree in CS',
      skills: ['React', 'TypeScript', 'Node.js', 'AWS', 'GraphQL']
    },
    {
      id: '2',
      name: 'Michael Chen',
      email: 'michael.chen@example.com',
      phone: '+1 (555) 234-5678',
      location: 'New York, NY',
      score: 88,
      status: 'New' as const,
      appliedDate: '1 day ago',
      experience: '4-5 years',
      education: 'Bachelor\'s Degree',
      skills: ['React', 'JavaScript', 'Python', 'Docker', 'MongoDB']
    },
    {
      id: '3',
      name: 'Emily Rodriguez',
      email: 'emily.rodriguez@example.com',
      phone: '+1 (555) 345-6789',
      location: 'Austin, TX',
      score: 85,
      status: 'Interview' as const,
      appliedDate: '3 days ago',
      experience: '3-4 years',
      education: 'Master\'s Degree',
      skills: ['Vue.js', 'TypeScript', 'Node.js', 'PostgreSQL']
    },
    {
      id: '4',
      name: 'David Kim',
      email: 'david.kim@example.com',
      phone: '+1 (555) 456-7890',
      location: 'Remote',
      score: 78,
      status: 'Reviewing' as const,
      appliedDate: '5 days ago',
      experience: '2-3 years',
      education: 'Bachelor\'s Degree',
      skills: ['React', 'JavaScript', 'CSS', 'Git']
    }
  ];

  // Show scoring view
  if (showScoringView) {
    return (
      <ResumeScoring
        jobTitle={job.title}
        resumes={uploadedResumes}
        onBack={handleBackFromScoring}
        onProceedToApplicants={handleProceedToApplicants}
      />
    );
  }

  // Show applicants view
  if (showApplicantsView) {
    return (
      <JobApplicants
        jobTitle={job.title}
        applicants={[...mockApplicants, ...uploadedResumes.map(r => ({
          ...r,
          status: 'New' as const,
          appliedDate: 'Just now'
        }))]}
        onBack={handleBackFromApplicants}
      />
    );
  }

  // Show CandidateScoringDetailPage when viewing a scored resume (same as ResumeScoringPage)
  if (viewingScoredResume) {
    const _scoredIdx = scoredResumes.findIndex((r: any) => (r.resumeId || r.resume_id) === (viewingScoredResume.resumeId || viewingScoredResume.resume_id));
    const _goToScoredCandidate = (idx: number) => {
      const r = scoredResumes[idx];
      if (!r) return;
      setViewingScoredResume({
        ...r,
        candidateName: r.candidateName || 'Unknown',
        email: r.email || '',
        phone: r.phone || '',
        matchStatus: r.matchStatus || 'No Match',
        scorePercentage: r.scorePercentage || 0,
        scoredDate: r.scoredDate || new Date().toISOString(),
        scoredBy: r.scoredBy || 'System',
        matchedSkills: r.matchedSkills || r.technicalSkills || r.skills || [],
        missingSkills: r.missingSkills || [],
      });
    };
    return (
      <CandidateScoringDetailPage
        resume={viewingScoredResume}
        jobTitle={job.title}
        jobId={job.id}
        onBack={() => setViewingScoredResume(null)}
        currentIndex={_scoredIdx >= 0 ? _scoredIdx : undefined}
        totalCount={scoredResumes.length}
        onPrev={_scoredIdx > 0 ? () => _goToScoredCandidate(_scoredIdx - 1) : undefined}
        onNext={_scoredIdx >= 0 && _scoredIdx < scoredResumes.length - 1 ? () => _goToScoredCandidate(_scoredIdx + 1) : undefined}
      />
    );
  }

  // Show CandidateResultDetails inline when viewing an assessment result
  if (viewingAssessmentResult) {
    const aId = viewingAssessmentResult.assessmentId || job.id;
    const _nonPendingResults = assessmentResults.filter((r: any) => {
      const s = r.status || '';
      return s.toLowerCase() !== 'pending';
    });
    const _arIdx = _nonPendingResults.findIndex((r: any) => r.id === viewingAssessmentResult.id);
    const _goToResult = (idx: number) => {
      const r = _nonPendingResults[idx];
      if (r) setViewingAssessmentResult(r);
    };
    return (
      <CandidateResultDetails
        onBack={() => setViewingAssessmentResult(null)}
        assessmentId={aId}
        assessmentShortId={viewingAssessmentResult.assessmentShortId}
        candidateId={viewingAssessmentResult.id}
        candidateDisplayId={viewingAssessmentResult.candidateDisplayId}
        assessmentTitle={viewingAssessmentResult.assessmentName || job.title}
        jdTitle={job.title}
        jdId={job.id}
        assessmentVersion={viewingAssessmentResult.assessmentVersion}
        currentIndex={_arIdx >= 0 ? _arIdx : undefined}
        totalCount={_nonPendingResults.length}
        onPrev={_arIdx > 0 ? () => _goToResult(_arIdx - 1) : undefined}
        onNext={_arIdx >= 0 && _arIdx < _nonPendingResults.length - 1 ? () => _goToResult(_arIdx + 1) : undefined}
      />
    );
  }

  return (
    <main className="flex-1 p-4 md:p-8 overflow-x-hidden overflow-y-auto bg-slate-50">
      <div className="w-full max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Jobs
          </button>
          {totalCount != null && totalCount > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => prevId && router.push(`/recruitment/job-details?id=${prevId}`)}
                disabled={!prevId}
                className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-gray-700"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>
              <span className="text-xs text-gray-400 whitespace-nowrap">
                {(currentIndex ?? 0) + 1} / {totalCount}
              </span>
              <button
                onClick={() => nextId && router.push(`/recruitment/job-details?id=${nextId}`)}
                disabled={!nextId}
                className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-gray-700"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Job Details Card */}
        <div className="bg-white rounded-lg shadow-sm border-2 border-blue-200 p-4">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {/* Row 1: JD ID + Job Title + Status */}
              <div className="flex flex-wrap items-center gap-2 mb-2">
                {job.job_id && (
                  <span className="inline-flex items-center px-2 py-0.5 bg-blue-600 text-white rounded-md text-xs font-semibold font-mono tracking-wide">
                    {job.job_id}
                  </span>
                )}
                <h1 className="font-normal text-gray-900 text-base sm:text-lg truncate">{job.title}</h1>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border whitespace-nowrap ${getStatusBadgeClass(getDisplayStatus(job.status, job.currentVersion))}`}>
                  {getDisplayStatus(job.status, job.currentVersion)}
                </span>
              </div>

              {/* Row 2: Location + Education + Employment Type + Work Mode + Posted Date + Posted By + Version */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-600">
                {/* Location */}
                {job.location && (
                  <>
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-purple-600" />
                      <span>{job.location}</span>
                    </div>
                    <span className="text-gray-300">•</span>
                  </>
                )}

                {/* Experience Level */}
                {job.experience_level && (
                  <span className="inline-flex items-center px-2.5 py-1 bg-gray-100 text-gray-700 rounded-md text-xs">
                    {(() => {
                      const label =
                        job.experience_level === 'entry' || job.experience_level === 'entry_level' ? 'Entry Level' :
                        job.experience_level === 'junior' || job.experience_level === 'junior_level' ? 'Junior' :
                        job.experience_level === 'mid' || job.experience_level === 'mid_level' ? 'Mid Level' :
                        job.experience_level === 'senior' || job.experience_level === 'senior_level' ? 'Senior' :
                        job.experience_level === 'architect' || job.experience_level === 'architect_level' ? 'Architect' :
                        job.experience_level === 'management' || job.experience_level === 'management_level' ? 'Management' :
                        job.experience_level === 'lead' ? 'Lead' :
                        job.experience_level === 'executive' ? 'Executive' :
                        job.experience_level;
                      return job.experience ? `${label} (${job.experience})` : label;
                    })()}
                  </span>
                )}

                {/* Education */}
                {job.education && (
                  <>
                    <span className="inline-flex items-center px-2.5 py-1 bg-gray-100 text-gray-700 rounded-md text-xs">
                      {job.education === 'bachelors' ? "Bachelor's Degree" :
                       job.education === 'masters' ? "Master's Degree" :
                       job.education === 'doctorate' ? 'Doctorate / PhD' :
                       job.education === 'associate' ? 'Associate Degree' :
                       job.education === 'diploma' ? 'Diploma' :
                       job.education}
                    </span>
                  </>
                )}

                {/* Employment Type */}
                {job.employmentType && (
                  <>
                    <span className="inline-flex items-center px-2.5 py-1 bg-gray-100 text-gray-700 rounded-md text-xs">
                      {job.employmentType === 'full_time' ? 'Full Time' :
                       job.employmentType === 'part_time' ? 'Part Time' :
                       job.employmentType === 'contract' ? 'Contract' :
                       job.employmentType === 'internship' ? 'Internship' :
                       job.employmentType === 'temporary' ? 'Temporary' :
                       job.employmentType}
                    </span>
                  </>
                )}

                {/* Work Mode */}
                {job.workMode && (
                  <>
                    <span className="inline-flex items-center px-2.5 py-1 bg-gray-100 text-gray-700 rounded-md text-xs">
                      {job.workMode === 'onsite' ? 'On-site' :
                       job.workMode === 'remote' ? 'Remote' :
                       job.workMode === 'hybrid' ? 'Hybrid' :
                       job.workMode === 'field_based' ? 'Field-based' :
                       job.workMode}
                    </span>
                  </>
                )}

                {/* Salary */}
                {(job.salaryMin || job.salaryMax) && (
                  <span className="inline-flex items-center px-2.5 py-1 bg-green-50 text-green-700 rounded-md text-xs font-medium">
                    {job.salaryMin && job.salaryMax
                      ? `₹${Number(job.salaryMin).toLocaleString('en-IN')} – ₹${Number(job.salaryMax).toLocaleString('en-IN')}`
                      : job.salaryMin
                        ? `From ₹${Number(job.salaryMin).toLocaleString('en-IN')}`
                        : `Up to ₹${Number(job.salaryMax).toLocaleString('en-IN')}`}
                    {job.compensationType ? ` / ${job.compensationType}` : ''}
                  </span>
                )}

                {/* Separator before Posted Info */}
                {(job.location || job.education || job.employmentType || job.workMode || job.salaryMin || job.salaryMax) && (
                  <span className="text-gray-300">•</span>
                )}

                {/* Posted Date with Time */}
                <span>
                  Posted {job.postedDate ? formatISTDateTime(job.postedDate) : 'N/A'}
                </span>
                <span className="text-gray-300">•</span>

                {/* Posted By */}
                <span>By {job.postedBy || 'Unknown'}</span>
                <span className="text-gray-300">•</span>

                {/* Version Badge */}
                {job.currentVersion && job.currentVersion > 0 ? (
                  <button
                    onClick={() => setShowVersionHistory(true)}
                    className="inline-flex items-center px-2.5 py-1 bg-purple-600 text-white rounded-full text-xs font-medium hover:bg-purple-700 transition-colors"
                    aria-label="View version history" title="View version history"
                  >
                    v{job.currentVersion}.0
                  </button>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-1 bg-purple-600 text-white rounded-full text-xs font-medium">
                    v1.0
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 ml-6">
            {/* AI Talent Match Button - COMMENTED OUT (gated by aiTalentMatchAvailable) */}
            {false && aiTalentMatchAvailable && (job.status !== 'Disabled' ? (
              <button
                onClick={handleAITalentMatch}
                className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-800 transition-colors shadow-sm"
              >
                <Sparkles className="w-4 h-4" />
                AI Talent Match
              </button>
            ) : (
              <button
                disabled
                className="flex items-center gap-2 px-4 py-2 bg-gray-300 text-gray-500 rounded-md cursor-not-allowed shadow-sm"
                aria-label="AI Talent Match is not available for disabled JDs" title="AI Talent Match is not available for disabled JDs"
              >
                <Sparkles className="w-4 h-4" />
                AI Talent Match
              </button>
            ))}

            {/* Add Applicants Dropdown */}
            {/* <div className="relative" ref={menuRef}>
              <button
                onClick={() => setShowAddApplicantsMenu(!showAddApplicantsMenu)}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                Add Applicants
                <ChevronDown className="w-4 h-4" />
              </button>

              {showAddApplicantsMenu && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                  <button
                    onClick={handleAddApplications}
                    className="w-full px-4 py-2.5 text-left hover:bg-gray-50 transition-colors flex items-center gap-3"
                  >
                    <Upload className="w-4 h-4 text-gray-600" />
                    <div>
                      <div className="text-sm text-gray-900">Add Applications</div>
                      <div className="text-xs text-gray-500">Upload new resumes</div>
                    </div>
                  </button>
                  <div className="border-t border-gray-100 my-1"></div>
                  <button
                    onClick={handleSelectApplicants}
                    className="w-full px-4 py-2.5 text-left hover:bg-gray-50 transition-colors flex items-center gap-3"
                  >
                    <UserCheck className="w-4 h-4 text-gray-600" />
                    <div>
                      <div className="text-sm text-gray-900">Select Applicants</div>
                      <div className="text-xs text-gray-500">Choose from existing resumes</div>
                    </div>
                  </button>
                </div>
              )}
            </div> */}

            {/* JD13: Usage Status Info Banner - COMMENTED OUT */}
            {false && job.status === 'Published' && job.usageStatus?.is_used && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded-lg text-sm flex items-center gap-2">
                <Ban className="w-4 h-4 flex-shrink-0" />
                <span>
                  This JD is in use ({job.usageStatus.usage.total_usage_count} {job.usageStatus.usage.total_usage_count === 1 ? 'usage' : 'usages'}) and cannot be edited.
                </span>
              </div>
            )}

            {/* JD15: Action Buttons - For Disabled jobs */}
            {job.status === 'Disabled' && (
              <div className="flex items-center gap-2">
                {onEnable && (
                  <button
                    onClick={() => onEnable(job)}
                    className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-all flex items-center gap-2"
                    aria-label="Re-enable this JD" title="Re-enable this JD"
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span className="font-medium">Re-enable JD</span>
                  </button>
                )}
              </div>
            )}

            {/* Action Buttons - For Archived jobs */}
            {job.status === 'Archived' && (
              <div className="flex items-center gap-2">
                {onUnarchive && (
                  <button
                    onClick={() => onUnarchive(job)}
                    className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-all flex items-center gap-2"
                  >
                    <ArchiveRestore className="w-4 h-4" />
                    <span className="font-medium">Unarchive</span>
                  </button>
                )}
                {/* Delete button - COMMENTED OUT */}
                {false && onDelete && (
                  <button
                    onClick={handleDelete}
                    className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-all"
                    aria-label="Delete Job" title="Delete Job"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="mb-5 bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center border-b border-gray-200 overflow-x-auto">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2.5 text-sm transition-colors relative whitespace-nowrap ${
              activeTab === 'overview'
                ? 'text-blue-600 bg-blue-50'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            Overview
            {activeTab === 'overview' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"></div>
            )}
          </button>
          {hasPlanFeature('resume_scoring') && (
            <button
              onClick={() => setActiveTab('scored-resumes')}
              className={`px-4 py-2.5 text-sm transition-colors relative flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'scored-resumes'
                  ? 'text-blue-600 bg-blue-50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              Scored Resumes
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                activeTab === 'scored-resumes'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-600'
              }`}>
                {scoredResumesStats.total}
              </span>
              {activeTab === 'scored-resumes' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"></div>
              )}
            </button>
          )}
          {hasPlanFeature('assessment') && (
            <button
              onClick={() => setActiveTab('assessment-results')}
              className={`px-4 py-2.5 text-sm transition-colors relative flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'assessment-results'
                  ? 'text-blue-600 bg-blue-50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              Assessment Results
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                activeTab === 'assessment-results'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-600'
              }`}>
                {assessmentResults.length}
              </span>
              {activeTab === 'assessment-results' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"></div>
              )}
            </button>
          )}
          {hasPlanFeature('ai_talent_match') && (
            <button
              onClick={() => setActiveTab('ai-talent-match')}
              className={`px-4 py-2.5 text-sm transition-colors relative flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'ai-talent-match'
                  ? 'text-blue-600 bg-blue-50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              AI Talent Match Results
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                activeTab === 'ai-talent-match'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-600'
              }`}>
                {aiMatchCandidates.length}
              </span>
              {activeTab === 'ai-talent-match' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"></div>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Overview Tab Content */}
      {activeTab === 'overview' && (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column - Job Details */}
        <div className="lg:col-span-8 space-y-4">
          {/* Complete Job Description */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            {/* JD Header - COMMENTED OUT
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100 px-8 py-6">
              <div className="flex items-start justify-between mb-2">
                <h1 className="text-2xl text-gray-900">{job.title}</h1>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg shadow-sm">
                  <History className="w-4 h-4" />
                  <span className="text-sm font-medium">
                    Version {job.currentVersion && job.currentVersion > 0 ? `${job.currentVersion}.0` : '1.0'}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                {job.department && (
                  <div className="flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-blue-600" />
                    <span>{job.department}</span>
                  </div>
                )}
                {job.location && (
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-blue-600" />
                  <span>{job.location}</span>
                </div>
                )}
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-blue-600" />
                  <span>Posted {job.postedDate
                    ? (() => {
                        const postedDate = new Date(job.postedDate);
                        const now = new Date();
                        const diffMs = now.getTime() - postedDate.getTime();
                        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                        if (diffDays === 0) return 'today';
                        if (diffDays === 1) return '1 day ago';
                        return `${diffDays} days ago`;
                      })()
                    : 'N/A'}</span>
                </div>
              </div>
            </div>
            */}

            {/* JD Content */}
            <div className="p-4 sm:p-5">
              <div className="space-y-4 sm:space-y-5">
                {/* Job Description - Actual Content */}
                {job.description ? (
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900 mb-3">
                      Job Description
                    </h2>
                    <div className="h-px bg-gray-200 mb-3"></div>
                    <div className="markdown-content prose prose-sm max-w-none text-gray-700">
                      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{job.description
                        .replace(/#+\s*Certifications[\s\S]*?(?=\n#|\n\n#|$)/gi, (match) =>
                          match.toLowerCase().includes('none') || match.toLowerCase().includes('not required') || match.toLowerCase().includes('n/a') || match.trim().match(/^#+\s*Certifications\s*$/im) ? '' : match
                        )
                        .replace(/\*\*Certifications\*\*[:\s]*(?:None|None required|N\/A|Not required)\.?\s*/gi, '')
                        .replace(/Certifications[:\s]*(?:None|None required|N\/A|Not required)\.?\s*/gi, '')
                      }</ReactMarkdown>
                    </div>
                  </div>
                ) : (
                  <div className="text-gray-500 italic text-center py-8">
                    No job description provided
                  </div>
                )}


                {/* Compensation - COMMENTED OUT */}
                {false && (job.salaryMin || job.salaryMax) && (
                  <div>
                    <h2 className="text-base font-semibold text-gray-900 mb-4">
                      Compensation
                    </h2>
                    <div className="h-px bg-gray-200 mb-4"></div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-lg text-gray-900 flex items-baseline gap-2 flex-wrap">
                        <span className="font-semibold">
                          {job.salaryMin && (
                            <span>₹{Math.round(Number(job.salaryMin)).toLocaleString('en-IN')}</span>
                          )}
                          {job.salaryMin && job.salaryMax && <span> - </span>}
                          {job.salaryMax && (
                            <span>₹{Math.round(Number(job.salaryMax)).toLocaleString('en-IN')}</span>
                          )}
                        </span>
                        {job.compensationType && (
                          <span className="text-gray-500 text-sm">
                            / {job.compensationType === 'yearly' ? 'year' :
                               job.compensationType === 'monthly' ? 'month' :
                               job.compensationType === 'hourly' ? 'hour' :
                               job.compensationType === 'daily' ? 'day' : job.compensationType}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                )}

              </div>
            </div>
          </div>

          {/* Internal Recruiter Notes & Assessment Guidance - Side by Side */}
          <div className={`grid ${hasPlanFeature('assessment') ? 'grid-cols-2' : 'grid-cols-1'} gap-4`}>
            {/* Internal Recruiter Notes */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <h3 className="text-sm font-medium text-gray-900 mb-3">Internal Recruiter Notes</h3>
              <div className="text-sm text-gray-600 space-y-2">
                {job.internalRecruiterComments && job.internalRecruiterComments.length > 0 ? (
                  <ul className="list-disc list-inside space-y-1">
                    {job.internalRecruiterComments.map((note, index) => (
                      <li key={index}>{note}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-500 italic">No internal notes added</p>
                )}
              </div>
            </div>

            {/* Assessment Guidance - only if plan includes assessment */}
            {hasPlanFeature('assessment') && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h3 className="text-sm font-medium text-gray-900 mb-3">Assessment Guidance</h3>
                <div className="text-sm text-gray-600">
                  {job.assessmentGuidance ? (
                    <p className="whitespace-pre-wrap">{job.assessmentGuidance}</p>
                  ) : (
                    <p className="text-gray-500 italic">No assessment guidance provided</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column - Actions & Activity */}
        <div className="lg:col-span-4 space-y-4">
          {/* Quick Actions */}
          <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-4">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Quick Actions</h3>
            <div className="space-y-2">
              {/* 1. View JD History */}
              {permissions.canReadJD && (
                <QuickActionButton
                  icon={<History className="w-4 h-4" />}
                  label="View JD History"
                  onClick={() => setShowJDHistory(true)}
                />
              )}

              {/* 2. AI Talent Match */}
              {permissions.canRunAiMatch && aiTalentMatchAvailable && (
                <QuickActionButton
                  icon={<Brain className="w-4 h-4" />}
                  label="AI Talent Match"
                  onClick={() => setShowAIMatchPanel(true)}
                  disabled={!features.ai_talent_match || job.status === 'Disabled'}
                  disabledTooltip={
                    !features.ai_talent_match
                      ? 'AI Match feature is not enabled for your organization'
                      : 'AI Talent Match is not available for disabled JDs'
                  }
                />
              )}

              {/* 3. Score Resumes */}
              {permissions.canRunScoring && hasPlanFeature('resume_scoring') && (
                <QuickActionButton
                  icon={<Target className="w-4 h-4" />}
                  label="Score Resumes"
                  onClick={() => setShowSelectSourceModal(true)}
                  disabled={job.status === 'Disabled'}
                  disabledTooltip="Resume scoring is not available for disabled JDs"
                />
              )}

              {/* 4. Invite for Assessment — opens the same
                  ShareAssessmentModal used by the assessment-side flow so
                  the JD-page invite matches that UX (Share Assessment via
                  Email, candidate type/select, expiry, live email preview). */}
              {permissions.canCreateAssessments && hasPlanFeature('assessment') && (
                <QuickActionButton
                  icon={<Mail className="w-4 h-4" />}
                  label="Invite for Assessment"
                  onClick={handleOpenShareAssessment}
                  disabled={!features.assessment || job.status === 'Disabled' || isLoadingShareAssessments}
                  disabledTooltip={
                    !features.assessment
                      ? 'Assessments module is not enabled for your organization'
                      : 'Assessments are not available for disabled JDs'
                  }
                />
              )}

              {/* 5. Assessment Status */}
              {permissions.canViewAssessments && hasPlanFeature('assessment') && (
                <QuickActionButton
                  icon={<BarChart className="w-4 h-4" />}
                  label="Assessment Status"
                  onClick={() => setShowTrackInvitesModal(true)}
                  disabled={!features.assessment}
                  disabledTooltip="Assessments module is not enabled"
                />
              )}

              {/* Add Applicants - hidden */}
            </div>
          </div>

          {/* Applicant Statistics */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Applicant Statistics</h3>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-gray-600">Total Scored Resumes</span>
                  <span className="font-medium text-gray-900">{scoredResumesStats.total}</span>
                </div>
                <div className="bg-gray-200 rounded-full h-2">
                  <div className="bg-blue-600 h-2 rounded-full" style={{ width: scoredResumesStats.total > 0 ? '100%' : '0%' }}></div>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-gray-600">Exact Match</span>
                  <span className="font-medium text-gray-900">{scoredResumesStats.exactMatch}</span>
                </div>
                <div className="bg-gray-200 rounded-full h-2">
                  <div className="bg-green-600 h-2 rounded-full" style={{ width: `${scoredResumesStats.total > 0 ? (scoredResumesStats.exactMatch / scoredResumesStats.total * 100) : 0}%` }}></div>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-gray-600">Partial Match</span>
                  <span className="font-medium text-gray-900">{scoredResumesStats.partialMatch}</span>
                </div>
                <div className="bg-gray-200 rounded-full h-2">
                  <div className="bg-yellow-600 h-2 rounded-full" style={{ width: `${scoredResumesStats.total > 0 ? (scoredResumesStats.partialMatch / scoredResumesStats.total * 100) : 0}%` }}></div>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-gray-600">No Match</span>
                  <span className="font-medium text-gray-900">{scoredResumesStats.noMatch}</span>
                </div>
                <div className="bg-gray-200 rounded-full h-2">
                  <div className="bg-red-600 h-2 rounded-full" style={{ width: `${scoredResumesStats.total > 0 ? (scoredResumesStats.noMatch / scoredResumesStats.total * 100) : 0}%` }}></div>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Recent Activity</h3>
            <div className="space-y-3">
              {scoredResumesStats.total > 0 && (
                <div className="flex gap-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-1.5 flex-shrink-0"></div>
                  <div>
                    <div className="text-sm text-gray-900">{scoredResumesStats.total} resume(s) scored</div>
                    <div className="text-xs text-gray-500">Resume scoring completed</div>
                  </div>
                </div>
              )}
              {scoredResumesStats.exactMatch > 0 && (
                <div className="flex gap-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full mt-1.5 flex-shrink-0"></div>
                  <div>
                    <div className="text-sm text-gray-900">{scoredResumesStats.exactMatch} exact match(es) found</div>
                    <div className="text-xs text-gray-500">High-quality candidates identified</div>
                  </div>
                </div>
              )}
              {scoredResumesStats.partialMatch > 0 && (
                <div className="flex gap-3">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full mt-1.5 flex-shrink-0"></div>
                  <div>
                    <div className="text-sm text-gray-900">{scoredResumesStats.partialMatch} partial match(es) found</div>
                    <div className="text-xs text-gray-500">Candidates with potential identified</div>
                  </div>
                </div>
              )}
              {job.currentVersion && job.currentVersion > 1 && (
                <div className="flex gap-3">
                  <div className="w-2 h-2 bg-purple-500 rounded-full mt-1.5 flex-shrink-0"></div>
                  <div>
                    <div className="text-sm text-gray-900">JD updated to version {job.currentVersion}.0</div>
                    <div className="text-xs text-gray-500">Job description republished</div>
                  </div>
                </div>
              )}
              {job.status === 'Published' && job.postedDate && (
                <div className="flex gap-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full mt-1.5 flex-shrink-0"></div>
                  <div>
                    <div className="text-sm text-gray-900">Job published by {job.postedBy || 'System'}</div>
                    <div className="text-xs text-gray-500">{formatISTDateTime(job.postedDate)}</div>
                  </div>
                </div>
              )}
              {scoredResumesStats.total === 0 && job.status !== 'Published' && !job.currentVersion && (
                <div className="text-sm text-gray-500 italic">No recent activity</div>
              )}
            </div>
          </div>

        </div>
      </div>

      )}

      {/* Scored Resumes Tab Content */}
      {activeTab === 'scored-resumes' && (
        <div className="mt-0">
          {loadingScoredResumes ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 sm:p-10 flex items-center justify-center">
              <Loader2 className="h-6 w-6 text-blue-600 animate-spin" />
              <span className="ml-3 text-gray-600 text-sm">Loading scored resumes...</span>
            </div>
          ) : scoredResumes.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 sm:p-10 text-center">
              <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-base sm:text-lg">No scored resumes yet</p>
              <p className="text-gray-400 text-sm mt-2">
                Upload and score resumes against this job description to see them here
              </p>
            </div>
          ) : (
            <ScoredResumesTable
              resumes={scoredResumes}
              jobTitle={job.title}
              jobId={job.id}
              availableUnits={15}
              onViewCandidate={(resume) => {
                // Pass resume directly - data already formatted by fetchScoredResumes
                // CandidateScoringDetailPage handles the same format as ResumeScoringPage
                setViewingScoredResume({
                  ...resume,
                  // Ensure required fields have fallbacks
                  candidateName: resume.candidateName || 'Unknown',
                  email: resume.email || '',
                  phone: resume.phone || '',
                  matchStatus: resume.matchStatus || 'No Match',
                  scorePercentage: resume.scorePercentage || 0,
                  scoredDate: resume.scoredDate || new Date().toISOString(),
                  scoredBy: resume.scoredBy || 'System',
                  // Use existing matchedSkills/missingSkills or fall back to skills/gaps
                  matchedSkills: resume.matchedSkills || resume.technicalSkills || resume.skills || [],
                  missingSkills: resume.missingSkills || [],
                });
              }}
            />
          )}
        </div>
      )}

      {/* Assessment Results Tab Content */}
      {activeTab === 'assessment-results' && (
        <div className="mt-0">
          <AssessmentResultsTable
            results={assessmentResults}
            jobTitle={job.title}
            jobId={job.id}
            canDownloadPDF={isTenantAdmin || (user?.permissions?.canDownloadAssessmentPDF ?? false)}
            canBatchDownload={isTenantAdmin || (user?.permissions?.canExport ?? false)}
            onViewResultDetail={(result) => {
              setViewingAssessmentResult(result);
            }}
          />
        </div>
      )}

      {/* AI Talent Match Tab Content */}
      {activeTab === 'ai-talent-match' && (
        <AIMatchTabContent
          candidates={aiMatchCandidates}
          scoredResumes={scoredResumes}
          sessions={aiMatchSessions}
          loading={loadingAiMatch}
          canRunAiMatch={permissions.canRunAiMatch}
          onRunMatch={() => setShowAIMatchPanel(true)}
          onScoreSelected={(selected) => startAiMatchScoring(selected)}
          onScoreAll={() => startAiMatchScoring(aiMatchCandidates.filter((c) => {
            const scoredIds = new Set(scoredResumes.map((r: any) => r.resume_id).filter(Boolean));
            return !scoredIds.has(c.resumeId);
          }))}
          onViewCandidate={(candidate) => router.push(`/recruitment/resume-view/${candidate.resumeId}`)}
        />
      )}

      {/* Resume Upload Modal */}
      {showUploadModal && (
        <ResumeUploadModal
          jobTitle={job.title}
          onClose={() => setShowUploadModal(false)}
          onSubmit={handleResumeUpload}
        />
      )}

      {/* Invite to Assessment Modal — fallback only when the JD has no
          assessments yet. The primary path now uses ShareAssessmentModal
          below, identical to the assessment-side flow. */}
      {showInviteToAssessmentModal && (
        <InviteToAssessmentModal
          jobTitle={job.title}
          jobId={job.id}
          onClose={() => setShowInviteToAssessmentModal(false)}
        />
      )}

      {/* Share Assessment via Email — same modal the assessment-side page
          uses, so the JD page's "Invite for Assessment" matches the UX
          shown for assessment-level share. */}
      {showShareAssessmentModal && shareAssessments.length > 0 && (
        <ShareAssessmentModal
          isOpen={showShareAssessmentModal}
          onClose={() => {
            setShowShareAssessmentModal(false);
            setShareAssessments([]);
          }}
          assessment={{
            id: shareAssessments[0].id,
            title: shareAssessments[0].title,
            duration: `${shareAssessments[0].duration_minutes || 30} min`,
            questions: (shareAssessments[0].hr_enabled ? 1 : 0)
              + (shareAssessments[0].technical_enabled ? 1 : 0)
              + (shareAssessments[0].coding_enabled ? 1 : 0),
            type: 'AI-Generated',
            short_id: shareAssessments[0].short_id,
            jd_short_id: job.id,
            jd_title: job.title,
            jd_version: shareAssessments[0].jd_version,
          }}
          additionalAssessments={shareAssessments.slice(1).map((a: any) => ({
            id: a.id,
            title: a.title,
            duration: `${a.duration_minutes || 30} min`,
            questions: (a.hr_enabled ? 1 : 0)
              + (a.technical_enabled ? 1 : 0)
              + (a.coding_enabled ? 1 : 0),
            type: 'AI-Generated',
            short_id: a.short_id,
            jd_short_id: job.id,
            jd_title: job.title,
            jd_version: a.jd_version,
          }))}
          inviteSource="JD"
        />
      )}

      {/* Select Source Modal */}
      {showSelectSourceModal && (
        <SelectSourceModal
          jobTitle={job.title}
          jobId={job.id}
          onClose={() => setShowSelectSourceModal(false)}
          onScoringComplete={() => {
            setShowSelectSourceModal(false);
            fetchScoredResumes();
            setActiveTab('scored-resumes');
          }}
        />
      )}

      {/* Version History Modal */}
      <JDVersionHistoryModal
        isOpen={showVersionHistory}
        onClose={() => setShowVersionHistory(false)}
        jdId={job.id}
        jdTitle={job.title}
      />

      {/* JD History Modal */}
      {showJDHistory && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-4xl w-full max-h-[calc(100dvh-2rem)] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="bg-gray-800 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                {selectedHistoryVersion ? (
                  <button
                    onClick={() => setSelectedHistoryVersion(null)}
                    className="h-8 w-8 bg-white/20 rounded-lg flex items-center justify-center hover:bg-white/30 transition-colors flex-shrink-0"
                  >
                    <ArrowLeft className="w-4 h-4 text-white" />
                  </button>
                ) : (
                  <div className="h-8 w-8 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <History className="w-4 h-4 text-white" />
                  </div>
                )}
                <div className="min-w-0">
                  <h2 className="text-base sm:text-lg font-semibold text-white truncate">
                    {selectedHistoryVersion ? `Version ${selectedHistoryVersion.version.version_number}.0` : 'Job Description History'}
                  </h2>
                  <p className="text-xs text-gray-300 truncate">{job.title}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowJDHistory(false);
                  setSelectedHistoryVersion(null);
                }}
                className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-white/20 transition-colors flex-shrink-0"
               aria-label="Close">
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 sm:p-5 overflow-y-auto max-h-[calc(90vh-140px)] sm:max-h-[calc(85vh-140px)]">
              {loadingHistory ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 text-gray-600 animate-spin" />
                  <span className="ml-3 text-gray-600">Loading history...</span>
                </div>
              ) : selectedHistoryVersion ? (
                /* Version Detail View */
                <div>
                  {/* Version Info Bar with Download Button */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 p-3 bg-gray-50 rounded-lg">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                      <span className="px-2.5 py-1 bg-gray-900 text-white rounded-lg text-xs font-semibold">
                        v{selectedHistoryVersion.version.version_number}.0
                      </span>
                      <div className="text-xs text-gray-600">
                        <span className="flex items-center gap-1">
                          <UserIcon className="w-3.5 h-3.5" />
                          {selectedHistoryVersion.performedBy}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">{selectedHistoryVersion.timestamp}</span>
                      {selectedHistoryVersion.version.version_number > 1 && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                          New content highlighted in blue
                        </span>
                      )}
                    </div>
                    <button
                      disabled={downloadingPDF}
                      onClick={async () => {
                        if (downloadingPDF) return;
                        setDownloadingPDF(true);

                        const jdContent = selectedHistoryVersion.version.description || '';
                        const title = selectedHistoryVersion.version.title || job.title;
                        const version = selectedHistoryVersion.version.version_number;

                        // Create HTML content for PDF
                        const htmlContent = `
                          <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 800px; line-height: 1.6;">
                            <h1 style="color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; margin-bottom: 5px;">${title}</h1>
                            <p style="color: #6b7280; font-size: 14px; margin-bottom: 24px;">Version ${version}.0 | Generated on ${formatISTDate(new Date().toISOString())}</p>
                            <div style="color: #4b5563;">
                              ${jdContent
                                .replace(/^### (.*$)/gm, '<h3 style="color: #4b5563; margin-top: 20px; font-size: 16px;">$1</h3>')
                                .replace(/^## (.*$)/gm, '<h2 style="color: #374151; margin-top: 24px; font-size: 18px;">$1</h2>')
                                .replace(/^# (.*$)/gm, '<h1 style="color: #1f2937; font-size: 22px;">$1</h1>')
                                .replace(/\*\*(.*?)\*\*/g, '<strong style="color: #1f2937;">$1</strong>')
                                .replace(/^\- (.*$)/gm, '<li style="margin: 4px 0;">$1</li>')
                                .replace(/(<li[^>]*>.*<\/li>\n?)+/g, '<ul style="padding-left: 24px; margin: 8px 0;">$&</ul>')
                                .replace(/\n\n/g, '</p><p style="margin: 8px 0;">')
                                .replace(/\n/g, '<br>')}
                            </div>
                          </div>
                        `;

                        // Create a temporary div to render the content
                        const tempDiv = document.createElement('div');
                        tempDiv.innerHTML = htmlContent;
                        document.body.appendChild(tempDiv);

                        try {
                          // Dynamically import html2pdf
                          const html2pdf = (await import('html2pdf.js')).default;

                          await html2pdf().set({
                            margin: 10,
                            filename: `${title.replace(/[^a-zA-Z0-9]/g, '_')}_v${version}.pdf`,
                            image: { type: 'jpeg', quality: 0.98 },
                            html2canvas: { scale: 2 },
                            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                          }).from(tempDiv).save();
                        } catch (error) {
                          console.error('PDF generation failed:', error);
                          toast.error('Failed to generate PDF. Please try again.');
                        } finally {
                          document.body.removeChild(tempDiv);
                          setDownloadingPDF(false);
                        }
                      }}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${downloadingPDF ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                    >
                      {downloadingPDF ? (
                        <>
                          <svg className="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Generating...
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4" />
                          Download PDF
                        </>
                      )}
                    </button>
                  </div>

                  {/* Job Title + Description - same layout as Overview tab */}
                  <div className="p-4 sm:p-5 bg-white rounded-lg border border-gray-200">
                    <h2 className="text-sm font-semibold text-gray-900 mb-3">
                      {selectedHistoryVersion.version.title}
                    </h2>
                    <div className="h-px bg-gray-200 mb-3"></div>

                  {(() => {
                      const currentIndex = jdHistory.findIndex((h: any) => h.id === selectedHistoryVersion.id);
                      const prevVersion = currentIndex < jdHistory.length - 1 ? jdHistory[currentIndex + 1] : null;
                      const isV1 = selectedHistoryVersion.version.version_number === 1;
                      const currentDesc = selectedHistoryVersion.version.description || '';
                      const prevDesc = prevVersion?.version?.description || '';

                      // For v1 or no changes, just render normally
                      if (isV1 || !prevDesc) {
                        return (
                          <div className="markdown-content prose prose-sm max-w-none text-gray-700">
                            <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{currentDesc}</ReactMarkdown>
                          </div>
                        );
                      }

                      // For v2+, use ReactMarkdown with custom components for diff highlighting
                      const stripMarkdown = (line: string): string => {
                        return line
                          .replace(/^#{1,6}\s+/, '')
                          .replace(/\*\*(.*?)\*\*/g, '$1')
                          .replace(/\*(.*?)\*/g, '$1')
                          .replace(/^[-*+]\s+/, '')
                          .replace(/^\d+\.\s+/, '')
                          .trim();
                      };

                      const prevLinesSet = new Set(
                        prevDesc.split('\n')
                          .map((l: string) => stripMarkdown(l))
                          .filter((l: string) => l.length > 0)
                      );

                      const getTextContent = (children: any): string => {
                        if (typeof children === 'string') return children;
                        if (typeof children === 'number') return String(children);
                        if (Array.isArray(children)) return children.map(getTextContent).join('');
                        if (children && typeof children === 'object' && children.props) {
                          return getTextContent(children.props.children);
                        }
                        return '';
                      };

                      const isNewContent = (children: any): boolean => {
                        const text = getTextContent(children).trim();
                        return text.length > 0 && !prevLinesSet.has(text);
                      };

                      const highlightClass = 'bg-blue-100 text-blue-800 px-2 rounded';

                      const diffComponents = {
                        h1: ({ node, children, ...props }: any) => (
                          <h1 className={isNewContent(children) ? highlightClass : ''} {...props}>{children}</h1>
                        ),
                        h2: ({ node, children, ...props }: any) => (
                          <h2 className={isNewContent(children) ? highlightClass : ''} {...props}>{children}</h2>
                        ),
                        h3: ({ node, children, ...props }: any) => (
                          <h3 className={isNewContent(children) ? highlightClass : ''} {...props}>{children}</h3>
                        ),
                        p: ({ node, children, ...props }: any) => (
                          <p className={isNewContent(children) ? highlightClass : ''} {...props}>{children}</p>
                        ),
                        li: ({ node, children, ...props }: any) => (
                          <li className={isNewContent(children) ? highlightClass : ''} {...props}>{children}</li>
                        ),
                      };

                      return (
                        <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed markdown-content">
                          <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={diffComponents}>{currentDesc}</ReactMarkdown>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ) : jdHistory.length === 0 ? (
                <div className="text-center py-10">
                  <History className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 text-base">No version history available</p>
                  <p className="text-gray-400 text-sm mt-2">
                    Versions are created when you publish the job description
                  </p>
                </div>
              ) : (
                <>
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  Complete timeline of all published versions
                </p>
                <span className="text-xs bg-gray-100 text-gray-700 px-3 py-1 rounded-full font-medium">
                  {jdHistory.length} Version{jdHistory.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Timeline */}
              <div className="relative">
                {/* Vertical Line */}
                <div className="absolute left-[18px] sm:left-6 top-0 bottom-0 w-0.5 bg-gray-200"></div>

                {/* Timeline Items */}
                <div className="space-y-6">
                  {jdHistory.map((item, index) => {
                    const isFirst = index === 0;
                    const isLast = index === jdHistory.length - 1;

                    // Icon mapping
                    const IconComponent = {
                      'file-plus': FileText,
                      'edit': Edit,
                      'check-circle': CheckCircle,
                      'x-circle': XCircle,
                      'refresh': RefreshCw,
                    }[item.icon] || History;

                    // Color mapping - All grey theme
                    const colorClasses = 'bg-gray-600 border-gray-700';
                    const bgColorClasses = 'bg-gray-50 border-gray-200 hover:border-gray-400 cursor-pointer';
                    const textColorClasses = 'text-gray-900';

                    return (
                      <div key={item.id} className="relative flex gap-3 sm:gap-4">
                        {/* Timeline Icon */}
                        <div className="relative flex-shrink-0">
                          <div className={`h-9 w-9 rounded-full border-4 border-white ${colorClasses} flex items-center justify-center shadow-lg z-10 relative`}>
                            <IconComponent className="w-4 h-4 text-white" />
                          </div>
                          {isFirst && (
                            <div className="absolute -top-1 -right-1 w-3 h-3 bg-gray-700 rounded-full border-2 border-white"></div>
                          )}
                        </div>

                        {/* Content Card - Now Clickable */}
                        <div className={`flex-1 pb-5 ${!isLast ? '' : 'pb-0'}`}>
                          <button
                            type="button"
                            onClick={() => setSelectedHistoryVersion(item)}
                            className={`w-full text-left rounded-lg border-2 ${bgColorClasses} p-3 sm:p-4 shadow-sm hover:shadow-md transition-all`}
                          >
                            {/* Action Header */}
                            <div className="flex items-start justify-between mb-2 gap-2">
                              <div className="min-w-0">
                                <h3 className={`font-semibold ${textColorClasses} text-sm sm:text-base mb-1`}>
                                  {item.action}
                                </h3>
                                <p className="text-sm text-gray-700 mb-2">
                                  {item.description}
                                </p>
                              </div>
                              <span className="text-xs bg-gray-200 text-gray-800 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
                                {item.date}
                              </span>
                            </div>

                            {/* Performed By Info */}
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-2 border-t border-gray-200">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <div className="h-7 w-7 bg-gray-600 rounded-full flex items-center justify-center flex-shrink-0">
                                  <UserIcon className="w-3.5 h-3.5 text-white" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-medium text-gray-900 truncate">{item.performedBy}</p>
                                  <p className="text-xs text-gray-600">{item.performedByRole}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 text-xs text-gray-500 pl-9 sm:pl-0">
                                <Clock className="w-3 h-3" />
                                <span className="truncate">{item.timestamp}</span>
                              </div>
                            </div>

                            {/* Click hint */}
                            <div className="mt-3 pt-2 border-t border-gray-200 flex items-center justify-center gap-2 text-gray-500">
                              <Eye className="w-3.5 h-3.5" />
                              <span className="text-xs">Click to view full JD</span>
                            </div>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="bg-gray-50 px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0 border-t border-gray-200">
              <p className="text-xs text-gray-600">
                {selectedHistoryVersion ? `Viewing version ${selectedHistoryVersion.version.version_number}.0` : 'Showing complete history from creation to present'}
              </p>
              <button
                onClick={() => {
                  setShowJDHistory(false);
                  setSelectedHistoryVersion(null);
                }}
                className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-all shadow-sm text-sm w-full sm:w-auto text-center"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resume Detail View Modal */}
      {viewingResume && (
        <ResumeDetailView
          resume={viewingResume}
          onClose={() => setViewingResume(null)}
        />
      )}

      {/* Scored Resume Detail - now handled by CandidateScoringDetailPage above */}

      {/* AI Talent Match Progress Panel */}
      {showAIMatchPanel && (
        <AITalentMatchProgressPanel
          jobTitle={job.title}
          jobId={job.id}
          onComplete={handleAIMatchComplete}
          onError={handleAIMatchError}
        />
      )}

      {/* Track Invites Modal */}
      {showTrackInvitesModal && (
        <TrackInvitesModal
          isOpen={showTrackInvitesModal}
          onClose={() => setShowTrackInvitesModal(false)}
          jdId={job.id}
          jdTitle={job.title}
        />
      )}
      </div>
    </main>
  );
}

// ─── AI Match Tab Sub-component ──────────────────────────────────────────────
function AIMatchTabContent({
  candidates,
  scoredResumes,
  sessions,
  loading,
  canRunAiMatch,
  onRunMatch,
  onScoreSelected,
  onScoreAll,
  onViewCandidate,
}: {
  candidates: MatchedCandidate[];
  scoredResumes: any[];
  sessions: AIMatchSessionResponse[];
  loading: boolean;
  canRunAiMatch: boolean;
  onRunMatch: () => void;
  onScoreSelected: (selected: MatchedCandidate[]) => void;
  onScoreAll: () => void;
  onViewCandidate?: (candidate: MatchedCandidate) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterThreshold, setFilterThreshold] = useState(0);
  const [filterPhone, setFilterPhone] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterExperienceMin, setFilterExperienceMin] = useState<number | ''>('');
  const [filterExperienceMax, setFilterExperienceMax] = useState<number | ''>('');
  const [sortBy, setSortBy] = useState<'rank' | 'name' | 'score' | 'experience'>('rank');

  const scoredResumeIds = new Set(scoredResumes.map((r: any) => r.resume_id).filter(Boolean));

  const filteredCandidates = useMemo(() => {
    const filtered = candidates.filter(candidate => {
      const matchesThreshold = candidate.matchScore >= filterThreshold;
      const matchesSearch = searchQuery === '' ||
        candidate.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        candidate.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (candidate.email && candidate.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
        candidate.skills.some(skill => skill.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesPhone = filterPhone === '' ||
        (candidate.phone && (
          candidate.phone.toLowerCase().includes(filterPhone.toLowerCase()) ||
          candidate.phone.replace(/[^0-9]/g, '').includes(filterPhone.replace(/[^0-9]/g, ''))
        ));
      const matchesLocation = filterLocation === '' ||
        (candidate.location && candidate.location.toLowerCase().includes(filterLocation.toLowerCase()));
      const candidateExp = candidate.experience ? parseFloat(candidate.experience) : 0;
      const matchesExpMin = filterExperienceMin === '' || candidateExp >= filterExperienceMin;
      const matchesExpMax = filterExperienceMax === '' || candidateExp <= filterExperienceMax;
      return matchesThreshold && matchesSearch && matchesPhone && matchesLocation && matchesExpMin && matchesExpMax;
    });

    const sorted = [...filtered];
    switch (sortBy) {
      case 'rank': sorted.sort((a, b) => (b.rank || 0) - (a.rank || 0)); break;
      case 'name': sorted.sort((a, b) => a.name.localeCompare(b.name)); break;
      case 'score': sorted.sort((a, b) => b.matchScore - a.matchScore); break;
      case 'experience':
        sorted.sort((a, b) => (parseFloat(a.experience || '0') || 0) - (parseFloat(b.experience || '0') || 0));
        break;
    }
    return sorted;
  }, [candidates, searchQuery, filterThreshold, filterPhone, filterLocation, filterExperienceMin, filterExperienceMax, sortBy]);

  const toggleSelect = (resumeId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(resumeId)) next.delete(resumeId);
      else next.add(resumeId);
      return next;
    });
  };

  const toggleAll = () => {
    if (filteredCandidates.every(c => selectedIds.has(c.resumeId))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredCandidates.map((c) => c.resumeId)));
    }
  };

  const unscoredCount = candidates.filter((c) => !scoredResumeIds.has(c.resumeId)).length;
  const selectedCandidates = candidates.filter((c) => selectedIds.has(c.resumeId));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 text-gray-600 animate-spin" />
          <p className="text-gray-500 text-sm">Loading AI match results...</p>
        </div>
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Brain className="w-12 h-12 text-gray-300 mb-3" />
        <h3 className="text-base font-medium text-gray-700 mb-2">No AI Talent Match Results</h3>
        <p className="text-sm text-gray-500 max-w-sm">
          Run an AI Talent Match session to find the best candidates for this role.
        </p>
        {canRunAiMatch && (
          <button
            onClick={onRunMatch}
            className="mt-4 px-4 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg text-sm shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            Run AI Match
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search & Filters */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 space-y-3">
        {/* Row 1: Search + Match filter + count + action buttons */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search candidates..."
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-xs sm:text-sm text-black placeholder:text-gray-400"
            />
          </div>
          <select
            value={filterThreshold}
            onChange={(e) => setFilterThreshold(Number(e.target.value))}
            className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white text-xs sm:text-sm text-black"
          >
            <option value={0}>All Matches</option>
            <option value={50}>50%+ Match</option>
            <option value={70}>70%+ Match</option>
            <option value={85}>85%+ Match</option>
          </select>
          <div className="text-xs sm:text-sm text-gray-700 bg-gray-100 px-3 py-2 rounded-lg font-medium border border-gray-200">
            {filteredCandidates.length} candidates
          </div>
          {selectedIds.size > 0 && (
            <button
              onClick={() => onScoreSelected(selectedCandidates)}
              className="px-3 sm:px-4 py-2 bg-brand-orange hover:bg-brand-orange-deep text-white rounded-lg text-xs sm:text-sm shadow-md shadow-brand-orange/25 ring-1 ring-white/10 transition-colors flex items-center gap-2 font-medium"
            >
              <Target className="w-3 h-3 sm:w-4 sm:h-4" />
              Score ({selectedIds.size})
            </button>
          )}
          {canRunAiMatch && (
            <button
              onClick={onRunMatch}
              className="px-3 sm:px-4 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg text-xs sm:text-sm shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors flex items-center gap-2 font-medium"
            >
              <Sparkles className="w-3 h-3 sm:w-4 sm:h-4" />
              Run AI Match
            </button>
          )}
        </div>

        {/* Row 2: Additional filters */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 sm:gap-3">
          <input
            type="text"
            value={filterPhone}
            onChange={(e) => setFilterPhone(e.target.value)}
            placeholder="Filter by phone..."
            className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-xs sm:text-sm text-black placeholder:text-gray-400"
          />
          <input
            type="text"
            value={filterLocation}
            onChange={(e) => setFilterLocation(e.target.value)}
            placeholder="Filter by location..."
            className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-xs sm:text-sm text-black placeholder:text-gray-400"
          />
          <input
            type="number"
            value={filterExperienceMin}
            onChange={(e) => setFilterExperienceMin(e.target.value === '' ? '' : Number(e.target.value))}
            placeholder="Min exp"
            className="w-full sm:w-28 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-xs sm:text-sm text-black placeholder:text-gray-400"
          />
          <input
            type="number"
            value={filterExperienceMax}
            onChange={(e) => setFilterExperienceMax(e.target.value === '' ? '' : Number(e.target.value))}
            placeholder="Max exp"
            className="w-full sm:w-28 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-xs sm:text-sm text-black placeholder:text-gray-400"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="col-span-2 sm:col-span-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white text-xs sm:text-sm text-black"
          >
            <option value="rank">Sort by Rating</option>
            <option value="name">Sort by Name</option>
            <option value="score">Sort by Score</option>
            <option value="experience">Sort by Experience</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={filteredCandidates.length > 0 && filteredCandidates.every(c => selectedIds.has(c.resumeId))}
                    onChange={toggleAll}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Match Rating</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Candidate Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Skills</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Experience</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Uploaded By</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Uploaded Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Attachments</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Scored Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredCandidates.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-12 text-center text-gray-500 text-sm">
                    No candidates match the current filters.
                  </td>
                </tr>
              ) : (
                filteredCandidates.map((candidate, idx) => {
                  const isScored = scoredResumeIds.has(candidate.resumeId);
                  const score = candidate.matchScore;
                  const scoreColor = score >= 70 ? 'bg-green-500' : score >= 45 ? 'bg-yellow-500' : 'bg-red-400';
                  const uploadDate = candidate.uploadDate ? formatISTDate(candidate.uploadDate) : '—';

                  return (
                    <tr
                      key={candidate.resumeId}
                      className={`hover:bg-gray-50 transition-colors cursor-pointer ${selectedIds.has(candidate.resumeId) ? 'bg-blue-50' : ''}`}
                      onClick={() => {
                        if (onViewCandidate) {
                          try {
                            sessionStorage.setItem('resumeNavList', JSON.stringify(filteredCandidates.map((c) => c.resumeId)));
                            sessionStorage.setItem('resumeNavSource', 'job-details');
                          } catch { /* ignore */ }
                          onViewCandidate(candidate);
                        }
                      }}
                    >
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(candidate.resumeId)}
                          onChange={() => toggleSelect(candidate.resumeId)}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className={`inline-flex items-center justify-center px-3 py-1 rounded-md font-bold text-sm ${
                          (candidate.rank || 0) >= 7 ? 'bg-green-100 text-green-800 border border-green-300' :
                          (candidate.rank || 0) >= 4 ? 'bg-yellow-100 text-yellow-800 border border-yellow-300' :
                          (candidate.rank || 0) >= 1 ? 'bg-gray-100 text-gray-700 border border-gray-300' :
                          'bg-gray-50 text-gray-400 border border-gray-200'
                        }`}>
                          {candidate.rank || '-'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-sm text-gray-700 font-medium flex-shrink-0">
                            {(candidate.name || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{candidate.name}</p>
                            {candidate.title && <p className="text-xs text-gray-500">{candidate.title}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{candidate.email || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{candidate.phone || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{candidate.location || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {candidate.skills.slice(0, 4).map((skill, i) => (
                            <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full border border-blue-200">{skill}</span>
                          ))}
                          {candidate.skills.length > 4 && (
                            <span className="px-2 py-0.5 text-xs text-blue-600">+{candidate.skills.length - 4} more</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{candidate.experience || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{candidate.uploadedByName || candidate.uploadedBy || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{uploadDate}</td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <button className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-50 text-gray-900 rounded-lg hover:bg-gray-100 transition-colors border border-gray-200 text-xs font-medium">
                          <Paperclip className="w-3.5 h-3.5" />
                          {candidate.attachmentCount ?? 1}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        {isScored ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                            <CheckCircle className="w-3 h-3" />
                            Scored
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-500 rounded-full text-xs font-medium">
                            <XCircle className="w-3 h-3" />
                            Not Scored
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
