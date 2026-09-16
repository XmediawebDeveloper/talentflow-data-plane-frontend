'use client';

import { Target, Award, CheckCircle, XCircle, TrendingUp, Mail, Phone, MapPin, Briefcase, GraduationCap, Star, Calendar, Zap, FileText, AlertCircle, Download, Clock, Building2, ChevronLeft, ChevronRight, ChevronDown, Code, Languages, BarChart3, CheckSquare, MessageSquare, Minus, BookOpen, ThumbsUp, ThumbsDown, Loader2, Sparkles, UserPlus, History, File, HardDrive, User, X, Eye, Share2, Paperclip, Send } from 'lucide-react';
import DetailedScorecardTab from './DetailedScorecardTab';
import ViewResumeButton from '@/components/ui/view-resume-button';
import ShareAssessmentModal from './ShareAssessmentModal';
import ShareAIInterviewModal from './ai-interview/ShareAIInterviewModal';
import { useState, useEffect, useRef } from 'react';
import { usePlanFeatures } from '@/lib/hooks/usePlanFeature';
import { useJobInviteTargets } from '@/lib/hooks/useJobInviteTargets';
import { toast } from 'sonner';
import RecordPager from '@/components/RecordPager';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { useAuth } from '@/components/providers/AuthProvider';
import { handleUnauthorized } from '@/lib/services/api';
import { formatIST } from '@/lib/utils/dateUtils';
import { buildUnifiedDiff, buildDiffSidePairs } from '@/lib/utils/textDiff';
import { formatJobExperienceText, formatJobExperienceBadge } from '@/lib/utils/jobExperience';
import { formatSalaryRange } from '@/lib/utils/salary';
import { formatOverallScore } from '@/lib/utils/matchStatus';
import PageBreadcrumb, { BreadcrumbCrumb } from '@/components/PageBreadcrumb';

interface ScoredResume {
  id: string;  // This is the SCORE ID, not resume ID!
  resumeId?: string;  // The actual resume ID (from API's resume_id field)
  candidateName: string;
  email: string;
  phone: string;
  matchStatus: string;
  scorePercentage: number;
  // Human-readable breakdown of how scorePercentage was derived (Required/
  // Preferred pass/fail-cliff weighting) - shown as a tooltip next to the
  // Overall Score so it never looks like a simple average of the two
  // percentages shown next to it. Computed fresh per candidate by the API.
  scoreFormula?: string;
  // Mean rating across the Required criteria (0-10); null when the JD has none.
  // Exact Match needs >= 8, Partial Match is below 8 - so this is the only value
  // that explains which of the two a passing candidate received.
  essentialAverage?: number | null;
  // Resume Match Rating Mechanism (client doc, Sept 2026): the 0-10 Overall
  // Rating and its components, read straight from the API - additive
  // alongside scorePercentage/essentialAverage above, never replacing them.
  essentialRating10?: number;
  nonEssentialRating10?: number | null;
  combinedAverage10?: number | null;
  overallRating10?: number;
  ratingCapApplied?: boolean;
  ratingSummaryText?: string;
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
  // Free-text the parser couldn't file under a known section.
  additionalInfo?: string;
  // File metadata, for the File Properties section on the Personal Info tab.
  fileName?: string;
  fileType?: string;
  fileSizeKb?: number;
  uploadDate?: string;
  lastUpdated?: string;
  uploadedBy?: string;
  versionCount?: number;
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
  /**
   * Whether the JD this candidate was scored against has a published
   * assessment / a live AI interview to invite them to. Passed by hosts that
   * already know — Job Details resolves both for its own Send Invite buttons,
   * so handing them down keeps this page's Invite menu on exactly the same
   * answer as the Scored Resumes row it was opened from. Omitted elsewhere
   * (Resume Scoring), where this page resolves them itself.
   */
  assessmentConfigured?: boolean;
  aiInterviewConfigured?: boolean;
}

/**
 * Newest upload first — the one ordering of a resume's version chain.
 *
 * `version` is authoritative, with the upload date breaking ties and covering
 * rows the API hands back without a version number (which would otherwise all
 * collapse to 1 and leave "latest" as whatever the endpoint happened to return
 * first). Reads both the raw API row (`created_at`) and the mapped one
 * (`uploadDate`), so Version History and View Resume agree on which upload is
 * the latest.
 */
function byNewestVersion(a: any, b: any): number {
  const versionDelta = (b?.version || 0) - (a?.version || 0);
  if (versionDelta !== 0) return versionDelta;
  const aTime = new Date(a?.created_at || a?.uploadDate || 0).getTime();
  const bTime = new Date(b?.created_at || b?.uploadDate || 0).getTime();
  return bTime - aTime;
}

export default function CandidateScoringDetailPage({ resume, jobTitle, jobId, onMinimize, currentIndex, totalCount, onPrev, onNext, breadcrumbItems, assessmentConfigured, aiInterviewConfigured }: CandidateScoringDetailPageProps) {
  const { isTenantAdmin, user, hasPermissionCode } = useAuth();
  const { hasPlanFeature } = usePlanFeatures();
  const canExport = isTenantAdmin || (user?.permissions?.canExport ?? false);
  const canShareResume = isTenantAdmin || hasPermissionCode('my_resumes:share');

  /* The sticky tab bar below pins directly under the sticky breadcrumb, so its
     offset is the breadcrumb's real height — re-measured on resize, because the
     bar grows when its RecordPager row wraps. Hardcoding the height let the
     crumb bar overlap and swallow the tab bar's clicks. */
  const breadcrumbBarRef = useRef<HTMLElement | null>(null);
  const [tabBarTop, setTabBarTop] = useState(52);
  useEffect(() => {
    const bar = breadcrumbBarRef.current;
    if (!bar || typeof ResizeObserver === 'undefined') return;
    const measure = () => setTabBarTop(bar.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  // Share Resume dialog state.
  const [showShareResumeModal, setShowShareResumeModal] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [shareSubject, setShareSubject] = useState('');
  const [shareMessage, setShareMessage] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  /** Blob URL of the scorecard PDF while it is being read in the dialog. */
  const [scorecardPreviewUrl, setScorecardPreviewUrl] = useState<string | null>(null);
  const [loadingScorecardPreview, setLoadingScorecardPreview] = useState(false);

  // Same permission shape the JD page uses for its invite actions.
  const hasPermission = (permission: string): boolean => {
    if (!user) return false;
    if (isTenantAdmin || user.role === 'tenant_admin') return true;
    if (!user.permissions) return false;
    return user.permissions[permission as keyof typeof user.permissions] === true;
  };
  const mayInviteAssessment = hasPermission('canCreateAssessments') && hasPlanFeature('assessment');
  const mayInviteAIInterview =
    (hasPermission('canShareAIInterviews') || hasPermission('canInviteAIInterviews')) && hasPlanFeature('ai_interview');
  const canInvite = mayInviteAssessment || mayInviteAIInterview;

  /* What this JD can actually invite to. Job Details hands both flags down —
     its Assessment / AI Interview sections read the same two — so this page and
     the Scored Resumes row it was opened from are never out of step. From
     Resume Scoring, where no host tracks it, the hook resolves it from the JD
     itself using the same definition. Each side is only looked up when the
     viewer could use it at all. */
  const inviteTargets = useJobInviteTargets(jobId, {
    assessmentConfigured,
    aiInterviewConfigured,
    assessmentEnabled: mayInviteAssessment,
    aiInterviewEnabled: mayInviteAIInterview,
  });
  // With no JD to check (the global scoring view's cross-job rows) there is
  // nothing to gate on, so the entries keep their permission-only behaviour and
  // the existing handlers report what's missing after the click.
  const canInviteAssessment =
    mayInviteAssessment && (!inviteTargets.known || inviteTargets.assessmentConfigured);
  const canInviteAIInterview =
    mayInviteAIInterview && (!inviteTargets.known || inviteTargets.aiInterviewConfigured);
  // Neither target exists → the Invite button itself is disabled rather than
  // opening a menu whose every entry dead-ends in "create one first".
  const inviteDisabled = !canInviteAssessment && !canInviteAIInterview;

  const [showInviteMenu, setShowInviteMenu] = useState(false);
  const inviteMenuRef = useRef<HTMLDivElement>(null);

  // View Resume leaves this page for the full Resume Details route rather than
  // opening an overlay. The flag only covers the moment spent resolving which
  // version to open, so the button can show a spinner instead of looking dead.
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
  // The tabs + panels block, so opening the JD from the job title can bring the
  // tab strip to the top rather than jumping the whole page back to its header.
  const tabsSectionRef = useRef<HTMLDivElement>(null);

  /**
   * Job title → the full job description.
   *
   * Switching the tab alone isn't enough: the click usually happens well down
   * the Overview tab, so the JD would open mid-document. Scrolls to the tab
   * strip — not the page top — so the JD starts right under the tabs.
   *
   * `scrollIntoView` rather than `window.scrollTo` because the page scrolls
   * inside `<main>` (and the dashboard shell around it), not the window — it
   * walks every scrollable ancestor. The landing point is set by the section's
   * `scroll-mt-*`, which keeps it clear of the sticky breadcrumb.
   */
  const handleOpenJobDescription = () => {
    setActiveTab('viewjd');
    tabsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const [isDataReady, setIsDataReady] = useState(false);
  const [fullResumeData, setFullResumeData] = useState<ScoredResume>(resume);
  const [fullResumeLoaded, setFullResumeLoaded] = useState(false);
  const [jdDetails, setJdDetails] = useState<any>(null);
  // Upload history for the Version History section. Kept separate from
  // `fullResumeData` because it comes from its own endpoint — the resume record
  // carries only a count, not the per-version rows.
  const [resumeVersions, setResumeVersions] = useState<any[]>([]);
  // Version comparison, mirroring resume-view: tick two versions, diff them
  // old-vs-new. Holds ids in click order; a third tick evicts the oldest so the
  // pair keeps moving rather than making the user untick something first.
  const [compareChecked, setCompareChecked] = useState<string[]>([]);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [compareViewMode, setCompareViewMode] = useState<'side-by-side' | 'unified'>('side-by-side');

  const handleCompareCheck = (versionId: string) => {
    setCompareChecked((prev) => {
      if (prev.includes(versionId)) return prev.filter((id) => id !== versionId);
      if (prev.length >= 2) return [prev[1], versionId];
      return [...prev, versionId];
    });
  };

  // Per-row "View Changes": diff one upload against the one before it. Rather
  // than a second pair of ids, it drives the same `compareChecked` the tick
  // boxes use, so the modal below needs no new wiring.
  const handleViewVersionChanges = (previousVersionId: string, versionId: string) => {
    setCompareChecked([previousVersionId, versionId]);
    setShowCompareModal(true);
  };

  // Single-version preview (the eye), mirroring resume-view: the extracted text
  // rendered document-style. Versions past the fifth are listed without their
  // text (see the capped fetch below), so those fall back to a lookup on open.
  const [versionPreview, setVersionPreview] = useState<{ id: string; versionNumber: number; fileName?: string; text: string } | null>(null);
  // Holds the id being fetched, not a bare boolean, so only the row that was
  // clicked shows a spinner.
  const [versionPreviewLoadingId, setVersionPreviewLoadingId] = useState<string | null>(null);

  const handleVersionPreview = async (version: any, versionNumber: number) => {
    if (version.extractedText) {
      setVersionPreview({ id: version.id, versionNumber, fileName: version.fileName, text: version.extractedText });
      return;
    }

    setVersionPreviewLoadingId(version.id);
    try {
      const { resumeService } = await import('@/lib/services/resumeService');
      const data: any = await resumeService.get(version.id);
      const text = data?.extracted_text || '';
      if (!text) toast.info('Preview not available for this file.');
      setVersionPreview({ id: version.id, versionNumber, fileName: version.fileName, text });
    } catch (err) {
      console.error('[CandidateScoringDetailPage] Failed to load version preview:', err);
      toast.error('Failed to load preview');
    } finally {
      setVersionPreviewLoadingId(null);
    }
  };

  // Each version is its own resume record, so it downloads by its own id.
  const handleVersionDownload = async (version: any, versionNumber: number) => {
    try {
      const { resumeService } = await import('@/lib/services/resumeService');
      const blob = await resumeService.download(version.id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = version.fileName || `resume-v${versionNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[CandidateScoringDetailPage] Failed to download version:', err);
      toast.error('Failed to download version');
    }
  };

  // Resolve the ticked pair into older/newer by version number, so the left
  // panel is always the earlier upload regardless of tick order.
  const comparePair = (() => {
    if (compareChecked.length !== 2) return null;
    const a = resumeVersions.find((v) => v.id === compareChecked[0]);
    const b = resumeVersions.find((v) => v.id === compareChecked[1]);
    if (!a || !b) return null;
    return (a.version || 0) <= (b.version || 0) ? { older: a, newer: b } : { older: b, newer: a };
  })();

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

          // Now fetch the full resume using the correct resume ID, plus its
          // upload history for the Version History section. Versions are
          // best-effort — a failure there must not cost us the whole tab.
          const [fullResume, versionsData] = await Promise.all([
            resumeService.get(actualResumeId).catch((err) => {
              console.error('[CandidateScoringDetailPage] Failed to fetch full resume:', err);
              return null;
            }),
            resumeService.getVersions(actualResumeId).catch(() => [] as any[]),
          ]);

          // The versions endpoint returns rows without `extracted_text`, which
          // the compare needs. Pull the full record for the most recent few —
          // capped at 5, same as resume-view, so a resume with a long history
          // doesn't fire a request per version. Beyond that the row still lists
          // fine; only its diff is unavailable.
          let versionsWithText: any[] = versionsData || [];
          if (versionsWithText.length > 0) {
            try {
              const toFetch = versionsWithText.slice(0, 5);
              const fullVersions = await Promise.all(
                toFetch.map((v: any) => resumeService.get(v.id).catch(() => v))
              );
              versionsWithText = versionsWithText.map((v: any, index: number) =>
                index < fullVersions.length && fullVersions[index]
                  ? { ...v, extracted_text: (fullVersions[index] as any).extracted_text }
                  : v
              );
            } catch (err) {
              console.warn('[CandidateScoringDetailPage] Failed to fetch full version data:', err);
            }
          }

          setResumeVersions(
            versionsWithText.map((v: any) => ({
              id: v.id,
              fileName: v.file_name || v.name,
              uploadDate: v.created_at || v.upload_date,
              size: v.file_size_kb ? `${v.file_size_kb} KB` : 'Unknown',
              uploadedBy: v.uploaded_by_name || 'Unknown',
              version: v.version || 1,
              extractedText: v.extracted_text || '',
            }))
          );

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
              /* Scoring-specific data. `resume` (the row that was actually
                 clicked, e.g. from the scored-resumes list) is kept as the
                 source of truth for the score itself — it's what the user
                 just saw and picked. `completeResumeData` here comes from a
                 SEPARATE jobId-scoped lookup matched only by score id, and
                 a candidate scored more than once against the same job (or
                 across job versions) can have that lookup land on the wrong
                 attempt's record, silently swapping in a different score
                 than the one the user clicked (seen live: a 100% row opening
                 to show 85%). Only fall back to the refetched value when the
                 original genuinely has none. */
              scorePercentage: resume.scorePercentage ?? Number((completeResumeData.overall_score || 0).toFixed(1)),
              scoreFormula: resume.scoreFormula || completeResumeData.score_formula,
              // Mean Required rating - the Exact/Partial discriminator, shown on the
              // Score Table beside the classification. `??` not `||`: an average of 0
              // is a real value (every Required criterion rated 0), while null means
              // the JD has no Required criteria at all.
              essentialAverage: resume.essentialAverage ?? completeResumeData.essential_average,
              essentialRating10: resume.essentialRating10 ?? completeResumeData.essential_rating_10,
              nonEssentialRating10: resume.nonEssentialRating10 ?? completeResumeData.non_essential_rating_10,
              combinedAverage10: resume.combinedAverage10 ?? completeResumeData.combined_average_10,
              overallRating10: resume.overallRating10 ?? completeResumeData.overall_rating_10,
              ratingCapApplied: resume.ratingCapApplied ?? completeResumeData.rating_cap_applied,
              ratingSummaryText: resume.ratingSummaryText ?? completeResumeData.rating_summary_text,
              criteriaScores: completeResumeData.criteria_scores || {},
              scoreBreakdown: completeResumeData.score_breakdown || [],
              aiSummary: resume.aiSummary || completeResumeData.ai_summary,
              strengths: resume.strengths?.length ? resume.strengths : (completeResumeData.strengths || []),
              gaps: resume.gaps?.length ? resume.gaps : (completeResumeData.gaps || []),
              scoredDate: resume.scoredDate || completeResumeData.created_at,
              matchStatus: resume.matchStatus || completeResumeData.match_status,
              scoredBy: resume.scoredBy || completeResumeData.scored_by || completeResumeData.scored_by_name || 'System',
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
              // Free-text block the parser couldn't file under a known section.
              additionalInfo: fr?.additional_info || '',
              // File metadata, for the File Properties section.
              fileName: fr?.file_name || '',
              fileType: fr?.file_type || '',
              fileSizeKb: fr?.file_size_kb || undefined,
              uploadDate: fr?.created_at || '',
              lastUpdated: fr?.updated_at || '',
              uploadedBy: fr?.uploaded_by_name || 'Unknown',
              versionCount: fr?.version_count || (versionsData?.length || 1),
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

  // scoreBreakdown is `object | any[]` (see its declaration above); these four reads want
  // the object form. Narrowing once here is exactly equivalent to the previous `?.` reads:
  // on the array branch `arr.overallFit` and `undefined?.overallFit` both yield undefined.
  const scoreBreakdownObj = Array.isArray(fullResumeData.scoreBreakdown)
    ? undefined
    : fullResumeData.scoreBreakdown;

  const detailedScores = {
    titleMatch: scoreBreakdownObj?.overallFit || fullResumeData.scorePercentage,
    experienceMatch: scoreBreakdownObj?.experienceMatch || generateVariedScore(fullResumeData.scorePercentage, 20),
    skillsMatch: scoreBreakdownObj?.skillsMatch || generateVariedScore(fullResumeData.scorePercentage, 16),
    educationMatch: scoreBreakdownObj?.educationMatch || generateVariedScore(fullResumeData.scorePercentage, 24),
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

  // Same three colors as the Match Status badge next to it, so the one
  // overall score reads as that status rather than its own score-threshold
  // scale — unlike getScoreColor above, which stays threshold-based for the
  // Score Table tab's many individual criteria, none of which carry their
  // own match status to key off.
  const getOverallScoreColor = (matchStatus: string) => {
    const normalized = matchStatus?.toLowerCase().replace(/[_\s]/g, '');
    if (normalized === 'exactmatch' || normalized === 'excellentmatch') return 'text-green-600';
    if (normalized === 'partialmatch') return 'text-brand-orange-deep';
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
    if (normalized === 'partialmatch') return 'bg-brand-orange/10 text-brand-orange-deep border-brand-orange/30';
    return 'bg-red-100 text-red-700 border-red-300';
  };

  // ---- Read-only label helpers for the View JD tab (mirrors JobDetailView's
  // "Extracted Data Summary" so both surfaces read the same) ----
  const prettifyCode = (value?: string): string =>
    (value || '')
      .replace(/[_-]+/g, ' ')
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());

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
  /**
   * The Required/Preferred line under a criterion tile in the Extracted Data
   * Summary, worded exactly as the JD view and the Step 3 review show it.
   *
   * "Required" means Resume Scoring treated the criterion as Essential: it shares
   * the 60% block and a rating below 7 on it fails the whole Essential section.
   * "Preferred" criteria share the 40% block and never fail a candidate alone.
   */
  const jdRequirementLabel = (mandatory?: boolean) =>
    mandatory ? '✓ Required (Essential)' : '○ Preferred';

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
    if (loadingResumeDetail) return;

    setLoadingResumeDetail(true);
    try {
      const { resumeService } = await import('@/lib/services/resumeService');

      // `viewResumeId` is the upload that was *scored*, which is not
      // necessarily the newest one — a candidate who re-uploaded after scoring
      // leaves the score pointing at the older file. View Resume should always
      // open the latest, i.e. the row Version History marks "Latest", so the
      // version chain is resolved first and the highest version wins.
      const versions: any[] = await resumeService.getVersions(viewResumeId).catch(() => []);
      const latestVersion = [...(versions || [])].sort(byNewestVersion)[0];
      const targetId = latestVersion?.id || viewResumeId;

      // Opens the same preview the Version History eye opens — that popup is
      // the master copy, so this hands it the latest version rather than
      // building a second, differently-shaped resume viewer.
      const loadedVersion = resumeVersions.find((v) => v.id === targetId);
      await handleVersionPreview(
        loadedVersion ?? {
          id: targetId,
          fileName: latestVersion?.file_name || fullResumeData.fileName,
        },
        latestVersion?.version || loadedVersion?.version || 1,
      );
    } catch (err) {
      console.error('[CandidateScoringDetailPage] Failed to open the resume preview:', err);
      toast.error('Could not load the resume. Please try again.');
    } finally {
      setLoadingResumeDetail(false);
    }
  };

  /* Share Resume — the dialog the resume table and the resume page open, so a
     scored candidate's resume goes out the same way it does anywhere else. The
     file's details are already on `fullResumeData`, and the eye reuses View
     Resume, which resolves the latest version. */
  const openShareModal = () => {
    if (!viewResumeId) {
      toast.error('Resume is not available for this candidate');
      return;
    }

    const resumeLink =
      typeof window !== 'undefined' ? `${window.location.origin}/recruitment/resume-view/${viewResumeId}` : '';

    setShareEmail('');
    setShareSubject(`Resume: ${fullResumeData.candidateName} - ${fullResumeData.title || 'Candidate'}`);
    setShareMessage(`Hi,

I'm sharing the resume of ${fullResumeData.candidateName} for your review.

Candidate Details:
- Name: ${fullResumeData.candidateName}
- Title: ${fullResumeData.title || 'N/A'}
- Experience: ${fullResumeData.experience || 'N/A'}
- Location: ${fullResumeData.location || 'N/A'}
- Match: ${fullResumeData.matchStatus || resume.matchStatus || 'N/A'}${
      fullResumeData.scorePercentage != null ? ` (${formatOverallScore(fullResumeData.overallRating10, fullResumeData.scorePercentage)})` : ''
    }

You can view the full resume at: ${resumeLink}

Best regards`);
    setShowShareResumeModal(true);
  };

  const closeShareModal = () => {
    setShowShareResumeModal(false);
    setShareEmail('');
    setShareSubject('');
    setShareMessage('');
  };

  const handleSendShareEmail = async () => {
    if (!viewResumeId) return;

    if (!shareEmail.trim()) {
      toast.error('Please enter an email address');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(shareEmail.trim())) {
      toast.error('Please enter a valid email address');
      return;
    }

    setIsSendingEmail(true);
    try {
      const { resumeService } = await import('@/lib/services/resumeService');
      const result = await resumeService.share(viewResumeId, shareEmail.trim(), shareMessage);
      if (result.success) {
        toast.success('Resume shared successfully');
        closeShareModal();
      } else {
        toast.error(result.message || 'Failed to send email');
      }
    } catch (error: any) {
      console.error('[CandidateScoringDetailPage] Failed to share resume:', error);
      toast.error(error?.message || 'Failed to send email');
    } finally {
      setIsSendingEmail(false);
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

  /* The scorecard PDF, fetched once and used by both the download and the
     preview. Returns null when it has already reported the failure. */
  const fetchScorecardBlob = async (toastId: string | number): Promise<Blob | null> => {
    console.log('[Scorecard] Requesting PDF for score_id:', fullResumeData.id);

    // Get token from localStorage
    const token = localStorage.getItem('accessToken');
    if (!token) {
      toast.error('Please login to download scorecard', { id: toastId });
      return null;
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
      return null;
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      console.error('[Scorecard] Failed:', response.status, errorData);

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
      return null;
    }

    return response.blob();
  };

  /* Read the scorecard without leaving the dialog — the eye beside the resume
     does the same for the resume, so both attachments open in place. */
  const handlePreviewScorecard = async () => {
    if (loadingScorecardPreview) return;
    const toastId = toast.loading('Generating scorecard PDF...');
    setLoadingScorecardPreview(true);
    try {
      const blob = await fetchScorecardBlob(toastId);
      if (!blob) return;
      // A blob URL rather than the API URL: the endpoint needs the bearer
      // token, which an <iframe> src cannot carry.
      setScorecardPreviewUrl(window.URL.createObjectURL(blob));
      toast.dismiss(toastId);
    } catch (error) {
      console.error('[Scorecard] Preview error:', error);
      toast.error('Failed to open the scorecard. Please try again.', { id: toastId });
    } finally {
      setLoadingScorecardPreview(false);
    }
  };

  const closeScorecardPreview = () => {
    if (scorecardPreviewUrl) window.URL.revokeObjectURL(scorecardPreviewUrl);
    setScorecardPreviewUrl(null);
  };

  const handleDownloadScorecard = async () => {
    const toastId = toast.loading('Generating scorecard PDF...');

    try {
      const blob = await fetchScorecardBlob(toastId);
      if (!blob) return;

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
      <div className="min-h-[100dvh] bg-gradient-to-br from-gray-50 via-gray-100 to-white flex items-center justify-center">
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
        <div className="p-4 md:p-8 w-full min-h-[calc(100dvh-7rem)] bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl">
          {/* The resume is a modal now, so the trail always names the candidate —
              no "› Resume" leaf, and the pager keeps its place (the backdrop
              covers it while the modal is open). */}
          <PageBreadcrumb
            barRef={breadcrumbBarRef}
            className="mb-4 md:mb-6"
            // Previous / Next rides inside the breadcrumb bar, as on job-details.
            actions={
              <RecordPager
                currentIndex={currentIndex}
                totalCount={totalCount}
                onPrev={onPrev}
                onNext={onNext}
              />
            }
            items={breadcrumbItems ?? [
              // Deepest crumb names the record being viewed (the candidate),
              // not a generic page label.
              { label: 'Dashboard', href: '/dashboard' },
              { label: 'Resume Scoring', href: '/recruitment/resume-scoring' },
              { label: jobTitle, href: `/recruitment/resume-scoring?jd_id=${jobId}` },
              { label: resume.candidateName || 'Candidate' },
            ]}
          />

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
              {/* Share leads the group: sending the resume on is a step that
                  usually comes before inviting anyone to anything. */}
              {canShareResume && viewResumeId && (
                <button
                  onClick={openShareModal}
                  title="Share resume"
                  className="px-3 sm:px-4 py-1.5 text-xs sm:text-sm text-gray-700 border border-gray-300 bg-white rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Share2 className="w-4 h-4" />
                  Share
                </button>
              )}

              {canInvite && (
                <div className="relative" ref={inviteMenuRef}>
                  <button
                    onClick={() => setShowInviteMenu(!showInviteMenu)}
                    disabled={!!loadingInvite || inviteDisabled}
                    title={inviteDisabled ? 'No published assessment or AI interview for this job yet' : undefined}
                    aria-haspopup="menu"
                    aria-expanded={showInviteMenu}
                    className="px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-medium text-white bg-brand-blue rounded-lg shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 hover:bg-brand-blue-2 transition-colors flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:hover:bg-brand-blue"
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
                      {/* Each entry stays visible for anyone permitted to use
                          it and goes disabled when this JD has nothing to
                          invite to, so the next step is discoverable and the
                          tooltip can name what's blocking it. */}
                      {mayInviteAssessment && (
                        <button
                          role="menuitem"
                          onClick={handleInviteForAssessment}
                          disabled={!canInviteAssessment}
                          title={!canInviteAssessment ? 'No published assessment for this job yet' : undefined}
                          className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-brand-blue/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                        >
                          <span className="mt-0.5 w-8 h-8 rounded-lg bg-brand-blue/10 flex items-center justify-center flex-shrink-0">
                            <Mail className="w-4 h-4 text-brand-blue" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-gray-900">Assessment</span>
                          </span>
                        </button>
                      )}
                      {mayInviteAIInterview && (
                        <button
                          role="menuitem"
                          onClick={handleInviteForAIInterview}
                          disabled={!canInviteAIInterview}
                          title={!canInviteAIInterview ? 'No published AI interview for this job yet' : undefined}
                          className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-brand-blue/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                        >
                          <span className="mt-0.5 w-8 h-8 rounded-lg bg-brand-cyan/10 flex items-center justify-center flex-shrink-0">
                            <Sparkles className="w-4 h-4 text-brand-cyan" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-gray-900">AI Interview</span>
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
              <div className={`text-2xl sm:text-3xl font-bold ${getOverallScoreColor(fullResumeData.matchStatus || resume.matchStatus)}`}>
                {fullResumeData.overallRating10 != null ? (
                  <>{fullResumeData.overallRating10.toFixed(1)}<span className="text-sm sm:text-base font-semibold text-gray-500">/10</span></>
                ) : (
                  `${fullResumeData.scorePercentage}%`
                )}
              </div>
              <span className={`px-2 sm:px-3 py-1 rounded-md text-xs sm:text-sm font-medium border whitespace-nowrap ${getMatchStatusColor(fullResumeData.matchStatus || resume.matchStatus)}`}>
                {formatMatchStatus(fullResumeData.matchStatus || resume.matchStatus)}
              </span>
              <span className="hidden sm:inline text-gray-400">|</span>
              {/* The title is the shortcut into the View JD tab — recruiters
                  reading a score reach for the JD from here constantly. */}
              <span className="text-xs sm:text-sm font-normal text-gray-700 truncate">
                <span className="font-bold text-gray-800">Job Title :</span>{' '}
                <button
                  type="button"
                  onClick={handleOpenJobDescription}
                  title={`View the job description for ${jobTitle}`}
                  className="font-medium text-brand-blue hover:text-brand-blue-2 hover:underline underline-offset-2 transition-colors duration-200 ease-in-out cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40"
                >
                  {jobTitle}
                </button>
              </span>
            </div>
            <div className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">
              {fullResumeData.scoredDate && !isNaN(new Date(fullResumeData.scoredDate).getTime())
                ? formatIST(fullResumeData.scoredDate)
                : fullResumeData.scoredDate}
            </div>
          </div>
        </div>
      </div>

      {/* Tab strip and panels share one wrapper on purpose: a sticky element is
          bounded by its own parent, so pinning the strip inside a tabs-only
          <div> would unpin it again the moment that div scrolled past. */}
      {/* `scroll-mt-*` is what stops the job-title jump under the sticky
          breadcrumb: scrollIntoView honours scroll-margin, so the strip lands
          just below the 52px crumb bar. The two values undo this wrapper's own
          pt-4 / sm:pt-6, so the strip itself — not the padding above it —
          settles at that mark. */}
      <div ref={tabsSectionRef} className="pt-4 sm:pt-6 scroll-mt-9 sm:scroll-mt-7">
        {/* Pinned directly below the breadcrumb, which is itself sticky at top-0.
            The offset is MEASURED, not the "~52px" it used to assume: the
            breadcrumb carries the RecordPager and grows past that when the row
            wraps, and because the crumb bar is the higher layer (z-30) any part
            of this pinned bar it covers stops taking clicks — they land on the
            crumb link behind it and navigate away. Same fix as job-details. */}
        <div
          style={{ top: tabBarTop }}
          className="sticky z-20 bg-white rounded-t-xl border-x-2 border-t-2 border-gray-200 shadow-sm"
        >
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

        {/* Content */}
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
              {/* AI Analysis Summary — leads the tab: it's the verdict the rest
                  of the sections break down. */}
              {aiReasoning && (
                <div className="bg-white border border-gray-200 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <MessageSquare className="w-5 h-5 text-gray-700" />
                    <h3 className="text-lg font-semibold text-gray-900">AI Analysis</h3>
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">{aiReasoning}</p>
                </div>
              )}

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
            </div>
          )}

          {activeTab === 'scoretable' && (
            <DetailedScorecardTab
              resume={{
                scorePercentage: fullResumeData.scorePercentage,
                scoreFormula: fullResumeData.scoreFormula,
                essentialAverage: fullResumeData.essentialAverage,
                essentialRating10: fullResumeData.essentialRating10,
                nonEssentialRating10: fullResumeData.nonEssentialRating10,
                combinedAverage10: fullResumeData.combinedAverage10,
                overallRating10: fullResumeData.overallRating10,
                ratingCapApplied: fullResumeData.ratingCapApplied,
                ratingSummaryText: fullResumeData.ratingSummaryText,
                matchStatus: fullResumeData.matchStatus || resume.matchStatus,
                scoredDate: fullResumeData.scoredDate,
                scoredBy: fullResumeData.scoredBy,
                detailedScores: detailedScores,
                certifications: resume.certifications,
                // `education` is `string | EducationDetail[]`; this child prop takes the
                // string form. Cast only - the value passed is unchanged.
                education: resume.education as string,
                location: resume.location,
                title: resume.title,
                // Pass API data for accurate scoring display
                // child prop takes the array branch of the union; value unchanged.
                scoreBreakdown: fullResumeData.scoreBreakdown as any,
                criteriaScores: fullResumeData.criteriaScores,
              }}
              jobTitle={jobTitle}
              aiReasoning={aiReasoning}
              getScoreColor={getScoreColor}
              getScoreBgColor={getScoreBgColor}
              getProgressBarColor={getProgressBarColor}
            />
          )}

          {/* Personal Info — same visual language as /recruitment/resume-view:
              white cards with a soft brand ring, an accent disc per section
              heading, and slate-50 item tiles inside. Replaces the flat grey
              boxes this tab used, which matched nothing else in the product. */}
          {activeTab === 'personalinfo' && (
            <div className="space-y-6">
              {/* Warning if full resume data couldn't be loaded */}
              {!fullResumeLoaded && (
                <div className="bg-brand-orange/5 border border-brand-orange/20 ring-1 ring-brand-orange/10 rounded-xl p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-brand-orange-deep flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-brand-orange-deep font-medium">Limited resume data available</p>
                    <p className="text-gray-700 text-sm mt-1">
                      Some details may be missing. View the full resume in{' '}
                      <a href={`/recruitment/resume-view/${fullResumeData.resumeId || resume.resumeId || resume.id}`} className="text-brand-blue underline hover:text-brand-blue-2">
                        Resume Details
                      </a>{' '}
                      for complete information, or re-upload the resume to refresh data.
                    </p>
                  </div>
                </div>
              )}

              {/* The candidate identity card that used to lead this tab is gone —
                  the page header above already carries the name, title, version
                  badge, email, phone and location, so it was the same block
                  twice on one screen. */}

              {/* Professional Summary - Only show actual resume summary, NOT AI scoring summary */}
              {fullResumeData.professionalSummary && (
                <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                      <Star className="w-4 h-4 text-brand-blue" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Professional Summary</h3>
                  </div>
                  <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {fullResumeData.professionalSummary}
                  </p>
                </div>
              )}

              {/* Work Experience */}
              <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                    <Briefcase className="w-4 h-4 text-brand-blue" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Work Experience</h3>
                </div>
                {fullResumeData.experienceDetails && fullResumeData.experienceDetails.length > 0 ? (
                  <div className="space-y-6">
                    {fullResumeData.experienceDetails.map((exp: any, index: number) => (
                      <div key={index} className="relative pl-6 pb-6 border-l-2 border-brand-blue/30 last:pb-0">
                        <div className="absolute -left-2 top-0 w-4 h-4 rounded-full bg-brand-blue border-2 border-white shadow-sm shadow-brand-blue/30"></div>
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
                          {/* Split into points the way resume-view does — a wall of
                              prose here is hard to scan against the scorecard. */}
                          {exp.description && (
                            <div className="space-y-1.5 mb-3">
                              {exp.description
                                .split(/(?<=[.!?])\s+|\n+/)
                                .map((point: string) => point.trim())
                                .filter((point: string) => point.length > 0)
                                .map((point: string, pointIndex: number) => (
                                  <div key={pointIndex} className="flex items-start gap-2 text-sm text-gray-700">
                                    <ChevronRight className="w-4 h-4 text-brand-blue flex-shrink-0 mt-0.5" />
                                    <span>{point}</span>
                                  </div>
                                ))}
                            </div>
                          )}
                          {exp.achievements && exp.achievements.length > 0 && (
                            <div className="space-y-1.5">
                              {exp.achievements.map((achievement: string, achIndex: number) => (
                                <div key={achIndex} className="flex items-start gap-2 text-sm text-gray-700">
                                  <ChevronRight className="w-4 h-4 text-brand-cyan flex-shrink-0 mt-0.5" />
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
                  <div className="p-4 bg-slate-50 border border-gray-100 ring-1 ring-black/[0.02] rounded-lg text-center">
                    <p className="text-gray-600">Work experience details not available.</p>
                    <p className="text-sm text-gray-500 mt-2">Please re-upload the resume to extract full details.</p>
                  </div>
                )}
              </div>

              {/* Education */}
              <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                    <GraduationCap className="w-4 h-4 text-brand-blue" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Education</h3>
                </div>
                {fullResumeData.educationDetails && fullResumeData.educationDetails.length > 0 ? (
                  <div className="space-y-4">
                    {fullResumeData.educationDetails.map((edu: any, index: number) => (
                      <div key={index} className="p-4 bg-slate-50 border border-gray-100 ring-1 ring-black/[0.02] rounded-lg">
                        <h4 className="font-semibold text-gray-800 mb-1">
                          {edu.degree || edu.qualification || 'Degree'}
                          {edu.field && ` in ${edu.field}`}
                        </h4>
                        {(edu.institution || edu.school) && (
                          <div className="text-gray-700 mb-1">{edu.institution || edu.school}</div>
                        )}
                        <div className="flex items-center gap-4 text-sm text-gray-600">
                          {edu.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {edu.location}
                            </span>
                          )}
                          {(edu.year || edu.graduation_year) && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {edu.year || edu.graduation_year}
                            </span>
                          )}
                          {edu.gpa && <span className="text-gray-700">GPA: {edu.gpa}</span>}
                          {edu.honors && (
                            <span className="px-2 py-0.5 bg-brand-blue text-white rounded text-xs shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
                              {edu.honors}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 bg-slate-50 border border-gray-100 ring-1 ring-black/[0.02] rounded-lg">
                    <h4 className="font-semibold text-gray-800">{
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
                <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                      <Code className="w-4 h-4 text-brand-blue" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Skills</h3>
                  </div>

                  {/* Technical Skills */}
                  {fullResumeData.technicalSkills && fullResumeData.technicalSkills.length > 0 && (
                    <div className="mb-6">
                      <h4 className="font-medium text-gray-900 mb-4">Technical Skills</h4>
                      <div className="flex flex-wrap gap-2">
                        {fullResumeData.technicalSkills.map((skill: string, index: number) => (
                          <span key={index} className="px-3 py-1.5 bg-brand-blue/5 text-brand-blue rounded-lg text-sm ring-1 ring-brand-blue/20">
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
                          <span key={index} className="px-3 py-1.5 bg-brand-blue/5 text-brand-blue rounded-lg text-sm ring-1 ring-brand-blue/20">
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
                        <span key={index} className="px-3 py-1.5 bg-brand-blue/5 text-brand-blue rounded-lg text-sm ring-1 ring-brand-blue/20">
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Fallback to matched skills if no specific skills available */}
                  {!fullResumeData.skills?.length && !fullResumeData.technicalSkills?.length && !fullResumeData.softSkills?.length && matchedSkills.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {matchedSkills.map((skill, index) => (
                        <span key={index} className="px-3 py-1.5 bg-brand-blue/5 text-brand-blue rounded-lg text-sm ring-1 ring-brand-blue/20">
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              {/* Certifications */}
              {fullResumeData.certifications && fullResumeData.certifications.length > 0 && (
                <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <div className="w-9 h-9 rounded-lg bg-brand-orange/10 ring-1 ring-brand-orange/15 flex items-center justify-center">
                      <Award className="w-4 h-4 text-brand-orange" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Certifications</h3>
                  </div>
                  <div className="space-y-4">
                    {fullResumeData.certifications.map((cert, index) => {
                      // Handle both string and object formats
                      const certName = typeof cert === 'string' ? cert : (cert.name || 'Certification');
                      const certIssuer = typeof cert === 'object' ? cert.issuer : null;
                      const certDate = typeof cert === 'object' ? cert.date : null;
                      const certCredentialId = typeof cert === 'object' ? cert.credential_id : null;
                      return (
                        <div key={index} className="p-4 bg-slate-50 border border-gray-100 ring-1 ring-black/[0.02] rounded-lg">
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="font-semibold text-gray-900 mb-1">{certName}</h4>
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
                            <Award className="w-6 h-6 text-brand-orange" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Languages */}
              {fullResumeData.languages && fullResumeData.languages.length > 0 && (
                <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <div className="w-9 h-9 rounded-lg bg-brand-cyan/10 ring-1 ring-brand-cyan/15 flex items-center justify-center">
                      <Languages className="w-4 h-4 text-brand-cyan" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Languages</h3>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                    {fullResumeData.languages.map((language: any, index: number) => {
                      // Handle both string and object formats
                      const langName = typeof language === 'string' ? language : (language.name || language.language || 'Unknown');
                      const proficiency = typeof language === 'object' ? (language.proficiency || language.level || 'Fluent') : 'Fluent';
                      return (
                        <div key={index} className="p-4 bg-slate-50 border border-gray-100 ring-1 ring-black/[0.02] rounded-lg text-center">
                          <div className="font-medium text-gray-900 mb-1">{langName}</div>
                          <div className="text-sm text-gray-600">{proficiency}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Projects */}
              {fullResumeData.projects && fullResumeData.projects.length > 0 && (
                <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                      <Code className="w-4 h-4 text-brand-blue" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Projects</h3>
                  </div>
                  <div className="space-y-4">
                    {fullResumeData.projects.map((project: any, index: number) => (
                      <div key={index} className="p-4 bg-slate-50 border border-gray-100 ring-1 ring-black/[0.02] rounded-lg">
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-semibold text-gray-900">{project.name}</h4>
                          {project.url && (
                            <a href={project.url} target="_blank" rel="noopener noreferrer" className="text-brand-blue hover:text-brand-blue-2">
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
                            <span className="px-2 py-0.5 bg-brand-blue/10 text-brand-blue rounded ring-1 ring-brand-blue/20">
                              {Array.isArray(project.technologies) ? project.technologies.join(', ') : project.technologies}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Awards */}
              {fullResumeData.awards && fullResumeData.awards.length > 0 && (
                <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <div className="w-9 h-9 rounded-lg bg-brand-orange/10 ring-1 ring-brand-orange/15 flex items-center justify-center">
                      <Award className="w-4 h-4 text-brand-orange" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Awards &amp; Honors</h3>
                  </div>
                  <div className="space-y-4">
                    {fullResumeData.awards.map((award: any, index: number) => (
                      <div key={index} className="p-4 bg-slate-50 border border-gray-100 ring-1 ring-black/[0.02] rounded-lg">
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="font-semibold text-gray-900 mb-1">{award.name}</h4>
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
                          <Award className="w-6 h-6 text-brand-orange" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Achievements */}
              {fullResumeData.achievements && fullResumeData.achievements.length > 0 && (
                <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                      <Star className="w-4 h-4 text-brand-blue" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Achievements</h3>
                  </div>
                  <div className="space-y-2">
                    {fullResumeData.achievements.map((achievement: any, index: number) => (
                      <div key={index} className="flex items-start gap-2 text-gray-700">
                        <ChevronRight className="w-4 h-4 text-brand-blue flex-shrink-0 mt-0.5" />
                        <span>{typeof achievement === 'string' ? achievement : achievement.description || achievement.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Hobbies & Interests */}
              {fullResumeData.hobbies && fullResumeData.hobbies.length > 0 && (
                <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <div className="w-9 h-9 rounded-lg bg-brand-cyan/10 ring-1 ring-brand-cyan/15 flex items-center justify-center">
                      <Star className="w-4 h-4 text-brand-cyan" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Hobbies &amp; Interests</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {fullResumeData.hobbies.map((hobby: any, index: number) => (
                      <span key={index} className="px-3 py-1.5 bg-brand-cyan/5 text-brand-teal rounded-lg text-sm ring-1 ring-brand-cyan/20">
                        {typeof hobby === 'string' ? hobby : hobby.name || hobby}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Social Links */}
              {(fullResumeData.linkedinUrl || fullResumeData.githubUrl || fullResumeData.portfolioUrl) && (
                <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                      <FileText className="w-4 h-4 text-brand-blue" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Social &amp; Portfolio Links</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                    {fullResumeData.linkedinUrl && (
                      <a href={fullResumeData.linkedinUrl} target="_blank" rel="noopener noreferrer"
                         className="flex items-center justify-center gap-2 p-4 bg-slate-50 border border-gray-100 ring-1 ring-black/[0.02] rounded-lg hover:bg-brand-blue/5 hover:ring-brand-blue/20 transition-colors">
                        <span className="text-brand-blue text-sm font-medium">LinkedIn</span>
                      </a>
                    )}
                    {fullResumeData.githubUrl && (
                      <a href={fullResumeData.githubUrl} target="_blank" rel="noopener noreferrer"
                         className="flex items-center justify-center gap-2 p-4 bg-slate-50 border border-gray-100 ring-1 ring-black/[0.02] rounded-lg hover:bg-brand-blue/5 hover:ring-brand-blue/20 transition-colors">
                        <span className="text-brand-blue text-sm font-medium">GitHub</span>
                      </a>
                    )}
                    {fullResumeData.portfolioUrl && (
                      <a href={fullResumeData.portfolioUrl} target="_blank" rel="noopener noreferrer"
                         className="flex items-center justify-center gap-2 p-4 bg-slate-50 border border-gray-100 ring-1 ring-black/[0.02] rounded-lg hover:bg-brand-blue/5 hover:ring-brand-blue/20 transition-colors">
                        <span className="text-brand-blue text-sm font-medium">Portfolio</span>
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Notice Period */}
              {fullResumeData.noticePeriod && (
                <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                      <Clock className="w-4 h-4 text-brand-blue" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Notice Period</h3>
                  </div>
                  <p className="text-gray-700">{fullResumeData.noticePeriod}</p>
                </div>
              )}

              {/* Volunteer Experience */}
              {fullResumeData.volunteerExperience && fullResumeData.volunteerExperience.length > 0 && (
                <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <div className="w-9 h-9 rounded-lg bg-brand-cyan/10 ring-1 ring-brand-cyan/15 flex items-center justify-center">
                      <Star className="w-4 h-4 text-brand-cyan" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Volunteer Experience</h3>
                  </div>
                  <div className="space-y-4">
                    {fullResumeData.volunteerExperience.map((vol: any, index: number) => (
                      <div key={index} className="p-4 bg-slate-50 border border-gray-100 ring-1 ring-black/[0.02] rounded-lg">
                        <h4 className="font-semibold text-gray-900 mb-1">{vol.role || vol.title}</h4>
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
                <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                      <FileText className="w-4 h-4 text-brand-blue" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Career Objective</h3>
                  </div>
                  <p className="text-gray-700 leading-relaxed">{fullResumeData.objective}</p>
                </div>
              )}

              {/* Additional Information */}
              {fullResumeData.additionalInfo && (
                <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                      <FileText className="w-4 h-4 text-brand-blue" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Additional Information</h3>
                  </div>
                  <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{fullResumeData.additionalInfo}</p>
                </div>
              )}

              {/* Version History — tick two uploads to diff them, same flow as
                  resume-view. */}
              {resumeVersions.length > 0 && (
                <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-6 flex-wrap">
                    <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                      <History className="w-4 h-4 text-brand-blue" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Version History</h3>
                    <span className="px-2.5 py-0.5 bg-brand-blue/10 text-brand-blue rounded-full text-xs ring-1 ring-brand-blue/20">
                      {resumeVersions.length} version{resumeVersions.length !== 1 ? 's' : ''}
                    </span>
                    {resumeVersions.length > 1 && (
                      <button
                        onClick={() => setShowCompareModal(true)}
                        disabled={compareChecked.length !== 2}
                        className={`ml-auto px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                          compareChecked.length === 2
                            ? 'bg-brand-blue hover:bg-brand-blue-2 text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10'
                            : 'bg-slate-100 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        {compareChecked.length === 2
                          ? 'Compare Selected'
                          : compareChecked.length === 1
                            ? 'Select 1 more to compare'
                            : 'Select 2 versions to compare'}
                      </button>
                    )}
                  </div>
                  <div className="space-y-3">
                    {(() => {
                      const sortedVersions = [...resumeVersions].sort(byNewestVersion);
                      return sortedVersions.map((version, index) => {
                        const isLatest = index === 0;
                        const versionNumber = version.version || (sortedVersions.length - index);
                        // Sorted newest-first, so the next row down is the
                        // upload this one is diffed against.
                        const previousVersion = index < sortedVersions.length - 1 ? sortedVersions[index + 1] : null;
                        return (
                          <div
                            key={version.id}
                            className={`rounded-lg border p-4 ${
                              isLatest
                                ? 'bg-brand-blue/5 border-brand-blue/30 ring-1 ring-brand-blue/10'
                                : 'bg-slate-50 border-gray-100 ring-1 ring-black/[0.02]'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-3 min-w-0">
                                {/* Compare tick */}
                                {resumeVersions.length > 1 && (
                                  <label className="flex items-center cursor-pointer flex-shrink-0 mt-2">
                                    <input
                                      type="checkbox"
                                      checked={compareChecked.includes(version.id)}
                                      onChange={() => handleCompareCheck(version.id)}
                                      className="w-4 h-4 rounded border-gray-300 text-brand-blue focus:ring-brand-blue/40 cursor-pointer"
                                    />
                                  </label>
                                )}
                                <div className={`p-2 rounded-lg flex-shrink-0 ${
                                  isLatest ? 'bg-brand-blue/10 ring-1 ring-brand-blue/20' : 'bg-white ring-1 ring-gray-200'
                                }`}>
                                  <FileText className={`w-4 h-4 ${isLatest ? 'text-brand-blue' : 'text-gray-500'}`} />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium text-gray-900">Version {version.version}</span>
                                    {isLatest && (
                                      <span className="px-2 py-0.5 bg-brand-blue text-white rounded text-xs shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
                                        Latest
                                      </span>
                                    )}
                                  </div>
                                  {version.fileName && (
                                    <div className="text-sm text-gray-700 truncate">{version.fileName}</div>
                                  )}
                                  <div className="flex items-center gap-4 text-xs text-gray-600 mt-1 flex-wrap">
                                    {version.uploadDate && (
                                      <span className="flex items-center gap-1">
                                        <Calendar className="w-3 h-3" />
                                        {formatIST(version.uploadDate)}
                                      </span>
                                    )}
                                    <span className="flex items-center gap-1">
                                      <User className="w-3 h-3" />
                                      {version.uploadedBy}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              {/* Size sits with the row actions, matching
                                  resume-view's View Changes / view / download
                                  cluster. */}
                              <div className="flex flex-wrap items-center justify-end gap-2 flex-shrink-0">
                                <span className="text-xs text-gray-600 whitespace-nowrap">{version.size}</span>
                                {previousVersion ? (
                                  <button
                                    onClick={() => handleViewVersionChanges(previousVersion.id, version.id)}
                                    title={`Compare Version ${previousVersion.version} with Version ${versionNumber}`}
                                    className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1 bg-white border border-gray-200 text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue cursor-pointer"
                                  >
                                    <History className="w-3 h-3" />
                                    View Changes
                                  </button>
                                ) : (
                                  <span className="px-3 py-1.5 text-xs text-gray-400 italic">First version</span>
                                )}
                                <button
                                  onClick={() => handleVersionPreview(version, versionNumber)}
                                  disabled={versionPreviewLoadingId === version.id}
                                  aria-label="View resume"
                                  title="View resume"
                                  className={`p-2 rounded-md transition-colors cursor-pointer disabled:cursor-wait ${
                                    isLatest
                                      ? 'text-brand-blue hover:bg-brand-blue/10'
                                      : 'text-gray-600 hover:bg-brand-blue/5 hover:text-brand-blue'
                                  }`}
                                >
                                  {versionPreviewLoadingId === version.id
                                    ? <Loader2 className="w-4 h-4 animate-spin" />
                                    : <Eye className="w-4 h-4" />}
                                </button>
                                <button
                                  onClick={() => handleVersionDownload(version, versionNumber)}
                                  aria-label="Download this version"
                                  title="Download this version"
                                  className={`p-2 rounded-md transition-colors cursor-pointer ${
                                    isLatest
                                      ? 'text-brand-blue hover:bg-brand-blue/10'
                                      : 'text-gray-600 hover:bg-brand-blue/5 hover:text-brand-blue'
                                  }`}
                                >
                                  <Download className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}

              {/* File Properties */}
              <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                    <File className="w-4 h-4 text-brand-blue" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 tracking-tight">File Properties</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg">
                        <FileText className="w-4 h-4 text-brand-blue" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs text-gray-500 mb-1">File Name</div>
                        <div className="text-sm text-gray-900 break-all">
                          {fullResumeData.fileName || `${(fullResumeData.candidateName || 'Candidate').replace(/\s+/g, '_')}_Resume.pdf`}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg">
                        <HardDrive className="w-4 h-4 text-brand-blue" />
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 mb-1">File Size</div>
                        <div className="text-sm text-gray-900">
                          {fullResumeData.fileSizeKb
                            ? `${fullResumeData.fileSizeKb} KB`
                            : (resumeVersions[0]?.size || 'Unknown')}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg">
                        <File className="w-4 h-4 text-brand-blue" />
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 mb-1">File Type</div>
                        <div className="text-sm text-gray-900">{(fullResumeData.fileType || 'PDF').toUpperCase()} Document</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg">
                        <Calendar className="w-4 h-4 text-brand-blue" />
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Upload Date</div>
                        <div className="text-sm text-gray-900">
                          {fullResumeData.uploadDate ? formatIST(fullResumeData.uploadDate) : 'Unknown'}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg">
                        <Clock className="w-4 h-4 text-brand-blue" />
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Last Modified</div>
                        <div className="text-sm text-gray-900">
                          {fullResumeData.lastUpdated ? formatIST(fullResumeData.lastUpdated) : 'Never'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg">
                        <User className="w-4 h-4 text-brand-blue" />
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Uploaded By</div>
                        <div className="text-sm text-gray-900">{fullResumeData.uploadedBy || 'Unknown'}</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg">
                        <FileText className="w-4 h-4 text-brand-blue" />
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Total Attachments</div>
                        <div className="text-sm text-gray-900">
                          {resumeVersions.length || 1} file{(resumeVersions.length || 1) !== 1 ? 's' : ''}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg">
                        <History className="w-4 h-4 text-brand-blue" />
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Version Count</div>
                        <div className="text-sm text-gray-900">
                          {(fullResumeData.versionCount || resumeVersions.length || 1)} version{(fullResumeData.versionCount || resumeVersions.length || 1) !== 1 ? 's' : ''}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
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
                      {/* Education chip REMOVED 2026-08-21. Same View-JD panel as
                          JobDetailView: education is a line inside the Must-Have /
                          Nice-to-Have Additional Requirements shown below, so a chip
                          here repeated it - and the scorecard on this very page graded
                          the two copies separately, with opposite verdicts. */}
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

                  {/* JD22 - Additional Details. Above the recruiter-side pair and full
                      width: this is job information the candidate also sees, not an
                      internal annotation. Only rendered when it was filled in. */}
                  {jdDetails.additional_details && (
                    <div className="bg-gray-50 border border-gray-300 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <h4 className="text-sm font-semibold text-gray-900">Additional Details</h4>
                        <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded">
                          Visible to candidates
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 whitespace-pre-wrap">{jdDetails.additional_details}</p>
                    </div>
                  )}

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
                          {/* Labelled Essential/Preferred: Education has no tile of its
                              own, and `education_mandatory` decides which of these two
                              lists a degree requirement lands in - so this label is the
                              only place a Required degree is visible. */}
                          <h5 className="text-sm text-gray-700 mb-3">
                            Must-Have Additional Requirements ({jdMustHaveComments.length})
                            <span className="ml-2 text-xs font-normal text-gray-500">✓ Required (Essential)</span>
                          </h5>
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
                          <h5 className="text-sm text-gray-700 mb-3">
                            Nice-to-Have Additional Requirements ({jdNiceToHaveComments.length})
                            <span className="ml-2 text-xs font-normal text-gray-500">○ Preferred</span>
                          </h5>
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
                        <p className="text-xs text-gray-500 mt-1">{jdRequirementLabel(jdDetails.experience_mandatory)}</p>
                      </div>
                      {/* Education tile REMOVED 2026-08-21 - see the chip note above.
                          `education_mandatory` decides which of the two Additional
                          Requirements lists the degree lands in, and those are labelled
                          Required/Preferred above, so the distinction is still readable. */}
                      {jdDetails.industry_type && (
                        <div className="bg-white border border-gray-200 p-3 sm:p-4 rounded-lg">
                          <h5 className="text-xs sm:text-sm text-gray-600 mb-1 sm:mb-2">Industry Type</h5>
                          <p className="text-sm sm:text-base text-gray-900">{prettifyCode(jdDetails.industry_type)}</p>
                          <p className="text-xs text-gray-500 mt-1">{jdRequirementLabel(jdDetails.industry_mandatory)}</p>
                        </div>
                      )}
                      {jdLocation && (
                        <div className="bg-white border border-gray-200 p-3 sm:p-4 rounded-lg">
                          <h5 className="text-xs sm:text-sm text-gray-600 mb-1 sm:mb-2">Location</h5>
                          <p className="text-sm sm:text-base text-gray-900">{jdLocation}</p>
                          <p className="text-xs text-gray-500 mt-1">{jdRequirementLabel(jdDetails.location_mandatory)}</p>
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

                  {/* Scoring Preferences - the recruiter answers that changed how THIS
                      resume was graded. Most useful on this page of all: it is where
                      someone asks why a candidate failed, and whether an over-qualified
                      candidate is penalised is otherwise invisible. */}
                  <div className="p-4 sm:p-6 border-b border-gray-200">
                    <h4 className="text-base font-semibold text-gray-900 mb-4">Scoring Preferences</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      <div className="bg-white border border-gray-200 p-3 sm:p-4 rounded-lg">
                        <h5 className="text-xs sm:text-sm text-gray-600 mb-1 sm:mb-2">Allow Over-Qualified Candidates</h5>
                        <p className="text-sm sm:text-base text-gray-900">
                          {jdDetails.allow_overqualified === null || jdDetails.allow_overqualified === undefined
                            ? 'Not specified'
                            : jdDetails.allow_overqualified ? 'Yes' : 'No'}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {jdDetails.allow_overqualified === false
                            ? 'Experience well above the range scores lower'
                            : 'Extra relevant experience is not penalised'}
                        </p>
                      </div>
                      <div className="bg-white border border-gray-200 p-3 sm:p-4 rounded-lg">
                        <h5 className="text-xs sm:text-sm text-gray-600 mb-1 sm:mb-2">Job Hopping</h5>
                        <p className="text-sm sm:text-base text-gray-900">
                          {jdDetails.job_hopping_enabled === null || jdDetails.job_hopping_enabled === undefined
                            ? 'Not specified'
                            : jdDetails.job_hopping_enabled ? 'Evaluated' : 'Not evaluated'}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {jdDetails.job_hopping_enabled === false
                            ? 'Tenure pattern is not scored for this role'
                            : 'Scored as a Preferred criterion'}
                        </p>
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

          {/* Assessment picker — only when this JD has more than one invitable
              published assessment. */}
          {showAssessmentPicker && pickerAssessments.length > 0 && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-2xl max-w-[95vw] sm:max-w-2xl w-full max-h-[80dvh] flex flex-col">
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

          {/* Share Resume — the same dialog the resume table and the resume
              page open. The eye reuses View Resume, whose preview sits at
              z-[60], so it opens above this. */}
          {showShareResumeModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-2xl max-w-[95vw] sm:max-w-2xl w-full max-h-[90dvh] overflow-y-auto">
                <div className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-brand-blue rounded-xl flex items-center justify-center shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
                        <Mail className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-gray-900 tracking-tight">Share Resume</h2>
                        <p className="text-sm text-gray-500">The selected candidate&rsquo;s resume will be shared with the recipient via email.</p>
                      </div>
                    </div>
                    <button
                      onClick={closeShareModal}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      aria-label="Close"
                    >
                      <X className="w-5 h-5 text-gray-500" />
                    </button>
                  </div>

                  <div className="space-y-4">
                    {/* Both files this page can send on, side by side: the
                        resume itself and the scorecard for this JD. */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Attachments</label>
                      <div className="flex flex-col sm:flex-row items-stretch gap-3">
                        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 min-w-0 flex-1">
                          <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
                            <FileText className="w-4 h-4 text-brand-blue" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div
                              className="text-sm font-medium text-gray-900 truncate"
                              title={fullResumeData.fileName || `${fullResumeData.candidateName}.pdf`}
                            >
                              {fullResumeData.fileName || `${fullResumeData.candidateName}.pdf`}
                            </div>
                            <div className="text-xs text-gray-500 truncate">
                              Resume
                              {fullResumeData.fileType && <> &middot; {fullResumeData.fileType.toUpperCase()}</>}
                              {fullResumeData.fileSizeKb ? <> &middot; {Math.round(fullResumeData.fileSizeKb)} KB</> : null}
                            </div>
                          </div>
                          <Paperclip className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <button
                            type="button"
                            onClick={handleViewResume}
                            disabled={loadingResumeDetail}
                            className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-brand-blue hover:bg-brand-blue/10 transition-colors disabled:opacity-50"
                            aria-label={`View ${fullResumeData.candidateName}'s resume`}
                            title="View resume"
                          >
                            {loadingResumeDetail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>

                        {/* The scorecard PDF, built on demand — the download
                            button is the same one in the header bar. */}
                        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 min-w-0 flex-1">
                          <div className="w-9 h-9 rounded-lg bg-brand-cyan/10 ring-1 ring-brand-cyan/15 flex items-center justify-center flex-shrink-0">
                            <Award className="w-4 h-4 text-brand-cyan" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div
                              className="text-sm font-medium text-gray-900 truncate"
                              title={`Scorecard - ${fullResumeData.candidateName}.pdf`}
                            >
                              Scorecard - {fullResumeData.candidateName}.pdf
                            </div>
                            <div className="text-xs text-gray-500 truncate">
                              Scorecard &middot; PDF
                              {fullResumeData.scorePercentage != null && <> &middot; {formatOverallScore(fullResumeData.overallRating10, fullResumeData.scorePercentage)}</>}
                            </div>
                          </div>
                          <Paperclip className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <button
                            type="button"
                            onClick={handlePreviewScorecard}
                            disabled={loadingScorecardPreview}
                            className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-brand-blue hover:bg-brand-blue/10 transition-colors disabled:opacity-50"
                            aria-label={`View ${fullResumeData.candidateName}'s scorecard`}
                            title="View scorecard"
                          >
                            {loadingScorecardPreview ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Recipient Email <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        value={shareEmail}
                        onChange={(e) => setShareEmail(e.target.value)}
                        placeholder="Enter email address"
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue outline-none transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                      <input
                        type="text"
                        value={shareSubject}
                        onChange={(e) => setShareSubject(e.target.value)}
                        placeholder="Email subject"
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue outline-none transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                      <textarea
                        value={shareMessage}
                        onChange={(e) => setShareMessage(e.target.value)}
                        placeholder="Enter your message"
                        rows={8}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue outline-none transition-all resize-none"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                    <button
                      onClick={closeShareModal}
                      className="px-4 py-2 text-gray-700 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSendShareEmail}
                      disabled={isSendingEmail || !shareEmail.trim()}
                      className="flex items-center gap-2 px-6 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
                    >
                      {isSendingEmail ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          Send Email
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* The scorecard, read in place. z-[60] puts it over the share
              dialog, the same level the resume preview uses. */}
          {scorecardPreviewUrl && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[95vw] sm:max-w-2xl h-[90dvh] flex flex-col overflow-hidden">
                {/* Header — the resume preview's, with the scorecard's own
                    subtitle. */}
                <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-gray-100 bg-gray-50 flex-shrink-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-brand-blue flex items-center justify-center shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 flex-shrink-0">
                      <Eye className="w-5 h-5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold text-gray-900 tracking-tight truncate">Scorecard</h2>
                      <p className="text-sm text-gray-500 truncate">
                        {fullResumeData.candidateName}
                        {fullResumeData.scorePercentage != null && <> &middot; {formatOverallScore(fullResumeData.overallRating10, fullResumeData.scorePercentage)}</>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={handleDownloadScorecard}
                      className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors text-sm cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      <span className="hidden sm:inline">Download</span>
                    </button>
                    <button
                      onClick={closeScorecardPreview}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                      aria-label="Close"
                    >
                      <X className="w-5 h-5 text-gray-500" />
                    </button>
                  </div>
                </div>

                {/* The PDF on the same grey ground, in the same white page the
                    resume text is rendered on. The document scrolls inside the
                    viewer, so the ground itself doesn't. */}
                <div className="flex-1 overflow-hidden bg-gray-100 p-4 sm:p-6">
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 max-w-2xl mx-auto h-full overflow-hidden">
                    <iframe src={scorecardPreviewUrl} title="Scorecard preview" className="w-full h-full" />
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

          {/* Version Comparison — the same side-by-side / unified diff
              resume-view shows, on the shared textDiff helpers so both views
              stay in step. */}
          {showCompareModal && comparePair && (() => {
            const { older, newer } = comparePair;
            const olderText = older.extractedText || '';
            const newerText = newer.extractedText || '';
            const diff = buildUnifiedDiff(olderText, newerText);
            const sidePairs = buildDiffSidePairs(diff.lines);

            const closeCompare = () => {
              setShowCompareModal(false);
              setCompareChecked([]);
            };

            // Resume text is plain, not markdown — so a heading is guessed from
            // a short line that reads like a known CV section.
            const sectionHeaders = [
              'experience', 'work experience', 'employment', 'professional experience',
              'education', 'academic', 'qualifications',
              'skills', 'technical skills', 'core competencies', 'expertise', 'key skills',
              'summary', 'professional summary', 'objective', 'profile', 'about',
              'certifications', 'certificates', 'licenses',
              'projects', 'key projects',
              'achievements', 'accomplishments', 'awards',
              'languages', 'contact', 'personal', 'references', 'hobbies', 'interests',
            ];

            const renderLine = (
              line: { text: string; type: 'added' | 'removed' | 'unchanged' } | null,
              idx: number,
              side: 'left' | 'right',
            ) => {
              // Blank spacer keeping the two columns aligned across an uneven edit.
              if (!line) return <div key={idx} className="h-7 bg-gray-50" />;

              const trimmed = line.text.trim();
              if (!trimmed) return <div key={idx} className="h-3" />;

              const lower = trimmed.toLowerCase().replace(/[:\-_]/g, ' ').trim();
              const isHeader = trimmed.length < 50 && sectionHeaders.some(
                (h) => lower === h || lower.startsWith(`${h} `) || lower.endsWith(` ${h}`)
              );

              let tone = 'text-gray-800';
              let marker = '';
              if (line.type === 'removed' && side === 'left') {
                tone = 'text-red-800';
                marker = 'bg-red-50 border-l-4 border-red-400 pl-2';
              } else if (line.type === 'added' && side === 'right') {
                tone = 'text-green-800';
                marker = 'bg-green-50 border-l-4 border-green-400 pl-2';
              }

              if (isHeader) {
                return (
                  <h4 key={idx} className={`text-xs font-bold mt-4 mb-1.5 pb-1 border-b border-gray-300 uppercase tracking-wide ${marker} ${tone}`}>
                    {trimmed}
                  </h4>
                );
              }

              const isBullet = /^[•\-*]\s?/.test(trimmed);
              return (
                <p key={idx} className={`text-xs leading-relaxed mb-0.5 py-0.5 ${isBullet ? 'pl-3' : ''} ${marker} ${tone}`}>
                  {trimmed}
                </p>
              );
            };

            return (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
                <div className={`bg-white rounded-2xl shadow-2xl w-full ${compareViewMode === 'side-by-side' ? 'max-w-7xl' : 'max-w-4xl'} h-[85dvh] flex flex-col overflow-hidden transition-all duration-300`}>
                  {/* Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-gray-100 bg-gray-50 flex-shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-brand-blue flex items-center justify-center shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 flex-shrink-0">
                        <History className="w-5 h-5 text-white" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-lg font-semibold text-gray-900 tracking-tight">Version Comparison</h2>
                        <p className="text-sm text-gray-500 truncate">
                          Version {older.version} vs Version {newer.version}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex bg-slate-100 rounded-lg p-0.5">
                        <button
                          onClick={() => setCompareViewMode('side-by-side')}
                          className={`px-3 py-1.5 text-xs rounded-md transition-colors font-medium ${
                            compareViewMode === 'side-by-side'
                              ? 'bg-white text-brand-blue shadow-sm shadow-brand-blue/10 ring-1 ring-brand-blue/15'
                              : 'text-gray-500 hover:text-brand-blue'
                          }`}
                        >
                          Side by Side
                        </button>
                        <button
                          onClick={() => setCompareViewMode('unified')}
                          className={`px-3 py-1.5 text-xs rounded-md transition-colors font-medium ${
                            compareViewMode === 'unified'
                              ? 'bg-white text-brand-blue shadow-sm shadow-brand-blue/10 ring-1 ring-brand-blue/15'
                              : 'text-gray-500 hover:text-brand-blue'
                          }`}
                        >
                          Unified
                        </button>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="flex items-center gap-1.5 px-2.5 py-1 bg-green-50 border border-green-200 rounded-full text-green-700">
                          <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                          +{diff.addedCount}
                        </span>
                        <span className="flex items-center gap-1.5 px-2.5 py-1 bg-red-50 border border-red-200 rounded-full text-red-700">
                          <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                          −{diff.removedCount}
                        </span>
                      </div>
                      <button
                        onClick={closeCompare}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        aria-label="Close"
                      >
                        <X className="w-5 h-5 text-gray-500" />
                      </button>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 overflow-hidden bg-gray-100">
                    {!olderText && !newerText ? (
                      <div className="text-center text-gray-500 py-12">
                        <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                        <p>Extracted text not available for comparison.</p>
                        <p className="text-sm mt-1">Only the five most recent uploads carry their text.</p>
                      </div>
                    ) : diff.addedCount === 0 && diff.removedCount === 0 ? (
                      <div className="text-center text-gray-500 py-12">
                        <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-400" />
                        <p className="font-medium">No changes detected</p>
                        <p className="text-sm mt-1">Content is identical between these versions.</p>
                      </div>
                    ) : compareViewMode === 'side-by-side' ? (
                      <div className="flex h-full gap-0">
                        {/* Older */}
                        <div className="flex-1 flex flex-col border-r border-gray-300 min-w-0">
                          <div className="px-4 py-2.5 bg-red-50 border-b border-gray-200 flex-shrink-0">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 bg-red-400 rounded-full"></span>
                              <span className="text-sm font-semibold text-red-800">Version {older.version}</span>
                              <span className="text-xs text-red-600 ml-1">(older)</span>
                            </div>
                            <p className="text-xs text-red-600 mt-0.5 truncate">{older.fileName}</p>
                          </div>
                          <div className="flex-1 overflow-y-auto p-4">
                            <div className="bg-white rounded-lg border border-gray-200 p-5">
                              {sidePairs.map((pair, idx) => renderLine(pair.left, idx, 'left'))}
                            </div>
                          </div>
                        </div>
                        {/* Newer */}
                        <div className="flex-1 flex flex-col min-w-0">
                          <div className="px-4 py-2.5 bg-green-50 border-b border-gray-200 flex-shrink-0">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                              <span className="text-sm font-semibold text-green-800">Version {newer.version}</span>
                              <span className="text-xs text-green-600 ml-1">(newer)</span>
                            </div>
                            <p className="text-xs text-green-600 mt-0.5 truncate">{newer.fileName}</p>
                          </div>
                          <div className="flex-1 overflow-y-auto p-4">
                            <div className="bg-white rounded-lg border border-gray-200 p-5">
                              {sidePairs.map((pair, idx) => renderLine(pair.right, idx, 'right'))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Unified */
                      <div className="h-full overflow-y-auto p-4 sm:p-6">
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 sm:p-8 max-w-3xl mx-auto">
                          {diff.lines.map((line, idx) => {
                            const trimmed = line.text.trim();
                            if (!trimmed) return <div key={idx} className="h-3" />;

                            const lower = trimmed.toLowerCase().replace(/[:\-_]/g, ' ').trim();
                            const isHeader = trimmed.length < 50 && sectionHeaders.some(
                              (h) => lower === h || lower.startsWith(`${h} `) || lower.endsWith(` ${h}`)
                            );

                            const marker = line.type === 'added'
                              ? 'bg-green-100 border-l-4 border-green-500 pl-3'
                              : line.type === 'removed'
                                ? 'bg-red-50 border-l-4 border-red-400 pl-3 line-through opacity-70'
                                : '';
                            const tone = line.type === 'added'
                              ? 'text-green-900'
                              : line.type === 'removed'
                                ? 'text-red-700'
                                : 'text-gray-800';

                            if (isHeader) {
                              return (
                                <h4 key={idx} className={`text-base font-bold mt-5 mb-2 pb-1 border-b border-gray-300 uppercase tracking-wide rounded ${marker} ${tone}`}>
                                  {trimmed}
                                </h4>
                              );
                            }

                            const isBullet = /^[•\-*]\s?/.test(trimmed);
                            return (
                              <p key={idx} className={`text-sm leading-relaxed mb-0.5 rounded ${isBullet ? 'pl-4' : ''} ${marker} ${tone}`}>
                                {trimmed}
                              </p>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-end px-4 sm:px-6 py-3 border-t border-gray-100 bg-slate-50 flex-shrink-0">
                    <button
                      onClick={closeCompare}
                      className="px-5 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-all text-sm font-medium shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Single-version preview (the eye on a Version History row). Resume
              text is plain, not markdown, so headings are guessed the same way
              the comparison does — one shared list of CV section names. */}
          {versionPreview && (() => {
            const lines = versionPreview.text.split('\n');
            const sectionHeaders = [
              'experience', 'work experience', 'employment', 'professional experience',
              'education', 'academic', 'qualifications',
              'skills', 'technical skills', 'core competencies', 'expertise', 'key skills',
              'summary', 'professional summary', 'objective', 'profile', 'about',
              'certifications', 'certificates', 'licenses',
              'projects', 'key projects',
              'achievements', 'accomplishments', 'awards',
              'languages', 'contact', 'personal', 'references', 'hobbies', 'interests',
            ];
            const firstNonEmpty = lines.findIndex((l) => l.trim().length > 0);
            // View Resume always lands here on the newest upload, so say which
            // one it is — the eye can also open older versions.
            const isLatestPreview = [...resumeVersions].sort(byNewestVersion)[0]?.id === versionPreview.id;

            return (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[95vw] sm:max-w-2xl h-[90dvh] flex flex-col overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-gray-100 bg-gray-50 flex-shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-brand-blue flex items-center justify-center shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 flex-shrink-0">
                        <Eye className="w-5 h-5 text-white" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <h2 className="text-lg font-semibold text-gray-900 tracking-tight truncate">Version {versionPreview.versionNumber}</h2>
                          {isLatestPreview && (
                            <span className="px-2 py-0.5 bg-brand-blue text-white rounded text-xs flex-shrink-0 shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
                              Latest
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 truncate">{versionPreview.fileName}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleVersionDownload(
                          { id: versionPreview.id, fileName: versionPreview.fileName },
                          versionPreview.versionNumber,
                        )}
                        className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors text-sm cursor-pointer"
                      >
                        <Download className="w-4 h-4" />
                        <span className="hidden sm:inline">Download</span>
                      </button>
                      <button
                        onClick={() => setVersionPreview(null)}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                        aria-label="Close"
                      >
                        <X className="w-5 h-5 text-gray-500" />
                      </button>
                    </div>
                  </div>

                  {/* Resume content — document style */}
                  <div className="flex-1 overflow-y-auto bg-gray-100 p-4 sm:p-6">
                    {versionPreview.text ? (
                      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 sm:p-8 max-w-2xl mx-auto min-h-full">
                        {lines.map((line, idx) => {
                          const trimmed = line.trim();
                          if (!trimmed) return <div key={idx} className="h-3" />;

                          const lower = trimmed.toLowerCase().replace(/[:\-_]/g, ' ').trim();
                          const isHeader = trimmed.length < 50 && sectionHeaders.some(
                            (h) => lower === h || lower.startsWith(`${h} `) || lower.endsWith(` ${h}`)
                          );

                          if (isHeader) {
                            return (
                              <h3 key={idx} className="text-base font-bold text-gray-900 mt-5 mb-2 pb-1 border-b border-gray-300 uppercase tracking-wide">
                                {trimmed}
                              </h3>
                            );
                          }

                          // The first line of a CV is almost always the name.
                          if (idx === firstNonEmpty) {
                            return <h2 key={idx} className="text-xl font-bold text-gray-900 mb-1">{trimmed}</h2>;
                          }

                          const isBullet = /^[•\-*]\s?/.test(trimmed);
                          return (
                            <p key={idx} className={`text-sm text-gray-700 leading-relaxed mb-0.5 ${isBullet ? 'pl-4' : ''}`}>
                              {trimmed}
                            </p>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 max-w-2xl mx-auto min-h-full flex flex-col items-center justify-center text-center">
                        <FileText className="w-10 h-10 text-gray-400 mb-3" />
                        <p className="text-sm font-medium text-gray-900">Preview not available</p>
                        <p className="text-sm text-gray-500 mt-1">Download the resume to view the original file.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </main>
  );
}
