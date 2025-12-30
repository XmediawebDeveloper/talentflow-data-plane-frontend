'use client'

import { ArrowLeft, MapPin, Calendar, Target, Users, Briefcase, X, CheckCircle, Sparkles, UserPlus, ChevronDown, Upload, UserCheck, Mail, Phone, Building2, Clock, TrendingUp, Star, User, Ban, Archive, History, FileText, Edit, XCircle, RefreshCw } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { Job } from '@/lib/types/types';
import { jdService, JDVersion } from '@/lib/services/jdService';
import ResumeUploadModal from './ResumeUploadModal';
import ResumeScoring from './ResumeScoring';
import JobApplicants from './JobApplicants';
import ScoredResumesTable from './ScoredResumesTable';
import InviteToAssessmentModal from './InviteToAssessmentModal';
import SelectSourceModal from './SelectSourceModal';
import AssessmentResultsTable from './AssessmentResultsTable';
import VersionHistoryModal from './VersionHistoryModal';
import JDVersionHistoryModal from './JDVersionHistoryModal';
import ResumeQuickViewModal from './ResumeQuickViewModal';
import { Resume } from '@/lib/types/types';

interface JobDetailViewProps {
  job: Job;
  onBack: () => void;
  onEdit?: (job: Job) => void;
  resumes?: any[]; // All resumes for selection
  onScoreResumes?: (resumeIds: string[], jobId: string, source: 'my-resumes' | 'internal-db') => void;
  onNavigateToAITalentMatch?: (jobId: string) => void; // Navigate to AI Talent Match page
  onDisable?: (job: Job) => void; // Disable job
  onArchive?: (job: Job) => void; // Archive job
  onViewAssessmentResult?: (assessmentResult: any, jobTitle: string) => void; // Navigate to assessment result detail
}

export default function JobDetailView({ job, onBack, resumes = [], onScoreResumes, onNavigateToAITalentMatch, onDisable, onArchive, onViewAssessmentResult }: JobDetailViewProps) {
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
        // Map match_status from API to display format
        let matchStatus = 'No Match';
        if (item.match_status === 'exact_match') {
          matchStatus = 'Exact Match';
        } else if (item.match_status === 'partial_match') {
          matchStatus = 'Partial Match';
        }

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
          education: item.education || undefined,
          certifications: item.certifications || [],
          aiSummary: item.ai_summary,
          strengths: item.strengths || [],
          gaps: item.gaps || [],
          title: item.current_title,
          currentCompany: item.current_company,
          location: item.location,
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

  // Generate mock AI match results for published jobs
  const generateMockAIResults = () => {
    if (job.status !== 'Published') return [];

    return [
      {
        id: '1',
        name: 'John Doe',
        title: 'Senior Java Developer',
        email: 'john.doe@email.com',
        phone: '+1 (555) 123-4567',
        location: 'New York, NY',
        experience: '5-7 years',
        skills: ['Java', 'Spring Boot', 'AWS', 'Docker', 'Kubernetes', 'PostgreSQL', 'Redis'],
        currentCompany: 'Google',
        noticePeriod: '30 Days',
        matchScore: 94.5,
        matchReason: 'Excellent match for all required skills. 5+ years Java experience, strong AWS and containerization expertise.',
        skillMatches: ['Java', 'Spring Boot', 'AWS', 'Docker', 'Kubernetes'],
        uploadDate: '2025-11-28',
      },
      {
        id: '3',
        name: 'Mike Johnson',
        title: 'DevOps Engineer',
        email: 'mike.j@email.com',
        phone: '+1 (555) 345-6789',
        location: 'Austin, TX',
        experience: '5-7 years',
        skills: ['AWS', 'Terraform', 'Kubernetes', 'CI/CD', 'Python', 'Bash'],
        currentCompany: 'Netflix',
        noticePeriod: '45 Days',
        matchScore: 88.3,
        matchReason: 'Excellent DevOps background with strong AWS and Kubernetes skills. Infrastructure expertise aligns well.',
        skillMatches: ['AWS', 'Kubernetes'],
        uploadDate: '2025-11-26',
      },
      {
        id: '5',
        name: 'David Chen',
        title: 'Full Stack Developer',
        email: 'david.chen@email.com',
        phone: '+1 (555) 567-8901',
        location: 'Seattle, WA',
        experience: '3-5 years',
        skills: ['React', 'Node.js', 'TypeScript', 'MongoDB', 'GraphQL', 'AWS'],
        currentCompany: 'Amazon',
        noticePeriod: 'Immediate',
        matchScore: 85.7,
        matchReason: 'Strong AWS experience and modern tech stack. Full-stack background with cloud expertise.',
        skillMatches: ['AWS', 'TypeScript'],
        uploadDate: '2025-11-24',
      },
      {
        id: '2',
        name: 'Jane Smith',
        title: 'Python Developer',
        email: 'jane.smith@email.com',
        phone: '+1 (555) 234-5678',
        location: 'San Francisco, CA',
        experience: '3-5 years',
        skills: ['Python', 'Django', 'FastAPI', 'PostgreSQL', 'MongoDB', 'Docker'],
        currentCompany: 'Microsoft',
        noticePeriod: '60 Days',
        matchScore: 78.2,
        matchReason: 'Good backend development experience with transferable skills. Strong database and Docker knowledge.',
        skillMatches: ['Docker', 'PostgreSQL'],
        uploadDate: '2025-11-27',
      },
      {
        id: '8',
        name: 'Lisa Anderson',
        title: 'UI/UX Designer',
        email: 'lisa.a@email.com',
        phone: '+1 (555) 890-1234',
        location: 'Los Angeles, CA',
        experience: '5-7 years',
        skills: ['Figma', 'Adobe XD', 'User Research', 'Prototyping', 'Design Systems'],
        currentCompany: 'Adobe',
        noticePeriod: '30 Days',
        matchScore: 42.1,
        matchReason: 'Limited technical skill overlap. Design background may not align with technical requirements.',
        skillMatches: [],
        uploadDate: '2025-11-21',
      },
      {
        id: '6',
        name: 'Emily Rodriguez',
        title: 'Registered Nurse',
        email: 'emily.r@email.com',
        phone: '+1 (555) 678-9012',
        location: 'Baltimore, MD',
        experience: '7-10 years',
        skills: ['Patient Care', 'EMR Systems', 'Critical Care', 'ACLS Certified'],
        currentCompany: 'Johns Hopkins Hospital',
        noticePeriod: '60 Days',
        matchScore: 15.3,
        matchReason: 'Different career domain. Skills and experience do not match technical requirements.',
        skillMatches: [],
        uploadDate: '2025-11-23',
      },
    ];
  };

  const [aiMatchResults, setAiMatchResults] = useState<any[]>(generateMockAIResults());
  const [activeTab, setActiveTab] = useState<'overview' | 'ai-matches' | 'scored-resumes' | 'assessment-results'>('overview');
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);
  const [filterThreshold, setFilterThreshold] = useState(0);

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

  const handleAITalentMatch = () => {
    // Navigate directly to AI Talent Match page with this job preselected
    if (onNavigateToAITalentMatch) {
      onNavigateToAITalentMatch(job.id);
    }
  };

  const handleAIMatchComplete = (results: any[]) => {
    setAiMatchResults(results);
    setActiveTab('ai-matches');
  };

  const handleSelectCandidate = (id: string) => {
    setSelectedCandidates(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const getMatchColor = (score: number) => {
    if (score >= 85) return 'text-green-600';
    if (score >= 70) return 'text-blue-600';
    if (score >= 50) return 'text-yellow-600';
    return 'text-gray-600';
  };

  const getMatchBgColor = (score: number) => {
    if (score >= 85) return 'bg-green-100 border-green-300';
    if (score >= 70) return 'bg-blue-100 border-blue-300';
    if (score >= 50) return 'bg-yellow-100 border-yellow-300';
    return 'bg-gray-100 border-gray-300';
  };

  const getMatchLabel = (score: number) => {
    if (score >= 85) return 'Excellent Match';
    if (score >= 70) return 'Good Match';
    if (score >= 50) return 'Moderate Match';
    return 'Low Match';
  };

  const filteredAIResults = aiMatchResults.filter(r => r.matchScore >= filterThreshold);

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
                        ? new Date(job.postedDate).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
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

            {/* Action Buttons - Only for Published jobs */}
            {job.status === 'Published' && (
              <div className="flex items-center gap-2">
                {onArchive && (
                  <button
                    onClick={handleArchive}
                    className="px-4 py-2 bg-gray-100 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-200 transition-all flex items-center gap-2"
                  >
                    <Archive className="w-4 h-4" />
                    <span className="font-medium">Archive</span>
                  </button>
                )}
                {onDisable && (
                  <button
                    onClick={handleDisable}
                    className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-all flex items-center gap-2"
                  >
                    <Ban className="w-4 h-4" />
                    <span className="font-medium">Disable</span>
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

      {/* AI Match Results Section */}
      {activeTab === 'ai-matches' && aiMatchResults.length > 0 && (
        <div className="mb-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-blue-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-purple-600" />
                  </div>
                  <div>
                    <h2 className="text-gray-900">AI Talent Match Results</h2>
                    <p className="text-sm text-gray-600">
                      Showing {filteredAIResults.length} candidates ranked by AI relevance
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {/* Stats */}
                  <div className="flex items-center gap-6">
                    <div className="text-center">
                      <div className="text-lg text-green-600">
                        {aiMatchResults.filter(r => r.matchScore >= 85).length}
                      </div>
                      <div className="text-xs text-gray-600">Excellent</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg text-blue-600">
                        {aiMatchResults.filter(r => r.matchScore >= 70 && r.matchScore < 85).length}
                      </div>
                      <div className="text-xs text-gray-600">Good</div>
                    </div>
                  </div>

                  {/* Filter */}
                  <select
                    value={filterThreshold}
                    onChange={(e) => setFilterThreshold(Number(e.target.value))}
                    className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-600 bg-white"
                  >
                    <option value={0}>All Matches</option>
                    <option value={50}>50%+ Match</option>
                    <option value={70}>70%+ Match</option>
                    <option value={85}>85%+ Match</option>
                  </select>

                  <button
                    onClick={() => setActiveTab('overview')}
                    className="p-1.5 text-gray-500 hover:text-gray-700 rounded-md hover:bg-white/50"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>

            <div className="p-6 max-h-[600px] overflow-y-auto">
              <div className="space-y-4">
                {filteredAIResults.map((candidate, index) => (
                  <div
                    key={candidate.id}
                    className="bg-white rounded-lg border border-gray-200 hover:border-purple-300 hover:shadow-md transition-all p-5"
                  >
                    <div className="flex items-start gap-4">
                      {/* Rank Badge */}
                      <div className="flex-shrink-0">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-base ${
                          index === 0 ? 'bg-yellow-100 text-yellow-700 border-2 border-yellow-300' :
                          index === 1 ? 'bg-gray-100 text-gray-700 border-2 border-gray-300' :
                          index === 2 ? 'bg-orange-100 text-orange-700 border-2 border-orange-300' :
                          'bg-gray-50 text-gray-600'
                        }`}>
                          #{index + 1}
                        </div>
                      </div>

                      {/* Candidate Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="text-base text-gray-900 truncate">{candidate.name}</h3>
                              {index < 3 && (
                                <Star className={`w-4 h-4 flex-shrink-0 ${
                                  index === 0 ? 'text-yellow-500 fill-yellow-500' :
                                  index === 1 ? 'text-gray-400 fill-gray-400' :
                                  'text-orange-500 fill-orange-500'
                                }`} />
                              )}
                            </div>
                            <p className="text-sm text-gray-600 mb-2">{candidate.title}</p>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
                              <span className="flex items-center gap-1">
                                <Mail className="w-3 h-3" />
                                {candidate.email}
                              </span>
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {candidate.phone}
                              </span>
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {candidate.location}
                              </span>
                              <span className="flex items-center gap-1">
                                <Building2 className="w-3 h-3" />
                                {candidate.currentCompany}
                              </span>
                            </div>
                          </div>

                          {/* Match Score */}
                          <div className="text-right ml-4 flex-shrink-0">
                            <div className={`text-2xl mb-1 ${getMatchColor(candidate.matchScore)}`}>
                              {candidate.matchScore}%
                            </div>
                            <div className={`inline-block px-2 py-0.5 rounded-full text-xs border ${getMatchBgColor(candidate.matchScore)}`}>
                              {getMatchLabel(candidate.matchScore)}
                            </div>
                          </div>
                        </div>

                        {/* AI Analysis */}
                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mb-3">
                          <div className="flex items-start gap-2">
                            <Sparkles className="w-3.5 h-3.5 text-purple-600 mt-0.5 flex-shrink-0" />
                            <div>
                              <div className="text-xs text-purple-700 mb-0.5">AI Analysis</div>
                              <p className="text-xs text-gray-700">{candidate.matchReason}</p>
                            </div>
                          </div>
                        </div>

                        {/* Skills */}
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {candidate.skills.map((skill: string) => {
                            const isMatch = candidate.skillMatches.includes(skill);
                            return (
                              <span
                                key={skill}
                                className={`px-2 py-0.5 rounded-full text-xs ${
                                  isMatch
                                    ? 'bg-green-100 text-green-700 border border-green-300'
                                    : 'bg-gray-100 text-gray-600 border border-gray-200'
                                }`}
                              >
                                {isMatch && <CheckCircle className="w-2.5 h-2.5 inline mr-0.5" />}
                                {skill}
                              </span>
                            );
                          })}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedCandidates.includes(candidate.id)}
                            onChange={() => handleSelectCandidate(candidate.id)}
                            className="w-4 h-4 text-purple-600 rounded"
                          />
                          <span className="text-xs text-gray-600">Select candidate</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {selectedCandidates.length > 0 && (
                <div className="sticky bottom-0 mt-6 pt-4 border-t border-gray-200 bg-white">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">
                      {selectedCandidates.length} candidate{selectedCandidates.length !== 1 ? 's' : ''} selected
                    </span>
                    <button className="px-6 py-2.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors shadow-sm">
                      Add as Applicants
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
                {/* About the Role */}
                <div>
                  <h2 className="text-xl text-gray-900 mb-4 pb-2 border-b-2 border-blue-600 inline-block">
                    About the Role
                  </h2>
                  <div className="mt-4 space-y-3 text-gray-700 leading-relaxed">
                    <p>
                      We are seeking a talented <strong>{job.title}</strong> to join our {job.department || 'team'}.
                      This is a {job.location?.toLowerCase() || 'flexible'} position requiring {job.experience || 'relevant experience'}.
                    </p>
                    <p>
                      The ideal candidate will have strong expertise in the required skills and a proven track record
                      of delivering high-quality results. You will work closely with cross-functional teams to drive
                      innovation and achieve business objectives.
                    </p>
                  </div>
                </div>

                {/* Key Responsibilities */}
                <div>
                  <h2 className="text-xl text-gray-900 mb-4 pb-2 border-b-2 border-blue-600 inline-block">
                    Key Responsibilities
                  </h2>
                  <ul className="mt-4 space-y-3">
                    <li className="flex items-start gap-3 text-gray-700">
                      <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2 flex-shrink-0"></div>
                      <span>Lead technical design and implementation of solutions</span>
                    </li>
                    <li className="flex items-start gap-3 text-gray-700">
                      <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2 flex-shrink-0"></div>
                      <span>Collaborate with team members on complex projects</span>
                    </li>
                    <li className="flex items-start gap-3 text-gray-700">
                      <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2 flex-shrink-0"></div>
                      <span>Mentor junior team members and conduct code reviews</span>
                    </li>
                    <li className="flex items-start gap-3 text-gray-700">
                      <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2 flex-shrink-0"></div>
                      <span>Contribute to architectural decisions and best practices</span>
                    </li>
                    <li className="flex items-start gap-3 text-gray-700">
                      <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2 flex-shrink-0"></div>
                      <span>Ensure code quality, performance, and scalability</span>
                    </li>
                  </ul>
                </div>

                {/* Required Skills */}
                {job.skills && job.skills.length > 0 && (
                  <div>
                    <h2 className="text-xl text-gray-900 mb-4 pb-2 border-b-2 border-blue-600 inline-block">
                      Required Skills
                    </h2>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {job.skills.map((skill, index) => (
                        <span
                          key={index}
                          className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-md text-sm border border-blue-200"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Qualifications */}
                <div>
                  <h2 className="text-xl text-gray-900 mb-4 pb-2 border-b-2 border-blue-600 inline-block">
                    Qualifications
                  </h2>
                  <ul className="mt-4 space-y-3">
                    <li className="flex items-start gap-3 text-gray-700">
                      <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2 flex-shrink-0"></div>
                      <span>{job.experience || 'Relevant years of'} professional experience</span>
                    </li>
                    <li className="flex items-start gap-3 text-gray-700">
                      <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2 flex-shrink-0"></div>
                      <span>Strong proficiency in required technologies</span>
                    </li>
                    <li className="flex items-start gap-3 text-gray-700">
                      <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2 flex-shrink-0"></div>
                      <span>Excellent problem-solving and communication skills</span>
                    </li>
                    <li className="flex items-start gap-3 text-gray-700">
                      <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2 flex-shrink-0"></div>
                      <span>Bachelor's degree in Computer Science or related field (or equivalent experience)</span>
                    </li>
                    <li className="flex items-start gap-3 text-gray-700">
                      <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2 flex-shrink-0"></div>
                      <span>Ability to work in a {job.location?.toLowerCase() || 'flexible'} environment</span>
                    </li>
                  </ul>
                </div>

                {/* What We Offer */}
                <div>
                  <h2 className="text-xl text-gray-900 mb-4 pb-2 border-b-2 border-blue-600 inline-block">
                    What We Offer
                  </h2>
                  <ul className="mt-4 space-y-3">
                    <li className="flex items-start gap-3 text-gray-700">
                      <div className="w-1.5 h-1.5 bg-green-600 rounded-full mt-2 flex-shrink-0"></div>
                      <span>Competitive salary and comprehensive benefits package</span>
                    </li>
                    <li className="flex items-start gap-3 text-gray-700">
                      <div className="w-1.5 h-1.5 bg-green-600 rounded-full mt-2 flex-shrink-0"></div>
                      <span>Flexible work arrangements and work-life balance</span>
                    </li>
                    <li className="flex items-start gap-3 text-gray-700">
                      <div className="w-1.5 h-1.5 bg-green-600 rounded-full mt-2 flex-shrink-0"></div>
                      <span>Professional development and learning opportunities</span>
                    </li>
                    <li className="flex items-start gap-3 text-gray-700">
                      <div className="w-1.5 h-1.5 bg-green-600 rounded-full mt-2 flex-shrink-0"></div>
                      <span>Collaborative and innovative work environment</span>
                    </li>
                  </ul>
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

              {/* AI Talent Match Results */}
              <button
                onClick={() => {
                  if (onNavigateToAITalentMatch) {
                    onNavigateToAITalentMatch(job.id);
                  }
                }}
                className="w-full px-4 py-2.5 text-sm bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 rounded-md transition-all shadow-sm text-left flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  <span>AI Talent Match Results</span>
                </div>
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
              <div className="flex gap-3">
                <div className="w-2 h-2 bg-green-500 rounded-full mt-1.5 flex-shrink-0"></div>
                <div>
                  <div className="text-sm text-gray-900">New application received</div>
                  <div className="text-xs text-gray-500">2 hours ago</div>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-2 h-2 bg-blue-500 rounded-full mt-1.5 flex-shrink-0"></div>
                <div>
                  <div className="text-sm text-gray-900">Job posting shared</div>
                  <div className="text-xs text-gray-500">5 hours ago</div>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-2 h-2 bg-purple-500 rounded-full mt-1.5 flex-shrink-0"></div>
                <div>
                  <div className="text-sm text-gray-900">Match score updated</div>
                  <div className="text-xs text-gray-500">1 day ago</div>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-2 h-2 bg-yellow-500 rounded-full mt-1.5 flex-shrink-0"></div>
                <div>
                  <div className="text-sm text-gray-900">Job description edited</div>
                  <div className="text-xs text-gray-500">2 days ago</div>
                </div>
              </div>
              {job.status === 'Published' && (
                <div className="flex gap-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full mt-1.5 flex-shrink-0"></div>
                  <div>
                    <div className="text-sm text-gray-900">Job published</div>
                    <div className="text-xs text-gray-500">{job.daysActive} days ago</div>
                  </div>
                </div>
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
                // Convert scored resume to Resume format for the modal
                const resumeForModal: Resume = {
                  id: resume.id,
                  name: resume.candidateName || 'Unknown',
                  email: resume.email || '',
                  phone: resume.phone || '',
                  title: resume.title || 'Candidate',
                  experience: resume.experience || 'N/A',
                  education: resume.education || 'N/A',
                  location: resume.location || 'N/A',
                  skills: resume.strengths || [],
                  source: 'Manual' as const,
                  folderId: '',
                  uploadDate: resume.scoredDate || new Date().toISOString(),
                  attachments: 1,
                  uploadedBy: resume.scoredBy || 'System',
                };
                setViewingResume(resumeForModal);
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
          onClose={() => setShowSelectSourceModal(false)}
          myResumes={resumes.filter(r => r.uploadedBy === 'current-user')}
          internalDbResumes={resumes}
          onSubmitForScoring={(resumeIds, source) => {
            if (onScoreResumes) {
              onScoreResumes(resumeIds, job.id, source);
              // Show success toast
              alert(`${resumeIds.length} resumes submitted for scoring from ${source === 'my-resumes' ? 'My Resumes' : 'Internal Database'}`);
            }
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

      {/* Resume Quick View Modal */}
      {viewingResume && (
        <ResumeQuickViewModal
          resume={viewingResume}
          onClose={() => setViewingResume(null)}
        />
      )}
    </main>
  );
}
