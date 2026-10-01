import { SCORE_CELL_TEXT } from '@/lib/utils/score';
import { Mail, Phone, Calendar, Search, SlidersHorizontal, Download, FileDown, CheckSquare, Square, Filter, X, UserPlus, Eye, AlertCircle, Loader2, Send, ShieldAlert, Info, ClipboardList, Share2, Paperclip, FileText, FileSpreadsheet, MoreVertical, Award, ChevronDown, ChevronRight, Video, BarChart3 } from 'lucide-react';
import { matchBadgeClass, MATCH_SCORE_TEXT_CLASS, normalizeMatchResult, formatOverallScore, formatOverallScoreValue } from '@/lib/utils/matchStatus';
import { truncateJobTitle } from '@/lib/utils/jobOpeningDisplay';
import { useState, useEffect, useMemo, Fragment } from 'react';
import { toast } from 'sonner';
import ColumnCustomizationModal from './ColumnCustomizationModal';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import ListToolbar from '@/components/ui/list-toolbar';
import ListCountBadge from '@/components/ui/list-count-badge';
import ListEmptyState from '@/components/ui/list-empty-state';
import ListViewToggle, { ListDisplayMode } from '@/components/ui/list-view-toggle';
import GridCardSelect, { gridCardSelectedClass } from '@/components/ui/grid-card-select';
import { useListSearch } from '@/lib/hooks/useListSearch';
import InviteShareModal from './InviteShareModal';
import InviteToAIInterviewFlow from './InviteToAIInterviewFlow';
import type { Resume } from '@/lib/types/types';
import { isAssessmentRevoked, getLocallyRevokedAssessmentIds, parseAssessmentTitle } from '@/lib/utils/assessmentUtils';
import { MENU_ITEM_SCALE_CLASS } from '@/lib/constants/menuAnimation';
import { scoringService } from '@/lib/services/scoringService';
import { assessmentService } from '@/lib/services/assessmentService';
import { resumeService } from '@/lib/services/resumeService';
import ResumeTextPreviewModal from './ResumeTextPreviewModal';
import ScoreTableModal from './ScoreTableModal';
import ListPagination from './ListPagination';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import SearchableSelect from '@/components/ui/searchable-select';
import { useAuth } from '@/components/providers/AuthProvider';
import { usePlanFeatures } from '@/lib/hooks/usePlanFeature';
import { useAllJobInviteTargets } from '@/lib/hooks/useAllJobInviteTargets';
import { formatIST, formatISTDate, formatISTTime, parseIST } from '@/lib/utils/dateUtils';
import { splitPhoneNumbers } from '@/lib/utils/phoneUtils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/* Action menu item styling — cloned from the Job Openings page's three-dot
   menu (JobsListing.tsx: gray-700 text, hover:bg-gray-50, px-4/py-2.5 rows,
   sharp corners, a scale-on-hover label) so both menus read as one component
   even though this table's overflow-x-auto shell needs Radix's portal rather
   than that page's hand-rolled absolute dropdown. The `!` overrides beat the
   dropdown-menu primitive's own default item styling (accent bg, rounded-sm,
   muted-foreground icons). */
// !outline-none: globals.css's `[tabindex]:focus-visible:not([tabindex="-1"])`
// rule outranks the item's own plain `outline-hidden` on specificity, so when
// Radix moves native focus onto the highlighted item (mouse hover included,
// not just keyboard) that global rule painted a visible ring around it. The
// `data-[highlighted]` background above is this item's own focus indicator;
// !important is what it takes to actually beat that global selector.
const scoredResumesMenuItemClass = 'group !rounded-none !px-4 !py-2.5 text-sm text-gray-700';
const COLUMN_PREFERENCES_KEY = 'scoredResumesTableColumns';

// The global "View All Candidates" host defaults this table's `jobId` prop to
// a placeholder ('jd-1'), not a real backend id - guard the export-audit call
// (which sends it as an optional jd_id) so that placeholder never reaches the
// API as an invalid UUID.
const isUuid = (value?: string): value is string =>
  !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/* ---- The More Filters panel's field metrics ---------------------------------
   One width and one control style for every field in that panel, so "all the
   same size" is guaranteed by construction rather than by seven copies of a
   class string happening to agree — which is what let them drift in the first
   place.

   180px is sized to the WIDEST thing any of these controls must actually
   display: a native date input's `dd/mm/yyyy` plus its picker glyph. Every
   other field needs less, and none of them needs the third-of-a-panel the old
   stretching grid handed out. Full width below `sm`, where one field per row is
   the only thing that fits. */
const FILTER_FIELD_CLASS = 'w-full sm:w-auto sm:grow sm:basis-[170px] sm:max-w-[280px]';

/* Score Range holds TWO controls in one field, so it asks for more room up
   front and takes a bigger share of whatever its row has spare — at the shared
   basis each input gets ~80px and reads cramped beside its neighbours. */
const FILTER_FIELD_WIDE_CLASS = 'w-full sm:w-auto sm:grow-[1.5] sm:basis-[240px] sm:max-w-[380px]';
const FILTER_LABEL_CLASS = 'block text-sm text-gray-700 mb-1 truncate';
const FILTER_CONTROL_CLASS =
  'w-full px-3 py-2 text-sm text-gray-900 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white';

const DEFAULT_COLUMNS = [
  { id: 'candidateName', label: 'Candidate Name', enabled: true },
  { id: 'email', label: 'Email', enabled: true },
  { id: 'scorePercentage', label: 'Score out of 10', enabled: true },
  { id: 'matchStatus', label: 'Match Status', enabled: true },
  // The Invite menu — a column like the rest so it sits in this order rather
  // than trailing after every customizable one. Never exported (EXPORT_EXCLUDED).
  { id: 'invitation', label: 'Invitation', enabled: true },
  { id: 'jdId', label: 'JD ID', enabled: true },
  { id: 'jobTitle', label: 'Job Title', enabled: true }, // Always show job title
  { id: 'jobVersion', label: 'Job Version', enabled: true },
  { id: 'phone', label: 'Phone', enabled: true },
  { id: 'experience', label: 'Experience', enabled: true },  // Enable by default
  { id: 'education', label: 'Education', enabled: false },
  { id: 'certifications', label: 'Certifications', enabled: false },
  { id: 'scoredDate', label: 'Scored By / Date', enabled: true },
  { id: 'version', label: 'Resume Version', enabled: true },
];

/* Columns that are controls, not data — shown in the table, left out of CSV/XLS. */
const EXPORT_EXCLUDED_COLUMNS = new Set(['invitation']);

export interface ScoredResume {
  id: string;
  resumeId?: string;  // Actual resume ID (different from score ID)
  candidateName: string;
  email: string;
  phone: string;
  matchStatus: string;
  scorePercentage: number;
  // Resume Match Rating Mechanism (client doc, Sept 2026): the 0-10 Overall
  // Rating shown instead of scorePercentage wherever the score is printed as
  // plain text - see formatOverallScore() in lib/utils/matchStatus.ts.
  overallRating10?: number;
  scoredDate: string;
  scoredBy: string;
  experience?: string;
  // Education can arrive as a label ("Bachelor's"), a structured array from the
  // candidate-detail endpoint, or be absent. The cell renderer below handles
  // each shape; the union here keeps narrowing precise instead of collapsing.
  education?: string | Array<{ degree?: string; institution?: string }>;
  // Certifications: simple string list or structured objects with a name field.
  certifications?: Array<string | { name?: string }>;
  // Version info
  version?: number;
  resumeVersion?: number;
  // The JD's own version at scoring time (distinct from the resume's own
  // version above) — only meaningful in the cross-job "All Candidates" list,
  // where the same job title can repeat once per JD version.
  jobVersion?: number;
  // Source and status fields
  source?: 'my-resumes' | 'database' | string;
  status?: 'completed' | 'failed' | 'processing' | 'queued' | string;
  errorReason?: string;
  // Real scoring data from API
  aiSummary?: string;
  strengths?: string[];
  gaps?: string[];
  // Skill lists carried through from the resume converters (technical_skills ->
  // technicalSkills etc.). JobDetailView's onViewCandidate reads them as a fallback
  // chain (matchedSkills || technicalSkills || skills); all optional because which
  // ones are present depends on the endpoint the row came from.
  matchedSkills?: string[];
  missingSkills?: string[];
  technicalSkills?: string[];
  skills?: string[];
  matchReason?: string;
  scoreBreakdown?: {
    skillsMatch: number;
    experienceMatch: number;
    educationMatch: number;
    overallFit: number;
  };
  title?: string;
  currentCompany?: string;
  location?: string;
  // For global view
  jobTitle?: string;
  jdId?: string;
  /** The readable job code (e.g. "JD-151") this row's score belongs to —
   *  only set in the global "View by Candidates" view, where rows span
   *  different jobs. In a single-job view every row shares the host's own
   *  `jobId` prop instead, so this stays unset there. */
  jobCode?: string;
}

interface ScoredResumesTableProps {
  resumes: ScoredResume[];
  jobTitle: string;
  jobId?: string;
  /** The readable job code (e.g. "JD-151") for this single-job host, used to
   *  prefix downloaded scorecard filenames. Left unset by the global "View
   *  All Candidates" host, which instead relies on each row's own `jobCode`
   *  since rows there span different jobs. */
  jobCode?: string;
  availableUnits?: number;
  initialMatchStatus?: 'all' | 'Exact Match' | 'Partial Match' | 'No Match';
  /**
   * Drop the Match Status field from More Filters.
   *
   * Set by a host whose LIST is already one verdict — the Exact Match, Partial
   * Match and No Match sections, which hand down rows the parent has already
   * narrowed. A status filter there is at best a no-op and at worst a
   * contradiction: picking "No Match" inside the Exact Match section empties
   * the table and reads as a bug.
   *
   * It hides the control AND stops the filter applying, rather than just
   * hiding it. A value set on an earlier, unscoped view would otherwise stay
   * live behind a control that is no longer on screen to undo it — and would
   * still be counted on the Filters badge.
   */
  hideMatchStatusFilter?: boolean;
  /**
   * Preselects the date-range filter to one day (YYYY-MM-DD) — the host's way
   * of opening this table already narrowed to one scoring session, e.g. from
   * a Scoring History row. Same sync-on-change pattern as `initialMatchStatus`
   * below.
   */
  initialScoredDate?: string;
  onViewCandidate?: (resume: ScoredResume) => void;
  selectedResumes?: string[];
  onSelectResume?: (resumeId: string) => void;
  onSelectAll?: (resumeIds: string[]) => void;
  isGlobalView?: boolean; // Show job title column in global view
  /**
   * The heading above the search box. Defaults to "Scored Resumes".
   *
   * The Resume Scoring page shows six different lists through this one table —
   * per-job, per-candidate, all events, and one per match verdict — and a fixed
   * heading named none of them, so the card looked identical whichever pill was
   * selected. The host passes the selected section's name instead.
   */
  title?: string;
  /**
   * Cluster rows by candidate email (one visual group per person) rather
   * than the flat, mixed-candidate order the rows arrive in. Meaningful only
   * when there's more than one row per person to begin with — i.e. a
   * cross-job list — so it defaults off and a host opts in explicitly (the
   * Resume Scoring "View by Candidates" card does; its sibling "Total
   * Resumes Scored" card deliberately doesn't, showing the identical rows
   * as a flat per-scoring-event list instead).
   */
  groupByEmail?: boolean;
  /**
   * Opens the caller's "Select Applicants to Score" flow. Optional so the
   * button only appears where a host has somewhere to send it — JobDetailView
   * owns SelectSourceModal; ResumeScoringPage has its own scoring entry points.
   */
  onScoreResumes?: () => void;
  /**
   * Score Resumes CTA shown inside the empty state's illustration card, for
   * when this table's own list is empty from the start (not narrowed by a
   * search/filter) — separate from `onScoreResumes` (the persistent header
   * button) so a host wanting the CTA only in the "no resumes scored yet"
   * moment doesn't also get a redundant button in the header once resumes
   * exist.
   */
  onScoreResumesFromEmptyState?: () => void;
  /** When true, the empty-state "Score Resumes" button stays visible but
   *  renders disabled — the host lacks the scoring permission but the
   *  handler above is still provided (guarded internally) so the button
   *  is never removed from the DOM. */
  scoreResumesDisabled?: boolean;
  /**
   * Opens the host's "Send AI Interview via Email" flow for one candidate —
   * the AI Interview entry in each row's Invite menu. Omitted where the host
   * has no AI interview to invite to (or the viewer can't share one), and the
   * menu then offers Assessment alone.
   */
  onInviteAIInterview?: (candidate: { name: string; email: string; resumeId?: string }) => void;
  /**
   * Opt-in for a host that has NO per-job AI Interview plumbing of its own
   * (the cross-job Resume Scoring lists, where every row can belong to a
   * different job) — this component then resolves and shares the invite
   * itself per row, using that row's own `jdId`. Ignored when
   * `onInviteAIInterview` is supplied; a host that sometimes omits
   * `onInviteAIInterview` for its OWN reasons (e.g. JobDetailView hiding it
   * for a disabled job) must NOT also set this, or that per-case gate would
   * be bypassed by this fallback silently resolving anyway.
   */
  enableInternalAIInterviewInvite?: boolean;
  /**
   * Whether the host JD actually has a published assessment / a live AI
   * interview to invite candidates to. A row's Invite menu only offers what
   * exists: with neither, the whole Invite button is disabled rather than
   * opening a menu whose every entry dead-ends in "create one first".
   *
   * `undefined` means the host doesn't track this (the Resume Scoring global
   * view spans many JDs), and the entry keeps its permission-only gate.
   */
  assessmentConfigured?: boolean;
  aiInterviewConfigured?: boolean;
  /**
   * The host's "Show:" view pills (View by Job / View by Candidates / All
   * Resumes / verdict filters). Rendered between the search/filter bar and
   * the Select All row so the two read as one control stack, rather than
   * floating above the whole card. Omitted by hosts that don't have a pill
   * row of their own (e.g. a single-job view).
   */
  viewPillsSlot?: React.ReactNode;
}

export default function ScoredResumesTable({
  resumes,
  jobTitle,
  jobId = 'jd-1',
  jobCode,
  availableUnits = 10,
  initialMatchStatus = 'all',
  hideMatchStatusFilter = false,
  initialScoredDate = '',
  onViewCandidate,
  selectedResumes: externalSelectedResumes = [],
  onSelectResume,
  onSelectAll,
  isGlobalView = false,
  title = 'Scored Resumes',
  groupByEmail = false,
  onScoreResumes,
  onScoreResumesFromEmptyState,
  scoreResumesDisabled,
  onInviteAIInterview,
  enableInternalAIInterviewInvite = false,
  assessmentConfigured,
  aiInterviewConfigured,
  viewPillsSlot
}: ScoredResumesTableProps) {
  const { isTenantAdmin, user, hasPermissionCode, hasPermission, tenant } = useAuth();  // Get tenant info from auth context
  const { hasPlanFeature } = usePlanFeatures();

  // Tenant-level feature toggle, independent of the subscription-plan check
  // above — mirrors JobDetailView's own isFeatureEnabled(), the same gate
  // every other Assessment/AI Interview entry point in the app already reads.
  // Assumes enabled when the tenant carries no flags at all, same default.
  const isFeatureEnabled = (feature: string): boolean => {
    if (!tenant?.features) return true;
    return (tenant.features as any)[feature] === true;
  };

  // Gates "Invite [to Assessment]" from a scored resume — the Resume Scoring
  // module's own `scoring:invite` toggle, not the Assessments module's
  // canCreateAssessments (creating a brand-new assessment is a different
  // action). Previously this checked canCreateAssessments, so disabling
  // Resume Scoring's "Invite" permission had no effect on this button.
  const canCreateAssessments =
    (isTenantAdmin || hasPermissionCode('scoring:invite')) &&
    hasPlanFeature('assessment') &&
    isFeatureEnabled('assessment');
  // Whether the viewer may invite to AI Interview AT ALL (permission + plan +
  // tenant feature), AND there is some way to actually carry it out — either
  // the host's own handler, or its explicit opt-in into this component's
  // internal resolve-and-share flow. Without either, the host simply doesn't
  // support AI Interview invites from this table (or is deliberately hiding
  // it for a reason of its own, e.g. a disabled job) — never assumed as a
  // fallback, since that could silently bypass a host-specific gate.
  //
  // Also requires the same Resume Scoring `scoring:invite` toggle as the
  // Assessment path above: this button lives on the Resume Scoring surface,
  // so disabling that module's "Invite" permission should turn off BOTH
  // invite targets reachable from it, not just the Assessment one — a
  // recruiter without scoring:invite has no invite action here at all.
  // canInviteAIInterviews (ai_interview:invite) stays required alongside it,
  // since that is the permission the AI Interview invite endpoints actually
  // enforce server-side.
  const mayInviteAIInterview =
    (!!onInviteAIInterview || enableInternalAIInterviewInvite) &&
    (isTenantAdmin || hasPermissionCode('scoring:invite')) &&
    hasPermission('canInviteAIInterviews') &&
    hasPlanFeature('ai_interview') &&
    isFeatureEnabled('ai_interview');

  // Only the cross-job global list needs this — a single-job host (JobDetailView,
  // or this page's own per-job "Scoring History" list) already knows its one
  // answer via the assessmentConfigured/aiInterviewConfigured props above,
  // computed once for the whole table by useJobInviteTargets.
  const needsBulkInviteTargets =
    enableInternalAIInterviewInvite && assessmentConfigured === undefined && aiInterviewConfigured === undefined;
  const bulkInviteTargets = useAllJobInviteTargets(needsBulkInviteTargets);

  /* Per-row invite availability. A row that carries its own `jdId` (the
     cross-job global list) is answered from the bulk map above, keyed by
     THAT row's job — never the table-level assessmentConfigured/
     aiInterviewConfigured, which for that list is `undefined` (spans many
     jobs, nothing to hand down). A row without its own `jdId` (every
     single-job table) falls back to the table-level flag, unchanged.
     `undefined` either way keeps meaning "unknown, don't gate". */
  const resolveAssessmentConfigured = (resume: ScoredResume): boolean | undefined =>
    resume.jdId && needsBulkInviteTargets ? bulkInviteTargets.hasAssessment(resume.jdId) : assessmentConfigured;
  const resolveAIInterviewConfigured = (resume: ScoredResume): boolean | undefined =>
    resume.jdId && needsBulkInviteTargets ? bulkInviteTargets.hasAIInterview(resume.jdId) : aiInterviewConfigured;

  /* Invite gating. An entry is offered when the viewer may use it AND the JD
     has something to invite to; `undefined` from the host means unknown, which
     is treated as "don't gate" so the global scoring view is unchanged.
     With neither entry available the trigger itself goes disabled — matching
     the Assessment / AI Interview sections' own Send Invite buttons on the Job
     Details page, which read the same two flags.

     AI Interview specifically: when the host supplies its own
     `onInviteAIInterview` (e.g. JobDetailView, resolving against its one
     fixed job), that handler runs as before. When it doesn't — the cross-job
     global list, where every row belongs to a different job — this
     component resolves and shares the invite itself per row (see
     `aiInterviewInviteCandidate` below), the same "resolve on click, then
     explain why not" pattern already used for Assessment via
     InviteShareModal, just extended to AI Interview. Either way the option
     is only ever offered when `mayInviteAIInterview` is true.

     `canInviteAssessment`/`canInviteAIInterview`/`inviteDisabled` below stay
     table-wide — used only by the bulk-selection invite flow further down,
     which acts on the table's own job, not a specific row. The per-row
     dropdown in renderInviteCell computes its own row-scoped versions from
     resolveAssessmentConfigured/resolveAIInterviewConfigured above instead. */
  const canInviteAssessment = canCreateAssessments && assessmentConfigured !== false;
  const canInviteAIInterview = mayInviteAIInterview && aiInterviewConfigured !== false;
  const inviteDisabled = !canInviteAssessment && !canInviteAIInterview;
  const inviteDisabledTitle =
    canCreateAssessments || mayInviteAIInterview
      ? 'No published assessment or AI interview for this job yet'
      : undefined;
  // Resume Scoring's own Export / Download Scorecard toggles — previously both
  // checked the generic, module-agnostic canExport flag (which defaults true
  // for most roles), so disabling either one here had no effect.
  const canExport = isTenantAdmin || hasPermissionCode('scoring:export');
  const canDownloadScorecard = isTenantAdmin || hasPermissionCode('scoring:download');
  const canShareResume = isTenantAdmin || hasPermissionCode('my_resumes:share');

  /* Share Resume — the dialog the resume table and the resume page open, so a
     scored candidate is shared exactly as one from any other list. A scored row
     carries the score id, so the resume id (and the file behind it) comes from
     `resumeId`; rows without one can't be shared. */
  const [shareCandidate, setShareCandidate] = useState<ScoredResume | null>(null);
  const [shareEmail, setShareEmail] = useState('');
  const [shareSubject, setShareSubject] = useState('');
  const [shareMessage, setShareMessage] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  /* The scored row knows nothing about the file itself, so the attachment's
     name, type and size are read from the resume record when the dialog opens. */
  const [shareFile, setShareFile] = useState<{ name: string; type: string; sizeKb?: number } | null>(null);
  const [isSharePreviewOpen, setIsSharePreviewOpen] = useState(false);
  /* "View Resume" in the Actions menu — the same read-in-place preview the
     Share dialog's attachment eye opens, but reachable directly without
     going through Share. Independent of shareCandidate/isSharePreviewOpen so
     the two entry points never fight over one piece of state. */
  const [viewResumeCandidate, setViewResumeCandidate] = useState<ScoredResume | null>(null);
  /* "View Score Table" from the Actions menu — opens the same table
     CandidateScoringDetailPage's Score Table tab shows, in a popup rather
     than navigating away. */
  const [scoreTableCandidate, setScoreTableCandidate] = useState<ScoredResume | null>(null);
  /* Scorecard side of the same dialog — the resume and the scorecard are the
     two files this page can send, so the eye beside each opens that one. */
  const [scorecardPreviewUrl, setScorecardPreviewUrl] = useState<string | null>(null);
  const [loadingScorecardPreview, setLoadingScorecardPreview] = useState(false);

  const openShareModal = async (resume: ScoredResume) => {
    const resumeId = resume.resumeId;
    if (!resumeId) {
      toast.error('This score has no resume attached to share');
      return;
    }

    const resumeLink =
      typeof window !== 'undefined' ? `${window.location.origin}/recruitment/resume-view/${resumeId}` : '';

    setShareCandidate(resume);
    setShareEmail('');
    setShareFile(null);
    setIsSharePreviewOpen(false);
    setShareSubject(`Resume: ${resume.candidateName} - ${resume.title || 'Candidate'}`);
    setShareMessage(`Hi,

I'm sharing the resume of ${resume.candidateName} for your review.

Candidate Details:
- Name: ${resume.candidateName}
- Title: ${resume.title || 'N/A'}
- Experience: ${resume.experience || 'N/A'}
- Location: ${resume.location || 'N/A'}
- Match: ${resume.matchStatus || 'N/A'}${resume.scorePercentage != null ? ` (${formatOverallScore(resume.overallRating10, resume.scorePercentage)})` : ''}

You can view the full resume at: ${resumeLink}

Best regards`);

    try {
      const detail: any = await resumeService.get(resumeId);
      setShareFile({
        name: detail?.file_name || `${resume.candidateName}.pdf`,
        type: (detail?.file_type || detail?.file_name?.split('.').pop() || 'pdf').toUpperCase(),
        sizeKb: detail?.file_size_kb,
      });
    } catch {
      // The dialog still works without the file's details.
      setShareFile({ name: `${resume.candidateName}.pdf`, type: 'PDF' });
    }
  };

  const closeShareModal = () => {
    setShareCandidate(null);
    setShareEmail('');
    setShareSubject('');
    setShareMessage('');
    setShareFile(null);
    setIsSharePreviewOpen(false);
    closeScorecardPreview();
  };

  /* Read the scorecard without leaving the dialog — the eye beside the resume
     does the same for the resume, so both attachments open in place. */
  const handlePreviewScorecard = async () => {
    if (!shareCandidate || loadingScorecardPreview) return;
    setLoadingScorecardPreview(true);
    try {
      const rawBlob = await scoringService.downloadScorecard(shareCandidate.id);
      const blob = new Blob([rawBlob], { type: 'application/pdf' });
      setScorecardPreviewUrl(window.URL.createObjectURL(blob));
    } catch (error) {
      console.error('Error previewing scorecard:', error);
      toast.error('Failed to open the scorecard. Please try again.');
    } finally {
      setLoadingScorecardPreview(false);
    }
  };

  const closeScorecardPreview = () => {
    setScorecardPreviewUrl((prev) => {
      if (prev) window.URL.revokeObjectURL(prev);
      return null;
    });
  };

  const handleSendShareEmail = async () => {
    const resumeId = shareCandidate?.resumeId;
    if (!resumeId) return;

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
      const result = await resumeService.share(resumeId, shareEmail.trim(), shareMessage);
      if (result.success) {
        toast.success('Resume shared successfully');
        closeShareModal();
      } else {
        toast.error(result.message || 'Failed to send email');
      }
    } catch (error: any) {
      console.error('Failed to share resume:', error);
      toast.error(error?.message || 'Failed to send email');
    } finally {
      setIsSendingEmail(false);
    }
  };
  const [showColumnModal, setShowColumnModal] = useState(false);
  const [internalSelectedResumes, setInternalSelectedResumes] = useState<string[]>([]);

  // Use external selection if provided, otherwise use internal
  const selectedResumes = onSelectResume ? externalSelectedResumes : internalSelectedResumes;
  const setSelectedResumes = onSelectResume ?
    (ids: string[] | ((prev: string[]) => string[])) => {
      // No-op when using external control
    } : setInternalSelectedResumes;
  const [showFilters, setShowFilters] = useState(false);
  const [displayMode, setDisplayMode] = useState<ListDisplayMode>('list');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteCandidate, setInviteCandidate] = useState<ScoredResume | null>(null);

  // Self-contained "Invite -> AI Interview" flow for a row whose host didn't
  // supply its own `onInviteAIInterview` (Resume Scoring) — opens the shared
  // Invite to AI Interview dialog scoped to the CLICKED ROW's own job: the
  // candidate, then that job's active interview versions to pick from. Never
  // runs when a host DOES supply `onInviteAIInterview` — that path is untouched.
  const [aiInterviewInviteCandidate, setAiInterviewInviteCandidate] = useState<ScoredResume | null>(null);
  const [showBulkInviteModal, setShowBulkInviteModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  // Search + filters in the shared hook. This panel commits as you pick rather
  // than staging, so it uses `setFilter` and leaves the draft pair alone.
  const search = useListSearch({
    initialFilters: {
      matchStatus: initialMatchStatus,
      scoreMin: 0,
      scoreMax: 100,
      dateFrom: initialScoredDate,
      dateTo: initialScoredDate,
      recruiter: 'all',
      /* Which job the rows belong to, as two independent narrowings: the title,
         and the JD version they were scored against. Separate rather than one
         combined control because they answer different questions — "every
         QA Test Engineer we scored" versus "everything scored against v2" —
         and a recruiter comparing versions of one job needs both at once.
         'all' is the off position for each, matching every other select here. */
      jdId: 'all',
      jobTitle: 'all',
      jobVersion: 'all',
    },
    // Score min/max is one logical "Score range" filter, so it counts once.
    countFilters: (f) =>
      [
        // Not counted while hidden, or the Filters badge advertises a filter
        // that has no control on screen and is not being applied.
        !hideMatchStatusFilter && f.matchStatus !== 'all',
        f.scoreMin > 0 || f.scoreMax < 100,
        Boolean(f.dateFrom),
        Boolean(f.dateTo),
        f.recruiter !== 'all',
        f.jdId !== 'all',
        f.jobTitle !== 'all',
        f.jobVersion !== 'all',
      ].filter(Boolean).length,
  });
  const searchTerm = search.appliedQuery;
  const {
    matchStatus: filterMatchStatus,
    scoreMin: filterScoreMin,
    scoreMax: filterScoreMax,
    dateFrom: filterDateFrom,
    dateTo: filterDateTo,
    recruiter: filterRecruiter,
    jdId: filterJdId,
    jobTitle: filterJobTitle,
    jobVersion: filterJobVersion,
  } = search.filters;

  // The parent can preselect a match status (e.g. "Strong" from a stat card).
  useEffect(() => {
    search.setFilter('matchStatus', initialMatchStatus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMatchStatus]);

  // The parent can also preselect one scoring day (e.g. a Scoring History
  // row) — applied to both ends of the date range for an exact-day filter.
  useEffect(() => {
    search.setFilter('dateFrom', initialScoredDate);
    search.setFilter('dateTo', initialScoredDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialScoredDate]);

  // Column configuration - initialize with defaults, then load from localStorage
  const [availableColumns, setAvailableColumns] = useState(DEFAULT_COLUMNS);
  const [columnsLoaded, setColumnsLoaded] = useState(false);

  // Load column preferences from localStorage on mount
  // Auto-enable jobTitle column in global view
  useEffect(() => {
    try {
      const saved = localStorage.getItem(COLUMN_PREFERENCES_KEY);
      if (saved) {
        const savedPrefs = JSON.parse(saved) as Record<string, boolean>;
        setAvailableColumns(prev =>
          prev.map(col => ({
            ...col,
            // In global view, always enable jobTitle; otherwise use saved preference
            enabled: col.id === 'jobTitle' && isGlobalView
              ? true
              : (savedPrefs[col.id] !== undefined ? savedPrefs[col.id] : col.enabled)
          }))
        );
      } else if (isGlobalView) {
        // No saved preferences, but in global view - enable jobTitle
        setAvailableColumns(prev =>
          prev.map(col => ({
            ...col,
            enabled: col.id === 'jobTitle' ? true : col.enabled
          }))
        );
      }
    } catch (error) {
      console.error('Failed to load column preferences:', error);
    }
    setColumnsLoaded(true);
  }, [isGlobalView]);

  // Save column preferences to localStorage when they change
  useEffect(() => {
    if (!columnsLoaded) return; // Don't save on initial load
    try {
      const prefs: Record<string, boolean> = {};
      availableColumns.forEach(col => {
        prefs[col.id] = col.enabled;
      });
      localStorage.setItem(COLUMN_PREFERENCES_KEY, JSON.stringify(prefs));
    } catch (error) {
      console.error('Failed to save column preferences:', error);
    }
  }, [availableColumns, columnsLoaded]);

  const enabledColumns = availableColumns.filter(col => col.enabled);
  const exportColumns = enabledColumns.filter(col => !EXPORT_EXCLUDED_COLUMNS.has(col.id));

  // The JD ID column's value: the row's own code in cross-job lists, the host
  // job's in a single-job table. One helper so cell, export, search and the
  // JD ID filter can never disagree.
  const rowJobCode = (resume: ScoredResume): string => resume.jobCode || jobCode || '';

  // Filtering logic
  const filteredResumes = resumes.filter(resume => {
    // Search filter
    const matchesSearch =
      resume.candidateName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      resume.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      resume.phone.includes(searchTerm) ||
      rowJobCode(resume).toLowerCase().includes(searchTerm.toLowerCase());

    /* Match status filter. Inert when the host has hidden it — the rows are
       already one verdict, and a value left over from an unscoped view must not
       keep narrowing them from behind a control that is no longer rendered. */
    const matchesStatus =
      hideMatchStatusFilter || filterMatchStatus === 'all' || resume.matchStatus === filterMatchStatus;

    // Score range filter
    const matchesScore = resume.scorePercentage >= filterScoreMin && resume.scorePercentage <= filterScoreMax;

    // Date range filter - compare date portions in IST (UTC+5:30)
    let matchesDate = true;
    if (filterDateFrom || filterDateTo) {
      const d = parseIST(resume.scoredDate);
      if (!isNaN(d.getTime())) {
        // Extract YYYY-MM-DD in IST using Intl (parseIST already handles IST-naive strings)
        const scoredDateIST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
        if (filterDateFrom) {
          matchesDate = matchesDate && scoredDateIST >= filterDateFrom;
        }
        if (filterDateTo) {
          matchesDate = matchesDate && scoredDateIST <= filterDateTo;
        }
      }
    }

    // Recruiter filter
    const matchesRecruiter = filterRecruiter === 'all' || resume.scoredBy === filterRecruiter;

    /* Job title / JD version. Both compared as strings against the option
       values built below from these same rows, so an option can never be
       offered that then matches nothing. A row missing the field is excluded
       once its filter is on — it cannot be shown to belong to the job asked
       for, and those rows are never offered as an option either. */
    const matchesJdId = filterJdId === 'all' || rowJobCode(resume) === filterJdId;
    const matchesJobTitle =
      filterJobTitle === 'all' || (resume.jobTitle || '').trim() === filterJobTitle;
    const matchesJobVersion =
      filterJobVersion === 'all' ||
      (resume.jobVersion !== undefined && resume.jobVersion !== null && String(resume.jobVersion) === filterJobVersion);

    return matchesSearch && matchesStatus && matchesScore && matchesDate && matchesRecruiter
      && matchesJdId && matchesJobTitle && matchesJobVersion;
  });

  // "View by Candidate" — a cross-job list spans every job, so the same
  // person can appear several times: once per job, or once per resume
  // version. Rather than a flat, mixed-candidate list, `groupByEmail` hosts
  // cluster those rows by email into one card per person, each expandable
  // to its own scoring history. `isGrouped` is the LOCAL on/off switch the
  // "Group by: Candidate" control below toggles — seeded from the prop and
  // re-synced whenever it changes (a host can move between a grouped and an
  // ungrouped table reusing this same component instance), so a host that
  // never opts in via the prop never shows the grouping control at all.
  const [isGrouped, setIsGrouped] = useState(groupByEmail);
  useEffect(() => {
    setIsGrouped(groupByEmail);
  }, [groupByEmail]);
  const [expandedGroupKeys, setExpandedGroupKeys] = useState<Set<string>>(new Set());
  const toggleGroupExpanded = (key: string) => {
    setExpandedGroupKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  /* A candidate scored against many jobs would otherwise stretch the grouped
     row to the height of their whole job list, so the "Job Titles" cell shows
     the first two and folds the rest behind a "+N more" badge. Clicking the
     badge expands that one candidate's list (and collapses it again). */
  const JOB_TITLE_PREVIEW_COUNT = 2;
  const [expandedTitleKeys, setExpandedTitleKeys] = useState<Set<string>>(new Set());
  const toggleTitlesExpanded = (key: string) => {
    setExpandedTitleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const dateOf = (r: ScoredResume) => new Date(r.scoredDate).getTime() || 0;
  const candidateGroups = useMemo(() => {
    const groups = new Map<string, ScoredResume[]>();
    filteredResumes.forEach((r) => {
      const key = (r.email || r.candidateName || r.id).trim().toLowerCase();
      const group = groups.get(key);
      if (group) group.push(r);
      else groups.set(key, [r]);
    });
    return Array.from(groups.entries())
      .map(([key, rows]) => ({ key, rows: [...rows].sort((a, b) => dateOf(b) - dateOf(a)) }))
      .sort((a, b) => dateOf(b.rows[0]) - dateOf(a.rows[0]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredResumes]);
  // The unfiltered candidate-group count — the "total" half of the count
  // badge in grouped mode, same role `resumes.length` plays in ungrouped
  // mode.
  const totalDistinctCandidates = useMemo(
    () => new Set(resumes.map((r) => (r.email || r.candidateName || r.id).trim().toLowerCase())).size,
    [resumes],
  );

  // Back to page 1 whenever a filter/search narrows the list, grouping is
  // toggled, or the host switches to a genuinely different job (`jobId` —
  // never the `resumes` array itself: hosts that build it inline, e.g. with
  // `.map()` on every render, hand down a new array reference each time even
  // when the underlying data hasn't changed, which would otherwise snap the
  // page back to 1 while the same list is just sitting there being
  // re-rendered).
  useEffect(() => {
    setCurrentPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, filterMatchStatus, filterScoreMin, filterScoreMax, filterDateFrom, filterDateTo, filterRecruiter, filterJdId, filterJobTitle, filterJobVersion, jobId, isGrouped]);

  // Grouped mode paginates candidate CLUSTERS (one page = N people, however
  // many scoring rows each carries); ungrouped mode paginates rows directly.
  // Two independent slices sharing one currentPage/itemsPerPage pair, since
  // only one of the two ever renders at a time.
  const totalPages = Math.max(1, Math.ceil(
    (isGrouped ? candidateGroups.length : filteredResumes.length) / itemsPerPage,
  ));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedResumes = filteredResumes.slice(
    (safeCurrentPage - 1) * itemsPerPage,
    safeCurrentPage * itemsPerPage,
  );
  const paginatedGroups = candidateGroups.slice(
    (safeCurrentPage - 1) * itemsPerPage,
    safeCurrentPage * itemsPerPage,
  );

  /* Grid view's row source — one card per candidate either way. Grouped mode
     collapses each cluster to its primary (highest) version, same as the
     grouped table's own row, plus how many versions it's standing in for. */
  const gridRows: { resume: ScoredResume; versionCount?: number }[] = isGrouped
    ? paginatedGroups.map(({ rows }) => ({ resume: rows[0], versionCount: rows.length }))
    : paginatedResumes.map((resume) => ({ resume }));

  const uniqueRecruiters = Array.from(new Set(resumes.map(r => r.scoredBy)));

  /* Options for the two job filters, read off the rows this table was handed —
     never a fixed list — so they only ever offer what is actually selectable
     here. Built from `resumes` rather than `filteredResumes`, or choosing one
     value would collapse the dropdown you chose it from to that single entry.
     Blank/absent values are dropped: they cannot be matched on. */
  // Numeric order on the trailing number, so "JD-9" comes before "JD-140".
  const uniqueJdIds = Array.from(new Set(resumes.map(rowJobCode).filter(Boolean))).sort((a, b) => {
    const na = parseInt(a.match(/(\d+)\s*$/)?.[1] ?? '', 10);
    const nb = parseInt(b.match(/(\d+)\s*$/)?.[1] ?? '', 10);
    return !isNaN(na) && !isNaN(nb) ? na - nb : a.localeCompare(b);
  });

  const uniqueJobTitles = Array.from(
    new Set(resumes.map(r => (r.jobTitle || '').trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  /* Numeric sort, then rendered as "v2" — a plain string sort puts v10 before
     v2, which is exactly the order a version list must not be in. */
  const uniqueJobVersions = Array.from(
    new Set(
      resumes
        .map(r => r.jobVersion)
        .filter((v): v is number => v !== undefined && v !== null)
        .map(String),
    ),
  ).sort((a, b) => Number(a) - Number(b));

  const handleSelectAll = () => {
    if (onSelectAll) {
      // External control with onSelectAll prop
      if (selectedResumes.length === filteredResumes.length) {
        onSelectAll([]);  // Deselect all
      } else {
        onSelectAll(filteredResumes.map(r => r.id));  // Select all
      }
    } else if (onSelectResume) {
      // External control without onSelectAll - toggle each item
      const allSelected = selectedResumes.length === filteredResumes.length;
      filteredResumes.forEach(resume => {
        const isSelected = selectedResumes.includes(resume.id);
        // Toggle: if all selected, deselect; if not all selected, select unselected ones
        if (allSelected && isSelected) {
          onSelectResume(resume.id);  // Deselect
        } else if (!allSelected && !isSelected) {
          onSelectResume(resume.id);  // Select
        }
      });
    } else {
      // Internal control
      if (selectedResumes.length === filteredResumes.length) {
        setSelectedResumes([]);
      } else {
        setSelectedResumes(filteredResumes.map(r => r.id));
      }
    }
  };

  const handleSelectResume = (id: string) => {
    if (onSelectResume) {
      onSelectResume(id);
    } else {
      setSelectedResumes(prev =>
        prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
      );
    }
  };

  /* Select/deselect one candidate group in "View by Candidates" — toggles
     every scoring row that person carries (one per job/version) in one go,
     since a group has no single id of its own to select. Mirrors
     handleSelectAll's own toggle-each-row approach so it works the same way
     whether selection is externally or internally controlled. */
  const handleSelectGroup = (rows: ScoredResume[]) => {
    const allSelected = rows.every((r) => selectedResumes.includes(r.id));
    rows.forEach((r) => {
      const isSelected = selectedResumes.includes(r.id);
      if (allSelected && isSelected) {
        handleSelectResume(r.id);
      } else if (!allSelected && !isSelected) {
        handleSelectResume(r.id);
      }
    });
  };

  const handleColumnApply = (selectedColumnIds: string[]) => {
    setAvailableColumns(prev =>
      prev.map(col => ({
        ...col,
        enabled: selectedColumnIds.includes(col.id)
      }))
    );
  };

  // Export format modal state
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<'csv' | 'xls'>('csv');

  // Get cell value for export based on column ID
  const getCellValue = (resume: ScoredResume, columnId: string): string => {
    switch (columnId) {
      case 'candidateName':
        return resume.candidateName || '';
      case 'jdId':
        return rowJobCode(resume);
      case 'jobTitle':
        return resume.jobTitle || '';
      case 'jobVersion':
        return resume.jobVersion ? `v${resume.jobVersion}` : '';
      case 'version':
        return `v${resume.version || resume.resumeVersion || 1}`;
      case 'email':
        return resume.email || '';
      case 'phone':
        return resume.phone || '';
      case 'matchStatus':
        return resume.matchStatus || '';
      case 'scorePercentage':
        return formatOverallScoreValue(resume.overallRating10, resume.scorePercentage);
      case 'experience':
        return resume.experience || '';
      case 'education':
        return typeof resume.education === 'string'
          ? resume.education
          : Array.isArray(resume.education) && resume.education.length > 0
            ? (resume.education[0]?.degree || resume.education[0]?.institution || '')
            : '';
      case 'certifications':
        return resume.certifications?.map(cert =>
          typeof cert === 'string' ? cert : (cert?.name || '')
        ).join(', ') || '';
      case 'scoredDate':
        return `${resume.scoredBy || ''} — ${formatIST(resume.scoredDate)}`;
      default:
        return '';
    }
  };

  // Export to CSV
  const exportToCSV = () => {
    const selectedData = filteredResumes.filter(r => selectedResumes.includes(r.id));
    const dataToExport = selectedResumes.length > 0 ? selectedData : filteredResumes;

    // Build CSV content with only enabled columns
    const headers = exportColumns.map(col => `"${col.label}"`).join(',');
    const rows = dataToExport.map(resume =>
      exportColumns.map(col => {
        const value = getCellValue(resume, col.id);
        // Escape quotes and wrap in quotes
        return `"${value.replace(/"/g, '""')}"`;
      }).join(',')
    );

    const csvContent = [headers, ...rows].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${jobCodePrefix(dataToExport)}${jobTitle.replace(/\s+/g, '_')}${versionTag(dataToExport)}_Scorecards_${formatFileDate(new Date())}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    toast.success(`Exported ${dataToExport.length} records to CSV`);
    setShowExportModal(false);
    scoringService.logClientExport('csv', dataToExport.length, isUuid(jobId) ? jobId : undefined);
  };

  // Export to XLS (using HTML table format that Excel can read)
  const exportToXLS = () => {
    const selectedData = filteredResumes.filter(r => selectedResumes.includes(r.id));
    const dataToExport = selectedResumes.length > 0 ? selectedData : filteredResumes;

    // Build HTML table that Excel can open
    let tableHTML = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
      <head>
        <meta charset="UTF-8">
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>Scored Resumes</x:Name>
                <x:WorksheetOptions>
                  <x:DisplayGridlines/>
                </x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
        <style>
          table { border-collapse: collapse; }
          th, td { border: 1px solid var(--raw-000000); padding: 8px; text-align: left; }
          th { background-color: var(--raw-f0f0f0); font-weight: bold; }
        </style>
      </head>
      <body>
        <h2>${jobTitle} - Scored Resumes</h2>
        <p>Exported: ${formatIST(new Date().toISOString())}</p>
        <p>Total Records: ${dataToExport.length}</p>
        <div className="tf-table-shell">
          <table>
            <thead>
              <tr>
                ${exportColumns.map(col => `<th>${col.label}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${dataToExport.map(resume => `
                <tr>
                  ${exportColumns.map(col => `<td>${getCellValue(resume, col.id)}</td>`).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </body>
      </html>
    `;

    const blob = new Blob([tableHTML], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${jobCodePrefix(dataToExport)}${jobTitle.replace(/\s+/g, '_')}${versionTag(dataToExport)}_Scorecards_${formatFileDate(new Date())}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    toast.success(`Exported ${dataToExport.length} records to Excel`);
    setShowExportModal(false);
    scoringService.logClientExport('excel', dataToExport.length, isUuid(jobId) ? jobId : undefined);
  };

  const handleExportExcel = () => {
    // Validation 1: Check if any resumes are available
    if (filteredResumes.length === 0) {
      toast.warning('No resumes available to export');
      return;
    }

    // Validation 2: Must select at least one candidate
    if (selectedResumes.length === 0) {
      toast.warning('Please select at least one candidate to export');
      return;  // ✅ BLOCK export
    }

    // Selection valid - proceed with export
    setShowExportModal(true);
  };

  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [bulkDownloading, setBulkDownloading] = useState(false);

  /* The trailing number in a job code ("JD-151" -> 151), for a numerically
     correct sort — a plain string sort would put "JD-140" before "JD-9".
     NaN (no trailing digits) falls back to alphabetical below. */
  const jobCodeNumber = (code: string): number => {
    const match = code.match(/(\d+)\s*$/);
    return match ? parseInt(match[1], 10) : NaN;
  };

  /* One job code per selected resume, prefixed onto the download filename —
     that resume's own `jobCode` (set in the global "View by Candidates"
     view, which spans many jobs) or else this table's single host job. Two
     or more distinct codes collapse to a "first-last" range rather than
     listing every one, so a bulk download across many jobs still gets a
     short, readable filename. */
  const jobCodePrefix = (rows: ScoredResume[]): string => {
    const codes = Array.from(new Set(
      rows.map(r => r.jobCode || jobCode).filter((c): c is string => !!c),
    )).sort((a, b) => {
      const na = jobCodeNumber(a);
      const nb = jobCodeNumber(b);
      return !isNaN(na) && !isNaN(nb) ? na - nb : a.localeCompare(b);
    });
    if (codes.length === 0) return '';
    if (codes.length === 1) return `${codes[0]}_`;
    return `${codes[0]}-${codes[codes.length - 1]}_`;
  };

  /* "_(V3)" for the JD version(s) scored — matching the same "Version"
     badge/column every row already shows. A range ("_(V1-V3)") when a bulk
     download's rows were scored against different versions of their job(s);
     nothing at all when no row carries a version number. */
  const versionTag = (rows: ScoredResume[]): string => {
    const versions = Array.from(new Set(
      rows.map(r => r.version || r.resumeVersion).filter((v): v is number => !!v),
    )).sort((a, b) => a - b);
    if (versions.length === 0) return '';
    if (versions.length === 1) return `_(V${versions[0]})`;
    return `_(V${versions[0]}-V${versions[versions.length - 1]})`;
  };

  /* DD-MM-YYYY for filenames — distinct from formatISTDate's "31 Aug 2026"
     display format, which isn't filename-safe (spaces, no fixed width). */
  const formatFileDate = (date: Date): string => {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    return `${dd}-${mm}-${date.getFullYear()}`;
  };

  const handleDownloadScorecard = async (resumeId: string) => {
    const resume = resumes.find(r => r.id === resumeId);
    if (!resume) return;

    setDownloadingId(resumeId);
    try {
      const rawBlob = await scoringService.downloadScorecard(resumeId);
      // Ensure blob has correct MIME type for cross-platform PDF rendering
      const blob = new Blob([rawBlob], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const safeCandidateName = (resume.candidateName || 'Candidate').replace(/[^\w\s\-]/g, '').trim().replace(/\s+/g, '_') || 'Candidate';
      link.download = `${jobCodePrefix([resume])}${safeCandidateName}${versionTag([resume])}_Scorecards.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Scorecard downloaded successfully');
    } catch (error) {
      console.error('Error downloading scorecard:', error);
      toast.error('Failed to download scorecard');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDownloadBulkScorecards = async () => {
    if (selectedResumes.length === 0) return;

    // One candidate needs no ZIP wrapper — download that single PDF
    // directly, via the exact same path the per-row action uses.
    if (selectedResumes.length === 1) {
      await handleDownloadScorecard(selectedResumes[0]);
      return;
    }

    setBulkDownloading(true);
    try {
      const selectedRows = resumes.filter(r => selectedResumes.includes(r.id));

      // Built client-side (rather than the single-file zip the backend's
      // bulk-download endpoint returns) so each candidate lands inside a
      // per-job folder — the server's own zip has no notion of "job" and
      // drops every PDF flat, which is fine for a single-job table but
      // unreadable from the "All Candidates" view, where one download can
      // span dozens of jobs.
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      // Disambiguates two same-named candidates landing in the same job
      // folder (e.g. two "Surya Mishra" scores against one JD) so the
      // second file doesn't silently overwrite the first in the archive.
      const namesUsedInFolder = new Map<string, number>();
      // Small batches rather than one Promise.all across the whole
      // selection — this now costs one request PER candidate (the server's
      // own zip was a single request), so an unbounded burst against a
      // large selection would hammer the API.
      const BATCH_SIZE = 5;
      for (let i = 0; i < selectedRows.length; i += BATCH_SIZE) {
        const batch = selectedRows.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async (resume) => {
          const pdfBlob = await scoringService.downloadScorecard(resume.id);
          const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9_\- ]/g, '').trim().replace(/\s+/g, '_');
          // Job title alone can't tell two folders apart once a lineage has
          // several scored versions (or the JD was recreated under the same
          // title), so the JD code and version ride along in the folder
          // name itself rather than only in each file inside it.
          const folderName = [
            resume.jobCode ? sanitize(resume.jobCode) : null,
            sanitize(resume.jobTitle || jobTitle) || 'Job',
            resume.jobVersion ? `V${resume.jobVersion}` : null,
          ].filter(Boolean).join('-');
          const safeCandidateName = (resume.candidateName || 'Candidate').replace(/[^\w\s\-]/g, '').trim().replace(/\s+/g, '_') || 'Candidate';
          const dedupeKey = `${folderName}/${safeCandidateName}`;
          const priorCount = namesUsedInFolder.get(dedupeKey) ?? 0;
          namesUsedInFolder.set(dedupeKey, priorCount + 1);
          const fileName = `${safeCandidateName}${priorCount ? `_${priorCount + 1}` : ''}${versionTag([resume])}_Scorecard.pdf`;
          zip.folder(folderName)!.file(fileName, pdfBlob);
        }));
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = window.URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      // No JD-code/version decoration here — unlike the single-job CSV/XLS
      // export and the per-candidate PDF names, this zip can span many jobs
      // and versions at once (each already broken out into its own folder
      // above), so the outer archive name stays generic.
      const safeName = jobTitle.replace(/[^a-zA-Z0-9_\- ]/g, '').trim().replace(/\s+/g, '_') || 'Scorecards';
      link.download = `${safeName}_Combined_Scorecards_${formatFileDate(new Date())}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success(`${selectedResumes.length} scorecards downloaded`);
    } catch (error) {
      console.error('Error downloading bulk scorecards:', error);
      toast.error('Failed to download scorecards');
    } finally {
      setBulkDownloading(false);
    }
  };


  // Function to handle row click and open detail view
  const handleRowClick = (resumeId: string, event: React.MouseEvent) => {
    // Don't open view if clicking on checkbox or action button
    const target = event.target as HTMLElement;
    if (target.closest('button') || target.closest('input[type="checkbox"]')) {
      return;
    }
    const resume = resumes.find(r => r.id === resumeId);
    if (resume && onViewCandidate) {
      onViewCandidate(resume);
    }
  };

  /**
   * One table cell for a customizable column — shared by the flat "Total
   * Scored Resumes" table and the grouped view's expanded per-candidate
   * sub-table, so both show exactly the same columns, in the same order and
   * with the same formatting, instead of the sub-table carrying its own
   * hand-rolled four.
   */
  const renderResumeCell = (col: { id: string; label: string }, resume: ScoredResume) => {
    if (col.id === 'candidateName') {
      return (
        <td key={col.id} className="py-3 px-4 align-middle whitespace-nowrap">
          {onViewCandidate ? (
            <button
              onClick={() => onViewCandidate(resume)}
              className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline text-left transition-colors"
            >
              {resume.candidateName}
            </button>
          ) : (
            <div className="text-sm text-gray-900">{resume.candidateName}</div>
          )}
        </td>
      );
    }
    if (col.id === 'jobTitle') {
      return (
        <td key={col.id} className="py-3 px-4 align-middle whitespace-nowrap">
          {/* Capped at 25 characters so the column is the same width in every
              table; the tooltip carries the full title. */}
          <div className="text-sm text-gray-700 font-medium" title={resume.jobTitle || undefined}>
            {truncateJobTitle(resume.jobTitle)}
          </div>
        </td>
      );
    }
    if (col.id === 'invitation') {
      return <Fragment key={col.id}>{renderInviteCell(resume)}</Fragment>;
    }
    if (col.id === 'jdId') {
      // The row's own code in cross-job lists; the host job's in a single-job table.
      const code = rowJobCode(resume);
      return (
        <td key={col.id} className="py-3 px-4 align-middle whitespace-nowrap">
          {code ? <JobIdBadge>{code}</JobIdBadge> : <span className="text-sm text-gray-700">-</span>}
        </td>
      );
    }
    if (col.id === 'jobVersion') {
      // The JD's own version at scoring time — only set in the
      // cross-job "All Candidates" list, where the same job
      // title repeats once per JD version. Absent (and so
      // blank) in a single-job table, which is already scoped
      // to one version.
      return (
        <td key={col.id} className="py-3 px-4 align-middle whitespace-nowrap">
          <span className="text-sm text-gray-700">{resume.jobVersion ? `v${resume.jobVersion}` : '-'}</span>
        </td>
      );
    }
    if (col.id === 'version') {
      const ver = resume.version || resume.resumeVersion || 1;
      return (
        <td key={col.id} className="py-3 px-4 align-middle whitespace-nowrap">
          <span className="inline-flex px-2 py-1 rounded-full text-xs border bg-blue-50 text-blue-700 border-blue-200">
            v{ver}
          </span>
        </td>
      );
    }
    if (col.id === 'email') {
      return (
        <td key={col.id} className="py-3 px-4 align-middle whitespace-nowrap">
          <div className="flex items-center gap-1 text-sm text-gray-600">
            <Mail className="w-3.5 h-3.5" />
            {resume.email}
          </div>
        </td>
      );
    }
    if (col.id === 'phone') {
      return (
        <td key={col.id} className="py-3 px-4 align-middle whitespace-nowrap">
          <div className="flex items-start gap-1 text-sm text-gray-600">
            <Phone className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <div className="flex flex-col gap-0.5">
              {(() => {
                const numbers = splitPhoneNumbers(resume.phone, 2);
                return numbers.length > 0
                  ? numbers.map((num, i) => <span key={i} className="whitespace-nowrap">{num}</span>)
                  : <span className="whitespace-nowrap">-</span>;
              })()}
            </div>
          </div>
        </td>
      );
    }
    if (col.id === 'matchStatus') {
      return (
        <td key={col.id} className="py-3 px-4 align-middle whitespace-nowrap">
          <span className={`inline-flex px-2 py-1 rounded-full text-xs border ${matchBadgeClass(resume.matchStatus)}`}>
            {resume.matchStatus}
          </span>
        </td>
      );
    }
    if (col.id === 'scorePercentage') {
      // Same three colors as the Match Status badge, so the
      // score reads as that status at a glance instead of its
      // own separate (and previously inconsistent) scale.
      return (
        <td key={col.id} className="py-3 px-4 align-middle whitespace-nowrap">
          <div className={`${SCORE_CELL_TEXT} ${
            MATCH_SCORE_TEXT_CLASS[normalizeMatchResult(resume.matchStatus) ?? 'No Match']
          }`}>
            {formatOverallScoreValue(resume.overallRating10, resume.scorePercentage)}
          </div>
        </td>
      );
    }
    if (col.id === 'experience') {
      return (
        <td key={col.id} className="py-3 px-4 align-middle whitespace-nowrap">
          <div className="text-sm text-gray-600">{resume.experience || 'N/A'}</div>
        </td>
      );
    }
    if (col.id === 'education') {
      const educationDisplay = typeof resume.education === 'string'
        ? resume.education
        : Array.isArray(resume.education) && resume.education.length > 0
          ? (resume.education[0]?.degree || resume.education[0]?.institution || 'Education available')
          : 'N/A';
      return (
        <td key={col.id} className="py-3 px-4 align-middle min-w-[180px]">
          <div className="text-sm text-gray-600">{educationDisplay}</div>
        </td>
      );
    }
    if (col.id === 'certifications') {
      return (
        <td key={col.id} className="py-3 px-4 align-middle min-w-[200px]">
          <div className="text-sm text-gray-600">
            {resume.certifications && resume.certifications.length > 0
              ? resume.certifications.map(cert =>
                  typeof cert === 'string' ? cert : (cert?.name || '')
                ).join(', ')
              : 'N/A'}
          </div>
        </td>
      );
    }
    if (col.id === 'scoredDate') {
      return (
        <td key={col.id} className="py-3 px-4 align-middle whitespace-nowrap">
          <div className="text-sm text-gray-900">{resume.scoredBy}</div>
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Calendar className="w-3 h-3" />
            <span>{formatISTDate(resume.scoredDate)}{' '}<span className="text-gray-400">{formatISTTime(resume.scoredDate)}</span></span>
          </div>
        </td>
      );
    }
    return null;
  };

  /**
   * The Invitation cell for one resume — shared with the grouped view's
   * expanded sub-table so that table carries the same Invitation column the
   * flat one does.
   */
  // Every row gets the button, whatever its match status, so a scored
  // candidate can always be invited. The menu carries the two things a
  // candidate can be invited to; each entry is gated by its own permission and
  // by whether that section exists on this JD, rather than hiding the whole
  // control. Neither configured → the button is disabled.
  // Just the invite control itself, with no `<td>` wrapper, so the grid
  // view's card can place it next to its own View/Actions buttons instead
  // of inside a table row.
  const renderInviteButton = (resume: ScoredResume) => {
    // Row-scoped: for the cross-job global list this reads THIS row's own
    // job from the bulk map: resolveAssessmentConfigured/
    // resolveAIInterviewConfigured (see above), not the table-wide flags,
    // which are `undefined` for that list. A single-job table's rows all
    // resolve to the same table-wide flag, same as before this existed.
    const rowAssessmentConfigured = resolveAssessmentConfigured(resume);
    const rowAIInterviewConfigured = resolveAIInterviewConfigured(resume);
    const rowCanInviteAssessment = canCreateAssessments && rowAssessmentConfigured !== false;
    const rowCanInviteAIInterview = mayInviteAIInterview && rowAIInterviewConfigured !== false;
    const rowInviteDisabled = !rowCanInviteAssessment && !rowCanInviteAIInterview;
    // Always render the button rather than collapsing to a "-" placeholder
    // when neither permission is held — the trigger stays visible and
    // non-clickable, with its own tooltip naming the reason, matching every
    // other disabled action on this page instead of disappearing outright.
    const rowInviteDisabledTitle = !(canCreateAssessments || mayInviteAIInterview)
      ? 'You do not have permission to invite candidates'
      : 'No published assessment or AI interview for this job yet';

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="primary"
            size="sm"
            aria-label="Invite"
            disabled={rowInviteDisabled}
            title={rowInviteDisabled ? rowInviteDisabledTitle : 'Invite'}
          >
            <UserPlus className="w-3.5 h-3.5" />
            Invite
            <ChevronDown className="w-3 h-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-48 !rounded-lg !bg-white !py-1 !px-0 !shadow-xl"
        >
          <DropdownMenuItem
            className={scoredResumesMenuItemClass}
            /* Off unless this JD has a published assessment —
               and assessment invites spend a unit, so the entry
               also goes quiet when there are none left rather
               than opening a form that cannot be submitted. */
            disabled={!canCreateAssessments || !rowCanInviteAssessment || availableUnits === 0}
            title={
              !canCreateAssessments
                ? 'You do not have permission to invite candidates to an assessment'
                : !rowCanInviteAssessment
                  ? 'No published assessment for this job yet'
                  : availableUnits === 0
                    ? 'No assessment units available'
                    : undefined
            }
            onSelect={() => {
              if (!canCreateAssessments) {
                toast.error('You do not have permission to invite candidates to an assessment');
                return;
              }
              setInviteCandidate(resume);
              setShowInviteModal(true);
            }}
          >
            <FileText className="w-4 h-4 text-menu-icon-view" />
            <span className={MENU_ITEM_SCALE_CLASS}>Assessment</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className={scoredResumesMenuItemClass}
            /* Same rule on the interview side: nothing live on
               this JD means nothing to invite the candidate to. */
            disabled={!mayInviteAIInterview || !rowCanInviteAIInterview}
            title={
              !mayInviteAIInterview
                ? 'You do not have permission to invite candidates to an AI interview'
                : !rowCanInviteAIInterview
                  ? 'No published AI interview for this job yet'
                  : undefined
            }
            onSelect={() => {
              if (!mayInviteAIInterview) {
                toast.error('You do not have permission to invite candidates to an AI interview');
                return;
              }
                if (onInviteAIInterview) {
                  onInviteAIInterview({
                    name: resume.candidateName || 'Unknown',
                    email: resume.email || '',
                    resumeId: resume.resumeId,
                  });
                } else {
                  // No host-supplied handler (the cross-job global list) —
                  // resolve and share THIS ROW's own job's AI interview.
                  setAiInterviewInviteCandidate(resume);
                }
              }}
            >
              <Video className="w-4 h-4 text-menu-icon-share" />
              <span className={MENU_ITEM_SCALE_CLASS}>AI Interview</span>
            </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const renderInviteCell = (resume: ScoredResume) => (
    <td className="py-3 px-4 align-middle whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
      {renderInviteButton(resume)}
    </td>
  );

  /**
   * The Actions dropdown's items for one resume — factored out so the
   * grouped-by-candidate view's cluster-level menu (applied to that
   * candidate's most recent score) can offer the exact same actions as the
   * per-row menu below, instead of a second hand-rolled copy drifting apart
   * from it.
   */
  const renderActionsMenuItems = (resume: ScoredResume) => (
    <>
      <DropdownMenuItem className={scoredResumesMenuItemClass} onSelect={() => onViewCandidate && onViewCandidate(resume)}>
        <Eye className="w-4 h-4 text-menu-icon-view" />
        <span className={MENU_ITEM_SCALE_CLASS}>View Results</span>
      </DropdownMenuItem>
      <DropdownMenuItem className={scoredResumesMenuItemClass} onSelect={() => setScoreTableCandidate(resume)}>
        <BarChart3 className="w-4 h-4 text-menu-icon-view" />
        <span className={MENU_ITEM_SCALE_CLASS}>View Score Table</span>
      </DropdownMenuItem>
      {/* Only scores that still point at a resume have a file behind them to
          preview. */}
      {resume.resumeId && (
        <DropdownMenuItem className={scoredResumesMenuItemClass} onSelect={() => setViewResumeCandidate(resume)}>
          <FileText className="w-4 h-4 text-menu-icon-view" />
          <span className={MENU_ITEM_SCALE_CLASS}>View Resume</span>
        </DropdownMenuItem>
      )}
      {/* Only scores that still point at a resume can be shared. */}
      {resume.resumeId && (
        <DropdownMenuItem
          className={`${scoredResumesMenuItemClass} ${!canShareResume ? 'text-gray-400 cursor-not-allowed opacity-60' : ''}`}
          aria-disabled={!canShareResume}
          title={!canShareResume ? 'You do not have permission to share resumes' : undefined}
          onSelect={(e) => {
            if (!canShareResume) {
              e.preventDefault();
              toast.error('You do not have permission to share resumes');
              return;
            }
            openShareModal(resume);
          }}
        >
          <Share2 className="w-4 h-4 text-menu-icon-share" />
          <span className={MENU_ITEM_SCALE_CLASS}>Share via Email</span>
        </DropdownMenuItem>
      )}
      <DropdownMenuItem
        className={`${scoredResumesMenuItemClass} ${!canDownloadScorecard ? 'text-gray-400 cursor-not-allowed opacity-60' : ''}`}
        disabled={downloadingId === resume.id}
        aria-disabled={!canDownloadScorecard}
        title={!canDownloadScorecard ? 'You do not have permission to download the scorecard' : undefined}
        onSelect={(e) => {
          if (!canDownloadScorecard) {
            e.preventDefault();
            toast.error('You do not have permission to download the scorecard');
            return;
          }
          handleDownloadScorecard(resume.id);
        }}
      >
        {downloadingId === resume.id ? (
          <Loader2 className="w-4 h-4 animate-spin text-menu-icon-download" />
        ) : (
          <Download className="w-4 h-4 text-menu-icon-download" />
        )}
        <span className={MENU_ITEM_SCALE_CLASS}>Download Scorecard</span>
      </DropdownMenuItem>
    </>
  );

  // A stable color per candidate for the grouped view's avatar initials —
  // hashed from their own key so the same person always lands on the same
  // color across renders/pages, without needing to track an assignment.
  const AVATAR_PALETTE = [
    { bg: 'bg-blue-100', text: 'text-blue-700' },
    { bg: 'bg-rose-100', text: 'text-rose-700' },
    { bg: 'bg-success-subtle', text: 'text-success' },
    { bg: 'bg-violet-100', text: 'text-violet-700' },
    { bg: 'bg-warning-subtle', text: 'text-warning' },
    { bg: 'bg-cyan-100', text: 'text-cyan-700' },
  ];
  const avatarColorFor = (key: string) => {
    const hash = key.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
  };
  const initialsFor = (name: string) => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
      {/* Header — title and the one page-level action. Everything that acts on
          the list lives in the toolbar below, and everything that acts on a
          selection lives in its own row under that, same as job-openings. */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <h2 className="text-gray-900">{title}</h2>
        {/* Score Resumes — opens the host's "Select Applicants to Score" modal. */}
        {onScoreResumes && (
          <Button
            variant="primary"
            size="md"
            onClick={onScoreResumes}
            icon={<ClipboardList className="w-4 h-4" />}
            className="self-start sm:self-auto"
          >
            <span className="hidden sm:inline">Score Resumes</span>
            <span className="sm:hidden">Score</span>
          </Button>
        )}
      </div>

      {/* Search and Filter Bar */}
      <div className="mb-4 space-y-3">
        {/* Canonical search + filters row (same component as job-openings). The
            previous hand-rolled version used grey focus rings, rounded-md and a
            `palaceholder-gray-500` typo, so it matched no other list in the app. */}
        <ListToolbar
          searchValue={searchTerm}
          onSearchChange={search.setQuery}
          // The hook debounces into `appliedQuery`, so keystrokes pass through.
          searchDebounceMs={0}
          searchPlaceholder="Search by name, email, phone, or JD ID..."
          onToggleFilters={() => setShowFilters(!showFilters)}
          filtersOpen={showFilters}
          activeFilterCount={search.activeFilterCount}
          filtersApplied={search.filtersApplied}
          onClearFilters={search.reset}
          className="mb-0"
          countBadge={
            <ListCountBadge
              filtered={isGrouped ? candidateGroups.length : filteredResumes.length}
              total={isGrouped ? totalDistinctCandidates : resumes.length}
              noun="candidate"
              selected={selectedResumes.length}
            />
          }
        >
          {/* Customize Columns — hidden on the narrowest screens, where the row
              has no space for it and the table scrolls horizontally anyway. */}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowColumnModal(true)}
            icon={<SlidersHorizontal className="w-4 h-4" />}
            className="hidden sm:flex whitespace-nowrap"
          >
            <span className="hidden md:inline">Customize Columns</span>
            <span className="md:hidden">Columns</span>
          </Button>

          {/* One Export for both states — handleExportExcel already exports the
              selection, and asks for one when there isn't any. It just leads
              more strongly once rows are picked. */}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              if (!canExport) {
                toast.error('You do not have permission to export');
                return;
              }
              handleExportExcel();
            }}
            aria-disabled={!canExport}
            title={!canExport ? 'You do not have permission to export' : undefined}
            icon={<FileDown className="w-4 h-4" />}
            className={`whitespace-nowrap ${!canExport ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Export
          </Button>
          <ListViewToggle value={displayMode} onChange={setDisplayMode} />
        </ListToolbar>

        {/* Advanced Filters */}
        {showFilters && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            {/* Flex-wrap, not the stretching 2/3-column grid this used to be:
                a grid cell is a third of the panel wide and every control in it
                stretched to fill that, so a "v2" dropdown was as wide as a job
                title. Each field now takes one fixed width and they pack from
                the left, wrapping when they run out of room. */}
            {/* Ordered who → when → how it scored → which job.

                Fields FLEX rather than sitting at one fixed width: the panel is
                a different width in every host and at every viewport, and fixed
                fields leave ragged trailing space at most of them. Each field's
                `basis` is the width it wants — that is what decides how many
                fit on a row — and `grow` shares out whatever the row has left,
                so a row is always filled edge to edge. `max-w` keeps a short
                final row from stretching two fields across the whole panel. */}
            <div className="flex flex-wrap gap-4">
              {/* 1. Scored By */}
              <div className={FILTER_FIELD_CLASS}>
                <label className={FILTER_LABEL_CLASS}>Scored By</label>
                {/* SearchableSelect, not native <select>: a native option popup
                    is sized to its longest option by the browser and overflows
                    small screens (recruiter names can be long). This keeps the
                    menu within the field width and truncates. */}
                <SearchableSelect
                  value={filterRecruiter === 'all' ? '' : filterRecruiter}
                  onChange={(v) => search.setFilter('recruiter', v || 'all')}
                  options={uniqueRecruiters.map((recruiter) => ({ value: String(recruiter), label: String(recruiter) }))}
                  allLabel="All Recruiters"
                  placeholder="All Recruiters"
                  searchPlaceholder="Search recruiter..."
                  ariaLabel="Filter by recruiter"
                />
              </div>

              {/* 2. Date From */}
              <div className={FILTER_FIELD_CLASS}>
                <label className={FILTER_LABEL_CLASS}>Date From</label>
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => search.setFilter('dateFrom', e.target.value)}
                  className={FILTER_CONTROL_CLASS}
                />
              </div>

              {/* 3. Date To */}
              <div className={FILTER_FIELD_CLASS}>
                <label className={FILTER_LABEL_CLASS}>Date To</label>
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => search.setFilter('dateTo', e.target.value)}
                  className={FILTER_CONTROL_CLASS}
                />
              </div>

              {/* 4. Match Status — dropped when the list is already one
                  verdict; see `hideMatchStatusFilter`. The only conditional
                  field in this panel, and it turns on a host's explicit
                  statement about its own rows rather than on the data. */}
              {!hideMatchStatusFilter && (
                <div className={FILTER_FIELD_CLASS}>
                  <label className={FILTER_LABEL_CLASS}>Match Status</label>
                  <select
                    value={filterMatchStatus}
                    onChange={(e) => search.setFilter('matchStatus', e.target.value as typeof filterMatchStatus)}
                    className={FILTER_CONTROL_CLASS}
                  >
                    <option value="all">All Statuses</option>
                    <option value="Exact Match">Exact Match</option>
                    <option value="Partial Match">Partial Match</option>
                    <option value="No Match">No Match</option>
                  </select>
                </div>
              )}

              {/* 5. Score Range — two inputs sharing ONE field, so the pair
                  reads as a single filter rather than two. Widened to take up
                  the first row's leftover space; see FILTER_FIELD_WIDE_CLASS. */}
              <div className={FILTER_FIELD_WIDE_CLASS}>
                <label className={FILTER_LABEL_CLASS}>Score Range</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={filterScoreMin}
                    onChange={(e) => search.setFilter('scoreMin', Number(e.target.value))}
                    min="0"
                    max="100"
                    placeholder="Min"
                    /* min-w-0 so a flex child can shrink below its intrinsic
                       width — a number input's default is wider than half of
                       this field, and without it the pair overflows. */
                    className={`${FILTER_CONTROL_CLASS} min-w-0`}
                  />
                  <input
                    type="number"
                    value={filterScoreMax}
                    onChange={(e) => search.setFilter('scoreMax', Number(e.target.value))}
                    min="0"
                    max="100"
                    placeholder="Max"
                    className={`${FILTER_CONTROL_CLASS} min-w-0`}
                  />
                </div>
              </div>

              {/* Forced wrap, so the three job filters always start a new line.
                  Even the verdict sections (no Match Status) have seven fields
                  now that JD ID is here — too crowded for one row.

                  A full-basis spacer is the only way to break a flex row; flex
                  items have no `break-before`. Height zero, so it costs one
                  row-gap and nothing else. */}
              <div aria-hidden className="basis-full h-0" />

              {/* 6-8. JD ID / Job Title / Job Version.

                  Both render unconditionally, like every other field in this
                  panel. They were gated on having more than one value to pick
                  between, which meant Job Version vanished on any list whose
                  rows happened to share a version (Exact Match with four rows,
                  say) — a filter that comes and goes with the data is one users
                  cannot learn, and it left a hole in the row beside a Job Title
                  that did render. `Scored By` has always shown even with a
                  single recruiter; these now match it. */}
              <div className={FILTER_FIELD_CLASS}>
                <label className={FILTER_LABEL_CLASS}>JD ID</label>
                <SearchableSelect
                  value={filterJdId === 'all' ? '' : filterJdId}
                  onChange={(v) => search.setFilter('jdId', v || 'all')}
                  options={uniqueJdIds.map((code) => ({ value: code, label: code }))}
                  allLabel="All JD IDs"
                  placeholder="All JD IDs"
                  searchPlaceholder="Search JD ID..."
                  ariaLabel="Filter by JD ID"
                />
              </div>

              <div className={FILTER_FIELD_CLASS}>
                <label className={FILTER_LABEL_CLASS}>Job Title</label>
                {/* SearchableSelect, not native <select>: job titles are long and
                    a native option popup sizes to the longest one, overflowing far
                    past the screen on mobile. This keeps the menu within the field
                    width, truncates long titles, and adds a search box for the
                    (often long) list. */}
                <SearchableSelect
                  value={filterJobTitle === 'all' ? '' : filterJobTitle}
                  onChange={(v) => search.setFilter('jobTitle', v || 'all')}
                  options={uniqueJobTitles.map((title) => ({ value: String(title), label: String(title) }))}
                  allLabel="All Job Titles"
                  placeholder="All Job Titles"
                  searchPlaceholder="Search job title..."
                  ariaLabel="Filter by job title"
                />
              </div>

              <div className={FILTER_FIELD_CLASS}>
                <label className={FILTER_LABEL_CLASS}>Job Version</label>
                <select
                  value={filterJobVersion}
                  onChange={(e) => search.setFilter('jobVersion', e.target.value)}
                  className={FILTER_CONTROL_CLASS}
                >
                  <option value="all">All Versions</option>
                  {uniqueJobVersions.map(version => (
                    <option key={version} value={version}>v{version}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Panel footer: "Done" applies the selection and reveals the
                toolbar Clear — same flow as job-openings. */}
            <div className="mt-4 pt-3 border-t border-gray-200 flex items-center justify-end gap-2">
              <Button
                // The controls above commit as they change, so Done just closes.
                variant="secondary"
                size="sm"
                onClick={() => setShowFilters(false)}
              >
                Done
              </Button>
            </div>
          </div>
        )}

        {/* pt-3, not relying on the parent's space-y-3: that only adds a
            margin-top, which collapses with this slot's own mb-3 down to a
            single 12px gap instead of the two stacking — padding never
            collapses, so this guarantees the same visible gap job-openings
            gets above its own status-tabs row. */}
        {viewPillsSlot && <div className="pt-3">{viewPillsSlot}</div>}

        {/* Selection row — its own strip under the search/filter row, divided by
            a rule, exactly like job-openings' "Select all + Bulk Actions" line.
            Bulk buttons only appear once something is picked, so the row stays
            quiet until it has work to do. Shown in both list and grid view,
            since grid cards now carry their own per-item checkbox too. */}
        {filteredResumes.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 pt-3 border-t border-gray-200">
            <button
              onClick={handleSelectAll}
              className={`group inline-flex items-center gap-2 h-9 pl-2.5 pr-3.5 rounded-full border text-sm font-medium transition-all ${
                selectedResumes.length > 0
                  ? 'bg-brand-blue text-white border-brand-blue shadow-sm shadow-brand-blue/30 hover:bg-brand-blue-2'
                  : 'bg-white text-gray-700 border-gray-400 hover:border-brand-blue/40 hover:text-brand-blue'
              }`}
            >
              <span className={`flex h-5 w-5 items-center justify-center rounded-full transition-colors ${
                selectedResumes.length > 0 ? 'bg-white/20' : 'bg-gray-100 group-hover:bg-brand-blue/10'
              }`}>
                {selectedResumes.length === filteredResumes.length ? (
                  <CheckSquare className={`w-3.5 h-3.5 ${selectedResumes.length > 0 ? 'text-white' : 'text-brand-blue'}`} />
                ) : selectedResumes.length > 0 ? (
                  <span className="h-2 w-2 rounded-full bg-white" />
                ) : (
                  <Square className="w-3.5 h-3.5 text-gray-400 group-hover:text-brand-blue" />
                )}
              </span>
              <span>
                {selectedResumes.length > 0 ? `${selectedResumes.length} selected` : 'Select all'}
              </span>
            </button>

            {selectedResumes.length > 0 && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    if (!canDownloadScorecard) {
                      toast.error('You do not have permission to download the scorecard');
                      return;
                    }
                    handleDownloadBulkScorecards();
                  }}
                  disabled={bulkDownloading}
                  aria-disabled={!canDownloadScorecard}
                  title={!canDownloadScorecard ? 'You do not have permission to download the scorecard' : undefined}
                  className={`rounded-full ${!canDownloadScorecard ? 'opacity-50 cursor-not-allowed' : ''}`}
                  icon={bulkDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                >
                  {bulkDownloading ? 'Downloading...' : `Download (${selectedResumes.length})`}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    if (!canCreateAssessments) {
                      toast.error('You do not have permission to invite candidates to an assessment');
                      return;
                    }
                    setShowBulkInviteModal(true);
                  }}
                  /* Bulk Invite goes to assessments too, so it takes the same
                     "is there one on this JD" gate as the per-row entry. */
                  disabled={assessmentConfigured === false || availableUnits === 0}
                  aria-disabled={!canCreateAssessments}
                  className={`rounded-full ${!canCreateAssessments ? 'opacity-50 cursor-not-allowed' : ''}`}
                  icon={<Send className="w-4 h-4" />}
                  title={
                    !canCreateAssessments
                      ? 'You do not have permission to invite candidates to an assessment'
                      : !canInviteAssessment
                        ? 'No published assessment for this job yet'
                        : availableUnits === 0
                          ? 'No assessment units available'
                          : `Bulk invite ${selectedResumes.length} candidates`
                  }
                >
                  Bulk Invite ({selectedResumes.length})
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* "Group by: Candidate" control — only offered by hosts that opted
          into grouping via the `groupByEmail` prop (the "View by Candidates"
          card). `isGrouped` is this table's own on/off switch; the prop only
          sets its starting value each time the host hands this table a
          differently-scoped list. */}
      {groupByEmail && (
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">
                Group by: <span className="font-medium text-gray-900">{isGrouped ? 'Candidate' : 'Ungrouped'}</span>
                <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-40">
              <DropdownMenuItem className="group" onSelect={() => setIsGrouped(true)}>
                <span className={MENU_ITEM_SCALE_CLASS}>Candidate</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="group" onSelect={() => setIsGrouped(false)}>
                <span className={MENU_ITEM_SCALE_CLASS}>Ungrouped</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {isGrouped && (
            <button
              onClick={() => setIsGrouped(false)}
              className="text-sm font-medium text-brand-blue hover:text-brand-blue-2 transition-colors"
            >
              Clear Grouping
            </button>
          )}
        </div>
      )}

      {displayMode === 'grid' ? (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          {gridRows.length === 0 ? (
            <ListEmptyState
              icon={Search}
              isNarrowed={search.isNarrowed}
              query={search.appliedQuery}
              entityLabel="scored resume"
              emptyTitle="No Scored Resumes"
              emptyDescription="Score resumes against this job description to see the candidates here."
              onReset={search.reset}
              imageSrc="/scored-resumes-empty-state.webp"
              imageAlt="Scored resumes illustration"
              action={onScoreResumesFromEmptyState ? (
                <Button
                  variant="primary"
                  size="md"
                  onClick={onScoreResumesFromEmptyState}
                  disabled={scoreResumesDisabled}
                  title={scoreResumesDisabled ? 'You do not have permission to score resumes' : undefined}
                  icon={<ClipboardList className="w-4 h-4" />}
                >
                  Score Resumes
                </Button>
              ) : undefined}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
              {gridRows.map(({ resume, versionCount }) => (
                <div
                  key={resume.id}
                  onClick={(e) => handleRowClick(resume.id, e)}
                  className={`group relative text-left bg-white rounded-xl border border-gray-200 hover:shadow-md hover:border-[var(--border-dark)] hover:-translate-y-0.5 transition-all p-4 flex flex-col gap-3 cursor-pointer ${gridCardSelectedClass(selectedResumes.includes(resume.id))}`}
                >
                  <GridCardSelect
                    selected={selectedResumes.includes(resume.id)}
                    onToggle={() => handleSelectResume(resume.id)}
                    label={resume.candidateName || 'candidate'}
                    selectionActive={selectedResumes.length > 0}
                  />
                  <div className="flex items-start gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/20 flex items-center justify-center text-brand-blue font-semibold text-sm flex-shrink-0">
                      {(resume.candidateName || 'C')[0].toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 truncate">{resume.candidateName || 'Candidate'}</p>
                      <p className="text-xs text-gray-500 truncate">{resume.email || '—'}</p>
                    </div>
                    {versionCount != null && versionCount > 1 && (
                      <span className="text-2xs font-medium text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-full shrink-0 whitespace-nowrap">
                        {versionCount} versions
                      </span>
                    )}
                  </div>

                  {isGlobalView && resume.jobTitle && (
                    <p className="text-xs text-gray-500 truncate" title={resume.jobTitle}>
                      Applied for: <span className="font-medium text-gray-700">
                        {[resume.jobCode, truncateJobTitle(resume.jobTitle), resume.jobVersion != null ? `v${resume.jobVersion}` : null]
                          .filter(Boolean)
                          .join('-')}
                      </span>
                    </p>
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs border ${matchBadgeClass(resume.matchStatus)}`}>
                      {resume.matchStatus}
                    </span>
                    <span className={`text-sm font-semibold ${
                      MATCH_SCORE_TEXT_CLASS[normalizeMatchResult(resume.matchStatus) ?? 'No Match']
                    }`}>
                      {formatOverallScore(resume.overallRating10, resume.scorePercentage)}
                    </span>
                  </div>

                  <div
                    className="flex items-center gap-1.5 mt-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onViewCandidate && onViewCandidate(resume)}
                      icon={<Eye className="w-3.5 h-3.5" />}
                      className="flex-1"
                    >
                      View
                    </Button>
                    {renderInviteButton(resume)}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          aria-label="Actions"
                          title="Actions"
                          className="p-2.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-all"
                        >
                          <MoreVertical className="w-4 h-4 text-gray-600" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="w-52 !rounded-lg !bg-white !py-1 !px-0 !shadow-xl"
                      >
                        {renderActionsMenuItems(resume)}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : isGrouped ? (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          {/* Desktop Table View — grouped */}
          <div className="hidden md:block overflow-x-auto tf-table-shell">
            <table className="w-full min-w-[900px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left py-3 px-4 w-12 align-middle tf-sticky-col-left">
                    <button onClick={handleSelectAll} className="p-1 hover:bg-gray-100 rounded">
                      {selectedResumes.length === filteredResumes.length && filteredResumes.length > 0 ? (
                        <CheckSquare className="w-4 h-4 text-gray-800" />
                      ) : (
                        <Square className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                  </th>
                  <th className="w-10 px-3 py-3" />
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-700 uppercase tracking-wide">Candidate</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-700 uppercase tracking-wide">Job Versions</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-700 uppercase tracking-wide">Job Titles</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-700 uppercase tracking-wide">Latest Updated</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-700 uppercase tracking-wide tf-sticky-col">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedGroups.map(({ key, rows }) => {
                  const primary = rows[0];
                  const isExpanded = expandedGroupKeys.has(key);
                  const distinctTitles = Array.from(new Set(rows.map((r) => r.jobTitle).filter(Boolean))) as string[];
                  const titlesExpanded = expandedTitleKeys.has(key);
                  const hiddenTitleCount = Math.max(0, distinctTitles.length - JOB_TITLE_PREVIEW_COUNT);
                  const avatar = avatarColorFor(key);
                  const groupSelected = rows.every((r) => selectedResumes.includes(r.id));
                  return (
                    <Fragment key={key}>
                      <tr className="hover:bg-[var(--raw-fafbfc)] transition-colors">
                        <td className="py-4 px-4 align-top tf-sticky-col-left" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleSelectGroup(rows)}
                            className="p-1 hover:bg-gray-200 rounded"
                          >
                            {groupSelected ? (
                              <CheckSquare className="w-4 h-4 text-gray-800" />
                            ) : (
                              <Square className="w-4 h-4 text-gray-400" />
                            )}
                          </button>
                        </td>
                        <td className="px-3 py-4 align-top">
                          <button
                            onClick={() => toggleGroupExpanded(key)}
                            aria-label={isExpanded ? 'Collapse' : 'Expand'}
                            title={isExpanded ? 'Collapse' : 'Expand'}
                            className={`inline-flex items-center justify-center w-7 h-7 rounded-lg border transition-colors ${
                              isExpanded
                                ? 'border-brand-blue/40 bg-brand-blue/5 text-brand-blue'
                                : 'border-gray-200 text-gray-400 hover:border-brand-blue/30 hover:text-brand-blue'
                            }`}
                          >
                            <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                          </button>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="flex items-start gap-3">
                            <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold ${avatar.bg} ${avatar.text}`}>
                              {initialsFor(primary.candidateName || 'Candidate')}
                            </div>
                            <div className="min-w-0">
                              {onViewCandidate ? (
                                <button
                                  onClick={(e) => { e.stopPropagation(); onViewCandidate(primary); }}
                                  className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline text-left transition-colors block"
                                >
                                  {primary.candidateName || 'Candidate'}
                                </button>
                              ) : (
                                <div className="text-sm font-medium text-gray-900">{primary.candidateName || 'Candidate'}</div>
                              )}
                              {primary.email && <div className="text-xs text-gray-500 truncate">{primary.email}</div>}
                              {primary.phone && <div className="text-xs text-gray-500">{primary.phone}</div>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap">
                            {rows.length} Job {rows.length === 1 ? 'Version' : 'Versions'}
                          </span>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="space-y-0.5">
                            {(titlesExpanded ? distinctTitles : distinctTitles.slice(0, JOB_TITLE_PREVIEW_COUNT)).map((title, i) => (
                              <div key={i} className="text-sm text-gray-700">{title}</div>
                            ))}
                            {hiddenTitleCount > 0 && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); toggleTitlesExpanded(key); }}
                                title={distinctTitles.slice(JOB_TITLE_PREVIEW_COUNT).join(', ')}
                                className="inline-flex items-center px-2 py-0.5 mt-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200 hover:text-gray-800 transition-colors whitespace-nowrap"
                              >
                                {titlesExpanded ? 'Show less' : `+${hiddenTitleCount} more`}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top whitespace-nowrap">
                          <div className="text-sm text-gray-900">{formatISTDate(primary.scoredDate)}</div>
                          <div className="text-xs text-gray-500">{formatISTTime(primary.scoredDate)}</div>
                        </td>
                        <td className="px-4 py-4 align-top tf-sticky-col" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                aria-label="Actions"
                                title="Actions"
                                className="p-2.5 bg-white rounded-lg hover:bg-gray-50 transition-all border border-gray-200"
                              >
                                <MoreVertical className="w-4 h-4 text-gray-600" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52 !rounded-lg !bg-white !py-1 !px-0 !shadow-xl">
                              {renderActionsMenuItems(primary)}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${key}-detail`}>
                          <td colSpan={7} className="p-0 bg-gray-50/60">
                            {/* Same columns as the flat "Total Scored
                                Resumes" table — including whatever the user
                                turned on in Customize Columns — so expanding a
                                candidate shows their scores at full detail
                                rather than a reduced set. */}
                            <div className="px-4 sm:px-6 py-3 overflow-x-auto">
                              <table className="w-full min-w-[1100px] table-auto">
                                <thead>
                                  <tr className="border-b border-gray-200">
                                    {enabledColumns.map((col) => (
                                      <th key={col.id} className="text-left py-2 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">
                                        {col.label}
                                      </th>
                                    ))}
                                    <th className="text-left py-2 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wide">Actions</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {rows.map((row) => (
                                    <tr key={row.id} className="bg-white">
                                      {enabledColumns.map((col) => renderResumeCell(col, row))}
                                      <td className="py-2.5 px-4 align-middle" onClick={(e) => e.stopPropagation()}>
                                        <DropdownMenu>
                                          <DropdownMenuTrigger asChild>
                                            <button
                                              aria-label="Actions"
                                              title="Actions"
                                              className="p-2.5 bg-white rounded-lg hover:bg-gray-50 transition-all border border-gray-200"
                                            >
                                              <MoreVertical className="w-4 h-4 text-gray-600" />
                                            </button>
                                          </DropdownMenuTrigger>
                                          <DropdownMenuContent align="end" className="w-52 !rounded-lg !bg-white !py-1 !px-0 !shadow-xl">
                                            {renderActionsMenuItems(row)}
                                          </DropdownMenuContent>
                                        </DropdownMenu>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>

            {candidateGroups.length === 0 && (
              <ListEmptyState
                icon={Search}
                isNarrowed={search.isNarrowed}
                query={search.appliedQuery}
                entityLabel="candidate"
                emptyTitle="No scored candidates yet"
                emptyDescription="Upload and score candidates to see them here."
                onReset={search.reset}
              />
            )}
          </div>

          {/* Mobile Card View — grouped. Same data/state as the desktop table
              above (paginatedGroups, expandedGroupKeys, avatarColorFor,
              renderActionsMenuItems, formatters) — just laid out as cards
              with the per-candidate job history as a stacked list instead of
              a nested <table>, since a second horizontal-scrolling table
              inside a card is no more usable on a phone than the outer one. */}
          <div className="md:hidden space-y-3">
            {paginatedGroups.map(({ key, rows }) => {
              const primary = rows[0];
              const isExpanded = expandedGroupKeys.has(key);
              const avatar = avatarColorFor(key);
              const groupSelected = rows.every((r) => selectedResumes.includes(r.id));
              return (
                <div key={key} className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleSelectGroup(rows); }}
                        className="p-1 hover:bg-gray-200 rounded mt-1 flex-shrink-0"
                      >
                        {groupSelected ? (
                          <CheckSquare className="w-5 h-5 text-gray-800" />
                        ) : (
                          <Square className="w-5 h-5 text-gray-400" />
                        )}
                      </button>
                      <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold ${avatar.bg} ${avatar.text}`}>
                        {initialsFor(primary.candidateName || 'Candidate')}
                      </div>
                      <div className="min-w-0 flex-1">
                        {onViewCandidate ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); onViewCandidate(primary); }}
                            className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline text-left transition-colors block truncate w-full"
                          >
                            {primary.candidateName || 'Candidate'}
                          </button>
                        ) : (
                          <div className="text-sm font-medium text-gray-900 truncate">{primary.candidateName || 'Candidate'}</div>
                        )}
                        {primary.email && <div className="text-xs text-gray-500 truncate">{primary.email}</div>}
                        {primary.phone && <div className="text-xs text-gray-500">{primary.phone}</div>}
                      </div>
                    </div>
                    <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            aria-label="Actions"
                            title="Actions"
                            className="p-2.5 bg-white rounded-lg hover:bg-gray-50 transition-all border border-gray-200"
                          >
                            <MoreVertical className="w-4 h-4 text-gray-600" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52 !rounded-lg !bg-white !py-1 !px-0 !shadow-xl">
                          {renderActionsMenuItems(primary)}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap">
                      {rows.length} Job {rows.length === 1 ? 'Version' : 'Versions'}
                    </span>
                    <div className="text-xs text-gray-500 text-right">
                      <div>{formatISTDate(primary.scoredDate)}</div>
                      <div className="text-gray-400">{formatISTTime(primary.scoredDate)}</div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleGroupExpanded(key)}
                    aria-label={isExpanded ? 'Collapse job history' : 'Expand job history'}
                    className={`mt-3 w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      isExpanded
                        ? 'border-brand-blue/40 bg-brand-blue/5 text-brand-blue'
                        : 'border-gray-200 text-gray-600 hover:border-brand-blue/30 hover:text-brand-blue'
                    }`}
                  >
                    <span>{isExpanded ? 'Hide job history' : 'View job history'}</span>
                    <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                  </button>

                  {isExpanded && (
                    <div className="mt-2 space-y-2">
                      {rows.map((row) => (
                        <div key={row.id} className="rounded-lg border border-gray-200 bg-gray-50/60 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-gray-800 truncate" title={row.jobTitle || undefined}>
                                {truncateJobTitle(row.jobTitle) || 'Untitled role'}
                              </div>
                              <div className="mt-1 flex items-center gap-2 flex-wrap">
                                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs border ${matchBadgeClass(row.matchStatus)}`}>
                                  {row.matchStatus}
                                </span>
                                <span className={`text-sm font-semibold ${MATCH_SCORE_TEXT_CLASS[normalizeMatchResult(row.matchStatus) ?? 'No Match']}`}>
                                  {formatOverallScore(row.overallRating10, row.scorePercentage)}
                                </span>
                              </div>
                              <div className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                                <Calendar className="w-3 h-3" />
                                <span>{formatISTDate(row.scoredDate)} <span className="text-gray-400">{formatISTTime(row.scoredDate)}</span></span>
                              </div>
                            </div>
                            <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    aria-label="Actions"
                                    title="Actions"
                                    className="p-2.5 bg-white rounded-lg hover:bg-gray-50 transition-all border border-gray-200"
                                  >
                                    <MoreVertical className="w-4 h-4 text-gray-600" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-52 !rounded-lg !bg-white !py-1 !px-0 !shadow-xl">
                                  {renderActionsMenuItems(row)}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                          {onViewCandidate && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); onViewCandidate(row); }}
                              icon={<Eye className="w-3.5 h-3.5" />}
                              className="mt-2 w-full"
                            >
                              Open Match
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {candidateGroups.length === 0 && (
              <ListEmptyState
                icon={Search}
                isNarrowed={search.isNarrowed}
                query={search.appliedQuery}
                entityLabel="candidate"
                emptyTitle="No scored candidates yet"
                emptyDescription="Upload and score candidates to see them here."
                onReset={search.reset}
              />
            )}
          </div>
        </div>
      ) : (
        <>
      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto tf-table-shell">
        <table className="w-full min-w-[1100px] table-auto">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-3 px-4 w-12 align-middle tf-sticky-col-left">
                <button onClick={handleSelectAll} className="p-1 hover:bg-gray-100 rounded">
                  {selectedResumes.length === filteredResumes.length && filteredResumes.length > 0 ? (
                    <CheckSquare className="w-4 h-4 text-gray-800" />
                  ) : (
                    <Square className="w-4 h-4 text-gray-400" />
                  )}
                </button>
              </th>
              {enabledColumns.map((col) => (
                <th key={col.id} className="text-left py-3 px-4 text-sm text-gray-600 whitespace-nowrap align-middle">
                  {col.label}
                </th>
              ))}
              <th className="text-left py-3 px-4 text-sm text-gray-600 whitespace-nowrap align-middle tf-sticky-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedResumes.map((resume, index) => {
              return (
              <tr
                key={resume.id}
                onClick={(e) => handleRowClick(resume.id, e)}
                className={`border-b border-gray-100 hover:bg-[var(--raw-fafbfc)] transition-colors cursor-pointer ${
                  index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                }`}
              >
                <td className="py-3 px-4 align-middle tf-sticky-col-left">
                  <button
                    onClick={() => handleSelectResume(resume.id)}
                    className="p-2.5 hover:bg-gray-200 rounded"
                  >
                    {selectedResumes.includes(resume.id) ? (
                      <CheckSquare className="w-4 h-4 text-gray-800" />
                    ) : (
                      <Square className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                </td>

                {enabledColumns.map((col) => renderResumeCell(col, resume))}

                {/* Actions Column */}
                <td className="py-3 px-4 align-middle whitespace-nowrap tf-sticky-col" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        aria-label="Actions"
                        title="Actions"
                        className="p-2.5 bg-white rounded-lg hover:bg-gray-50 transition-all"
                      >
                        <MoreVertical className="w-4 h-4 text-gray-600" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="w-52 !rounded-lg !bg-white !py-1 !px-0 !shadow-xl"
                    >
                      {renderActionsMenuItems(resume)}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>

        {filteredResumes.length === 0 && (
          <ListEmptyState
            icon={Search}
            isNarrowed={search.isNarrowed}
            query={search.appliedQuery}
            entityLabel="scored resume"
            emptyTitle="No Scored Resumes"
            emptyDescription="Score resumes against this job description to see the candidates here."
            onReset={search.reset}
            imageSrc="/scored-resumes-empty-state.webp"
            imageAlt="Scored resumes illustration"
            action={onScoreResumesFromEmptyState ? (
              <Button
                variant="primary"
                size="md"
                onClick={onScoreResumesFromEmptyState}
                disabled={scoreResumesDisabled}
                title={scoreResumesDisabled ? 'You do not have permission to score resumes' : undefined}
                icon={<ClipboardList className="w-4 h-4" />}
              >
                Score Resumes
              </Button>
            ) : undefined}
          />
        )}
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-4">
        {paginatedResumes.map((resume) => (
          <div
            key={resume.id}
            className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md hover:border-[var(--border-dark)] transition-all cursor-pointer"
            onClick={(e) => handleRowClick(resume.id, e)}
          >
            {/* Card Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <button
                  onClick={() => handleSelectResume(resume.id)}
                  className="p-1 hover:bg-gray-200 rounded mt-1 shrink-0"
                >
                  {selectedResumes.includes(resume.id) ? (
                    <CheckSquare className="w-5 h-5 text-gray-800" />
                  ) : (
                    <Square className="w-5 h-5 text-gray-400" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <h3 className="text-gray-900 mb-1 break-words">{resume.candidateName}</h3>
                  {/* Show job title in global view */}
                  {isGlobalView && resume.jobTitle && (
                    <div className="text-xs text-gray-500 mb-1 truncate">
                      Applied for: <span className="font-medium text-gray-700" title={resume.jobTitle || undefined}>{truncateJobTitle(resume.jobTitle)}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`inline-flex px-2 py-1 rounded-full text-xs border ${matchBadgeClass(resume.matchStatus)}`}>
                      {resume.matchStatus}
                    </span>
                    {/* Same three colours as the badge above, from the one palette in
                        lib/utils/matchStatus.ts - green / brand orange / red. Not a score
                        threshold: Exact and Partial share the 60-100 range and are told
                        apart by the Required average, so any cut-off on the number would
                        contradict the badge beside it. */}
                    <div className={`text-lg ${
                      MATCH_SCORE_TEXT_CLASS[normalizeMatchResult(resume.matchStatus) ?? 'No Match']
                    }`}>
                      {formatOverallScore(resume.overallRating10, resume.scorePercentage)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Card Content */}
            <div className="space-y-2 text-sm mb-3">
              {enabledColumns.find(c => c.id === 'email') && (
                <div className="flex items-start gap-2 text-gray-600 min-w-0">
                  <Mail className="w-4 h-4 mt-0.5 shrink-0" />
                  <span className="min-w-0 break-all">{resume.email}</span>
                </div>
              )}
              {enabledColumns.find(c => c.id === 'phone') && (
                <div className="flex items-start gap-2 text-gray-600">
                  <Phone className="w-4 h-4 mt-0.5 shrink-0" />
                  <div className="flex flex-col gap-0.5">
                    {(() => {
                      const numbers = splitPhoneNumbers(resume.phone, 2);
                      return numbers.length > 0
                        ? numbers.map((num, i) => <span key={i} className="whitespace-nowrap">{num}</span>)
                        : <span className="whitespace-nowrap">-</span>;
                    })()}
                  </div>
                </div>
              )}
              {enabledColumns.find(c => c.id === 'experience') && resume.experience && (
                <div className="text-gray-600">
                  <span className="text-gray-500">Experience:</span> {resume.experience}
                </div>
              )}
              {enabledColumns.find(c => c.id === 'education') && resume.education && (
                <div className="text-gray-600">
                  <span className="text-gray-500">Education:</span> {
                    typeof resume.education === 'string'
                      ? resume.education
                      : Array.isArray(resume.education) && resume.education.length > 0
                        ? (resume.education[0]?.degree || resume.education[0]?.institution || 'Education available')
                        : ''
                  }
                </div>
              )}
              {enabledColumns.find(c => c.id === 'scoredDate') && (
                <div className="text-gray-600">
                  <span className="text-gray-500">Scored by:</span> {resume.scoredBy}
                  <div className="flex items-center gap-1 mt-0.5">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{formatISTDate(resume.scoredDate)}{' '}<span className="text-gray-400">{formatISTTime(resume.scoredDate)}</span></span>
                  </div>
                </div>
              )}
            </div>

            {/* Card Actions */}
            <div className="space-y-2">
              {/* Invite Button - For Exact Match & Partial Match + assessment permission.
                  Same two blockers as the table row's Assessment entry: no
                  published assessment on this JD, or no units left. */}
              {(resume.matchStatus === 'Exact Match' || resume.matchStatus === 'Partial Match') && (
                <div className="relative group">
                  <Button
                    variant="primary"
                    size="md"
                    disabled={!canCreateAssessments || !canInviteAssessment || availableUnits === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!canCreateAssessments) {
                        toast.error('You do not have permission to invite candidates to an assessment');
                        return;
                      }
                      setInviteCandidate(resume);
                      setShowInviteModal(true);
                    }}
                    icon={<UserPlus className="w-4 h-4" />}
                    className="w-full"
                  >
                    Invite for Assessment
                  </Button>
                  {(!canCreateAssessments || !canInviteAssessment || availableUnits === 0) && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-30">
                      <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 whitespace-nowrap shadow-lg">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                          <span>
                            {!canCreateAssessments
                              ? 'You do not have permission to invite candidates to an assessment'
                              : !canInviteAssessment
                                ? 'No published assessment for this job yet'
                                : 'No assessment units available'}
                          </span>
                        </div>
                        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
                          <div className="border-4 border-transparent border-t-gray-900"></div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <Button
                variant="secondary"
                size="md"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!canDownloadScorecard) {
                    toast.error('You do not have permission to download the scorecard');
                    return;
                  }
                  handleDownloadScorecard(resume.id);
                }}
                disabled={downloadingId === resume.id}
                aria-disabled={!canDownloadScorecard}
                title={!canDownloadScorecard ? 'You do not have permission to download the scorecard' : undefined}
                className={`w-full ${!canDownloadScorecard ? 'opacity-50 cursor-not-allowed' : ''}`}
                icon={downloadingId === resume.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              >
                {downloadingId === resume.id ? 'Downloading...' : 'Download Scorecard'}
              </Button>

              {resume.resumeId && (
                <Button
                  variant="secondary"
                  size="md"
                  onClick={(e) => {
                    e.stopPropagation();
                    setViewResumeCandidate(resume);
                  }}
                  icon={<FileText className="w-4 h-4" />}
                  className="w-full"
                >
                  View Resume
                </Button>
              )}

              {resume.resumeId && (
                <Button
                  variant="secondary"
                  size="md"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!canShareResume) {
                      toast.error('You do not have permission to share resumes');
                      return;
                    }
                    openShareModal(resume);
                  }}
                  aria-disabled={!canShareResume}
                  title={!canShareResume ? 'You do not have permission to share resumes' : undefined}
                  icon={<Share2 className="w-4 h-4" />}
                  className={`w-full ${!canShareResume ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  Share Resume
                </Button>
              )}
            </div>
          </div>
        ))}

        {filteredResumes.length === 0 && (
          <ListEmptyState
            icon={Search}
            isNarrowed={search.isNarrowed}
            query={search.appliedQuery}
            entityLabel="scored resume"
            emptyTitle="No Scored Resumes"
            emptyDescription="Score resumes against this job description to see the candidates here."
            onReset={search.reset}
            imageSrc="/scored-resumes-empty-state.webp"
            imageAlt="Scored resumes illustration"
            action={onScoreResumesFromEmptyState ? (
              <Button
                variant="primary"
                size="md"
                onClick={onScoreResumesFromEmptyState}
                disabled={scoreResumesDisabled}
                title={scoreResumesDisabled ? 'You do not have permission to score resumes' : undefined}
                icon={<ClipboardList className="w-4 h-4" />}
              >
                Score Resumes
              </Button>
            ) : undefined}
          />
        )}
      </div>

        </>
      )}

      {/* Shared between the grouped and ungrouped renders above (only one is
          ever mounted at a time) — one control regardless of which is
          showing, or of viewport in the ungrouped case. */}
      <ListPagination
        currentPage={safeCurrentPage}
        itemsPerPage={itemsPerPage}
        totalItems={isGrouped ? candidateGroups.length : filteredResumes.length}
        onPageChange={setCurrentPage}
        onItemsPerPageChange={setItemsPerPage}
        itemLabel={isGrouped ? 'candidates' : 'scored resumes'}
      />

      {/* Column Customization Modal */}
      {showColumnModal && (
        <ColumnCustomizationModal
          columns={availableColumns}
          onClose={() => setShowColumnModal(false)}
          onApply={handleColumnApply}
        />
      )}

      {/* Invite to Assessment Modal — opens the shared ShareAssessmentModal
          used by the Assessment module (resolves the JD's assessment first).
          Uses the CLICKED ROW's own job (falling back to the table-level one
          for a single-job host, where every row already shares it) — the
          global cross-job list's rows each belong to a different job, and
          resolving against the table's own "global" placeholder job id
          instead of the real one meant this could never find a real
          assessment, so the candidate never even reached the share form. */}
      {showInviteModal && inviteCandidate && (
        <InviteShareModal
          candidate={inviteCandidate}
          jobId={inviteCandidate.jdId || jobId}
          jobTitle={inviteCandidate.jobTitle || jobTitle}
          onClose={() => setShowInviteModal(false)}
        />
      )}

      {/* Invite to AI Interview — self-contained counterpart to the Assessment
          modal above, for a row whose host didn't supply its own
          onInviteAIInterview: the shared dialog, scoped to the row's own job. */}
      <InviteToAIInterviewFlow
        open={!!aiInterviewInviteCandidate}
        onClose={() => setAiInterviewInviteCandidate(null)}
        jobId={aiInterviewInviteCandidate ? (aiInterviewInviteCandidate.jdId || (jobId && jobId !== 'global' ? jobId : undefined)) : undefined}
        candidates={aiInterviewInviteCandidate ? [{
          id: aiInterviewInviteCandidate.resumeId || aiInterviewInviteCandidate.id,
          name: aiInterviewInviteCandidate.candidateName || 'Unknown',
          email: aiInterviewInviteCandidate.email || undefined,
        }] : []}
        resumes={aiInterviewInviteCandidate ? [{
          id: aiInterviewInviteCandidate.resumeId || aiInterviewInviteCandidate.id,
          name: aiInterviewInviteCandidate.candidateName || 'Unknown',
          email: aiInterviewInviteCandidate.email,
          phone: aiInterviewInviteCandidate.phone,
        } as unknown as Resume] : undefined}
        onInvited={() => setAiInterviewInviteCandidate(null)}
      />

      {/* Share Resume — the same dialog the resume table and the resume page
          open: the attachment with an eye to read it, then recipient, subject
          and message. */}
      {shareCandidate && (
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
                  <X className="w-5 h-5" />
                </Button>
              </div>

              <div className="space-y-4">
                {/* Both files this dialog can send, side by side: the resume
                    itself and the scorecard for this job. */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Attachments</label>
                  <div className="flex flex-col sm:flex-row items-stretch gap-3">
                    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-4 h-4 text-brand-blue" />
                      </div>
                      <div className="min-w-0 flex-1">
                        {/* Until the resume record answers, the file's name is
                            not known — the candidate is, so lead with that. */}
                        <div className="text-sm font-medium text-gray-900 truncate" title={shareFile?.name}>
                          {shareFile ? shareFile.name : 'Loading resume file…'}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          Resume
                          {shareFile?.type && <> &middot; {shareFile.type}</>}
                          {shareFile?.sizeKb ? <> &middot; {Math.round(shareFile.sizeKb)} KB</> : null}
                        </div>
                      </div>
                      <Paperclip className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setIsSharePreviewOpen(true)}
                        className="flex-shrink-0 px-2"
                        aria-label={`View ${shareCandidate.candidateName}'s resume`}
                        title="View resume"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </div>

                    {/* The scorecard PDF, built on demand — same download
                        the row's ⋮ menu offers. */}
                    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-lg bg-brand-cyan/10 ring-1 ring-brand-cyan/15 flex items-center justify-center flex-shrink-0">
                        <Award className="w-4 h-4 text-brand-cyan" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div
                          className="text-sm font-medium text-gray-900 truncate"
                          title={`Scorecard - ${shareCandidate.candidateName}.pdf`}
                        >
                          Scorecard - {shareCandidate.candidateName}.pdf
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          Scorecard &middot; PDF
                          {shareCandidate.scorePercentage != null && <> &middot; {formatOverallScore(shareCandidate.overallRating10, shareCandidate.scorePercentage)}</>}
                        </div>
                      </div>
                      <Paperclip className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={handlePreviewScorecard}
                        disabled={loadingScorecardPreview}
                        className="flex-shrink-0 px-2"
                        aria-label={`View ${shareCandidate.candidateName}'s scorecard`}
                        title="View scorecard"
                      >
                        {loadingScorecardPreview ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                      </Button>
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
                  size="md"
                  onClick={handleSendShareEmail}
                  disabled={isSendingEmail || !shareEmail.trim()}
                  icon={isSendingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                >
                  {isSendingEmail ? 'Sending...' : 'Send Email'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* The attachment, read in place. Rendered after the share dialog so it
          sits above it — both are z-50. */}
      {isSharePreviewOpen && shareCandidate?.resumeId && (
        <ResumeTextPreviewModal
          resumeId={shareCandidate.resumeId}
          title={shareCandidate.candidateName}
          subtitle={shareFile?.name}
          onClose={() => setIsSharePreviewOpen(false)}
        />
      )}

      {/* "View Resume" from the Actions menu — same preview, opened directly. */}
      {viewResumeCandidate?.resumeId && (
        <ResumeTextPreviewModal
          resumeId={viewResumeCandidate.resumeId}
          title={viewResumeCandidate.candidateName}
          onClose={() => setViewResumeCandidate(null)}
        />
      )}

      {/* "View Score Table" from the Actions menu. */}
      {scoreTableCandidate && (
        <ScoreTableModal
          resume={scoreTableCandidate}
          jobId={jobId}
          jobCode={jobCode}
          jobTitle={scoreTableCandidate.jobTitle || jobTitle}
          onClose={() => setScoreTableCandidate(null)}
        />
      )}

      {/* The scorecard, read in place. z-[60] puts it over the share
          dialog, the same level the resume preview uses. */}
      {scorecardPreviewUrl && shareCandidate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[95vw] sm:max-w-2xl h-[90dvh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-gray-100 bg-gray-50 flex-shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-brand-blue flex items-center justify-center shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 flex-shrink-0">
                  <Eye className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-gray-900 tracking-tight truncate">Scorecard</h2>
                  <p className="text-sm text-gray-500 truncate">
                    {shareCandidate.candidateName}
                    {shareCandidate.scorePercentage != null && <> &middot; {formatOverallScore(shareCandidate.overallRating10, shareCandidate.scorePercentage)}</>}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    if (!canDownloadScorecard) {
                      toast.error('You do not have permission to download the scorecard');
                      return;
                    }
                    handleDownloadScorecard(shareCandidate.id);
                  }}
                  disabled={downloadingId === shareCandidate.id}
                  aria-disabled={!canDownloadScorecard}
                  title={!canDownloadScorecard ? 'You do not have permission to download the scorecard' : undefined}
                  className={!canDownloadScorecard ? 'opacity-50 cursor-not-allowed' : ''}
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
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <iframe src={scorecardPreviewUrl} title="Scorecard preview" className="w-full h-full" />
            </div>
          </div>
        </div>
      )}

      {/* Bulk Invite Modal */}
      {showBulkInviteModal && (
        <BulkInviteModal
          selectedResumes={selectedResumes.map(id => {
            const resume = resumes.find(r => r.id === id);
            return resume!;
          }).filter(Boolean)}
          jobId={jobId}
          jobTitle={jobTitle}
          onClose={() => setShowBulkInviteModal(false)}
          onSuccess={() => {
            setShowBulkInviteModal(false);
            // Clear selection after successful bulk invite
            if (onSelectAll) {
              onSelectAll([]);
            } else {
              setInternalSelectedResumes([]);
            }
          }}
        />
      )}

      {/* Export Format Selection Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-[95vw] sm:max-w-md max-h-[calc(100dvh-2rem)] flex flex-col">
            <div className="flex items-start justify-between gap-3 p-5 border-b border-gray-200 shrink-0">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <FileDown className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Export Scored Resumes</h3>
                  <p className="text-sm text-gray-500 mt-1 flex items-center gap-1.5">
                    {selectedResumes.length > 0
                      ? `${selectedResumes.length} selected records`
                      : `${filteredResumes.length} records`
                    }
                    <span className="w-1 h-1 rounded-full bg-blue-500" />
                    {exportColumns.length} columns
                  </p>
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowExportModal(false)}
                className="px-2 flex-shrink-0"
               aria-label="Close">
                <X className="w-5 h-5" />
              </Button>
            </div>

            <div className="p-5 overflow-y-auto flex-1">
              <p className="text-sm font-bold text-gray-900 mb-3">Choose export format</p>

              <div className="space-y-3">
                <button
                  onClick={() => setExportFormat('csv')}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                    exportFormat === 'csv'
                      ? 'border-blue-500 bg-blue-50/60'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="w-12 h-12 bg-success-subtle rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileText className="w-6 h-6 text-success" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-gray-900">CSV Format</div>
                    <div className="text-sm text-gray-500">Compatible with Excel, Google Sheets, and most spreadsheet apps.</div>
                  </div>
                  <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    exportFormat === 'csv' ? 'border-blue-600' : 'border-gray-300'
                  }`}>
                    {exportFormat === 'csv' && <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />}
                  </span>
                </button>

                <button
                  onClick={() => setExportFormat('xls')}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                    exportFormat === 'xls'
                      ? 'border-blue-500 bg-blue-50/60'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileSpreadsheet className="w-6 h-6 text-blue-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-gray-900">Excel Format (.xls)</div>
                    <div className="text-sm text-gray-500">Native Excel format with formatting and styling.</div>
                  </div>
                  <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    exportFormat === 'xls' ? 'border-blue-600' : 'border-gray-300'
                  }`}>
                    {exportFormat === 'xls' && <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />}
                  </span>
                </button>
              </div>

              <div className="mt-4 p-4 bg-blue-50/60 rounded-xl flex items-start gap-3">
                <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-gray-600">
                  <span className="block font-bold text-blue-700 mb-0.5">Columns included</span>
                  {exportColumns.map(c => c.label).join(', ')}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200 shrink-0">
              <Button
                variant="primary"
                size="md"
                onClick={() => (exportFormat === 'csv' ? exportToCSV() : exportToXLS())}
                icon={<Download className="w-4 h-4" />}
              >
                Export
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Bulk Invite Modal Component
interface BulkInviteModalProps {
  selectedResumes: ScoredResume[];
  jobId: string;
  jobTitle: string;
  onClose: () => void;
  onSuccess: () => void;
}

function BulkInviteModal({ selectedResumes, jobId, jobTitle, onClose, onSuccess }: BulkInviteModalProps) {
  const [assessments, setAssessments] = useState<any[]>([]);
  const [selectedAssessment, setSelectedAssessment] = useState<string>('');
  const [isLoadingAssessments, setIsLoadingAssessments] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expiryDays, setExpiryDays] = useState(7);
  const [showNoMatchWarning, setShowNoMatchWarning] = useState(false);

  // Quota stats
  const [quotaStats, setQuotaStats] = useState<{
    total_quota: number; consumed: number; pending: number; available: number;
  } | null>(null);

  // Separate valid and invalid candidates
  const validCandidates = selectedResumes.filter(r =>
    r.matchStatus === 'Exact Match' || r.matchStatus === 'Partial Match'
  );
  const noMatchCandidates = selectedResumes.filter(r =>
    r.matchStatus === 'No Match' || (!r.matchStatus || r.matchStatus === '')
  );

  useEffect(() => {
    fetchAssessments();
    // Show warning if there are no match candidates
    if (noMatchCandidates.length > 0) {
      setShowNoMatchWarning(true);
    }
    // Fetch quota stats
    assessmentService.getInvitationStats()
      .then(stats => setQuotaStats(stats))
      .catch(() => setQuotaStats(null));
  }, [jobId]);

  const fetchAssessments = async () => {
    setIsLoadingAssessments(true);
    try {
      const response = await assessmentService.list({ jd_id: jobId });
      const revokedIds = getLocallyRevokedAssessmentIds();
      // Only show PUBLISHED assessments (not draft, not archived) and
      // exclude any whose invites the recruiter has revoked — once revoked
      // an assessment is sealed against further invites (duplicate to V2
      // for a fresh round).
      const activeAssessments = response.items.filter(
        (a: any) =>
          a.status === 'published' &&
          !a.is_archived &&
          !isAssessmentRevoked(a, revokedIds)
      );
      setAssessments(activeAssessments);
      // Auto-select if only one assessment
      if (activeAssessments.length === 1) {
        setSelectedAssessment(activeAssessments[0].id);
      }
    } catch (error) {
      console.error('Failed to fetch assessments:', error);
      toast.error('Failed to load assessments');
    } finally {
      setIsLoadingAssessments(false);
    }
  };

  const handleSendBulkInvitations = async () => {
    if (!selectedAssessment) {
      toast.error('Please select an assessment first');
      return;
    }

    // Only send to valid candidates (Exact Match or Partial Match)
    if (validCandidates.length === 0) {
      toast.error('No valid candidates to invite. Only "Exact Match" and "Partial Match" candidates can be invited.');
      return;
    }

    // Quota check
    if (quotaStats !== null && quotaStats.total_quota < 999999 && quotaStats.available < validCandidates.length) {
      const pendingMsg = quotaStats.pending > 0
        ? ` ${quotaStats.pending} unit(s) held by pending invitations will be released when links expire.`
        : '';
      toast.error(`Insufficient quota. ${quotaStats.available} unit(s) available, need ${validCandidates.length}.${pendingMsg}`);
      return;
    }

    setIsSubmitting(true);
    try {
      const candidates = validCandidates.map(resume => ({
        candidate_name: resume.candidateName,
        candidate_email: resume.email,
        resume_id: resume.resumeId,
        // This is the table's own Bulk Invite button, gated on scoring:invite
        // (canCreateAssessments above) — unlike the per-row Invite dropdown,
        // this call goes straight to the API rather than through
        // InviteShareModal/ShareAssessmentModal, so invite_source was never
        // set here. Without it, the backend has no way to tell this apart
        // from any other assessment invite and can't enforce scoring:invite.
        invite_source: 'Resume Scoring',
      }));

      await assessmentService.bulkInvite(selectedAssessment, {
        candidates,
        expiry_days: expiryDays,
      });

      const message = noMatchCandidates.length > 0
        ? `Successfully sent ${validCandidates.length} invitation${validCandidates.length > 1 ? 's' : ''}! ${noMatchCandidates.length} "No Match" candidate${noMatchCandidates.length > 1 ? 's were' : ' was'} excluded.`
        : `Successfully sent ${validCandidates.length} invitation${validCandidates.length > 1 ? 's' : ''}!`;

      toast.success(message);
      onSuccess();
    } catch (error: any) {
      console.error('Failed to send bulk invitations:', error);
      const errorMessage = error.message || 'Failed to send invitations. Please try again.';

      // Check for quota error
      if (errorMessage.includes('quota') || errorMessage.includes('units')) {
        toast.error('Insufficient assessment units available');
      } else if (errorMessage.includes('409') || errorMessage.includes('duplicate')) {
        toast.error('Some candidates have already been invited to this assessment');
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedAssessmentData = assessments.find(a => a.id === selectedAssessment);

  if (isLoadingAssessments) {
    // Structure-matched skeleton mirroring the loaded Bulk Invite modal it
    // replaces: same modal shell + gradient header (icon tile + title/subtitle),
    // then a body of the quota banner, the assessment-select field and the
    // expiry field, and the footer action buttons.
    return (
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-[95vw] sm:max-w-2xl w-full max-h-[90dvh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="bg-white border-b border-gray-100 px-6 py-5 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-lg" />
              <div className="space-y-1.5">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
            <Skeleton className="w-9 h-9 rounded-lg" />
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Quota banner */}
            <Skeleton className="h-16 w-full rounded-lg" />
            {/* Assessment selection field */}
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-3 w-56" />
            </div>
            {/* Expiry field */}
            <div className="space-y-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>
          </div>

          {/* Footer actions */}
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3 shrink-0">
            <Skeleton className="h-10 w-24 rounded-lg" />
            <Skeleton className="h-10 w-36 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (assessments.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-[95vw] sm:max-w-md w-full max-h-[90dvh] flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
            <h3 className="text-gray-900 text-lg font-medium">No Assessment Found</h3>
            <Button
              variant="secondary"
              size="sm"
              onClick={onClose}
              className="px-2"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Body */}
          <div className="px-6 py-6 overflow-y-auto flex-1">
            <div className="text-center">
              <div className="w-16 h-16 bg-warning-subtle rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-10 h-10 text-warning" />
              </div>
              <p className="text-gray-600 text-sm">
                There is no published assessment for this job description yet.
                Please create and publish an assessment first.
              </p>
            </div>
          </div>

        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-[95vw] sm:max-w-2xl w-full max-h-[90dvh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <Send className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Bulk Invite Candidates</h2>
              <p className="text-blue-100 text-sm">{jobTitle}</p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={onClose}
            className="px-2"
           aria-label="Close">
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Quota Banner */}
          {quotaStats !== null && (() => {
            const isUnlimited = quotaStats.total_quota >= 999999;
            const isInsufficient = !isUnlimited && quotaStats.available === 0;
            const isLow = !isUnlimited && !isInsufficient && quotaStats.available <= 3;
            if (isUnlimited) return null;
            return (
              <div className={`px-4 py-3 rounded-lg border text-sm flex items-start gap-2 ${
                isInsufficient ? 'bg-destructive-subtle border-destructive-line text-destructive-strong'
                : isLow ? 'bg-warning-subtle border-warning-line text-warning-strong'
                : 'bg-blue-50 border-blue-200 text-blue-800'
              }`}>
                {isInsufficient
                  ? <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  : <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                }
                <div className="flex-1">
                  <div className="font-medium mb-0.5">
                    {isInsufficient ? 'No assessment units available'
                      : isLow ? `Only ${quotaStats.available} unit(s) available`
                      : `${quotaStats.available} assessment unit(s) available`}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs opacity-80">
                    <span>Total: {quotaStats.total_quota}</span>
                    <span>Consumed: {quotaStats.consumed}</span>
                    {quotaStats.pending > 0 && <span>Pending: {quotaStats.pending}</span>}
                  </div>
                  {quotaStats.pending > 0 && (
                    <p className="text-xs mt-1 opacity-80">
                      {quotaStats.pending} unit(s) held by active invitations — released when links expire.
                    </p>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Assessment Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Assessment *</label>
            <select
              value={selectedAssessment}
              onChange={(e) => setSelectedAssessment(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">-- Choose an assessment --</option>
              {assessments.map((assessment) => {
                // Strip any "- Version N" baked into the stored title and
                // append the live version from `assessment.version` so the
                // dropdown always reflects the assessment's real version.
                const parsed = parseAssessmentTitle(assessment.title || '');
                const displayVersion = typeof assessment.version === 'number'
                  ? assessment.version
                  : parsed.version;
                const base = parsed.cleanTitle || assessment.short_id || 'Untitled assessment';
                const versionSuffix = displayVersion ? ` — Version ${displayVersion}` : '';
                const shortIdSuffix = assessment.short_id ? ` (${assessment.short_id})` : '';
                return (
                  <option key={assessment.id} value={assessment.id}>
                    {base}{versionSuffix}{shortIdSuffix} • {assessment.duration_minutes} min
                  </option>
                );
              })}
            </select>
            <p className="text-xs text-gray-500 mt-2">
              {assessments.length} assessment{assessments.length !== 1 ? 's' : ''} available for this job
            </p>
          </div>

          {/* Expiry Settings */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Invitation Expiry</label>
            <select
              value={expiryDays}
              onChange={(e) => setExpiryDays(Number(e.target.value))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value={1}>1 day</option>
              <option value={3}>3 days</option>
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
            </select>
          </div>

          {/* No Match Warning */}
          {showNoMatchWarning && noMatchCandidates.length > 0 && (
            <div className="bg-gray-50 border-2 border-gray-300 rounded-lg p-4">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="w-5 h-5 text-gray-600" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-900 mb-1">
                    {noMatchCandidates.length} Candidate{noMatchCandidates.length > 1 ? 's' : ''} Cannot Be Invited
                  </h4>
                  <p className="text-sm text-gray-700 mb-3">
                    Only candidates with "Exact Match" or "Partial Match" status can be invited to assessments.
                    The following {noMatchCandidates.length > 1 ? 'candidates have' : 'candidate has'} "No Match" status and will be excluded:
                  </p>
                  <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2 max-h-32 overflow-y-auto">
                    {noMatchCandidates.map((resume) => (
                      <div key={resume.id} className="flex items-center gap-2 text-sm">
                        <X className="w-4 h-4 text-gray-500 flex-shrink-0" />
                        <span className="font-medium text-gray-900">{resume.candidateName}</span>
                        <span className="text-gray-500">({resume.email})</span>
                        <span className="ml-auto px-2 py-0.5 text-xs bg-gray-200 text-gray-700 rounded-full">No Match</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                <p className="text-sm text-gray-600">
                  <strong>{validCandidates.length}</strong> valid candidate{validCandidates.length !== 1 ? 's' : ''} will receive invitations
                </p>
                <button
                  onClick={() => setShowNoMatchWarning(false)}
                  className="text-sm text-gray-600 hover:text-gray-800 underline"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Candidates List - Valid Only */}
          {validCandidates.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Candidates to Invite ({validCandidates.length})
              </label>
              <div className="max-h-60 overflow-y-auto border border-success-line rounded-lg bg-success-subtle">
                {validCandidates.map((resume, index) => (
                  <div
                    key={resume.id}
                    className={`p-3 flex items-center gap-3 ${
                      index < validCandidates.length - 1 ? 'border-b border-success-line' : ''
                    }`}
                  >
                    <div className="w-8 h-8 bg-success-subtle rounded-full flex items-center justify-center text-success font-medium text-sm">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 text-sm">{resume.candidateName}</div>
                      <div className="text-xs text-gray-600">{resume.email}</div>
                    </div>
                    {resume.matchStatus && (
                      <div
                        /* Was a two-branch test, so No Match wore the Partial
                           colour here. The shared map answers all three. */
                        className={`px-2 py-1 text-xs rounded-full border ${matchBadgeClass(resume.matchStatus)}`}
                      >
                        {resume.matchStatus}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No Valid Candidates Warning */}
          {validCandidates.length === 0 && (
            <div className="bg-gray-50 border-2 border-gray-300 rounded-lg p-6 text-center">
              <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-3">
                <AlertCircle className="w-8 h-8 text-gray-600" />
              </div>
              <h4 className="font-semibold text-gray-900 mb-2">No Valid Candidates Selected</h4>
              <p className="text-sm text-gray-600">
                All selected candidates have "No Match" status and cannot be invited to assessments.
                Please select candidates with "Exact Match" or "Partial Match" status.
              </p>
            </div>
          )}

          {/* Preview */}
          {selectedAssessment && validCandidates.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Mail className="w-5 h-5 text-blue-600" />
                <span className="font-medium text-blue-800">Ready to Send</span>
              </div>
              <div className="text-sm text-blue-700 space-y-1">
                <p><strong>Assessment:</strong> {selectedAssessmentData?.title}</p>
                <p><strong>Duration:</strong> {selectedAssessmentData?.duration_minutes} minutes</p>
                <p><strong>Recipients:</strong> {validCandidates.length} candidate(s)</p>
                {noMatchCandidates.length > 0 && (
                  <p className="text-gray-600">
                    <strong>Excluded:</strong> {noMatchCandidates.length} "No Match" candidate(s)
                  </p>
                )}
                <p><strong>Expires in:</strong> {expiryDays} day{expiryDays > 1 ? 's' : ''}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between shrink-0">
          <div className="text-sm">
            {validCandidates.length > 0 ? (
              (() => {
                const insufficient = quotaStats !== null && quotaStats.total_quota < 999999 && quotaStats.available < validCandidates.length;
                return (
                  <span className={insufficient ? 'text-destructive font-medium' : 'text-gray-600'}>
                    <strong className={insufficient ? 'text-destructive' : 'text-success'}>{validCandidates.length}</strong> invitation{validCandidates.length !== 1 ? 's' : ''} will be sent
                    {insufficient && ` — only ${quotaStats!.available} unit(s) available`}
                    {!insufficient && noMatchCandidates.length > 0 && (
                      <span className="ml-2 text-gray-500">({noMatchCandidates.length} excluded)</span>
                    )}
                  </span>
                );
              })()
            ) : (
              <span className="text-gray-500">No valid candidates to invite</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              size="md"
              onClick={handleSendBulkInvitations}
              disabled={!selectedAssessment || isSubmitting || validCandidates.length === 0 || (quotaStats !== null && quotaStats.available === 0 && quotaStats.total_quota < 999999)}
              icon={isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            >
              {isSubmitting ? 'Sending...' : 'Send Invitations'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
