'use client';

import { Target, Award, CheckCircle, XCircle, TrendingUp, Mail, Phone, MapPin, Briefcase, GraduationCap, Star, Calendar, Zap, FileText, AlertCircle, Download, Clock, Building2, ChevronLeft, ChevronRight, ChevronDown, Code, Languages, BarChart3, CheckSquare, MessageSquare, Minus, BookOpen, ThumbsUp, ThumbsDown, Loader2, Sparkles, UserPlus } from 'lucide-react';
import DetailedScorecardTab from './DetailedScorecardTab';
import ResumeDetailView from './ResumeDetailView';
import ViewResumeButton from '@/components/ui/view-resume-button';
import ShareAssessmentModal from './ShareAssessmentModal';
import ShareAIInterviewModal from './ai-interview/ShareAIInterviewModal';
import { useState, useEffect, useRef } from 'react';
import { usePlanFeatures } from '@/lib/hooks/usePlanFeature';
import { toast } from 'sonner';
import RecordPager from '@/components/RecordPager';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { useAuth } from '@/components/providers/AuthProvider';
import { handleUnauthorized } from '@/lib/services/api';
import { formatIST } from '@/lib/utils/dateUtils';
import { formatJobExperienceText, formatJobExperienceBadge } from '@/lib/utils/jobExperience';
import { formatSalaryRange } from '@/lib/utils/salary';
import PageBreadcrumb, { BreadcrumbCrumb } from '@/components/PageBreadcrumb';

interface ScoredResume {
  id: string;  // This is the SCORE ID, not resume ID!
  resumeId?: string;  // The actual resume ID (from API's resume_id field)
  candidateName: string;
  email: string;
  phone: string;
  matchStatus: string;
  scorePercentage: number;
  scoredDate: string;
  scoredBy: string;
  experience?: string;
  // Education may be a single label string or the structured detail array from
  // the candidate endpoint. Renderers below branch on the runtime shape.
  education?: string | Array<{ degree?: string; institution?: string; school?: string; year?: string; graduation_year?: string; gpa?: string }>;
  certifications?: (string | { name?: string; date?: string; issuer?: string; credential_id?: string })[];
  aiSummary?: string;
  strengths?: string[];
  gaps?: string[];
  matchReason?: string;
  // Score breakdown returned by the scoring API. The backend can return either
  // a structured object (single record with skillsMatch / experienceMatch /
  // educationMatch / overallFit) or an array of breakdown items. Callers below
  // read the object form via optional chaining, so allow both shapes.
  scoreBreakdown?:
    | {
        skillsMatch?: number;
        experienceMatch?: number;
        educationMatch?: number;
        overallFit?: number;
        [key: string]: any;
      }
    | any[];
  criteriaScores?: Record<string, any>; // Criteria scores object from API
  title?: string;
  currentCompany?: string;
  location?: string;
  professionalSummary?: string;
  skills?: string[];
  technicalSkills?: string[];
  softSkills?: string[];
  educationDetails?: any[];
  experienceDetails?: any[];
  languages?: any[];
  // Explicit matched and missing skills (from scoring)
  matchedSkills?: string[];
  missingSkills?: string[];
  // Additional fields from full resume
  projects?: any[];
  awards?: any[];
  achievements?: any[];
  hobbies?: any[];
  volunteerExperience?: any[];
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  objective?: string;
  noticePeriod?: string;
  resumeVersion?: number;  // Version of resume that was scored
}

interface CandidateScoringDetailPageProps {
  resume: ScoredResume;
  jobTitle: string;
  jobId: string;
  /** Kept for callers; navigation back now happens via the breadcrumb. */
  onBack?: () => void;
  onMinimize?: () => void;
  currentIndex?: number;
  totalCount?: number;
  onPrev?: () => void;
  onNext?: () => void;
  /**
   * Breadcrumb crumbs for this view. Supply this when the component is rendered
   * as an in-page view (e.g. inside Resume Scoring) so the parent crumbs can use
   * `onClick` to switch views instead of an `href` to the route already shown.
   */
  breadcrumbItems?: BreadcrumbCrumb[];
}

export default function CandidateScoringDetailPage({ resume, jobTitle, jobId, onMinimize, currentIndex, totalCount, onPrev, onNext, breadcrumbItems }: CandidateScoringDetailPageProps) {
  const { isTenantAdmin, user } = useAuth();
  const { hasPlanFeature } = usePlanFeatures();
  const canExport = isTenantAdmin || (user?.permissions?.canExport ?? false);

  // Same permission shape the JD page uses for its invite actions.
  const hasPermission = (permission: string): boolean => {
    if (!user) return false;
    if (isTenantAdmin || user.role === 'tenant_admin') return true;
    if (!user.permissions) return false;
    return user.permissions[permission as keyof typeof user.permissions] === true;
  };
  const canInviteAssessment = hasPermission('canCreateAssessments') && hasPlanFeature('assessment');
  const canInviteAIInterview =
    (hasPermission('canShareAIInterviews') || hasPermission('canInviteAIInterviews')) && hasPlanFeature('ai_interview');
  const canInvite = canInviteAssessment || canInviteAIInterview;

  const [showInviteMenu, setShowInviteMenu] = useState(false);
  const inviteMenuRef = useRef<HTMLDivElement>(null);

  // In-page resume view — swaps the candidate body for the resume, keeping the
  // page (and its breadcrumb) instead of routing to /recruitment/resume-view.
  const [view, setView] = useState<'candidate' | 'resume'>('candidate');
  const [resumeDetail, setResumeDetail] = useState<any>(null);
  const [loadingResumeDetail, setLoadingResumeDetail] = useState(false);

  // Invite flows — both render their existing modal over this page.
  const [shareAssessments, setShareAssessments] = useState<any[]>([]);
  const [showShareAssessmentModal, setShowShareAssessmentModal] = useState(false);
  const [pickerAssessments, setPickerAssessments] = useState<any[]>([]);
  const [pickerSelectedIds, setPickerSelectedIds] = useState<string[]>([]);
  const [showAssessmentPicker, setShowAssessmentPicker] = useState(false);
  const [loadingInvite, setLoadingInvite] = useState<'assessment' | 'ai-interview' | null>(null);
  const [shareAIConfig, setShareAIConfig] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'scoretable' | 'personalinfo' | 'viewjd'>('overview');
  const [isDataReady, setIsDataReady] = useState(false);
  const [fullResumeData, setFullResumeData] = useState<ScoredResume>(resume);
  const [fullResumeLoaded, setFullResumeLoaded] = useState(false);
  const [jdDetails, setJdDetails] = useState<any>(null);

  // Debug: Check props
  console.log('[CandidateScoringDetailPage] Props:', {
    hasResume: !!resume,
    jobTitle,
    jobId,
    resumeId: resume?.id,
    scorePercentage: resume?.scorePercentage,
    criteriaScores: resume?.criteriaScores
  });

  // Always fetch complete scoring data AND full resume data from API
  useEffect(() => {
    const fetchCompleteData = async () => {
      console.log('[CandidateScoringDetailPage] Fetching complete data from API');

      // Always fetch from API when jobId is available to get latest data
      if (jobId && resume?.id) {
        console.log('[CandidateScoringDetailPage] Fetching from API for jobId:', jobId, 'scoreId:', resume.id);
        try {
          const { jdService } = await import('@/lib/services/jdService');
          const { resumeService } = await import('@/lib/services/resumeService');

          // Fetch JD details for Overview tab
          jdService.get(jobId).then((jd: any) => {
            setJdDetails(jd);
          }).catch((err: any) => {
            console.error('[CandidateScoringDetailPage] Failed to fetch JD details:', err);
          });

          // First fetch scored resumes to get the actual resume_id
          const scoredResumes = await jdService.getScoredResumes(jobId, { page_size: 100 });
          const completeResumeData = scoredResumes.items.find((r: any) => r.id === resume.id);

          // IMPORTANT: API returns 'id' as score ID and 'resume_id' as the actual resume ID
          const actualResumeId = completeResumeData?.resume_id || resume.resumeId || resume.id;
          console.log('[CandidateScoringDetailPage] Score ID:', resume.id, 'Actual Resume ID:', actualResumeId);

          // Now fetch the full resume using the correct resume ID
          const fullResume = await resumeService.get(actualResumeId).catch((err) => {
            console.error('[CandidateScoringDetailPage] Failed to fetch full resume:', err);
            return null;
          });

          if (completeResumeData) {
            console.log('[CandidateScoringDetailPage] Complete data fetched successfully:', {
              overall_score: completeResumeData.overall_score,
              has_criteria_scores: !!completeResumeData.criteria_scores,
              criteria_count: Object.keys(completeResumeData.criteria_scores || {}).length,
              hasFullResume: !!fullResume
            });

            // Debug: Log full resume data to check available fields
            if (fullResume) {
              const fr = fullResume as any;
              console.log('[CandidateScoringDetailPage] Full resume data from API:', {
                candidate_name: fr.candidate_name,
                current_title: fr.current_title,
                current_company: fr.current_company,
                experience_years: fr.experience_years,
                professional_summary: fr.professional_summary?.substring(0, 100) + '...',
                experience_count: fr.experience?.length,
                education_count: fr.education?.length,
                skills_count: fr.skills?.length,
                technical_skills_count: fr.technical_skills?.length,
                soft_skills_count: fr.soft_skills?.length,
                certifications_count: fr.certifications?.length,
                languages_count: fr.languages?.length,
                hasProjects: !!(fr.projects?.length),
                hasAwards: !!(fr.awards?.length),
                allKeys: Object.keys(fullResume),
              });
              setFullResumeLoaded(true);
            } else {
              console.warn('[CandidateScoringDetailPage] Full resume fetch returned null - using fallback data');
              setFullResumeLoaded(false);
            }

            // Merge scoring data with full resume data
            // IMPORTANT: Prioritize full resume data over scored resume data for Personal Info
            const fr = fullResume as any;
            setFullResumeData({
              ...resume,
              // Store the actual resume ID (different from score ID!)
              resumeId: actualResumeId,
              // Scoring-specific data
              scorePercentage: Number((completeResumeData.overall_score || 0).toFixed(1)),  // Keep 1 decimal for consistency
              criteriaScores: completeResumeData.criteria_scores || {},
              scoreBreakdown: completeResumeData.score_breakdown || [],
              aiSummary: completeResumeData.ai_summary,
              strengths: completeResumeData.strengths || [],
              gaps: completeResumeData.gaps || [],
              scoredDate: completeResumeData.created_at,
              matchStatus: completeResumeData.match_status,
              scoredBy: completeResumeData.scored_by || completeResumeData.scored_by_name || resume.scoredBy || 'System',
              // Full resume data for Personal Info tab (prioritize full resume over scored resume)
              // Note: Backend returns snake_case, we map to camelCase for frontend
              candidateName: fr?.candidate_name || resume.candidateName,
              professionalSummary: fr?.professional_summary || '', // Don't fall back to AI summary
              experienceDetails: fr?.experience || [],
              educationDetails: fr?.education || [],
              skills: fr?.skills || [],
              technicalSkills: fr?.technical_skills || [],
              softSkills: fr?.soft_skills || [],
              certifications: fr?.certifications || resume.certifications || [],
              languages: fr?.languages || [],
              currentCompany: fr?.current_company || '',
              title: fr?.current_title || resume.title || '',
              location: fr?.location || resume.location || '',
              experience: fr?.experience_years ? `${fr.experience_years} years` : '',
              // Additional fields from full resume
              projects: fr?.projects || [],
              awards: fr?.awards || [],
              achievements: fr?.achievements || [],
              hobbies: fr?.hobbies || [],
              volunteerExperience: fr?.volunteer_experience || [],
              linkedinUrl: fr?.linkedin_url || '',
              githubUrl: fr?.github_url || '',
              portfolioUrl: fr?.portfolio_url || '',
              objective: fr?.objective || '',
              noticePeriod: fr?.notice_period || '',
            });
            setIsDataReady(true);
          } else {
            console.log('[CandidateScoringDetailPage] Resume not found in API response, using existing data');
            setFullResumeData(resume);
            setIsDataReady(true);
          }
        } catch (error) {
          console.error('[CandidateScoringDetailPage] Error fetching complete data:', error);
          setFullResumeData(resume);
          setIsDataReady(true);
        }
      } else {
        console.log('[CandidateScoringDetailPage] No jobId provided, using existing data');
        setFullResumeData(resume);
        setIsDataReady(true);
      }
    };

    fetchCompleteData();
  }, [resume?.id, jobId]);

  // Generate enriched data from resume with varied fallback scores
  const generateVariedScore = (base: number, variance: number) => {
    // Use a deterministic variation based on resume id to keep scores consistent across renders
    const hash = resume.id.split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0);
    const variation = ((hash % variance) - variance / 2);
    return Math.min(100, Math.max(0, Math.round(base + variation)));
  };

  const detailedScores = {
    titleMatch: fullResumeData.scoreBreakdown?.overallFit || fullResumeData.scorePercentage,
    experienceMatch: fullResumeData.scoreBreakdown?.experienceMatch || generateVariedScore(fullResumeData.scorePercentage, 20),
    skillsMatch: fullResumeData.scoreBreakdown?.skillsMatch || generateVariedScore(fullResumeData.scorePercentage, 16),
    educationMatch: fullResumeData.scoreBreakdown?.educationMatch || generateVariedScore(fullResumeData.scorePercentage, 24),
    locationMatch: generateVariedScore(fullResumeData.scorePercentage, 12),
  };

  // matchedSkills should be from the explicit matchedSkills field, or fall back to skills arrays
  // strengths are AI-generated descriptions, not skills
  const matchedSkills = fullResumeData.matchedSkills || fullResumeData.technicalSkills || fullResumeData.skills || [];
  // missingSkills should be from the explicit missingSkills field
  const missingSkills = fullResumeData.missingSkills || [];

  // Use strengths directly from API without template prefixes
  const keyStrengths = fullResumeData.strengths && fullResumeData.strengths.length > 0
    ? fullResumeData.strengths
    : fullResumeData.scorePercentage >= 85
      ? ['Strong alignment with job requirements', 'Excellent technical profile']
      : fullResumeData.scorePercentage >= 70
        ? ['Good technical foundation', 'Relevant experience']
        : ['Shows potential for growth'];

  // Use gaps directly from API without template prefixes
  // Filter out items that are already shown in missingSkills to avoid duplication
  const improvementAreas = fullResumeData.gaps && fullResumeData.gaps.length > 0
    ? fullResumeData.gaps.filter((gap: string) => !missingSkills.includes(gap))
    : [];

  const normalizedMatchStatus = fullResumeData.matchStatus?.toLowerCase().replace(/[_\s]/g, '') || '';
  const aiReasoning = fullResumeData.aiSummary || fullResumeData.matchReason || (
    (normalizedMatchStatus === 'exactmatch' || normalizedMatchStatus === 'excellentmatch')
      ? 'Outstanding candidate with exceptional alignment to job requirements. Strong technical skills, relevant experience, and proven track record in similar roles.'
      : normalizedMatchStatus === 'partialmatch'
        ? 'Solid candidate with good alignment to most job requirements. Possesses core technical skills and relevant experience with minor gaps in specialized areas.'
        : 'Limited alignment with current job requirements. While the candidate shows promise in certain areas, there are significant gaps in required technical skills and experience.'
  );

  // No static recommendations - removed hardcoded next steps

  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-green-600';
    if (score >= 70) return 'text-gray-800';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 85) return 'bg-green-100 border-green-300 text-green-700';
    if (score >= 70) return 'bg-gray-100 border-gray-300 text-gray-700';
    if (score >= 60) return 'bg-yellow-100 border-yellow-300 text-yellow-700';
    return 'bg-red-100 border-red-300 text-red-700';
  };

  const getProgressBarColor = (score: number) => {
    if (score >= 85) return 'bg-green-600';
    if (score >= 70) return 'bg-gray-600';
    if (score >= 60) return 'bg-yellow-600';
    return 'bg-red-600';
  };

  // Format match status from API (e.g., "partial_match" -> "Partial Match")
  const formatMatchStatus = (status: string) => {
    if (!status) return 'Unknown';
    return status
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  };

  const getMatchStatusColor = (status: string) => {
    const normalized = status?.toLowerCase().replace(/[_\s]/g, '');
    if (normalized === 'exactmatch' || normalized === 'excellentmatch') return 'bg-green-100 text-green-700 border-green-300';
    if (normalized === 'partialmatch') return 'bg-yellow-100 text-yellow-700 border-yellow-300';
    return 'bg-red-100 text-red-700 border-red-300';
  };

  // ---- Read-only label helpers for the View JD tab (mirrors JobDetailView's
  // "Extracted Data Summary" so both surfaces read the same) ----
  const prettifyCode = (value?: string): string =>
    (value || '')
      .replace(/[_-]+/g, ' ')
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());

  const educationLabelMap: Record<string, string> = {
    diploma: 'Diploma',
    associate: 'Associate Degree',
    bachelors: "Bachelor's Degree",
    masters: "Master's Degree",
    doctorate: 'Doctorate / PhD',
    none: 'No formal education required',
    others: 'Others',
  };
  const educationLabel = (value?: string): string =>
    value ? (educationLabelMap[value.toLowerCase()] || prettifyCode(value)) : 'Not specified';

  const employmentTypeLabel = (value?: string): string => {
    switch (value) {
      case 'full_time': return 'Full Time';
      case 'part_time': return 'Part Time';
      case 'contract': return 'Contract';
      case 'internship': return 'Internship';
      case 'temporary': return 'Temporary / Seasonal';
      default: return value ? prettifyCode(value) : 'Not specified';
    }
  };
  const workModeLabel = (value?: string): string => {
    switch (value) {
      case 'onsite': return 'Onsite';
      case 'remote': return 'Remote';
      case 'hybrid': return 'Hybrid';
      case 'field_based': return 'Field-based / Travel';
      default: return value ? prettifyCode(value) : 'Not specified';
    }
  };

  // JD lists / requirement values, read straight off the fetched JD record.
  const jdMustHaveSkills: string[] = jdDetails?.must_have_skills || [];
  const jdNiceToHaveSkills: string[] = jdDetails?.nice_to_have_skills || [];
  const jdMustHaveComments: string[] = jdDetails?.must_have_comments || [];
  const jdNiceToHaveComments: string[] = jdDetails?.nice_to_have_comments || [];

  const jdExperienceLabel = (() => {
    const min = jdDetails?.experience_min;
    const max = jdDetails?.experience_max;
    if (min != null && max != null) return `${min}–${max} years`;
    if (min != null) return `${min}+ years`;
    if (max != null) return `Up to ${max} years`;
    return 'Not specified';
  })();

  const jdEducationLabel = (() => {
    const req = jdDetails?.education_requirements;
    if (!req) return 'Not specified';
    const degree = typeof req === 'object' ? req.degree : req;
    return educationLabel(degree);
  })();

  // Header-card values, mapped the same way the published JD page maps them.
  const jdLocation: string = jdDetails?.location
    || (jdDetails?.locations?.length ? jdDetails.locations.map((l: any) => l.city).filter(Boolean).join(', ') : '');
  const jdExperienceBadge = formatJobExperienceBadge({
    jobLevel: jdDetails?.experience_level || jdDetails?.job_level,
    experienceText: formatJobExperienceText({
      jobLevel: jdDetails?.job_level || jdDetails?.experience_level,
      experienceMin: jdDetails?.experience_min,
      experienceMax: jdDetails?.experience_max,
    }),
  });
  const jdSalary = formatSalaryRange({
    min: jdDetails?.salary_min,
    max: jdDetails?.salary_max,
    currency: jdDetails?.salary_currency,
  });
  const jdPostedDate: string | undefined = jdDetails?.published_at || jdDetails?.created_at;
  const jdInternalNotes: string[] = jdDetails?.internal_comments ? [jdDetails.internal_comments] : [];

  const jdStatusBadgeClass = (status?: string) => {
    switch ((status || '').toLowerCase()) {
      case 'published': return 'bg-green-100 text-green-700 border-green-300';
      case 'draft': return 'bg-yellow-100 text-yellow-700 border-yellow-300';
      case 'archived': return 'bg-gray-100 text-gray-700 border-gray-300';
      case 'disabled': return 'bg-red-100 text-red-700 border-red-300';
      default: return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  // The published JD page strips empty "Certifications: None" blocks before
  // rendering the description markdown — same treatment here.
  const jdDescriptionMarkdown: string = (jdDetails?.description || '')
    .replace(/#+\s*Certifications[\s\S]*?(?=\n#|\n\n#|$)/gi, (match: string) =>
      match.toLowerCase().includes('none') || match.toLowerCase().includes('not required') || match.toLowerCase().includes('n/a') || match.trim().match(/^#+\s*Certifications\s*$/im) ? '' : match
    )
    .replace(/\*\*Certifications\*\*[:\s]*(?:None|None required|N\/A|Not required)\.?\s*/gi, '')
    .replace(/Certifications[:\s]*(?:None|None required|N\/A|Not required)\.?\s*/gi, '');

  // Close the Invite menu on outside click / Escape.
  useEffect(() => {
    if (!showInviteMenu) return;
    const onPointerDown = (e: MouseEvent) => {
      if (inviteMenuRef.current && !inviteMenuRef.current.contains(e.target as Node)) {
        setShowInviteMenu(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowInviteMenu(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showInviteMenu]);

  // The resume this score belongs to — the API returns the score id as `id`
  // and the resume id separately, so prefer the explicit resume id.
  const viewResumeId = fullResumeData.resumeId || resume.resumeId || resume.id;

  const handleViewResume = async () => {
    if (!viewResumeId) {
      toast.error('Resume is not available for this candidate');
      return;
    }
    setView('resume');
    if (resumeDetail || loadingResumeDetail) return;

    setLoadingResumeDetail(true);
    try {
      const { resumeService } = await import('@/lib/services/resumeService');
      const { convertApiResume } = await import('@/lib/utils/resumeMapper');
      // The API record is snake_case — ResumeDetailView needs the mapped shape.
      const [data, versions] = await Promise.all([
        resumeService.get(viewResumeId),
        resumeService.getVersions(viewResumeId).catch(() => []),
      ]);
      setResumeDetail(convertApiResume(data, versions || []));
    } catch (err) {
      console.error('[CandidateScoringDetailPage] Failed to load resume:', err);
      toast.error('Could not load the resume. Please try again.');
      setView('candidate');
    } finally {
      setLoadingResumeDetail(false);
    }
  };

  // Invite for assessment — same selection rules the JD page uses: only
  // published, non-revoked assessments for this JD are invitable.
  const handleInviteForAssessment = async () => {
    setShowInviteMenu(false);
    if (loadingInvite) return;

    setLoadingInvite('assessment');
    try {
      const { assessmentService } = await import('@/lib/services/assessmentService');
      const { isAssessmentRevoked, getLocallyRevokedAssessmentIds } = await import('@/lib/utils/assessmentUtils');

      const resp = await assessmentService.list({ jd_id: jobId, status: 'published', page_size: 100 });
      const revokedIds = getLocallyRevokedAssessmentIds();
      const items: any[] = (resp?.items || []).filter((a: any) => {
        const status = String(a?.status || '').toLowerCase();
        if (status !== 'published' && status !== 'active') return false;
        return !isAssessmentRevoked(a, revokedIds);
      });

      if (items.length === 0) {
        toast.error(
          'No invitable assessment is available for this job. Published assessments whose invites have been revoked are excluded — duplicate one to start a fresh invite round.',
          { duration: 6000 }
        );
        return;
      }

      if (items.length === 1) {
        setShareAssessments(items);
        setShowShareAssessmentModal(true);
        return;
      }

      setPickerAssessments(items);
      setPickerSelectedIds([]);
      setShowAssessmentPicker(true);
    } catch (err) {
      console.error('[CandidateScoringDetailPage] Failed to load assessments:', err);
      toast.error('Could not load assessments. Please try again.');
    } finally {
      setLoadingInvite(null);
    }
  };

  const handleConfirmAssessmentPick = () => {
    if (pickerSelectedIds.length === 0) {
      toast.error('Please select at least one assessment.');
      return;
    }
    setShareAssessments(pickerAssessments.filter(a => pickerSelectedIds.includes(a.id)));
    setShowAssessmentPicker(false);
    setShowShareAssessmentModal(true);
  };

  // Invite for AI interview — needs a published interview config on this JD,
  // the same precondition the AI Interviews page enforces.
  const handleInviteForAIInterview = async () => {
    setShowInviteMenu(false);
    if (loadingInvite) return;

    setLoadingInvite('ai-interview');
    try {
      const { aiInterviewService } = await import('@/lib/services/aiInterviewService');
      const resp = await aiInterviewService.list({ page_size: 100 });
      const forThisJd = (resp?.items || []).filter((c: any) => c.jd_id === jobId);
      const published = forThisJd.find((c: any) => {
        const status = String(c?.status || '').toLowerCase();
        return status === 'published' || status === 'active';
      });

      if (!published) {
        toast.error('Create and publish an AI interview for this job before inviting candidates.', { duration: 6000 });
        return;
      }

      setShareAIConfig(published);
    } catch (err) {
      console.error('[CandidateScoringDetailPage] Failed to load AI interviews:', err);
      toast.error('Could not load AI interviews. Please try again.');
    } finally {
      setLoadingInvite(null);
    }
  };

  const handleDownloadScorecard = async () => {
    const toastId = toast.loading('Generating scorecard PDF...');

    try {
      console.log('[Download] Starting PDF download for score_id:', fullResumeData.id);

      // Get token from localStorage
      const token = localStorage.getItem('accessToken');
      if (!token) {
        toast.error('Please login to download scorecard', { id: toastId });
        return;
      }

      // Call the backend API to get PDF
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
      const response = await fetch(`${API_URL}/scoring/scores/${fullResumeData.id}/download-pdf`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      // Handle 401 - logout and redirect
      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        console.error('[Download] Failed:', response.status, errorData);

        // Provide user-friendly error message
        let errorMessage = 'Failed to download scorecard. Please try again later.';

        if (response.status === 404) {
          errorMessage = 'Scorecard not found. The score may have been deleted.';
        } else if (response.status === 500) {
          errorMessage = 'Server error while generating scorecard. Our team has been notified.';
        } else if (response.status === 403) {
          errorMessage = 'You do not have permission to download this scorecard.';
        }

        toast.error(errorMessage, { id: toastId, duration: 5000 });
        return;
      }

      // Get the PDF blob
      const blob = await response.blob();

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fullResumeData.candidateName.replace(/\s+/g, '_')}_Scorecard.pdf`;
      document.body.appendChild(a);
      a.click();

      // Cleanup
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('Scorecard downloaded successfully', { id: toastId });
      console.log('[Download] PDF downloaded successfully');
    } catch (error) {
      console.error('[Download] Error:', error);
      toast.error('Failed to download scorecard. Please try again.', { id: toastId });
    }
  };

  // Show loading state while waiting for complete data
  if (!isDataReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-white flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 text-gray-800 animate-spin inline-block mb-4" />
          <p className="text-gray-600 font-medium">Loading candidate details...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full min-h-[calc(100vh-7rem)] bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl">
          {/* In the resume view the Candidate Details crumb becomes clickable
              (onClick, not href — we never left this route). */}
          <PageBreadcrumb
            className="mb-4 md:mb-6"
            // Previous / Next rides inside the breadcrumb bar, as on
            // job-details. Dropped in the resume view, where paging to the next
            // candidate from someone else's resume reads as a bug.
            actions={view !== 'resume' ? (
              <RecordPager
                currentIndex={currentIndex}
                totalCount={totalCount}
                onPrev={onPrev}
                onNext={onNext}
              />
            ) : undefined}
            items={(() => {
              // Deepest crumb names the record being viewed (the candidate),
              // not a generic page label.
              const base = breadcrumbItems ?? [
                { label: 'Dashboard', href: '/dashboard' },
                { label: 'Resume Scoring', href: '/recruitment/resume-scoring' },
                { label: jobTitle, href: `/recruitment/resume-scoring?jd_id=${jobId}` },
                { label: resume.candidateName || 'Candidate' },
              ];
              if (view !== 'resume') return base;
              return [
                ...base.slice(0, -1),
                { ...base[base.length - 1], onClick: () => setView('candidate') },
                { label: 'Resume' },
              ];
            })()}
          />

          {view === 'resume' ? (
            loadingResumeDetail || !resumeDetail ? (
              <div className="flex items-center justify-center gap-2 text-gray-500 py-20">
                <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
                <span className="text-sm">Loading resume...</span>
              </div>
            ) : (
              <ResumeDetailView
                embedded
                resume={resumeDetail}
                onClose={() => setView('candidate')}
              />
            )
          ) : (
          <>

      {/* Header */}
      <div>
        <div className="bg-white rounded-xl shadow-lg border-2 border-gray-200 p-4 sm:p-6">
          {/* Row 1: candidate identity. The record pager that used to sit on
              the right moved into the breadcrumb bar, as on job-details. */}
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl text-gray-900 font-bold mb-2 truncate">{resume.candidateName}</h1>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <p className="text-base sm:text-lg text-gray-700 font-medium">{resume.title || resume.experience || 'Candidate'}</p>
                {resume.resumeVersion && (
                  <span className="inline-flex items-center px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md text-xs sm:text-sm font-medium bg-blue-50 text-blue-700 border border-blue-200">
                    Version {resume.resumeVersion}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Row 2: contact badges and actions share one line — badges left,
              actions right (Invite primary > View Resume > Download quiet). */}
          <div className="flex flex-wrap items-center gap-2 mb-4 sm:mb-6 text-sm text-gray-600">
            <span className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200 min-w-0 max-w-full">
              <Mail className="w-4 h-4 text-gray-800 flex-shrink-0" />
              <span className={`truncate ${resume.email ? 'text-gray-900' : 'text-gray-400'}`}>{resume.email || '-'}</span>
            </span>
            <span className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200">
              <Phone className="w-4 h-4 text-green-600 flex-shrink-0" />
              <span className={`whitespace-nowrap ${resume.phone ? 'text-gray-900' : 'text-gray-400'}`}>{resume.phone || '-'}</span>
            </span>
            {resume.location && (
              <span className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200 min-w-0">
                <MapPin className="w-4 h-4 text-red-500 flex-shrink-0" />
                <span className="text-gray-900 truncate">{resume.location}</span>
              </span>
            )}

            {/* ml-auto keeps the actions right-aligned on one line, and simply
                wraps to the next line when the badges run out of room. */}
            <div className="flex flex-wrap items-center gap-2 ml-auto">
              {canInvite && (
                <div className="relative" ref={inviteMenuRef}>
                  <button
                    onClick={() => setShowInviteMenu(!showInviteMenu)}
                    disabled={!!loadingInvite}
                    aria-haspopup="menu"
                    aria-expanded={showInviteMenu}
                    className="px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-medium text-white bg-brand-blue rounded-lg shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 hover:bg-brand-blue-2 transition-colors flex items-center gap-1.5 whitespace-nowrap"
                  >
                    {loadingInvite ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                    Invite
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showInviteMenu ? 'rotate-180' : ''}`} />
                  </button>

                  {showInviteMenu && (
                    <div
                      role="menu"
                      className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl border border-gray-200 shadow-lg shadow-gray-900/10 py-1.5 z-30"
                    >
                      {canInviteAssessment && (
                        <button
                          role="menuitem"
                          onClick={handleInviteForAssessment}
                          className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-brand-blue/5 transition-colors"
                        >
                          <span className="mt-0.5 w-8 h-8 rounded-lg bg-brand-blue/10 flex items-center justify-center flex-shrink-0">
                            <Mail className="w-4 h-4 text-brand-blue" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-gray-900">Assessment Invite</span>
                            <span className="block text-xs text-gray-500">Send a skills assessment for this job</span>
                          </span>
                        </button>
                      )}
                      {canInviteAIInterview && (
                        <button
                          role="menuitem"
                          onClick={handleInviteForAIInterview}
                          className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-brand-blue/5 transition-colors"
                        >
                          <span className="mt-0.5 w-8 h-8 rounded-lg bg-brand-cyan/10 flex items-center justify-center flex-shrink-0">
                            <Sparkles className="w-4 h-4 text-brand-cyan" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-gray-900">AI Interview</span>
                            <span className="block text-xs text-gray-500">Invite the candidate to an AI interview</span>
                          </span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              <ViewResumeButton onClick={handleViewResume} loading={loadingResumeDetail} />

              {canExport && (
                <button
                  onClick={handleDownloadScorecard}
                  title="Download scorecard PDF"
                  className="px-3 sm:px-4 py-1.5 text-xs sm:text-sm text-gray-700 border border-gray-300 bg-white rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Download className="w-4 h-4" />
                  <span className="hidden lg:inline">Download Scorecard</span>
                  <span className="lg:hidden">Scorecard</span>
                </button>
              )}
            </div>
          </div>

          {/* Score Display - Compact */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 bg-gray-50 rounded-lg px-3 sm:px-4 py-2.5 sm:py-3 border border-gray-200">
            <div className="flex flex-wrap items-center gap-2 sm:gap-4">
              <div className={`text-2xl sm:text-3xl font-bold ${getScoreColor(fullResumeData.scorePercentage)}`}>{fullResumeData.scorePercentage}%</div>
              <span className={`px-2 sm:px-3 py-1 rounded-md text-xs sm:text-sm font-medium border whitespace-nowrap ${getMatchStatusColor(fullResumeData.matchStatus || resume.matchStatus)}`}>
                {formatMatchStatus(fullResumeData.matchStatus || resume.matchStatus)}
              </span>
              <span className="hidden sm:inline text-gray-400">|</span>
              <span className="text-xs sm:text-sm font-normal text-gray-700 truncate"><span className="font-bold text-gray-800">Job Title :</span> {jobTitle}</span>
            </div>
            <div className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">
              {fullResumeData.scoredDate && !isNaN(new Date(fullResumeData.scoredDate).getTime())
                ? formatIST(fullResumeData.scoredDate)
                : fullResumeData.scoredDate}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="pt-4 sm:pt-6">
        <div className="bg-white rounded-t-xl border-x-2 border-t-2 border-gray-200">
          <div className="flex gap-1 px-3 sm:px-6 pt-2 overflow-x-auto scrollbar-hide">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'scoretable', label: 'Score Table' },
              { id: 'personalinfo', label: 'Personal Info' },
              { id: 'viewjd', label: 'View JD' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 sm:px-6 py-2.5 sm:py-3 text-xs sm:text-sm font-medium transition-colors rounded-t-lg whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'text-gray-800 bg-gray-50 border-b-2 border-gray-600'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div>
        <div className="bg-white rounded-b-xl border-x-2 border-b-2 border-gray-200 p-4 sm:p-6 lg:p-8">
          {/* {activeTab === 'comparison' && (
            <div className="space-y-6">
              <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-6">Candidate vs Job Requirements - {jobTitle}</h3>
                <div className="grid grid-cols-2 gap-8">
                  <div>
                    <h4 className="font-medium text-gray-700 mb-4 text-lg">Candidate Strengths</h4>
                    <ul className="space-y-3 text-gray-600">
                      {keyStrengths.length > 0 ? keyStrengths.map((strength, idx) => (
                        <li key={idx} className="flex items-start gap-3">
                          <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                          <span>{strength}</span>
                        </li>
                      )) : (
                        <li className="flex items-start gap-3">
                          <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                          <span>No specific strengths identified</span>
                        </li>
                      )}
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-700 mb-4 text-lg">Candidate Profile</h4>
                    <ul className="space-y-3 text-gray-600">
                      <li className="flex items-start gap-3">
                        <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                        <span><strong>Experience:</strong> {resume.experience || 'Not specified'}</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                        <span><strong>Skills:</strong> {matchedSkills.length} matched skills</span>
                      </li>
                      <li className="flex items-start gap-3">
                        {resume.currentCompany ? (
                          <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                        )}
                        <span><strong>Company:</strong> {resume.currentCompany || 'Not specified'}</span>
                      </li>
                      <li className="flex items-start gap-3">
                        {resume.education ? (
                          <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                        )}
                        <span><strong>Education:</strong> {
                          typeof resume.education === 'string'
                            ? resume.education
                            : Array.isArray(resume.education) && resume.education.length > 0
                              ? (resume.education[0]?.degree || resume.education[0]?.institution || 'Education available')
                              : 'Not specified'
                        }</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="bg-white border-2 border-orange-200 rounded-xl p-6">
                <h4 className="font-medium text-orange-700 mb-4 text-lg flex items-center gap-2">
                  <AlertCircle className="w-5 h-5" />
                  Areas for Development
                </h4>
                <ul className="space-y-3 text-gray-600">
                  {improvementAreas.map((area, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <div className="w-2 h-2 bg-orange-500 rounded-full mt-2 flex-shrink-0"></div>
                      <span>{area}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className={`rounded-xl p-6 border-2 ${
                resume.scorePercentage >= 85
                  ? 'bg-green-50 border-green-300'
                  : resume.scorePercentage >= 70
                  ? 'bg-gray-50 border-gray-300'
                  : resume.scorePercentage >= 60
                  ? 'bg-yellow-50 border-yellow-300'
                  : 'bg-red-50 border-red-300'
              }`}>
                <h4 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Award className="w-5 h-5" />
                  Overall Recommendation
                </h4>
                <p className="text-gray-700">
                  {resume.scorePercentage >= 85
                    ? 'Highly recommended candidate. Strong alignment with job requirements across all key areas. Proceed to interview stage immediately.'
                    : resume.scorePercentage >= 70
                    ? 'Good candidate with solid qualifications. Some minor gaps that can be addressed. Recommended for interview consideration.'
                    : resume.scorePercentage >= 60
                    ? 'Moderate fit. Consider if pipeline is limited, but may require additional training and development.'
                    : 'Limited fit for this role. Significant gaps in required qualifications. Consider other opportunities.'}
                </p>
              </div>
            </div>
          )} */}

          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* JD Summary */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <BookOpen className="w-5 h-5 text-gray-700" />
                  <h3 className="text-lg font-semibold text-gray-900">Job Description Summary</h3>
                </div>
                {jdDetails ? (
                  <ul className="space-y-2">
                    <li className="flex items-start gap-2 text-sm text-gray-700">
                      <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <span><strong>Role:</strong> {jobTitle}{jdDetails.location ? ` — ${jdDetails.location}` : ''}{jdDetails.employment_type ? ` (${jdDetails.employment_type.replace(/_/g, ' ')})` : ''}</span>
                    </li>
                    {(jdDetails.experience_min || jdDetails.experience_max) && (
                      <li className="flex items-start gap-2 text-sm text-gray-700">
                        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span><strong>Experience:</strong> {jdDetails.experience_min && jdDetails.experience_max ? `${jdDetails.experience_min}–${jdDetails.experience_max} years` : jdDetails.experience_min ? `${jdDetails.experience_min}+ years` : `Up to ${jdDetails.experience_max} years`}</span>
                      </li>
                    )}
                    {jdDetails.must_have_skills?.map((skill: string, i: number) => (
                      <li key={`must-${i}`} className="flex items-start gap-2 text-sm text-gray-700">
                        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>{skill}</span>
                      </li>
                    ))}
                    {jdDetails.must_have_comments?.map((comment: string, i: number) => (
                      <li key={`mc-${i}`} className="flex items-start gap-2 text-sm text-gray-700">
                        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>{comment}</span>
                      </li>
                    ))}
                    {jdDetails.nice_to_have_skills?.map((skill: string, i: number) => (
                      <li key={`nice-${i}`} className="flex items-start gap-2 text-sm text-gray-500">
                        <CheckCircle className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                        <span>{skill} <span className="text-xs text-gray-400">(preferred)</span></span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="flex items-center gap-2 text-gray-500 py-2">
                    <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />
                    <span className="text-sm">Loading job details...</span>
                  </div>
                )}
              </div>

              {/* Strengths & Weaknesses */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Strengths */}
                <div className="bg-green-50 border border-green-200 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <ThumbsUp className="w-5 h-5 text-green-600" />
                    <h3 className="text-lg font-semibold text-gray-900">Strengths</h3>
                  </div>
                  {keyStrengths.length > 0 ? (
                    <ul className="space-y-3">
                      {keyStrengths.map((strength: string, idx: number) => (
                        <li key={idx} className="flex items-start gap-3">
                          <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <span className="text-sm text-gray-800">{strength}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-500">No strengths data available.</p>
                  )}
                </div>

                {/* Weaknesses */}
                <div className="bg-red-50 border border-red-200 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <ThumbsDown className="w-5 h-5 text-red-500" />
                    <h3 className="text-lg font-semibold text-gray-900">Weaknesses</h3>
                  </div>
                  {(improvementAreas.length > 0 || missingSkills.length > 0) ? (
                    <ul className="space-y-3">
                      {improvementAreas.map((gap: string, idx: number) => (
                        <li key={`gap-${idx}`} className="flex items-start gap-3">
                          <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                          <span className="text-sm text-gray-800">{gap}</span>
                        </li>
                      ))}
                      {missingSkills.length > 0 && (
                        <li className="flex items-start gap-3">
                          <AlertCircle className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                          <span className="text-sm text-gray-800">
                            Missing skills: {missingSkills.join(', ')}
                          </span>
                        </li>
                      )}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-500">No weaknesses identified.</p>
                  )}
                </div>
              </div>

              {/* AI Analysis Summary */}
              {aiReasoning && (
                <div className="bg-white border border-gray-200 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <MessageSquare className="w-5 h-5 text-gray-700" />
                    <h3 className="text-lg font-semibold text-gray-900">AI Analysis</h3>
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">{aiReasoning}</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'scoretable' && (
            <DetailedScorecardTab
              resume={{
                scorePercentage: fullResumeData.scorePercentage,
                scoredDate: fullResumeData.scoredDate,
                scoredBy: fullResumeData.scoredBy,
                detailedScores: detailedScores,
                certifications: resume.certifications,
                education: resume.education,
                location: resume.location,
                title: resume.title,
                // Pass API data for accurate scoring display
                scoreBreakdown: fullResumeData.scoreBreakdown,
                criteriaScores: fullResumeData.criteriaScores,
              }}
              jobTitle={jobTitle}
              aiReasoning={aiReasoning}
              getScoreColor={getScoreColor}
              getScoreBgColor={getScoreBgColor}
              getProgressBarColor={getProgressBarColor}
            />
          )}

          {activeTab === 'personalinfo' && (
            <div className="space-y-6">
              {/* Warning if full resume data couldn't be loaded */}
              {!fullResumeLoaded && (
                <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-yellow-800 font-medium">Limited resume data available</p>
                    <p className="text-yellow-700 text-sm mt-1">
                      Some details may be missing. View the full resume in{' '}
                      <a href={`/recruitment/resume-view/${fullResumeData.resumeId || resume.resumeId || resume.id}`} className="underline hover:text-yellow-900">
                        Resume Details
                      </a>{' '}
                      for complete information, or re-upload the resume to refresh data.
                    </p>
                  </div>
                </div>
              )}

              {/* Personal Info Card - Same as Resume View */}
              <div className="bg-gray-50 border border-gray-300 rounded-xl p-6 shadow-sm">
                <div>
                    <div className="mb-4">
                      <h2 className="text-2xl font-bold text-gray-900 mb-2">{fullResumeData.candidateName || resume.candidateName}</h2>
                      <div className="flex items-center gap-3 mb-3">
                        <p className="text-lg text-gray-700">{fullResumeData.title || resume.title || 'Candidate'}</p>
                        {resume.resumeVersion && (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-sm font-medium bg-blue-50 text-blue-700 border border-blue-200">
                            Version {resume.resumeVersion}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-600 flex-wrap">
                        {fullResumeData.location && fullResumeData.location !== 'N/A' && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-4 h-4" />
                            {fullResumeData.location}
                          </span>
                        )}
                        {fullResumeData.experience && fullResumeData.experience !== 'N/A' && fullResumeData.experience !== '' && (
                          <span className="flex items-center gap-1">
                            <Briefcase className="w-4 h-4" />
                            {fullResumeData.experience}
                          </span>
                        )}
                        {fullResumeData.currentCompany && fullResumeData.currentCompany !== 'N/A' && fullResumeData.currentCompany !== '' && (
                          <span className="flex items-center gap-1">
                            <Building2 className="w-4 h-4" />
                            {fullResumeData.currentCompany}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Contact Info */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <Mail className="w-4 h-4 text-gray-500" />
                        {resume.email ? (
                          <a href={`mailto:${resume.email}`} className="hover:text-gray-900">{resume.email}</a>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <Phone className="w-4 h-4 text-gray-500" />
                        {resume.phone ? (
                          <a href={`tel:${resume.phone}`} className="hover:text-gray-900">{resume.phone}</a>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </div>
                    </div>

                    {/* Top Skills Tags */}
                    {(fullResumeData.skills?.length > 0 || fullResumeData.technicalSkills?.length > 0) && (
                      <div className="flex flex-wrap gap-2">
                        {(fullResumeData.technicalSkills || fullResumeData.skills || []).slice(0, 8).map((skill: string, index: number) => (
                          <span key={index} className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs border border-gray-300">
                            {skill}
                          </span>
                        ))}
                      </div>
                    )}
                </div>
              </div>

              {/* Professional Summary - Only show actual resume summary, NOT AI scoring summary */}
              {fullResumeData.professionalSummary && (
              <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Star className="w-5 h-5 text-gray-500" />
                  <h3 className="text-lg font-semibold text-gray-800">Professional Summary</h3>
                </div>
                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {fullResumeData.professionalSummary}
                </p>
              </div>
              )}

              {/* Work Experience */}
              <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
                <div className="flex items-center gap-2 mb-6">
                  <Briefcase className="w-5 h-5 text-gray-500" />
                  <h3 className="text-lg font-semibold text-gray-800">Work Experience</h3>
                </div>
                {fullResumeData.experienceDetails && fullResumeData.experienceDetails.length > 0 ? (
                  <div className="space-y-6">
                    {fullResumeData.experienceDetails.map((exp: any, index: number) => (
                      <div key={index} className="relative pl-6 pb-6 border-l-2 border-gray-400 last:pb-0">
                        <div className="absolute -left-2 top-0 w-4 h-4 rounded-full bg-gray-500 border-2 border-gray-50"></div>
                        <div className="mb-3">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <h4 className="font-semibold text-gray-900 mb-1">{exp.title || exp.position || 'Position'}</h4>
                              <div className="flex items-center gap-2 text-gray-700 mb-1">
                                <Building2 className="w-4 h-4" />
                                <span>{exp.company || 'Company'}</span>
                              </div>
                              <div className="flex items-center gap-4 text-sm text-gray-600">
                                {exp.location && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />
                                    {exp.location}
                                  </span>
                                )}
                                {(exp.start_date || exp.end_date) && (
                                  <span className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {exp.start_date || ''} - {exp.end_date || 'Present'}
                                  </span>
                                )}
                                {exp.duration && (
                                  <span className="text-gray-600">({exp.duration})</span>
                                )}
                              </div>
                            </div>
                          </div>
                          {exp.description && (
                            <p className="text-gray-700 mb-3">{exp.description}</p>
                          )}
                          {exp.achievements && exp.achievements.length > 0 && (
                            <div className="space-y-2">
                              {exp.achievements.map((achievement: string, achIndex: number) => (
                                <div key={achIndex} className="flex items-start gap-2 text-sm text-gray-700">
                                  <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
                                  <span>{achievement}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 bg-gray-100 border border-gray-300 rounded-lg text-center">
                    <p className="text-gray-600">Work experience details not available.</p>
                    <p className="text-sm text-gray-500 mt-2">Please re-upload the resume to extract full details.</p>
                  </div>
                )}
              </div>

              {/* Education */}
              <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
                <div className="flex items-center gap-2 mb-6">
                  <GraduationCap className="w-5 h-5 text-gray-500" />
                  <h3 className="text-lg font-semibold text-gray-800">Education</h3>
                </div>
                {fullResumeData.educationDetails && fullResumeData.educationDetails.length > 0 ? (
                  <div className="space-y-4">
                    {fullResumeData.educationDetails.map((edu: any, index: number) => (
                      <div key={index} className="p-4 bg-gray-100 border border-gray-300 rounded-lg">
                        <h4 className="font-semibold text-gray-800 mb-1">
                          {edu.degree || edu.qualification || 'Degree'}
                          {edu.field && ` in ${edu.field}`}
                        </h4>
                        {(edu.institution || edu.school) && (
                          <div className="text-gray-700 mb-1">{edu.institution || edu.school}</div>
                        )}
                        <div className="flex items-center gap-4 text-sm text-gray-600">
                          {(edu.year || edu.graduation_year) && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {edu.year || edu.graduation_year}
                            </span>
                          )}
                          {edu.gpa && <span className="text-gray-700">GPA: {edu.gpa}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 bg-gray-100 border border-gray-300 rounded-lg">
                    <h4 className="font-semibold text-gray-800 mb-2">{
                      typeof fullResumeData.education === 'string'
                        ? fullResumeData.education
                        : Array.isArray(fullResumeData.education) && fullResumeData.education.length > 0
                          ? (fullResumeData.education[0]?.degree || fullResumeData.education[0]?.institution || 'Education available')
                          : 'Education not specified'
                    }</h4>
                  </div>
                )}
              </div>

              {/* Skills */}
              {(fullResumeData.skills && fullResumeData.skills.length > 0) ||
               (fullResumeData.technicalSkills && fullResumeData.technicalSkills.length > 0) ||
               (fullResumeData.softSkills && fullResumeData.softSkills.length > 0) ||
               matchedSkills.length > 0 ? (
                <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <Code className="w-5 h-5 text-gray-500" />
                    <h3 className="text-lg font-semibold text-gray-800">Skills</h3>
                  </div>

                  {/* Technical Skills */}
                  {fullResumeData.technicalSkills && fullResumeData.technicalSkills.length > 0 && (
                    <div className="mb-6">
                      <h4 className="font-medium text-gray-900 mb-4">Technical Skills</h4>
                      <div className="flex flex-wrap gap-2">
                        {fullResumeData.technicalSkills.map((skill: string, index: number) => (
                          <span key={index} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm border border-gray-300">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Soft Skills */}
                  {fullResumeData.softSkills && fullResumeData.softSkills.length > 0 && (
                    <div className="mb-6">
                      <h4 className="font-medium text-gray-900 mb-4">Soft Skills</h4>
                      <div className="flex flex-wrap gap-2">
                        {fullResumeData.softSkills.map((skill: string, index: number) => (
                          <span key={index} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm border border-gray-300">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* General Skills - only show if no technical/soft skills */}
                  {fullResumeData.skills && fullResumeData.skills.length > 0 && !fullResumeData.technicalSkills?.length && !fullResumeData.softSkills?.length && (
                    <div className="flex flex-wrap gap-2">
                      {fullResumeData.skills.map((skill: string, index: number) => (
                        <span key={index} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm border border-gray-300">
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Fallback to matched skills if no specific skills available */}
                  {!fullResumeData.skills?.length && !fullResumeData.technicalSkills?.length && !fullResumeData.softSkills?.length && matchedSkills.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {matchedSkills.map((skill, index) => (
                        <span key={index} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm border border-gray-300">
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              {/* Languages */}
              {fullResumeData.languages && fullResumeData.languages.length > 0 && (
                <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <Languages className="w-5 h-5 text-gray-500" />
                    <h3 className="text-lg font-semibold text-gray-800">Languages</h3>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                    {fullResumeData.languages.map((language: any, index: number) => {
                      // Handle both string and object formats
                      const langName = typeof language === 'string' ? language : (language.name || language.language || 'Unknown');
                      const proficiency = typeof language === 'object' ? (language.proficiency || language.level || 'Fluent') : 'Fluent';
                      return (
                        <div key={index} className="p-4 bg-gray-100 border border-gray-300 rounded-lg text-center">
                          <div className="font-medium text-gray-800 mb-1">{langName}</div>
                          <div className="text-sm text-gray-600">{proficiency}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Certifications */}
              {fullResumeData.certifications && fullResumeData.certifications.length > 0 && (
                <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <Award className="w-5 h-5 text-gray-500" />
                    <h3 className="text-lg font-semibold text-gray-800">Certifications</h3>
                  </div>
                  <div className="space-y-4">
                    {fullResumeData.certifications.map((cert, index) => {
                      // Handle both string and object formats
                      const certName = typeof cert === 'string' ? cert : (cert.name || 'Certification');
                      const certIssuer = typeof cert === 'object' ? cert.issuer : null;
                      const certDate = typeof cert === 'object' ? cert.date : null;
                      const certCredentialId = typeof cert === 'object' ? cert.credential_id : null;
                      return (
                        <div key={index} className="p-4 bg-gray-100 border border-gray-300 rounded-lg">
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="font-semibold text-gray-800 mb-1">{certName}</h4>
                              {certIssuer && <div className="text-sm text-gray-700 mb-1">{certIssuer}</div>}
                              <div className="flex items-center gap-4 text-xs text-gray-600">
                                {certDate && (
                                  <span className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    Issued {certDate}
                                  </span>
                                )}
                                {certCredentialId && <span>ID: {certCredentialId}</span>}
                              </div>
                            </div>
                            <Award className="w-6 h-6 text-gray-500" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Projects */}
              {fullResumeData.projects && fullResumeData.projects.length > 0 && (
                <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <Code className="w-5 h-5 text-gray-500" />
                    <h3 className="text-lg font-semibold text-gray-800">Projects</h3>
                  </div>
                  <div className="space-y-4">
                    {fullResumeData.projects.map((project: any, index: number) => (
                      <div key={index} className="p-4 bg-gray-100 border border-gray-300 rounded-lg">
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-semibold text-gray-800">{project.name}</h4>
                          {project.url && (
                            <a href={project.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800">
                              <FileText className="w-4 h-4" />
                            </a>
                          )}
                        </div>
                        {project.description && (
                          <p className="text-gray-700 text-sm mb-2">{project.description}</p>
                        )}
                        <div className="flex flex-wrap gap-2 text-xs text-gray-600">
                          {project.duration && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {project.duration}
                            </span>
                          )}
                          {project.technologies && (
                            <span className="px-2 py-0.5 bg-gray-200 rounded">{project.technologies}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Awards */}
              {fullResumeData.awards && fullResumeData.awards.length > 0 && (
                <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <Award className="w-5 h-5 text-yellow-500" />
                    <h3 className="text-lg font-semibold text-gray-800">Awards & Honors</h3>
                  </div>
                  <div className="space-y-4">
                    {fullResumeData.awards.map((award: any, index: number) => (
                      <div key={index} className="p-4 bg-gray-100 border border-gray-300 rounded-lg">
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="font-semibold text-gray-800 mb-1">{award.name}</h4>
                            {award.issuer && <div className="text-sm text-gray-700">{award.issuer}</div>}
                            {award.date && (
                              <div className="text-xs text-gray-600 flex items-center gap-1 mt-1">
                                <Calendar className="w-3 h-3" />
                                {award.date}
                              </div>
                            )}
                            {award.description && (
                              <p className="text-sm text-gray-600 mt-2">{award.description}</p>
                            )}
                          </div>
                          <Award className="w-6 h-6 text-yellow-500" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Achievements */}
              {fullResumeData.achievements && fullResumeData.achievements.length > 0 && (
                <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <Star className="w-5 h-5 text-gray-500" />
                    <h3 className="text-lg font-semibold text-gray-800">Achievements</h3>
                  </div>
                  <div className="space-y-2">
                    {fullResumeData.achievements.map((achievement: any, index: number) => (
                      <div key={index} className="flex items-start gap-2 text-gray-700">
                        <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
                        <span>{typeof achievement === 'string' ? achievement : achievement.description || achievement.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Hobbies & Interests */}
              {fullResumeData.hobbies && fullResumeData.hobbies.length > 0 && (
                <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <Star className="w-5 h-5 text-gray-500" />
                    <h3 className="text-lg font-semibold text-gray-800">Hobbies & Interests</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {fullResumeData.hobbies.map((hobby: any, index: number) => (
                      <span key={index} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm border border-gray-300">
                        {typeof hobby === 'string' ? hobby : hobby.name || hobby}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Social Links */}
              {(fullResumeData.linkedinUrl || fullResumeData.githubUrl || fullResumeData.portfolioUrl) && (
                <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <FileText className="w-5 h-5 text-gray-500" />
                    <h3 className="text-lg font-semibold text-gray-800">Social & Portfolio Links</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                    {fullResumeData.linkedinUrl && (
                      <a href={fullResumeData.linkedinUrl} target="_blank" rel="noopener noreferrer"
                         className="flex items-center gap-2 p-4 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors">
                        <span className="text-blue-700 text-sm font-medium">LinkedIn</span>
                      </a>
                    )}
                    {fullResumeData.githubUrl && (
                      <a href={fullResumeData.githubUrl} target="_blank" rel="noopener noreferrer"
                         className="flex items-center gap-2 p-4 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 transition-colors">
                        <span className="text-gray-700 text-sm font-medium">GitHub</span>
                      </a>
                    )}
                    {fullResumeData.portfolioUrl && (
                      <a href={fullResumeData.portfolioUrl} target="_blank" rel="noopener noreferrer"
                         className="flex items-center gap-2 p-4 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors">
                        <span className="text-purple-700 text-sm font-medium">Portfolio</span>
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Notice Period */}
              {fullResumeData.noticePeriod && (
                <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Clock className="w-5 h-5 text-gray-500" />
                    <h3 className="text-lg font-semibold text-gray-800">Notice Period</h3>
                  </div>
                  <p className="text-gray-700">{fullResumeData.noticePeriod}</p>
                </div>
              )}

              {/* Volunteer Experience */}
              {fullResumeData.volunteerExperience && fullResumeData.volunteerExperience.length > 0 && (
                <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <Star className="w-5 h-5 text-gray-500" />
                    <h3 className="text-lg font-semibold text-gray-800">Volunteer Experience</h3>
                  </div>
                  <div className="space-y-4">
                    {fullResumeData.volunteerExperience.map((vol: any, index: number) => (
                      <div key={index} className="p-4 bg-gray-100 border border-gray-300 rounded-lg">
                        <h4 className="font-semibold text-gray-800 mb-1">{vol.role || vol.title}</h4>
                        {vol.organization && <div className="text-sm text-gray-700 mb-1">{vol.organization}</div>}
                        {vol.duration && (
                          <div className="text-xs text-gray-600 flex items-center gap-1 mb-2">
                            <Calendar className="w-3 h-3" />
                            {vol.duration}
                          </div>
                        )}
                        {vol.description && <p className="text-sm text-gray-600">{vol.description}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Objective */}
              {fullResumeData.objective && fullResumeData.objective !== fullResumeData.professionalSummary && (
                <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <FileText className="w-5 h-5 text-gray-500" />
                    <h3 className="text-lg font-semibold text-gray-800">Career Objective</h3>
                  </div>
                  <p className="text-gray-700 leading-relaxed">{fullResumeData.objective}</p>
                </div>
              )}
            </div>
          )}

          {/* View JD — the full job description as the published JD page shows
              it, scoped to the JD this candidate was scored against. */}
          {activeTab === 'viewjd' && (
            <div className="space-y-6">
              {!jdDetails ? (
                <div className="flex items-center gap-2 text-gray-500 py-6">
                  <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />
                  <span className="text-sm">Loading job details...</span>
                </div>
              ) : (
                <>
                  {/* JD header card — JD ID, title, status, and the meta row */}
                  <div className="bg-gray-50 border border-gray-300 rounded-xl p-4 sm:p-5">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      {jdDetails.job_id && (
                        <span className="inline-flex items-center px-2 py-0.5 bg-blue-600 text-white rounded-md text-xs font-semibold font-mono tracking-wide">
                          {jdDetails.job_id}
                        </span>
                      )}
                      <h3 className="text-base sm:text-lg font-semibold text-gray-900">{jdDetails.title || jobTitle}</h3>
                      {jdDetails.status && (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border whitespace-nowrap ${jdStatusBadgeClass(jdDetails.status)}`}>
                          {prettifyCode(jdDetails.status)}
                        </span>
                      )}
                      {jdDetails.creation_method === 'ai_generated' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-200">
                          <Zap className="w-3 h-3" />
                          AI-Generated
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-600">
                      {jdLocation && (
                        <>
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-4 h-4 text-purple-600" />
                            <span>{jdLocation}</span>
                          </div>
                          <span className="text-gray-300">•</span>
                        </>
                      )}
                      {jdDetails.department && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-700 rounded-md text-xs">
                          <Building2 className="w-3.5 h-3.5" />
                          {jdDetails.department}
                        </span>
                      )}
                      {jdExperienceBadge && (
                        <span className="inline-flex items-center px-2.5 py-1 bg-gray-100 text-gray-700 rounded-md text-xs">
                          {jdExperienceBadge}
                        </span>
                      )}
                      {jdEducationLabel !== 'Not specified' && (
                        <span className="inline-flex items-center px-2.5 py-1 bg-gray-100 text-gray-700 rounded-md text-xs">
                          {jdEducationLabel}
                        </span>
                      )}
                      {jdDetails.employment_type && (
                        <span className="inline-flex items-center px-2.5 py-1 bg-gray-100 text-gray-700 rounded-md text-xs">
                          {employmentTypeLabel(jdDetails.employment_type)}
                        </span>
                      )}
                      {jdDetails.remote_type && (
                        <span className="inline-flex items-center px-2.5 py-1 bg-gray-100 text-gray-700 rounded-md text-xs">
                          {workModeLabel(jdDetails.remote_type)}
                        </span>
                      )}
                      {jdSalary && (
                        <span className="inline-flex items-center px-2.5 py-1 bg-green-50 text-green-700 rounded-md text-xs font-medium">
                          {jdSalary}{jdDetails.compensation_type ? ` / ${jdDetails.compensation_type}` : ''}
                        </span>
                      )}
                      <span className="text-gray-300">•</span>
                      <span>Posted {jdPostedDate ? formatIST(jdPostedDate) : 'N/A'}</span>
                      <span className="text-gray-300">•</span>
                      <span>By {jdDetails.created_by_name || 'System'}</span>
                      <span className="text-gray-300">•</span>
                      <span className="inline-flex items-center px-2.5 py-1 bg-purple-600 text-white rounded-full text-xs font-medium">
                        v{jdDetails.current_version && jdDetails.current_version > 0 ? jdDetails.current_version : 1}.0
                      </span>
                    </div>
                  </div>

                  {/* Job Description */}
                  <div className="bg-gray-50 border border-gray-300 rounded-xl p-4 sm:p-6">
                    <h4 className="text-base font-semibold text-gray-900 mb-3">Job Description</h4>
                    <div className="h-px bg-gray-200 mb-3"></div>
                    {jdDescriptionMarkdown.trim() ? (
                      <div className="markdown-content prose prose-sm max-w-none text-gray-700">
                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{jdDescriptionMarkdown}</ReactMarkdown>
                      </div>
                    ) : (
                      <div className="text-gray-500 italic text-center py-8">No job description provided</div>
                    )}
                  </div>

                  {/* Internal Recruiter Notes & Assessment Guidance */}
                  <div className={`grid ${jdDetails.assessment_guidance ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'} gap-4`}>
                    <div className="bg-gray-50 border border-gray-300 rounded-xl p-4">
                      <h4 className="text-sm font-semibold text-gray-900 mb-3">Internal Recruiter Notes</h4>
                      <div className="text-sm text-gray-600 space-y-2">
                        {jdInternalNotes.length > 0 ? (
                          <ul className="list-disc list-inside space-y-1">
                            {jdInternalNotes.map((note, index) => (
                              <li key={index}>{note}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-gray-500 italic">No internal notes added</p>
                        )}
                      </div>
                    </div>

                    {jdDetails.assessment_guidance && (
                      <div className="bg-gray-50 border border-gray-300 rounded-xl p-4">
                        <h4 className="text-sm font-semibold text-gray-900 mb-3">Assessment Guidance</h4>
                        <p className="text-sm text-gray-600 whitespace-pre-wrap">{jdDetails.assessment_guidance}</p>
                      </div>
                    )}
                  </div>

                  {/* Extracted Data Summary */}
                  <div className="flex items-center gap-2 pt-2">
                    <BookOpen className="w-5 h-5 text-gray-700" />
                    <h3 className="text-lg font-semibold text-gray-900">📊 Extracted Data Summary</h3>
                  </div>

                  {/* Skills & Requirements */}
                  <div className="bg-gray-50 border border-gray-300 rounded-xl p-4 sm:p-6">
                    <h4 className="text-base font-semibold text-gray-900 mb-4">Skills &amp; Requirements</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                      {/* Left: Skills */}
                      <div className="space-y-4 sm:space-y-6">
                        <div>
                          <h5 className="text-sm text-gray-700 mb-3">Must-Have Skills ({jdMustHaveSkills.length})</h5>
                          {jdMustHaveSkills.length > 0 ? (
                            <div className="space-y-2">
                              {jdMustHaveSkills.map((skill, index) => (
                                <div key={index} className="flex items-center gap-2 text-sm text-gray-700">
                                  <CheckCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                                  {skill}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-gray-500 italic text-sm">None</p>
                          )}
                        </div>
                        <div>
                          <h5 className="text-sm text-gray-700 mb-3">Nice-to-Have Skills ({jdNiceToHaveSkills.length})</h5>
                          {jdNiceToHaveSkills.length > 0 ? (
                            <div className="space-y-2">
                              {jdNiceToHaveSkills.map((skill, index) => (
                                <div key={index} className="flex items-center gap-2 text-sm text-gray-600">
                                  <CheckCircle className="w-4 h-4 text-gray-800 flex-shrink-0" />
                                  {skill}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-gray-500 italic text-sm">None</p>
                          )}
                        </div>
                      </div>

                      {/* Right: Comments */}
                      <div className="space-y-4 sm:space-y-6">
                        <div>
                          <h5 className="text-sm text-gray-700 mb-3">Must-Have Additional Requirements ({jdMustHaveComments.length})</h5>
                          {jdMustHaveComments.length > 0 ? (
                            <div className="space-y-2">
                              {jdMustHaveComments.map((comment, index) => (
                                <div key={index} className="flex items-start gap-2 text-sm text-gray-700">
                                  <CheckCircle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                                  <span>{comment}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-gray-500 italic text-sm">None</p>
                          )}
                        </div>
                        <div>
                          <h5 className="text-sm text-gray-700 mb-3">Nice-to-Have Additional Requirements ({jdNiceToHaveComments.length})</h5>
                          {jdNiceToHaveComments.length > 0 ? (
                            <div className="space-y-2">
                              {jdNiceToHaveComments.map((comment, index) => (
                                <div key={index} className="flex items-start gap-2 text-sm text-gray-600">
                                  <CheckCircle className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                                  <span>{comment}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-gray-500 italic text-sm">None</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Requirements */}
                  <div className="bg-gray-50 border border-gray-300 rounded-xl p-4 sm:p-6">
                    <h4 className="text-base font-semibold text-gray-900 mb-4">Requirements</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                      <div className="bg-white border border-gray-200 p-3 sm:p-4 rounded-lg">
                        <h5 className="text-xs sm:text-sm text-gray-600 mb-1 sm:mb-2">Experience</h5>
                        <p className="text-sm sm:text-base text-gray-900">{jdExperienceLabel}</p>
                      </div>
                      <div className="bg-white border border-gray-200 p-3 sm:p-4 rounded-lg">
                        <h5 className="text-xs sm:text-sm text-gray-600 mb-1 sm:mb-2">Education</h5>
                        <p className="text-sm sm:text-base text-gray-900">{jdEducationLabel}</p>
                      </div>
                      {jdDetails.industry_type && (
                        <div className="bg-white border border-gray-200 p-3 sm:p-4 rounded-lg">
                          <h5 className="text-xs sm:text-sm text-gray-600 mb-1 sm:mb-2">Industry Type</h5>
                          <p className="text-sm sm:text-base text-gray-900">{prettifyCode(jdDetails.industry_type)}</p>
                        </div>
                      )}
                      <div className="bg-white border border-gray-200 p-3 sm:p-4 rounded-lg">
                        <h5 className="text-xs sm:text-sm text-gray-600 mb-1 sm:mb-2">Employment Type</h5>
                        <p className="text-sm sm:text-base text-gray-900">{employmentTypeLabel(jdDetails.employment_type)}</p>
                      </div>
                      <div className="bg-white border border-gray-200 p-3 sm:p-4 rounded-lg">
                        <h5 className="text-xs sm:text-sm text-gray-600 mb-1 sm:mb-2">Work Mode</h5>
                        <p className="text-sm sm:text-base text-gray-900">{workModeLabel(jdDetails.remote_type)}</p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
          </>
          )}

          {/* Assessment picker — only when this JD has more than one invitable
              published assessment. */}
          {showAssessmentPicker && pickerAssessments.length > 0 && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-2xl max-w-[95vw] sm:max-w-2xl w-full max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between p-5 border-b border-gray-200 shrink-0">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Choose an assessment</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      This job has {pickerAssessments.length} published assessments. Select which one(s) to invite {resume.candidateName} to.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowAssessmentPicker(false)}
                    className="p-1 hover:bg-gray-100 rounded"
                    aria-label="Close"
                  >
                    <XCircle className="w-5 h-5 text-gray-500" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-3">
                  {pickerAssessments.map((a: any) => {
                    const isPicked = pickerSelectedIds.includes(a.id);
                    const sections = (a.hr_enabled ? 1 : 0) + (a.technical_enabled ? 1 : 0) + (a.coding_enabled ? 1 : 0);
                    return (
                      <label
                        key={a.id}
                        className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer border mb-2 transition-colors ${
                          isPicked ? 'border-brand-blue bg-brand-blue/5' : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isPicked}
                          onChange={() => {
                            setPickerSelectedIds(prev =>
                              prev.includes(a.id) ? prev.filter(id => id !== a.id) : [...prev, a.id]
                            );
                          }}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">
                            {a.title || a.short_id || 'Untitled assessment'}
                            {typeof a.version === 'number' ? ` - Version ${a.version}` : ''}
                          </div>
                          <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                            {a.short_id && <span>{a.short_id}</span>}
                            <span>{a.duration_minutes || 30} min</span>
                            <span>{sections} section{sections !== 1 ? 's' : ''}</span>
                            {a.jd_version && <span>JD v{a.jd_version}</span>}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
                <div className="p-4 border-t border-gray-200 flex items-center justify-between gap-3 shrink-0">
                  <span className="text-xs text-gray-600">
                    {pickerSelectedIds.length} of {pickerAssessments.length} selected
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowAssessmentPicker(false)}
                      className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleConfirmAssessmentPick}
                      disabled={pickerSelectedIds.length === 0}
                      className="px-4 py-2 text-sm font-medium text-white bg-brand-blue rounded-lg hover:bg-brand-blue-2 disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                      Continue
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Share Assessment via Email — the same modal the JD and assessment
              pages use, opened here without leaving the candidate page. */}
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
                version: shareAssessments[0].version,
                jd_short_id: jobId,
                jd_title: jobTitle,
                jd_version: shareAssessments[0].jd_version,
              }}
              additionalAssessments={shareAssessments.slice(1).map((a: any) => ({
                id: a.id,
                title: a.title,
                duration: `${a.duration_minutes || 30} min`,
                questions: (a.hr_enabled ? 1 : 0) + (a.technical_enabled ? 1 : 0) + (a.coding_enabled ? 1 : 0),
                type: 'AI-Generated',
                short_id: a.short_id,
                version: a.version,
                jd_short_id: jobId,
                jd_title: jobTitle,
                jd_version: a.jd_version,
              }))}
              inviteSource="JD"
            />
          )}

          {/* Share AI Interview — same modal the AI Interviews page opens. */}
          {shareAIConfig && (
            <ShareAIInterviewModal
              isOpen={!!shareAIConfig}
              onClose={() => setShareAIConfig(null)}
              config={shareAIConfig}
              onInviteSent={() => setShareAIConfig(null)}
            />
          )}
        </div>
      </div>
    </main>
  );
}
