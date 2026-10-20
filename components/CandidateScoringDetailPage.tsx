'use client';

import { RESUME_EMAIL_SHARE_ENABLED } from '@/lib/constants/featureFlags';
import { CREATE_SEND_BUTTON_CLASS, CANDIDATE_ACTION_BUTTON_CLASS } from '@/lib/constants/createSendActions';
import { Target, Award, CheckCircle, XCircle, TrendingUp, Mail, Phone, MapPin, Briefcase, GraduationCap, Star, Calendar, Zap, FileText, AlertCircle, Download, Clock, Building2, ChevronLeft, ChevronRight, ChevronDown, Code, Languages, BarChart3, CheckSquare, MessageSquare, Minus, ThumbsUp, ThumbsDown, Loader2, UserPlus, History, File, HardDrive, User, X, Eye, Share2, Paperclip, Send, Plus, ClipboardList, Video } from 'lucide-react';
import DetailedScorecardTab from './DetailedScorecardTab';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import ShareAssessmentModal from './ShareAssessmentModal';
import InviteToAIInterviewFlow from './InviteToAIInterviewFlow';
import InviteToAssessmentFlow from './InviteToAssessmentFlow';
import type { InviteCandidate } from '@/components/talent-match-invite/inviteVersions';
import type { Resume as ResumeRecord } from '@/lib/types/types';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { usePlanLock } from '@/lib/hooks/usePlanFeature';
import { PLAN_LOCKED_MESSAGE } from '@/lib/types/planFeatures';
import { useJobInviteTargets, isInvitableAssessment } from '@/lib/hooks/useJobInviteTargets';
import CreateInviteTargetModal from './resume-scoring/CreateInviteTargetModal';
import { buildCreateUrl, clearInviteHandoff, readInviteHandoff, saveInviteHandoff, withResumeInviteMarker, RESUME_INVITE_PARAM, type InviteHandoffKind } from '@/lib/utils/resumeScoringInviteHandoff';
import ConfirmationDialog from '@/components/ConfirmationDialog';
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
import { criterionScoringLabel, requirementBadge } from '@/lib/utils/scoringCriteria';
import ExtractedDataSummary from '@/components/jobs/ExtractedDataSummary';
import { Skeleton } from '@/components/ui/skeleton';

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
  jobCode?: string;     // The job's display ID (JD-001), when the list row carries it
  jobVersion?: number;  // The job's lineage version (v1, v2, ...)
}

/** One look for every header action (Share, Invite, View Resume, Download
 *  Scorecard), copied from the Previous / Next pager in the breadcrumb bar:
 *  white, brand-blue outline + text, filling solid brand-blue on hover. */
const HEADER_ACTION_BTN =
  'inline-flex items-center justify-center gap-2 h-10 px-4 text-sm font-semibold whitespace-nowrap rounded-lg border-2 border-brand-blue/60 bg-white text-brand-blue shadow-sm cursor-pointer transition-colors hover:bg-brand-blue hover:text-white hover:border-brand-blue focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:text-brand-blue disabled:hover:border-brand-blue/60';
/** HEADER_ACTION_BTN when the user lacks the permission: shown, greyed, no hover colour. */
const HEADER_ACTION_BTN_LOCKED =
  'inline-flex items-center justify-center gap-2 h-10 px-4 text-sm font-semibold whitespace-nowrap rounded-lg border-2 border-gray-200 bg-gray-50 text-gray-400 shadow-sm cursor-not-allowed opacity-60';
/** Create / Send / candidate action button when the user lacks the permission. */
const CREATE_SEND_BUTTON_LOCKED_CLASS =
  'flex items-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm font-medium whitespace-nowrap bg-gray-50 border border-gray-200 text-gray-400 cursor-not-allowed opacity-60';

/** Email / phone / location chip — the resume view's contact badge
 *  (resume-view/[id]), on this card's white instead of its tinted one. */
const CONTACT_BADGE =
  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white text-xs text-gray-700 ring-1 ring-brand-blue/10';

/** Technical / soft skill chip — the resume view's compact skill badge
 *  (resume-view/[id]); wraps with its siblings in a `flex-wrap gap-1.5` row. */
const SKILL_BADGE =
  'inline-flex items-center px-2 py-0.5 bg-brand-blue/5 text-brand-blue rounded-md text-xs ring-1 ring-brand-blue/20';

const DETAIL_TABS = ['overview', 'scoretable', 'personalinfo', 'viewjd'] as const;
type DetailTab = typeof DETAIL_TABS[number];
const DETAIL_TAB_STORAGE_KEY = 'resumeScoring.candidateDetail.activeTab';

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
  /** Steps through this candidate's other scored jobs (a RecordPager),
   *  shown beside the Version badge. */
  jobPager?: { page: number; total: number; onPageChange: (page: number) => void };
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
  /**
   * Resume Scoring only: when the job has no AI Assessment / AI Interview
   * yet, the Invite menu offers "+ Create ..." - the landing page's
   * create -> come back -> invite round trip, for this one candidate.
   */
  allowCreateInviteTarget?: boolean;
  /**
   * The Invite menu's two entries open the host's Create / Send popup
   * (VersionInviteDialog) for this one candidate — the flow Job Details'
   * tables use: pick this job's assessment / AI interview version, or create
   * the next. Given it, the entries are gated by permission and plan only
   * (the popup offers Create when the job has none), replacing the
   * assessment picker, the AI interview flow and "+ Create ...".
   */
  onOpenInviteDialog?: (kind: 'assessment' | 'interview', candidates: InviteCandidate[]) => void;
  /**
   * Open another score of this candidate for this job — the Version
   * dropdown's pick of a resume version that was scored here. Hosts move
   * their own view to that score row (as Prev / Next do); without it the
   * dropdown only previews versions.
   */
  onSelectScore?: (scoreId: string, resumeVersion: number) => void;
  /**
   * Job Details → Scored Resumes → View Result: this page shows the score of
   * the one resume version that was scored, so its version is a plain badge
   * for reference — no dropdown to switch versions.
   */
  versionReadOnly?: boolean;
  /**
   * Job Details → Scored Resumes → View Result: the header's actions laid out
   * flat — Create / Send Assessment and Create / Send AI Interview as their own
   * buttons (no Invite ▾ menu), View Resume as an eye icon, and Download
   * Scorecard labelled "Scorecard". Takes effect only with `onOpenInviteDialog`,
   * whose two entries are exactly those two buttons.
   */
  inlineHeaderActions?: boolean;
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

export default function CandidateScoringDetailPage({ resume, jobTitle, jobId, onMinimize, currentIndex, totalCount, onPrev, onNext, jobPager, breadcrumbItems, assessmentConfigured, aiInterviewConfigured, allowCreateInviteTarget, onOpenInviteDialog, onSelectScore, versionReadOnly = false, inlineHeaderActions = false }: CandidateScoringDetailPageProps) {
  const { isTenantAdmin, user, hasPermissionCode } = useAuth();
  const { hasPlanFeature, isPlanLocked } = usePlanLock();
  const canExport = isTenantAdmin || (user?.permissions?.canExport ?? false);
  const canShareResume = isTenantAdmin || hasPermissionCode('my_resumes:share');

  // View JD tab: clicking the JD id/title asks before leaving this page for
  // the standalone JD Details page, since it navigates away from the
  // candidate scorecard rather than just switching tabs in place.
  const router = useRouter();
  const [showJdNavConfirm, setShowJdNavConfirm] = useState(false);

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
  // Resume Scoring's own `scoring:invite` toggle, not canCreateAssessments
  // (creating a brand-new assessment is a different action) — same fix
  // already applied to the Scored Resumes table this page is opened from
  // (see ScoredResumesTable.tsx's canCreateAssessments), which this page had
  // missed: previously, disabling Resume Scoring's "Invite" permission had
  // no effect on this button.
  // Resume Scoring → "Invite to Assessment" (separate from "Invite to AI
  // Interview"); the Assessment module's own Invite is what the server checks.
  const mayInviteAssessment =
    isTenantAdmin || (hasPermissionCode('scoring:invite_assessment') && hasPermissionCode('assessments:invite'));
  // Same scoring:invite gate as Assessment above — this page lives on the
  // Resume Scoring surface, so disabling that module's "Invite" permission
  // should turn off BOTH invite targets reachable from it, not just
  // Assessment (see ScoredResumesTable.tsx's mayInviteAIInterview for the
  // matching fix). canInviteAIInterviews (ai_interview:invite) stays
  // required alongside it, since that is what the AI Interview invite
  // endpoints actually enforce server-side.
  const mayInviteAIInterview =
    isTenantAdmin ||
    (hasPermissionCode('scoring:invite_ai_interview') && hasPermission('canInviteAIInterviews'));
  const canInvite = mayInviteAssessment || mayInviteAIInterview;
  // Plan gates DISABLE the entry (hover explains), they never hide it:
  // permission decides what is shown, the plan only whether it is clickable.
  const assessmentPlanLocked = isPlanLocked('assessment');
  const aiInterviewPlanLocked = isPlanLocked('ai_interview');

  /* What this JD can actually invite to. Job Details hands both flags down —
     its Assessment / AI Interview sections read the same two — so this page and
     the Scored Resumes row it was opened from are never out of step. From
     Resume Scoring, where no host tracks it, the hook resolves it from the JD
     itself using the same definition. Each side is only looked up when the
     viewer could use it at all. */
  const inviteTargets = useJobInviteTargets(jobId, {
    assessmentConfigured,
    aiInterviewConfigured,
    // Never look up targets for a feature outside the plan.
    assessmentEnabled: mayInviteAssessment && hasPlanFeature('assessment'),
    aiInterviewEnabled: mayInviteAIInterview && hasPlanFeature('ai_interview'),
  });
  // With no JD to check (the global scoring view's cross-job rows) there is
  // nothing to gate on, so the entries keep their permission-only behaviour and
  // the existing handlers report what's missing after the click.
  /* Back from creating one: what this page itself just confirmed is live -
     a host-supplied flag can still say "none" until the host reloads. */
  const [publishedOnReturn, setPublishedOnReturn] = useState<{ assessment?: boolean; interview?: boolean }>({});
  const assessmentLive = inviteTargets.assessmentConfigured || !!publishedOnReturn.assessment;
  const aiInterviewLive = inviteTargets.aiInterviewConfigured || !!publishedOnReturn.interview;
  // With the host's Create / Send popup, nothing published yet is no block —
  // the popup offers Create.
  const viaInviteDialog = !!onOpenInviteDialog;
  const canInviteAssessment =
    mayInviteAssessment && !assessmentPlanLocked && (viaInviteDialog || !inviteTargets.known || assessmentLive);
  const canInviteAIInterview =
    mayInviteAIInterview && !aiInterviewPlanLocked && (viaInviteDialog || !inviteTargets.known || aiInterviewLive);
  /* Permitted, in the plan, and the job settled as having none yet -> the
     entry greys out with "+ Create ..." under it (Resume Scoring hosts only). */
  const inviteTargetsSettled = inviteTargets.known && !inviteTargets.loading;
  const assessmentMissing = !viaInviteDialog && !!allowCreateInviteTarget && mayInviteAssessment && !assessmentPlanLocked && inviteTargetsSettled && !assessmentLive;
  const aiInterviewMissing = !viaInviteDialog && !!allowCreateInviteTarget && mayInviteAIInterview && !aiInterviewPlanLocked && inviteTargetsSettled && !aiInterviewLive;
  // Every option the user is permitted to pick is outside the plan.
  const invitePlanLocked = canInvite &&
    (!mayInviteAssessment || assessmentPlanLocked) && (!mayInviteAIInterview || aiInterviewPlanLocked);
  // Neither target exists → the Invite button itself is disabled rather than
  // opening a menu whose every entry dead-ends in "create one first".
  // A missing target still opens the menu - to offer creating it.
  const inviteDisabled = !canInviteAssessment && !canInviteAIInterview && !assessmentMissing && !aiInterviewMissing;
  /* See `inlineHeaderActions`. Each flat button keeps its menu entry's gate,
     and why it is disabled, as a tooltip. */
  const flatHeaderActions = inlineHeaderActions && viaInviteDialog;
  const inviteBlockedReason = (may: boolean, planLocked: boolean) =>
    !may ? 'You do not have permission to invite candidates' : planLocked ? PLAN_LOCKED_MESSAGE : undefined;

  const [showInviteMenu, setShowInviteMenu] = useState(false);
  const inviteMenuRef = useRef<HTMLDivElement>(null);

  // View Resume leaves this page for the full Resume Details route rather than
  // opening an overlay. The flag only covers the moment spent resolving which
  // version to open, so the button can show a spinner instead of looking dead.
  const [loadingResumeDetail, setLoadingResumeDetail] = useState(false);

  // Invite flows — both render their existing modal over this page.
  const [shareAssessments, setShareAssessments] = useState<any[]>([]);
  const [showShareAssessmentModal, setShowShareAssessmentModal] = useState(false);
  /* The shared Invite to Assessment dialog (the Invite to AI Interview
     dialog's layout): what it offers, what is picked, and whether it is
     loading. Several can be picked, as this page always allowed. */
  const [pickerAssessments, setPickerAssessments] = useState<any[]>([]);
  const [pickedAssessments, setPickedAssessments] = useState<any[]>([]);
  const [showAssessmentPicker, setShowAssessmentPicker] = useState(false);
  const [loadingPickerAssessments, setLoadingPickerAssessments] = useState(false);
  const [showAIInviteFlow, setShowAIInviteFlow] = useState(false);
  /* The open tab survives a refresh (sessionStorage, this tab only). Read in
     the initializer: this view only mounts client-side, after the scores load. */
  const [activeTab, setActiveTabState] = useState<DetailTab>(() => {
    try {
      const saved = sessionStorage.getItem(DETAIL_TAB_STORAGE_KEY);
      if (saved && (DETAIL_TABS as readonly string[]).includes(saved)) return saved as DetailTab;
    } catch { /* ignore */ }
    return 'overview';
  });
  const setActiveTab = (tab: DetailTab) => {
    setActiveTabState(tab);
    try { sessionStorage.setItem(DETAIL_TAB_STORAGE_KEY, tab); } catch { /* ignore */ }
  };
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
  /* Version dropdown (header badge), modelled on Job Details' JD version
     picker: each upload of this resume, with its score for THIS job when it
     has one. Keyed by the version's own resume id — every upload is its own
     resume record, and a score points at the one it read. */
  const [scoreByResumeId, setScoreByResumeId] = useState<Record<string, { scoreId: string; rating?: number | null; scoredAt?: string }>>({});
  const [scoredResumeId, setScoredResumeId] = useState<string | null>(null);
  const [showVersionMenu, setShowVersionMenu] = useState(false);
  const versionMenuRef = useRef<HTMLDivElement>(null);
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
      // This IS the user viewing the resume's content (via "View Resume" or a
      // version-history preview click), so - unlike the incidental fetches
      // above that just backfill Personal Info fields - it counts as a real
      // "Resume viewed" for the Audit Log.
      const data: any = await resumeService.get(version.id, true);
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
          // Version dropdown: this job's newest score per resume version.
          const byResume: Record<string, { scoreId: string; rating?: number | null; scoredAt?: string }> = {};
          for (const item of (scoredResumes.items || []) as any[]) {
            if (!item?.resume_id) continue;
            const prev = byResume[item.resume_id];
            if (!prev || new Date(item.created_at || 0).getTime() > new Date(prev.scoredAt || 0).getTime()) {
              byResume[item.resume_id] = { scoreId: item.id, rating: item.overall_rating_10, scoredAt: item.created_at };
            }
          }
          setScoreByResumeId(byResume);
          setScoredResumeId(actualResumeId);
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
          // fine; only its diff is unavailable. actualResumeId is skipped here
          // since it was already fetched as `fullResume` above - refetching it
          // was a redundant second request (and, worse, a second uncounted
          // "Resume viewed" audit entry for the same page load).
          let versionsWithText: any[] = versionsData || [];
          if (versionsWithText.length > 0) {
            try {
              const toFetch = versionsWithText.slice(0, 5).filter((v: any) => v.id !== actualResumeId);
              const fullVersions = await Promise.all(
                toFetch.map((v: any) => resumeService.get(v.id).catch(() => v))
              );
              const fullById = new Map<string, any>(fullVersions.map((fv: any) => [fv.id, fv]));
              if (fullResume) fullById.set(actualResumeId, fullResume);
              versionsWithText = versionsWithText.map((v: any) => {
                const full = fullById.get(v.id);
                return full ? { ...v, extracted_text: full.extracted_text } : v;
              });
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
    if (score >= 85) return 'text-success';
    if (score >= 70) return 'text-gray-800';
    if (score >= 60) return 'text-warning';
    return 'text-destructive';
  };

  // Same three colors as the Match Status badge next to it, so the one
  // overall score reads as that status rather than its own score-threshold
  // scale — unlike getScoreColor above, which stays threshold-based for the
  // Score Table tab's many individual criteria, none of which carry their
  // own match status to key off.
  const getOverallScoreColor = (matchStatus: string) => {
    const normalized = matchStatus?.toLowerCase().replace(/[_\s]/g, '');
    if (normalized === 'exactmatch' || normalized === 'excellentmatch') return 'text-success';
    if (normalized === 'partialmatch') return 'text-brand-orange-deep';
    return 'text-destructive';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 85) return 'bg-success-subtle border-success-line text-success';
    if (score >= 70) return 'bg-gray-100 border-gray-300 text-gray-700';
    if (score >= 60) return 'bg-warning-subtle border-warning-line text-warning';
    return 'bg-destructive-subtle border-destructive-line text-destructive';
  };

  const getProgressBarColor = (score: number) => {
    if (score >= 85) return 'bg-success';
    if (score >= 70) return 'bg-gray-600';
    if (score >= 60) return 'bg-warning';
    return 'bg-destructive';
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
    if (normalized === 'exactmatch' || normalized === 'excellentmatch') return 'bg-success-subtle text-success border-success-line';
    if (normalized === 'partialmatch') return 'bg-brand-orange/10 text-brand-orange-deep border-brand-orange/30';
    return 'bg-destructive-subtle text-destructive border-destructive-line';
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
   * the 60% block and a rating below 6 on it fails the whole Essential section.
   * "Preferred" criteria share the 40% block and never fail a candidate alone.
   */
  const jdRequirementLabel = requirementBadge;

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
      case 'published': return 'bg-success-subtle text-success border-success-line';
      case 'draft': return 'bg-warning-subtle text-warning border-warning-line';
      case 'archived': return 'bg-gray-100 text-gray-700 border-gray-300';
      case 'disabled': return 'bg-destructive-subtle text-destructive border-destructive-line';
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

  // Close the Version menu on outside click / Escape.
  useEffect(() => {
    if (!showVersionMenu) return;
    const onDown = (e: MouseEvent) => {
      if (versionMenuRef.current && !versionMenuRef.current.contains(e.target as Node)) setShowVersionMenu(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowVersionMenu(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [showVersionMenu]);

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

  /* Flat header (`inlineHeaderActions`): View Resume as a small eye inside the
     resume version badge, its name in the tooltip and accessible label.
     `joined` draws the divider from the "Version N" text beside it. */
  const renderViewResumeEye = (joined: boolean) => (
    <button
      type="button"
      onClick={handleViewResume}
      disabled={loadingResumeDetail}
      title="View Resume"
      aria-label="View Resume"
      className={`inline-flex items-center justify-center px-1.5 ${joined ? 'border-l border-blue-200' : 'py-1'} hover:bg-blue-100 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue/40 disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {loadingResumeDetail
        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
        : <Eye className="w-3.5 h-3.5" />}
    </button>
  );

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

  // Invite for assessment — opens the shared Invite to Assessment dialog
  // scoped to this JD, as Invite for AI interview below does: this candidate,
  // then the job's assessment versions as cards (the dialog says so when there
  // are none), with "Browse all assessments instead" for the rest. Same
  // selection rule as before: only published, non-revoked assessments are
  // invitable — loaded across every job, like the other Invite → Assessment
  // entry points, so "Browse all" really is all of them.
  /* Opens with this job's latest assessment version already ticked (the
     one tagged "Latest" — the only one when there is just one; after a
     create round trip, the one just published), so it is ready to send. */
  /* This candidate, as the Create / Send popup lists it. */
  const openInviteDialogFor = (kind: 'assessment' | 'interview') => {
    setShowInviteMenu(false);
    onOpenInviteDialog?.(kind, [{
      id: resume.resumeId || resume.id,
      name: resume.candidateName,
      email: resume.email,
      phone: resume.phone,
      resumeId: resume.resumeId,
    }]);
  };

  const handleInviteForAssessment = async () => {
    setShowInviteMenu(false);
    if (onOpenInviteDialog) { openInviteDialogFor('assessment'); return; }

    setPickedAssessments([]);
    setPickerAssessments([]);
    setShowAssessmentPicker(true);
    setLoadingPickerAssessments(true);
    try {
      const { assessmentService } = await import('@/lib/services/assessmentService');
      const { isAssessmentRevoked, getLocallyRevokedAssessmentIds } = await import('@/lib/utils/assessmentUtils');

      const resp = await assessmentService.list({ status: 'published', page_size: 100 });
      const revokedIds = getLocallyRevokedAssessmentIds();
      const items: any[] = (resp?.items || []).filter((a: any) => {
        const status = String(a?.status || '').toLowerCase();
        if (status !== 'published' && status !== 'active') return false;
        return !isAssessmentRevoked(a, revokedIds);
      });
      setPickerAssessments(items);
      if (jobId) {
        const { latestJobAssessment } = await import('@/components/assessments/JobAssessmentVersionPicker');
        const newest = latestJobAssessment(items, jobId);
        if (newest) setPickedAssessments([newest]);
      }
    } catch (err) {
      console.error('[CandidateScoringDetailPage] Failed to load assessments:', err);
      toast.error('Could not load assessments. Please try again.');
    } finally {
      setLoadingPickerAssessments(false);
    }
  };

  /* Send Invitations in the dialog: the picked assessments into the same
     Share Assessment modal as before — the first as primary, the rest as
     additional. */
  const handleConfirmAssessmentPick = () => {
    if (pickedAssessments.length === 0) {
      toast.error('Please select at least one assessment.');
      return;
    }
    setShareAssessments(pickedAssessments);
    setShowAssessmentPicker(false);
    setPickedAssessments([]);
    setShowShareAssessmentModal(true);
  };

  // Invite for AI interview — opens the shared Invite to AI Interview dialog
  // scoped to this JD: this candidate, then the job's active interview
  // versions to pick from (the dialog says so when there are none).
  const handleInviteForAIInterview = () => {
    setShowInviteMenu(false);
    if (onOpenInviteDialog) { openInviteDialogFor('interview'); return; }
    setShowAIInviteFlow(true);
  };

  /* "+ Create AI Assessment / AI Interview" - the landing page's round trip
     for this one candidate: CreateInviteTargetModal explains it, the create
     flow opens with this page as its way back (`?resume_invite=1`), and on
     return the job is re-checked and the invite opens for this candidate. */
  const [createInviteKind, setCreateInviteKind] = useState<InviteHandoffKind | null>(null);
  const inviteJobName = resume.jobCode || jdDetails?.job_id || 'This job';
  const startCreateInviteTarget = () => {
    const kind = createInviteKind;
    if (!kind) return;
    const returnUrl = withResumeInviteMarker(`${window.location.pathname}${window.location.search}`);
    saveInviteHandoff({
      kind,
      jdId: jobId,
      jdCode: resume.jobCode || jdDetails?.job_id,
      jdTitle: jobTitle,
      scoreIds: [resume.id],
      candidateCount: 1,
      view: 'job',
      origin: 'detail',
      candidateName: resume.candidateName,
      returnUrl,
    });
    setCreateInviteKind(null);
    router.push(buildCreateUrl(kind, { id: jobId, title: jobTitle }, returnUrl));
  };

  const handoffCheckedRef = useRef(false);
  useEffect(() => {
    if (handoffCheckedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has(RESUME_INVITE_PARAM)) return;
    const h = readInviteHandoff();
    if (!h || h.origin !== 'detail' || h.jdId !== jobId || !h.scoreIds.includes(resume.id)) return;
    handoffCheckedRef.current = true;
    // Drop the marker so a reload doesn't run this again.
    params.delete(RESUME_INVITE_PARAM);
    const q = params.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${q ? `?${q}` : ''}`);
    clearInviteHandoff();
    const what = h.kind === 'assessment' ? 'AI Assessment' : 'AI Interview';
    const jobName = h.jdCode || h.jdTitle;
    (async () => {
      let live = false;
      try {
        if (h.kind === 'assessment') {
          const { assessmentService } = await import('@/lib/services/assessmentService');
          live = ((await assessmentService.list({ jd_id: h.jdId, page_size: 100 }))?.items || []).some(isInvitableAssessment);
        } else {
          const { aiInterviewService } = await import('@/lib/services/aiInterviewService');
          live = !!(await aiInterviewService.findLiveConfigForJd(h.jdId));
        }
      } catch {
        live = false;
      }
      if (!live) {
        toast.info(`No ${what} was published for ${jobName} yet - create it from Invite when you are ready.`);
        return;
      }
      setPublishedOnReturn((p) => ({ ...p, [h.kind]: true }));
      inviteTargets.refresh();
      toast.success(`${what} is live for ${jobName} - now invite ${resume.candidateName || 'this candidate'}.`);
      if (h.kind === 'assessment') handleInviteForAssessment();
      else setShowAIInviteFlow(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, resume.id]);

  /* A job with none yet: the entry greyed with the reason under it, and
     "+ Create ..." below - the same pair as the landing page's Actions menu. */
  const renderCreateInviteItems = (kind: InviteHandoffKind) => {
    const what = kind === 'assessment' ? 'AI Assessment' : 'AI Interview';
    const Icon = kind === 'assessment' ? ClipboardList : Video;
    return (
      <>
        <button
          type="button"
          role="menuitem"
          disabled
          className="w-full flex items-start gap-3 px-3 py-2.5 text-left cursor-not-allowed"
        >
          <span className="mt-0.5 w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
            <Icon className="w-4 h-4 text-gray-400" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-gray-400">{kind === 'assessment' ? 'Assessment' : 'AI Interview'}</span>
            <span className="block text-xs text-gray-400">{inviteJobName} has no {what} yet</span>
          </span>
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setShowInviteMenu(false);
            setCreateInviteKind(kind);
          }}
          className="w-full flex items-center gap-2 pl-14 pr-3 py-2 text-left text-sm font-medium text-brand-blue hover:bg-brand-blue/5 transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4 flex-shrink-0" />
          Create {what}
        </button>
      </>
    );
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

  // Show loading state while waiting for complete data — mirrors the real
  // detail layout: the identity/score header card, the tab strip, and the
  // overview tab's stacked section cards, so the skeleton lines up with what
  // replaces it rather than being a generic block.
  if (!isDataReady) {
    return (
      <main className="flex-1 overflow-x-clip bg-slate-50 dark:bg-slate-950">
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="p-4 md:p-8 w-full min-h-[calc(100dvh-7rem)] bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 mb-4 md:mb-6">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-3" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-3" />
              <Skeleton className="h-3 w-28" />
            </div>

            {/* Header card — identity, contact badges, score display bar */}
            <div className="bg-white rounded-xl shadow-lg border-2 border-gray-200 p-4 sm:p-6">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="min-w-0 space-y-2">
                  <Skeleton className="h-7 w-56" />
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-5 w-20 rounded-md" />
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 mb-4 sm:mb-6">
                <Skeleton className="h-8 w-48 rounded-lg" />
                <Skeleton className="h-8 w-36 rounded-lg" />
                <Skeleton className="h-8 w-32 rounded-lg" />
                <div className="flex items-center gap-2 ml-auto">
                  <Skeleton className="h-8 w-20 rounded-lg" />
                  <Skeleton className="h-8 w-24 rounded-lg" />
                </div>
              </div>
              {/* Score display bar */}
              <div className="flex items-center justify-between gap-4 bg-gray-50 rounded-lg px-3 sm:px-4 py-2.5 sm:py-3 border border-gray-200">
                <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="h-6 w-28 rounded-md" />
                  <Skeleton className="h-4 w-48" />
                </div>
                <Skeleton className="h-4 w-24" />
              </div>
            </div>

            {/* Tab strip */}
            <div className="pt-4 sm:pt-6">
              <div className="bg-white rounded-t-xl border-x-2 border-t-2 border-gray-200 shadow-sm">
                <div className="flex gap-2 px-3 sm:px-6 pt-2 pb-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-24 rounded-t-lg" />
                  ))}
                </div>
              </div>

              {/* Overview tab section cards */}
              <div className="bg-white rounded-b-xl border-x-2 border-b-2 border-gray-200 p-4 sm:p-6 lg:p-8 space-y-6">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="bg-white border border-gray-200 rounded-xl p-6 space-y-3">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-3.5 w-full" />
                    <Skeleton className="h-3.5 w-5/6" />
                    <Skeleton className="h-3.5 w-4/6" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-x-clip bg-slate-50 dark:bg-slate-950">
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

      {createInviteKind && (
        <CreateInviteTargetModal
          kind={createInviteKind}
          jdCode={resume.jobCode || jdDetails?.job_id}
          jdTitle={jobTitle}
          candidateCount={1}
          onCancel={() => setCreateInviteKind(null)}
          onStart={startCreateInviteTarget}
        />
      )}

      {/* Header */}
      <div>
        {/* Entity hero card — neutral card chrome + leading icon disc, matching
            the Job Openings master header and the Job Details hero so the detail
            pages read as siblings (was a heavier border-2/shadow-lg card). */}
        <div className="bg-white rounded-xl border border-gray-300 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-4 sm:p-6">
          {/* Row 1: candidate identity. The record pager that used to sit on
              the right moved into the breadcrumb bar, as on job-details. */}
          <div className="flex items-start justify-between gap-4 mb-3">
            {/* pl-2.5 = the contact badges' own inset, so the name, the years
                and the email / phone icons below start on one vertical line. */}
            <div className="min-w-0 pl-2.5">
              <h1 className="text-lg sm:text-xl text-gray-900 font-semibold mb-2 truncate">{resume.candidateName}</h1>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <p className="text-base sm:text-lg text-gray-700 font-medium">{resume.title || resume.experience || 'Candidate'}</p>
                {resume.resumeVersion && (versionReadOnly || resumeVersions.length === 0 ? (
                  flatHeaderActions ? (
                    /* Flat: View Resume as a small eye joined to the version
                       badge — the resume it opens is that version. */
                    <span className="inline-flex items-stretch rounded-md text-xs sm:text-sm font-medium bg-blue-50 text-blue-700 border border-blue-200 overflow-hidden">
                      <span className="inline-flex items-center px-2 sm:px-2.5 py-0.5 sm:py-1">
                        Version {resume.resumeVersion}
                      </span>
                      {renderViewResumeEye(true)}
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md text-xs sm:text-sm font-medium bg-blue-50 text-blue-700 border border-blue-200">
                      Version {resume.resumeVersion}
                    </span>
                  )
                ) : (
                  /* Version dropdown — Job Details' JD version picker, for the
                     resume: a version scored for this job opens that score; one
                     never scored here opens its preview. */
                  <div className="relative" ref={versionMenuRef}>
                    <button
                      type="button"
                      onClick={() => setShowVersionMenu((v) => !v)}
                      className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md text-xs sm:text-sm font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors cursor-pointer"
                      aria-label={`Select resume version, currently Version ${resume.resumeVersion}`}
                      aria-haspopup="menu"
                      aria-expanded={showVersionMenu}
                    >
                      Version {resume.resumeVersion}
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showVersionMenu ? 'rotate-180' : ''}`} />
                    </button>

                    {showVersionMenu && (
                      <div
                        role="menu"
                        aria-label="Resume versions"
                        className="absolute left-0 top-full mt-2 w-64 max-w-[calc(100vw-1.5rem)] max-h-72 overflow-y-auto bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50"
                      >
                        {[...resumeVersions].sort(byNewestVersion).map((version, index) => {
                          const versionNumber = version.version || 1;
                          const isSelected = scoredResumeId ? version.id === scoredResumeId : versionNumber === resume.resumeVersion;
                          const score = scoreByResumeId[version.id];
                          const canOpenScore = !!score && !!onSelectScore;
                          return (
                            <button
                              key={version.id}
                              type="button"
                              role="menuitem"
                              disabled={isSelected}
                              onClick={() => {
                                setShowVersionMenu(false);
                                if (canOpenScore) onSelectScore!(score.scoreId, versionNumber);
                                else handleVersionPreview(version, versionNumber);
                              }}
                              title={canOpenScore ? `Open the score for Version ${versionNumber}` : `Preview Version ${versionNumber}`}
                              className={`w-full px-3 py-2 text-left transition-colors ${isSelected ? 'bg-brand-blue/5 cursor-default' : 'hover:bg-brand-blue/5 cursor-pointer'}`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-gray-900">Version {versionNumber}</span>
                                <div className="flex items-center gap-1">
                                  {isSelected ? (
                                    <span className="text-2xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">Selected</span>
                                  ) : null}
                                  {index === 0 ? (
                                    <span className="text-2xs px-1.5 py-0.5 rounded-full bg-success-subtle text-success">Latest</span>
                                  ) : null}
                                  {versionPreviewLoadingId === version.id && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
                                </div>
                              </div>
                              <div className="text-2xs text-gray-500 truncate">
                                {score
                                  ? `Scored${score.rating != null ? ` ${Number(score.rating).toFixed(1)}/10` : ''}${score.scoredAt ? ` • ${formatIST(score.scoredAt)}` : ''}`
                                  : 'Not scored for this job • Preview'}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
                {/* Flat, with no plain version badge to join: the same eye as
                    a badge of its own beside the version picker (or title). */}
                {flatHeaderActions && !(resume.resumeVersion && (versionReadOnly || resumeVersions.length === 0)) && (
                  <span className="inline-flex items-stretch rounded-md bg-blue-50 text-blue-700 border border-blue-200 overflow-hidden">
                    {renderViewResumeEye(false)}
                  </span>
                )}
              </div>
            </div>
            {/* Top right of the header: this candidate's other scored jobs, in
                the breadcrumb's "‹ 6 / 87 ›" pager style (arrows only, so it
                doesn't read as a second candidate Previous / Next). */}
            {jobPager && jobPager.total > 1 && (
              <RecordPager
                iconOnly
                prevLabel="Previous scored job"
                nextLabel="Next scored job"
                currentIndex={jobPager.page - 1}
                totalCount={jobPager.total}
                onPrev={jobPager.page > 1 ? () => jobPager.onPageChange(jobPager.page - 1) : undefined}
                onNext={jobPager.page < jobPager.total ? () => jobPager.onPageChange(jobPager.page + 1) : undefined}
              />
            )}
          </div>

          {/* Row 2: contact badges and actions share one line — badges left,
              actions right (Invite primary > View Resume > Download quiet). */}
          <div className="flex flex-wrap items-center gap-2 mb-4 sm:mb-6 text-sm text-gray-600">
            {/* Compact contact badges — the resume view's own chip
                (resume-view/[id]), not button-sized boxes. */}
            <span className={`${CONTACT_BADGE} min-w-0 max-w-full`}>
              <Mail className="w-3.5 h-3.5 text-brand-blue flex-shrink-0" />
              <span className={`truncate ${resume.email ? '' : 'text-gray-400'}`}>{resume.email || '-'}</span>
            </span>
            <span className={CONTACT_BADGE}>
              <Phone className="w-3.5 h-3.5 text-brand-blue flex-shrink-0" />
              <span className={`whitespace-nowrap ${resume.phone ? '' : 'text-gray-400'}`}>{resume.phone || '-'}</span>
            </span>
            {resume.location && (
              <span className={`${CONTACT_BADGE} min-w-0`}>
                <MapPin className="w-3.5 h-3.5 text-brand-blue flex-shrink-0" />
                <span className="truncate">{resume.location}</span>
              </span>
            )}

            {/* ml-auto keeps the actions right-aligned on one line, and simply
                wraps to the next line when the badges run out of room. */}
            <div className="flex flex-wrap items-center gap-2 ml-auto">
              {/* Share leads the group: sending the resume on is a step that
                  usually comes before inviting anyone to anything. */}
              {RESUME_EMAIL_SHARE_ENABLED && viewResumeId && (
                <button
                  type="button"
                  onClick={() => { if (!canShareResume) return; openShareModal(); }}
                  aria-disabled={!canShareResume}
                  title={canShareResume ? 'Share resume' : 'You do not have permission to share resumes'}
                  className={
                    !canShareResume
                      ? (flatHeaderActions ? CREATE_SEND_BUTTON_LOCKED_CLASS : HEADER_ACTION_BTN_LOCKED)
                      : (flatHeaderActions ? CANDIDATE_ACTION_BUTTON_CLASS : HEADER_ACTION_BTN)
                  }
                >
                  <Share2 className="w-4 h-4 flex-shrink-0" />
                  Share
                </button>
              )}

              {/* Always rendered rather than hidden when canInvite is false —
                  the trigger stays visible and non-clickable, with a tooltip
                  naming the reason, matching every other disabled action on
                  this page (Export, Download Scorecard, etc.) instead of the
                  button disappearing outright when nobody can use it.
                  Flat (`inlineHeaderActions`): the menu's two entries as their
                  own buttons, same handlers and gates, no Invite ▾. */}
              {flatHeaderActions ? (
                <>
                  <button
                    type="button"
                    onClick={() => { if (!mayInviteAssessment) return; handleInviteForAssessment(); }}
                    disabled={mayInviteAssessment && !canInviteAssessment}
                    aria-disabled={!mayInviteAssessment}
                    title={inviteBlockedReason(mayInviteAssessment, assessmentPlanLocked)}
                    className={mayInviteAssessment ? CREATE_SEND_BUTTON_CLASS.assessment : CREATE_SEND_BUTTON_LOCKED_CLASS}
                  >
                    <ClipboardList className="w-4 h-4 flex-shrink-0" />
                    Create / Send Assessment
                  </button>
                  <button
                    type="button"
                    onClick={() => { if (!mayInviteAIInterview) return; handleInviteForAIInterview(); }}
                    disabled={mayInviteAIInterview && !canInviteAIInterview}
                    aria-disabled={!mayInviteAIInterview}
                    title={inviteBlockedReason(mayInviteAIInterview, aiInterviewPlanLocked)}
                    className={mayInviteAIInterview ? CREATE_SEND_BUTTON_CLASS.interview : CREATE_SEND_BUTTON_LOCKED_CLASS}
                  >
                    <Video className="w-4 h-4 flex-shrink-0" />
                    Create / Send AI Interview
                  </button>
                </>
              ) : (
              <div className="relative" ref={inviteMenuRef}>
                <button
                  type="button"
                  onClick={() => canInvite && setShowInviteMenu(!showInviteMenu)}
                  disabled={inviteDisabled && canInvite}
                  aria-disabled={!canInvite}
                  title={
                    inviteDisabled
                      ? (!canInvite
                          ? 'You do not have permission to invite candidates'
                          : invitePlanLocked
                            ? PLAN_LOCKED_MESSAGE
                            : 'No published assessment or AI interview for this job yet')
                      : undefined
                  }
                  aria-haspopup="menu"
                  aria-expanded={showInviteMenu}
                  className={canInvite ? HEADER_ACTION_BTN : HEADER_ACTION_BTN_LOCKED}
                >
                  <UserPlus className="w-4 h-4 flex-shrink-0" />
                  Invite
                  <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${showInviteMenu ? 'rotate-180' : ''}`} />
                </button>

                {showInviteMenu && canInvite && (
                  <div
                    role="menu"
                    // Anchor left on mobile (the action row wraps and the button
                    // sits near the left edge, so right-0 pushed a 256px menu off
                    // the left of the viewport); keep the original right-0 from sm
                    // up, where the actions are right-aligned on one line.
                    className="absolute left-0 right-auto sm:left-auto sm:right-0 top-full mt-2 w-64 max-w-[calc(100vw-1.5rem)] bg-white rounded-xl border border-gray-200 shadow-lg shadow-gray-900/10 py-1.5 z-30"
                  >
                    {/* Each entry stays visible for anyone permitted to use
                        it and goes disabled when this JD has nothing to
                        invite to, so the next step is discoverable and the
                        tooltip can name what's blocking it. */}
                    {mayInviteAssessment && assessmentMissing && renderCreateInviteItems('assessment')}
                    {!assessmentMissing && (
                      <button
                        role="menuitem"
                        onClick={() => { if (!mayInviteAssessment) return; handleInviteForAssessment(); }}
                        disabled={mayInviteAssessment && !canInviteAssessment}
                        aria-disabled={!mayInviteAssessment}
                        title={!mayInviteAssessment ? 'You do not have permission to invite candidates to an assessment' : assessmentPlanLocked ? PLAN_LOCKED_MESSAGE : !canInviteAssessment ? 'No published assessment for this job yet' : undefined}
                        className={`w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent ${
                          mayInviteAssessment ? 'hover:bg-brand-blue/5' : 'opacity-60 cursor-not-allowed'
                        }`}
                      >
                        <span className="mt-0.5 w-8 h-8 rounded-lg bg-brand-blue/10 flex items-center justify-center flex-shrink-0">
                          <ClipboardList className="w-4 h-4 text-brand-blue" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-gray-900">{viaInviteDialog ? 'Create / Send Assessment' : 'Assessment'}</span>
                        </span>
                      </button>
                    )}
                    {mayInviteAIInterview && aiInterviewMissing && renderCreateInviteItems('interview')}
                    {!aiInterviewMissing && (
                      <button
                        role="menuitem"
                        onClick={() => { if (!mayInviteAIInterview) return; handleInviteForAIInterview(); }}
                        disabled={mayInviteAIInterview && !canInviteAIInterview}
                        aria-disabled={!mayInviteAIInterview}
                        title={!mayInviteAIInterview ? 'You do not have permission to invite candidates to an AI interview' : aiInterviewPlanLocked ? PLAN_LOCKED_MESSAGE : !canInviteAIInterview ? 'No published AI interview for this job yet' : undefined}
                        className={`w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent ${
                          mayInviteAIInterview ? 'hover:bg-brand-blue/5' : 'opacity-60 cursor-not-allowed'
                        }`}
                      >
                        <span className="mt-0.5 w-8 h-8 rounded-lg bg-brand-cyan/10 flex items-center justify-center flex-shrink-0">
                          <Video className="w-4 h-4 text-brand-cyan" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-gray-900">{viaInviteDialog ? 'Create / Send AI Interview' : 'AI Interview'}</span>
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>
              )}

              {/* Flat: View Resume is the eye on the resume version badge
                  (renderViewResumeEye), not a button here. */}
              {!flatHeaderActions && (
                <button
                  type="button"
                  onClick={handleViewResume}
                  disabled={loadingResumeDetail}
                  className={HEADER_ACTION_BTN}
                >
                  {loadingResumeDetail
                    ? <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin" />
                    : <Eye className="w-4 h-4 flex-shrink-0" />}
                  View Resume
                </button>
              )}

              <button
                type="button"
                onClick={() => { if (!canExport) return; handleDownloadScorecard(); }}
                aria-disabled={!canExport}
                title={canExport ? 'Download scorecard PDF' : 'You do not have permission to download the scorecard'}
                className={
                  !canExport
                    ? (flatHeaderActions ? CREATE_SEND_BUTTON_LOCKED_CLASS : HEADER_ACTION_BTN_LOCKED)
                    : (flatHeaderActions ? CANDIDATE_ACTION_BUTTON_CLASS : HEADER_ACTION_BTN)
                }
              >
                <Download className="w-4 h-4 flex-shrink-0" />
                {flatHeaderActions ? 'Scorecard' : (
                  <>
                    <span className="hidden lg:inline">Download Scorecard</span>
                    <span className="lg:hidden">Scorecard</span>
                  </>
                )}
              </button>
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
              {fullResumeData.ratingSummaryText ? (
                <Tooltip content={fullResumeData.ratingSummaryText} position="bottom">
                  <span className={`px-2 sm:px-3 py-1 rounded-md text-xs sm:text-sm font-medium border whitespace-nowrap cursor-help ${getMatchStatusColor(fullResumeData.matchStatus || resume.matchStatus)}`}>
                    {formatMatchStatus(fullResumeData.matchStatus || resume.matchStatus)}
                  </span>
                </Tooltip>
              ) : (
                <span className={`px-2 sm:px-3 py-1 rounded-md text-xs sm:text-sm font-medium border whitespace-nowrap ${getMatchStatusColor(fullResumeData.matchStatus || resume.matchStatus)}`}>
                  {formatMatchStatus(fullResumeData.matchStatus || resume.matchStatus)}
                </span>
              )}
              <span className="hidden sm:inline text-gray-400">|</span>
              {/* The title is the shortcut into the View JD tab — recruiters
                  reading a score reach for the JD from here constantly. */}
              {/* min-w-0 + wrapping (not truncate): the inline JD-code / title /
                  version badges are whitespace-nowrap and can't shrink, so a
                  nowrap+truncate parent overflowed the card on mobile instead of
                  clipping — let the group wrap to a second line below sm. */}
              <span className="text-xs sm:text-sm font-normal text-gray-700 min-w-0 break-words">
                <span className="font-bold text-gray-800">Job Title :</span>{' '}
                {/* Read as one: "EDG 267 High Court Judge v3.0" - the job's
                    ID, its title, its version, the ID and version in the JD
                    page header's own chips (`JobDetailView`). Both come from
                    the list row, else from the JD this page already loaded. */}
                {(resume.jobCode || jdDetails?.job_id) && (
                  <span className="inline-flex items-center px-2 py-0.5 mr-1.5 bg-brand-blue text-white rounded-md text-xs font-semibold font-mono tracking-wide align-middle whitespace-nowrap">
                    {resume.jobCode || jdDetails?.job_id}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleOpenJobDescription}
                  title={`View the job description for ${jobTitle}`}
                  className="font-medium text-brand-blue hover:text-brand-blue-2 hover:underline underline-offset-2 transition-colors duration-200 ease-in-out cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40"
                >
                  {jobTitle}
                </button>
                {(resume.jobVersion ?? jdDetails?.version_number) != null && (
                  <span className="inline-flex items-center px-2.5 py-0.5 ml-1.5 bg-brand-orange-deep text-white rounded-full text-xs font-medium align-middle whitespace-nowrap">
                    v{resume.jobVersion ?? jdDetails?.version_number}.0
                  </span>
                )}
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
          className="sticky z-20 bg-gray-50 rounded-t-xl border-x-2 border-t-2 border-gray-200"
        >
          {/* Folder tabs: the strip's bottom rule is an INSET shadow, which
              paints beneath the tabs, so the active tab's white face covers it
              and runs straight into the white panel below — the tab reads as
              part of the page it opens. A real border-bottom + -mb-px would be
              clipped here, since overflow-x-auto also clips the y axis. */}
          <div
            role="tablist"
            className="flex items-end gap-1 px-3 sm:px-6 pt-2 overflow-x-auto scrollbar-hide shadow-[inset_0_-1px_0_var(--color-gray-200)]"
          >
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'scoretable', label: 'Score Table' },
              { id: 'personalinfo', label: 'Personal Info' },
              { id: 'viewjd', label: 'View JD' },
            ].map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id as DetailTab)}
                // Both states carry the same borders (transparent when idle)
                // so switching tabs never shifts the row by a pixel.
                className={`px-3 sm:px-6 py-2.5 sm:py-3 text-xs sm:text-sm transition-colors rounded-t-lg whitespace-nowrap cursor-pointer border-x border-t-2 ${
                  activeTab === tab.id
                    ? 'font-semibold text-brand-blue bg-white border-x-gray-200 border-t-brand-blue'
                    : 'font-medium text-gray-600 border-transparent hover:text-gray-900 hover:bg-white/70'
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
                          <CheckCircle className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
                          <span>{strength}</span>
                        </li>
                      )) : (
                        <li className="flex items-start gap-3">
                          <AlertCircle className="w-5 h-5 text-warning mt-0.5 flex-shrink-0" />
                          <span>No specific strengths identified</span>
                        </li>
                      )}
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-700 mb-4 text-lg">Candidate Profile</h4>
                    <ul className="space-y-3 text-gray-600">
                      <li className="flex items-start gap-3">
                        <CheckCircle className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
                        <span><strong>Experience:</strong> {resume.experience || 'Not specified'}</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <CheckCircle className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
                        <span><strong>Skills:</strong> {matchedSkills.length} matched skills</span>
                      </li>
                      <li className="flex items-start gap-3">
                        {resume.currentCompany ? (
                          <CheckCircle className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-warning mt-0.5 flex-shrink-0" />
                        )}
                        <span><strong>Company:</strong> {resume.currentCompany || 'Not specified'}</span>
                      </li>
                      <li className="flex items-start gap-3">
                        {resume.education ? (
                          <CheckCircle className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-warning mt-0.5 flex-shrink-0" />
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
                  ? 'bg-success-subtle border-success-line'
                  : resume.scorePercentage >= 70
                  ? 'bg-gray-50 border-gray-300'
                  : resume.scorePercentage >= 60
                  ? 'bg-warning-subtle border-warning-line'
                  : 'bg-destructive-subtle border-destructive-line'
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
                <div className="bg-success-subtle border border-success-line rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <ThumbsUp className="w-5 h-5 text-success" />
                    <h3 className="text-lg font-semibold text-gray-900">Strengths</h3>
                  </div>
                  {keyStrengths.length > 0 ? (
                    <ul className="space-y-3">
                      {keyStrengths.map((strength: string, idx: number) => (
                        <li key={idx} className="flex items-start gap-3">
                          <CheckCircle className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
                          <span className="text-sm text-gray-800">{strength}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-500">No strengths data available.</p>
                  )}
                </div>

                {/* Weaknesses */}
                <div className="bg-destructive-subtle border border-destructive-line rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <ThumbsDown className="w-5 h-5 text-destructive" />
                    <h3 className="text-lg font-semibold text-gray-900">Weaknesses</h3>
                  </div>
                  {(improvementAreas.length > 0 || missingSkills.length > 0) ? (
                    <ul className="space-y-3">
                      {improvementAreas.map((gap: string, idx: number) => (
                        <li key={`gap-${idx}`} className="flex items-start gap-3">
                          <XCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
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
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-gray-600">
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

              {/* Skills — compact chips, the resume view's own (resume-view/[id]).
                  Blank entries are dropped, so a resume with only one category
                  (or no Soft Skills) shows just that group, never an empty
                  heading. General skills, then matched skills, stand in only
                  when neither category is present. */}
              {(() => {
                const clean = (list?: string[]) =>
                  (list || []).filter((s) => typeof s === 'string' && s.trim().length > 0);
                const technical = clean(fullResumeData.technicalSkills);
                const soft = clean(fullResumeData.softSkills);
                const general = technical.length || soft.length ? [] : clean(fullResumeData.skills);
                const fallback = technical.length || soft.length || general.length ? [] : clean(matchedSkills);
                const groups = [
                  { label: 'Technical Skills', items: technical },
                  { label: 'Soft Skills', items: soft },
                  { label: null, items: general.length ? general : fallback },
                ].filter((g) => g.items.length > 0);
                if (groups.length === 0) return null;
                return (
                  <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
                    <div className="flex items-center gap-2 mb-6">
                      <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                        <Code className="w-4 h-4 text-brand-blue" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Skills</h3>
                    </div>
                    <div className="space-y-5">
                      {groups.map((group) => (
                        <div key={group.label ?? 'skills'}>
                          {group.label && <h4 className="font-medium text-gray-900 mb-3">{group.label}</h4>}
                          <div className="flex flex-wrap gap-1.5">
                            {group.items.map((skill, index) => (
                              <span key={index} className={SKILL_BADGE}>{skill}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

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
                /* Mirrors the loaded JD layout below: header card (id/title/
                   status + meta chips), Job Description card, and the Skills &
                   Requirements card. */
                <>
                  <div className="bg-gray-50 border border-gray-300 rounded-xl p-4 sm:p-5">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <Skeleton className="h-5 w-16 rounded-md" />
                      <Skeleton className="h-6 w-52" />
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Skeleton className="h-5 w-24 rounded-md" />
                      <Skeleton className="h-5 w-20 rounded-md" />
                      <Skeleton className="h-5 w-28 rounded-md" />
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                  </div>

                  <div className="bg-gray-50 border border-gray-300 rounded-xl p-4 sm:p-6 space-y-3">
                    <Skeleton className="h-5 w-40" />
                    <div className="h-px bg-gray-200"></div>
                    <Skeleton className="h-3.5 w-full" />
                    <Skeleton className="h-3.5 w-11/12" />
                    <Skeleton className="h-3.5 w-5/6" />
                    <Skeleton className="h-3.5 w-3/4" />
                  </div>

                  <div className="bg-gray-50 border border-gray-300 rounded-xl p-4 sm:p-6">
                    <Skeleton className="h-5 w-48 mb-4" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                      {Array.from({ length: 2 }).map((_, col) => (
                        <div key={col} className="space-y-3">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3.5 w-40" />
                          <Skeleton className="h-3.5 w-36" />
                          <Skeleton className="h-3.5 w-44" />
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* JD header card — JD ID, title, status, and the meta row */}
                  <div className="bg-gray-50 border border-gray-300 rounded-xl p-4 sm:p-5">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      {jdDetails.job_id && (
                        <button
                          type="button"
                          onClick={() => setShowJdNavConfirm(true)}
                          className="inline-flex items-center px-2 py-0.5 bg-brand-blue text-white rounded-md text-xs font-semibold font-mono tracking-wide hover:bg-brand-blue-2 transition-colors cursor-pointer"
                        >
                          {jdDetails.job_id}
                        </button>
                      )}
                      <h3
                        onClick={() => setShowJdNavConfirm(true)}
                        className="text-base sm:text-lg font-semibold text-gray-900 hover:text-brand-blue transition-colors cursor-pointer"
                      >
                        {jdDetails.title || jobTitle}
                      </h3>
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
                        <span className="inline-flex items-center px-2.5 py-1 bg-success-subtle text-success rounded-md text-xs font-medium">
                          {jdSalary}{jdDetails.compensation_type ? ` / ${jdDetails.compensation_type}` : ''}
                        </span>
                      )}
                      <span className="text-gray-300">•</span>
                      <span>Posted {jdPostedDate ? formatIST(jdPostedDate) : 'N/A'}</span>
                      <span className="text-gray-300">•</span>
                      <span>By {jdDetails.created_by_name || 'System'}</span>
                      <span className="text-gray-300">•</span>
                      <span className="inline-flex items-center px-2.5 py-1 bg-brand-orange-deep text-white rounded-full text-xs font-medium">
                        {/* Job version (version_number), not current_version — the republish counter. */}
                        v{jdDetails.version_number && jdDetails.version_number > 0 ? jdDetails.version_number : 1}.0
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
                        <span className="text-xs text-success bg-success-subtle border border-success-line px-2 py-0.5 rounded">
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

                  {/* Extracted Data Summary - the JD wizard Review step's format,
                      shared with every surface that shows it. Open on arrival:
                      this tab always showed it, and it is where someone asks why
                      a candidate was graded as they were. */}
                  <ExtractedDataSummary
                    mustHaveSkills={jdMustHaveSkills}
                    niceToHaveSkills={jdNiceToHaveSkills}
                    mustHaveComments={jdMustHaveComments}
                    niceToHaveComments={jdNiceToHaveComments}
                    /* `jdExperienceLabel` falls back to the words "Not specified",
                       so the value (and its badge) is gated on the RANGE. */
                    experience={jdDetails?.experience_min != null || jdDetails?.experience_max != null ? jdExperienceLabel : null}
                    experienceNote={jdRequirementLabel(jdDetails.experience_mandatory)}
                    industry={jdDetails.industry_type ? prettifyCode(jdDetails.industry_type) : null}
                    industryNote={jdDetails.industry_type
                      ? criterionScoringLabel(jdDetails.industry_type, jdDetails.industry_mandatory, { isIndustry: true })
                      : undefined}
                    location={jdLocation || null}
                    locationNote={jdLocation ? criterionScoringLabel(jdLocation, jdDetails.location_mandatory) : undefined}
                    employmentType={employmentTypeLabel(jdDetails.employment_type)}
                    workMode={workModeLabel(jdDetails.remote_type)}
                    scoring={{
                      allowOverqualified: jdDetails.allow_overqualified,
                      jobHoppingEnabled: jdDetails.job_hopping_enabled,
                      overqualifiedNoNote: 'Experience above the maximum of the range fails Experience',
                    }}
                    aiExtracted={jdDetails.creation_method === 'ai_generated'}
                    defaultOpen
                  />
                </>
              )}
            </div>
          )}
        </div>
      </div>
          </>

          {/* Invite to Assessment — the shared dialog (the same one AI Talent
              Match, a resume's Invite and Resume Scoring's Invite open),
              scoped to this JD and prefilled with THIS candidate. */}
          <InviteToAssessmentFlow
            open={showAssessmentPicker}
            onClose={() => {
              setShowAssessmentPicker(false);
              setPickedAssessments([]);
            }}
            assessments={pickerAssessments}
            loading={loadingPickerAssessments}
            multiple
            selectedAssessments={pickedAssessments}
            onSelectedAssessmentsChange={setPickedAssessments}
            candidates={[{
              id: fullResumeData.resumeId || resume.resumeId || resume.id,
              name: fullResumeData.candidateName || resume.candidateName || 'Unknown',
              email: fullResumeData.email || resume.email || undefined,
            }]}
            resumes={[{
              id: fullResumeData.resumeId || resume.resumeId || resume.id,
              name: fullResumeData.candidateName || resume.candidateName || 'Unknown',
              email: fullResumeData.email || resume.email,
              phone: fullResumeData.phone || resume.phone,
            } as unknown as ResumeRecord]}
            onProceed={handleConfirmAssessmentPick}
            jobId={jobId || undefined}
          />

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
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={closeShareModal}
                      className="px-2"
                      aria-label="Close"
                    >
                      <X className="w-5 h-5 text-gray-500" />
                    </Button>
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
                        Recipient Email <span className="text-destructive">*</span>
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
                    <Button
                      variant="primary"
                      onClick={handleSendShareEmail}
                      disabled={isSendingEmail || !shareEmail.trim()}
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
                    </Button>
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
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleDownloadScorecard}
                      icon={<Download className="w-4 h-4" />}
                    >
                      <span className="hidden sm:inline">Download</span>
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={closeScorecardPreview}
                      className="px-2"
                      aria-label="Close"
                    >
                      <X className="w-5 h-5 text-gray-500" />
                    </Button>
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
              pages use, opened here without leaving the candidate page.
              Prefilled with THIS candidate, same as the row-level Invite in
              ScoredResumesTable — this page's own Invite button was opening
              both share modals with a blank candidate form; the recruiter had
              to retype the name and email of the very candidate they were
              already looking at. */}
          {showShareAssessmentModal && shareAssessments.length > 0 && (
            <ShareAssessmentModal
              isOpen={showShareAssessmentModal}
              onClose={() => {
                setShowShareAssessmentModal(false);
                setShareAssessments([]);
              }}
              prefilledCandidates={
                (fullResumeData.email || resume.email)
                  ? [{
                      id: fullResumeData.resumeId || resume.resumeId || resume.id,
                      name: fullResumeData.candidateName || resume.candidateName || 'Unknown',
                      email: fullResumeData.email || resume.email || '',
                      phone: fullResumeData.phone || resume.phone,
                      source: 'manual',
                      resumeId: fullResumeData.resumeId || resume.resumeId,
                    }]
                  : undefined
              }
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
                // The job's display ID (JD-133), never `jobId` — that is the
                // JD row's UUID, and the modal header printed it verbatim. The
                // assessment's own job first: "Browse all" can pick another job's.
                jd_short_id: shareAssessments[0].jd_short_id || resume.jobCode || jdDetails?.job_id,
                jd_title: shareAssessments[0].jd_title || jobTitle,
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
                jd_short_id: a.jd_short_id || resume.jobCode || jdDetails?.job_id,
                jd_title: a.jd_title || jobTitle,
                jd_version: a.jd_version,
              }))}
              // This page is the Resume Scoring candidate detail view (opened
              // from a scored resume), not the JD page — "JD" here was a
              // copy-paste artifact that mistagged every invite sent from
              // this page, which meant a backend check keyed on invite_source
              // would never see these invites as Resume-Scoring-originated.
              inviteSource="Resume Scoring"
            />
          )}

          {/* Invite to AI Interview — the shared dialog, scoped to this JD and
              prefilled with THIS candidate. */}
          <InviteToAIInterviewFlow
            open={showAIInviteFlow}
            onClose={() => setShowAIInviteFlow(false)}
            jobId={jobId || undefined}
            // The job's latest Active interview version, picked on open.
            preselectLatest
            candidates={[{
              id: fullResumeData.resumeId || resume.resumeId || resume.id,
              name: fullResumeData.candidateName || resume.candidateName || 'Unknown',
              email: fullResumeData.email || resume.email || undefined,
            }]}
            resumes={[{
              id: fullResumeData.resumeId || resume.resumeId || resume.id,
              name: fullResumeData.candidateName || resume.candidateName || 'Unknown',
              email: fullResumeData.email || resume.email,
              phone: fullResumeData.phone || resume.phone,
            } as unknown as ResumeRecord]}
            onInvited={() => setShowAIInviteFlow(false)}
          />

          {/* View JD tab: confirm before leaving the candidate scorecard for
              the standalone JD Details page. */}
          <ConfirmationDialog
            isOpen={showJdNavConfirm}
            title="Go to Job Description?"
            message={`This will take you away from this candidate's scorecard to the JD page for "${jdDetails?.title || jobTitle}".`}
            type="info"
            confirmText="Yes, go to JD"
            cancelText="Cancel"
            onCancel={() => setShowJdNavConfirm(false)}
            onConfirm={() => {
              setShowJdNavConfirm(false);
              router.push(`/recruitment/job-details?id=${jobId}`);
            }}
          />

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
                tone = 'text-destructive-strong';
                marker = 'bg-destructive-subtle border-l-4 border-destructive-line pl-2';
              } else if (line.type === 'added' && side === 'right') {
                tone = 'text-success-strong';
                marker = 'bg-success-subtle border-l-4 border-success-line pl-2';
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
                        <span className="flex items-center gap-1.5 px-2.5 py-1 bg-success-subtle border border-success-line rounded-full text-success">
                          <span className="w-2 h-2 bg-success rounded-full"></span>
                          +{diff.addedCount}
                        </span>
                        <span className="flex items-center gap-1.5 px-2.5 py-1 bg-destructive-subtle border border-destructive-line rounded-full text-destructive">
                          <span className="w-2 h-2 bg-destructive rounded-full"></span>
                          −{diff.removedCount}
                        </span>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={closeCompare}
                        className="px-2"
                        aria-label="Close"
                      >
                        <X className="w-5 h-5 text-gray-500" />
                      </Button>
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
                        <CheckCircle className="w-12 h-12 mx-auto mb-3 text-success" />
                        <p className="font-medium">No changes detected</p>
                        <p className="text-sm mt-1">Content is identical between these versions.</p>
                      </div>
                    ) : compareViewMode === 'side-by-side' ? (
                      <div className="flex h-full gap-0">
                        {/* Older */}
                        <div className="flex-1 flex flex-col border-r border-gray-300 min-w-0">
                          <div className="px-4 py-2.5 bg-destructive-subtle border-b border-gray-200 flex-shrink-0">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 bg-destructive rounded-full"></span>
                              <span className="text-sm font-semibold text-destructive-strong">Version {older.version}</span>
                              <span className="text-xs text-destructive ml-1">(older)</span>
                            </div>
                            <p className="text-xs text-destructive mt-0.5 truncate">{older.fileName}</p>
                          </div>
                          <div className="flex-1 overflow-y-auto p-4">
                            <div className="bg-white rounded-lg border border-gray-200 p-5">
                              {sidePairs.map((pair, idx) => renderLine(pair.left, idx, 'left'))}
                            </div>
                          </div>
                        </div>
                        {/* Newer */}
                        <div className="flex-1 flex flex-col min-w-0">
                          <div className="px-4 py-2.5 bg-success-subtle border-b border-gray-200 flex-shrink-0">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 bg-success rounded-full"></span>
                              <span className="text-sm font-semibold text-success-strong">Version {newer.version}</span>
                              <span className="text-xs text-success ml-1">(newer)</span>
                            </div>
                            <p className="text-xs text-success mt-0.5 truncate">{newer.fileName}</p>
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
                              ? 'bg-success-subtle border-l-4 border-success-line pl-3'
                              : line.type === 'removed'
                                ? 'bg-destructive-subtle border-l-4 border-destructive-line pl-3 line-through opacity-70'
                                : '';
                            const tone = line.type === 'added'
                              ? 'text-success-strong'
                              : line.type === 'removed'
                                ? 'text-destructive'
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
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleVersionDownload(
                          { id: versionPreview.id, fileName: versionPreview.fileName },
                          versionPreview.versionNumber,
                        )}
                        icon={<Download className="w-4 h-4" />}
                      >
                        <span className="hidden sm:inline">Download</span>
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setVersionPreview(null)}
                        className="px-2"
                        aria-label="Close"
                      >
                        <X className="w-5 h-5 text-gray-500" />
                      </Button>
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
