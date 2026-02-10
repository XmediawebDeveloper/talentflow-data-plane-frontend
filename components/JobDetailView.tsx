'use client'

import { ArrowLeft, MapPin, Calendar, Target, Users, Briefcase, X, CheckCircle, Sparkles, UserPlus, ChevronDown, Upload, UserCheck, Mail, Phone, Building2, Clock, TrendingUp, Star, User as UserIcon, Ban, Archive, ArchiveRestore, History, FileText, Edit, XCircle, RefreshCw, Trash2, Eye, Download, Brain, Lock, BarChart } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Job } from '@/lib/types/types';
import type { User, Tenant } from '@/lib/types/tenant';
import ReactMarkdown from 'react-markdown';
import { jdService, JDVersion, JDUsageStatus } from '@/lib/services/jdService';
import ResumeUploadModal from './ResumeUploadModal';
import ResumeScoring from './ResumeScoring';
import JobApplicants from './JobApplicants';
import ScoredResumesTable from './ScoredResumesTable';
import InviteToAssessmentModal from './InviteToAssessmentModal';
import SelectSourceModal from './SelectSourceModal';
import AssessmentResultsTable from './AssessmentResultsTable';
import VersionHistoryModal from './VersionHistoryModal';
import JDVersionHistoryModal from './JDVersionHistoryModal';
import ResumeDetailView from './ResumeDetailView';
import CandidateScoringDetailPage from './CandidateScoringDetailPage';
import { Resume } from '@/lib/types/types';
import { scoringService } from '@/lib/services/scoringService';
import { assessmentService } from '@/lib/services/assessmentService';
import AITalentMatchProgressPanel from './AITalentMatchProgressPanel';
import TrackInvitesModal from './TrackInvitesModal';
import { toast } from 'sonner';

// Helper function to format UTC date to IST
const formatToIST = (dateString: string): string => {
  const utcDate = new Date(dateString);
  // Add 5 hours 30 minutes (IST offset)
  const istTime = utcDate.getTime() + (5.5 * 60 * 60 * 1000);
  const istDate = new Date(istTime);

  const day = istDate.getUTCDate();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[istDate.getUTCMonth()];
  const year = istDate.getUTCFullYear();
  const hours = istDate.getUTCHours();
  const minutes = istDate.getUTCMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'pm' : 'am';
  const hour12 = hours % 12 || 12;

  return `${day} ${month} ${year}, ${hour12.toString().padStart(2, '0')}:${minutes} ${ampm}`;
};

// Helper function to format an already-IST datetime (no offset needed)
const formatISTDateTime = (dateString: string): string => {
  const date = new Date(dateString);

  const day = date.getDate();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'pm' : 'am';
  const hour12 = hours % 12 || 12;

  return `${day} ${month} ${year}, ${hour12.toString().padStart(2, '0')}:${minutes} ${ampm}`;
};

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
          w-full px-4 py-2.5 text-sm rounded-md transition-all shadow-sm text-left flex items-center gap-2
          ${disabled
            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
            : className || 'bg-gray-700 text-white hover:bg-gray-800'
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
        <div className="absolute left-0 top-full mt-2 px-3 py-2 bg-gray-900 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
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
}

export default function JobDetailView({ job, onBack, onEdit, resumes = [], onScoreResumes, onNavigateToAITalentMatch, onDisable, onEnable, onArchive, onUnarchive, onDelete, onViewAssessmentResult, onRepublish, isTenantAdmin = false, user, tenant }: JobDetailViewProps) {
  const router = useRouter();

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

  // Fetch assessment results on component mount
  useEffect(() => {
    if (job.id) {
      fetchAssessmentResults();
    }
  }, [job.id]);


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
      const response = await jdService.getScoredResumes(job.id, { page_size: 100 });
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
          candidateName: item.candidate_name || 'Unknown',
          email: item.candidate_email || '',
          phone: item.phone || '',
          matchStatus: matchStatus,
          scorePercentage: Math.round(item.overall_score || 0),
          scoredDate: item.created_at || new Date().toISOString(),
          scoredBy: item.scored_by || item.scored_by_name || 'System',
          experience: item.experience_years ? `${item.experience_years} years` : undefined,
          education: item.education,
          certifications: item.certifications || [],
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
                score: Math.round(result.hr_score * 10),
                maxScore: 100,
                passFail: result.hr_score >= 7 ? 'Pass' : 'Fail'
              });
            }
            if (result.technical_score !== null && result.technical_score !== undefined) {
              roundScores.push({
                roundName: 'Technical',
                score: Math.round(result.technical_score * 10),
                maxScore: 100,
                passFail: result.technical_score >= 7 ? 'Pass' : 'Fail'
              });
            }
            if (result.coding_score !== null && result.coding_score !== undefined) {
              roundScores.push({
                roundName: 'Coding',
                score: Math.round(result.coding_score * 10),
                maxScore: 100,
                passFail: result.coding_score >= 7 ? 'Pass' : 'Fail'
              });
            }

            allResults.push({
              id: result.id,
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
                ? new Date(result.completed_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                : 'In Progress',
              completionTime: completionTime,
              aiSummary: result.ai_evaluation?.summary || 'Assessment completed.',
              roundScores: roundScores,
              invitedDate: result.started_at
                ? new Date(result.started_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                : 'N/A',
              invitedBy: result.invite_source || 'System',
              status: result.status || (result.completed_at ? 'completed' : 'in_progress'),
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

  const [activeTab, setActiveTab] = useState<'overview' | 'scored-resumes' | 'assessment-results'>('overview');

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
    // Navigate to results page
    if (onNavigateToAITalentMatch) {
      sessionStorage.setItem('showResultsOnly', 'true');
      onNavigateToAITalentMatch(job.id);
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
    return (
      <CandidateScoringDetailPage
        resume={viewingScoredResume}
        jobTitle={job.title}
        jobId={job.id}
        onBack={() => setViewingScoredResume(null)}
      />
    );
  }

  return (
    <main className="flex-1 p-8 overflow-y-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Jobs
        </button>

        {/* Job Details Card */}
        <div className="bg-white rounded-lg shadow-sm border-2 border-blue-200 p-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              {/* Row 1: JD ID + Job Title + Status */}
              <div className="flex items-center gap-3 mb-3">
                {job.job_id && (
                  <span className="inline-flex items-center px-2.5 py-1 bg-gray-100 text-gray-600 rounded-md text-sm font-medium">
                    {job.job_id}
                  </span>
                )}
                <h1 className="font-bold text-gray-900">{job.title}</h1>
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm border ${getStatusBadgeClass(getDisplayStatus(job.status, job.currentVersion))}`}>
                  {getDisplayStatus(job.status, job.currentVersion)}
                </span>
              </div>

              {/* Row 2: Location + Education + Employment Type + Work Mode + Posted Date + Posted By + Version */}
              <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
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

                {/* Separator before Posted Info */}
                {(job.location || job.education || job.employmentType || job.workMode) && (
                  <span className="text-gray-300">•</span>
                )}

                {/* Posted Date with Time */}
                <span>
                  Posted {job.postedDate ? new Date(new Date(job.postedDate).getTime() + 19800000).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : 'N/A'}
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
                    title="View version history"
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
            {/* AI Talent Match Button - COMMENTED OUT */}
            {false && (job.status !== 'Disabled' ? (
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
                title="AI Talent Match is not available for disabled JDs"
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

            {/* Action Buttons - Only for Published jobs */}
            {job.status === 'Published' && (
              <div className="flex items-center gap-2">
                {/* JD13: Edit Button - COMMENTED OUT */}
                {false && onEdit && (
                  <button
                    onClick={handleEdit}
                    disabled={job.usageStatus?.is_used}
                    className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 ${
                      job.usageStatus?.is_used
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-gray-700 text-white hover:bg-gray-800'
                    }`}
                    title={job.usageStatus?.is_used ? job.usageStatus.edit_restriction_reason : 'Edit this job description'}
                  >
                    <Edit className="w-4 h-4" />
                    <span className="font-medium">Edit & Republish</span>
                  </button>
                )}
                {/* Archive button - COMMENTED OUT */}
                {false && onArchive && (
                  <button
                    onClick={handleArchive}
                    className="px-4 py-2 bg-gray-100 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-200 transition-all flex items-center gap-2"
                  >
                    <Archive className="w-4 h-4" />
                    <span className="font-medium">Archive</span>
                  </button>
                )}
                {/* JD15: Disable button - COMMENTED OUT */}
                {false && onDisable && isTenantAdmin && (
                  <button
                    onClick={handleDisable}
                    className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-all flex items-center gap-2"
                    title="Disable this JD (Owner only)"
                  >
                    <Ban className="w-4 h-4" />
                    <span className="font-medium">Disable</span>
                  </button>
                )}
                {/* Delete button - COMMENTED OUT */}
                {false && onDelete && (
                  <button
                    onClick={handleDelete}
                    className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-all"
                    title="Delete Job"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
              </div>
            )}

            {/* JD15: Action Buttons - For Disabled jobs */}
            {job.status === 'Disabled' && (
              <div className="flex items-center gap-2">
                {/* JD15: Enable button - COMMENTED OUT */}
                {false && onEnable && isTenantAdmin && (
                  <button
                    onClick={() => onEnable(job)}
                    className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-all flex items-center gap-2"
                    title="Re-enable this JD (Owner only)"
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span className="font-medium">Re-enable JD</span>
                  </button>
                )}
                {/* Archive button - COMMENTED OUT */}
                {false && onArchive && (
                  <button
                    onClick={handleArchive}
                    className="px-4 py-2 bg-gray-100 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-200 transition-all flex items-center gap-2"
                  >
                    <Archive className="w-4 h-4" />
                    <span className="font-medium">Archive</span>
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
                    title="Delete Job"
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
      <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center border-b border-gray-200">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-6 py-4 text-sm transition-colors relative ${
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
          <button
            onClick={() => setActiveTab('scored-resumes')}
            className={`px-6 py-4 text-sm transition-colors relative flex items-center gap-2 ${
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
          <button
            onClick={() => setActiveTab('assessment-results')}
            className={`px-6 py-4 text-sm transition-colors relative flex items-center gap-2 ${
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
        </div>
      </div>

      {/* Overview Tab Content */}
      {activeTab === 'overview' && (
      <div className="grid grid-cols-12 gap-4">
        {/* Left Column - Job Details */}
        <div className="col-span-10 space-y-6">
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
            <div className="p-8">
              <div className="space-y-8">
                {/* Job Description - Actual Content */}
                {job.description ? (
                  <div>
                    <h2 className="text-base font-semibold text-gray-900 mb-4">
                      Job Description
                    </h2>
                    <div className="h-px bg-gray-200 mb-4"></div>
                    <div className="markdown-content prose prose-sm max-w-none text-gray-700">
                      <ReactMarkdown>{job.description
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
          <div className="grid grid-cols-2 gap-4">
            {/* Internal Recruiter Notes */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-gray-900 mb-4">Internal Recruiter Notes</h3>
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

            {/* Assessment Guidance */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-gray-900 mb-4">Assessment Guidance</h3>
              <div className="text-sm text-gray-600">
                {job.assessmentGuidance ? (
                  <p className="whitespace-pre-wrap">{job.assessmentGuidance}</p>
                ) : (
                  <p className="text-gray-500 italic">No assessment guidance provided</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Actions & Activity */}
        <div className="col-span-2 space-y-6">
          {/* Quick Actions */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-gray-900 mb-4">Quick Actions</h3>
            <div className="space-y-2">
              {/* 1. Invite for Assessment - Permission + Feature flag + JD Status */}
              {permissions.canCreateAssessments && (
                <QuickActionButton
                  icon={<Mail className="w-4 h-4" />}
                  label="Invite for Assessment"
                  onClick={() => setShowInviteToAssessmentModal(true)}
                  disabled={!features.assessment || job.status === 'Disabled'}
                  disabledTooltip={
                    !features.assessment
                      ? 'Assessments module is not enabled for your organization'
                      : 'Assessments are not available for disabled JDs'
                  }
                />
              )}

              {/* 2. AI Talent Match - Permission + Feature flag + JD Status */}
              {permissions.canRunAiMatch && (
                <QuickActionButton
                  icon={<Brain className="w-4 h-4" />}
                  label="AI Talent Match"
                  onClick={() => {
                    if (onNavigateToAITalentMatch) {
                      onNavigateToAITalentMatch(job.id);
                    }
                  }}
                  disabled={!features.ai_talent_match || job.status === 'Disabled'}
                  disabledTooltip={
                    !features.ai_talent_match
                      ? 'AI Match feature is not enabled for your organization'
                      : 'AI Talent Match is not available for disabled JDs'
                  }
                />
              )}

              {/* 3. View JD History - Permission (always available if user can view JD) */}
              {permissions.canReadJD && (
                <QuickActionButton
                  icon={<History className="w-4 h-4" />}
                  label="View JD History"
                  onClick={() => setShowJDHistory(true)}
                />
              )}

              {/* 4. Assessment Status - Permission + Feature flag */}
              {permissions.canViewAssessments && (
                <QuickActionButton
                  icon={<BarChart className="w-4 h-4" />}
                  label="Assessment Status"
                  onClick={() => setShowTrackInvitesModal(true)}
                  disabled={!features.assessment}
                  disabledTooltip="Assessments module is not enabled"
                />
              )}

              {/* 5. Add Applicants - Permission + Feature flag + JD Status */}
              {permissions.canUploadResumes && features.resume_upload && (
                <QuickActionButton
                  icon={<UserPlus className="w-4 h-4" />}
                  label="Add Applicants"
                  onClick={() => setShowSelectSourceModal(true)}
                  disabled={job.status === 'Disabled'}
                  disabledTooltip="Cannot add applicants to disabled JDs"
                />
              )}
            </div>
          </div>

          {/* Recent Activity - Show last 5 activities */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-gray-900 mb-4">Recent Activity</h3>
            <div className="space-y-4">
              {/* Activity 1: Resume scoring */}
              {scoredResumesStats.total > 0 && (
                <div className="flex gap-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-1.5 flex-shrink-0"></div>
                  <div>
                    <div className="text-sm text-gray-900">{scoredResumesStats.total} resume(s) scored</div>
                    <div className="text-xs text-gray-500">Resume scoring completed</div>
                  </div>
                </div>
              )}
              {/* Activity 2: Exact matches found */}
              {scoredResumesStats.exactMatch > 0 && (
                <div className="flex gap-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full mt-1.5 flex-shrink-0"></div>
                  <div>
                    <div className="text-sm text-gray-900">{scoredResumesStats.exactMatch} exact match(es) found</div>
                    <div className="text-xs text-gray-500">High-quality candidates identified</div>
                  </div>
                </div>
              )}
              {/* Activity 3: Partial matches found */}
              {scoredResumesStats.partialMatch > 0 && (
                <div className="flex gap-3">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full mt-1.5 flex-shrink-0"></div>
                  <div>
                    <div className="text-sm text-gray-900">{scoredResumesStats.partialMatch} partial match(es) found</div>
                    <div className="text-xs text-gray-500">Candidates with potential identified</div>
                  </div>
                </div>
              )}
              {/* Activity 4: JD version update */}
              {job.currentVersion && job.currentVersion > 1 && (
                <div className="flex gap-3">
                  <div className="w-2 h-2 bg-purple-500 rounded-full mt-1.5 flex-shrink-0"></div>
                  <div>
                    <div className="text-sm text-gray-900">JD updated to version {job.currentVersion}.0</div>
                    <div className="text-xs text-gray-500">Job description republished</div>
                  </div>
                </div>
              )}
              {/* Activity 5: Job published */}
              {job.status === 'Published' && job.postedDate && (
                <div className="flex gap-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full mt-1.5 flex-shrink-0"></div>
                  <div>
                    <div className="text-sm text-gray-900">Job published by {job.postedBy || 'System'}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(new Date(job.postedDate).getTime() + 19800000).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}
                    </div>
                  </div>
                </div>
              )}
              {/* No activity fallback */}
              {scoredResumesStats.total === 0 && job.status !== 'Published' && !job.currentVersion && (
                <div className="text-sm text-gray-500 italic">No recent activity</div>
              )}
            </div>
          </div>

          {/* Applicant Statistics */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-gray-900 mb-4">Applicant Statistics</h3>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-gray-600">Total Scored Resumes</span>
                  <span className="text-gray-900">{scoredResumesStats.total}</span>
                </div>
                <div className="bg-gray-200 rounded-full h-2">
                  <div className="bg-blue-600 h-2 rounded-full" style={{ width: scoredResumesStats.total > 0 ? '100%' : '0%' }}></div>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-gray-600">Exact Match</span>
                  <span className="text-gray-900">{scoredResumesStats.exactMatch}</span>
                </div>
                <div className="bg-gray-200 rounded-full h-2">
                  <div className="bg-green-600 h-2 rounded-full" style={{ width: `${scoredResumesStats.total > 0 ? (scoredResumesStats.exactMatch / scoredResumesStats.total * 100) : 0}%` }}></div>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-gray-600">Partial Match</span>
                  <span className="text-gray-900">{scoredResumesStats.partialMatch}</span>
                </div>
                <div className="bg-gray-200 rounded-full h-2">
                  <div className="bg-yellow-600 h-2 rounded-full" style={{ width: `${scoredResumesStats.total > 0 ? (scoredResumesStats.partialMatch / scoredResumesStats.total * 100) : 0}%` }}></div>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-gray-600">No Match</span>
                  <span className="text-gray-900">{scoredResumesStats.noMatch}</span>
                </div>
                <div className="bg-gray-200 rounded-full h-2">
                  <div className="bg-red-600 h-2 rounded-full" style={{ width: `${scoredResumesStats.total > 0 ? (scoredResumesStats.noMatch / scoredResumesStats.total * 100) : 0}%` }}></div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      )}

      {/* Scored Resumes Tab Content */}
      {activeTab === 'scored-resumes' && (
        <div className="mt-0">
          {loadingScoredResumes ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-gray-600">Loading scored resumes...</span>
            </div>
          ) : scoredResumes.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
              <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg">No scored resumes yet</p>
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
            onViewResultDetail={(result) => {
              if (onViewAssessmentResult) {
                onViewAssessmentResult(result, job.title);
              }
            }}
          />
        </div>
      )}

      {/* Resume Upload Modal */}
      {showUploadModal && (
        <ResumeUploadModal
          jobTitle={job.title}
          onClose={() => setShowUploadModal(false)}
          onSubmit={handleResumeUpload}
        />
      )}

      {/* Invite to Assessment Modal */}
      {showInviteToAssessmentModal && (
        <InviteToAssessmentModal
          jobTitle={job.title}
          jobId={job.id}
          onClose={() => setShowInviteToAssessmentModal(false)}
        />
      )}

      {/* Select Source Modal */}
      {showSelectSourceModal && (
        <SelectSourceModal
          jobTitle={job.title}
          jobId={job.id}
          onClose={() => setShowSelectSourceModal(false)}
          onScoringComplete={() => {
            // Refresh scored resumes after scoring
            fetchScoredResumes();
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-hidden">
            {/* Header */}
            <div className="bg-gray-800 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {selectedHistoryVersion ? (
                  <button
                    onClick={() => setSelectedHistoryVersion(null)}
                    className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center hover:bg-white/30 transition-colors"
                  >
                    <ArrowLeft className="w-5 h-5 text-white" />
                  </button>
                ) : (
                  <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                    <History className="w-6 h-6 text-white" />
                  </div>
                )}
                <div>
                  <h2 className="text-xl font-semibold text-white">
                    {selectedHistoryVersion ? `Version ${selectedHistoryVersion.version.version_number}.0` : 'Job Description History'}
                  </h2>
                  <p className="text-sm text-gray-300">{job.title}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowJDHistory(false);
                  setSelectedHistoryVersion(null);
                }}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/20 transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(85vh-140px)]">
              {loadingHistory ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600"></div>
                  <span className="ml-3 text-gray-600">Loading history...</span>
                </div>
              ) : selectedHistoryVersion ? (
                /* Version Detail View */
                <div>
                  {/* Version Info Bar with Download Button */}
                  <div className="flex items-center justify-between mb-6 p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-4">
                      <span className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-sm font-semibold">
                        v{selectedHistoryVersion.version.version_number}.0
                      </span>
                      <div className="text-sm text-gray-600">
                        <span className="flex items-center gap-1">
                          <UserIcon className="w-4 h-4" />
                          {selectedHistoryVersion.performedBy}
                        </span>
                      </div>
                      <span className="text-sm text-gray-500">{selectedHistoryVersion.timestamp}</span>
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
                            <p style="color: #6b7280; font-size: 14px; margin-bottom: 24px;">Version ${version}.0 | Generated on ${new Date().toLocaleDateString()}</p>
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

                  {/* Job Title */}
                  <h3 className="text-xl font-semibold text-gray-900 mb-6">{selectedHistoryVersion.version.title}</h3>

                  {/* Job Description with proper markdown rendering and blue highlighting for new content */}
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    {(() => {
                      const currentIndex = jdHistory.findIndex((h: any) => h.id === selectedHistoryVersion.id);
                      const prevVersion = currentIndex < jdHistory.length - 1 ? jdHistory[currentIndex + 1] : null;
                      const isV1 = selectedHistoryVersion.version.version_number === 1;
                      const currentDesc = selectedHistoryVersion.version.description || '';
                      const prevDesc = prevVersion?.version?.description || '';

                      // Helper function to convert a single line of markdown to HTML
                      const convertLineToHtml = (line: string): string => {
                        let html = line;
                        // Convert headings
                        if (html.match(/^### /)) {
                          html = html.replace(/^### (.*)$/, '<h3 class="text-base font-semibold text-gray-900 mt-4 mb-2">$1</h3>');
                        } else if (html.match(/^## /)) {
                          html = html.replace(/^## (.*)$/, '<h2 class="text-lg font-semibold text-gray-900 mt-5 mb-3">$1</h2>');
                        } else if (html.match(/^# /)) {
                          html = html.replace(/^# (.*)$/, '<h1 class="text-xl font-bold text-gray-900 mt-6 mb-3">$1</h1>');
                        }
                        // Convert bold
                        html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-gray-900">$1</strong>');
                        // Convert list items
                        if (html.match(/^- /)) {
                          html = html.replace(/^- (.*)$/, '<li class="ml-4 text-gray-700 list-disc">$1</li>');
                        }
                        return html;
                      };

                      // For v1 or no changes, just render normally
                      if (isV1 || !prevDesc) {
                        return (
                          <div className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-p:text-gray-700 prose-li:text-gray-700 prose-strong:text-gray-900">
                            <ReactMarkdown>{currentDesc}</ReactMarkdown>
                          </div>
                        );
                      }

                      // For v2+, compute diff and highlight new paragraphs/sections
                      const prevLinesSet = new Set(prevDesc.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0));

                      // Process each line: convert markdown to HTML first, then wrap in blue if new
                      const processedLines = currentDesc.split('\n').map((line: string) => {
                        const trimmedLine = line.trim();
                        const isNewLine = trimmedLine.length > 0 && !prevLinesSet.has(trimmedLine);

                        // Convert markdown to HTML first
                        let htmlLine = convertLineToHtml(line);

                        // If it's a new line, wrap the content in blue highlight
                        if (isNewLine) {
                          // Check if it's a heading or list item (already wrapped in tags)
                          if (htmlLine.match(/^<(h[1-3]|li)/)) {
                            // Add blue background class to the existing tag
                            htmlLine = htmlLine.replace(/^<(h[1-3]|li)([^>]*)class="([^"]*)"/, '<$1$2class="$3 bg-blue-100 text-blue-800 px-2 rounded"');
                          } else if (trimmedLine.length > 0) {
                            // Regular text - wrap in span
                            htmlLine = `<span class="bg-blue-100 text-blue-800 px-1 rounded">${htmlLine}</span>`;
                          }
                        }

                        return htmlLine;
                      });

                      // Join lines and handle paragraph breaks
                      let finalHtml = processedLines.join('<br/>');
                      // Clean up multiple <br/> tags (paragraph breaks)
                      finalHtml = finalHtml.replace(/(<br\/>){2,}/g, '</p><p class="my-3 text-gray-700">');
                      // Remove <br/> after block elements
                      finalHtml = finalHtml.replace(/(<\/h[1-3]>)<br\/>/g, '$1');
                      finalHtml = finalHtml.replace(/(<\/li>)<br\/>/g, '$1');

                      return (
                        <div
                          className="prose prose-sm max-w-none text-gray-700 leading-relaxed"
                          dangerouslySetInnerHTML={{ __html: finalHtml }}
                        />
                      );
                    })()}
                  </div>
                </div>
              ) : jdHistory.length === 0 ? (
                <div className="text-center py-12">
                  <History className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 text-lg">No version history available</p>
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
                <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200"></div>

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
                      <div key={item.id} className="relative flex gap-6">
                        {/* Timeline Icon */}
                        <div className="relative flex-shrink-0">
                          <div className={`w-12 h-12 rounded-full border-4 border-white ${colorClasses} flex items-center justify-center shadow-lg z-10 relative`}>
                            <IconComponent className="w-5 h-5 text-white" />
                          </div>
                          {isFirst && (
                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-gray-700 rounded-full border-2 border-white"></div>
                          )}
                        </div>

                        {/* Content Card - Now Clickable */}
                        <div className={`flex-1 pb-6 ${!isLast ? '' : 'pb-0'}`}>
                          <button
                            type="button"
                            onClick={() => setSelectedHistoryVersion(item)}
                            className={`w-full text-left rounded-lg border-2 ${bgColorClasses} p-5 shadow-sm hover:shadow-md transition-all`}
                          >
                            {/* Action Header */}
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <h3 className={`font-semibold ${textColorClasses} text-lg mb-1`}>
                                  {item.action}
                                </h3>
                                <p className="text-sm text-gray-700 mb-2">
                                  {item.description}
                                </p>
                              </div>
                              <span className="text-xs bg-gray-200 text-gray-800 px-2 py-1 rounded-full font-medium whitespace-nowrap">
                                {item.date}
                              </span>
                            </div>

                            {/* Performed By Info */}
                            <div className="flex items-center gap-3 pt-3 border-t border-gray-200">
                              <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center">
                                <User className="w-4 h-4 text-white" />
                              </div>
                              <div className="flex-1">
                                <p className="text-sm font-medium text-gray-900">{item.performedBy}</p>
                                <p className="text-xs text-gray-600">{item.performedByRole}</p>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-gray-500">
                                <Clock className="w-3.5 h-3.5" />
                                {item.timestamp}
                              </div>
                            </div>

                            {/* Click hint */}
                            <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-center gap-2 text-gray-500">
                              <Eye className="w-4 h-4" />
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
            <div className="bg-gray-50 px-6 py-4 flex items-center justify-between border-t border-gray-200">
              <p className="text-sm text-gray-600">
                {selectedHistoryVersion ? `Viewing version ${selectedHistoryVersion.version.version_number}.0` : 'Showing complete history from creation to present'}
              </p>
              <button
                onClick={() => {
                  setShowJDHistory(false);
                  setSelectedHistoryVersion(null);
                }}
                className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-all shadow-sm"
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
    </main>
  );
}
