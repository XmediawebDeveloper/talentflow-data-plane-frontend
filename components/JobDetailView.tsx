'use client'

import { ArrowLeft, MapPin, Calendar, Target, Users, Briefcase, X, CheckCircle, Sparkles, UserPlus, ChevronDown, Upload, UserCheck, Mail, Phone, Building2, Clock, TrendingUp, Star, User, Ban, Archive, History, FileText, Edit, XCircle, RefreshCw, Trash2 } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { Job } from '@/lib/types/types';
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
import AITalentMatchProgressPanel from './AITalentMatchProgressPanel';
import { toast } from 'sonner';

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
  onDelete?: (job: Job) => void; // Delete job
  onViewAssessmentResult?: (assessmentResult: any, jobTitle: string) => void; // Navigate to assessment result detail
  onRepublish?: (job: Job) => void; // JD13: Republish job after editing
  isTenantAdmin?: boolean; // JD15: Whether user is Tenant Admin (for disable/enable buttons)
}

export default function JobDetailView({ job, onBack, onEdit, resumes = [], onScoreResumes, onNavigateToAITalentMatch, onDisable, onEnable, onArchive, onDelete, onViewAssessmentResult, onRepublish, isTenantAdmin = false }: JobDetailViewProps) {
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


  const fetchJDHistory = async () => {
    setLoadingHistory(true);
    try {
      const versionData = await jdService.getVersionHistory(job.id);

      // Convert version history to JD history events
      const historyEvents = versionData.versions.map((version, index) => {
        const isLatest = index === 0;
        const publishDate = new Date(version.published_at);

        return {
          id: version.id,
          action: `Published (v${version.version_number}.0)`,
          description: isLatest
            ? 'Current published version'
            : `Version ${version.version_number} published`,
          performedBy: 'User', // Would need user service to get actual name
          performedByRole: 'Recruiter',
          timestamp: publishDate.toLocaleString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          }),
          date: publishDate.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }),
          icon: 'check-circle',
          color: 'green',
          version: version,
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
      const response = await jdService.getScoredResumes(job.id, { page_size: 100 });

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
          scoredBy: item.scored_by_name || 'System',
          experience: item.experience_years ? `${item.experience_years} years` : undefined,
          education: item.education,
          certifications: item.certifications || [],
          aiSummary: item.ai_summary,
          strengths: item.strengths || [],
          gaps: item.gaps || [],
          title: item.current_title,
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
      setScoredResumesStats({
        total: response.total || convertedResumes.length,
        exactMatch: response.excellent_count || convertedResumes.filter((r: any) => r.matchStatus === 'Exact Match').length,
        partialMatch: response.partial_count || convertedResumes.filter((r: any) => r.matchStatus === 'Partial Match').length,
        noMatch: response.no_match_count || convertedResumes.filter((r: any) => r.matchStatus === 'No Match').length,
      });
    } catch (error) {
      console.error('Failed to fetch scored resumes:', error);
      setScoredResumes([]);
      setScoredResumesStats({ total: 0, exactMatch: 0, partialMatch: 0, noMatch: 0 });
    } finally {
      setLoadingScoredResumes(false);
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

  // Mock assessment results data
  const mockAssessmentResults = [
    {
      id: 'ar-1',
      candidateName: 'Sarah Johnson',
      email: 'sarah.johnson@email.com',
      phone: '+1 (555) 123-4567',
      assessmentName: 'Senior Software Engineer Assessment',
      totalScore: 92,
      maxScore: 100,
      scorePercentage: 92,
      passFail: 'Pass' as const,
      completedDate: '2025-12-01',
      completionTime: '45',
      aiSummary: 'Excellent performance across all assessment rounds. Strong technical knowledge and problem-solving skills demonstrated. Candidate shows deep understanding of system design principles and best coding practices.',
      roundScores: [
        { roundName: 'Technical Round 1', score: 90, maxScore: 100, passFail: 'Pass' as const },
        { roundName: 'Technical Round 2', score: 95, maxScore: 100, passFail: 'Pass' as const },
        { roundName: 'System Design', score: 91, maxScore: 100, passFail: 'Pass' as const }
      ],
      invitedDate: '2025-11-28',
      invitedBy: 'Alex Morgan'
    },
    {
      id: 'ar-2',
      candidateName: 'Michael Chen',
      email: 'michael.chen@email.com',
      phone: '+1 (555) 234-5678',
      assessmentName: 'Senior Software Engineer Assessment',
      totalScore: 78,
      maxScore: 100,
      scorePercentage: 78,
      passFail: 'Pass' as const,
      completedDate: '2025-12-02',
      completionTime: '52',
      aiSummary: 'Good overall performance with particularly strong showing in system design. Some areas for improvement in advanced algorithms, but solid foundational knowledge and practical experience evident.',
      roundScores: [
        { roundName: 'Technical Round 1', score: 75, maxScore: 100, passFail: 'Pass' as const },
        { roundName: 'Technical Round 2', score: 72, maxScore: 100, passFail: 'Pass' as const },
        { roundName: 'System Design', score: 87, maxScore: 100, passFail: 'Pass' as const }
      ],
      invitedDate: '2025-11-29',
      invitedBy: 'Jessica Lee'
    },
    {
      id: 'ar-3',
      candidateName: 'Emily Rodriguez',
      email: 'emily.rodriguez@email.com',
      phone: '+1 (555) 345-6789',
      assessmentName: 'Senior Software Engineer Assessment',
      totalScore: 88,
      maxScore: 100,
      scorePercentage: 88,
      passFail: 'Pass' as const,
      completedDate: '2025-11-30',
      completionTime: '48',
      aiSummary: 'Strong technical competency demonstrated across all rounds. Excellent problem-solving approach with clear communication. Shows good understanding of scalability and performance optimization.',
      roundScores: [
        { roundName: 'Technical Round 1', score: 85, maxScore: 100, passFail: 'Pass' as const },
        { roundName: 'Technical Round 2', score: 90, maxScore: 100, passFail: 'Pass' as const },
        { roundName: 'System Design', score: 89, maxScore: 100, passFail: 'Pass' as const }
      ],
      invitedDate: '2025-11-27',
      invitedBy: 'Alex Morgan'
    },
    {
      id: 'ar-4',
      candidateName: 'David Kim',
      email: 'david.kim@email.com',
      phone: '+1 (555) 456-7890',
      assessmentName: 'Senior Software Engineer Assessment',
      totalScore: 42,
      maxScore: 100,
      scorePercentage: 42,
      passFail: 'Fail' as const,
      completedDate: '2025-12-01',
      completionTime: '38',
      aiSummary: 'Performance below passing threshold. Gaps identified in advanced technical concepts and system design principles. Would benefit from additional training in core areas before reconsideration.',
      roundScores: [
        { roundName: 'Technical Round 1', score: 45, maxScore: 100, passFail: 'Fail' as const },
        { roundName: 'Technical Round 2', score: 40, maxScore: 100, passFail: 'Fail' as const },
        { roundName: 'System Design', score: 41, maxScore: 100, passFail: 'Fail' as const }
      ],
      invitedDate: '2025-11-29',
      invitedBy: 'Jessica Lee'
    },
    {
      id: 'ar-5',
      candidateName: 'Amanda White',
      email: 'amanda.white@email.com',
      phone: '+1 (555) 567-8901',
      assessmentName: 'Senior Software Engineer Assessment',
      totalScore: 95,
      maxScore: 100,
      scorePercentage: 95,
      passFail: 'Pass' as const,
      completedDate: '2025-11-29',
      completionTime: '42',
      aiSummary: 'Outstanding performance. Exceptional technical depth and breadth of knowledge. Demonstrates expert-level understanding of complex system architecture and advanced problem-solving capabilities.',
      roundScores: [
        { roundName: 'Technical Round 1', score: 96, maxScore: 100, passFail: 'Pass' as const },
        { roundName: 'Technical Round 2', score: 94, maxScore: 100, passFail: 'Pass' as const },
        { roundName: 'System Design', score: 95, maxScore: 100, passFail: 'Pass' as const }
      ],
      invitedDate: '2025-11-26',
      invitedBy: 'Alex Morgan'
    },
    {
      id: 'ar-6',
      candidateName: 'Robert Taylor',
      email: 'robert.taylor@email.com',
      phone: '+1 (555) 678-9012',
      assessmentName: 'Senior Software Engineer Assessment',
      totalScore: 55,
      maxScore: 100,
      scorePercentage: 55,
      passFail: 'Fail' as const,
      completedDate: '2025-12-02',
      completionTime: '35',
      aiSummary: 'Below expected level for senior role. Shows basic understanding but lacks depth in critical areas. Performance indicates need for more experience before attempting senior-level positions.',
      roundScores: [
        { roundName: 'Technical Round 1', score: 58, maxScore: 100, passFail: 'Fail' as const },
        { roundName: 'Technical Round 2', score: 52, maxScore: 100, passFail: 'Fail' as const },
        { roundName: 'System Design', score: 55, maxScore: 100, passFail: 'Fail' as const }
      ],
      invitedDate: '2025-11-30',
      invitedBy: 'Jessica Lee'
    }
  ];

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
              <div className="flex items-center gap-3 mb-3">
                <h1 className="text-gray-900">{job.title}</h1>
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm border ${getStatusBadgeClass(job.status)}`}>
                  {job.status}
                </span>
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-600 mb-4">
                {job.department && (
                  <div className="flex items-center gap-1">
                    <Briefcase className="w-4 h-4" />
                    {job.department}
                  </div>
                )}
                {job.location && (
                <div className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {job.location}
                </div>
                )}
                {job.experience && (
                  <div className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {job.experience}
                  </div>
                )}
              </div>

              {/* Job Meta Information */}
              <div className="flex items-center gap-6 pt-4 border-t border-gray-200">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Calendar className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Posted On</div>
                    <div className="text-sm text-gray-900">
                      {job.postedDate
                        ? new Date(job.postedDate).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true
                          })
                        : 'N/A'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                    <User className="w-4 h-4 text-purple-600" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Posted By</div>
                    <div className="flex items-center gap-2">
                      <div className="text-sm text-gray-900">{job.postedBy || 'Unknown'}</div>
                      <span className="text-gray-400">•</span>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-500">Version</span>
                        {job.currentVersion && job.currentVersion > 0 ? (
                          <button
                            onClick={() => setShowVersionHistory(true)}
                            className="text-sm text-blue-600 hover:text-blue-700 hover:underline font-medium"
                            title="View version history"
                          >
                            {job.currentVersion}.0
                          </button>
                        ) : (
                          <span className="text-sm text-gray-900 font-medium">1.0</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 ml-6">
            {/* AI Talent Match Button */}
            <button
              onClick={handleAITalentMatch}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-md hover:from-purple-700 hover:to-blue-700 transition-colors shadow-sm"
            >
              <Sparkles className="w-4 h-4" />
              AI Talent Match
            </button>

            {/* Add Applicants Dropdown */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setShowAddApplicantsMenu(!showAddApplicantsMenu)}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                Add Applicants
                <ChevronDown className="w-4 h-4" />
              </button>

              {/* Dropdown Menu */}
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
            </div>

            {/* JD13: Usage Status Info Banner */}
            {job.status === 'Published' && job.usageStatus?.is_used && (
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
                {/* JD13: Edit Button - Disabled when JD is used in modules */}
                {onEdit && (
                  <button
                    onClick={handleEdit}
                    disabled={job.usageStatus?.is_used}
                    className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 ${
                      job.usageStatus?.is_used
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                    title={job.usageStatus?.is_used ? job.usageStatus.edit_restriction_reason : 'Edit this job description'}
                  >
                    <Edit className="w-4 h-4" />
                    <span className="font-medium">Edit & Republish</span>
                  </button>
                )}
                {onArchive && (
                  <button
                    onClick={handleArchive}
                    className="px-4 py-2 bg-gray-100 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-200 transition-all flex items-center gap-2"
                  >
                    <Archive className="w-4 h-4" />
                    <span className="font-medium">Archive</span>
                  </button>
                )}
                {/* JD15: Disable button - Only visible to Tenant Admins */}
                {onDisable && isTenantAdmin && (
                  <button
                    onClick={handleDisable}
                    className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-all flex items-center gap-2"
                    title="Disable this JD (Tenant Admin only)"
                  >
                    <Ban className="w-4 h-4" />
                    <span className="font-medium">Disable</span>
                  </button>
                )}
                {onDelete && (
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
                {/* JD15: Enable button - Only visible to Tenant Admins */}
                {onEnable && isTenantAdmin && (
                  <button
                    onClick={() => onEnable(job)}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all flex items-center gap-2"
                    title="Re-enable this JD (Tenant Admin only)"
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span className="font-medium">Re-enable JD</span>
                  </button>
                )}
                {onArchive && (
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
              {mockAssessmentResults.length}
            </span>
            {activeTab === 'assessment-results' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"></div>
            )}
          </button>
        </div>
      </div>

      {/* Overview Tab Content */}
      {activeTab === 'overview' && (
      <div className="grid grid-cols-3 gap-6">
        {/* Left Column - Job Details */}
        <div className="col-span-2 space-y-6">
          {/* Complete Job Description */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            {/* JD Header */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100 px-8 py-6">
              <div className="flex items-start justify-between mb-2">
                <h1 className="text-2xl text-gray-900">{job.title}</h1>
                {/* Current Version Badge */}
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
                {job.experience && (
                  <div className="flex items-center gap-1.5">
                    <Briefcase className="w-4 h-4 text-blue-600" />
                    <span>{job.experience}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-blue-600" />
                  <span>Posted {job.daysActive} days ago</span>
                </div>
              </div>
            </div>

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
                      <ReactMarkdown>{job.description}</ReactMarkdown>
                    </div>
                  </div>
                ) : (
                  <div className="text-gray-500 italic text-center py-8">
                    No job description provided
                  </div>
                )}

                {/* Skills & Qualifications */}
                {((job.skills && job.skills.length > 0) || (job.niceToHaveSkills && job.niceToHaveSkills.length > 0)) && (
                  <div>
                    <h2 className="text-base font-semibold text-gray-900 mb-4">
                      Skills & Qualifications
                    </h2>
                    <div className="h-px bg-gray-200 mb-4"></div>

                    {/* Required Skills */}
                    {job.skills && job.skills.length > 0 && (
                      <div className="mb-5">
                        <h3 className="text-sm font-medium text-gray-900 mb-3">Required Skills</h3>
                        <ul className="space-y-2 ml-1">
                          {job.skills.map((skill, index) => (
                            <li key={index} className="flex items-start gap-2 text-sm text-gray-700">
                              <span className="text-gray-400 mt-0.5">•</span>
                              <span>{skill}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Preferred Skills */}
                    {job.niceToHaveSkills && job.niceToHaveSkills.length > 0 && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-900 mb-3">Preferred Skills</h3>
                        <ul className="space-y-2 ml-1">
                          {job.niceToHaveSkills.map((skill, index) => (
                            <li key={index} className="flex items-start gap-2 text-sm text-gray-700">
                              <span className="text-gray-400 mt-0.5">•</span>
                              <span>{skill}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Compensation */}
                {(job.salaryMin || job.salaryMax) && (
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

                {/* Job Details Grid */}
                <div>
                  <h2 className="text-base font-semibold text-gray-900 mb-4">
                    Job Details
                  </h2>
                  <div className="h-px bg-gray-200 mb-4"></div>
                  <div className="grid grid-cols-2 gap-4">
                    {job.department && (
                      <div className="bg-gray-50 rounded-lg p-4">
                        <div className="text-sm text-gray-500 mb-1">Department</div>
                        <div className="text-gray-900">{job.department}</div>
                      </div>
                    )}
                    {job.experience && (
                      <div className="bg-gray-50 rounded-lg p-4">
                        <div className="text-sm text-gray-500 mb-1">Experience Required</div>
                        <div className="text-gray-900">{job.experience}</div>
                      </div>
                    )}
                    {job.location && (
                      <div className="bg-gray-50 rounded-lg p-4">
                        <div className="text-sm text-gray-500 mb-1">Location</div>
                        <div className="text-gray-900">{job.location}</div>
                      </div>
                    )}
                    {job.employmentType && (
                      <div className="bg-gray-50 rounded-lg p-4">
                        <div className="text-sm text-gray-500 mb-1">Employment Type</div>
                        <div className="text-gray-900 capitalize">{job.employmentType}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Right Column - Actions & Activity */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-gray-900 mb-4">Quick Actions</h3>
            <div className="space-y-2">
              {/* Invite for Assessment */}
              <button
                onClick={() => setShowInviteToAssessmentModal(true)}
                className="w-full px-4 py-2.5 text-sm bg-gradient-to-r from-green-600 to-teal-600 text-white rounded-md hover:from-green-700 hover:to-teal-700 transition-colors shadow-sm text-left flex items-center gap-2"
              >
                <Mail className="w-4 h-4" />
                <span>Invite for Assessment</span>
              </button>

              {/* AI Talent Match Results - Shows existing match results for this JD */}
              <button
                onClick={() => {
                  // Set flag to show results only (not run new match)
                  sessionStorage.setItem('showResultsOnly', 'true');
                  if (onNavigateToAITalentMatch) {
                    onNavigateToAITalentMatch(job.id);
                  }
                }}
                className="w-full px-4 py-2.5 text-sm bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 rounded-md transition-all shadow-sm text-left flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                <span>AI Talent Match Results</span>
              </button>

              {/* View JD History */}
              <button
                onClick={() => setShowJDHistory(true)}
                className="w-full px-4 py-2.5 text-sm bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 rounded-md transition-all shadow-sm text-left flex items-center gap-2"
              >
                <History className="w-4 h-4" />
                <span>View JD History</span>
              </button>

              {job.status === 'Published' && (
                <button
                  onClick={() => handleStatusChange('Closed')}
                  className="w-full px-4 py-2.5 text-sm border border-red-300 text-red-700 rounded-md hover:bg-red-50 transition-colors text-left"
                >
                  Close Job Opening
                </button>
              )}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-gray-900 mb-4">Recent Activity</h3>
            <div className="space-y-4">
              {/* Show real activity based on JD data */}
              {scoredResumesStats.total > 0 && (
                <div className="flex gap-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-1.5 flex-shrink-0"></div>
                  <div>
                    <div className="text-sm text-gray-900">{scoredResumesStats.total} resume(s) scored</div>
                    <div className="text-xs text-gray-500">Resume scoring completed</div>
                  </div>
                </div>
              )}
              {job.currentVersion && job.currentVersion > 1 && (
                <div className="flex gap-3">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full mt-1.5 flex-shrink-0"></div>
                  <div>
                    <div className="text-sm text-gray-900">JD updated to version {job.currentVersion}.0</div>
                    <div className="text-xs text-gray-500">Job description republished</div>
                  </div>
                </div>
              )}
              {job.status === 'Published' && (
                <div className="flex gap-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full mt-1.5 flex-shrink-0"></div>
                  <div>
                    <div className="text-sm text-gray-900">Job published</div>
                    <div className="text-xs text-gray-500">
                      {job.postedDate
                        ? new Date(job.postedDate).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })
                        : `${job.daysActive} days ago`}
                    </div>
                  </div>
                </div>
              )}
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
                  <div className="bg-blue-600 h-2 rounded-full" style={{ width: '100%' }}></div>
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

          {/* Must-Have Comments */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-gray-900 mb-4">Must-Have Comments</h3>
            <div className="text-sm text-gray-600 space-y-2">
              {job.mustHaveComments && job.mustHaveComments.length > 0 ? (
                <ul className="list-disc list-inside space-y-1">
                  {job.mustHaveComments.map((comment, index) => (
                    <li key={index}>{comment}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-500 italic">No must-have comments added</p>
              )}
            </div>
          </div>

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
            results={mockAssessmentResults}
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
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                  <History className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-white">Job Description History</h2>
                  <p className="text-sm text-indigo-100">{job.title}</p>
                </div>
              </div>
              <button
                onClick={() => setShowJDHistory(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/20 transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(85vh-80px)]">
              {loadingHistory ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                  <span className="ml-3 text-gray-600">Loading history...</span>
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
                <span className="text-xs bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full font-medium">
                  {jdHistory.length} Version{jdHistory.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Timeline */}
              <div className="relative">
                {/* Vertical Line */}
                <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gradient-to-b from-indigo-200 via-purple-200 to-transparent"></div>

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

                    // Color mapping
                    const colorClasses = {
                      blue: 'bg-blue-500 border-blue-600',
                      green: 'bg-green-500 border-green-600',
                      purple: 'bg-purple-500 border-purple-600',
                      red: 'bg-red-500 border-red-600',
                      orange: 'bg-orange-500 border-orange-600',
                    }[item.color] || 'bg-gray-500 border-gray-600';

                    const bgColorClasses = {
                      blue: 'bg-blue-50 border-blue-200',
                      green: 'bg-green-50 border-green-200',
                      purple: 'bg-purple-50 border-purple-200',
                      red: 'bg-red-50 border-red-200',
                      orange: 'bg-orange-50 border-orange-200',
                    }[item.color] || 'bg-gray-50 border-gray-200';

                    const textColorClasses = {
                      blue: 'text-blue-900',
                      green: 'text-green-900',
                      purple: 'text-purple-900',
                      red: 'text-red-900',
                      orange: 'text-orange-900',
                    }[item.color] || 'text-gray-900';

                    return (
                      <div key={item.id} className="relative flex gap-6">
                        {/* Timeline Icon */}
                        <div className="relative flex-shrink-0">
                          <div className={`w-12 h-12 rounded-full border-4 border-white ${colorClasses} flex items-center justify-center shadow-lg z-10 relative`}>
                            <IconComponent className="w-5 h-5 text-white" />
                          </div>
                          {isFirst && (
                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-indigo-600 rounded-full border-2 border-white"></div>
                          )}
                        </div>

                        {/* Content Card */}
                        <div className={`flex-1 pb-6 ${!isLast ? '' : 'pb-0'}`}>
                          <div className={`rounded-lg border-2 ${bgColorClasses} p-5 shadow-sm hover:shadow-md transition-shadow`}>
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
                              <span className={`text-xs ${item.color === 'blue' ? 'bg-blue-200 text-blue-800' : item.color === 'green' ? 'bg-green-200 text-green-800' : item.color === 'purple' ? 'bg-purple-200 text-purple-800' : item.color === 'red' ? 'bg-red-200 text-red-800' : 'bg-orange-200 text-orange-800'} px-2 py-1 rounded-full font-medium whitespace-nowrap`}>
                                {item.date}
                              </span>
                            </div>

                            {/* Changes List */}
                            {item.changes && item.changes.length > 0 && (
                              <div className="mb-3 bg-white/60 rounded-lg p-3 border border-gray-200">
                                <p className="text-xs text-gray-600 font-medium mb-2">Changes Made:</p>
                                <ul className="space-y-1">
                                  {item.changes.map((change, idx) => (
                                    <li key={idx} className="text-sm text-gray-700 flex items-start gap-2">
                                      <span className="text-indigo-600 mt-1">•</span>
                                      <span>{change}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* Performed By Info */}
                            <div className="flex items-center gap-3 pt-3 border-t border-gray-200">
                              <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full flex items-center justify-center">
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
                          </div>
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
                Showing complete history from creation to present
              </p>
              <button
                onClick={() => setShowJDHistory(false)}
                className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all shadow-sm"
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
    </main>
  );
}
