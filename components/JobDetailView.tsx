'use client'

import { ArrowLeft, ChevronLeft, ChevronRight, MapPin, Calendar, Users, Briefcase, X, CheckCircle, CheckCircle2, CheckSquare, Square, MoreVertical, Sparkles, UserPlus, ChevronDown, Upload, UserCheck, Phone, Building2, Clock, TrendingUp, Star, User as UserIcon, Ban, Archive, ArchiveRestore, History, Edit, XCircle, RefreshCw, Trash2, Eye, Download, Brain, Lock, BarChart, BarChart3, MessageSquare, FileText, Search, Paperclip, Loader2, AlertCircle, Info, ArrowRight, Zap, ClipboardList, Video, FileDown } from 'lucide-react';
import { Fragment, useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Job } from '@/lib/types/types';
import type { User, Tenant } from '@/lib/types/tenant';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { jdService, JDLineageVersion, JDLocation, JDStatusEvent, JDUsageStatus, JDVersion } from '@/lib/services/jdService';
import { splitPhoneNumbers } from '@/lib/utils/phoneUtils';
import { formatLocationGroups, formatJobVersionLabel, formatLastUpdated } from '@/lib/utils/jobOpeningDisplay';
import SkillsList from '@/components/ui/SkillsList';
import { Tooltip } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import ListToolbar from '@/components/ui/list-toolbar';
import ToolbarSelectAll from '@/components/ui/toolbar-select-all';
import ExtractedDataSummary from '@/components/jobs/ExtractedDataSummary';
import ToolbarFilterSelect from '@/components/ui/toolbar-filter-select';
import { SortByControl } from '@/components/ui/select-all-menu';
import ListPagination from '@/components/ListPagination';
import TabEmptyState from '@/components/ui/tab-empty-state';
import ListViewToggle, { ListDisplayMode } from '@/components/ui/list-view-toggle';
import GridCardSelect, { gridCardSelectedClass } from '@/components/ui/grid-card-select';
import AITalentMatchConfirmModal from './AITalentMatchConfirmModal';
import ResumeUploadModal from './ResumeUploadModal';
import ResumeVersionsModal from './ResumeVersionsModal';
import { resumeService } from '@/lib/services/resumeService';
import ResumeScoring from './ResumeScoring';
import JobApplicants from './JobApplicants';
import ScoredResumesTable, {
  useScoringActionPermissions,
} from './ScoredResumesTable';
import VersionInviteDialog from './talent-match-invite/VersionInviteDialog';
import type { InviteCandidate, InviteCandidateSource, InviteKind } from './talent-match-invite/inviteVersions';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import InviteToAssessmentModal from './InviteToAssessmentModal';
import ShareAssessmentModal from './ShareAssessmentModal';
import SelectSourceModal from './SelectSourceModal';
import AssessmentResults from './AssessmentResults';
import JDVersionHistoryModal from './JDVersionHistoryModal';
import ResumeDetailView from './ResumeDetailView';
import CandidateScoringDetailPage from './CandidateScoringDetailPage';
import CandidateResultDetails from './CandidateResultDetails';
import { Resume } from '@/lib/types/types';
import { scoringService, normalizeScoringStatus } from '@/lib/services/scoringService';
import { dispatchUnitsConsumed } from '@/lib/services/api';
import { assessmentService } from '@/lib/services/assessmentService';
import { listAllAssessments, MAX_ASSESSMENT_VERSIONS } from '@/lib/utils/jobAssessmentHierarchy';
import { loadAssessmentVersions, loadInterviewVersions, createBlockedReason, nextVersionNumber } from '@/components/talent-match-invite/inviteVersions';
import { MAX_INTERVIEW_VERSIONS } from '@/lib/utils/aiInterviewVersion';
import { aiInterviewConfigureHref, markUnsavedVersion } from '@/lib/utils/aiInterviewDraftResume';
import { useGlobalDialog } from '@/components/providers/GlobalDialogProvider';
import DraftAssessmentExistsModal, { type ExistingDraftAssessment } from '@/components/assessments/DraftAssessmentExistsModal';
import { parseAssessmentTitle, isAssessmentRevoked, getLocallyRevokedAssessmentIds } from '@/lib/utils/assessmentUtils';
import { aiMatchService, AIMatchResultItem, AIMatchSessionResponse, MatchedCandidate } from '@/lib/services/aiMatchService';
import AITalentMatchProgressPanel from './AITalentMatchProgressPanel';
import TrackInvitesModal from './TrackInvitesModal';
import AIInterviewTrackInvitesModal from './AIInterviewTrackInvitesModal';
import InviteToAIInterviewFlow from './InviteToAIInterviewFlow';
import AIInterviewVersionHistoryModal from './ai-interview/AIInterviewVersionHistoryModal';
import AssessmentVersionHistoryModal from './assessments/AssessmentVersionHistoryModal';
import type { Resume as ResumeRecord } from '@/lib/types/types';
import ApplyToJobModal from '@/components/ApplyToJobModal';
import AIInterviewResults from './ai-interview/AIInterviewResults';
import CandidateResultsView from './ai-interview/CandidateResultsView';
import { aiInterviewService, AIInterviewResponse, AIInterviewVersionHistoryItem } from '@/lib/services/aiInterviewService';
import { formatJobExperienceBadge } from '@/lib/utils/jobExperience';
import { formatSalaryRange } from '@/lib/utils/salary';
import { toast } from 'sonner';
import { usePlanFeature, usePlanFeatures, usePlanLock } from '@/lib/hooks/usePlanFeature';
import { PLAN_LOCKED_MESSAGE } from '@/lib/types/planFeatures';
import { useAuth } from '@/components/providers/AuthProvider';
import { useScoringProgress } from '@/contexts/ScoringProgressContext';
import { formatIST, formatISTDate } from '@/lib/utils/dateUtils';
import { exportData, type ExportColumn } from '@/lib/utils/exportUtils';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import ExportFormatModal from '@/components/ExportFormatModal';
import PageBreadcrumb, { BreadcrumbCrumb } from '@/components/PageBreadcrumb';
import RecordPager from '@/components/RecordPager';
import { criterionScoringLabel, requirementBadge } from '@/lib/utils/scoringCriteria';
import { Skeleton } from '@/components/ui/skeleton';
import { TABLE_EMPTY_PANEL_CLASS } from '@/lib/constants/tableEmptyPanel';
import { formatCandidateFirstName } from '@/lib/utils/candidateNameDisplay';
import { toOneDecimalScore } from '@/lib/utils/score';
import NameAvatar from '@/components/ui/name-avatar';

// Legacy aliases — both now use the centralized IST formatter
const formatToIST = formatIST;
const formatISTDateTime = formatIST;
type ScoredResumesMatchFilter = 'all' | 'Exact Match' | 'Partial Match' | 'No Match';

/* The detail-page content tabs (Overview / AI Talent Match Results / Scored
   Resumes / Assessments / AI Interview) are standard underline tabs: text +
   icon with a 2px bottom border that colours brand-blue on the active tab and
   is transparent otherwise. `-mb-px` overlaps the tab-row's own bottom hairline
   so the active underline sits ON that track. The disabled branch (plan-locked
   / no-results) is muted with no underline. Colours/typography come from the
   design system (brand-blue active, gray idle), matching the Job Openings UI. */
const detailTabClass = (active: boolean, disabled = false): string => {
  const base =
    'relative inline-flex items-center gap-2 px-3 sm:px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors';
  if (disabled)
    return `${base} border-transparent text-gray-400 dark:text-slate-600 cursor-not-allowed`;
  return active
    ? `${base} border-brand-blue text-brand-blue`
    : `${base} border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200 hover:border-gray-300 dark:hover:border-slate-600`;
};

/* The count chip inside a tab. Tinted brand-blue on the active tab, neutral
   grey when idle — legible against the plain (now non-pill) tab background. */
const detailTabBadge = (active: boolean): string =>
  `px-1.5 py-0.5 rounded-full text-xs font-medium ${
    active
      ? 'bg-brand-blue/10 text-brand-blue'
      : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400'
  }`;

/**
 * Quick Actions palette.
 *
 * One accent per group so the three sections read apart at a glance, drawn
 * only from the brand tokens in globals.css — no stray greens or purples. The
 * class strings are spelled out rather than composed (`bg-brand-${x}`) because
 * Tailwind only ships classes it can find literally in the source.
 */
const QUICK_ACTION_ACCENTS = {
  blue: {
    badge: 'bg-brand-blue',
    icon: 'text-brand-blue',
    tile: 'hover:border-brand-blue/40 hover:bg-brand-blue/5 hover:shadow-md hover:shadow-brand-blue/10',
    row: 'hover:bg-brand-blue/5',
    labelHover: 'group-hover:text-brand-blue',
  },
  cyan: {
    badge: 'bg-brand-cyan',
    icon: 'text-brand-cyan',
    tile: 'hover:border-brand-cyan/40 hover:bg-brand-cyan/5 hover:shadow-md hover:shadow-brand-cyan/10',
    row: 'hover:bg-brand-cyan/5',
    labelHover: 'group-hover:text-brand-cyan',
  },
  orange: {
    badge: 'bg-brand-orange',
    icon: 'text-brand-orange',
    tile: 'hover:border-brand-orange/40 hover:bg-brand-orange/5 hover:shadow-md hover:shadow-brand-orange/10',
    row: 'hover:bg-brand-orange/5',
    labelHover: 'group-hover:text-brand-orange',
  },
} as const;

type QuickActionAccent = keyof typeof QUICK_ACTION_ACCENTS;

/** Shared timing for the accordion — heading margin, chevron and panel all move
 *  together, so they have to share one curve and duration. */
const QUICK_ACTION_EASE = 'duration-300 ease-in-out';

/** Hover timing. Quicker than the accordion so pointer feedback stays snappy,
 *  but the same curve so the card reads as one piece of motion. Every action —
 *  View JD History, AI Talent Match, Score Resumes and the Create / Invite /
 *  Track / Result tiles — moves on this. */
const QUICK_ACTION_HOVER_EASE = 'duration-200 ease-in-out motion-reduce:transition-none';

/**
 * Group heading: a filled accent disc carrying the group's icon, then the title.
 *
 * Pass `onToggle` to turn the whole heading into the accordion trigger for the
 * section below it — the chevron flips and the bottom margin drops away while
 * collapsed so the three groups stack tightly.
 */
function QuickActionHeader({ icon, title, accent, open, onToggle, controls, titleAction }: {
  icon: React.ReactNode;
  title: string;
  accent: QuickActionAccent;
  open?: boolean;
  onToggle?: () => void;
  /** id of the panel this heading opens, for aria-controls. */
  controls?: string;
  /** A control right after the title (e.g. a history icon). Kept outside the
   *  toggle button — a button can't nest another. */
  titleAction?: React.ReactNode;
}) {
  const disc = (
    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0 ${QUICK_ACTION_ACCENTS[accent].badge}`}>
      {icon}
    </span>
  );

  if (!onToggle) {
    return (
      <div className="flex items-center gap-2.5 mb-3">
        {disc}
        <h3 className="text-base font-semibold text-gray-900 dark:text-slate-50">{title}</h3>
      </div>
    );
  }

  const chevron = (
    // Rotation follows the panel's timing; the nudge down on hover is the
    // faster hover curve, so both read as intended.
    <ChevronDown
      className={`w-4 h-4 ml-auto shrink-0 text-gray-400 dark:text-slate-500 transition-transform ${QUICK_ACTION_EASE} motion-reduce:transition-none group-hover:translate-y-0.5 ${open ? 'rotate-180' : ''}`}
    />
  );
  const toggleClass = `group flex items-center gap-2.5 text-left rounded-lg cursor-pointer transition-opacity ${QUICK_ACTION_HOVER_EASE} hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40`;

  return (
    // The margin is transitioned along with the panel below, so the heading
    // slides down to meet the group divider instead of snapping into place.
    <h3 className={`transition-[margin] ${QUICK_ACTION_EASE} motion-reduce:transition-none ${open ? 'mb-3' : 'mb-0'}`}>
      {titleAction ? (
        /* With a title action the row is split — a button can't nest another:
           disc + title toggle, the action right after the title, then the
           chevron as a second toggle filling the rest of the row. */
        <div className="flex items-center gap-2">
          <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={controls}
            title={open ? `Collapse ${title}` : `Expand ${title}`} className={toggleClass}>
            {disc}
            <span className="text-base font-semibold text-gray-900 dark:text-slate-50">{title}</span>
          </button>
          {titleAction}
          <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={controls}
            aria-label={open ? `Collapse ${title}` : `Expand ${title}`} className={`${toggleClass} flex-1 justify-end self-stretch`}>
            {chevron}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={controls}
          title={open ? `Collapse ${title}` : `Expand ${title}`}
          className={`${toggleClass} w-full`}
        >
          {disc}
          <span className="text-base font-semibold text-gray-900 dark:text-slate-50">{title}</span>
          {chevron}
        </button>
      )}
    </h3>
  );
}

/**
 * Expand/collapse animation for a Quick Actions group.
 *
 * Animates `max-height` off the measured content height rather than using the
 * `grid-rows-[0fr→1fr]` trick, because the rows and tiles inside carry hover
 * tooltips that hang below them: any height animation has to clip, and that
 * clipping must be lifted again once the panel settles or the tooltips get cut
 * off. So overflow is hidden only while a transition is in flight or the panel
 * is shut, and the height is released back to `none` when it finishes — which
 * also keeps the panel correct if its content grows later (a permission or
 * feature flag resolving, say).
 */
function QuickActionPanel({ id, open, className = '', children }: {
  id: string;
  open: boolean;
  /** Classes for the inner content box (grid/list layout of the group). */
  className?: string;
  children: React.ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = useState<string>(open ? 'none' : '0px');
  const [animating, setAnimating] = useState(false);
  const mounted = useRef(false);

  useEffect(() => {
    // Skip the first pass so an already-open group doesn't animate on load.
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const el = contentRef.current;
    if (!el) return;

    const contentHeight = `${el.scrollHeight}px`;
    setAnimating(true);

    if (open) {
      // Currently 0px — go to the measured height, then release it on arrival.
      setMaxHeight(contentHeight);
      // Backstop for the release: with `prefers-reduced-motion` the transition
      // is off, so no transitionend ever arrives and the panel would stay
      // pinned to the height it had when it opened.
      const settle = setTimeout(() => {
        setAnimating(false);
        setMaxHeight('none');
      }, 400);
      return () => clearTimeout(settle);
    } else {
      // Pin the height it is actually at ('none' can't be transitioned from),
      // then collapse on the next frame so the browser has a start value.
      setMaxHeight(contentHeight);
      const frame = requestAnimationFrame(() => setMaxHeight('0px'));
      return () => cancelAnimationFrame(frame);
    }
  }, [open]);

  return (
    <div
      id={id}
      style={{ maxHeight }}
      onTransitionEnd={(e) => {
        if (e.propertyName !== 'max-height' || e.target !== e.currentTarget) return;
        setAnimating(false);
        if (open) setMaxHeight('none');
      }}
      className={`transition-[max-height,opacity] ${QUICK_ACTION_EASE} motion-reduce:transition-none ${
        open ? 'opacity-100' : 'opacity-0'
      } ${open && !animating ? '' : 'overflow-hidden'}`}
      // Keeps collapsed actions out of the tab order and off screen readers.
      inert={!open || undefined}
    >
      <div ref={contentRef} className={className}>
        {children}
      </div>
    </div>
  );
}

/**
 * The hover tooltip that explains why an action is unavailable.
 *
 * Wraps instead of running off-screen: `whitespace-nowrap` forced every reason
 * onto one line, so longer ones (e.g. "Publish the draft before inviting
 * candidates.") shot past the sidebar and overlapped whatever sat to the right.
 * `w-max` keeps short reasons compact while the viewport-aware max-width caps
 * long ones on small screens.
 */
function QuickActionTooltip({ text, align = 'left' }: { text: string; align?: 'left' | 'center' }) {
  return (
    <div className={`absolute top-full mt-1.5 z-40 w-max max-w-[min(14rem,calc(100vw-2rem))] px-2.5 py-1.5 bg-gray-900 dark:bg-slate-700 text-white text-2xs font-medium leading-snug rounded-md shadow-lg ring-1 ring-black/10 opacity-0 group-hover:opacity-100 transition-opacity ${QUICK_ACTION_HOVER_EASE} pointer-events-none whitespace-normal break-words ${
      align === 'center' ? 'left-1/2 -translate-x-1/2 text-center' : 'left-0'
    }`}>
      {text}
    </div>
  );
}

interface QuickActionProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  disabledTooltip?: string;
  /** Shows a spinner in place of the icon and blocks re-clicks while the action
   *  resolves what it needs to open (e.g. fetching a config). */
  loading?: boolean;
  accent?: QuickActionAccent;
  /** The tenant's plan lacks this feature: disabled, with PLAN_LOCKED_MESSAGE
   *  as the tooltip (overrides `disabled`/`disabledTooltip`). */
  planLocked?: boolean;
}

/**
 * A full-width action, for the ungrouped list at the top of the card. Rows sit
 * inside one bordered box and are separated by hairlines, so the group reads as
 * a single list rather than three floating buttons.
 */
function QuickActionRow({
  icon,
  label,
  onClick,
  disabled: disabledProp = false,
  disabledTooltip: disabledTooltipProp,
  loading = false,
  accent = 'blue',
  planLocked = false,
}: QuickActionProps) {
  const disabled = planLocked || disabledProp;
  const disabledTooltip = planLocked ? PLAN_LOCKED_MESSAGE : disabledTooltipProp;
  return (
    <div className="relative group">
      <button
        onClick={onClick}
        disabled={disabled || loading}
        // Native `title` only while enabled. When disabled the styled tooltip is
        // the one and only tooltip — setting `title` too made the browser draw a
        // second, plain one on top of it.
        title={disabled ? undefined : label}
        className={`w-full px-3 py-2.5 flex items-center gap-2.5 text-left text-sm font-medium transition-colors ${QUICK_ACTION_HOVER_EASE} ${
          disabled
            ? 'text-gray-400 dark:text-slate-500 cursor-not-allowed'
            : `text-gray-800 dark:text-slate-200 cursor-pointer ${QUICK_ACTION_ACCENTS[accent].row}`
        }`}
      >
        {/* The icon nudges along with the chevron so the whole row leans into
            the hover rather than only its right edge. */}
        <span
          className={`shrink-0 transition-transform ${QUICK_ACTION_HOVER_EASE} ${
            disabled ? 'text-gray-300 dark:text-slate-600' : `${QUICK_ACTION_ACCENTS[accent].icon} group-hover:translate-x-0.5`
          }`}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
        </span>
        <span className={`flex-1 min-w-0 truncate transition-transform ${QUICK_ACTION_HOVER_EASE} ${disabled ? '' : 'group-hover:translate-x-0.5'}`}>{label}</span>
        {disabled
          ? <Lock className="w-3 h-3 shrink-0" />
          : <ChevronRight className={`w-4 h-4 shrink-0 text-gray-400 dark:text-slate-500 transition-transform ${QUICK_ACTION_HOVER_EASE} group-hover:translate-x-0.5`} />}
      </button>

      {disabled && disabledTooltip && <QuickActionTooltip text={disabledTooltip} />}
    </div>
  );
}

/**
 * A compact square action, for the four-up grids under Assessment and AI
 * Interview. Icon over label so four fit across the sidebar column without the
 * labels truncating.
 */
function QuickActionTile({
  icon,
  label,
  onClick,
  disabled: disabledProp = false,
  disabledTooltip: disabledTooltipProp,
  loading = false,
  accent = 'blue',
  planLocked = false,
}: QuickActionProps) {
  const disabled = planLocked || disabledProp;
  const disabledTooltip = planLocked ? PLAN_LOCKED_MESSAGE : disabledTooltipProp;
  const colors = QUICK_ACTION_ACCENTS[accent];
  return (
    <div className="relative group h-full">
      <button
        onClick={onClick}
        disabled={disabled || loading}
        title={disabled ? undefined : label}
        // Colour, shadow and the lift all animate together, so the tile rises
        // and settles on one curve instead of the border snapping ahead of it.
        // h-full: a tile whose label wraps (Create / Send …) keeps its row even.
        className={`w-full h-full px-1 py-2.5 rounded-lg border flex flex-col items-center justify-center gap-1.5 transition-[color,background-color,border-color,box-shadow,transform] ${QUICK_ACTION_HOVER_EASE} ${
          disabled
            ? 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 cursor-not-allowed'
            : `border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer hover:-translate-y-0.5 active:translate-y-0 ${colors.tile}`
        }`}
      >
        <span
          className={`shrink-0 transition-transform ${QUICK_ACTION_HOVER_EASE} ${
            disabled ? 'text-gray-300 dark:text-slate-600' : `${colors.icon} group-hover:scale-110`
          }`}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
        </span>
        <span className={`text-2xs font-medium leading-tight text-center transition-colors ${QUICK_ACTION_HOVER_EASE} ${
          disabled ? 'text-gray-400 dark:text-slate-500' : `text-gray-700 dark:text-slate-300 ${colors.labelHover}`
        }`}>
          {label}
        </span>
      </button>

      {disabled && disabledTooltip && <QuickActionTooltip text={disabledTooltip} align="center" />}
    </div>
  );
}

// Extended Job interface with additional fields
interface ExtendedJob extends Job {
  niceToHaveSkills?: string[];
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  compensationType?: string;
  creationStage?: string;
  hasScoredResumes?: boolean;
  hasAiMatchResults?: boolean;
  rawDescription?: string;
  mustHaveComments?: string[];
  niceToHaveComments?: string[];
  education?: string;
  // Scoring configuration, surfaced in the Extracted Data Summary below. These
  // decide which criteria Resume Scoring treats as Essential (the 60% block)
  // rather than Preferred, whether an over-qualified candidate is penalised, and
  // whether Job Hopping is scored at all.
  experienceMandatory?: boolean;
  educationMandatory?: boolean;
  industryMandatory?: boolean;
  locationMandatory?: boolean;
  allowOverqualified?: boolean | null;
  jobHoppingEnabled?: boolean | null;
  // JD13: Usage status for edit/republish logic
  usageStatus?: JDUsageStatus;
  // Full per-location detail (city/state/country/radius_km) - see
  // ExtractedDataSummary's `locations` prop, which renders every saved location
  // instead of the single joined `location` string.
  locations?: JDLocation[];
}

/**
 * Whether a draft AI interview has actually reached step 4 (Preview & Publish).
 *
 * The wizard runs Select JD → Configure → Clusters → Preview & Publish, and it
 * is the Clusters step that persists the clusters into `special_instructions`
 * on its way out. So clusters on the record mean the recruiter got past step 3;
 * no clusters mean they stopped in Configure or Clusters and there is nothing
 * publishable yet — the publish endpoint rejects exactly that case.
 *
 * Reads the full config (the compact list rows don't carry
 * `special_instructions`), so callers must pass a record fetched by id.
 */
function aiDraftReachedFinalStep(config: any): boolean {
  if (!config?.special_instructions) return false;
  try {
    const parsed = JSON.parse(config.special_instructions);
    const mth = Array.isArray(parsed?.mth_clusters) ? parsed.mth_clusters : [];
    const nth = Array.isArray(parsed?.nth_clusters) ? parsed.nth_clusters : [];
    return mth.length > 0 || nth.length > 0;
  } catch {
    // Older drafts stored plain-text instructions — no clusters recorded, so
    // the flow was never finished.
    return false;
  }
}

/**
 * Whether a draft assessment is finished enough to publish — the assessment
 * flow's equivalent of `aiDraftReachedFinalStep`.
 *
 * That flow runs Select JD → Configure → Preview, and Publish lives on
 * Configure, gated there by exactly these rules: the timed split (Technical +
 * Coding) must total 100%, every enabled section must carry topics, and an
 * enabled HR section must have questions picked from the bank. A draft can be
 * saved before all of that holds — auto-save on leaving Configure writes one —
 * so the prompt has to re-check rather than assume.
 */
function assessmentDraftReadyToPublish(assessment: any): boolean {
  if (!assessment) return false;

  const hasTopics = (topics: unknown) => Array.isArray(topics) && topics.length > 0;

  if (assessment.technical_enabled && !hasTopics(assessment.technical_topics)) return false;
  if (assessment.coding_enabled && !hasTopics(assessment.coding_topics)) return false;
  // HR draws on the Question Bank and isn't timed, so it needs picked questions
  // but takes no part in the split below.
  if (assessment.hr_enabled && !hasTopics(assessment.hr_topics)) return false;

  const timedSplit =
    (assessment.technical_enabled ? Number(assessment.technical_percentage) || 0 : 0) +
    (assessment.coding_enabled ? Number(assessment.coding_percentage) || 0 : 0);

  return timedSplit === 100;
}

interface JobDetailViewProps {
  job: ExtendedJob;
  onBack: () => void;
  initialTab?: 'overview' | 'scored-resumes' | 'assessment-results' | 'ai-talent-match' | 'ai-interview-results';
  initialAction?: 'ai-talent-match' | 'score-resumes' | 'invite-assessment' | 'assessment-status' | 'create-ai-interview' | 'invite-ai-interview' | 'ai-interview-status';
  onEdit?: (job: Job) => void;
  /**
   * Render Edit as disabled rather than clickable, with `editDisabledReason` as
   * its hover tooltip. Set by the host that knows the JD may not be edited at
   * all — currently only the Job Details page, and only for a JD that is an
   * earlier version of its lineage. Left unset everywhere else, which keeps the
   * default behaviour: Edit stays clickable and the host explains any refusal
   * after the click.
   */
  editDisabled?: boolean;
  /** Why Edit is disabled — shown on hover. Required for it to read as anything. */
  editDisabledReason?: string;
  /**
   * RBAC: the viewer lacks the permission for Edit / Disable+Re-enable /
   * Archive. The control stays VISIBLE, greyed out with a hover tooltip and a
   * no-op click — permission-gated controls are never hidden.
   */
  editLocked?: boolean;
  disableLocked?: boolean;
  archiveLocked?: boolean;
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
  breadcrumbItems?: BreadcrumbCrumb[];
  prevId?: string | null;
  nextId?: string | null;
  currentIndex?: number;
  totalCount?: number;
}

/**
 * The id a scored-resume row is addressed by. The API has shipped both spellings
 * over time, so every lookup goes through this rather than picking one and
 * silently missing the rows that use the other.
 */
const scoredResumeId = (row: any): string | null => row?.resumeId || row?.resume_id || null;

/* The header's icon-only actions share one shape, so the three read as a set
   rather than as three buttons that happen to sit together. `w-9 h-9` gives a
   36px hit target on the same visual line as the 40px pills beside them; only
   the hover accent differs per action. */
const JOB_ICON_ACTION_BASE =
  'w-9 h-9 flex items-center justify-center rounded-lg border transition-all flex-shrink-0 bg-white dark:bg-slate-900 border-gray-300 dark:border-slate-700';

/* Each action's colour is STATIC — carried by the idle icon, not revealed on
   hover. With the captions gone the colour is half of what identifies the
   button, so hiding it until the pointer arrives left three identical grey
   squares to choose between.
   Hover now only deepens the same hue, which is what a hover should do:
   confirm the target, not introduce it.

   The three hues are the ones this app already uses for these actions — blue
   for edit, the red `Ban` of the job list's Disable row, and the shared
   `--menu-icon-archive` token — rather than a palette invented here. */
const JOB_ICON_ACTION_EDIT =
  'text-brand-blue hover:bg-brand-blue/10 hover:border-brand-blue/40';
const JOB_ICON_ACTION_DISABLE =
  'text-destructive hover:bg-destructive-subtle hover:border-destructive-line';
const JOB_ICON_ACTION_ARCHIVE =
  'text-menu-icon-archive hover:bg-brand-orange/10 hover:border-brand-orange/40';

/**
 * A scored-resume row, filled out for `CandidateScoringDetailPage`.
 *
 * Extracted because three places open that view — clicking a row, the
 * Previous/Next pager inside it, and the URL restore below — and two of them
 * were carrying their own copy of this fallback list. A candidate restored from
 * the URL has to arrive in exactly the shape a clicked one does, or the page
 * renders with holes where a click would have filled them.
 */
const toCandidateDetail = (row: any) => ({
  ...row,
  candidateName: row.candidateName || 'Unknown',
  email: row.email || '',
  phone: row.phone || '',
  matchStatus: row.matchStatus || 'No Match',
  scorePercentage: row.scorePercentage || 0,
  scoredDate: row.scoredDate || new Date().toISOString(),
  scoredBy: row.scoredBy || 'System',
  matchedSkills: row.matchedSkills || row.technicalSkills || row.skills || [],
  missingSkills: row.missingSkills || [],
});

export default function JobDetailView({ job, onBack, onEdit, editDisabled = false, editDisabledReason, editLocked = false, disableLocked = false, archiveLocked = false, resumes = [], onScoreResumes, onNavigateToAITalentMatch, onDisable, onEnable, onArchive, onUnarchive, onDelete, onViewAssessmentResult, onRepublish, isTenantAdmin = false, user, tenant, breadcrumbItems, initialTab, initialAction, prevId, nextId, currentIndex, totalCount }: JobDetailViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { available: aiTalentMatchAvailable } = usePlanFeature('ai_talent_match');
  const { hasPlanFeature } = usePlanFeatures();
  // Plan-gated controls stay VISIBLE but disabled (hover: PLAN_LOCKED_MESSAGE)
  // instead of being hidden — see usePlanLock. False while plan features load.
  const { isPlanLocked } = usePlanLock();
  const aiMatchPlanLocked = isPlanLocked('ai_talent_match');
  const scoringPlanLocked = isPlanLocked('resume_scoring');
  const assessmentPlanLocked = isPlanLocked('assessment');
  const aiInterviewPlanLocked = isPlanLocked('ai_interview');
  const { startScoringJob, updateItemStatus } = useScoringProgress();

  // ---- Read-only label helpers for the Extracted Data Summary dropdown ----
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

  const mustHaveSkills = job.skills || [];
  const niceToHaveSkills = job.niceToHaveSkills || [];
  const mustHaveComments = job.mustHaveComments || [];
  const niceToHaveComments = job.niceToHaveComments || [];

  /**
   * The Required/Preferred line under a criterion tile in the Extracted Data
   * Summary. Mirrors the wording the recruiter saw on the Step 3 review, so the
   * published JD reads back the same way it was configured.
   *
   * "Required" means Resume Scoring treats the criterion as Essential: it shares
   * the 60% block, and a rating below 6 on it fails the whole Essential section.
   * "Preferred" criteria share the 40% block and never fail a candidate on their own.
   */
  const requirementLabel = requirementBadge;
  /* The breadcrumb still pins at the top, but the tab bar below it no longer
     sticks — the toolbar lives inside it now and must scroll naturally with the
     page (matching the Job Openings master, whose toolbar doesn't pin either).
     That removed the measured top-offset the pinned bar used to need.
     `breadcrumbBarRef` is still handed to PageBreadcrumb for its own layout. */
  const breadcrumbBarRef = useRef<HTMLElement | null>(null);

  const jobBreadcrumbItems = breadcrumbItems ?? [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Job Descriptions', href: '/recruitment/job-openings' },
    { label: job.title || 'Job Details' },
  ];
  const hasAnyExtractedData =
    mustHaveSkills.length > 0 || niceToHaveSkills.length > 0 ||
    mustHaveComments.length > 0 || niceToHaveComments.length > 0 ||
    !!job.experience || !!job.industry_type ||
    !!job.employmentType || !!job.workMode;

  const handleEdit = () => {
    if (onEdit) {
      onEdit(job);
    }
  };
  const [showAddApplicantsMenu, setShowAddApplicantsMenu] = useState(false);
  // Quick Actions accordion. The three groups collapse independently (not
  // one-at-a-time) so a recruiter can keep, say, Assessment and AI Interview
  // both in view; all start open so nothing that used to be visible is hidden.
  const [openActionGroups, setOpenActionGroups] = useState({
    actions: true,
    assessment: true,
    aiInterview: true,
  });
  const toggleActionGroup = (group: keyof typeof openActionGroups) =>
    setOpenActionGroups(prev => ({ ...prev, [group]: !prev[group] }));
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showScoringView, setShowScoringView] = useState(false);
  const [showApplicantsView, setShowApplicantsView] = useState(false);
  const [uploadedResumes, setUploadedResumes] = useState<any[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  const [showInviteToAssessmentModal, setShowInviteToAssessmentModal] = useState(false);
  // ShareAssessmentModal (used by the assessment-side flow) is reused here for
  // deep-linked assessment sharing. We need
  // the assessment(s) loaded before we can mount it.
  const [showShareAssessmentModal, setShowShareAssessmentModal] = useState(false);
  const [shareAssessments, setShareAssessments] = useState<any[]>([]);
  const [isLoadingShareAssessments, setIsLoadingShareAssessments] = useState(false);
  // Picker shown when the JD has more than one published assessment — user
  // chooses which one(s) to invite candidates to before the share modal opens.
  // True while the Create action resolves whether this JD already has an
  // assessment, so the button shows a spinner instead of feeling unresponsive.
  const [resolvingAssessmentTarget, setResolvingAssessmentTarget] = useState(false);
  const dialog = useGlobalDialog();
  /* An unpublished assessment version found by Create - the Assessments page's
     "Draft already exists" popup, asking for it to be published first. */
  const [draftAssessmentConflict, setDraftAssessmentConflict] = useState<{
    draft: ExistingDraftAssessment & { jd_id?: string };
    jobVersion: number;
  } | null>(null);
  // Set when Create finds only an unpublished draft — drives the in-place
  // publish prompt below instead of navigating to a half-finished details page.
  const [draftAssessment, setDraftAssessment] = useState<any>(null);
  const [publishingDraft, setPublishingDraft] = useState(false);
  // Whether this JD has any assessment at all, draft included. Distinguishes
  // "none created" from "created but not published" so the gates below can name
  // the actual blocker. False while still loading.
  const [hasAnyAssessment, setHasAnyAssessment] = useState(false);
  /* Has the lookup behind `hasPublishedAssessment` actually come back yet?
     That flag is `false` both when nothing is published and when nothing has
     been asked, and the Create gate has to tell those apart — otherwise a job
     with a published assessment shows an enabled Create for the first moment
     of every page load. Set once the fetch settles, success or failure. */
  const [assessmentExistenceChecked, setAssessmentExistenceChecked] = useState(false);
  // Whether one of them is actually PUBLISHED. This is what Send Invite needs —
  // a draft has nothing to invite candidates to, and clicking through would only
  // bounce them back with "publish it first". False while still loading.
  const [hasPublishedAssessment, setHasPublishedAssessment] = useState(false);
  /* How many assessment versions THIS JOB VERSION holds (this JD row only,
     archived included) - what Create's MAX_ASSESSMENT_VERSIONS cap reads, from
     the same count the click re-runs. Null until it lands for the version on
     screen; `assessmentCountJdId` says which version a count belongs to, so a
     late reply for the version just left can never set this one's state. */
  const [assessmentVersionCount, setAssessmentVersionCount] = useState<number | null>(null);
  const assessmentCountJdId = useRef<string | null>(null);
  // Same pair for AI Interview.
  const [resolvingAIInterviewTarget, setResolvingAIInterviewTarget] = useState(false);
  const [draftAIInterview, setDraftAIInterview] = useState<any>(null);
  const [publishingAIDraft, setPublishingAIDraft] = useState(false);
  // Whether this JD has any AI interview at all (live or draft). False while
  // still loading.
  const [hasAnyAIInterview, setHasAnyAIInterview] = useState(false);
  /** The AI-interview twin of `assessmentExistenceChecked`. */
  const [aiInterviewExistenceChecked, setAiInterviewExistenceChecked] = useState(false);
  /* How many AI interview versions this job version holds (archived
     included), read by Create — the twin of `assessmentVersionCount`. Null
     until Create has looked; the click re-reads it every time regardless. */
  const [aiInterviewVersionCount, setAiInterviewVersionCount] = useState<number | null>(null);
  const [showAssessmentPicker, setShowAssessmentPicker] = useState(false);
  const [pickerAssessments, setPickerAssessments] = useState<any[]>([]);
  const [pickerSelectedIds, setPickerSelectedIds] = useState<string[]>([]);

  /* Candidates the share step opens pre-filled with — the AI Talent Match
     tab's Invite to Assessment hands its ticked candidates over; the header's
     Send Invite passes none and the recruiter adds them in the modal. */
  const [shareAssessmentCandidates, setShareAssessmentCandidates] = useState<
    { id: string; name: string; email: string; phone?: string; source?: 'database'; resumeId?: string }[] | null
  >(null);

  // Open the share flow with a list of assessments already chosen.
  const openShareWithAssessments = (items: any[], candidates: typeof shareAssessmentCandidates = null) => {
    setShareAssessmentCandidates(candidates);
    setShareAssessments(items);
    setShowShareAssessmentModal(true);
  };

  const handleOpenShareAssessment = async () => {
    if (isLoadingShareAssessments) return;
    setIsLoadingShareAssessments(true);
    try {
      // Fetch every assessment for this JD, not just published ones. Only
      // published are invitable, but knowing what else is there is what lets the
      // failure message name the actual blocker — "still a draft" and "none
      // created" are different problems with different next steps, and one
      // generic "no invitable assessment" sentence described neither.
      const resp = await assessmentService.list({ jd_id: job.id, page_size: 100 });
      const all: any[] = resp?.items || [];
      const statusOf = (a: any) => String(a?.status || '').toLowerCase();
      const revokedIds = getLocallyRevokedAssessmentIds();

      const published = all.filter(a => ['published', 'active'].includes(statusOf(a)));
      // Exclude any assessment whose invites the recruiter has revoked.
      // Backend flag wins; locally-revoked IDs from sessionStorage are
      // the fallback for tabs where the backend flag isn't yet returned.
      const items = published.filter(a => !isAssessmentRevoked(a, revokedIds));

      if (items.length === 0) {
        if (published.length > 0) {
          // Published, but every one has had its invites revoked.
          toast.error(
            'Every published assessment for this job has had its invites revoked. Duplicate one to start a fresh invite round.',
            { duration: 6000 }
          );
        } else if (all.some(a => statusOf(a) === 'draft')) {
          toast.error(
            'This job’s assessment is still a draft. Publish it before inviting candidates.',
            { duration: 6000 }
          );
        } else {
          toast.error('No assessment has been created for this job yet. Use Create to add one.');
        }
        return;
      }

      // Straight to "Share Assessment via Email", matching the AI Interview
      // Send Invite action which resolves the JD's live config and opens its
      // share modal in one step — no intermediate dialog.
      //
      // NOTE: when the JD has several published assessments, every one of them
      // is included (first as the modal's primary, rest as additionalAssessments)
      // and each invited candidate receives an invite for ALL of them. The modal
      // lists them ("Invitations for N assessments") but has no per-assessment
      // selection, so this is send-all, not choose-one.
      openShareWithAssessments(items);
    } catch (err) {
      console.error('Failed to load assessments for JD:', err);
      toast.error('Could not load assessments. Please try again.');
    } finally {
      setIsLoadingShareAssessments(false);
    }
  };

  const handleConfirmAssessmentPick = () => {
    if (pickerSelectedIds.length === 0) {
      toast.error('Please select at least one assessment.');
      return;
    }
    const chosen = pickerAssessments.filter(a => pickerSelectedIds.includes(a.id));
    setShowAssessmentPicker(false);
    openShareWithAssessments(chosen);
  };
  const [showSelectSourceModal, setShowSelectSourceModal] = useState(false);
  const [showJDHistory, setShowJDHistory] = useState(false);
  const [showVersionMenu, setShowVersionMenu] = useState(false);
  const [versionMenuLoading, setVersionMenuLoading] = useState(false);
  const [versionMenuLoaded, setVersionMenuLoaded] = useState(false);
  const [versionMenuError, setVersionMenuError] = useState<string | null>(null);
  const [lineageVersions, setLineageVersions] = useState<JDLineageVersion[]>([]);
  const versionMenuRef = useRef<HTMLDivElement>(null);
  const sortedLineageVersions = useMemo(
    () => [...lineageVersions].sort((a, b) => (b.version_number ?? 1) - (a.version_number ?? 1)),
    [lineageVersions]
  );

  // Scored resumes state
  const [scoredResumes, setScoredResumes] = useState<any[]>([]);
  const [loadingScoredResumes, setLoadingScoredResumes] = useState(false);
  /* `loadingScoredResumes` starts false and only goes true once the fetch is
     under way, so it cannot tell "not started" from "finished". The URL restore
     below needs that difference — an empty `scoredResumes` means "still coming"
     before the first fetch settles and "there are none" after it. */
  const [scoredResumesLoaded, setScoredResumesLoaded] = useState(false);
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
  // Asked before the panel mounts. A match run scans the whole resume database
  // and consumes units, and the panel starts the moment it renders — so there is
  // no way back out once it is up. Every entry point routes through here.
  const [showAIMatchConfirm, setShowAIMatchConfirm] = useState(false);

  // Assessment results state
  const [assessmentResults, setAssessmentResults] = useState<any[]>([]);
  const [assessmentInviteCount, setAssessmentInviteCount] = useState(0);
  // The Assessments Results tab's badge AND enabled state: candidates who
  // finished — Completed or Terminated (the API's 'abandoned'). Invited or
  // in-progress candidates have no result yet.
  const [assessmentFinishedCount, setAssessmentFinishedCount] = useState(0);
  /* The Assessments Results tab's BADGE: the table's own record count while
     the tab is open (reported by AssessmentResults — every page, its current
     filters), else the rows that table lists with no filter: this job's
     result rows it shows as Completed or Terminated (see
     `isListedAssessmentResult`). Null until the first fetch settles, so the
     badge shows a placeholder instead of a provisional 0. */
  const [assessmentResultTotal, setAssessmentResultTotal] = useState<number | null>(null);
  const [assessmentTableTotal, setAssessmentTableTotal] = useState<number | null>(null);
  const [loadingAssessmentResults, setLoadingAssessmentResults] = useState(false);
  /* Bumped by every fetchAssessmentResults run, so an older run (e.g. the
     mount load) cannot overwrite the counts of a newer one (after a send). */
  const assessmentResultsSeqRef = useRef(0);
  const [viewingAssessmentResult, setViewingAssessmentResult] = useState<any | null>(null);
  /* The Assessment objects themselves (not the per-candidate results above) —
     kept for Recent Activity's "Assessment Created (Vn)" entry, which needs
     each assessment's own created_by_name/created_at/version rather than a
     candidate's result. */
  const [jdAssessments, setJdAssessments] = useState<any[]>([]);

  // AI Talent Match state
  const [aiMatchSessions, setAiMatchSessions] = useState<AIMatchSessionResponse[]>([]);
  const [aiMatchCandidates, setAiMatchCandidates] = useState<MatchedCandidate[]>([]);
  // AI Talent Match tab's Score Selected / Score All: reviewed in the shared
  // Candidates Selected dialog (this job fixed) before the batch starts.
  const [aiMatchScoreReview, setAiMatchScoreReview] = useState<MatchedCandidate[] | null>(null);
  const aiMatchScoringStartingRef = useRef(false);
  /* Starts true, not false: the mount effect below always fetches this (when
     the plan has the feature) before the first paint settles, so a `false`
     default let the tab badge and empty state read "0 / No AI Talent Match
     Results" for one frame before flipping to the real count — exactly the
     flash the count is supposed to never show. */
  const [loadingAiMatch, setLoadingAiMatch] = useState(true);
  /* DISTINCT candidates matched to this JD, counted server-side. Held apart from
     `aiMatchCandidates.length` because the list is fetched with a limit: if a JD ever
     exceeds it, the badge must still say how many there are. Null until the fetch
     answers — see `aiMatchBadgeCount` below. */
  const [aiMatchTotal, setAiMatchTotal] = useState<number | null>(null);

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

  // jd:invite / jd:add_applicants have no typed field on the Permission interface,
  // so they're read via the raw permission code instead of hasPermission() above.
  const { hasPermissionCode } = useAuth();
  const isAdminUser = isTenantAdmin || user?.role === 'tenant_admin';

  // ✅ PERMISSIONS: Get permissions for Quick Actions (using camelCase)
  const permissions = {
    canCreateAssessments: hasPermission('canCreateAssessments'),
    canUpdateAssessments: hasPermission('canUpdateAssessments'),
    // Run AI Talent Match from a JD needs the main (AI Talent Match → Run) AND
    // this JD entry point (jd:ai_match). Gates every AI-match trigger on this page.
    canRunAiMatch: hasPermission('canRunAiMatch') && (isAdminUser || hasPermissionCode('jd:ai_match')),
    canReadJD: hasPermission('canReadJD'),
    canViewAssessments: hasPermission('canViewAssessments'),
    canUploadResumes: hasPermission('canUploadResumes'),
    // Scoring from a JD needs Resume Scoring → Score Resume AND the JD's own
    // "Score Resume" (jd:add_applicants). Gates every scoring entry point on this
    // page: quick action, ?action=score-resumes deep link, Scored Resumes toolbar.
    canRunScoring: hasPermission('canRunScoring') && (isAdminUser || hasPermissionCode('jd:add_applicants')),
    canCreateAIInterviews: hasPermission('canCreateAIInterviews'),
    canShareAIInterviews: hasPermission('canInviteAIInterviews'),
    canViewAIInterviews: hasPermission('canViewAIInterviews') || hasPermission('canRunAiInterviews') || hasPermission('canInviteAIInterviews'),
  };

  // Job Description → "Invite to Assessment" / "Invite to AI Interview" are
  // separate permissions; each target also needs its module's own Invite
  // (the server checks assessments:invite / ai_interview:invite on send).
  const canInviteJdAssessment =
    isTenantAdmin || (hasPermissionCode('jd:invite_assessment') && hasPermissionCode('assessments:invite'));
  const canInviteJdAIInterview =
    isTenantAdmin || (hasPermissionCode('jd:invite_ai_interview') && hasPermissionCode('ai_interview:invite'));

  // ✅ PERMISSIONS: Get feature flags for Quick Actions
  const features = {
    assessment: isFeatureEnabled('assessment'),
    ai_talent_match: isFeatureEnabled('ai_talent_match'),
    ai_interview: isFeatureEnabled('ai_interview'),
    resume_upload: isFeatureEnabled('resume_upload'),
  };

  // Track Invites modal state
  const [showTrackInvitesModal, setShowTrackInvitesModal] = useState(false);
  // AI Interview invite tracking — opens in place on this page, against the
  // job's live config.
  const [trackAIInterviewConfig, setTrackAIInterviewConfig] = useState<AIInterviewResponse | null>(null);
  const [resolvingTrackInvitesConfig, setResolvingTrackInvitesConfig] = useState(false);

  // The Invite to AI Interview dialog, opened in place so the recruiter never
  // leaves this page: null = closed, [] = opened with nobody preset (the header
  // / quick-action Invite — candidates are added in the share step), a seed =
  // a Scored Resumes row's candidate, listed first.
  const [aiInviteSeed, setAiInviteSeed] = useState<{ name: string; email: string; resumeId?: string }[] | null>(null);
  /* The AI Talent Match tab's "Create / Send Assessment | AI Interview"
     popups (VersionInviteDialog — one per type): null = closed; else which
     popup and the candidates ticked in the table. */
  const [inviteDialog, setInviteDialog] = useState<{ kind: InviteKind; candidates: InviteCandidate[]; preselect?: boolean } | null>(null);
  /** Opens the popup with a tab's ticked candidates, each tagged with that tab
   *  as its source (the popup's group headings). */
  const openInviteDialog = (kind: InviteKind, candidates: InviteCandidate[], source: InviteCandidateSource) =>
    setInviteDialog({ kind, candidates: candidates.map((c) => ({ ...c, source })) });
  // AI Interview Version History dialog (history icon on the AI Interview heading).
  const [showAIVersionHistory, setShowAIVersionHistory] = useState(false);
  // Assessment Version History dialog (history icon on the Assessment heading).
  const [showAssessmentVersionHistory, setShowAssessmentVersionHistory] = useState(false);
  // AI Interview Results tab. The config is fetched lazily on first open rather
  // than on mount — resolving it pages through the tenant's configs, which
  // isn't worth doing on every Job Details load for a tab most visits skip.
  const [aiInterviewConfig, setAiInterviewConfig] = useState<AIInterviewResponse | null>(null);
  const [aiInterviewCount, setAiInterviewCount] = useState(0);
  // The Result tab's badge AND its enabled state: candidates who finished —
  // Completed or Terminated. aiInterviewCount above counts every invitation
  // (it gates Track and the quick actions); an invited or still-in-progress
  // candidate has no result yet.
  const [aiInterviewResultCount, setAiInterviewResultCount] = useState(0);
  /* The AI Interview Result tab's BADGE, the assessment rule: the table's
     record count while the tab is open, else what the table lists with no
     filter — In Progress, Completed and Terminated sessions of the live
     interview (AIInterviewResults' RESULT_STATUSES), not every invitation.
     Null until the config load settles, so the badge shows a placeholder. */
  const [aiInterviewResultTotal, setAiInterviewResultTotal] = useState<number | null>(null);
  const [aiInterviewTableTotal, setAiInterviewTableTotal] = useState<number | null>(null);
  const [loadingAIInterviewConfig, setLoadingAIInterviewConfig] = useState(false);
  const [aiInterviewConfigError, setAiInterviewConfigError] = useState<string | null>(null);
  const aiInterviewConfigFetchedRef = useRef(false);
  /* Bumped by every loadAIInterviewConfig run, so an older run (e.g. the mount
     load) cannot overwrite the counts of a newer one (after a send/publish). */
  const aiInterviewConfigSeqRef = useRef(0);
  /* The interview config's own edit/publish version — for Recent Activity's
     "AI Interview Created (Vn)" entry. `AIInterviewResponse` itself carries no
     version number (only `jd_current_version`, which is the linked JD's
     version, not the interview's own), so this is its own small fetch,
     mirroring the JD-version-history one above. */
  const [aiInterviewVersionHistory, setAiInterviewVersionHistory] = useState<AIInterviewVersionHistoryItem[]>([]);

  /* `aiInterviewConfig` comes from findLiveConfigForJd, which only matches
     published/in-use configs — so its presence IS "there is something to invite
     candidates to". A draft leaves it null, which is what we want: the AI
     Interview Send Invite gate mirrors the assessment one exactly.

     Declared here, alongside the state it reads, because it gates more than the
     section's own button now: the Scored Resumes row menus and the Candidate
     View both take it (with `hasPublishedAssessment`) as their invite gate, and
     the Candidate View is rendered from an early return above the tabs. */
  const hasLiveAIInterview = !!aiInterviewConfig;

  /* Is there anything on this JD to invite a candidate TO?
     One answer per side, shared by every Invite on the page: the Assessment /
     AI Interview sections' own Send Invite buttons, each Scored Resumes row's
     Invite menu, and the Candidate View opened from that table. Whatever
     silences the section's button — nothing published yet, the tenant switch
     off, the JD disabled — silences the row menus with it, so the table can
     never offer an invite the section above refuses. */
  const canInviteToAssessment =
    hasPublishedAssessment && features.assessment && job.status !== 'Disabled';
  const canInviteToAIInterview =
    hasLiveAIInterview && features.ai_interview && job.status !== 'Disabled';

  /* CREATE GATE, one answer per side, read by every Create on the page (the
     section toolbars, the tab empty states and the Quick Action tiles) so no
     two of them can disagree. Once a version is published, Create makes the
     NEXT version (a duplicate of the latest) until the version cap; the
     paragraphs below describe the original one-per-job rule's reasoning,
     which still holds for the draft prompt.

     PUBLISHED, NOT MERELY CREATED. A draft leaves Create live on purpose: on
     a draft the button does not mint a second record, it opens the "Draft …
     for this job" prompt and hands the recruiter back into the flow they left
     — and that prompt has no other entry point on this page, so gating it on
     the draft would strand the draft here. What must never happen is a SECOND
     record once one is live, and that is exactly what these two read.

     THE RECORD DECIDES, not the click. `hasPublishedAssessment` is set from
     the status the API returns on `assessmentService.list({ jd_id: job.id })`
     ('published' / 'active'), and `hasLiveAIInterview` from
     `findLiveConfigForJd`, which matches only published-and-beyond configs.
     Both run on mount against this JD version's own id, so the gate is
     re-derived from the backend on every mount: it survives a reload, it
     survives navigating away and back, and a draft that is published
     elsewhere disables Create here as soon as the next load lands. Nothing
     here remembers that a create happened in this session.

     Both handlers still re-query on the click — that is the backstop for the
     deep-link path (`?action=create-ai-interview`) and for the window between
     a stale tab rendering and the fetch landing — so this gate is the honest
     label on the button, not the only thing enforcing the rule. */
  /* Create makes the NEXT version once one is live — on both sides — so a
     published assessment / AI interview no longer shuts it; the version cap
     does. */
  const atAssessmentVersionCap =
    assessmentVersionCount !== null && assessmentVersionCount >= MAX_ASSESSMENT_VERSIONS;
  const atAIInterviewVersionCap =
    aiInterviewVersionCount !== null && aiInterviewVersionCount >= MAX_INTERVIEW_VERSIONS;
  const blockAssessmentCreate = !assessmentExistenceChecked || atAssessmentVersionCap;
  const blockAIInterviewCreate = !aiInterviewExistenceChecked || atAIInterviewVersionCap;
  /** Why Create is off, for the button titles and tile tooltips. Null when on. */
  const assessmentCreateBlockedReason = !features.assessment
    ? 'Assessments not enabled'
    : job.status === 'Disabled'
      ? 'JD is disabled'
      : atAssessmentVersionCap
        ? `This job version has the maximum ${MAX_ASSESSMENT_VERSIONS} assessment versions — archived ones count too`
        : !assessmentExistenceChecked
          ? 'Checking this job’s assessment…'
          : null;
  const aiInterviewCreateBlockedReason = !features.ai_interview
    ? 'AI Interviews not enabled'
    : job.status === 'Disabled'
      ? 'JD is disabled'
      : atAIInterviewVersionCap
        ? `This job version has the maximum ${MAX_INTERVIEW_VERSIONS} AI interview versions — archived ones count too`
        : !aiInterviewExistenceChecked
          ? 'Checking this job’s AI interview…'
          : null;

  const loadAIInterviewConfig = async () => {
    if (aiInterviewConfigFetchedRef.current) return;
    aiInterviewConfigFetchedRef.current = true;
    const seq = ++aiInterviewConfigSeqRef.current;
    const isStale = () => seq !== aiInterviewConfigSeqRef.current;
    setLoadingAIInterviewConfig(true);
    setAiInterviewConfigError(null);
    try {
      const liveConfig = await aiInterviewService.findLiveConfigForJd(job.id);
      if (isStale()) return;
      setAiInterviewConfig(liveConfig);

      // Does this JD have an interview at all? A live one obviously counts; if
      // there isn't one, look for a draft. Gates Send Invite, which has nothing
      // to invite to until an interview exists. The draft lookup is best-effort
      // — a failure there must not break the results tab.
      if (liveConfig) {
        setHasAnyAIInterview(true);
      } else {
        const draftResult = await aiInterviewService
          .listConfigs({ status: 'draft', page_size: 50, compact: true })
          .catch(() => null);
        if (isStale()) return;
        setHasAnyAIInterview(
          (draftResult?.items ?? []).some((c: AIInterviewResponse) => c.jd_id === job.id)
        );
      }

      // Invited-candidate count for the tab badge. page_size 1 because only
      // `total` is read here — the tab's table fetches its own rows. A failure
      // leaves the badge at 0 rather than breaking the tab itself.
      if (liveConfig) {
        const invitations = await aiInterviewService
          .getConfigInvitations(liveConfig.id, { page_size: 1, compact: true })
          .catch(() => null);
        if (isStale()) return;
        setAiInterviewCount(invitations?.total ?? 0);
        setAiInterviewResultCount((invitations?.completed ?? 0) + (invitations?.terminated ?? 0));
        // The badge: what the results table lists unfiltered (see its state).
        setAiInterviewResultTotal(
          (invitations?.in_progress ?? 0) + (invitations?.completed ?? 0) + (invitations?.terminated ?? 0)
        );
      } else {
        setAiInterviewCount(0);
        setAiInterviewResultCount(0);
        setAiInterviewResultTotal(0);
      }
    } catch {
      if (isStale()) return;
      // Allow a retry — clear the guard so re-opening the tab tries again.
      aiInterviewConfigFetchedRef.current = false;
      setAiInterviewConfigError('Could not load AI interview results. Please try again.');
      // Settle the badge rather than leave its placeholder pulsing.
      setAiInterviewResultTotal((prev) => prev ?? 0);
    } finally {
      // A stale run leaves these to the run that replaced it.
      if (!isStale()) {
        setLoadingAIInterviewConfig(false);
        // Same release-on-failure rule as the assessment side above.
        setAiInterviewExistenceChecked(true);
      }
    }
  };

  // Candidate detail opened from the AI Interview Result tab. Held here so the
  // detail renders inline on this page instead of navigating to the standalone
  // /ai-interviews/{id}/results/details route.
  const [viewingAIInterviewCandidate, setViewingAIInterviewCandidate] = useState<AIInterviewResponse | null>(null);
  const [aiInterviewCandidateNavIds, setAiInterviewCandidateNavIds] = useState<string[]>([]);
  const [loadingAIInterviewCandidate, setLoadingAIInterviewCandidate] = useState(false);

  const handleAIInterviewCandidateClick = async (sessionId: string, navIds?: string[]) => {
    // navIds is only passed on the initial click (not by Prev/Next), so the
    // pager keeps stepping through the list the user opened from.
    if (navIds) setAiInterviewCandidateNavIds(navIds);
    setLoadingAIInterviewCandidate(true);
    try {
      setViewingAIInterviewCandidate(await aiInterviewService.get(sessionId));
    } catch (error: any) {
      toast.error(error?.message || 'Failed to load candidate details');
    } finally {
      setLoadingAIInterviewCandidate(false);
    }
  };

  // Load on mount so the tab badge shows a count before the tab is ever
  // opened, matching the Scored Resumes / Assessment Results tabs which also
  // fetch eagerly. Side benefit: opening the tab is then instant.
  useEffect(() => {
    // A count read for another job version must not cap this one's Create.
    setAiInterviewVersionCount(null);
    if (!job.id) return;
    if (!hasPlanFeature('ai_interview') || !features.ai_interview) return;
    // Also runs for share-only users: the Send Invite gate reads
    // hasAnyAIInterview, which this sets — without it a user who can invite but
    // not view results would find the button permanently disabled.
    //
    // And for CREATE-only users, for the mirror-image reason: the Create gate
    // reads the same value, so a user who can create but neither view nor
    // share would never learn that an interview already exists and would be
    // offered Create on a job that already has one.
    if (
      !permissions.canViewAIInterviews
      && !permissions.canShareAIInterviews
      && !permissions.canCreateAIInterviews
    ) return;
    // job.id changing means a different JD version — the fetched-once guard
    // belongs to the previous id, so clear it or this version would keep
    // showing the other version's interview config and invite count.
    aiInterviewConfigFetchedRef.current = false;
    loadAIInterviewConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id, hasPlanFeature]);

  const handleShowAIInterviewResults = () => {
    setActiveTab('ai-interview-results');
    setAiInterviewResultsScrollRequest((request) => request + 1);
    loadAIInterviewConfig();
  };

  // Mirrors handleCreateAssessment, against this job version's AI interview
  // versions (`loadInterviewVersions` — the Create / Send popup's "New
  // version" list, so both buttons give one answer):
  //   MAX_INTERVIEW_VERSIONS already → blocked (archived ones count too)
  //   a draft version exists         → publish prompt, in place on this page
  //   this JD has an interview       → the NEXT version: a duplicate of the
  //                                    latest one, opened in the config flow
  //   nothing exists                 → the config flow
  // The duplicate follows the AI Interviews page's Duplicate rules
  // (`createBlockedReason` — latest only, sent, not archived), which the
  // backend's clone_config enforces again.
  const handleCreateAIInterview = async () => {
    if (resolvingAIInterviewTarget) return;
    setResolvingAIInterviewTarget(true);
    try {
      // Newest version first; this JD row only, archived included.
      const versions = await loadInterviewVersions(job.id);
      setAiInterviewVersionCount(versions.length);

      if (versions.length >= MAX_INTERVIEW_VERSIONS) {
        await dialog.alert({
          title: 'Maximum versions reached',
          message: `This job version already has ${MAX_INTERVIEW_VERSIONS} AI interview versions (the maximum allowed). Archived versions count too, so manage the existing versions to continue.`,
          variant: 'warning',
        });
        return;
      }

      // An unpublished version already exists: it must be published before
      // another is created.
      const draft = versions.find((v) => v.status === 'draft');
      if (draft?.config) {
        // Keep the Send Invite gate in step — this click just proved a draft
        // exists, which may be newer than what loadAIInterviewConfig saw.
        setHasAnyAIInterview(true);
        // The compact row can't tell us how far the wizard got, and the popup
        // only offers Publish once the draft is actually publishable — so read
        // the full record. If that read fails, fall back to the compact row:
        // the prompt then offers editing only, which is always safe.
        const full = await aiInterviewService.get(draft.id).catch(() => null);
        setDraftAIInterview(full ?? draft.config);
        return;
      }

      // This JD already has an interview: create its next version, the way
      // Duplicate does — the same clone call, from the latest version — and
      // open it in the config flow.
      const source = versions[0];
      if (source) {
        const blocked = createBlockedReason(
          versions,
          { canCreate: true, canUpdate: true, canPublish: true, canArchive: true, canInvite: true },
          'interview',
          source,
        );
        if (blocked) {
          await dialog.alert({
            title: 'Cannot create a new version',
            message: blocked,
            variant: 'warning',
          });
          return;
        }
        const nextVersion = nextVersionNumber(versions);
        const confirmed = await dialog.confirm({
          title: 'Create a new AI interview version',
          message: `Create version ${nextVersion} of ${MAX_INTERVIEW_VERSIONS} for this job version? It starts as a draft copy of version ${source.version}, ready to edit. Version ${source.version} is not changed.`,
          confirmText: 'Create Version',
        });
        if (!confirmed) return;
        const response = await aiInterviewService.clone(source.id);
        toast.success(`New version created as a draft: ${response.cloned_title}`);
        // Unsaved until Save as Draft: Discard anywhere in the wizard deletes
        // it — the AI Interviews page's Duplicate rule.
        markUnsavedVersion(response.cloned_id);
        router.push(`${aiInterviewConfigureHref(response.cloned_id, job.id)}&from=job-details`);
        return;
      }
    } catch (error: any) {
      // A failed clone says why; a failed lookup falls through to the config
      // flow, whose own guard re-checks before anything is created.
      if (error?.message) {
        toast.error(error.message);
        return;
      }
      // Lookup failed — fall through to the config flow rather than blocking.
      // Its own guard re-checks and redirects if a live interview does exist.
    } finally {
      setResolvingAIInterviewTarget(false);
    }

    // Nothing for this JD yet → straight into the config flow. This used to hop
    // through /recruitment/ai-interviews?action=create-ai-interview just so that
    // page could resolve the destination, which meant mounting the whole list
    // page and its data fetch between the click and the form.
    //
    // from=job-details keeps the config flow's breadcrumb anchored to this job
    // instead of resetting to the AI Interviews trail. Mirrors the existing
    // from=ai-interview param that runs the other direction.
    router.push(`/recruitment/ai-interviews/jd-selection/ai-interview-config?jd_id=${encodeURIComponent(job.id)}&from=job-details`);
  };

  /* `seed` pre-fills the invite form's candidate list. The page-level Invite
     button passes nothing and gets the empty form; a Scored Resumes row passes
     that candidate. Everything after the lookup is identical either way, so
     both entry points resolve the same config and open the same modal. */
  /* Invite — the shared Invite to AI Interview dialog for this job: its active
     interview versions to pick from, then the share step. `seed` (a Scored
     Resumes row) lists that candidate first; without it the candidates are
     added in the share step, as this page's Invite always worked. */
  const handleInviteAIInterview = (
    seed?: { name: string; email: string; resumeId?: string }[],
  ) => {
    // Only a real candidate list counts as a seed: the quick-action tile hands
    // this straight to onClick, so it can arrive as a click event, which must
    // open the dialog with nobody preset — not crash the page on `.map`.
    // Opens Create / Send AI Interview — the popup the result tabs' Actions
    // use — so every Invite on this page runs the one flow; with nobody
    // preset its "Choose candidates in the next step" applies.
    const list = Array.isArray(seed) ? seed : [];
    setInviteDialog({
      kind: 'interview',
      candidates: list.map((c) => ({ id: c.resumeId || c.email, name: c.name, email: c.email, resumeId: c.resumeId })),
    });
  };
  /* Quick Actions › Assessment › Invite (and its deep link): Create / Send
     Assessment with nobody preset — candidates are chosen in its email step. */
  const openCreateSendAssessment = () => setInviteDialog({ kind: 'assessment', candidates: [] });
  /* Quick Actions › Create / Send: the popup lists this job's AI Talent Match
     candidates, then its Scored Resumes candidates (the two tabs' tables),
     unticked — the recruiter picks who to send. A resume on both tabs is
     listed once, under AI Talent Match, with its score chip; Score Resume
     lists only resumes scored outside Talent Match. Each row carries its
     latest score (the list is newest first), or "Not scored". */
  const openCreateSendFromTile = (kind: InviteKind) => {
    const latestScore = new Map<string, any>();
    for (const r of scoredResumes) {
      const id = r.resumeId || r.id;
      if (id && !latestScore.has(id)) latestScore.set(id, r);
    }
    const scoreOf = (id: string): InviteCandidate['score'] => {
      const r = latestScore.get(id);
      return r ? { percent: r.scorePercentage, matchStatus: r.matchStatus } : 'unscored';
    };
    const candidates: InviteCandidate[] = aiMatchCandidates.map((c) => ({
      id: c.resumeId,
      name: c.name,
      email: c.email,
      phone: c.phone,
      rating: c.rank,
      resumeId: c.resumeId,
      source: 'talent-match' as const,
      score: scoreOf(c.resumeId),
    }));
    const listed = new Set(candidates.map((c) => c.id));
    for (const [id, r] of latestScore) {
      if (listed.has(id)) continue;
      candidates.push({
        id,
        name: r.candidateName,
        email: r.email,
        phone: r.phone || undefined,
        resumeId: r.resumeId || undefined,
        source: 'score-resume',
        score: scoreOf(id),
      });
    }
    setInviteDialog({ kind, candidates, preselect: false });
  };

  const handleAIInterviewStatus = () => {
    // Open the AI Interview Result tab on this page rather than navigating.
    // The tab owns the config fetch and its own loading / empty / error states,
    // so this is just a tab switch.
    handleShowAIInterviewResults();
  };

  // Create Assessment, resolved on click against this job version's real
  // assessment versions - the same list, read the same way, as the Create /
  // Send Assessment popup's "New version" (`loadAssessmentVersions`), so both
  // buttons give one answer:
  //   MAX_ASSESSMENT_VERSIONS already → blocked. Every version counts,
  //                                     archived included: archiving does not
  //                                     free a slot.
  //   a draft version exists          → publish prompt, in place on this page
  //                                     (one unpublished version at a time,
  //                                     per job version)
  //   this JD has an assessment       → the NEXT version: a duplicate of the
  //                                     LATEST one (highest version number),
  //                                     opened straight in Configure
  //   nothing for this JD yet         → /recruitment/assessments/create
  // The guard re-reads on every click and the button is held while it runs, so
  // a repeated click cannot slip a 6th version past it. AssessmentCreation
  // keeps its own one-per-JD-version guard for deep links, and the backend's
  // publish blocks a 6th version.
  const handleCreateAssessment = async () => {
    if (resolvingAssessmentTarget) return;
    setResolvingAssessmentTarget(true);
    const returnUrl = `/recruitment/job-details?id=${encodeURIComponent(job.id)}`;
    try {
      // Newest version first; this JD row only, every page, archived included.
      const versions = await loadAssessmentVersions(job.id);
      setAssessmentVersionCount(versions.length);

      if (versions.length >= MAX_ASSESSMENT_VERSIONS) {
        await dialog.alert({
          title: 'Maximum versions reached',
          message: `This job version already has ${MAX_ASSESSMENT_VERSIONS} assessment versions (the maximum allowed). Archived versions count too, so manage the existing versions to continue.`,
          variant: 'warning',
        });
        return;
      }

      // An unpublished version already exists: it must be published before
      // another is created - the Assessments page's "Draft already exists" popup.
      const draft = versions.find(v => v.status === 'draft');
      if (draft?.raw) {
        setDraftAssessmentConflict({ draft: draft.raw, jobVersion: job.versionNumber ?? 1 });
        return;
      }

      // This JD already has an assessment: create its next version, the way
      // Duplicate does - the same clone call, from the latest version - and
      // open it in Configure.
      const source = versions[0];
      if (source) {
        const nextVersion = nextVersionNumber(versions);
        const confirmed = await dialog.confirm({
          title: 'Create a new assessment version',
          message: `Create version ${nextVersion} of ${MAX_ASSESSMENT_VERSIONS} for this job version? It starts as a draft copy of version ${source.version}, ready to edit. Version ${source.version} is not changed.`,
          confirmText: 'Create Version',
        });
        if (!confirmed) return;
        const response = await assessmentService.clone(source.id);
        toast.success(`Assessment duplicated: "${response.cloned_title}"`);
        router.push(
          `/recruitment/assessments/create?step=configure&jd_id=${encodeURIComponent(job.id)}` +
          `&edit=${encodeURIComponent(response.cloned_id)}&op=create` +
          `&from=job-details&jd_title=${encodeURIComponent(job.title || '')}` +
          `&returnUrl=${encodeURIComponent(returnUrl)}`
        );
        return;
      }
    } catch (error: any) {
      // A failed clone says why; a failed lookup falls through to the creation
      // flow, whose own guard re-checks before anything is created.
      if (error?.message) {
        toast.error(error.message);
        return;
      }
    } finally {
      setResolvingAssessmentTarget(false);
    }

    // No assessment for this JD yet → the step form.
    //
    // returnUrl brings the recruiter back to this JD (not the assessments list)
    // once the assessment is created or the flow is cancelled. from=job-details
    // keeps the creation flow's breadcrumb anchored to this job across every
    // step, exactly like handleCreateAIInterview above. The JD is already
    // chosen, so step=configure skips the JD picker. jd_title travels along so
    // the JD crumb is correct on first paint instead of showing a placeholder
    // until the JD fetch lands and then visibly swapping.
    router.push(
      `/recruitment/assessments/create?step=configure&jd_id=${encodeURIComponent(job.id)}` +
      `&from=job-details&jd_title=${encodeURIComponent(job.title || '')}` +
      `&returnUrl=${encodeURIComponent(returnUrl)}`
    );
  };

  // Publish the draft without leaving this page. On success the JD now has a
  // live assessment, so refresh the results tab and hand the recruiter straight
  // to the invite flow — publishing is only ever a step towards inviting.
  const handlePublishDraftAssessment = async () => {
    if (!draftAssessment?.id || publishingDraft) return;
    setPublishingDraft(true);
    try {
      await assessmentService.publish(draftAssessment.id);
      toast.success('Assessment published.');
      setDraftAssessment(null);
      fetchAssessmentResults();
    } catch (err: any) {
      toast.error(err?.message || 'Could not publish the assessment. Please try again.');
    } finally {
      setPublishingDraft(false);
    }
  };

  // "Continue editing" — reopen the draft in the configure flow, breadcrumb
  // still anchored to this job.
  const handleEditDraftAssessment = () => {
    if (!draftAssessment?.id) return;
    const returnUrl = `/recruitment/job-details?id=${encodeURIComponent(job.id)}`;
    setDraftAssessment(null);
    router.push(
      `/recruitment/assessments/create?step=configure&jd_id=${encodeURIComponent(job.id)}` +
      `&edit=${encodeURIComponent(draftAssessment.id)}` +
      `&from=job-details&jd_title=${encodeURIComponent(job.title || '')}` +
      `&returnUrl=${encodeURIComponent(returnUrl)}`
    );
  };

  const handlePublishDraftAIInterview = async () => {
    if (!draftAIInterview?.id || publishingAIDraft) return;
    setPublishingAIDraft(true);
    try {
      await aiInterviewService.publishConfig(draftAIInterview.id);
      toast.success('AI interview published.');
      setDraftAIInterview(null);
      // The JD now has a live config — clear the fetch guard so the results tab
      // and its badge pick it up instead of staying on the pre-publish result.
      aiInterviewConfigFetchedRef.current = false;
      loadAIInterviewConfig();
    } catch (err: any) {
      // A draft with no clusters/skills configured can't be published; the API
      // says why, so surface that rather than a generic failure.
      toast.error(err?.message || 'Could not publish the AI interview. Please try again.');
    } finally {
      setPublishingAIDraft(false);
    }
  };

  // "Continue editing" — reopen the draft in the config flow, breadcrumb still
  // anchored to this job.
  const handleEditDraftAIInterview = () => {
    if (!draftAIInterview?.id) return;
    const configId = draftAIInterview.id;
    setDraftAIInterview(null);
    router.push(
      `/recruitment/ai-interviews/jd-selection/ai-interview-config?jd_id=${encodeURIComponent(job.id)}` +
      `&config_id=${encodeURIComponent(configId)}&from=job-details`
    );
  };

  const handleAssessmentStatus = () => {
    // Same in-place pattern as the AI Interview Result action — the tab already
    // owns its own fetching and empty states, so this is just a tab switch.
    setActiveTab('assessment-results');
  };

  // Track Invite — who was invited and how far they got, as opposed to Result,
  // which is about scores. The modal pulls every assessment on this JD itself,
  // so there's nothing to resolve before opening it.
  const handleTrackAssessmentInvites = () => {
    setShowTrackInvitesModal(true);
  };

  // AI Interview invite tracking is bound to a config rather than the JD, so
  // resolve this job's live config before opening the tracker. Usually already
  // in hand from the mount fetch — the lookup is the fallback, not the norm.
  const handleTrackAIInterviewInvites = async () => {
    if (resolvingTrackInvitesConfig) return;
    if (aiInterviewConfig?.id) {
      setTrackAIInterviewConfig(aiInterviewConfig);
      return;
    }
    setResolvingTrackInvitesConfig(true);
    try {
      const liveConfig = await aiInterviewService.findLiveConfigForJd(job.id);
      if (!liveConfig) {
        toast.error('Publish this job’s AI interview before tracking invitations.');
        return;
      }
      setAiInterviewConfig(liveConfig);
      setTrackAIInterviewConfig(liveConfig);
    } catch {
      toast.error('Could not load the AI interview for this job. Please try again.');
    } finally {
      setResolvingTrackInvitesConfig(false);
    }
  };

  // Trigger a Quick Action automatically when a caller deep-links into the
  // JD page with ?action=... (e.g. the job-openings three-dot menu).
  useEffect(() => {
    if (!initialAction || !job?.id) return;
    if (initialAction === 'ai-talent-match') {
      if (permissions.canRunAiMatch && aiTalentMatchAvailable && features.ai_talent_match && job.status !== 'Disabled') {
        // Deep link from the job-openings menu — same action, so it gets the
        // same prompt rather than starting a run the moment the page loads.
        setShowAIMatchConfirm(true);
      }
    } else if (initialAction === 'score-resumes') {
      if (permissions.canRunScoring && hasPlanFeature('resume_scoring') && job.status !== 'Disabled') {
        setShowSelectSourceModal(true);
      }
    } else if (initialAction === 'invite-assessment') {
      if (permissions.canCreateAssessments && hasPlanFeature('assessment') && features.assessment && job.status !== 'Disabled') {
        openCreateSendAssessment();
      }
    } else if (initialAction === 'assessment-status') {
      if (permissions.canViewAssessments && hasPlanFeature('assessment') && features.assessment) {
        setShowTrackInvitesModal(true);
      }
    } else if (initialAction === 'create-ai-interview') {
      if (permissions.canCreateAIInterviews && hasPlanFeature('ai_interview') && features.ai_interview && job.status !== 'Disabled') {
        handleCreateAIInterview();
      }
    } else if (initialAction === 'invite-ai-interview') {
      if (permissions.canShareAIInterviews && hasPlanFeature('ai_interview') && features.ai_interview && job.status !== 'Disabled') {
        handleInviteAIInterview();
      }
    } else if (initialAction === 'ai-interview-status') {
      if (permissions.canViewAIInterviews && hasPlanFeature('ai_interview') && features.ai_interview) {
        handleAIInterviewStatus();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAction, job?.id]);

  // Fetch scored resumes on component mount
  useEffect(() => {
    if (job.id) {
      fetchScoredResumes();
    }
  }, [job.id]);

  /* Real per-publish attribution for the Recent Activity panel — who
     published/republished this JD, and exactly when. `job.postedBy` /
     `job.postedDate` (created_by_name / created_at) name the JD's CREATOR,
     which is not necessarily who clicked Publish, and carry nothing at all
     for a republish. `/jd/{id}/versions` returns one entry per PUBLISHED
     version with its own `published_by_name` + `published_at`, which is the
     actual answer to both. Archive/disable have no equivalent endpoint — the
     backend does not record who changed a JD to those statuses — so those two
     activity entries stay date-only (see below). */
  const [jdVersionHistory, setJdVersionHistory] = useState<JDVersion[]>([]);
  useEffect(() => {
    if (!job.id) return;
    let cancelled = false;
    jdService.getVersionHistory(job.id)
      .then((res) => { if (!cancelled) setJdVersionHistory(res.versions || []); })
      .catch(() => { /* Recent Activity falls back to job.postedBy/postedDate */ });
    return () => { cancelled = true; };
  }, [job.id]);

  /* Same idea, for the AI Interview config's OWN version — `AIInterviewResponse`
     has no version field of its own (only the linked JD's), so Recent
     Activity's "AI Interview Created (Vn)" reads it from this config's
     dedicated version-history endpoint instead. */
  useEffect(() => {
    if (!aiInterviewConfig?.id) { setAiInterviewVersionHistory([]); return; }
    let cancelled = false;
    aiInterviewService.getVersionHistory(aiInterviewConfig.id)
      .then((res) => { if (!cancelled) setAiInterviewVersionHistory(res.items || []); })
      .catch(() => { /* Recent Activity falls back to "V1" */ });
    return () => { cancelled = true; };
  }, [aiInterviewConfig?.id]);

  /* The JD's own last-update time, fetched fresh — the fallback status row's
     date when there is no status history for this JD (the `job` prop can
     arrive without `updated_at`, which left that row "N/A" at the bottom). */
  const [jdLastUpdatedAt, setJdLastUpdatedAt] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!job.id) return;
    let cancelled = false;
    jdService.get(job.id)
      .then((jd) => { if (!cancelled) setJdLastUpdatedAt(jd.updated_at); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [job.id, job.status]);
  /* JD status history for Recent Activity — every Disabled / Re-enabled /
     Archived / Unarchived, with who and when, straight from
     GET /jd/{id}/status-history (the backend audits each real status
     transition with the JD's id and old/new status). `null` = not loaded
     (request failed): the panel then falls back to the current-status row. */
  const [jdStatusHistory, setJdStatusHistory] = useState<JDStatusEvent[] | null>(null);
  useEffect(() => {
    if (!job.id) return;
    let cancelled = false;
    jdService.getStatusHistory(job.id)
      .then((res) => { if (!cancelled) setJdStatusHistory(res.events || []); })
      .catch(() => { if (!cancelled) setJdStatusHistory(null); });
    return () => { cancelled = true; };
  }, [job.id, job.status]);

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
          resumeId: item.resume_id || '',
          candidateName: item.candidate_name || 'Unknown',
          email: item.candidate_email || '',
          phone: item.phone || '',
          matchStatus: matchStatus,
          scorePercentage: Number((item.overall_score || 0).toFixed(1)),  // Keep 1 decimal for consistency
          overallRating10: item.overall_rating_10,
          scoredDate: item.created_at || new Date().toISOString(),
          scoredBy: item.scored_by || item.scored_by_name || 'System',
          // Identifies one scoring trigger, where the API sends it — Recent
          // Activity counts triggers, not resumes.
          batchId: item.batch_id || item.scoring_batch_id || undefined,
          // Was missing here — every row on this tab fell back to
          // getScoringSourceLabel's default bucket regardless of where it was
          // actually scored from, since `source` never made it onto the
          // object at all.
          source: item.source || 'database',
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

      // Update stats — derive every match-status bucket from the SAME converted
      // list the Scored Resumes tab displays, so the panel is internally
      // consistent (buckets are mutually exclusive and sum to the total).
      // Previously each bucket used `response.<count> || <filter>`, which mixed
      // the backend's score-range bucketing (e.g. score < 50 → no_match_count)
      // with the frontend's match_status bucketing. When a backend count was 0
      // (falsy) it fell through to the filter, letting one resume be counted in
      // two buckets at once — e.g. Total 1 but Partial Match 1 AND No Match 1.
      // `total` also reads the converted list now, not `response.total` — the
      // backend total counts every scored resume for this JD, while the tab
      // itself (ScoredResumesTable) only ever renders this one `page_size:
      // 100` page, via its own `resumes.length` count badge. For a JD with
      // more than 100 scored resumes those two disagreed, so the tab-strip
      // badge showed the true (higher) total and then visibly dropped to 100
      // the moment the tab opened.
      const stats = {
        total: convertedResumes.length,
        exactMatch: convertedResumes.filter((r: any) => r.matchStatus === 'Exact Match').length,
        partialMatch: convertedResumes.filter((r: any) => r.matchStatus === 'Partial Match').length,
        noMatch: convertedResumes.filter((r: any) => r.matchStatus === 'No Match').length,
      };
      console.log('[JobDetailView] Setting scored resumes stats:', stats);
      setScoredResumesStats(stats);
    } catch (error) {
      console.error('[JobDetailView] Failed to fetch scored resumes:', error);
      setScoredResumes([]);
      setScoredResumesStats({ total: 0, exactMatch: 0, partialMatch: 0, noMatch: 0 });
    } finally {
      setLoadingScoredResumes(false);
      setScoredResumesLoaded(true);
    }
  };

  // Fetch assessment results for this JD
  /** Assessment versions of ONE job version: rows on that JD id, archived excluded. */
  /* Every version counts toward the cap, archived included — the Create /
     Send Assessment popup's rule (archiving does not free a slot). */
  const countAssessmentVersionsFor = (rows: { jd_id?: string | null }[], jdId: string) =>
    rows.filter(a => a.jd_id === jdId).length;

  /* The rows AssessmentResults lists with no filter — the same mapping it
     applies (pending and in-progress attempts, and completed ones still being
     scored, read as not yet a result; anything else is Completed/Terminated).
     The tab badge counts with this so it does not change when the tab opens. */
  const isListedAssessmentResult = (result: { status?: string | null; scoring_status?: string | null }) => {
    const status = result.status;
    if (status === 'pending' || status === 'in_progress') return false;
    if (status === 'completed') return (result.scoring_status || 'pending') === 'completed';
    return true;
  };

  const fetchAssessmentResults = async () => {
    const seq = ++assessmentResultsSeqRef.current;
    const isStale = () => seq !== assessmentResultsSeqRef.current;
    setLoadingAssessmentResults(true);
    /* A different job version: nothing of the previous one's Create state may
       carry over - the gate reads "checking" until THIS version's count lands. */
    if (assessmentCountJdId.current !== job.id) {
      assessmentCountJdId.current = job.id;
      setAssessmentVersionCount(null);
      setAssessmentExistenceChecked(false);
    }
    const countForJdId = job.id;
    try {
      // First, get all assessments for this JD
      const assessmentsResponse = await assessmentService.list({ jd_id: job.id, page_size: 100 });
      if (isStale()) return;
      const assessments = assessmentsResponse.items || [];
      setJdAssessments(assessments);
      // Derived here rather than in a separate request — this list is already
      // loaded, and it's the same source Create uses to decide its destination.
      // Published/active is the same pair handleOpenShareAssessment treats as
      // invitable, so the button's enabled state matches what clicking it does.
      // Revoked ones are deliberately NOT excluded here: that case has its own
      // "duplicate one to start a fresh round" message, which only lands if the
      // click gets through.
      setHasAnyAssessment(assessments.length > 0);
      // Every page of THIS version's assessments, not just the first 100 above.
      listAllAssessments({ jd_id: countForJdId })
        .then(rows => {
          if (assessmentCountJdId.current !== countForJdId) return;
          setAssessmentVersionCount(countAssessmentVersionsFor(rows, countForJdId));
        })
        .catch(() => {
          if (assessmentCountJdId.current === countForJdId) setAssessmentVersionCount(null);
        });
      setHasPublishedAssessment(
        assessments.some((a: any) => ['published', 'active'].includes(String(a?.status || '').toLowerCase()))
      );
      const listedInviteCount = assessments.reduce(
        (sum: number, assessment: any) => sum + (Number(assessment?.invitations_count) || 0),
        0
      );

      // For each assessment, get the completed results
      const allResults: any[] = [];
      let resultInviteCount = 0;
      let listedResultCount = 0;
      for (const assessment of assessments) {
        try {
          /* Every page, not just the first 100: the badge counts these rows,
             and the results table itself lists the whole set. */
          const RESULTS_PAGE_SIZE = 100;
          const firstPage = await assessmentService.listResults(assessment.id, { page: 1, page_size: RESULTS_PAGE_SIZE });
          if (isStale()) return;
          const results = [...(firstPage.items || [])];
          const reportedTotal = Number(firstPage.total ?? results.length) || 0;
          for (
            let page = 2;
            results.length < reportedTotal && (page - 1) * RESULTS_PAGE_SIZE < reportedTotal;
            page++
          ) {
            // A later page failing keeps the rows already fetched.
            const nextPage = await assessmentService
              .listResults(assessment.id, { page, page_size: RESULTS_PAGE_SIZE })
              .catch(() => null);
            if (isStale()) return;
            if (!nextPage) break;
            const items = nextPage.items || [];
            results.push(...items);
            if (items.length < RESULTS_PAGE_SIZE) break;
          }
          resultInviteCount += reportedTotal;
          listedResultCount += results.filter(isListedAssessmentResult).length;

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
                score: toOneDecimalScore(result.hr_score),
                maxScore: 100,
                passFail: result.hr_score >= 60 ? 'Pass' : 'Fail'
              });
            }
            if (result.technical_score !== null && result.technical_score !== undefined) {
              roundScores.push({
                roundName: 'Technical',
                score: toOneDecimalScore(result.technical_score),
                maxScore: 100,
                passFail: result.technical_score >= 60 ? 'Pass' : 'Fail'
              });
            }
            if (result.coding_score !== null && result.coding_score !== undefined) {
              roundScores.push({
                roundName: 'Coding',
                score: toOneDecimalScore(result.coding_score),
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
              // How the candidate was actually invited — resume_id is stored
              // only for invites sent from a resume. See assessmentInviteSource.
              inviteSource: result.resume_id ? 'resume' : 'email',
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

      setAssessmentInviteCount(Math.max(listedInviteCount, resultInviteCount));
      setAssessmentResultTotal(listedResultCount);
      setAssessmentFinishedCount(allResults.filter((r: any) => {
        const st = String(r.status || '').toLowerCase();
        return !!r.completed_at || st === 'completed' || st === 'terminated' || st === 'abandoned';
      }).length);
      setAssessmentResults(allResults);
    } catch (error) {
      if (isStale()) return;
      console.error('Failed to fetch assessment results:', error);
      setAssessmentInviteCount(0);
      setAssessmentResultTotal(0);
      setAssessmentFinishedCount(0);
      setAssessmentResults([]);
      setJdAssessments([]);
    } finally {
      // A stale run leaves these to the run that replaced it.
      if (!isStale()) {
        setLoadingAssessmentResults(false);
        /* Settled either way. A failed lookup deliberately RELEASES the Create
           gate rather than holding it shut: `handleCreateAssessment` re-queries
           on the click and refuses there if an assessment turns up, so a flaky
           request costs a redirect, not the ability to ever create one. */
        setAssessmentExistenceChecked(true);
      }
    }
  };

  // Fetch AI match sessions for this JD
  const fetchAiMatchData = async () => {
    setLoadingAiMatch(true);
    try {
      /* Two requests, in parallel, and that is the whole tab.

         It used to be one per session plus one per candidate: `listSessions`, then a
         `getSession` for each (their `results` come back empty from the list), then -
         inside `getSession` - a `GET /resumes/{id}` per candidate for email, phone and
         notice period, with the de-duplication done here in JavaScript afterwards. A JD
         with 6 runs and 732 match rows spent ~739 requests to show 122 people, which is
         why the tab sat loading for the better part of a minute.

         `listJdCandidates` does the de-duplication and the resume join in one query, and
         reports the distinct total. The sessions are still fetched - the activity
         timeline and the tab's own run history read them - but that is one call that no
         longer blocks the list. */
      const [sessionsResult, candidatesResult] = await Promise.allSettled([
        aiMatchService.listSessions({ jd_id: job.id, page_size: 100 }),
        aiMatchService.listJdCandidates(job.id),
      ]);

      if (sessionsResult.status === 'fulfilled') {
        setAiMatchSessions(sessionsResult.value.items || []);
      } else {
        console.error('Failed to fetch AI match sessions:', sessionsResult.reason);
        setAiMatchSessions([]);
      }

      if (candidatesResult.status === 'fulfilled') {
        const { candidates, total } = candidatesResult.value;
        setAiMatchCandidates(candidates);
        setAiMatchTotal(total);
      } else {
        console.error('Failed to fetch AI match candidates:', candidatesResult.reason);
        setAiMatchCandidates([]);
        setAiMatchTotal(0);
      }
    } finally {
      setLoadingAiMatch(false);
    }
  };

  const [activeTab, setActiveTab] = useState<'overview' | 'scored-resumes' | 'assessment-results' | 'ai-talent-match' | 'ai-interview-results'>(initialTab || 'overview');
  /* A results table's reported count holds only while its tab is open; off
     the tab the badge goes back to the unfiltered total. */
  useEffect(() => {
    if (activeTab !== 'assessment-results') setAssessmentTableTotal(null);
    if (activeTab !== 'ai-interview-results') setAiInterviewTableTotal(null);
  }, [activeTab]);
  /* The DOM node of the toolbar slot that sits INSIDE the sticky tab-navigation
     card, directly under the tab row. Each result tab's search/filter toolbar
     portals its markup here (keeping all of its own state local), so the
     controls read as the second row of the tab card rather than a detached
     panel below it. Held in state (not a plain ref) so the children re-render
     and portal in once the node is actually mounted. */
  const [tabToolbarSlot, setTabToolbarSlot] = useState<HTMLDivElement | null>(null);
  /* Overview right column (Quick Actions / Applicant Statistics / Recent
     Activity) — sticky on lg+ with NO height cap or overflow of its own, so it
     never grows inner scrollbars. Its `top` is measured instead: when the
     column fits in the scroller below the sticky breadcrumb it pins there;
     when it is taller, `top` goes negative so the column scrolls with the page
     until its BOTTOM is in view and sticks there — every card stays reachable
     through the page's own scroll. Below lg the class isn't sticky, so the
     inline `top` is inert. */
  const rightColumnRef = useRef<HTMLDivElement | null>(null);
  const [rightColumnTop, setRightColumnTop] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (activeTab !== 'overview') return;
    const column = rightColumnRef.current;
    if (!column) return;
    // The dashboard layout's overflow-y-auto div is what scrolls this page.
    let scroller: HTMLElement | null = column.parentElement;
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) {
      scroller = scroller.parentElement;
    }
    const GAP = 16;
    const measure = () => {
      const viewportH = scroller ? scroller.clientHeight : window.innerHeight;
      const pinnedTop = (breadcrumbBarRef.current?.offsetHeight ?? 0) + GAP;
      const columnH = column.offsetHeight;
      setRightColumnTop(
        pinnedTop + columnH + GAP <= viewportH ? pinnedTop : viewportH - columnH - GAP
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(column);
    if (scroller) ro.observe(scroller);
    if (breadcrumbBarRef.current) ro.observe(breadcrumbBarRef.current);
    return () => ro.disconnect();
  }, [activeTab]);
  // Recent Activity panel — 10 events per page.
  const [activityPage, setActivityPage] = useState(1);
  const ACTIVITY_PAGE_SIZE = 10;

  /* ---- Where you are, kept in the URL -------------------------------------
     The open tab and the open candidate are both React state, so a refresh used
     to drop the recruiter back on Overview having lost whichever candidate they
     were reading. Both now live in the query string (`?tab=`, `?resume=`), which
     the page reads back into `initialTab` and the restore below.

     `?resume=` names a row that is not loaded yet at mount — `fetchScoredResumes`
     has to answer first. So the id read off the URL is held HERE until a row
     matches it, and the writer below treats a pending id exactly like an open
     one. Without that, the writer would see "no candidate open", strip the param
     as stale, and delete the very thing the restore was waiting for. */
  const [pendingResumeId, setPendingResumeId] = useState<string | null>(
    () => searchParams.get('resume'),
  );

  useEffect(() => {
    if (!pendingResumeId || viewingScoredResume) return;
    if (!scoredResumesLoaded) return; // rows still coming — decide nothing yet
    const row = scoredResumes.find((r: any) => scoredResumeId(r) === pendingResumeId);
    if (row) setViewingScoredResume(toCandidateDetail(row));
    /* Cleared either way. On a hit it hands over to `viewingScoredResume`; on a
       miss (a resume deleted since the link was shared) it gives up, which is
       what releases the gate below so the JD page renders instead of waiting
       forever on a candidate that is never coming. */
    setPendingResumeId(null);
  }, [pendingResumeId, viewingScoredResume, scoredResumes, scoredResumesLoaded]);

  /* ONE effect writes both params. Two would each build their next URL from the
     same `searchParams` snapshot, so whichever ran second would silently undo
     the other's change in any tick where both moved.

     `replace`, not `push`: switching tab or opening a candidate is not a step
     the Back button should have to walk through. `scroll: false` because the App
     Router otherwise jumps to the top of the page on every one of these.

     Overview and "no candidate open" clear their params rather than writing
     `?tab=overview` or an empty value, so a plain URL keeps meaning the default
     and shared links stay clean. Pressing Back out of a candidate clears
     `?resume=` and cannot bounce straight back in: `pendingResumeId` is already
     null by then, so the restore above has nothing left to act on. */
  useEffect(() => {
    const openResume = viewingScoredResume
      ? scoredResumeId(viewingScoredResume)
      : pendingResumeId;
    if (
      (searchParams.get('tab') || 'overview') === activeTab &&
      searchParams.get('resume') === openResume
    ) {
      return;
    }
    const next = new URLSearchParams(searchParams.toString());
    if (activeTab === 'overview') next.delete('tab');
    else next.set('tab', activeTab);
    if (openResume) next.set('resume', openResume);
    else next.delete('resume');
    const query = next.toString();
    router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
  }, [activeTab, viewingScoredResume, pendingResumeId, searchParams, pathname, router]);
  const overviewSectionRef = useRef<HTMLDivElement | null>(null);
  const scoredResumesSectionRef = useRef<HTMLDivElement | null>(null);
  const aiInterviewResultsSectionRef = useRef<HTMLDivElement | null>(null);
  const [overviewScrollRequest, setOverviewScrollRequest] = useState(0);
  const [scoredResumesScrollRequest, setScoredResumesScrollRequest] = useState(0);
  const [aiInterviewResultsScrollRequest, setAiInterviewResultsScrollRequest] = useState(0);
  const [scoredResumesMatchFilter, setScoredResumesMatchFilter] = useState<ScoredResumesMatchFilter>('all');

  const toggleVersionMenu = async () => {
    const opening = !showVersionMenu;
    setShowVersionMenu(opening);
    if (!opening || versionMenuLoaded || versionMenuLoading) return;

    setVersionMenuLoading(true);
    setVersionMenuError(null);
    try {
      const data = await jdService.getLineageVersions(job.id);
      setLineageVersions(data || []);
      setVersionMenuLoaded(true);
    } catch (error) {
      console.error('Failed to load JD lineage versions:', error);
      setLineageVersions([]);
      setVersionMenuError('Could not load versions');
    } finally {
      setVersionMenuLoading(false);
    }
  };

  const handleVersionSelect = (version: JDLineageVersion) => {
    setShowVersionMenu(false);
    if (version.id === job.id) return;

    router.push(`/recruitment/job-details?id=${version.id}`);
  };

  const handleShowOverview = () => {
    setActiveTab('overview');
    setOverviewScrollRequest((request) => request + 1);
  };

  const handleShowScoredResumes = (matchFilter: ScoredResumesMatchFilter = 'all') => {
    setScoredResumesMatchFilter(matchFilter);
    setActiveTab('scored-resumes');
    setScoredResumesScrollRequest((request) => request + 1);
  };

  useEffect(() => {
    if (overviewScrollRequest === 0 || activeTab !== 'overview') return;

    const frame = window.requestAnimationFrame(() => {
      overviewSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [overviewScrollRequest, activeTab]);

  useEffect(() => {
    if (scoredResumesScrollRequest === 0 || activeTab !== 'scored-resumes') return;

    const frame = window.requestAnimationFrame(() => {
      scoredResumesSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [scoredResumesScrollRequest, activeTab]);

  useEffect(() => {
    if (aiInterviewResultsScrollRequest === 0 || activeTab !== 'ai-interview-results') return;

    const frame = window.requestAnimationFrame(() => {
      aiInterviewResultsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [aiInterviewResultsScrollRequest, activeTab]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowAddApplicantsMenu(false);
      }
      if (versionMenuRef.current && !versionMenuRef.current.contains(event.target as Node)) {
        setShowVersionMenu(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowVersionMenu(false);
      }
    };

    const handleShowApplicants = () => {
      setShowApplicantsView(true);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('showApplicants' as any, handleShowApplicants);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('showApplicants' as any, handleShowApplicants);
    };
  }, []);
  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'Published':
        return 'bg-success-subtle text-success border-success-line';
      case 'Republished':
        return 'bg-success-subtle text-success border-success-line';
      case 'Draft':
        return 'bg-warning-subtle text-warning border-warning-line';
      case 'Closed':
        return 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700';
      case 'Disabled':  // JD15: Disabled status styling
        return 'bg-destructive-subtle text-destructive border-destructive-line';
      case 'Archived':
        return 'bg-purple-100 text-purple-700 border-purple-200';
      default:
        return 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700';
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

  // Every "AI Talent Match" / "Run AI Match" trigger lands here — it only asks.
  const handleAITalentMatch = () => {
    setShowAIMatchConfirm(true);
  };

  // Yes on the prompt: close it and mount the panel, which starts the run.
  const confirmAITalentMatch = () => {
    setShowAIMatchConfirm(false);
    setShowAIMatchPanel(true);
  };

  const handleAIMatchComplete = (results: any[]) => {
    setShowAIMatchPanel(false);
    /* A re-run that finds the same candidates as before says so, rather than
       repeating "Found 15 matching candidates" as if they were new. */
    const knownResumeIds = new Set(aiMatchCandidates.map((c) => c.resumeId));
    const newCount = results.filter((r) => r?.resumeId && !knownResumeIds.has(r.resumeId)).length;
    // Only what THIS run newly matched — no running total.
    if (newCount === 0) {
      toast.info('AI Talent Match completed — no new matching candidates found.');
    } else {
      toast.success(`AI Talent Match completed! Found ${newCount} new matching candidate${newCount === 1 ? '' : 's'}.`);
    }
    fetchAiMatchData();
    setActiveTab('ai-talent-match');
  };

  // Score selected AI match candidates using async Celery bulk scoring
  const startAiMatchScoring = async (candidates: MatchedCandidate[]) => {
    if (candidates.length === 0) return;
    // One start request at a time — a repeated confirm while the first is
    // still in flight would otherwise queue the same resumes twice.
    if (aiMatchScoringStartingRef.current) return;
    const resumeIds = candidates.map((c) => c.resumeId);
    const returnUrl = `/recruitment/job-details?id=${job.id}&tab=scored-resumes`;
    try {
      aiMatchScoringStartingRef.current = true;
      let response;
      try {
        response = await scoringService.startBulkScoringAsync(job.id, resumeIds);
      } finally {
        aiMatchScoringStartingRef.current = false;
      }
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
            const itemStatus = normalizeScoringStatus(item.status);
            if (itemStatus === 'completed') {
              updateItemStatus(batchId, itemId, 'Scored successfully', {
                score: item.overall_score,
                scoredDateTime: new Date().toISOString(),
              });
            } else if (itemStatus === 'failed') {
              updateItemStatus(batchId, itemId, 'Failed', {
                errorReason: item.error_message || 'Scoring failed',
              });
            } else if (itemStatus === 'processing') {
              updateItemStatus(batchId, itemId, 'Scoring in progress');
            }
          });

          // Stop polling when batch is finished. `status.status` is the
          // primary signal, but falls back to the counts settling — without
          // this fallback a batch whose aggregate `status` string never
          // flips (queued/processing already both 0) polled forever, stuck
          // showing "Processing" with no way to close the popup.
          const aggregateStatus = normalizeScoringStatus(status.status);
          if (aggregateStatus === 'completed' || aggregateStatus === 'failed' ||
              (status.queued === 0 && status.processing === 0)) {
            clearInterval(poll);
            clearTimeout(pollTimeoutId);
            fetchScoredResumes();
            // Refresh header quota dropdown — RS deductions landed on CP
            dispatchUnitsConsumed();
          }
        } catch (pollError) {
          // Was silently killing the interval on the FIRST failure, with no
          // logging — a single transient network error (not even a real
          // backend problem) permanently ended all future polling right
          // after it started, leaving the widget stuck on "Queued" forever
          // with nothing in the Network tab to explain why. Log and keep
          // retrying instead; the 10-minute circuit breaker above is what
          // eventually gives up if the backend is genuinely never going to
          // respond.
          console.error('[JobDetailView] Error polling batch status:', pollError);
        }
      }, 3000);

      // Circuit breaker: stop polling after 10 minutes even if the backend
      // never settles this batch, matching the same safeguard on the
      // Resume-Scoring route's equivalent poll.
      const pollTimeoutId = setTimeout(() => {
        clearInterval(poll);
      }, 600000);
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

  /* A refresh on a candidate URL is still resolving: `?resume=` named a row that
     `fetchScoredResumes` has not answered for yet. Hold on a spinner rather than
     painting the JD page underneath — that page is not where the recruiter was,
     and rendering it for the half-second the fetch takes read as the app
     bouncing them back before snapping forward again.

     This cannot hang: the restore above clears `pendingResumeId` as soon as the
     rows land, whether or not one of them matched. */
  if (pendingResumeId && !viewingScoredResume) {
    /* Placeholder for the CandidateScoringDetailPage this resolves into —
       mirrors that page's real shape: a breadcrumb bar, a candidate header
       (avatar + name/title + score badges), the Overview / Score Table /
       Personal Info / View JD tab strip, then the Overview section cards. */
    return (
      <main className="flex-1 overflow-x-clip bg-slate-50 dark:bg-slate-950">
        <div className="mx-auto w-full max-w-[1400px] p-4 md:p-6 space-y-5">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-3" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-3" />
            <Skeleton className="h-3 w-28" />
          </div>

          {/* Candidate header */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 p-5 flex items-start gap-4">
            <Skeleton className="h-16 w-16 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-6 w-56" />
              <Skeleton className="h-4 w-40" />
              <div className="flex gap-2 pt-1">
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            </div>
            <Skeleton className="h-9 w-28 rounded-lg" />
          </div>

          {/* Tab strip */}
          <div className="flex gap-6 border-b border-gray-200 dark:border-slate-700 pb-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-24" />
            ))}
          </div>

          {/* Overview section cards */}
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 p-5 space-y-3"
            >
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-5/6" />
              <Skeleton className="h-3.5 w-2/3" />
            </div>
          ))}
        </div>
      </main>
    );
  }

  // Candidate detail from the AI Interview Result tab — rendered inline so the
  // drill-down never leaves this page. Prev/Next step through the same list the
  // candidate was opened from.
  if (viewingAIInterviewCandidate) {
    const _aiIdx = aiInterviewCandidateNavIds.indexOf(viewingAIInterviewCandidate.id);
    const _aiPrevId = _aiIdx > 0 ? aiInterviewCandidateNavIds[_aiIdx - 1] : null;
    const _aiNextId = _aiIdx >= 0 && _aiIdx < aiInterviewCandidateNavIds.length - 1
      ? aiInterviewCandidateNavIds[_aiIdx + 1]
      : null;
    return (
      <CandidateResultsView
        interview={viewingAIInterviewCandidate}
        tabInUrl={false}
        onBack={() => setViewingAIInterviewCandidate(null)}
        breadcrumbItems={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Job Descriptions', href: '/recruitment/job-openings' },
          // Returns to the results table rather than reloading the route.
          { label: job.title || 'Job Details', onClick: () => setViewingAIInterviewCandidate(null) },
          { label: viewingAIInterviewCandidate.candidate_name || 'Candidate Results' },
        ]}
        currentIndex={_aiIdx >= 0 ? _aiIdx : undefined}
        totalCount={aiInterviewCandidateNavIds.length || undefined}
        onPrev={_aiPrevId ? () => handleAIInterviewCandidateClick(_aiPrevId) : undefined}
        onNext={_aiNextId ? () => handleAIInterviewCandidateClick(_aiNextId) : undefined}
      />
    );
  }

  // Show CandidateScoringDetailPage when viewing a scored resume (same as ResumeScoringPage)
  /* Create / Send Assessment | AI Interview popup — one element for every
     render path: the page's own return and the scored-candidate view's
     early return (its Invite menu opens this too). */
  const versionInviteDialogEl = inviteDialog ? (
        <VersionInviteDialog
          kind={inviteDialog.kind}
          onClose={() => {
            const closedKind = inviteDialog.kind;
            setInviteDialog(null);
            /* The popup creates, edits, publishes, archives and duplicates
               versions in place, so this page's own reads of them (Create's
               cap and gate, Send Invite, the results tabs and their badges)
               are re-read once it closes — the AI one past its fetched-once
               guard, as Publish on this page does. */
            if (closedKind === 'assessment') void fetchAssessmentResults();
            else {
              aiInterviewConfigFetchedRef.current = false;
              void loadAIInterviewConfig();
            }
          }}
          jdId={job.id}
          jdCode={job.job_id}
          jdTitle={job.title}
          jobVersionNumber={job.versionNumber && job.versionNumber > 0 ? job.versionNumber : undefined}
          candidates={inviteDialog.candidates}
          preselect={inviteDialog.preselect}
          /* Create / Send AI Interview: no Duplicate in the version ⋯ menu. */
          hideDuplicate={inviteDialog.kind === 'interview'}
          disabledReason={
            !(inviteDialog.kind === 'assessment' ? features.assessment : features.ai_interview)
              ? `${inviteDialog.kind === 'assessment' ? 'Assessments are' : 'AI Interviews are'} not enabled for your workspace.`
              : job.status === 'Disabled' ? 'This job description is disabled, so nothing can be sent for it.' : null
          }
          /* Send (the picked version) and Browse all → Share Assessment via
             Email, pre-filled with the assessment(s) and the ticked
             candidates; that step validates and sends. */
          /* Next → Share Assessment via Email as the popup's own second step;
             a send refreshes this page's assessment count and results. */
          onAssessmentsSent={(sent) => {
            setAssessmentInviteCount((prev) => prev + sent);
            void fetchAssessmentResults();
          }}
          /* Next → Send AI Interview via Email as the popup's own second
             step; a send counts here as this page's own Invite does. */
          onInterviewsSent={(sent) => {
            setAiInterviewCount((prev) => prev + sent);
            toast.success(`${sent} AI interview invitation${sent === 1 ? '' : 's'} sent`);
          }}
          onSent={(kind, sent) => {
            if (kind === 'assessment') void fetchAssessmentResults();
            else setAiInterviewCount((prev) => Math.max(prev + sent, 1));
          }}
        />
  ) : null;

  if (viewingScoredResume) {
    const _scoredIdx = scoredResumes.findIndex(
      (r: any) => scoredResumeId(r) === scoredResumeId(viewingScoredResume),
    );
    const _goToScoredCandidate = (idx: number) => {
      const r = scoredResumes[idx];
      if (!r) return;
      setViewingScoredResume(toCandidateDetail(r));
    };
    return (
      <>
      <CandidateScoringDetailPage
        resume={viewingScoredResume}
        jobTitle={job.title}
        jobId={job.id}
        /* The scored resume's version as a plain badge — this view is that
           one version's score, so there is no version switcher here. */
        versionReadOnly
        onBack={() => setViewingScoredResume(null)}
        breadcrumbItems={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Job Descriptions', href: '/recruitment/job-openings' },
          { label: job.title || 'Job Details', onClick: () => setViewingScoredResume(null) },
          { label: viewingScoredResume.candidateName || 'Candidate Details' },
        ]}
        currentIndex={_scoredIdx >= 0 ? _scoredIdx : undefined}
        totalCount={scoredResumes.length}
        onPrev={_scoredIdx > 0 ? () => _goToScoredCandidate(_scoredIdx - 1) : undefined}
        onNext={_scoredIdx >= 0 && _scoredIdx < scoredResumes.length - 1 ? () => _goToScoredCandidate(_scoredIdx + 1) : undefined}
        /* Handed down rather than re-resolved inside the candidate page, so
           its Invite menu is gated on the very same answer as the row it was
           opened from and as the sections above. */
        assessmentConfigured={canInviteToAssessment}
        aiInterviewConfigured={canInviteToAIInterview}
        /* Invite ▾ → the same Create / Send popup as the Scored Resumes
           tab's row and selection menus, for this candidate. */
        onOpenInviteDialog={(kind, invitees) => openInviteDialog(kind, invitees, 'score-resume')}
        /* Create / Send Assessment | AI Interview as their own buttons (no
           Invite ▾), an icon-only View Resume and "Scorecard". */
        inlineHeaderActions
      />
      {versionInviteDialogEl}
      </>
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
        breadcrumbItems={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Job Descriptions', href: '/recruitment/job-openings' },
          { label: job.title || 'Job Details', onClick: () => setViewingAssessmentResult(null) },
          { label: viewingAssessmentResult.candidateName || 'Candidate Details' },
        ]}
        assessmentId={aId}
        candidateId={viewingAssessmentResult.id}
        candidateDisplayId={viewingAssessmentResult.candidateDisplayId}
        assessmentTitle={viewingAssessmentResult.assessmentName || job.title}
        jdId={job.id}
        /* This page IS one job version, so its own title and the version number
           it already displays are what the result's Job Title row should name:
           `job.versionNumber`, the same value the header's version selector
           reads. */
        jdTitle={job.title}
        jdVersion={job.versionNumber && job.versionNumber > 0 ? job.versionNumber : null}
        assessmentVersion={viewingAssessmentResult.assessmentVersion}
        currentIndex={_arIdx >= 0 ? _arIdx : undefined}
        totalCount={_nonPendingResults.length}
        onPrev={_arIdx > 0 ? () => _goToResult(_arIdx - 1) : undefined}
        onNext={_arIdx >= 0 && _arIdx < _nonPendingResults.length - 1 ? () => _goToResult(_arIdx + 1) : undefined}
      />
    );
  }

  // Results-tab actions — the same pair as the Overview quick-action group, so
  // the recruiter can create or invite without scrolling back up. Built here
  // rather than inline because each tab hands them to a child toolbar (and the
  // AI interview tab also falls back to a standalone strip when there are no
  // results to hang a toolbar off).
  // Same gate for the Scored Resumes toolbar button and its empty-state CTA, so
  // the tab never offers scoring in one place and withholds it in the other.
  // The permission part only greys the buttons out (scoreResumesDisabled /
  // aria-disabled) — permission-gated controls are never hidden.
  const canOfferScoreResumesFromTab =
    hasPlanFeature('resume_scoring') && job.status !== 'Disabled';

  const hasAssessmentInviteSent = assessmentInviteCount > 0;
  // Result tabs open only once someone has a result to show.
  const hasAssessmentResults = assessmentFinishedCount > 0;
  const hasAIInterviewResults = aiInterviewResultCount > 0;
  const hasAIInterviewInviteSent = aiInterviewCount > 0;

  // Single buttons for the AI Interview Result tab's empty state.
  // Permission-gated: stays visible, greyed out with a tooltip, when the user
  // lacks the permission (aria-disabled so the tooltip still shows on hover).
  const aiInterviewCreateAction =
    hasPlanFeature('ai_interview') ? (
      <Button
        variant="primary"
        onClick={() => { if (permissions.canCreateAIInterviews) handleCreateAIInterview(); }}
        aria-disabled={!permissions.canCreateAIInterviews || undefined}
        className={!permissions.canCreateAIInterviews ? 'opacity-60 cursor-not-allowed' : undefined}
        disabled={
          permissions.canCreateAIInterviews && (
            !features.ai_interview
            || job.status === 'Disabled'
            || resolvingAIInterviewTarget
            || blockAIInterviewCreate
          )
        }
        title={
          !permissions.canCreateAIInterviews
            ? 'You do not have permission to create AI interviews'
            : aiInterviewCreateBlockedReason ?? undefined
        }
      >
        {resolvingAIInterviewTarget
          ? <Loader2 className="w-4 h-4 animate-spin" />
          : <Sparkles className="w-4 h-4" />}
        Create
      </Button>
    ) : null;

  const aiInterviewInviteAction =
    hasPlanFeature('ai_interview') ? (
      <Button
        variant="primary"
        /* Wrapped so the click event isn't passed through as the candidate
           seed — this entry point opens the form empty. */
        onClick={() => { if (permissions.canShareAIInterviews) handleInviteAIInterview(); }}
        aria-disabled={!permissions.canShareAIInterviews || undefined}
        className={!permissions.canShareAIInterviews ? 'opacity-60 cursor-not-allowed' : undefined}
        disabled={permissions.canShareAIInterviews && !canInviteToAIInterview}
        title={
          !permissions.canShareAIInterviews
            ? 'You do not have permission to invite candidates to an AI interview'
            : !features.ai_interview
            ? 'AI Interviews not enabled'
            : job.status === 'Disabled'
              ? 'JD is disabled'
              : !hasAnyAIInterview
                ? 'Create an AI interview first'
                : !hasLiveAIInterview
                  ? 'Publish the AI interview first'
                  : undefined
        }
      >
        <UserPlus className="w-4 h-4" />
        Send Invite
      </Button>
    ) : null;

  // A JD can only ever have one live AI interview, so once it is published
  // Create has nothing left to do — the empty state offers Send Invite instead.
  const aiInterviewEmptyActions = hasLiveAIInterview
    ? aiInterviewInviteAction
    : aiInterviewCreateAction;

  /* AI Talent Match Results tab badge — holds the loading placeholder until
     the server's distinct-candidate total arrives, rather than showing an
     interim `sum(session.total_matches)` first. That sum double-counts a
     candidate matched across more than one session of this job, so it used
     to flash a higher number before dropping to the real, lower count —
     visibly "changing" right as the user opened the tab. Showing nothing
     until the real count is ready means the badge never has to correct
     itself. */
  const aiMatchBadgeCount = (loadingAiMatch || aiMatchTotal === null)
    ? null
    : aiMatchTotal;

  return (
    // overflow-x-clip, not overflow-x-hidden/overflow-y-auto: the latter pair
    // makes this <main> its own scroll container, but it never actually gets
    // height-bound enough to be what scrolls — the dashboard layout's own
    // overflow-y-auto div does. `position: sticky` resolves against the
    // NEAREST scroll container regardless of whether that container is the
    // one actually moving, so the breadcrumb was pinning to this <main> (which
    // never scrolls) while the real scrolling happened one level up — visibly
    // dragging the "stuck" breadcrumb away. `clip` doesn't establish a scroll
    // container at all, so the app's single real scroller is what sticky
    // resolves against, matching the working list pages (JobsListing, etc).
    <main className="flex-1 overflow-x-clip bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
      {/* Breadcrumb — must be a DIRECT child of the card so `sticky` has the
          card's full height to travel within. Nested inside a wrapper div it
          was boxed to its own height and could never actually stick. */}
      <PageBreadcrumb
        barRef={breadcrumbBarRef}
        items={jobBreadcrumbItems}
        className="mb-3"
        // Previous / Next rides inside the breadcrumb bar instead of sitting on
        // its own row below it, so it stays reachable while the sticky crumb is
        // pinned. Uses the shared RecordPager rather than the hand-rolled grey
        // buttons this page used to carry — that was the one pager in the app
        // not in brand-blue.
        actions={
          <RecordPager
            currentIndex={currentIndex}
            totalCount={totalCount}
            onPrev={prevId ? () => router.push(`/recruitment/job-details?id=${prevId}`) : undefined}
            onNext={nextId ? () => router.push(`/recruitment/job-details?id=${nextId}`) : undefined}
          />
        }
      />
      {/* Header */}
      <div className="mb-5">
        {/* Job Details Card — neutral card chrome matching the Job Openings
            master (gray border + subtle ring/shadow), not a brand-tinted card. */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 p-4 sm:p-5">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
            {/* Icon disc + content, mirroring the master page header's
                leading brand-blue tile. */}
            <div className="flex flex-1 min-w-0 items-start gap-3">
              <div className="hidden sm:flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15">
                <Briefcase className="h-4 w-4 text-brand-blue" />
              </div>
              <div className="flex-1 min-w-0">
              {/* Row 1: JD ID + Job Title + Status */}
              <div className="flex flex-wrap items-center gap-2 mb-2">
                {job.job_id && (
                  <span className="inline-flex items-center px-2 py-0.5 bg-brand-blue text-white rounded-md text-xs font-semibold font-mono tracking-wide">
                    {job.job_id}
                  </span>
                )}
                <h1 className="font-semibold text-gray-900 dark:text-slate-50 text-lg sm:text-xl truncate">
                  <button
                    type="button"
                    onClick={handleShowOverview}
                    className="max-w-full cursor-pointer truncate rounded text-left align-baseline transition-colors hover:text-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 focus-visible:ring-offset-2"
                    aria-label="Show job overview"
                    title="Show job overview"
                  >
                    {job.title}
                  </button>
                </h1>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border whitespace-nowrap ${getStatusBadgeClass(getDisplayStatus(job.status, job.currentVersion))}`}>
                  {getDisplayStatus(job.status, job.currentVersion)}
                </span>
              </div>

              {/* Row 2: Location + Education + Employment Type + Work Mode + Posted Date + Posted By + Version */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-600 dark:text-slate-400">
                {/* Location */}
                {formatLocationGroups(job.locations, job.location).length > 0 && (
                  <>
                    {formatLocationGroups(job.locations, job.location).map((label) => (
                      <div key={label} className="flex items-center gap-1.5">
                        <MapPin className="w-4 h-4 text-brand-blue" />
                        <span>{label}</span>
                      </div>
                    ))}
                    <span className="text-gray-300">•</span>
                  </>
                )}

                {/* Experience Level */}
                {job.experience_level && (
                  <span className="inline-flex items-center px-2.5 py-1 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-md text-xs">
                    {formatJobExperienceBadge({
                      jobLevel: job.experience_level,
                      experienceText: job.experience,
                    })}
                  </span>
                )}

                {/* Education chip REMOVED 2026-08-21. Education is a requirement
                    line inside Must-Have / Nice-to-Have Additional Requirements and is
                    shown there only. It used to appear here AND as a Requirements tile
                    AND inside MHAR, so the same degree was on screen up to three times
                    and was graded twice by resume scoring. */}

                {/* Employment Type */}
                {job.employmentType && (
                  <>
                    <span className="inline-flex items-center px-2.5 py-1 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-md text-xs">
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
                    <span className="inline-flex items-center px-2.5 py-1 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-md text-xs">
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
                  <span className="inline-flex items-center px-2.5 py-1 bg-success-subtle text-success rounded-md text-xs font-medium">
                    {formatSalaryRange({
                      min: job.salaryMin,
                      max: job.salaryMax,
                      currency: job.salaryCurrency,
                    })}
                    {job.compensationType ? ` / ${job.compensationType}` : ''}
                  </span>
                )}

                {/* Separator before Posted Info */}
                {(job.location || job.employmentType || job.workMode || job.salaryMin || job.salaryMax) && (
                  <span className="text-gray-300">•</span>
                )}

                {/* Posted / By / Last Updated — bold label + lighter value, no
                    icons, matching the Job Openings card meta hierarchy
                    (JobOpeningSummary's MetaLabelValue). The bullets between the
                    three were dropped: the label weight is what now separates
                    them, exactly as on the master card. */}
                <span className="inline-flex items-center gap-1">
                  <span className="font-medium text-gray-700 dark:text-slate-300">Posted:</span>
                  <span className="font-normal text-gray-500 dark:text-slate-400">{job.postedDate ? formatISTDateTime(job.postedDate) : 'N/A'}</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="font-medium text-gray-700 dark:text-slate-300">By:</span>
                  <span className="font-normal text-gray-500 dark:text-slate-400">{job.postedBy || 'Unknown'}</span>
                </span>
                {job.updated_at && (
                  <span className="inline-flex items-center gap-1">
                    <span className="font-medium text-gray-700 dark:text-slate-300">Last Updated:</span>
                    <span className="font-normal text-gray-500 dark:text-slate-400">{formatLastUpdated(job.updated_at)}</span>
                  </span>
                )}
                <span className="text-gray-300">•</span>

                {/* Version Badge — the deep brand orange (--brand-orange-deep,
                    globals.css); white text on it reads clearly. Its menu's
                    "Selected" chip is the same orange, tinted. */}
                {job.versionNumber && job.versionNumber > 0 ? (
                  <div className="relative" ref={versionMenuRef}>
                    <button
                      type="button"
                      onClick={toggleVersionMenu}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-brand-orange-deep text-white rounded-full text-xs font-medium hover:bg-brand-orange-deep/90 transition-colors"
                      aria-label={`Select job version, currently v${job.versionNumber}.0`}
                      aria-haspopup="menu"
                      aria-expanded={showVersionMenu}
                    >
                      v{job.versionNumber}.0
                      <ChevronDown className={`w-3 h-3 transition-transform ${showVersionMenu ? 'rotate-180' : ''}`} />
                    </button>

                    {showVersionMenu && (
                      <div
                        role="menu"
                        aria-label="Available job versions"
                        className="absolute left-0 top-full mt-2 w-56 max-w-[calc(100vw-1.5rem)] max-h-72 overflow-y-auto bg-white dark:bg-slate-900 rounded-lg shadow-lg border border-gray-200 dark:border-slate-700 py-1 z-50"
                      >
                        {versionMenuLoading ? (
                          <div className="flex items-center gap-2 px-3 py-3 text-xs text-gray-500 dark:text-slate-400">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Loading versions...
                          </div>
                        ) : versionMenuError ? (
                          <div className="px-3 py-3 text-xs text-destructive">
                            {versionMenuError}
                          </div>
                        ) : sortedLineageVersions.length === 0 ? (
                          <div className="px-3 py-3 text-xs text-gray-500 dark:text-slate-400">
                            No versions available
                          </div>
                        ) : (
                          sortedLineageVersions.map((version) => {
                            const isCurrentVersion = version.id === job.id;
                            return (
                              <button
                                key={version.id}
                                type="button"
                                role="menuitem"
                                disabled={isCurrentVersion}
                                onClick={() => handleVersionSelect(version)}
                                className={`w-full px-3 py-2 text-left transition-colors ${isCurrentVersion ? 'bg-brand-blue/5 cursor-default' : 'hover:bg-brand-blue/5'}`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-semibold text-gray-900 dark:text-slate-100">
                                    v{version.version_number ?? 1}.0
                                  </span>
                                  <div className="flex items-center gap-1">
                                    <span className="text-2xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300 capitalize">
                                      {version.status}
                                    </span>
                                    {isCurrentVersion ? (
                                      <span className="text-2xs px-1.5 py-0.5 rounded-full bg-brand-orange/10 text-brand-orange-deep dark:bg-brand-orange/20 dark:text-brand-orange">
                                        Selected
                                      </span>
                                    ) : version.is_latest_version ? (
                                      <span className="text-2xs px-1.5 py-0.5 rounded-full bg-success-subtle text-success">
                                        Latest
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                                <div className="text-2xs text-gray-500 dark:text-slate-400 truncate">
                                  {version.job_id || version.title}
                                  {version.published_at ? ` • ${formatToIST(version.published_at)}` : ''}
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-1 bg-brand-orange-deep text-white rounded-full text-xs font-medium">
                    v1.0
                  </span>
                )}
              </div>
              </div>
            </div>

            {/* Below lg the header stacks (flex-col), so this group is its last
                row: self-end puts Edit / Disable / Archive in the card's
                bottom-right corner. The ml-6 gap is only for the lg row layout,
                where it separates the group from the job info beside it — below
                lg it indented the icons off the left edge instead. */}
            <div className="flex items-center gap-3 self-end lg:self-auto lg:ml-6">
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
                className="flex items-center gap-2 px-4 py-2 bg-success text-white rounded-md hover:bg-success transition-colors"
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
              <div className="bg-warning-subtle border border-warning-line text-warning-strong px-3 py-2 rounded-lg text-sm flex items-center gap-2">
                <Ban className="w-4 h-4 flex-shrink-0" />
                <span>
                  This JD is in use ({job.usageStatus.usage.total_usage_count} {job.usageStatus.usage.total_usage_count === 1 ? 'usage' : 'usages'}) and cannot be edited.
                </span>
              </div>
            )}

            {/* Edit — published JDs only. Deliberately NOT disabled when the JD
                is in use: the point of the click is to explain *why* it cannot
                be edited, naming the modules holding it. The page owns that
                check (it re-reads usage status live) and this only asks.

                The one exception is `editDisabled`, which the host sets when
                the JD may not be edited at all and there is nothing a click
                could usefully offer — an earlier version of its lineage, where
                only the latest is editable. Then the button is genuinely
                disabled and the reason is a hover tooltip instead of a
                post-click modal. The tooltip's handlers sit on the wrapper, not
                the button, so they still fire over a disabled control. */}
            {/* Edit / Disable / Archive, icon-only.
                Every one of them carries an `aria-label` AND a `title`: with the
                caption gone the icon is the only thing naming the action, so a
                screen reader and a hover both have to be able to recover it.

                Disable and Archive are new HERE — their handlers existed and the
                host had always passed `onDisable` / `onArchive`, but this page
                rendered no control for either, so the only way to reach them was
                the job list's row menu. The host gates both on permission by
                passing `undefined`, which is why the render test is simply
                whether the prop is there. */}
            {job.status === 'Published' && (
              <div className="flex items-center gap-2">
                {onEdit && (
                  editLocked ? (
                    <button
                      type="button"
                      aria-disabled="true"
                      onClick={() => { /* locked: tooltip only */ }}
                      className={`${JOB_ICON_ACTION_BASE} !bg-gray-50 dark:!bg-slate-800 text-gray-400 dark:text-slate-500 !border-gray-200 dark:!border-slate-700 cursor-not-allowed opacity-60`}
                      aria-label="Edit this JD"
                      title="You do not have permission to edit job descriptions"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                  ) : editDisabled ? (
                    <Tooltip content={editDisabledReason} position="bottom">
                      <button
                        type="button"
                        disabled
                        aria-disabled="true"
                        className={`${JOB_ICON_ACTION_BASE} !bg-gray-50 dark:!bg-slate-800 text-gray-400 dark:text-slate-500 !border-gray-200 dark:!border-slate-700 cursor-not-allowed`}
                        aria-label={editDisabledReason || 'Editing is not available for this JD'}
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                    </Tooltip>
                  ) : (
                    <button
                      onClick={handleEdit}
                      className={`${JOB_ICON_ACTION_BASE} ${JOB_ICON_ACTION_EDIT}`}
                      aria-label="Edit this JD" title="Edit this JD"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                  )
                )}

                {/* Orange on hover, matching the job list's Disable menu item —
                    it takes the JD out of service, so it should not look like
                    the neutral pair either side of it. */}
                {onDisable && (
                  <button
                    onClick={() => { if (!disableLocked) handleDisable(); }}
                    aria-disabled={disableLocked || undefined}
                    className={
                      disableLocked
                        ? `${JOB_ICON_ACTION_BASE} !bg-gray-50 dark:!bg-slate-800 text-gray-400 dark:text-slate-500 !border-gray-200 dark:!border-slate-700 cursor-not-allowed opacity-60`
                        : `${JOB_ICON_ACTION_BASE} ${JOB_ICON_ACTION_DISABLE}`
                    }
                    aria-label="Disable this JD"
                    title={disableLocked ? 'You do not have permission to disable job descriptions' : 'Disable this JD'}
                  >
                    <Ban className="w-4 h-4" />
                  </button>
                )}

                {onArchive && (
                  <button
                    onClick={() => { if (!archiveLocked) handleArchive(); }}
                    aria-disabled={archiveLocked || undefined}
                    className={
                      archiveLocked
                        ? `${JOB_ICON_ACTION_BASE} !bg-gray-50 dark:!bg-slate-800 text-gray-400 dark:text-slate-500 !border-gray-200 dark:!border-slate-700 cursor-not-allowed opacity-60`
                        : `${JOB_ICON_ACTION_BASE} ${JOB_ICON_ACTION_ARCHIVE}`
                    }
                    aria-label="Archive this JD"
                    title={archiveLocked ? 'You do not have permission to archive job descriptions' : 'Archive this JD'}
                  >
                    <Archive className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}

            {/* JD15: Action Buttons - For Disabled jobs */}
            {job.status === 'Disabled' && (
              <div className="flex items-center gap-2">
                {onEnable && (
                  <Button
                    variant="primary"
                    onClick={() => { if (!disableLocked) onEnable(job); }}
                    aria-disabled={disableLocked || undefined}
                    className={disableLocked ? 'opacity-60 cursor-not-allowed' : undefined}
                    icon={<CheckCircle className="w-4 h-4" />}
                    aria-label="Re-enable this JD"
                    title={disableLocked ? 'You do not have permission to re-enable job descriptions' : 'Re-enable this JD'}
                  >
                    Re-enable JD
                  </Button>
                )}
              </div>
            )}

            {/* Action Buttons - For Archived jobs */}
            {job.status === 'Archived' && (
              <div className="flex items-center gap-2">
                {onUnarchive && (
                  <Button
                    variant="primary"
                    onClick={() => onUnarchive(job)}
                    icon={<ArchiveRestore className="w-4 h-4" />}
                  >
                    Unarchive
                  </Button>
                )}
                {/* Delete button - COMMENTED OUT */}
                {false && onDelete && (
                  <button
                    onClick={handleDelete}
                    className="p-2 text-destructive hover:text-destructive hover:bg-destructive-subtle rounded-lg transition-all"
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

      {/* Tab Navigation — NOT sticky: the tabs and the toolbar they hold scroll
          naturally with the page, like the Job Openings master toolbar. */}
      <div
        /* pb-2 only on Overview: that tab has no toolbar row below the tabs, so
           without it the underline track would sit flush against the card's
           bottom border (reading as a doubled border at the rounded corners).
           Result tabs already get this breathing room from the toolbar slot. */
        className={`mb-5 bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5${activeTab === 'overview' ? ' pb-2' : ''}`}
      >
        {/* Underline tabs. The border-b "track" is on this NON-scrolling outer
            div; the inner div is the horizontal scroll container (scrollbar-hide,
            no border of its own) pulled up 1px via -mb-px so each active tab's
            border-b-2 overlaps the track. Keeping the border OFF the scroll
            container removes the stray 1px vertical scrollbar overflow-x would
            otherwise force (overflow-x:auto makes the browser compute
            overflow-y:auto, and the tabs were 1px taller than the row). */}
        <div className="border-b border-gray-200 dark:border-slate-700">
          <div className="flex items-center gap-1 px-2 sm:px-3 -mb-px overflow-x-auto scrollbar-hide">
          <button
            onClick={() => setActiveTab('overview')}
            className={detailTabClass(activeTab === 'overview')}
          >
            {/* Tab icons carry no colour of their own — lucide draws in
                `currentColor`, so each one inherits its tab's active, idle or
                disabled text colour and cannot fall out of step with it. */}
            <FileText className="w-4 h-4" />
            Overview
          </button>
          {(
            <button
              onClick={() => !aiMatchPlanLocked && setActiveTab('ai-talent-match')}
              disabled={aiMatchPlanLocked}
              aria-disabled={aiMatchPlanLocked || undefined}
              title={aiMatchPlanLocked ? PLAN_LOCKED_MESSAGE : undefined}
              className={detailTabClass(activeTab === 'ai-talent-match', aiMatchPlanLocked)}
            >
              <Users className="w-4 h-4" />
              AI Talent Match Results
              <span className={detailTabBadge(activeTab === 'ai-talent-match')}>
                {/* Null while sessions are listing or the per-session dedup
                    fetch is still running — see aiMatchBadgeCount above. */}
                {aiMatchPlanLocked ? (
                  <Lock className="inline-block w-3 h-3 align-middle" aria-label="Not in plan" />
                ) : aiMatchBadgeCount === null ? (
                  <span className="inline-block h-3 w-4 rounded bg-current opacity-30 animate-pulse align-middle" aria-label="Loading count" />
                ) : (
                  aiMatchBadgeCount
                )}
              </span>
            </button>
          )}
          {(
            <button
              onClick={() => !scoringPlanLocked && handleShowScoredResumes()}
              disabled={scoringPlanLocked}
              aria-disabled={scoringPlanLocked || undefined}
              title={scoringPlanLocked ? PLAN_LOCKED_MESSAGE : undefined}
              className={detailTabClass(activeTab === 'scored-resumes', scoringPlanLocked)}
            >
              <ClipboardList className="w-4 h-4" />
              Scored Resumes
              <span className={detailTabBadge(activeTab === 'scored-resumes')}>
                {/* Placeholder, not a provisional 0, until the first fetch settles. */}
                {scoringPlanLocked ? (
                  <Lock className="inline-block w-3 h-3 align-middle" aria-label="Not in plan" />
                ) : !scoredResumesLoaded ? (
                  <span className="inline-block h-3 w-4 rounded bg-current opacity-30 animate-pulse align-middle" aria-label="Loading count" />
                ) : (
                  scoredResumesStats.total
                )}
              </span>
            </button>
          )}
          {(
            /* Disabled until an assessment is published — the tab would open on
               an empty table otherwise, which reads as a fault rather than as
               "there is nothing to report yet". */
            <button
              onClick={() => !assessmentPlanLocked && hasAssessmentResults && setActiveTab('assessment-results')}
              disabled={assessmentPlanLocked || !hasAssessmentResults}
              title={
                assessmentPlanLocked
                  ? PLAN_LOCKED_MESSAGE
                  : hasAssessmentResults
                  ? undefined
                  : !hasAnyAssessment
                    ? 'Create an assessment first'
                    : !hasPublishedAssessment
                      ? 'Publish the assessment to see results'
                      : !hasAssessmentInviteSent
                        ? 'Send at least one invite first'
                        : 'Results appear once a candidate completes or is terminated'
              }
              className={detailTabClass(activeTab === 'assessment-results', assessmentPlanLocked || !hasAssessmentResults)}
            >
              <BarChart3 className="w-4 h-4" />
              Assessments Results
              <span className={detailTabBadge(activeTab === 'assessment-results')}>
                {assessmentPlanLocked ? (
                  <Lock className="inline-block w-3 h-3 align-middle" aria-label="Not in plan" />
                ) : (assessmentTableTotal ?? assessmentResultTotal) === null ? (
                  <span className="inline-block h-3 w-4 rounded bg-current opacity-30 animate-pulse align-middle" aria-label="Loading count" />
                ) : (
                  assessmentTableTotal ?? assessmentResultTotal
                )}
              </span>
            </button>
          )}
          {(aiInterviewPlanLocked || features.ai_interview) && (
            /* Same rule as the assessment results tab. Without the view
               permission the tab stays visible but greyed out (tooltip only). */
            <button
              onClick={() => !aiInterviewPlanLocked && permissions.canViewAIInterviews && hasAIInterviewResults && handleShowAIInterviewResults()}
              disabled={aiInterviewPlanLocked || (permissions.canViewAIInterviews && !hasAIInterviewResults)}
              aria-disabled={aiInterviewPlanLocked || !permissions.canViewAIInterviews || !hasAIInterviewResults || undefined}
              title={
                aiInterviewPlanLocked
                  ? PLAN_LOCKED_MESSAGE
                  : !permissions.canViewAIInterviews
                  ? 'You do not have permission to view AI interview results'
                  : hasAIInterviewResults
                  ? undefined
                  : !hasAnyAIInterview
                    ? 'Create an AI interview first'
                    : !hasLiveAIInterview
                      ? 'Publish the AI interview to see results'
                      : !hasAIInterviewInviteSent
                        ? 'Send at least one invite first'
                        : 'Results appear once a candidate completes or is terminated'
              }
              className={detailTabClass(activeTab === 'ai-interview-results', aiInterviewPlanLocked || !permissions.canViewAIInterviews || !hasAIInterviewResults)}
            >
              <MessageSquare className="w-4 h-4" />
              AI Interview Result
              <span className={detailTabBadge(activeTab === 'ai-interview-results')}>
                {aiInterviewPlanLocked ? (
                  <Lock className="inline-block w-3 h-3 align-middle" aria-label="Not in plan" />
                ) : (aiInterviewTableTotal ?? aiInterviewResultTotal) === null ? (
                  <span className="inline-block h-3 w-4 rounded bg-current opacity-30 animate-pulse align-middle" aria-label="Loading count" />
                ) : (
                  aiInterviewTableTotal ?? aiInterviewResultTotal
                )}
              </span>
            </button>
          )}
          </div>
        </div>

        {/* Toolbar slot — each result tab portals its search / dropdown / filter
            row in here, so the controls render as the SECOND ROW of this tab
            card (directly under the tabs) rather than as a detached panel below
            it. Only present off Overview (which has no toolbar). `overflow-
            visible` lets the Select All / Sort / More-Filters dropdowns escape
            the card; `empty:hidden` drops the divider until a tab fills it. */}
        {activeTab !== 'overview' && (
          <div
            ref={setTabToolbarSlot}
            /* px-3 sm:px-4 insets BOTH the toolbar row and the More Filters
               panel ~16px from the card's side borders (matching the Job
               Openings master's p-4), so the filter inputs no longer sit flush
               against the card edge. */
            className="px-3 sm:px-4 pt-3 overflow-visible empty:hidden"
          />
        )}
      </div>

      {/* Overview Tab Content */}
      {activeTab === 'overview' && (
      <div ref={overviewSectionRef} className="grid grid-cols-1 lg:grid-cols-12 gap-5 scroll-mt-5">
        {/* Left Column - Job Details. tf-justify-mobile (globals.css):
            every Overview section's text is justified on phones. */}
        <div className="lg:col-span-8 space-y-5 tf-justify-mobile">
          {/* Complete Job Description */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 overflow-hidden">
            {/* JD Header - COMMENTED OUT
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100 px-8 py-6">
              <div className="flex items-start justify-between mb-2">
                <h1 className="text-2xl text-gray-900">{job.title}</h1>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg shadow-sm">
                  <History className="w-4 h-4" />
                  <span className="text-sm font-medium">
                    Version {job.versionNumber && job.versionNumber > 0 ? `${job.versionNumber}.0` : '1.0'}
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
                {formatLocationGroups(job.locations, job.location).map((label) => (
                <div key={label} className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-brand-blue" />
                  <span>{label}</span>
                </div>
                ))}
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
                    <div className="markdown-content prose prose-sm max-w-none text-gray-700 dark:text-slate-300">
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
                  <div className="text-gray-500 dark:text-slate-500 italic text-center py-8">
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

          {/* JD22 - Additional Details. Sits ABOVE the internal/assessment pair and full
              width, because unlike those two this is part of the job as the CANDIDATE
              sees it, not a recruiter-side annotation. Rendered only when the recruiter
              filled it in (requirement 4), so an unused field costs no vertical space -
              which is why it does not follow the "No ... provided" placeholder pattern
              the two cards below use. */}
          {job.additionalDetails && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 p-4">
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-medium text-gray-900 dark:text-slate-50">Additional Details</h3>
                <span className="text-xs text-success bg-success-subtle border border-success-line px-2 py-0.5 rounded">
                  Visible to candidates
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-slate-400 whitespace-pre-wrap">{job.additionalDetails}</p>
            </div>
          )}

          {/* Internal Recruiter Notes & Assessment Guidance - Side by Side */}
          <div className="grid grid-cols-2 gap-4">
            {/* Internal Recruiter Notes */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 p-4">
              <h3 className="text-sm font-medium text-gray-900 dark:text-slate-50 mb-3">Internal Recruiter Notes</h3>
              <div className="text-sm text-gray-600 dark:text-slate-400 space-y-2">
                {job.internalRecruiterComments && job.internalRecruiterComments.length > 0 ? (
                  <ul className="list-disc list-inside space-y-1">
                    {job.internalRecruiterComments.map((note, index) => (
                      <li key={index}>{note}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-500 dark:text-slate-500 italic">No internal notes added</p>
                )}
              </div>
            </div>

            {/* Assessment Guidance — greyed out (not hidden) when the plan lacks assessments */}
            {(
              <div
                title={assessmentPlanLocked ? PLAN_LOCKED_MESSAGE : undefined}
                aria-disabled={assessmentPlanLocked || undefined}
                className={`${assessmentPlanLocked ? 'opacity-60 cursor-not-allowed ' : ''}bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 p-4`}>
                <h3 className="text-sm font-medium text-gray-900 dark:text-slate-50 mb-3">Assessment Guidance</h3>
                <div className="text-sm text-gray-600 dark:text-slate-400">
                  {job.assessmentGuidance ? (
                    <p className="whitespace-pre-wrap">{job.assessmentGuidance}</p>
                  ) : (
                    <p className="text-gray-500 dark:text-slate-500 italic">No assessment guidance provided</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Extracted Data Summary - the JD wizard Review step's format, shared
              with every surface that shows it (components/jobs/ExtractedDataSummary). */}
          {hasAnyExtractedData && (
            <ExtractedDataSummary
              mustHaveSkills={mustHaveSkills}
              niceToHaveSkills={niceToHaveSkills}
              mustHaveComments={mustHaveComments}
              niceToHaveComments={niceToHaveComments}
              experience={job.experience}
              experienceNote={requirementLabel(job.experienceMandatory)}
              industry={job.industry_type ? prettifyCode(job.industry_type) : null}
              industryNote={job.industry_type ? criterionScoringLabel(job.industry_type, job.industryMandatory, { isIndustry: true }) : undefined}
              location={job.location}
              locations={job.locations}
              locationNote={job.location ? criterionScoringLabel(job.location, job.locationMandatory) : undefined}
              employmentType={employmentTypeLabel(job.employmentType)}
              workMode={workModeLabel(job.workMode)}
              scoring={{
                allowOverqualified: job.allowOverqualified,
                jobHoppingEnabled: job.jobHoppingEnabled,
                overqualifiedNoNote: 'Experience well above the range scores lower',
              }}
              aiExtracted={job.creation_method === 'ai_generated'}
            />
          )}
        </div>

        {/* Right Column - Actions & Activity. Sticky on lg+ only; `top` comes
            from rightColumnTop (see its comment) — no max-height/overflow here,
            since overflow-y:auto also forces overflow-x to auto and that is
            what produced the stray inner scrollbars. self-start stops the grid
            stretching it to the left column's height, which would leave it
            nothing to stick within. min-w-0 keeps wide content from pushing
            the grid track past its 4/12. Below lg it stacks as before. */}
        <div
          ref={rightColumnRef}
          className="lg:col-span-4 min-w-0 space-y-5 lg:sticky lg:self-start"
          style={rightColumnTop !== undefined ? { top: rightColumnTop } : undefined}
        >
          {/* Quick Actions */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 p-4">
            <QuickActionHeader
              icon={<Zap className="w-4 h-4" />}
              title="Quick Actions"
              accent="blue"
              open={openActionGroups.actions}
              onToggle={() => toggleActionGroup('actions')}
              controls="quick-actions-panel"
            />

            {/* The ungrouped actions, as one bordered list. */}
            <QuickActionPanel
              id="quick-actions-panel"
              open={openActionGroups.actions}
              className="rounded-lg border border-gray-200 dark:border-slate-700 divide-y divide-gray-100 dark:divide-slate-800"
            >
              {/* 1. View JD History — always shown; greyed out (tooltip only)
                  without permission. Permission-gated actions are never hidden. */}
              <QuickActionRow
                icon={<History className="w-4 h-4" />}
                label="View JD History"
                onClick={() => { if (permissions.canReadJD) setShowJDHistory(true); }}
                disabled={!permissions.canReadJD}
                disabledTooltip="You do not have permission to view JD history"
              />

              {/* 2. AI Talent Match */}
              <QuickActionRow
                icon={<Users className="w-4 h-4" />}
                label="AI Talent Match"
                onClick={() => { if (permissions.canRunAiMatch) handleAITalentMatch(); }}
                planLocked={aiMatchPlanLocked}
                disabled={!permissions.canRunAiMatch || !features.ai_talent_match || job.status === 'Disabled'}
                disabledTooltip={
                  !permissions.canRunAiMatch
                    ? 'You do not have permission to run AI Talent Match'
                    : !features.ai_talent_match
                      ? 'AI Match not enabled'
                      : 'JD is disabled'
                }
              />

              {/* 3. Score Resumes */}
              <QuickActionRow
                icon={<ClipboardList className="w-4 h-4" />}
                label="Score Resumes"
                onClick={() => { if (permissions.canRunScoring) setShowSelectSourceModal(true); }}
                planLocked={scoringPlanLocked}
                disabled={!permissions.canRunScoring || job.status === 'Disabled'}
                disabledTooltip={
                  !permissions.canRunScoring
                    ? 'You do not have permission to score resumes'
                    : 'JD is disabled'
                }
              />
            </QuickActionPanel>

            {/* Assessment — Create / Send, Track and Result in one row. The AI
                Interview group below mirrors it, on its own accent. Always
                shown; tiles the user lacks permission for are greyed out. */}
            {(
              <div className="pt-4 mt-4 border-t border-gray-100 dark:border-slate-800">
                <QuickActionHeader
                  icon={<ClipboardList className="w-4 h-4" />}
                  title="Assessment"
                  accent="cyan"
                  open={openActionGroups.assessment}
                  onToggle={() => toggleActionGroup('assessment')}
                  controls="quick-actions-assessment-panel"
                />
                <QuickActionPanel
                  id="quick-actions-assessment-panel"
                  open={openActionGroups.assessment}
                  className="grid grid-cols-4 gap-2"
                >
                  {/* Permission-gated tiles stay visible, greyed out with a
                      tooltip, when the user lacks the permission. */}
                  {/* Create / Send Assessment — the popup creates, publishes
                      and sends versions in place, so one tile covers both. */}
                  <div className="contents">
                    <QuickActionTile
                      icon={<UserPlus className="w-4 h-4" />}
                      label="Create / Send"
                      accent="cyan"
                      planLocked={assessmentPlanLocked}
                      onClick={() => openCreateSendFromTile('assessment')}
                      loading={isLoadingShareAssessments}
                      disabled={!permissions.canCreateAssessments || !features.assessment || job.status === 'Disabled'}
                      disabledTooltip={
                        !permissions.canCreateAssessments
                          ? 'You do not have permission to create or send assessments'
                          : !features.assessment
                            ? 'Assessments not enabled'
                            : 'JD is disabled'
                      }
                    />
                  </div>

                  {(
                    <>
                      <QuickActionTile
                        icon={<Users className="w-4 h-4" />}
                        label="Track"
                        accent="cyan"
                        planLocked={assessmentPlanLocked}
                        onClick={handleTrackAssessmentInvites}
                        disabled={!permissions.canViewAssessments || !features.assessment || !hasAssessmentInviteSent}
                        disabledTooltip={
                          !permissions.canViewAssessments
                            ? 'You do not have permission to track assessment invites'
                            : !features.assessment
                            ? 'Assessments not enabled'
                            : !hasAnyAssessment
                              ? 'Create an assessment first'
                              : !hasPublishedAssessment
                                ? 'Publish the assessment first'
                                : 'Send at least one invite first'
                        }
                      />

                      {/* Results exist only once an assessment is published and
                          candidates can actually sit it — a draft has nothing
                          to report, so the tile stays disabled and says why,
                          matching the Invite tile's own rule. */}
                      <QuickActionTile
                        icon={<BarChart className="w-4 h-4" />}
                        // Opens only once a candidate finished — Completed or
                        // Terminated — same as the results tab.
                        label="Result"
                        accent="cyan"
                        planLocked={assessmentPlanLocked}
                        onClick={handleAssessmentStatus}
                        disabled={!permissions.canViewAssessments || !features.assessment || !hasAssessmentResults}
                        disabledTooltip={
                          !permissions.canViewAssessments
                            ? 'You do not have permission to view assessment results'
                            : !features.assessment
                            ? 'Assessments not enabled'
                            : !hasAnyAssessment
                              ? 'Create an assessment first'
                              : !hasPublishedAssessment
                                ? 'Publish the assessment to see results'
                                : !hasAssessmentInviteSent
                                  ? 'Send at least one invite first'
                                  : 'Results appear once a candidate completes or is terminated'
                        }
                      />

                      {/* Version history — was the icon on the section heading. */}
                      <QuickActionTile
                        icon={<History className="w-4 h-4" />}
                        label="History"
                        accent="cyan"
                        planLocked={assessmentPlanLocked}
                        onClick={() => setShowAssessmentVersionHistory(true)}
                        disabled={!permissions.canCreateAssessments && !permissions.canViewAssessments}
                        disabledTooltip="You do not have permission to view assessment version history"
                      />
                    </>
                  )}
                </QuickActionPanel>
              </div>
            )}

            {/* Always shown; tiles the user lacks permission for are greyed out. */}
            {(
              <div className="pt-4 mt-4 border-t border-gray-100 dark:border-slate-800">
                <QuickActionHeader
                  icon={<Video className="w-4 h-4" />}
                  title="AI Interview"
                  accent="orange"
                  open={openActionGroups.aiInterview}
                  onToggle={() => toggleActionGroup('aiInterview')}
                  controls="quick-actions-ai-interview-panel"
                />
                <QuickActionPanel
                  id="quick-actions-ai-interview-panel"
                  open={openActionGroups.aiInterview}
                  className="grid grid-cols-4 gap-2"
                >
                  {/* Create / Send AI Interview — mirrors the Assessment tile. */}
                  <div className="contents">
                    <QuickActionTile
                      icon={<UserPlus className="w-4 h-4" />}
                      label="Create / Send"
                      accent="orange"
                      planLocked={aiInterviewPlanLocked}
                      onClick={() => openCreateSendFromTile('interview')}
                      disabled={
                        (!permissions.canCreateAIInterviews && !permissions.canShareAIInterviews)
                        || !features.ai_interview
                        || job.status === 'Disabled'
                      }
                      disabledTooltip={
                        !permissions.canCreateAIInterviews && !permissions.canShareAIInterviews
                          ? 'You do not have permission to create or send AI interviews'
                          : !features.ai_interview
                            ? 'AI Interviews not enabled'
                            : 'JD is disabled'
                      }
                    />
                  </div>

                  {(
                    <>
                      <QuickActionTile
                        icon={<Users className="w-4 h-4" />}
                        label="Track"
                        accent="orange"
                      planLocked={aiInterviewPlanLocked}
                        onClick={handleTrackAIInterviewInvites}
                        loading={resolvingTrackInvitesConfig}
                        disabled={!permissions.canViewAIInterviews || !features.ai_interview || !hasAIInterviewInviteSent}
                        disabledTooltip={
                          !permissions.canViewAIInterviews
                            ? 'You do not have permission to track AI interview invites'
                            : !features.ai_interview
                            ? 'AI Interviews not enabled'
                            : !hasAnyAIInterview
                              ? 'Create an AI interview first'
                              : !hasLiveAIInterview
                                ? 'Publish the AI interview first'
                                : 'Send at least one invite first'
                        }
                      />

                      {/* Same rule as the assessment Result tile: a draft or
                          unpublished interview has no sittings to report on. */}
                      <QuickActionTile
                        icon={<BarChart className="w-4 h-4" />}
                        label="Result"
                        accent="orange"
                      planLocked={aiInterviewPlanLocked}
                        onClick={handleAIInterviewStatus}
                        disabled={!permissions.canViewAIInterviews || !features.ai_interview || !hasAIInterviewResults}
                        disabledTooltip={
                          !permissions.canViewAIInterviews
                            ? 'You do not have permission to view AI interview results'
                            : !features.ai_interview
                            ? 'AI Interviews not enabled'
                            : !hasAnyAIInterview
                              ? 'Create an AI interview first'
                              : !hasLiveAIInterview
                                ? 'Publish the AI interview to see results'
                                : !hasAIInterviewInviteSent
                                  ? 'Send at least one invite first'
                                  : 'Results appear once a candidate completes or is terminated'
                        }
                      />

                      {/* Version history — was the icon on the section heading. */}
                      <QuickActionTile
                        icon={<History className="w-4 h-4" />}
                        label="History"
                        accent="orange"
                        planLocked={aiInterviewPlanLocked}
                        onClick={() => setShowAIVersionHistory(true)}
                        disabled={
                          !permissions.canCreateAIInterviews && !permissions.canShareAIInterviews && !permissions.canViewAIInterviews
                        }
                        disabledTooltip="You do not have permission to view AI interview version history"
                      />
                    </>
                  )}
                </QuickActionPanel>
              </div>
            )}

            {/* Add Applicants - hidden */}
          </div>

          {/* Applicant Statistics */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 p-4">
            <h3 className="text-sm font-medium text-gray-900 dark:text-slate-50 mb-3">Applicant Statistics</h3>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-gray-600 dark:text-slate-400">Total Scored Resumes</span>
                  <button
                    type="button"
                    onClick={() => handleShowScoredResumes()}
                    className="cursor-pointer rounded font-medium text-brand-blue hover:text-brand-blue-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 focus-visible:ring-offset-2"
                    aria-label="View total scored resumes details"
                    title="View scored resumes"
                  >
                    {scoredResumesStats.total}
                  </button>
                </div>
                <div className="bg-gray-200 dark:bg-slate-800 rounded-full h-2">
                  <div className="bg-blue-600 h-2 rounded-full" style={{ width: scoredResumesStats.total > 0 ? '100%' : '0%' }}></div>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-gray-600 dark:text-slate-400">Exact Match</span>
                  <button
                    type="button"
                    onClick={() => handleShowScoredResumes('Exact Match')}
                    className="cursor-pointer rounded font-medium text-brand-blue hover:text-brand-blue-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 focus-visible:ring-offset-2"
                    aria-label="View exact match scored resumes details"
                    title="View exact match resumes"
                  >
                    {scoredResumesStats.exactMatch}
                  </button>
                </div>
                <div className="bg-gray-200 dark:bg-slate-800 rounded-full h-2">
                  <div className="bg-success h-2 rounded-full" style={{ width: `${scoredResumesStats.total > 0 ? (scoredResumesStats.exactMatch / scoredResumesStats.total * 100) : 0}%` }}></div>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-gray-600 dark:text-slate-400">Partial Match</span>
                  <button
                    type="button"
                    onClick={() => handleShowScoredResumes('Partial Match')}
                    className="cursor-pointer rounded font-medium text-brand-blue hover:text-brand-blue-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 focus-visible:ring-offset-2"
                    aria-label="View partial match scored resumes details"
                    title="View partial match resumes"
                  >
                    {scoredResumesStats.partialMatch}
                  </button>
                </div>
                <div className="bg-gray-200 dark:bg-slate-800 rounded-full h-2">
                  <div className="bg-brand-orange h-2 rounded-full" style={{ width: `${scoredResumesStats.total > 0 ? (scoredResumesStats.partialMatch / scoredResumesStats.total * 100) : 0}%` }}></div>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-gray-600 dark:text-slate-400">No Match</span>
                  <button
                    type="button"
                    onClick={() => handleShowScoredResumes('No Match')}
                    className="cursor-pointer rounded font-medium text-brand-blue hover:text-brand-blue-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 focus-visible:ring-offset-2"
                    aria-label="View no match scored resumes details"
                    title="View no match resumes"
                  >
                    {scoredResumesStats.noMatch}
                  </button>
                </div>
                <div className="bg-gray-200 dark:bg-slate-800 rounded-full h-2">
                  <div className="bg-destructive h-2 rounded-full" style={{ width: `${scoredResumesStats.total > 0 ? (scoredResumesStats.noMatch / scoredResumesStats.total * 100) : 0}%` }}></div>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Activity — one row per actual EVENT (every JD version
              publish, every scored resume, every AI match run, every
              assessment created, plus the interview config's own creation),
              merged from every source this page already fetches and sorted
              newest-first, rather than one summary row per activity TYPE. That
              is what lets the panel grow past a handful of rows as real
              activity accumulates instead of being capped at one line per
              category regardless of how much actually happened.

              Each row is a title, a Clock-tagged date/time, and a User-tagged
              name. The name is real wherever the backend records who did it,
              and falls back to "System" (this file's own pre-existing
              `job.postedBy || 'System'` convention) where it doesn't, rather
              than leaving the line blank:
                - Job Published / Republished: /jd/{id}/versions returns one
                  entry per PUBLISHED version with its own published_by_name +
                  published_at — one row per version, oldest is "Published",
                  every later one "Republished" (no version number on the
                  title: a republish is that same JD's own version going out
                  again, not a new artifact worth numbering here).
                - Resume Scored: one row per scoring TRIGGER, counting the
                  resumes that trigger scored (see below).
                - AI Talent Match Run: one row per session, counting only
                  that run's NEW matches; the runner's name shows once the
                  API sends one, "System" until then.
                - Assessment Created: one row per Assessment record, from its
                  own created_by_name + created_at + version.
                - AI Interview Created: one row, versioned from the config's
                  own /ai-interview/{id}/version-history (AIInterviewResponse
                  carries no version of its own).
                - Job Disabled / Re-enabled / Archived / Unarchived: one row
                  per audited status transition from /jd/{id}/status-history,
                  with the user who made it and when. */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 p-4">
            <h3 className="text-sm font-medium text-gray-900 dark:text-slate-50 mb-3">Recent Activity</h3>
            <div className="space-y-3">
              {(() => {
                interface ActivityEvent { key: string; dot: string; title: string; date?: string; by?: string }
                const events: ActivityEvent[] = [];

                if (jdVersionHistory.length > 0) {
                  jdVersionHistory.forEach((v) => {
                    events.push({
                      key: `jd-v${v.version_number}`,
                      dot: v.version_number === 1 ? 'bg-success' : 'bg-purple-500',
                      title: v.version_number === 1 ? 'Job Published' : 'Job Republished',
                      date: v.published_at,
                      by: v.published_by_name,
                    });
                  });
                } else {
                  // Lineage fetch hasn't landed (or failed) — fall back to the
                  // JD's own creator/updated fields so Published/Republished
                  // still show something rather than vanishing entirely.
                  if (job.status === 'Published' && job.postedDate) {
                    events.push({ key: 'jd-published', dot: 'bg-success', title: 'Job Published', date: job.postedDate, by: job.postedBy });
                  }
                  if (job.currentVersion && job.currentVersion > 1) {
                    events.push({ key: 'jd-republished', dot: 'bg-purple-500', title: 'Job Republished', date: job.updated_at, by: job.postedBy });
                  }
                }
                /* JD status changes — every Disabled / Re-enabled / Archived /
                   Unarchived, each its own event with who and when, from
                   GET /jd/{id}/status-history. If the JD is Disabled/Archived
                   now but its newest audited event doesn't say so (the change
                   predates status auditing, or the history failed to load),
                   the current status is still shown as one row dated by the
                   JD's last update. */
                const STATUS_DOT: Record<string, string> = {
                  jd_disable: 'bg-destructive', jd_enable: 'bg-success', jd_archive: 'bg-brand-orange', jd_unarchive: 'bg-brand-teal',
                };
                (jdStatusHistory || []).forEach((h) => {
                  events.push({
                    key: `status-${h.id}`,
                    dot: STATUS_DOT[h.action] || 'bg-gray-400',
                    title: h.title,
                    date: h.created_at || undefined,
                    by: h.user_name || undefined,
                  });
                });
                {
                  const latestAuditedStatus = jdStatusHistory?.[0]?.new_status?.toLowerCase();
                  const currentStatus = job.status === 'Archived' ? 'archived' : job.status === 'Disabled' ? 'disabled' : null;
                  if (currentStatus && latestAuditedStatus !== currentStatus) {
                    const statusDate = job.updated_at || jdLastUpdatedAt;
                    events.push(currentStatus === 'archived'
                      ? { key: 'archived', dot: 'bg-brand-orange', title: 'Job Archived', date: statusDate }
                      : { key: 'disabled', dot: 'bg-destructive', title: 'Job Disabled', date: statusDate });
                  }
                }
                /* ONE row per resume-scoring TRIGGER — like AI Talent Match
                   Run, each trigger is its own event (who, when), and its
                   count is the resumes THAT trigger scored, never a running
                   total: "Resume Scored (10)" at 2:30 pm, "Resume Scored (5)"
                   at 4:00 pm. A trigger is the API's batch id where it sends
                   one; otherwise the resumes one trigger scores land
                   back-to-back, so a new trigger starts wherever the same
                   person's scorings are more than 2 minutes apart. Each row is
                   dated by that trigger's latest scoring. */
                {
                  const TRIGGER_GAP_MS = 2 * 60 * 1000;
                  type ScoringTrigger = { key: string; by: string; batchId?: string; count: number; lastTime: number; lastDate?: string };
                  const openTriggerByScorer = new Map<string, ScoringTrigger>();
                  const triggers: ScoringTrigger[] = [];
                  [...scoredResumes]
                    .sort((a: any, b: any) => new Date(a.scoredDate || 0).getTime() - new Date(b.scoredDate || 0).getTime())
                    .forEach((r: any, i: number) => {
                      const scorer = r.scoredBy || 'System';
                      const time = new Date(r.scoredDate || 0).getTime();
                      const open = openTriggerByScorer.get(scorer);
                      const sameTrigger = !!open && (
                        open.batchId && r.batchId ? open.batchId === r.batchId : time - open.lastTime <= TRIGGER_GAP_MS
                      );
                      if (open && sameTrigger) {
                        open.count += 1;
                        open.lastTime = time;
                        open.lastDate = r.scoredDate;
                      } else {
                        const trigger: ScoringTrigger = {
                          key: `scored-${r.batchId || r.id || i}`,
                          by: scorer,
                          batchId: r.batchId,
                          count: 1,
                          lastTime: time,
                          lastDate: r.scoredDate,
                        };
                        triggers.push(trigger);
                        openTriggerByScorer.set(scorer, trigger);
                      }
                    });
                  triggers.forEach((t) => {
                    events.push({ key: t.key, dot: 'bg-blue-500', title: `Resume Scored (${t.count})`, date: t.lastDate, by: t.by });
                  });
                }
                /* ONE row per AI Talent Match RUN — several users run it, so
                   each run stays its own event (who, when). The count is
                   what THAT run newly matched, not its running total: 15 at
                   2:30 pm, then 10 new at 3:00 pm after 10 more resumes were
                   uploaded — not "(15 Matched)", "(25 Matched)". Worked out
                   oldest-first from each session's own result resume ids; a
                   session listed without its results falls back to its
                   total. Who ran it is the session's `run_by_name`; the older
                   spellings are still tried for any payload that predates it,
                   and a run with no resolvable user shows no name at all. */
                const seenMatchedResumeIds = new Set<string>();
                [...aiMatchSessions]
                  .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime())
                  .forEach((s) => {
                    const resultIds = (s.results || []).map((r) => r.resume_id).filter(Boolean);
                    let title: string;
                    if (resultIds.length === 0) {
                      title = `AI Talent Match Run (${s.total_matches ?? 0} Matched)`;
                    } else {
                      const newCount = resultIds.filter((id) => !seenMatchedResumeIds.has(id)).length;
                      resultIds.forEach((id) => seenMatchedResumeIds.add(id));
                      // Only the run's NEW matches — never a running total.
                      title = `AI Talent Match Run (${newCount} Matched)`;
                    }
                    // Who ran it — a NAME only; a bare user id (uuid) is not
                    // shown, it would read as gibberish in place of a name.
                    const raw = s as unknown as Record<string, unknown>;
                    const runBy = [raw.run_by_name, raw.created_by_name, raw.triggered_by_name, raw.user_name, raw.created_by]
                      .find((v): v is string => typeof v === 'string' && v.trim() !== '' && !/^[0-9a-f-]{32,36}$/i.test(v));
                    events.push({
                      key: `ai-match-${s.id}`,
                      dot: 'bg-brand-cyan',
                      title,
                      date: s.created_at,
                      by: runBy,
                    });
                  });
                jdAssessments.forEach((a: any) => {
                  events.push({
                    key: `assessment-${a.id}`,
                    dot: 'bg-indigo-500',
                    // V1 is the assessment's creation; every later record
                    // for this JD is a new version of it.
                    title: (a.version ?? 1) > 1 ? `Assessment Version Created (V${a.version})` : 'Assessment Created (V1)',
                    date: a.created_at,
                    by: a.created_by_name,
                  });
                });
                if (aiInterviewConfig) {
                  /* ONE row: AI Interview has a single version for now. Its
                     version-history endpoint adds an entry for every edit or
                     republish of the config, so listing those would show
                     "Version Created (V2…V7)" for versions that don't exist.
                     The earliest entry is the creation; credited to whoever
                     that entry records, else the config's creator. */
                  const firstEntry = aiInterviewVersionHistory.length > 0
                    ? aiInterviewVersionHistory.reduce((a, b) => (b.version < a.version ? b : a))
                    : undefined;
                  events.push({
                    key: 'ai-interview',
                    dot: 'bg-pink-500',
                    title: `AI Interview Created (V${firstEntry?.version ?? 1})`,
                    date: aiInterviewConfig.created_at,
                    by: aiInterviewConfig.created_by_name || firstEntry?.changed_by_name,
                  });
                }

                // Newest first; an undated row (only ever the current-status
                // fallback) is the job's present state, so it goes first, not last.
                const sortTime = (e: { date?: string }) => (e.date ? new Date(e.date).getTime() : Number.POSITIVE_INFINITY);
                events.sort((a, b) => sortTime(b) - sortTime(a));

                if (events.length === 0) {
                  return <div className="text-sm text-gray-500 dark:text-slate-500 italic">No recent activity</div>;
                }
                const activityTotalPages = Math.max(1, Math.ceil(events.length / ACTIVITY_PAGE_SIZE));
                const safeActivityPage = Math.min(activityPage, activityTotalPages);
                const pageEvents = events.slice((safeActivityPage - 1) * ACTIVITY_PAGE_SIZE, safeActivityPage * ACTIVITY_PAGE_SIZE);
                return (<>
                {pageEvents.map((e) => (
                  <div key={e.key} className="flex gap-3">
                    <div className={`w-2 h-2 ${e.dot} rounded-full mt-1.5 flex-shrink-0`}></div>
                    <div>
                      <div className="text-sm text-gray-900 dark:text-slate-50">{e.title}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500 dark:text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" strokeWidth={1.75} />
                          {e.date ? formatISTDateTime(e.date) : 'N/A'}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <UserIcon className="w-3 h-3" strokeWidth={1.75} />
                          {e.by || 'System'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                {events.length > ACTIVITY_PAGE_SIZE && (
                  /* Compact pager — the shared Pagination is built for
                     full-width tables and overflows this narrow sidebar. */
                  <div className="pt-3 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between gap-2 text-xs text-gray-500 dark:text-slate-400">
                    <span className="tabular-nums">
                      {(safeActivityPage - 1) * ACTIVITY_PAGE_SIZE + 1}–{Math.min(safeActivityPage * ACTIVITY_PAGE_SIZE, events.length)} of {events.length}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setActivityPage(safeActivityPage - 1)}
                        disabled={safeActivityPage <= 1}
                        aria-label="Previous activity page"
                        className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:bg-brand-blue/5 hover:text-brand-blue disabled:opacity-40 disabled:pointer-events-none transition-colors"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <span className="px-1.5 tabular-nums text-gray-700 dark:text-slate-300">
                        <span className="font-semibold text-brand-blue">{safeActivityPage}</span> / {activityTotalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setActivityPage(safeActivityPage + 1)}
                        disabled={safeActivityPage >= activityTotalPages}
                        aria-label="Next activity page"
                        className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:bg-brand-blue/5 hover:text-brand-blue disabled:opacity-40 disabled:pointer-events-none transition-colors"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
                </>);
              })()}
            </div>
          </div>

        </div>
      </div>

      )}

      {/* Scored Resumes Tab Content */}
      {activeTab === 'scored-resumes' && (
        <div ref={scoredResumesSectionRef} className="mt-0 scroll-mt-5">
          {loadingScoredResumes ? (
            /* Mirrors ScoredResumesTable: a search / filter toolbar, then the
               scored-resumes table with the same columns in the same order
               (Candidate Name, Match Status, Score, Experience, Scored By /
               Date, Resume Version) plus its leading select checkbox. */
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 p-4 flex items-center gap-3">
                <Skeleton className="h-10 flex-1 rounded-lg" />
                <Skeleton className="h-10 w-24 rounded-lg" />
                <Skeleton className="h-10 w-10 rounded-lg" />
              </div>
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full md:min-w-[900px] table-auto">
                    <thead className="[&_th]:bg-slate-50 dark:[&_th]:bg-slate-800 [&_th]:border-b [&_th]:border-gray-200 dark:[&_th]:border-slate-700">
                      <tr>
                        <th className="w-10 px-4 py-3 align-middle"><Skeleton className="h-4 w-4 rounded" /></th>
                        {['Candidate Name', 'Match Status', 'Score', 'Experience', 'Scored By / Date', 'Resume Version'].map((h) => (
                          <th key={h} className="px-4 py-3 text-left align-middle"><Skeleton className="h-3 w-20" /></th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-slate-900 divide-y divide-gray-200 dark:divide-slate-700">
                      {Array.from({ length: 8 }).map((_, r) => (
                        <tr key={r}>
                          <td className="px-4 py-4 align-middle"><Skeleton className="h-4 w-4 rounded" /></td>
                          <td className="px-4 py-4 align-middle"><Skeleton className="h-4 w-32" /></td>
                          <td className="px-4 py-4 align-middle"><Skeleton className="h-5 w-20 rounded-full" /></td>
                          <td className="px-4 py-4 align-middle"><Skeleton className="h-4 w-10" /></td>
                          <td className="px-4 py-4 align-middle"><Skeleton className="h-4 w-14" /></td>
                          <td className="px-4 py-4 align-middle"><Skeleton className="h-4 w-28" /></td>
                          <td className="px-4 py-4 align-middle"><Skeleton className="h-5 w-12 rounded-full" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : scoredResumes.length === 0 ? (
            <TabEmptyState
              bordered
              icon={Users}
              imageSrc="/scored-resumes-empty-state.webp"
              imageAlt="Scored resumes illustration"
              title="No Scored Resumes"
              description="Score resumes against this job description to see the candidates here."
              action={canOfferScoreResumesFromTab ? (
                <Button
                  variant="primary"
                  onClick={() => { if (permissions.canRunScoring) setShowSelectSourceModal(true); }}
                  aria-disabled={!permissions.canRunScoring || undefined}
                  title={!permissions.canRunScoring ? 'You do not have permission to score resumes' : undefined}
                  className={!permissions.canRunScoring ? 'opacity-60 cursor-not-allowed' : undefined}
                  icon={<ClipboardList className="w-4 h-4" />}
                >
                  Score Resumes
                </Button>
              ) : undefined}
            />
          ) : (
            <ScoredResumesTable
              toolbarPortal={tabToolbarSlot}
              resumes={scoredResumes}
              formatCandidateName={formatCandidateFirstName}
              jobTitle={job.title}
              jobId={job.id}
              jobCode={job.job_id}
              jobVersion={job.versionNumber}
              availableUnits={15}
              /* JD ID and Job Title are this page's header — not repeated per
                 row (Resume Scoring's View by Job hides the same two). */
              hiddenColumnIds={['jdId', 'jobTitle']}
              /* Actions ▸ AI Assessment / AI Interview Invite: the AI Talent
                 Match tab's version popups, with the ticked candidates. */
              onOpenInviteDialog={(kind, invitees) => openInviteDialog(kind, invitees, 'score-resume')}
              /* Row ⋮: Create / Send Assessment | AI Interview directly, no Invite ▸. */
              inlineRowInviteItems
              initialMatchStatus={scoredResumesMatchFilter}
              // Same gate and target as the Score Resumes quick action — opens
              // "Select Applicants to Score" in place on this page.
              onScoreResumes={
                canOfferScoreResumesFromTab
                  ? () => { if (permissions.canRunScoring) setShowSelectSourceModal(true); }
                  : undefined
              }
              /* Without the scoring permission the Score button stays visible
                 but greyed out with a tooltip. */
              scoreResumesDisabled={!permissions.canRunScoring}
              /* Row-level "Invite → AI Interview". Same resolve-then-share
                 path as this page's own Invite button, seeded with the row's
                 candidate. Omitted when the viewer can't share, so the option
                 simply isn't offered. */
              onInviteAIInterview={
                permissions.canShareAIInterviews && hasPlanFeature('ai_interview') && features.ai_interview && job.status !== 'Disabled'
                  ? (candidate) => handleInviteAIInterview([candidate])
                  : undefined
              }
              /* The row menu offers only what this JD actually has. Same two
                 flags the Assessment / AI Interview sections' own Send Invite
                 buttons read, so a row can never offer an invite the section
                 above says isn't ready — and with neither configured the
                 Invite button itself is disabled. */
              assessmentConfigured={canInviteToAssessment}
              aiInterviewConfigured={canInviteToAIInterview}
              onViewCandidate={(resume) => {
                // Pass resume directly - data already formatted by fetchScoredResumes
                // CandidateScoringDetailPage handles the same format as ResumeScoringPage
                setViewingScoredResume(toCandidateDetail(resume));
              }}
            />
          )}
        </div>
      )}

      {/* Assessment Results Tab Content */}
      {activeTab === 'assessment-results' && (
        <div className="mt-0 mb-5">
          {(() => {
            /* The Assessment module's own results page, embedded — same stat
               cards, version scopes, filters, table and exports. It fans out
               over every assessment in this job's lineage from any one of
               them, so the newest assessment of this version anchors it, and
               it opens scoped to this job version. */
            const anchor = [...jdAssessments].sort(
              (a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
            )[0];
            if (!anchor) {
              return loadingAssessmentResults ? (
                <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-brand-blue" /></div>
              ) : null;
            }
            return (
              <AssessmentResults
                embedded
                toolbarPortal={tabToolbarSlot}
                onBack={() => setActiveTab('overview')}
                assessmentId={anchor.id}
                assessmentTitle={anchor.title || ''}
                assessmentVersion={anchor.version ?? null}
                jdTitle={job.title}
                jdId={job.id}
                jdShortId={job.job_id}
                jdVersion={job.versionNumber ?? null}
                jobVersionScope={job.id}
                assessmentVersionScope="all"
                canDownloadPDF={isTenantAdmin || (user?.permissions?.canDownloadAssessmentPDF ?? false)}
                canBatchDownload={isTenantAdmin || hasPermissionCode('assessments:batch_download')}
                formatCandidateName={formatCandidateFirstName}
                /* Actions ▸ Create / Send Assessment | AI Interview: the AI
                   Talent Match tab's version popups, with the ticked candidates. */
                onOpenInviteDialog={(kind, invitees) => openInviteDialog(kind, invitees, 'assessment-result')}
                onTotalItemsChange={setAssessmentTableTotal}
                /* A row opens this page's own inline result view — the one
                   Track Invites' View Result opens — so the trail stays
                   Job Descriptions › <job> › <candidate> instead of leaving
                   for the Assessments module and losing the job. */
                onViewCandidate={(c) => setViewingAssessmentResult({
                  id: c.id,
                  assessmentId: c.assessmentId,
                  assessmentName: anchor.title || job.title,
                  candidateName: c.name,
                  candidateDisplayId: c.candidateDisplayId,
                  assessmentVersion: c.assessmentVersion,
                })}
              />
            );
          })()}
        </div>
      )}

      {/* AI Interview Result Tab Content — the same stats + filters + candidate
          table the standalone results page renders, in `embedded` mode so it
          drops its own <main>/breadcrumb chrome and stays inside this page. */}
      {activeTab === 'ai-interview-results' && (
        <div className="mt-0 mb-5" ref={aiInterviewResultsSectionRef}>
          {loadingAIInterviewConfig ? (
            /* Mirrors the AIInterviewResults tab: a row of stat cards, a filter
               bar, then the candidate table with the same columns in order
               (CID, Candidate, Email, Status, Score, Duration, Started At,
               Completed At, Proctoring Risk, Actions). */
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 p-4 space-y-2">
                    <Skeleton className="h-3.5 w-20" />
                    <Skeleton className="h-7 w-16" />
                  </div>
                ))}
              </div>
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 p-4 flex items-center gap-3">
                <Skeleton className="h-10 flex-1 rounded-lg" />
                <Skeleton className="h-10 w-32 rounded-lg" />
              </div>
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 overflow-hidden">
                <div className="overflow-x-auto tf-table-shell">
                  <table className="w-full md:min-w-[1000px] text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700">
                      <tr>
                        {['CID', 'Candidate', 'Email', 'Status', 'Score', 'Duration', 'Started At', 'Completed At', 'Proctoring Risk', 'Actions'].map((h) => (
                          <th key={h} className="text-left px-4 py-3"><Skeleton className="h-3 w-20" /></th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                      {Array.from({ length: 8 }).map((_, r) => (
                        <tr key={r}>
                          <td className="px-4 py-4"><Skeleton className="h-4 w-12" /></td>
                          <td className="px-4 py-4"><Skeleton className="h-4 w-32" /></td>
                          <td className="px-4 py-4"><Skeleton className="h-4 w-40" /></td>
                          <td className="px-4 py-4"><Skeleton className="h-5 w-20 rounded-full" /></td>
                          <td className="px-4 py-4"><Skeleton className="h-4 w-10" /></td>
                          <td className="px-4 py-4"><Skeleton className="h-4 w-12" /></td>
                          <td className="px-4 py-4"><Skeleton className="h-4 w-24" /></td>
                          <td className="px-4 py-4"><Skeleton className="h-4 w-24" /></td>
                          <td className="px-4 py-4"><Skeleton className="h-5 w-16 rounded-full" /></td>
                          <td className="px-4 py-4"><Skeleton className="h-7 w-7 rounded-md" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : aiInterviewConfigError ? (
            <div className="text-center py-16">
              <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">{aiInterviewConfigError}</p>
              <Button
                variant="primary"
                onClick={loadAIInterviewConfig}
              >
                Retry
              </Button>
            </div>
          ) : aiInterviewConfig ? (
            <AIInterviewResults
              embedded
              toolbarPortal={tabToolbarSlot}
              // Reads like the AI Interview module's own results page: its
              // status cards, bulk actions and Job ID, no Job Details toolbar.
              showStats
              hideJobVersion
              formatCandidateName={formatCandidateFirstName}
              jdShortId={job.job_id}
              emptyStateAction={aiInterviewEmptyActions}
              readOnly={job.status === 'Disabled'}
              configId={aiInterviewConfig.id}
              configTitle={aiInterviewConfig.position || aiInterviewConfig.jd_title || 'AI Interview'}
              jdTitle={aiInterviewConfig.jd_title || ''}
              onBack={() => setActiveTab('overview')}
              onViewCandidate={handleAIInterviewCandidateClick}
              /* Actions ▸ Create / Send Assessment | AI Interview: the AI
                 Talent Match tab's version popups, with the ticked candidates. */
              onOpenInviteDialog={(kind, invitees) => openInviteDialog(kind, invitees, 'interview-result')}
              onTotalItemsChange={setAiInterviewTableTotal}
            />
          ) : (
            /* No interview exists for this JD yet. Create has to stay reachable
               here — this is exactly when it matters most — so the tab actions
               ride the empty state rather than a separate strip above it. */
            <TabEmptyState
              bordered
              icon={Brain}
              title="No AI Interview Results"
              description="Create and publish an AI interview to see candidate results here."
              action={aiInterviewEmptyActions ?? undefined}
            />
          )}
        </div>
      )}

      {/* AI Talent Match Tab Content */}
      {activeTab === 'ai-talent-match' && (
        <AIMatchTabContent
          toolbarPortal={tabToolbarSlot}
          candidates={aiMatchCandidates}
          scoredResumes={scoredResumes}
          scoredResumesLoaded={scoredResumesLoaded && !loadingScoredResumes}
          jobTitle={job.title}
          jobVersionNumber={job.versionNumber}
          /* Same gate as the AI Talent Match page's Export — the granular
             ai_match:export code, not the shared legacy can_export bucket. */
          canExport={isTenantAdmin || hasPermissionCode('ai_match:export')}
          sessions={aiMatchSessions}
          loading={loadingAiMatch}
          canRunAiMatch={permissions.canRunAiMatch}
          onRunMatch={handleAITalentMatch}
          onScoreSelected={(selected) => { if (selected.length > 0) setAiMatchScoreReview(selected); }}
          onScoreAll={() => {
            const scoredIds = new Set(scoredResumes.map((r: any) => r.resume_id).filter(Boolean));
            const unscored = aiMatchCandidates.filter((c) => !scoredIds.has(c.resumeId));
            if (unscored.length > 0) setAiMatchScoreReview(unscored);
          }}
          onViewCandidate={(candidate) => {
            try {
              sessionStorage.setItem('resumeNavJobId', job.id);
              // Back lands on this tab; the resume page also reads it to offer
              // this job's Score / View Scorecard and no AI Talent Match.
              sessionStorage.setItem('resumeNavJobTab', 'ai-talent-match');
              // Names the job crumb on the resume page, so its trail reads
              // Job Descriptions › <job> › <candidate> rather than collapsing
              // the job the recruiter came from into a generic step.
              sessionStorage.setItem('resumeNavJobTitle', job.title || '');
            } catch { /* ignore */ }
            router.push(`/recruitment/resume-view/${candidate.resumeId}`);
          }}
          onOpenInviteDrawer={(kind, selected) => openInviteDialog(
            kind,
            selected.map((c) => ({
              id: c.resumeId,
              name: c.name,
              email: c.email,
              phone: c.phone,
              rating: c.rank,
              resumeId: c.resumeId,
            })),
            'talent-match',
          )}
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

      {/* Draft assessment prompt — Create found an unpublished draft for this JD.
          Publishing happens here rather than on the assessment details page,
          which for a draft shows an unfinished record and no way forward.

          ONE SHELL, TWO STATES, and `readyToPublish` is the only thing that
          moves between them: the subject line, the status panel and the single
          primary action. A draft whose Configure step never finished cannot be
          published — the API rejects it — so that state offers only the way
          back into the flow, and the publishable one offers only Publish. */}
      {draftAssessment && (() => {
        const readyToPublish = assessmentDraftReadyToPublish(draftAssessment);
        /* The same name every other list shows for this record: the version
           suffix stripped, falling back to the short id and then to a
           placeholder, so an untitled draft still names something. */
        const draftTitle =
          parseAssessmentTitle(draftAssessment.title || '').cleanTitle
          || draftAssessment.short_id
          || 'Untitled assessment';

        return (
        <div className="fixed inset-0 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-[95vw] sm:max-w-2xl w-full max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden border border-gray-200 dark:border-slate-700">
            {/* Everything above the actions scrolls together, so a long
                assessment title on a short viewport can never push the buttons
                off the bottom. */}
            <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-7 pt-5 sm:pt-7 pb-5 sm:pb-6">
              {/* Header */}
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-warning-subtle flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="w-6 h-6 sm:w-7 sm:h-7 text-warning" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-slate-50 tracking-tight leading-tight">
                    Draft assessment for this job
                  </h3>
                  <p className="text-sm sm:text-base text-gray-500 dark:text-slate-400 mt-1 leading-snug">
                    {readyToPublish
                      ? 'Publish it to start inviting candidates.'
                      : 'Complete the remaining setup steps before it can be published.'}
                  </p>
                </div>
                <button
                  onClick={() => setDraftAssessment(null)}
                  disabled={publishingDraft}
                  className="p-1.5 -mr-1.5 -mt-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
                  aria-label="Close"
                >
                  <X className="w-5 h-5 sm:w-6 sm:h-6 text-gray-400 dark:text-slate-400" />
                </button>
              </div>

              {/* THE RECORD this prompt is about — named, timed and badged, so
                  the recruiter knows which draft they are being asked about
                  before they choose. */}
              <div className="mt-5 sm:mt-6 rounded-xl border border-gray-200/80 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3 sm:p-4">
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl bg-brand-blue/10 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-brand-blue" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm sm:text-lg font-semibold text-gray-900 dark:text-slate-50 break-words leading-snug">
                      {draftTitle}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs sm:text-sm text-gray-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="w-4 h-4 flex-shrink-0" />
                        {draftAssessment.duration_minutes || 30} min
                      </span>
                      <span aria-hidden="true" className="text-gray-300 dark:text-slate-600">|</span>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-warning-subtle text-warning-strong font-medium">
                        <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-warning" />
                        Draft
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* WHY it is still a draft, and what the primary action below
                  will do about it. Amber while the setup is unfinished; the
                  brand's own blue once there is nothing left to finish. */}
              <div
                className={`mt-3 sm:mt-4 rounded-xl p-3 sm:p-5 ${
                  readyToPublish ? 'bg-brand-blue/5 ring-1 ring-brand-blue/15' : 'bg-warning-subtle'
                }`}
              >
                <div className="flex items-start gap-3 sm:gap-4">
                  <div
                    className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      readyToPublish ? 'bg-brand-blue/10' : 'bg-warning-subtle'
                    }`}
                  >
                    {readyToPublish ? (
                      <CheckCircle className="w-5 h-5 text-brand-blue" />
                    ) : (
                      <Info className="w-5 h-5 text-warning" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm sm:text-base font-semibold text-gray-900 dark:text-slate-50">
                      {readyToPublish ? 'Ready to publish' : 'Setup incomplete'}
                    </p>
                    <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 mt-1 leading-relaxed">
                      {readyToPublish
                        ? <>Candidates can&apos;t be invited to a draft. Publishing makes this
                            assessment live for {job.title}.</>
                        : <>The assessment configuration isn&apos;t complete yet. Continue editing to
                            finish the remaining setup steps and publish the assessment.</>}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* One primary action, decided by whether the draft is publishable
                — same rule as the AI interview prompt below. Cancel is the
                close button's twin, kept where a decision is actually made. */}
            <div className="flex-shrink-0 border-t border-gray-200 dark:border-slate-700 px-5 sm:px-7 py-3 sm:py-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3">
              {readyToPublish ? (
                <Button
                  variant="primary"
                  onClick={handlePublishDraftAssessment}
                  disabled={publishingDraft}
                  className="px-5 sm:px-8"
                >
                  {publishingDraft && <Loader2 className="w-4 h-4 animate-spin" />}
                  {publishingDraft ? 'Publishing…' : 'Publish'}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  onClick={handleEditDraftAssessment}
                  className="px-5 sm:px-8"
                >
                  Continue editing
                  <ArrowRight className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
        );
      })()}

      {/* Draft AI interview prompt — the assessment prompt above, for the
          other artefact: same shell, same two states, same single primary
          action. Only the record it describes and the reason a draft is
          unfinished differ, because the two wizards stop in different places.

          ONE ACTION, decided by how far the wizard got: a finished draft can
          only be published, an unfinished one can only be resumed. Offering
          both let recruiters hit Publish on a draft the API was always going
          to reject. */}
      {draftAIInterview && (() => {
        const readyToPublish = aiDraftReachedFinalStep(draftAIInterview);
        const draftTitle =
          draftAIInterview.position
          || draftAIInterview.jd_title
          || job.title
          || 'Untitled interview';

        return (
        <div className="fixed inset-0 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-[95vw] sm:max-w-2xl w-full max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden border border-gray-200 dark:border-slate-700">
            {/* Everything above the actions scrolls together, so a long
                position title on a short viewport can never push the buttons
                off the bottom. */}
            <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-7 pt-5 sm:pt-7 pb-5 sm:pb-6">
              {/* Header */}
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-warning-subtle flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="w-6 h-6 sm:w-7 sm:h-7 text-warning" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-slate-50 tracking-tight leading-tight">
                    Draft AI interview for this job
                  </h3>
                  <p className="text-sm sm:text-base text-gray-500 dark:text-slate-400 mt-1 leading-snug">
                    {readyToPublish
                      ? 'Publish it to start inviting candidates.'
                      : 'Complete the remaining setup steps before it can be published.'}
                  </p>
                </div>
                <button
                  onClick={() => setDraftAIInterview(null)}
                  disabled={publishingAIDraft}
                  className="p-1.5 -mr-1.5 -mt-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
                  aria-label="Close"
                >
                  <X className="w-5 h-5 sm:w-6 sm:h-6 text-gray-400 dark:text-slate-400" />
                </button>
              </div>

              {/* THE RECORD this prompt is about. `Brain` rather than the
                  assessment prompt's `FileText` — the same mark the AI
                  Interview tab and its empty state already carry, so the
                  artefact is recognisable before the title is read. */}
              <div className="mt-5 sm:mt-6 rounded-xl border border-gray-200/80 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3 sm:p-4">
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl bg-brand-blue/10 flex items-center justify-center flex-shrink-0">
                    <Brain className="w-5 h-5 sm:w-6 sm:h-6 text-brand-blue" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm sm:text-lg font-semibold text-gray-900 dark:text-slate-50 break-words leading-snug">
                      {draftTitle}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs sm:text-sm text-gray-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="w-4 h-4 flex-shrink-0" />
                        {draftAIInterview.duration_minutes || 30} min
                      </span>
                      <span aria-hidden="true" className="text-gray-300 dark:text-slate-600">|</span>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-warning-subtle text-warning-strong font-medium">
                        <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-warning" />
                        Draft
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* WHY it is still a draft. The unfinished case names the step
                  the wizard stopped before — the AI flow has one, and knowing
                  which is the difference between resuming and re-deriving. */}
              <div
                className={`mt-3 sm:mt-4 rounded-xl p-3 sm:p-5 ${
                  readyToPublish ? 'bg-brand-blue/5 ring-1 ring-brand-blue/15' : 'bg-warning-subtle'
                }`}
              >
                <div className="flex items-start gap-3 sm:gap-4">
                  <div
                    className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      readyToPublish ? 'bg-brand-blue/10' : 'bg-warning-subtle'
                    }`}
                  >
                    {readyToPublish ? (
                      <CheckCircle className="w-5 h-5 text-brand-blue" />
                    ) : (
                      <Info className="w-5 h-5 text-warning" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm sm:text-base font-semibold text-gray-900 dark:text-slate-50">
                      {readyToPublish ? 'Ready to publish' : 'Setup incomplete'}
                    </p>
                    <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 mt-1 leading-relaxed">
                      {readyToPublish
                        ? <>Candidates can&apos;t be invited to a draft. Publishing makes this
                            interview live for {job.title}.</>
                        : <>This draft stopped before{' '}
                            <span className="font-medium text-gray-900 dark:text-slate-200">Preview &amp; Publish</span>
                            {' '}— its clusters aren&apos;t set yet, so there is nothing to publish.
                            Continue editing to pick the flow back up where you left it.</>}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex-shrink-0 border-t border-gray-200 dark:border-slate-700 px-5 sm:px-7 py-3 sm:py-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3">
              {readyToPublish ? (
                <Button
                  variant="primary"
                  onClick={handlePublishDraftAIInterview}
                  disabled={publishingAIDraft}
                  className="px-5 sm:px-8"
                >
                  {publishingAIDraft && <Loader2 className="w-4 h-4 animate-spin" />}
                  {publishingAIDraft ? 'Publishing…' : 'Publish'}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  onClick={handleEditDraftAIInterview}
                  className="px-5 sm:px-8"
                >
                  Continue editing
                  <ArrowRight className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
        );
      })()}

      {/* Assessment Picker — shown when this JD has multiple published assessments.
          User selects which one(s) before the Share modal opens. */}
      {showAssessmentPicker && pickerAssessments.length > 0 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-[95vw] sm:max-w-2xl w-full max-h-[80dvh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-slate-700 shrink-0">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-50">Choose an assessment</h3>
                <p className="text-xs text-gray-500 dark:text-slate-500 mt-0.5">
                  This job has {pickerAssessments.length} published assessments. Select which one(s) to invite candidates to.
                </p>
              </div>
              <button
                onClick={() => setShowAssessmentPicker(false)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded"
                aria-label="Close"
              >
                <svg className="w-5 h-5 text-gray-500 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {pickerAssessments.map(a => {
                const isPicked = pickerSelectedIds.includes(a.id);
                const sections = (a.hr_enabled ? 1 : 0) + (a.technical_enabled ? 1 : 0) + (a.coding_enabled ? 1 : 0);
                const parsed = parseAssessmentTitle(a.title || '');
                const displayVersion = typeof a.version === 'number' ? a.version : parsed.version;
                const baseTitle = parsed.cleanTitle || a.short_id || 'Untitled assessment';
                return (
                  <label
                    key={a.id}
                    className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer border mb-2 transition-colors ${
                      isPicked ? 'border-blue-500 bg-blue-50 dark:bg-slate-800/50' : 'border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800'
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
                      <div className="text-sm font-medium text-gray-900 dark:text-slate-50 truncate">
                        {baseTitle}
                        {displayVersion ? ` - Version ${displayVersion}` : ''}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-slate-500 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
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
            <div className="p-4 border-t border-gray-200 dark:border-slate-700 flex items-center justify-between gap-3 shrink-0">
              <span className="text-xs text-gray-600 dark:text-slate-400">
                {pickerSelectedIds.length} of {pickerAssessments.length} selected
              </span>
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  onClick={handleConfirmAssessmentPick}
                  disabled={pickerSelectedIds.length === 0}
                >
                  Continue
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Share Assessment via Email — same modal the assessment-side page
          uses for assessment-level share. */}
      {showShareAssessmentModal && shareAssessments.length > 0 && (
        <ShareAssessmentModal
          isOpen={showShareAssessmentModal}
          onClose={() => {
            setShowShareAssessmentModal(false);
            setShareAssessments([]);
            setShareAssessmentCandidates(null);
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
            // Display ID (JD-133), not `job.id` — the UUID the header printed.
            jd_short_id: shareAssessments[0].jd_short_id || job.job_id,
            jd_title: job.title,
            /* This job's version, not the assessment's `jd_version` snapshot
               (stamped at creation; reads 1 for later-version assessments).
               These are this JD row's assessments (listed by its id). */
            jd_version: job.versionNumber && job.versionNumber > 0 ? job.versionNumber : shareAssessments[0].jd_version,
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
            version: a.version,
            jd_short_id: a.jd_short_id || job.job_id,
            jd_title: job.title,
            jd_version: job.versionNumber && job.versionNumber > 0 ? job.versionNumber : a.jd_version,
          }))}
          /* From the AI Talent Match tab: its ticked candidates, pre-filled,
             under the source that tab's Actions menu has always sent with
             (gated on `scoring:invite`, like BulkInviteModal before it). */
          prefilledCandidates={shareAssessmentCandidates ?? undefined}
          inviteSource={shareAssessmentCandidates ? 'Resume Scoring' : 'JD'}
          onInviteSent={(count) => {
            const sentCount = Math.max(count, 1);
            setAssessmentInviteCount((prev) => prev + sentCount);
            void fetchAssessmentResults();
          }}
        />
      )}

      {/* Select Source Modal */}
      {showSelectSourceModal && (
        <SelectSourceModal
          jobTitle={job.title}
          jobId={job.id}
          jobShortId={job.job_id}
          jobVersion={job.versionNumber && job.versionNumber > 0 ? job.versionNumber : null}
          /* Turns on the popup's Job Version picker: score against any
             published version of this job, starting on this page's own. */
          job={job}
          onClose={() => setShowSelectSourceModal(false)}
          onScoringFinished={() => {
            // Run settled, popup still up: bring Scored Resumes in behind it.
            fetchScoredResumes();
            setActiveTab('scored-resumes');
          }}
          onScoringComplete={() => setShowSelectSourceModal(false)}
          onViewResult={(item) => {
            setShowSelectSourceModal(false);
            const row = scoredResumes.find((r: any) => r.resumeId === item.resumeId || r.id === item.resumeId);
            if (row) {
              setViewingScoredResume(toCandidateDetail(row));
            } else {
              // Scored Resumes is still refreshing behind the popup; it is the
              // tab already on screen, so the row is a moment away.
              toast.info('Results are still loading — the candidate will appear in Scored Resumes in a moment.');
            }
          }}
        />
      )}

      <JDVersionHistoryModal
        isOpen={showJDHistory}
        onClose={() => setShowJDHistory(false)}
        jdId={job.id}
        jdTitle={job.title}
      />

      {/* Resume Detail View Modal */}
      {viewingResume && (
        <ResumeDetailView
          resume={viewingResume}
          onClose={() => setViewingResume(null)}
        />
      )}

      {/* Scored Resume Detail - now handled by CandidateScoringDetailPage above */}

      {/* Confirm before running AI Talent Match. No is the do-nothing path —
          the panel never mounts, so no run starts and no units are spent. */}
      <AITalentMatchConfirmModal
        isOpen={showAIMatchConfirm}
        jobTitle={formatJobVersionLabel(job)}
        job={job}
        onConfirm={confirmAITalentMatch}
        onCancel={() => setShowAIMatchConfirm(false)}
      />

      {/* AI Talent Match Progress Panel */}
      {/* Review before scoring — the candidates (untick to drop, eye to pick
          another resume version) against this job, then Score starts it. */}
      {aiMatchScoreReview && (
        <ApplyToJobModal
          mode="scoring"
          resumes={aiMatchScoreReview
            .filter((c) => !!c.resumeId)
            .map((c) => ({
              id: c.resumeId,
              name: c.name || 'Unknown',
              title: c.title,
              email: c.email,
              phone: c.phone,
            }) as unknown as ResumeRecord)}
          fixedJob={{ ...job, versionNumber: job.versionNumber }}
          onClose={() => setAiMatchScoreReview(null)}
          onApply={(resumeIds, _jobIds, _jobs, sourceResumeIds) => {
            const reviewed = aiMatchScoreReview;
            setAiMatchScoreReview(null);
            // Each picked id may be an older version of the candidate's resume.
            const toScore = resumeIds
              .map((resumeId, index) => {
                const original = reviewed.find((c) => c.resumeId === (sourceResumeIds?.[index] ?? resumeId));
                return original ? { ...original, resumeId } : null;
              })
              .filter((c): c is MatchedCandidate => !!c);
            void startAiMatchScoring(toScore);
          }}
        />
      )}

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
          jdShortId={job.job_id}
          jobVersion={job.versionNumber && job.versionNumber > 0 ? job.versionNumber : null}
          // Revoke / Edit follow the same gate as Invite on this page.
          canModifyInvites={permissions.canCreateAssessments && canInviteJdAssessment && job.status !== 'Disabled'}
          // Footer Invite More - this page's own Invite to Assessment dialog.
          onInviteMore={canInviteToAssessment && permissions.canCreateAssessments && canInviteJdAssessment ? () => {
            setShowTrackInvitesModal(false);
            openCreateSendAssessment();
          } : undefined}
          // Keep the whole flow on this page: swap the popup for the same
          // inline detail view the Assessment Result tab opens, rather than
          // routing out to /assessments/{id}/results/details.
          onViewResult={(invitation) => {
            setShowTrackInvitesModal(false);
            setViewingAssessmentResult({
              id: invitation.attempt_id,
              assessmentId: invitation.assessment_id,
              assessmentName: invitation.assessment_title,
              candidateName: invitation.candidate_name,
              candidateDisplayId: invitation.candidate_display_id,
            });
          }}
        />
      )}

      {/* AI Interview Track Invites — same page, no navigation away */}
      {trackAIInterviewConfig?.id && (
        <AIInterviewTrackInvitesModal
          isOpen={!!trackAIInterviewConfig}
          onClose={() => setTrackAIInterviewConfig(null)}
          configId={trackAIInterviewConfig.id}
          jdTitle={job.title}
          jdShortId={job.job_id}
          jobVersion={job.versionNumber && job.versionNumber > 0 ? job.versionNumber : undefined}
          hideJobVersionFilter
          // One job, one interview: every row shares both versions, so the
          // columns (and their filters) go — the header names them instead.
          hideVersionDetails
          // Completed rows offer View Result — swap the popup for the same
          // inline candidate result view the AI Interview Result tab opens.
          onViewResult={(inv) => {
            setTrackAIInterviewConfig(null);
            handleAIInterviewCandidateClick(inv.id);
          }}
          // Footer Invite More — this page's own Invite to AI Interview dialog.
          onInviteMore={canInviteToAIInterview ? () => {
            setTrackAIInterviewConfig(null);
            handleInviteAIInterview();
          } : undefined}
        />
      )}

      {/* Candidate detail fetch overlay — the row click loads the full session
          before the inline detail view can render. */}
      {loadingAIInterviewCandidate && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-white/60 dark:bg-slate-950/60">
          <Loader2 className="w-8 h-8 animate-spin text-brand-blue" />
        </div>
      )}

      {draftAssessmentConflict && (
        <DraftAssessmentExistsModal
          draft={draftAssessmentConflict.draft}
          jdShortId={job.job_id}
          jobTitle={job.title}
          jobVersion={draftAssessmentConflict.jobVersion}
          message={"A draft version already exists for this assessment. Publish the existing draft before creating another version — open it to finish and publish, or cancel to stay here."}
          onClose={() => setDraftAssessmentConflict(null)}
          onOpenDraft={() => {
            const { draft } = draftAssessmentConflict;
            setDraftAssessmentConflict(null);
            const returnUrl = `/recruitment/job-details?id=${encodeURIComponent(job.id)}`;
            router.push(
              `/recruitment/assessments/create?step=configure&jd_id=${encodeURIComponent(draft.jd_id || job.id)}` +
              `&edit=${encodeURIComponent(draft.id)}` +
              `&from=job-details&jd_title=${encodeURIComponent(job.title || '')}` +
              `&returnUrl=${encodeURIComponent(returnUrl)}`
            );
          }}
        />
      )}

      <AssessmentVersionHistoryModal
        open={showAssessmentVersionHistory}
        onClose={() => setShowAssessmentVersionHistory(false)}
        jobId={job.id}
        jobTitle={job.title}
        jobShortId={job.job_id}
        jobVersion={job.versionNumber && job.versionNumber > 0 ? job.versionNumber : null}
      />

      <AIInterviewVersionHistoryModal
        open={showAIVersionHistory}
        onClose={() => setShowAIVersionHistory(false)}
        jobId={job.id}
        jobTitle={job.title}
        jobShortId={job.job_id}
        jobVersion={job.versionNumber && job.versionNumber > 0 ? job.versionNumber : null}
      />

      {/* Create / Send Assessment and Create / Send AI Interview — the AI
          Talent Match tab's two separate popups (one VersionInviteDialog per
          type). Up to 5 versions per type for this JD row; one version per
          send. Mounted only while open, so each opening starts fresh. */}
      {versionInviteDialogEl}

      {/* Invite to AI Interview — the shared dialog, scoped to this job, with
          several interviews pickable (Select All), as the Invite to
          Assessment dialog below. */}
      <InviteToAIInterviewFlow
        open={aiInviteSeed !== null}
        onClose={() => setAiInviteSeed(null)}
        jobId={job.id}
        jobVersionNumber={job.versionNumber && job.versionNumber > 0 ? job.versionNumber : undefined}
        multiple
        /* Opens with the "Latest" interview version ticked, as the Invite to
           Assessment dialog below opens on its Latest assessment. */
        preselectLatest
        /* Only this job version's own AI interview (the one this page uses),
           and candidates' first names capitalised — display only. */
        mappedVersionOnly
        formatCandidateName={formatCandidateFirstName}
        candidates={(aiInviteSeed ?? []).map((c, i) => ({ id: c.resumeId || `seed-${i}`, name: c.name, email: c.email }))}
        resumes={aiInviteSeed && aiInviteSeed.length > 0
          ? aiInviteSeed.map((c, i) => ({ id: c.resumeId || `seed-${i}`, name: c.name, email: c.email }) as unknown as ResumeRecord)
          : undefined}
        onInvited={() => {
          setAiInviteSeed(null);
          setAiInterviewCount((prev) => Math.max(prev + 1, 1));
          toast.success('AI interview invitation sent');
        }}
      />

      </div>
      </div>
    </main>
  );
}

/* The AI Talent Match page's row-action button (AITalentMatchPage's
   ROW_ACTION_BUTTON_CLASS, the same string) — the AI Match tab's ⋮. */
const ROW_ACTION_BUTTON_CLASS =
  'inline-flex items-center justify-center p-2.5 rounded-lg border transition-all bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200 hover:border-gray-300 data-[state=open]:bg-gray-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed';
/* …and its open state (ROW_ACTION_BUTTON_ACTIVE_CLASS there) — the ▾ of an expanded row. */
const ROW_ACTION_BUTTON_ACTIVE_CLASS =
  'inline-flex items-center justify-center p-2.5 rounded-lg border transition-all bg-brand-blue/10 border-brand-blue/30 text-brand-blue';

/* The ⓘ beside Actions › Score Selected (N) when N is less than the selection:
   says how many were picked, how many will score and how many are already
   scored. A Radix Popover (as ScoredResumesTable's "+N more") rather than the
   hover-only <Tooltip>, so a tap opens it on touch screens; a mouse also opens
   it on hover. Styled as that <Tooltip>'s bubble. It lives INSIDE a menu item,
   so its pointer/key events stop here — otherwise the item would take the
   tap as "Score Selected" and start scoring. Keyboard and screen-reader users
   get the same sentence through the item's aria-describedby. */
function ScoreSelectedInfo({ message }: { message: string }) {
  const [open, setOpen] = useState(false);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <button
          type="button"
          aria-label="Why is this count lower than the number selected?"
          aria-expanded={open}
          className="ml-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-gray-400 hover:text-brand-blue hover:bg-brand-blue/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 transition-colors cursor-help"
          onPointerDown={stop}
          onPointerUp={stop}
          onKeyDown={stop}
          onPointerEnter={(e) => { if (e.pointerType === 'mouse') setOpen(true); }}
          onPointerLeave={(e) => { if (e.pointerType === 'mouse') setOpen(false); }}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            // A mouse already opened it on hover — keep it; a tap toggles.
            const pointerType = (e.nativeEvent as PointerEvent).pointerType;
            if (pointerType !== 'mouse') setOpen((o) => !o);
          }}
        >
          <Info className="size-3.5" />
        </button>
      </PopoverAnchor>
      <PopoverContent
        side="top"
        align="end"
        role="tooltip"
        className="z-[9999] w-max max-w-[min(18rem,calc(100vw-2rem))] p-0 border-0 bg-transparent shadow-none overflow-visible"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onPointerDown={stop}
        onClick={stop}
      >
        <div className="bg-gray-700 text-white text-xs leading-snug px-3 py-2 rounded-lg shadow-lg whitespace-normal">
          {message}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── AI Match Tab Sub-component ──────────────────────────────────────────────
function AIMatchTabContent({
  toolbarPortal,
  candidates,
  scoredResumes,
  scoredResumesLoaded,
  jobTitle,
  jobVersionNumber,
  canExport,
  sessions,
  loading,
  canRunAiMatch,
  onRunMatch,
  onScoreSelected,
  onScoreAll,
  onViewCandidate,
  onOpenInviteDrawer,
}: {
  /* When set, the search/filter toolbar portals into this node (the slot
     inside the tab-navigation card) instead of rendering inline above the
     table. Keeps all toolbar state local to this component. */
  toolbarPortal?: HTMLElement | null;
  candidates: MatchedCandidate[];
  scoredResumes: any[];
  /* False until this job's scored-resumes fetch has settled — until then an
     empty `scoredResumes` can't be read as "nobody is scored". */
  scoredResumesLoaded: boolean;
  jobTitle: string;
  jobVersionNumber?: number;
  canExport: boolean;
  sessions: AIMatchSessionResponse[];
  loading: boolean;
  canRunAiMatch: boolean;
  onRunMatch: () => void;
  onScoreSelected: (selected: MatchedCandidate[]) => void;
  onScoreAll: () => void;
  onViewCandidate?: (candidate: MatchedCandidate) => void;
  /* Create / Send Assessment | AI Interview from the Actions menu: opens that
     type's own popup (VersionInviteDialog) over this table,
     with the ticked candidates. Whether a version exists or not, the drawer
     handles it — pick one, or create the next. */
  onOpenInviteDrawer: (kind: InviteKind, selected: MatchedCandidate[]) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  /* Rows opened to show their remaining details (Phone, Location, Skills,
     Uploaded By / Date, Attachments) — display only. */
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(new Set());
  const toggleRowExpanded = (resumeId: string) =>
    setExpandedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(resumeId)) next.delete(resumeId);
      else next.add(resumeId);
      return next;
    });
  const [searchQuery, setSearchQuery] = useState('');
  const [filterThreshold, setFilterThreshold] = useState(0);
  const [filterPhone, setFilterPhone] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterExperienceMin, setFilterExperienceMin] = useState<number | ''>('');
  const [filterExperienceMax, setFilterExperienceMax] = useState<number | ''>('');
  const [sortBy, setSortBy] = useState<'rank' | 'name' | 'score' | 'experience'>('rank');
  /* Direction toggle mirroring the Job Openings master's Sort control — same
     'desc' default, applied uniformly to whichever field `sortBy` selects. */
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [displayMode, setDisplayMode] = useState<ListDisplayMode>('list');
  /* The secondary filters (phone / location / experience range) collapse behind
     a "More Filters" toggle so this tab's toolbar reads as one row like the Job
     Openings master and the sibling tabs, rather than an always-expanded second
     row. */
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const aiMatchActiveFilterCount =
    (filterPhone.trim() !== '' ? 1 : 0) +
    (filterLocation.trim() !== '' ? 1 : 0) +
    (filterExperienceMin !== '' ? 1 : 0) +
    (filterExperienceMax !== '' ? 1 : 0);
  const clearAiMatchFilters = () => {
    setFilterPhone('');
    setFilterLocation('');
    setFilterExperienceMin('');
    setFilterExperienceMax('');
  };

  // Attachments column → Version History popup. Same fetch-and-fallback
  // pattern as the standalone AI Talent Match page's handleAttachmentsClick:
  // real versions when the API has them, else a single synthetic "version 1"
  // built from the candidate's own row so the popup never shows empty for a
  // resume that predates version tracking.
  const [selectedVersionsCandidate, setSelectedVersionsCandidate] = useState<MatchedCandidate | null>(null);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [realVersionsData, setRealVersionsData] = useState<any[]>([]);

  const handleAttachmentsClick = async (candidate: MatchedCandidate) => {
    if (!candidate.resumeId) {
      toast.error('Resume ID not found');
      return;
    }

    setSelectedVersionsCandidate(candidate);
    setLoadingVersions(true);
    setRealVersionsData([]);

    try {
      const response = await resumeService.getVersions(candidate.resumeId);
      let versions = Array.isArray(response) ? response : [];

      if (versions.length === 0) {
        versions = [{
          id: candidate.resumeId,
          version: 1,
          file_name: `${candidate.name.replace(/\s+/g, '_')}_Resume.pdf`,
          created_at: candidate.uploadDate || new Date().toISOString(),
          uploaded_by_name: candidate.uploadedByName || 'System',
          file_size_kb: null,
        }];
      } else {
        versions.sort((a: any, b: any) => (b.version || 0) - (a.version || 0));
      }

      setRealVersionsData(versions);
    } catch (error) {
      console.error('[Attachments] Failed to fetch resume versions:', error);
      setRealVersionsData([{
        id: candidate.resumeId,
        version: 1,
        file_name: `${candidate.name.replace(/\s+/g, '_')}_Resume.pdf`,
        created_at: candidate.uploadDate || new Date().toISOString(),
        uploaded_by_name: candidate.uploadedByName || 'System',
        file_size_kb: null,
      }]);
    } finally {
      setLoadingVersions(false);
    }
  };

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
    /* Ascending comparator per field; the direction toggle (sortOrder) then
       flips it — the same model the Job Openings master Sort control uses. */
    const ascCompare: Record<'rank' | 'name' | 'score' | 'experience', (a: MatchedCandidate, b: MatchedCandidate) => number> = {
      rank: (a, b) => (a.rank || 0) - (b.rank || 0),
      name: (a, b) => a.name.localeCompare(b.name),
      score: (a, b) => a.matchScore - b.matchScore,
      experience: (a, b) => (parseFloat(a.experience || '0') || 0) - (parseFloat(b.experience || '0') || 0),
    };
    const dir = sortOrder === 'asc' ? 1 : -1;
    sorted.sort((a, b) => dir * ascCompare[sortBy](a, b));
    return sorted;
  }, [candidates, searchQuery, filterThreshold, filterPhone, filterLocation, filterExperienceMin, filterExperienceMax, sortBy, sortOrder]);

  // Reset to page 1 whenever the filtered/sorted set changes shape, so a
  // narrowing filter never leaves the view stranded on a now-empty page.
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterThreshold, filterPhone, filterLocation, filterExperienceMin, filterExperienceMax, sortBy, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(filteredCandidates.length / itemsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedCandidates = filteredCandidates.slice(
    (safeCurrentPage - 1) * itemsPerPage,
    safeCurrentPage * itemsPerPage
  );

  const toggleSelect = (resumeId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(resumeId)) next.delete(resumeId);
      else next.add(resumeId);
      return next;
    });
  };

  const unscoredCount = candidates.filter((c) => !scoredResumeIds.has(c.resumeId)).length;
  const selectedCandidates = candidates.filter((c) => selectedIds.has(c.resumeId));
  /* Score Selected runs only on the ticked candidates NOT yet scored against
     this job version — the AI Talent Match page's Score Resumes rule
     (`!scoreIdFor(jobId, resumeId)`), read here from this job's own scored
     resumes, the same set Score All and the Scored Status column use. The
     menu label's count is this list's length, so it is exactly what runs. */
  const scoreEligibleCandidates = selectedCandidates.filter(
    (c) => !!c.resumeId && !scoredResumeIds.has(c.resumeId),
  );

  /* Actions › Export — the AI Talent Match page's Export Matched Candidates:
     same CSV / Excel picker, columns, saved column prefs and exportData
     writer, on the ticked candidates. */
  const [showExportModal, setShowExportModal] = useState(false);
  const candidateExportColumns: ExportColumn[] = [
    { key: 'rank', header: 'Matched Rating' },
    { key: 'name', header: 'Candidate Name' },
    { key: 'email', header: 'Email' },
    { key: 'phone', header: 'Phone' },
    { key: 'location', header: 'Location' },
    { key: 'jobTitle', header: 'Job Title' },
    { key: 'jobVersion', header: 'Job Version' },
    { key: 'skills', header: 'Skills' },
    { key: 'experience', header: 'Experience' },
    { key: 'uploadedBy', header: 'Uploaded By' },
    { key: 'uploadDate', header: 'Uploaded Date' },
    { key: 'resumeVersion', header: 'Resume Version' },
    { key: 'attachments', header: 'Attachments' },
    { key: 'scoredStatus', header: 'Scored Status' },
  ];
  const handleExportCandidates = async (format: 'csv' | 'xlsx', picked?: string[]) => {
    const title = jobTitle || 'Candidates';
    const jobVersion = jobVersionNumber ? `v${jobVersionNumber}` : '-';
    const rows = selectedCandidates.map((c) => ({
      rank: c.rank ?? '-',
      name: c.name || 'Unknown',
      jobTitle: title,
      jobVersion,
      email: c.email || '-',
      phone: c.phone || '-',
      location: c.location || '-',
      skills: (c.skills || []).join(', '),
      experience: c.experience || '-',
      // A bare user UUID isn't a name — the page's formatUploadedBy rule.
      uploadedBy: c.uploadedByName && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c.uploadedByName)
        ? c.uploadedByName
        : 'System',
      uploadDate: c.uploadDate ? formatISTDate(c.uploadDate) : '-',
      resumeVersion: `v${c.resumeVersion || 1}`,
      attachments: c.attachmentCount || 1,
      scoredStatus: scoredResumeIds.has(c.resumeId) ? 'Scored' : 'Not Scored',
    }));
    const cols = picked ? candidateExportColumns.filter((col) => picked.includes(col.header)) : candidateExportColumns;
    await exportData(format, rows, cols, `AI_Talent_Match_${title.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}`, {
      sheetName: 'AI Talent Match',
      title: `${title} - AI Talent Match`,
    });
    toast.success(`Exported ${rows.length} candidate${rows.length !== 1 ? 's' : ''} to ${format === 'xlsx' ? 'Excel' : 'CSV'}`);
  };

  /* Create / Send Assessment | AI Interview — the Scored Resumes tab's
     permission reads (`true`: this tab always has its own AI interview path,
     the drawer). */
  const { canCreateAssessments, assessmentDeniedReason, mayInviteAIInterview, aiInterviewDeniedReason } =
    useScoringActionPermissions(true);

  /* The Select All pill's three scopes, same as the Job Openings master:
     add the current page's rows, select every filtered candidate, or clear. */
  const selectCurrentPage = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      paginatedCandidates.forEach((c) => next.add(c.resumeId));
      return next;
    });
  const deselectCurrentPage = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      paginatedCandidates.forEach((c) => next.delete(c.resumeId));
      return next;
    });
  const selectAllCandidates = () => setSelectedIds(new Set(filteredCandidates.map((c) => c.resumeId)));
  const clearSelection = () => setSelectedIds(new Set());
  const allCandidatesSelected =
    filteredCandidates.length > 0 && filteredCandidates.every((c) => selectedIds.has(c.resumeId));
  const currentPageSelected =
    paginatedCandidates.length > 0 && paginatedCandidates.every((c) => selectedIds.has(c.resumeId));

  if (loading) {
    /* Mirrors this tab's real layout: a search + filters card, then the
       AI-match table with the same columns in order (per-row select, Match
       Rating, Candidate Name, Email, Phone, Location, Skills, Experience,
       Uploaded By, Uploaded Date, Scored Status, Attachments). The select
       column's HEADER is empty (no Select-All checkbox there). */
    return (
      <div className="space-y-4">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Skeleton className="h-10 flex-1 min-w-[200px] rounded-lg" />
            <Skeleton className="h-10 w-32 rounded-lg" />
            <Skeleton className="h-10 w-28 rounded-lg" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Skeleton className="h-10 w-40 rounded-lg" />
            <Skeleton className="h-10 w-40 rounded-lg" />
            <Skeleton className="h-10 w-28 rounded-lg" />
            <Skeleton className="h-10 w-28 rounded-lg" />
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full md:min-w-[880px] table-auto">
              <thead className="[&_th]:bg-gray-50 dark:[&_th]:bg-slate-800 [&_th]:border-b [&_th]:border-gray-200 dark:[&_th]:border-slate-700">
                <tr>
                  {/* Empty select-column header (no Select-All checkbox). */}
                  <th className="px-3 py-2.5 w-10 align-middle" aria-label="Select" />
                  {['Rating', 'Candidate', 'Experience', 'Resume Version', 'Scored Status', 'Actions'].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left align-middle"><Skeleton className="h-3 w-20" /></th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                {Array.from({ length: 8 }).map((_, r) => (
                  <tr key={r}>
                    <td className="px-3 py-2.5 align-middle"><Skeleton className="h-4 w-4 rounded" /></td>
                    <td className="px-3 py-2.5 align-middle"><Skeleton className="h-7 w-7 rounded-full mx-auto" /></td>
                    <td className="px-3 py-2.5 align-middle">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-44 mt-1.5" />
                    </td>
                    <td className="px-3 py-2.5 align-middle"><Skeleton className="h-4 w-16" /></td>
                    <td className="px-3 py-2.5 align-middle"><Skeleton className="h-5 w-8 rounded-full mx-auto" /></td>
                    <td className="px-3 py-2.5 align-middle"><Skeleton className="h-5 w-20 rounded-full" /></td>
                    <td className="px-3 py-2.5 align-middle"><Skeleton className="h-9 w-9 rounded-lg ml-auto" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <TabEmptyState
        bordered
        icon={Brain}
        imageSrc="/ai-talent-match-empty-state.webp"
        imageAlt="AI talent match illustration"
        title="No AI Talent Match Results"
        description="Run an AI Talent Match session to find the best candidates for this role."
        action={(
          <Button
            variant="primary"
            onClick={() => { if (canRunAiMatch) onRunMatch(); }}
            aria-disabled={!canRunAiMatch || undefined}
            title={!canRunAiMatch ? 'You do not have permission to run AI Talent Match' : undefined}
            className={!canRunAiMatch ? 'opacity-60 cursor-not-allowed' : undefined}
            icon={<Sparkles className="w-4 h-4" />}
          >
            Run AI Match
          </Button>
        )}
      />
    );
  }

  return (
    /* mb-5: the same trailing gap the Assessments Results / AI Interview
       Result tab bodies end with, so the table / pagination isn't pressed
       against the page card's bottom edge. */
    <div className="space-y-4 mb-5">
      <ExportFormatModal
        open={showExportModal}
        onClose={() => setShowExportModal(false)}
        title="Export Matched Candidates"
        recordCount={selectedCandidates.length}
        selected
        columns={candidateExportColumns.map((c) => c.header)}
        columnPrefsKey="aiTalentMatchResultsExportColumns"
        defaultOffColumns={['Phone', 'Location', 'Skills', 'Attachments']}
        onExport={handleExportCandidates}
      />
      {/* Search & Filters — the shared ListToolbar. When a portal slot is given
          (the tab-navigation card's toolbar row) it renders there, so the
          controls read as the second row of the tab card rather than a detached
          panel. Without a slot it falls back to rendering inline above the
          table (e.g. if this component is ever reused outside the tab card). */}
      {(() => {
        const toolbar = (
          <ListToolbar
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          searchDebounceMs={0}
          searchPlaceholder="Search candidates..."
          /* Lay out by the tab card's width: search takes its own row until
             the card is wide enough, instead of shrinking to an icon beside
             Select All and the controls (tablet widths). */
          fitToContainer
          /* The built-in More Filters (and Reset) at the 36px band via
             `compactButtons` — the same buttons the sibling result tabs use. */
          onToggleFilters={() => setShowMoreFilters((open) => !open)}
          compactButtons
          filtersOpen={showMoreFilters}
          activeFilterCount={aiMatchActiveFilterCount}
          filtersApplied={aiMatchActiveFilterCount > 0}
          onClearFilters={clearAiMatchFilters}
          /* sm:h-9 on the List/Grid switch so it matches the 36px toolbar band
             from sm; phones keep its own 28px (the Job Openings pill height). */
          trailing={<ListViewToggle value={displayMode} onChange={setDisplayMode} className="sm:h-9" />}
          beforeSearch={
            <>
              {/* Select All — the shared ToolbarSelectAll (this page / all /
                  clear), the same pill the sibling result tabs carry. */}
              <ToolbarSelectAll
                selectedCount={selectedIds.size}
                allSelected={allCandidatesSelected}
                pageCount={paginatedCandidates.length}
                pageSelected={currentPageSelected}
                onSelectPage={selectCurrentPage}
                onDeselectPage={deselectCurrentPage}
                totalCount={filteredCandidates.length}
                onSelectAll={selectAllCandidates}
                onClear={clearSelection}
              />

              {/* Actions — appears once something is ticked; holds the bulk
                  operations: Score, plus Invite to Assessment / AI Interview
                  (the Scored Resumes tab's Actions menu pattern — ready, or a
                  "+ Create" offer when this job has none yet). */}
              {selectedIds.size > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="rounded-full sm:h-9"
                      aria-label={`Actions for ${selectedIds.size} selected`}
                    >
                      Actions
                      <ChevronDown className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-64 overflow-hidden !rounded-lg !bg-white !pt-0 !pb-1 !px-0 !shadow-xl [&_[role=menuitem][data-highlighted]]:!bg-gray-100 [&_[role=menuitem]:hover]:!bg-gray-100">
                    <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-2xs font-semibold uppercase tracking-wide text-gray-500">
                      {selectedIds.size.toLocaleString()} selected
                    </div>
                    {/* (N) is the ticked candidates still unscored for this
                        job version — not the selection size — and only they
                        are sent. Nothing left to score (or the scored list
                        still loading) greys it out with the reason, the AI
                        Talent Match page's disabled Score Resumes row. */}
                    {(() => {
                      /* All three from the same lists the count and the run
                         use — the selection and its unscored subset. */
                      const selectedCount = selectedCandidates.length;
                      const eligibleCount = scoreEligibleCandidates.length;
                      const alreadyCount = selectedCount - eligibleCount;
                      const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
                      if (!scoredResumesLoaded || eligibleCount === 0) {
                        // Disabled items take no pointer events, so the reason
                        // is spelled out on the row itself, not behind an ⓘ.
                        return (
                          <DropdownMenuItem className="flex !items-start gap-2.5 px-4 py-2.5 text-sm text-gray-400" disabled>
                            <ClipboardList className="w-4 h-4 text-gray-400 mt-0.5" />
                            <span className="min-w-0">
                              <span className="block">Score Selected{scoredResumesLoaded ? ' (0)' : ''}</span>
                              <span className="block text-2xs text-gray-400 normal-case whitespace-normal">
                                {!scoredResumesLoaded
                                  ? 'Checking scored status…'
                                  : selectedCount === 1
                                    ? 'This candidate has already been scored for this job version, so there is no one to score.'
                                    : `All ${selectedCount.toLocaleString()} selected candidates have already been scored for this job version, so none are eligible.`}
                              </span>
                            </span>
                          </DropdownMenuItem>
                        );
                      }
                      // Only when some of the selection is excluded — a fully
                      // eligible selection needs no explanation.
                      const explanation = alreadyCount > 0
                        ? `You selected ${plural(selectedCount, 'candidate', 'candidates')}, but only ${eligibleCount.toLocaleString()} ${eligibleCount === 1 ? 'is' : 'are'} eligible for scoring. The remaining ${plural(alreadyCount, 'candidate has', 'candidates have')} already been scored for this job version.`
                        : null;
                      return (
                        <DropdownMenuItem
                          className="flex items-center gap-2.5 px-4 py-2.5 text-sm cursor-pointer"
                          aria-describedby={explanation ? 'ai-match-score-selected-why' : undefined}
                          onSelect={() => {
                            if (alreadyCount > 0) toast.info(`${alreadyCount} already scored — scoring the other ${eligibleCount}.`);
                            onScoreSelected(scoreEligibleCandidates);
                          }}
                        >
                          <ClipboardList className="w-4 h-4 text-menu-icon-score" />
                          <span>Score Selected ({eligibleCount.toLocaleString()})</span>
                          {explanation && (
                            <>
                              <span id="ai-match-score-selected-why" className="sr-only">{explanation}</span>
                              <ScoreSelectedInfo message={explanation} />
                            </>
                          )}
                        </DropdownMenuItem>
                      );
                    })()}
                    {/* Create / Send — the version drawer, on that type. The
                        same icons and permission reads the invite items used. */}
                    <DropdownMenuItem
                      aria-disabled={!canCreateAssessments || undefined}
                      title={!canCreateAssessments ? assessmentDeniedReason : undefined}
                      className={`flex items-center gap-2.5 px-4 py-2.5 text-sm ${canCreateAssessments ? 'cursor-pointer' : 'text-gray-400 opacity-60 cursor-not-allowed'}`}
                      onSelect={(e) => {
                        if (!canCreateAssessments) {
                          // Locked: tooltip only, no toast.
                          e.preventDefault();
                          return;
                        }
                        onOpenInviteDrawer('assessment', selectedCandidates);
                      }}
                    >
                      <ClipboardList className="w-4 h-4 text-menu-icon-view" />
                      <span>Create / Send Assessment </span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      aria-disabled={!mayInviteAIInterview || undefined}
                      title={!mayInviteAIInterview ? aiInterviewDeniedReason : undefined}
                      className={`flex items-center gap-2.5 px-4 py-2.5 text-sm ${mayInviteAIInterview ? 'cursor-pointer' : 'text-gray-400 opacity-60 cursor-not-allowed'}`}
                      onSelect={(e) => {
                        if (!mayInviteAIInterview) {
                          // Locked: tooltip only, no toast.
                          e.preventDefault();
                          return;
                        }
                        onOpenInviteDrawer('interview', selectedCandidates);
                      }}
                    >
                      <Video className="w-4 h-4 text-menu-icon-ai" />
                      <span>Create / Send AI Interview </span>
                    </DropdownMenuItem>
                    {/* Export, last — the ticked candidates, through the AI
                        Talent Match page's CSV / Excel picker. */}
                    <DropdownMenuItem
                      aria-disabled={!canExport || undefined}
                      title={!canExport ? 'You do not have permission to export matched candidates' : undefined}
                      className={`flex items-center gap-2.5 px-4 py-2.5 text-sm ${canExport ? 'cursor-pointer' : 'text-gray-400 opacity-60 cursor-not-allowed'}`}
                      onSelect={(e) => {
                        if (!canExport) {
                          // Locked: tooltip only, no toast.
                          e.preventDefault();
                          return;
                        }
                        setShowExportModal(true);
                      }}
                    >
                      <FileDown className="w-4 h-4 text-menu-icon-download" />
                      <span>Export</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </>
          }
          /* Order: Select All → Search → All Matches → Sort → More Filters
             (ListToolbar's own, right after these) → Grid/List. All h-9. */
          leadingActions={
            <>
              {/* Match threshold + sort — the shared ToolbarFilterSelect /
                  SortByControl, so these are the very controls the sibling
                  result tabs render rather than hand-rolled copies. */}
              <ToolbarFilterSelect
                value={String(filterThreshold)}
                onChange={(value) => setFilterThreshold(Number(value))}
                ariaLabel="Filter by match threshold"
              >
                <option value={0}>All Matches</option>
                <option value={50}>50%+ Match</option>
                <option value={70}>70%+ Match</option>
                <option value={85}>85%+ Match</option>
              </ToolbarFilterSelect>
              <SortByControl<typeof sortBy>
                value={sortBy}
                order={sortOrder}
                options={[
                  { value: 'rank', label: 'Rating' },
                  { value: 'name', label: 'Name' },
                  { value: 'score', label: 'Score' },
                  { value: 'experience', label: 'Experience' },
                ]}
                onChange={setSortBy}
                onToggleOrder={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
              />
            </>
          }
          /* Run Match — right beside More Filters, only while nothing is
             ticked: a selection swaps it out for the Actions menu, and
             clearing the selection brings it back. Same permission gate and
             handler as the empty state's Run AI Match. */
          afterFiltersActions={selectedIds.size === 0 ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => { if (canRunAiMatch) onRunMatch(); }}
              aria-disabled={!canRunAiMatch || undefined}
              title={!canRunAiMatch ? 'You do not have permission to run AI Talent Match' : undefined}
              icon={<Sparkles className="w-4 h-4" />}
              className={`sm:h-9 whitespace-nowrap${!canRunAiMatch ? ' opacity-60 cursor-not-allowed' : ''}`}
            >
              Run Match
            </Button>
          ) : undefined}
          /* No in-toolbar count label — the tab navigation's own badge already
             shows the candidate count, so a "18 candidates" pill here only
             duplicated it (and the siblings don't carry one). */
          filterPanel={
            /* pb-4 keeps the inputs off the card's bottom border (they were 1px
               from it); gap-3 sm:gap-4 matches the master's field spacing. */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 [&>div]:min-w-0 pb-4">
              <div>
                <label className="block text-sm text-gray-700 dark:text-slate-300 mb-1.5 font-medium">Phone</label>
                <input
                  type="text"
                  value={filterPhone}
                  onChange={(e) => setFilterPhone(e.target.value)}
                  placeholder="Filter by phone..."
                  className="w-full h-9 px-3 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue hover:border-brand-blue/40 transition-colors text-sm text-black dark:text-slate-50 placeholder:text-gray-400 dark:placeholder:text-slate-500 bg-white dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 dark:text-slate-300 mb-1.5 font-medium">Location</label>
                <input
                  type="text"
                  value={filterLocation}
                  onChange={(e) => setFilterLocation(e.target.value)}
                  placeholder="Filter by location..."
                  className="w-full h-9 px-3 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue hover:border-brand-blue/40 transition-colors text-sm text-black dark:text-slate-50 placeholder:text-gray-400 dark:placeholder:text-slate-500 bg-white dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 dark:text-slate-300 mb-1.5 font-medium">Experience (min)</label>
                <input
                  type="number"
                  value={filterExperienceMin}
                  onChange={(e) => setFilterExperienceMin(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="Min exp"
                  className="w-full h-9 px-3 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue hover:border-brand-blue/40 transition-colors text-sm text-black dark:text-slate-50 placeholder:text-gray-400 dark:placeholder:text-slate-500 bg-white dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 dark:text-slate-300 mb-1.5 font-medium">Experience (max)</label>
                <input
                  type="number"
                  value={filterExperienceMax}
                  onChange={(e) => setFilterExperienceMax(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="Max exp"
                  className="w-full h-9 px-3 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue hover:border-brand-blue/40 transition-colors text-sm text-black dark:text-slate-50 placeholder:text-gray-400 dark:placeholder:text-slate-500 bg-white dark:bg-slate-900"
                />
              </div>
            </div>
          }
          />
        );
        return toolbarPortal
          ? createPortal(toolbar, toolbarPortal)
          : <div className="space-y-3">{toolbar}</div>;
      })()}

      {/* Table / Grid */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 overflow-hidden">
        {displayMode === 'grid' ? (
          <div className="min-h-[400px] max-h-[calc(100dvh-20rem)] overflow-auto p-4">
            {filteredCandidates.length === 0 ? (
              <div className="px-4 py-12 text-center text-gray-500 dark:text-slate-500 text-sm">
                No candidates match the current filters.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {paginatedCandidates.map((candidate) => {
                  const isScored = scoredResumeIds.has(candidate.resumeId);
                  return (
                    <div
                      key={candidate.resumeId}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        if (onViewCandidate) {
                          try {
                            sessionStorage.setItem('resumeNavList', JSON.stringify(filteredCandidates.map((c) => c.resumeId)));
                            sessionStorage.setItem('resumeNavSource', 'job-details');
                          } catch { /* ignore */ }
                          onViewCandidate(candidate);
                        }
                      }}
                      onKeyDown={(e) => {
                        if ((e.key === 'Enter' || e.key === ' ') && onViewCandidate) {
                          e.preventDefault();
                          try {
                            sessionStorage.setItem('resumeNavList', JSON.stringify(filteredCandidates.map((c) => c.resumeId)));
                            sessionStorage.setItem('resumeNavSource', 'job-details');
                          } catch { /* ignore */ }
                          onViewCandidate(candidate);
                        }
                      }}
                      className={`group relative text-left bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 hover:shadow-md hover:border-brand-blue/20 hover:-translate-y-0.5 transition-all p-4 flex flex-col gap-3 cursor-pointer ${gridCardSelectedClass(selectedIds.has(candidate.resumeId))}`}
                    >
                      <GridCardSelect
                        selected={selectedIds.has(candidate.resumeId)}
                        onToggle={() => toggleSelect(candidate.resumeId)}
                        label={candidate.name || 'candidate'}
                        selectionActive={selectedIds.size > 0}
                      />
                      <div className="flex items-start gap-2.5">
                        <NameAvatar name={candidate.name} fallback={candidate.email} size="md" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-900 dark:text-slate-50 truncate">{formatCandidateFirstName(candidate.name)}</p>
                          {candidate.title && (
                            <p className="text-xs text-gray-500 dark:text-slate-500 truncate">{candidate.title}</p>
                          )}
                        </div>
                        <div className={`inline-flex items-center justify-center px-2 py-0.5 rounded-md font-bold text-xs shrink-0 ${
                          (candidate.rank || 0) >= 7 ? 'bg-success-subtle text-success-strong border border-success-line' :
                          (candidate.rank || 0) >= 4 ? 'bg-warning-subtle text-warning-strong border border-warning-line' :
                          (candidate.rank || 0) >= 1 ? 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 border border-gray-300 dark:border-slate-700' :
                          'bg-gray-50 dark:bg-slate-800/50 text-gray-400 dark:text-slate-500 border border-gray-200 dark:border-slate-700'
                        }`}>
                          {candidate.rank || '-'}
                        </div>
                      </div>

                      <p className="text-xs text-gray-600 dark:text-slate-400 truncate">
                        {candidate.email || '—'}{candidate.location ? ` · ${candidate.location}` : ''}
                      </p>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        {isScored ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-success-subtle text-success rounded-full text-xs font-medium">
                            <CheckCircle className="w-3 h-3" />
                            Scored
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-500 rounded-full text-xs font-medium">
                            <XCircle className="w-3 h-3" />
                            Not Scored
                          </span>
                        )}
                        {candidate.experience && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/15">
                            {candidate.experience}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 dark:bg-slate-700 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full ${
                              candidate.matchScore >= 70 ? 'bg-success' :
                              candidate.matchScore >= 45 ? 'bg-warning' : 'bg-destructive'
                            }`}
                            style={{ width: `${Math.min(100, candidate.matchScore)}%` }}
                          />
                        </div>
                        <span className="font-medium text-xs shrink-0 text-gray-700 dark:text-slate-300">
                          {Math.round(candidate.matchScore)}% match
                        </span>
                      </div>

                      <div
                        onClick={(e) => { e.stopPropagation(); handleAttachmentsClick(candidate); }}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-blue bg-brand-blue/5 hover:bg-brand-blue/10 ring-1 ring-brand-blue/20 rounded-lg transition-colors"
                      >
                        <Paperclip className="w-3.5 h-3.5" />
                        Resume ({candidate.attachmentCount ?? 1})
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
        /* Bounded viewport: rows scroll vertically (and horizontally) while the
            header stays pinned. Header background/border live on the cells so the
            pinned row paints solid over the rows sliding underneath. */
        <>
        <div className="hidden md:block min-h-[400px] max-h-[calc(100dvh-20rem)] overflow-auto tf-table-shell">
          {/* With no rows the width floor and the header come off — see
              `TABLE_EMPTY_PANEL_CLASS`. A 1450px table centres its one empty cell across
              1450px, which put the message off the side of the shell behind a
              scrollbar that existed only to reach it. */}
          {/* The AI Talent Match page's candidate table (All → View by Job):
              Rating · Candidate · Experience · Resume Version · Scored Status ·
              Actions — its header type, row padding, rating circle, name over
              email, pills, icon checkboxes and ⋮ row-action button. Same data,
              same handlers: the row opens the candidate, ⋮ offers that and the
              Attachments the old column held. */}
          <table className={`w-full table-auto ${filteredCandidates.length === 0 ? '' : 'min-w-[880px]'}`}>
            {filteredCandidates.length > 0 && (
            <thead className="sticky top-0 z-10 [&_th]:bg-gray-50 dark:[&_th]:bg-slate-800 [&_th]:border-b [&_th]:border-gray-200 dark:[&_th]:border-slate-700">
              <tr>
                {/* Leading select column — an EMPTY header cell: no Select-All
                    checkbox here (that control lives in the toolbar above). */}
                <th className="w-10 px-3 py-2.5 align-middle tf-sticky-col-left" aria-label="Select" />
                <th className="text-center py-2.5 px-3 text-xs font-semibold text-gray-700 dark:text-slate-300 uppercase tracking-wide whitespace-nowrap align-middle">Rating</th>
                <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-700 dark:text-slate-300 uppercase tracking-wide whitespace-nowrap align-middle">Candidate</th>
                <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-700 dark:text-slate-300 uppercase tracking-wide whitespace-nowrap align-middle">Experience</th>
                <th className="text-center py-2.5 px-3 text-xs font-semibold text-gray-700 dark:text-slate-300 uppercase tracking-wide whitespace-nowrap align-middle">Resume Version</th>
                <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-700 dark:text-slate-300 uppercase tracking-wide whitespace-nowrap align-middle">Scored Status</th>
                <th className="text-right py-2.5 px-3 text-xs font-semibold text-gray-700 dark:text-slate-300 uppercase tracking-wide whitespace-nowrap align-middle tf-sticky-col !bg-gray-50 dark:!bg-slate-800">Actions</th>
              </tr>
            </thead>
            )}
            <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
              {filteredCandidates.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-0">
                    <div className={`${TABLE_EMPTY_PANEL_CLASS} text-sm text-gray-500 dark:text-slate-500`}>
                      No candidates match the current filters.
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedCandidates.map((candidate) => {
                  const isScored = scoredResumeIds.has(candidate.resumeId);
                  const isSelected = selectedIds.has(candidate.resumeId);
                  const rank = candidate.rank || 0;
                  const uploadDate = candidate.uploadDate ? formatISTDate(candidate.uploadDate) : '—';
                  /* Opens the candidate — the row click, and ⋮ › View Resume. */
                  const openCandidate = () => {
                    if (onViewCandidate) {
                      try {
                        sessionStorage.setItem('resumeNavList', JSON.stringify(filteredCandidates.map((c) => c.resumeId)));
                        sessionStorage.setItem('resumeNavSource', 'job-details');
                      } catch { /* ignore */ }
                      onViewCandidate(candidate);
                    }
                  };

                  const isExpanded = expandedRowIds.has(candidate.resumeId);

                  return (
                    <Fragment key={candidate.resumeId}>
                    <tr
                      data-row-selected={isSelected}
                      aria-expanded={isExpanded}
                      title={isExpanded ? 'Hide details' : 'Show details'}
                      className={`transition-colors cursor-pointer ${isSelected ? 'bg-brand-blue/[0.04]' : 'hover:bg-gray-50/70 dark:hover:bg-slate-800/40'}`}
                      onClick={() => toggleRowExpanded(candidate.resumeId)}
                    >
                      {/* Row checkbox — the reference's icon checkbox, same
                          toggle; stopPropagation so ticking doesn't open it. */}
                      <td className="px-3 py-2.5 align-middle tf-sticky-col-left" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => toggleSelect(candidate.resumeId)}
                          aria-pressed={isSelected}
                          aria-label={isSelected ? 'Deselect candidate' : 'Select candidate'}
                          className="inline-flex p-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded"
                        >
                          {isSelected ? <CheckSquare className="w-4 h-4 text-brand-blue" /> : <Square className="w-4 h-4 text-gray-400" />}
                        </button>
                      </td>
                      {/* Rating — 10 green, 9–7 orange, below 7 red. */}
                      <td className="text-center px-3 py-2.5 align-middle">
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold border ${
                          !rank ? 'bg-gray-50 dark:bg-slate-800/50 text-gray-400 dark:text-slate-500 border-gray-200 dark:border-slate-700'
                          : rank >= 10 ? 'bg-success-subtle text-success border-success-line'
                          : rank >= 7 ? 'bg-brand-orange/10 text-brand-orange-deep border-brand-orange/20'
                          : 'bg-destructive-subtle text-destructive border-destructive-line'
                        }`}>
                          {candidate.rank || '-'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 align-middle">
                        <div className="min-w-0">
                          <p
                            className="text-sm font-medium text-blue-600 dark:text-blue-400 truncate max-w-[16rem]"
                            title={[formatCandidateFirstName(candidate.name), candidate.title].filter(Boolean).join(' · ')}
                          >
                            {formatCandidateFirstName(candidate.name)}
                          </p>
                          {candidate.email && <p className="text-xs text-gray-500 dark:text-slate-500 truncate max-w-[16rem]" title={candidate.email}>{candidate.email}</p>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 align-middle text-sm text-gray-700 dark:text-slate-300 whitespace-nowrap">{candidate.experience || '-'}</td>
                      <td className="text-center px-3 py-2.5 align-middle whitespace-nowrap">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs border bg-gray-50 dark:bg-slate-800/50 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700">
                          v{candidate.resumeVersion ?? 1}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                        {isScored ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-success-subtle text-success border border-success/20">
                            <CheckCircle2 className="w-3 h-3" />
                            Scored
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-50 dark:bg-slate-800/50 text-gray-600 dark:text-slate-400 border border-gray-200 dark:border-slate-700">
                            <XCircle className="w-3 h-3" />
                            Not Scored
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-middle text-right tf-sticky-col" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1.5">
                        {/* Off while two or more candidates are ticked: those
                            run from the toolbar's Actions (same `selectedIds`).
                            The wrapper carries the reason — a disabled button
                            shows no tooltip. */}
                        <span className="inline-flex" title={selectedIds.size >= 2 ? 'Several candidates are selected — use Actions above, or clear the selection' : undefined}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild disabled={selectedIds.size >= 2}>
                            <button
                              type="button"
                              aria-label="Actions"
                              title={selectedIds.size >= 2 ? undefined : 'Actions'}
                              disabled={selectedIds.size >= 2}
                              className={ROW_ACTION_BUTTON_CLASS}
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56 !rounded-lg !bg-white !py-1 !px-0 !shadow-xl [&_[role=menuitem][data-highlighted]]:!bg-gray-100 [&_[role=menuitem]:hover]:!bg-gray-100">
                            {onViewCandidate && (
                              <DropdownMenuItem className="flex items-center gap-2.5 px-4 py-2.5 text-sm cursor-pointer" onSelect={openCandidate}>
                                <Eye className="w-4 h-4 text-menu-icon-view" />
                                <span>View Resume</span>
                              </DropdownMenuItem>
                            )}
                            {/* Score — Score Selected for this one candidate:
                                off, with the reason, once scored for this job
                                version (or while that is still being checked). */}
                            {!scoredResumesLoaded || isScored ? (
                              <DropdownMenuItem className="flex !items-start gap-2.5 px-4 py-2.5 text-sm text-gray-400" disabled>
                                <ClipboardList className="w-4 h-4 text-gray-400 mt-0.5" />
                                <span className="min-w-0">
                                  <span className="block">Score</span>
                                  <span className="block text-2xs text-gray-400 normal-case whitespace-normal">
                                    {!scoredResumesLoaded
                                      ? 'Checking scored status…'
                                      : 'Already scored for this job version.'}
                                  </span>
                                </span>
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                className="flex items-center gap-2.5 px-4 py-2.5 text-sm cursor-pointer"
                                onSelect={() => onScoreSelected([candidate])}
                              >
                                <ClipboardList className="w-4 h-4 text-menu-icon-score" />
                                <span>Score</span>
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem className="flex items-center gap-2.5 px-4 py-2.5 text-sm cursor-pointer" onSelect={() => handleAttachmentsClick(candidate)}>
                              <Paperclip className="w-4 h-4 text-menu-icon-download" />
                              <span>Attachments ({candidate.attachmentCount ?? 1})</span>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="my-1 bg-gray-100" />
                            {/* This row's candidate: the toolbar Actions' Create /
                                Send items, for one — same handlers, icons and
                                permission reads. */}
                            <DropdownMenuItem
                              aria-disabled={!canCreateAssessments || undefined}
                              title={!canCreateAssessments ? assessmentDeniedReason : undefined}
                              className={`flex items-center gap-2.5 px-4 py-2.5 text-sm ${canCreateAssessments ? 'cursor-pointer' : 'text-gray-400 opacity-60 cursor-not-allowed'}`}
                              onSelect={(e) => {
                                if (!canCreateAssessments) {
                                  // Locked: tooltip only, no toast.
                                  e.preventDefault();
                                  return;
                                }
                                onOpenInviteDrawer('assessment', [candidate]);
                              }}
                            >
                              <ClipboardList className="w-4 h-4 text-menu-icon-view" />
                              <span>Create / Send Assessment</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              aria-disabled={!mayInviteAIInterview || undefined}
                              title={!mayInviteAIInterview ? aiInterviewDeniedReason : undefined}
                              className={`flex items-center gap-2.5 px-4 py-2.5 text-sm ${mayInviteAIInterview ? 'cursor-pointer' : 'text-gray-400 opacity-60 cursor-not-allowed'}`}
                              onSelect={(e) => {
                                if (!mayInviteAIInterview) {
                                  // Locked: tooltip only, no toast.
                                  e.preventDefault();
                                  return;
                                }
                                onOpenInviteDrawer('interview', [candidate]);
                              }}
                            >
                              <Video className="w-4 h-4 text-menu-icon-ai" />
                              <span>Create / Send AI Interview</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        </span>
                        {/* ▾ — this row's details, open / closed (the row click does the same). */}
                        <button
                          type="button"
                          onClick={() => toggleRowExpanded(candidate.resumeId)}
                          aria-expanded={isExpanded}
                          aria-label={isExpanded ? 'Hide details' : 'Show details'}
                          title={isExpanded ? 'Hide details' : 'Show details'}
                          className={isExpanded ? ROW_ACTION_BUTTON_ACTIVE_CLASS : ROW_ACTION_BUTTON_CLASS}
                        >
                          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                        </button>
                        </div>
                      </td>
                    </tr>
                    {/* The row's remaining details — the original table's
                        Phone, Location, Skills, Uploaded By / Date and
                        Attachments cells — in a nested table under it, the
                        AI Talent Match page's expanded-row panel. */}
                    {isExpanded && (
                      <tr className="bg-gray-50/60 dark:bg-slate-800/30">
                        <td colSpan={7} className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-x-auto">
                            <table className="w-full min-w-[760px]">
                              <thead className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
                                <tr>
                                  <th className="py-2.5 px-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Phone</th>
                                  <th className="py-2.5 px-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Location</th>
                                  <th className="py-2.5 px-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Skills</th>
                                  <th className="py-2.5 px-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Uploaded By</th>
                                  <th className="py-2.5 px-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Uploaded Date</th>
                                  <th className="py-2.5 px-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Attachments</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr>
                              <td className="px-3 py-2.5 align-middle text-sm text-gray-700 dark:text-slate-300 whitespace-nowrap">
                                {(() => {
                                  const numbers = splitPhoneNumbers(candidate.phone, 2);
                                  if (numbers.length === 0) return '—';
                                  return (
                                    <div className="flex flex-col gap-0.5">
                                      {numbers.map((num, i) => <span key={i}>{num}</span>)}
                                    </div>
                                  );
                                })()}
                              </td>
                              <td className="px-3 py-2.5 align-middle text-sm text-gray-700 dark:text-slate-300 whitespace-nowrap">{candidate.location || '—'}</td>
                              <td className="px-3 py-2.5 align-middle min-w-[220px] max-w-[260px]">
                                <div className="flex flex-nowrap items-center gap-1 overflow-hidden">
                                  <SkillsList
                                    skills={candidate.skills}
                                    max={1}
                                    chipClassName="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full border border-blue-200 min-w-0 shrink truncate max-w-[160px]"
                                    moreClassName="px-2 py-0.5 text-xs text-blue-600 font-medium rounded-full hover:bg-blue-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                                  />
                                </div>
                              </td>
                              <td className="px-3 py-2.5 align-middle text-sm text-gray-700 dark:text-slate-300 whitespace-nowrap">{candidate.uploadedByName || candidate.uploadedBy || '—'}</td>
                              <td className="px-3 py-2.5 align-middle text-sm text-gray-700 dark:text-slate-300 whitespace-nowrap">{uploadDate}</td>
                              <td className="px-3 py-2.5 align-middle" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => handleAttachmentsClick(candidate)}
                                  title="Attachments"
                                  aria-label={`Attachments (${candidate.attachmentCount ?? 1})`}
                                  className={`${ROW_ACTION_BUTTON_CLASS} gap-1.5 !py-2 !px-2.5 text-xs font-medium`}
                                >
                                  <Paperclip className="w-3.5 h-3.5" />
                                  {candidate.attachmentCount ?? 1}
                                </button>
                              </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {/* Mobile: candidates render as cards instead of a 1450px-wide horizontal-scroll table (§10). */}
        <div className="md:hidden space-y-3">
          {filteredCandidates.length === 0 ? (
            <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 text-center text-sm text-gray-500 dark:text-slate-500">
              No candidates match the current filters.
            </div>
          ) : (
            paginatedCandidates.map((candidate) => {
              const isScored = scoredResumeIds.has(candidate.resumeId);
              const uploadDate = candidate.uploadDate ? formatISTDate(candidate.uploadDate) : '—';
              const rank = candidate.rank || 0;
              const rankCls = rank >= 7
                ? 'bg-success-subtle text-success-strong border-success-line'
                : rank >= 4
                ? 'bg-warning-subtle text-warning-strong border-warning-line'
                : rank >= 1
                ? 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 border-gray-300 dark:border-slate-700'
                : 'bg-gray-50 dark:bg-slate-800/50 text-gray-400 dark:text-slate-500 border-gray-200 dark:border-slate-700';
              return (
                <div
                  key={candidate.resumeId}
                  onClick={() => {
                    if (onViewCandidate) {
                      try {
                        sessionStorage.setItem('resumeNavList', JSON.stringify(filteredCandidates.map((c) => c.resumeId)));
                        sessionStorage.setItem('resumeNavSource', 'job-details');
                      } catch { /* ignore */ }
                      onViewCandidate(candidate);
                    }
                  }}
                  className={`rounded-xl border p-4 space-y-3 cursor-pointer ${selectedIds.has(candidate.resumeId) ? 'border-brand-blue/40 bg-blue-50 dark:bg-slate-800/50' : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900'}`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(candidate.resumeId)}
                      onChange={() => toggleSelect(candidate.resumeId)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1 rounded border-gray-300 flex-shrink-0"
                    />
                    <NameAvatar name={candidate.name} fallback={candidate.email} size="lg" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 dark:text-slate-50 truncate">{formatCandidateFirstName(candidate.name)}</p>
                      {candidate.title && <p className="text-xs text-gray-500 dark:text-slate-500 truncate">{candidate.title}</p>}
                      <p className="text-xs text-gray-600 dark:text-slate-400 truncate">{candidate.email || '—'}</p>
                    </div>
                    <div className={`inline-flex items-center justify-center px-2.5 py-1 rounded-md font-bold text-sm border flex-shrink-0 ${rankCls}`}>
                      {candidate.rank || '-'}
                    </div>
                  </div>
                  {candidate.skills && candidate.skills.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                      <SkillsList
                        skills={candidate.skills}
                        chipClassName="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full border border-blue-200 whitespace-nowrap"
                        moreClassName="px-2 py-0.5 text-xs text-blue-600 font-medium rounded-full hover:bg-blue-50 transition-colors cursor-pointer whitespace-nowrap"
                      />
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <div><span className="text-gray-500 dark:text-slate-500">Experience: </span><span className="text-gray-700 dark:text-slate-300">{candidate.experience || '—'}</span></div>
                    <div className="truncate"><span className="text-gray-500 dark:text-slate-500">Location: </span><span className="text-gray-700 dark:text-slate-300">{candidate.location || '—'}</span></div>
                    <div className="truncate"><span className="text-gray-500 dark:text-slate-500">Phone: </span><span className="text-gray-700 dark:text-slate-300">{splitPhoneNumbers(candidate.phone, 1)[0] || '—'}</span></div>
                    <div><span className="text-gray-500 dark:text-slate-500">Uploaded: </span><span className="text-gray-700 dark:text-slate-300">{uploadDate}</span></div>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    {isScored ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-success-subtle text-success rounded-full text-xs font-medium">
                        <CheckCircle className="w-3 h-3" />Scored
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-500 rounded-full text-xs font-medium">
                        <XCircle className="w-3 h-3" />Not Scored
                      </span>
                    )}
                    <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); handleAttachmentsClick(candidate); }} icon={<Paperclip className="w-3.5 h-3.5" />}>
                      {candidate.attachmentCount ?? 1}
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
        </>
        )}
      </div>

      {/* Pagination — the shared ListPagination, so this tab gets the exact same
          bordered-card format (Show / per page · Showing X to Y of N · Go to ·
          page nav) as the Job Openings master and the Scored Resumes /
          Assessments tabs, instead of the old in-table footer bar. */}
      <ListPagination
        currentPage={safeCurrentPage}
        itemsPerPage={itemsPerPage}
        totalItems={filteredCandidates.length}
        onPageChange={setCurrentPage}
        onItemsPerPageChange={(size) => { setItemsPerPage(size); setCurrentPage(1); }}
        itemLabel="candidates"
      />

      {/* Version History popup — same component and behavior as the
          standalone AI Talent Match page and the My Resumes list. */}
      {selectedVersionsCandidate && (
        <ResumeVersionsModal
          candidate={selectedVersionsCandidate}
          versions={realVersionsData}
          loading={loadingVersions}
          onClose={() => {
            setSelectedVersionsCandidate(null);
            setRealVersionsData([]);
          }}
        />
      )}
    </div>
  );
}
