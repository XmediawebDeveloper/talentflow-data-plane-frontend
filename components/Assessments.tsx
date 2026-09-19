'use client';

import JobIdBadge from '@/components/jobs/JobIdBadge';
import { Plus, Clock, Calendar, Users, CheckCircle, FileText, ArrowDown, ArrowRight, FileCheck, MoreVertical, Play, Sparkles, Eye, Edit2, BarChart, Mail, Trash2, Copy, Archive, Download, Link2, Share2, PauseCircle, Monitor, Brain, Code, ClipboardList, Globe, Pencil, Shield, Video, X, Info, CheckCircle2, Check, MonitorOff, Clipboard, Lock, TrendingUp, Activity, Loader2, ClipboardCheck, ChevronRight, ListFilter, FilterX, FileDown, FileSpreadsheet, CheckSquare, Square } from 'lucide-react';
import { StatsCard, StatsCardGrid } from '@/components/ui/stats-card';
import { MENU_ITEM_SCALE_CLASS } from '@/lib/constants/menuAnimation';
import { useState, useEffect, useRef } from 'react';
import { useDialogHeightLock } from '@/lib/hooks/useDialogHeightLock';
import { TRACKER_DIALOG_PANEL_CLASS, TRACKER_DIALOG_PLACEHOLDER_CLASS } from '@/lib/constants/trackerDialog';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import AssessmentCreation from './AssessmentCreation';
import ListPagination from './ListPagination';
import AssessmentResults from './AssessmentResults';
import ShareAssessmentModal from './ShareAssessmentModal';
import AssessmentAuditTrail from './AssessmentAuditTrail';
import ConsentLogs from './compliance/ConsentLogs';
import AssessmentPreviewModal from './AssessmentPreviewModal';
import AssessmentEditModal from './AssessmentEditModal';
import JDVersionHistoryModal from '@/components/JDVersionHistoryModal';
import AssessmentDetailsView from './AssessmentDetailsView';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import InviteFilterBar, { EMPTY_INVITE_FILTERS, ASSESSMENT_INVITE_STATUS_OPTIONS, type InviteFilterState } from './InviteFilterBar';
import InviteStatCards, { INVITE_CARD_TONES } from './InviteStatCards';
import ListToolbar from '@/components/ui/list-toolbar';
import ListCountBadge from '@/components/ui/list-count-badge';
/* The two shared empty states. ListEmptyState covers a LIST in its two
   flavours — narrowed to nothing by a search/filter (keep the controls, offer
   a reset) versus no records at all; TabEmptyState covers a tab that has no
   records at all and no filters of its own. Both are documented at their
   definitions, and this page had been hand-rolling four variants of them. */
import ListEmptyState from '@/components/ui/list-empty-state';
import TabEmptyState, { TAB_EMPTY_ACTION_CLASS } from '@/components/ui/tab-empty-state';
/* The Position filter's control. The same SearchableSelect the All Assessments
   table uses for its Job filter — a plain <select> stops working once the
   option list is drawn from data, which a tenant's job list is. */
import SearchableSelect, { type SearchableSelectOption } from '@/components/ui/searchable-select';
import { useListSearch } from '@/lib/hooks/useListSearch';
import type { AssessmentAttemptResponse } from '@/lib/services/assessmentService';

import { Job } from '@/lib/types/types';
import { assessmentService } from '@/lib/services';
/* The job's own version list, for asking about each version by its own id —
   see `loadAssessmentLineage`. Same endpoint the version panel's job half
   already reads through `useJobVersionLineage`. */
import { jdService } from '@/lib/services/jdService';
/* Resume versions live on the scoring records — see the join in
   loadAllCompletedCandidates. */
import { scoringService } from '@/lib/services/scoringService';
import { recordAssessment } from '@/lib/services/usageTrackingService';
import api from '@/lib/services/api';
import { proctoringService, ProctoringSettings, ProctoringEvent } from '@/lib/services/proctoringService';
import { AlertTriangle, RefreshCw, Send, Ban, Layers, Briefcase, ChevronDown, Radar, Search, ChevronLeft } from 'lucide-react';
import { stripVersionFromTitle } from '@/lib/utils/assessmentUtils';
import { formatIST, formatISTDate } from '@/lib/utils/dateUtils';
import { useGlobalDialog } from '@/components/providers/GlobalDialogProvider';
import { toast } from 'sonner';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { IS_PRODUCTION_ENV } from '@/lib/utils/env';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import QuotaBadge from '@/components/ui/quota-badge';
import AllAssessmentsTable from '@/components/assessments/AllAssessmentsTable';
import AssessmentVersionHistoryPanel, { VersionChip, type AssessmentVersionRow } from '@/components/assessments/AssessmentVersionHistoryPanel';
import { useJobVersionLineage } from '@/lib/hooks/useJobVersionLineage';
import { groupByLineage, latestVersionNumber } from '@/lib/utils/jobOpeningDisplay';


/** What the version-history helpers below read off an assessment row — the
 *  rows themselves are the untyped shape `mapAssessmentFromApi` returns, so
 *  this names the three fields rather than widening to `any`. */
type AssessmentLineageRef = { id: string; jd_id?: string };

/** The canonical "Go to [input] · Previous · page/total · Next" control from
 *  components/Pagination.tsx, reused inline for this file's popup footers
 *  (Tracking Invitations, Completed Candidates, Invite Status Tracking) which
 *  don't otherwise fit that component's items-per-page/"Showing X-Y" shape. */
function InlinePageNav({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (page: number) => void }) {
  const [goToPage, setGoToPage] = useState(String(page));
  useEffect(() => {
    setGoToPage(String(page));
  }, [page]);

  const commitGoToPage = () => {
    const target = Math.round(Number(goToPage));
    if (Number.isFinite(target) && target >= 1 && target <= totalPages) {
      onPageChange(target);
    } else {
      setGoToPage(String(page));
    }
  };

  const navBtnClass =
    "inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-200 disabled:hover:text-gray-700 transition-colors";

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <div className="flex items-center gap-1.5">
        <span className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">Go to</span>
        <input
          type="number"
          min={1}
          max={totalPages}
          value={goToPage}
          onChange={(e) => setGoToPage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur();
              commitGoToPage();
            }
          }}
          onBlur={commitGoToPage}
          aria-label="Go to page"
          className="w-14 h-8 sm:h-9 px-2 text-sm text-center border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white text-gray-900"
        />
      </div>

      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        className={navBtnClass}
        aria-label="Previous page" title="Previous page"
      >
        <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
      </button>

      <span className="text-sm font-medium text-gray-700 px-1 whitespace-nowrap">
        <span className="text-brand-blue font-semibold">{page}</span> / {totalPages}
      </span>

      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages}
        className={navBtnClass}
        aria-label="Next page" title="Next page"
      >
        <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
      </button>
    </div>
  );
}

/* ── Send Invite: the job list, shared with Total Jobs ─────────────────────
   The dialog used to own a job list of its own: assessments grouped into a
   block per job, one row per job version, each row printing its job version
   and its assessment version. That whole implementation is gone. Send Invite
   now renders the Total Jobs rows themselves, through `renderJobListRow` and
   `collapseByLineage` inside the component — one job list on this page, drawn
   once, so the picker cannot drift from the list it sits in front of.

   What survives here is the lineage key, because the collapse and the per-job
   totals both bucket on it.

   `jd_short_id` ("JD-014") is that key: it is `Job.job_id` under the name the
   assessment endpoint gives it (see `mapJDToJob` and `lineageKey` in
   lib/utils/jobOpeningDisplay.ts), so it is the one field every version of a
   job shares. `jd_id` is NOT that field — it identifies the single JD version
   an assessment was built against, which is the thing a job's versions differ
   by, not the thing they collapse on. A row with neither falls back to its own
   id, so it stays a job of one rather than piling into a shared "no job"
   bucket where unrelated rows would look like versions of one another. */
const jobLineageKey = (a: { jd_short_id?: string; jd_id?: string; id: string }) =>
  a.jd_short_id || a.jd_id || `__unlinked__:${a.id}`;

const INVITATIONS_PAGE_SIZE = 10;
/** Batch size when pulling every assessment for a browser-side filter. */
const FULL_SET_BATCH_SIZE = 100;
/** How many versions one assessment lineage may hold. Duplicate mints the
 *  next sequential version until the lineage sits at this many, then the
 *  action reports the cap rather than creating another. */
const MAX_ASSESSMENT_VERSIONS = 5;
const assessmentDropdownMenuItemClass = 'group';
interface AssessmentsProps {
  jobs: Job[];
  onOpenCandidateView?: () => void;
  onNavigateToJDCreation?: () => void;
  autoOpenCreate?: boolean;
  preSelectedJdId?: string;
  preSelectedJdTitle?: string;
  /**
   * Open straight into the LIST on this tab, instead of on the summary cards.
   *
   * For arrivals that already know which cut of the list the recruiter wants —
   * "Go to Assessments" off the Publish step lands on All Assessments, beside
   * the assessment just published. Read from the URL by the route and applied
   * as the INITIAL state of `activeTab`/`pageView` rather than through an
   * effect, so the list and its highlighted card are what the first paint
   * shows: an effect would flash the cards view for a frame first.
   */
  initialListTab?: AssessmentPageTab;
}

type AssessmentPageTab =
  | 'jobs'
  | 'all'
  | 'active'
  | 'draft'
  | 'completed'
  | 'completed-candidates'
  | 'audit'
  | 'consent'
  | 'invitation-status'
  | 'archived'
  | 'settings';

type FlatAssessmentTab = Extract<AssessmentPageTab, 'all' | 'active' | 'draft'>;

const FLAT_ASSESSMENT_TABS = ['all', 'active', 'draft'] as const;

const isFlatAssessmentTab = (tab: AssessmentPageTab): tab is FlatAssessmentTab =>
  (FLAT_ASSESSMENT_TABS as readonly AssessmentPageTab[]).includes(tab);

const FLAT_ASSESSMENT_TABLE_CONFIG = {
  all: {
    title: 'All Assessments',
    description: 'View and manage all assessments across jobs and job versions.',
    fixedStatus: undefined,
  },
  active: {
    title: 'Active Assessments',
    description: 'View and manage published assessments ready for candidate invites.',
    fixedStatus: 'published',
  },
  draft: {
    title: 'Draft Assessments',
    description: 'View and manage draft assessments that are still being prepared.',
    fixedStatus: 'draft',
  },
} satisfies Record<FlatAssessmentTab, { title: string; description: string; fixedStatus?: 'published' | 'draft' }>;

/** A completed attempt, tagged with the assessment it belongs to. */
type CandidateResultRow = AssessmentAttemptResponse & {
  _assessment_id: string;
  _assessment_short_id?: string;
  _assessment_title?: string;
  /* The two version columns. Neither is on AssessmentAttemptResponse - an
     attempt records the candidate and the scores, not the job version it was
     built against nor which resume got them the invite - so both are joined on
     during the load and carried here.

       _jd_version     the JOB VERSION the parent assessment was authored
                       against (`AssessmentResponse.jd_version`). Free: the
                       load already walks those assessments.
       _resume_version the RESUME VERSION scored for this candidate against
                       that same job (`ScoringResponse.resume_version`).
                       Undefined when the candidate has no scoring record for
                       the job - a manually invited candidate has none - and
                       the column shows a dash rather than inventing a v1. */
  _jd_id?: string;
  _jd_version?: number;
  _resume_version?: number;
};

export default function Assessments({ jobs, onOpenCandidateView, onNavigateToJDCreation, autoOpenCreate, preSelectedJdId, preSelectedJdTitle, initialListTab }: AssessmentsProps) {
  const router = useRouter();
  const dialog = useGlobalDialog();
  const { user, isTenantAdmin, hasPermission, hasPermissionCode } = useAuth();

  // Permission checks for CRUD operations (bypass for tenant admin)
  const canCreateAssessment = isTenantAdmin || (user?.permissions?.canCreateAssessments ?? false);
  const canUpdateAssessment = isTenantAdmin || (user?.permissions?.canUpdateAssessments ?? false);
  const canDeleteAssessment = isTenantAdmin || (user?.permissions?.canDeleteAssessments ?? false);
  const canDownloadAssessmentPDF = isTenantAdmin || (user?.permissions?.canDownloadAssessmentPDF ?? false);
  const canBatchDownloadAssessmentPDF = isTenantAdmin || hasPermissionCode('assessments:batch_download') || (user?.permissions?.canExport ?? false);
  /* Download Report on an invitation row — the page's existing per-result PDF
     right, plus the permission code the catalogue names for it. */
  const canDownloadInviteReport = canDownloadAssessmentPDF || hasPermissionCode('assessments:download_report');
  // HR Question Bank is reached via a quick link here (moved out of the sidebar)
  const canAccessHRQuestionBank = isTenantAdmin || !!(user?.permissions?.canViewHRQuestionBank || user?.permissions?.canCreateHRQuestionBank || user?.permissions?.canUpdateHRQuestionBank || user?.permissions?.canDeleteHRQuestionBank);

  /* 'jobs' is the Total Jobs tab, which replaced the summary card of that name.
     It needs no branch anywhere: `getAssessmentStatusFilter` returns undefined
     for it (so the request carries no status), `filteredAssessments` has no
     status test for it, and none of the "does this tab list rows" gates exclude
     it — so it lists the Job List exactly as the card's drill-in did, with the
     same data, filters and pagination.

     The default stays 'all', so which tab the page opens on is unchanged. */
  const [activeTab, setActiveTab] = useState<AssessmentPageTab>(initialListTab ?? 'all');
  /* Two-step view: 'cards' shows only the 3 stat tiles; 'list' shows tabs +
     filters + assessments list.
     'cards' unless the arrival named a tab (`initialListTab`), which is the
     caller saying it already knows the cut of the list the recruiter wants.
     Set as initial state rather than in an effect so the first paint is the
     list with its tab pill and summary card already highlighted —
     `isOverviewCardActive` reads exactly this pair. */
  const [pageView, setPageView] = useState<'cards' | 'list'>(initialListTab ? 'list' : 'cards');
  const listSectionRef = useRef<HTMLDivElement | null>(null);
  const [listScrollRequest, setListScrollRequest] = useState(0);
  // Proctoring settings are a staging-only testing menu — in production it's
  // hidden, so land on Topics instead.
  const [settingsSubTab, setSettingsSubTab] = useState<'proctoring' | 'topics'>(IS_PRODUCTION_ENV ? 'topics' : 'proctoring');
  const [showCreation, setShowCreation] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedAssessmentForResults, setSelectedAssessmentForResults] = useState<any>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [selectedAssessmentForShare, setSelectedAssessmentForShare] = useState<any>(null);
  // Page-level Send Invite: the share modal needs one assessment, so this picker
  // stands in front of it when more than one is shareable.
  const [showInvitePicker, setShowInvitePicker] = useState(false);
  const [invitePickerQuery, setInvitePickerQuery] = useState('');
  /* The row ticked in the picker, held until the footer button is pressed.
     The picker used to have no such state — clicking a row set
     `selectedAssessmentForShare` and opened the share modal in the same
     breath, so there was never a moment where a choice existed but had not
     been acted on. The Invite to Assessment dialog's flow needs exactly that
     moment: pick, see it confirmed, then continue (or change your mind).

     The id rather than the row, unlike the `selectedAssessmentFor*` states
     above: a copy taken at click time goes stale if `reloadAssessments` lands
     while the dialog is open, and the row is one `find` away whenever it is
     actually needed. It also types itself, so this is the one piece of picker
     state that does not have to be `any`. */
  /**
   * What the Send Invite dialog has picked: ONE job, ONE job version, ONE
   * assessment version - the whole triple, held together.
   *
   * Two ids used to be kept side by side (the assessment, and the job whose
   * cards to lock). That was not enough. An assessment version number restarts
   * per job version, so "Assessment V1" names a different row under job V2
   * than under job V5, and the id alone cannot say which branch produced it.
   * The lock needs the job version; so does the Share modal, which prints
   * "JD-025 - Senior QA v2" beside the assessment badge.
   *
   * The job's own identity (`jdShortId`, `jobTitle`) is recorded here too,
   * because the row it is read from is a JOB card that has both, while the
   * assessment the panel hands back comes from the lineage cache, whose rows
   * carry `jd_id` and `jd_version` but neither the JD's short id nor its
   * title. Resolving the pick later and hoping those fields are on it is what
   * put an empty JD line in the share dialog.
   */
  const [invitePickerSelection, setInvitePickerSelection] = useState<{
    jobKey: string;
    jdId?: string;
    jdShortId?: string;
    jobTitle: string;
    jobVersion: number;
    jobVersionId?: string;
    assessmentId: string;
  } | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [selectedAssessmentForPreview, setSelectedAssessmentForPreview] = useState<any>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedAssessmentForEdit, setSelectedAssessmentForEdit] = useState<any>(null);
  /* The ASSESSMENT version picked inside the Job Versions panel, per JOB.
   *
   * Keyed by `jd_id` rather than held as one id, so the answer survives
   * closing the panel and opening it again - and so two jobs remember their
   * own choices instead of the second inheriting the first's. That is the
   * "correctly identified after reopen" half of the behaviour; the panel
   * itself keeps no copy.
   *
   * Seeded on open with the row's own representative assessment (the one the
   * Job List row stands for, which the panel already highlights as
   * `currentAssessmentId`), so the table opens on a sensible answer rather
   * than on nothing selected.
   *
   * One id per job and no more, so "one assessment version at a time" is a
   * property of the state here, not only of the radio group in the markup. */
  const [selectedAssessmentVersionByJob, setSelectedAssessmentVersionByJob] =
    useState<Record<string, string>>({});
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  // The open ⋮ dropdown. Only one exists at a time (grid and list views never
  // render together), so a single ref covers both.
  const openMenuRef = useRef<HTMLDivElement | null>(null);
  // Flip the ⋮ dropdown upward when there isn't enough room below the
  // trigger (rows near the bottom of the list), same rule AIInterview.tsx
  // uses — otherwise a menu with several items overlaps the row underneath.
  const [menuDropUp, setMenuDropUp] = useState(false);
  /** The open trigger's viewport rect, for placing the portalled dropdown. */
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; bottom: number; right: number } | null>(null);

  /**
   * Dismiss the ⋮ menu on any interaction outside it.
   *
   * This replaces the full-screen `fixed inset-0` overlay each menu used to
   * render. That overlay sat at z-10, below the page's sticky chrome, so a
   * click on anything stacked above it left the menu hanging open — and while
   * it was up it swallowed the first click on every other control. A
   * document-level listener closes the menu whatever the click lands on, and
   * lets that click through to do its job.
   *
   * Scroll closes it too: the dropdown is absolutely positioned, so a scrolled
   * list leaves it floating away from the row it belongs to.
   */
  useEffect(() => {
    if (!openMenuId) return;

    const close = () => setOpenMenuId(null);

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && openMenuRef.current?.contains(target)) return;
      // The trigger toggles itself — closing here first would let its own
      // click reopen the menu, so it never appears to shut.
      if (target instanceof Element && target.closest('[data-assessment-menu-trigger]')) return;
      close();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    // Capture phase catches scrolling inside the list container, not just the page.
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
    };
  }, [openMenuId]);
  const [showDetailsView, setShowDetailsView] = useState(false);
  const [selectedAssessmentForDetails, setSelectedAssessmentForDetails] = useState<any>(null);
  // Track Invites modal state
  const [showTrackInvitesModal, setShowTrackInvitesModal] = useState(false);
  /* Set when the tracking popup was opened from a Job List row's Track rather
     than from one assessment: the SAME popup, scoped to every assessment of
     the job instead of one.

     It holds the job's assessments rather than looking them up as it goes,
     because every load in the popup fans out across them and a list resolved
     once at open time cannot change under a page turn. `selectedAssessmentForTracking`
     is still set alongside it - to the row's own representative - so every
     existing read of that (the Refresh guard, the result-details fallback) keeps
     working unchanged. */
  const [trackingJob, setTrackingJob] = useState<{
    jobId?: string;
    jobTitle: string;
    jdId: string;
    assessments: any[];
  } | null>(null);
  const [selectedAssessmentForTracking, setSelectedAssessmentForTracking] = useState<any>(null);
  const [trackingInvitations, setTrackingInvitations] = useState<any[]>([]);
  const [isLoadingInvitations, setIsLoadingInvitations] = useState(false);
  const [isRefreshingTracking, setIsRefreshingTracking] = useState(false);
  /* Holds the tracking dialog's height while a manual Refresh runs, so the
     content-driven box cannot move under the pointer. Shared with every other
     popup that carries a Refresh button - see the hook for why. */
  const trackingHeightLock = useDialogHeightLock<HTMLDivElement>();
  const [invitationStats, setInvitationStats] = useState({
    total: 0,
    expired: 0,
    started: 0,
    completed: 0,
    failed: 0,
    terminated: 0,
  });
  const [editingEmailId, setEditingEmailId] = useState<string | null>(null);
  const [newEmailValue, setNewEmailValue] = useState('');
  const [isSendingChangeEmail, setIsSendingChangeEmail] = useState(false);
  // Resend confirmation dialog state
  const [resendTargetInvitation, setResendTargetInvitation] = useState<any | null>(null);
  const [isResending, setIsResending] = useState(false);
  // Clone confirmation state — simple confirm-only modal. The recruiter
  // invites V2 candidates manually via the normal invite flow.
  const [cloneTargetAssessment, setCloneTargetAssessment] = useState<any | null>(null);
  const [isCloning, setIsCloning] = useState(false);
  // Revoke confirmation state
  const [revokeTargetAssessment, setRevokeTargetAssessment] = useState<any | null>(null);
  const [revokeCount, setRevokeCount] = useState<number | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);
  // Set of assessment IDs revoked in THIS browser tab. We use a ref (not
  // state) because setState is async — if we set the state and then
  // immediately call reloadAssessments, the mapper closure inside
  // reloadAssessments still sees the OLD set, so the seal gets wiped by
  // the refetch. A ref is mutated synchronously.
  //
  // We also persist to sessionStorage so the seal survives component
  // unmount/remount (the user navigating away and back to Assessments).
  // Without persistence, navigating away wipes the ref and the next
  // fetch from a not-yet-redeployed backend re-enables Share / Revoke
  // a few minutes later. sessionStorage clears on tab close, so it's a
  // safe in-session cache that doesn't pollute other browser sessions.
  const REVOKED_IDS_STORAGE_KEY = 'tf:assessments:revoked-ids';
  const locallyRevokedIdsRef = useRef<Set<string>>(
    (() => {
      if (typeof window === 'undefined') return new Set<string>();
      try {
        const raw = window.sessionStorage.getItem(REVOKED_IDS_STORAGE_KEY);
        if (!raw) return new Set<string>();
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? new Set<string>(parsed) : new Set<string>();
      } catch {
        return new Set<string>();
      }
    })()
  );
  // Persist the ref to sessionStorage whenever we mutate it (called from
  // handleConfirmRevoke after adding the id).
  const persistLocallyRevokedIds = () => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(
        REVOKED_IDS_STORAGE_KEY,
        JSON.stringify(Array.from(locallyRevokedIdsRef.current)),
      );
    } catch {
      /* sessionStorage full or unavailable — non-fatal */
    }
  };
  // A counter that we bump whenever the ref changes, to trigger re-renders
  // of components that need to re-evaluate based on the ref.
  const [revokedTick, setRevokedTick] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [apiAssessments, setApiAssessments] = useState<any[]>([]);
  const [assessmentCurrentPage, setAssessmentCurrentPage] = useState(1);
  const [assessmentItemsPerPage, setAssessmentItemsPerPage] = useState(10);

  /* ── Assessment version history ────────────────────────────────────────
     The list is flat: an assessment duplicated to V2 and V3 puts three
     separate cards on the page with nothing tying them together. Each card
     that belongs to a multi-version lineage gets a View Versions toggle
     expanding the whole lineage in place, the way the Job Openings list
     does it.

     Keyed by JD id, not by assessment id: an assessment's versions ARE the
     other assessments sharing its JD (that is what the version cap counts,
     and what the details view's own "New Versions" tab fetches), so all three
     cards of one lineage read and fill the same cache entry — expanding V2
     after V1 costs no second request. */
  const [openVersionsFor, setOpenVersionsFor] = useState<string | null>(null);
  /* The job the Version History popup is open on, and which version of it the
     popup should land on.

     `versionNumber` is held here rather than read off `jdId` because the two
     answer different questions: the id fetches the lineage, the number picks a
     version inside it. Null opens the popup on the LIST of versions - which is
     what the Job List row's eye wants, since that eye is about the job - while
     a number opens straight onto that version, which is what each Job Versions
     row's own eye wants.

     Same popup, same props, as the Create Assessment picker's eye
     (`versionHistoryFor` / `versionHistoryVersion` in AssessmentCreation) and
     as the Job Details page's own Version History, so a job version reads the
     same wherever it is opened from. */
  const [jobDetailsPopup, setJobDetailsPopup] = useState<{
    jdId: string;
    jdTitle: string;
    versionNumber: number | null;
  } | null>(null);
  const openJobDetails = (jdId: string, jdTitle: string, versionNumber: number | null = null) =>
    setJobDetailsPopup({ jdId, jdTitle, versionNumber });
  /* The JOB half of the history. Same hook the Job Openings list and the Apply
     to Job dialog use, so the job versions a recruiter reads here are the ones
     they read there, from the same endpoints - lineage plus the per-version JD
     record the Job Title, Experience / Industry, Location and Work
     Mode / Type columns need. */
  const jdLineage = useJobVersionLineage();
  const [assessmentLineages, setAssessmentLineages] = useState<Record<string, AssessmentVersionRow[]>>({});
  const [loadingLineages, setLoadingLineages] = useState<Record<string, boolean>>({});

  /**
   * Which JD VERSIONS already have an assessment, straight from the backend
   * (`/assessments/jds-with-assessments` — every JD row holding a non-archived
   * assessment, so a Draft counts exactly as a Published one does).
   *
   * This is what makes each job version's Create Assessment / View Assessment
   * action survive a refresh: the answer is a server fact keyed on the
   * version's own JD id, not a flag this component sets when the recruiter
   * happens to create something. Fetched once per mount and refreshed
   * alongside the lineages whenever an assessment is added.
   *
   * The SAME index the Create Assessment picker gates its per-version "+" on
   * (`jdsWithAssessments` in AssessmentCreation), so the two entry points
   * cannot disagree about whether a version is spoken for.
   */
  const [jdsWithAssessments, setJdsWithAssessments] = useState<Set<string>>(new Set());

  const loadJdsWithAssessments = async () => {
    try {
      const ids = await assessmentService.getJDsWithAssessments();
      setJdsWithAssessments(new Set(ids));
    } catch (error) {
      /* Left as it was rather than emptied: an empty set reads as "no version
         has an assessment", which would offer Create on versions that are
         already taken. The lineage rows still answer on their own. */
      console.log('[TalentFlow] Failed to load JDs with assessments:', error);
    }
  };

  /* Once per mount. Re-entering the Assessment Module remounts and refetches,
     which is what makes each version's action right on the way back in. */
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadJdsWithAssessments(); }, []);

  /**
   * Every assessment authored against ANY version of this job.
   *
   * ONE REQUEST PER JOB VERSION, merged and deduped by assessment id — not
   * one request for the card's own `jd_id`.
   *
   * That single request was the bug behind a Draft going missing. The card is
   * whichever version the list collapsed the lineage down to, so the fetch
   * asked `list({ jd_id: <that version's JD row> })` and the panel rendered
   * the reply as if it were the whole job's assessments. It is only the whole
   * job's assessments if the endpoint widens a `jd_id` filter to the JD's
   * lineage. Where it matches the id exactly instead — one JD row, one
   * answer — every assessment authored against a DIFFERENT version of the
   * same job is simply absent from the reply. A Draft created against V1
   * while the card sits on V2 then vanishes from the table, V1 goes on
   * offering Create Assessment because nothing was returned for it, and the
   * Job List's own count still includes it because that count is summed from
   * the page's full assessment fetch and never went through here. Count says
   * two, table shows one.
   *
   * Asking per version removes the assumption rather than betting on it. The
   * JD lineage names every version of the job — each its own JD row with its
   * own id — and each is asked about itself, so the reply cannot be narrower
   * than the question. If the endpoint does widen a `jd_id` filter to the
   * lineage the extra copies arrive as duplicates, which the dedupe drops; if
   * it does not, this is the only way the siblings are ever seen. Either way
   * the panel gets the same complete list.
   *
   * Deduped by ASSESSMENT id, the record's own unique key — never by job,
   * version number or title. Two assessments against one job version are two
   * records and both survive the merge, which is what lets a Draft and a
   * Published assessment coexist on the same version.
   *
   * `force` re-reads a lineage the cache already holds. Anything that adds an
   * assessment needs it: the record exists on the server the moment the call
   * returns, but this cache is what the Assessment Versions table renders, so
   * a cache hit would show the versions from before the click until the page
   * was reloaded. Nothing else forces — the cache is still what makes
   * reopening a panel, or opening a sibling row of the same JD, free.
   */
  const loadAssessmentLineage = async (jdId: string, force = false) => {
    /* Already fetched, or in flight — the cache is the guard. A failed fetch
       leaves no entry, so reopening retries rather than caching the failure
       as "this assessment has no other versions". */
    if (loadingLineages[jdId]) return assessmentLineages[jdId];
    if (assessmentLineages[jdId] && !force) return assessmentLineages[jdId];
    setLoadingLineages(prev => ({ ...prev, [jdId]: true }));
    try {
      /* The job's versions, from the endpoint that is authoritative about
         them. A lineage that fails to load falls back to the card's own JD
         row, which is exactly the single-request behaviour this replaces —
         degraded, but never worse than it was. */
      let versionIds: string[] = [jdId];
      try {
        const lineage = await jdService.getLineageVersions(jdId);
        const ids = lineage.map(v => v.id).filter(Boolean);
        if (ids.length) versionIds = [...new Set([jdId, ...ids])];
      } catch (error) {
        console.log('[TalentFlow] Failed to load JD lineage for assessment versions:', error);
      }

      const responses = await Promise.all(
        versionIds.map(versionId =>
          assessmentService
            .list({ jd_id: versionId, page_size: 50 })
            /* One version failing must not blank the others — it contributes
               nothing and the rest of the merge stands. */
            .catch(() => ({ items: [] as unknown[] })),
        ),
      );

      const byAssessmentId = new Map<string, AssessmentVersionRow>();
      for (const response of responses) {
        for (const row of ((response.items || []) as AssessmentVersionRow[])) {
          if (row?.id) byAssessmentId.set(row.id, row);
        }
      }
      const rows = [...byAssessmentId.values()];
      setAssessmentLineages(prev => ({ ...prev, [jdId]: rows }));
      /* Returned as well as cached. `setAssessmentLineages` is not visible to
         the caller until the next render, and the duplicate flow has to read
         the count it just fetched inside the same click handler. */
      return rows;
    } catch (error) {
      console.log('[TalentFlow] Failed to load assessment versions:', error);
      return undefined;
    } finally {
      setLoadingLineages(prev => ({ ...prev, [jdId]: false }));
    }
  };

  /**
   * Re-read everything that answers "does this job version have an
   * assessment": every lineage this page has cached, plus one more by id, plus
   * the backend's own index.
   *
   * Called after anything that ADDS an assessment — creating one for a job
   * version, duplicating one into a new version. A stale answer here is not a
   * cosmetic lag: a job version whose new assessment is missing goes on
   * offering Create Assessment for an assessment that already exists.
   *
   * Every cached key, not just the new assessment's own `jd_id`, because the
   * two are not the same thing. The cache is keyed by the JD row a fetch was
   * made under, one entry covers that JD's WHOLE lineage, and a new assessment
   * is authored against whichever job version the recruiter picked — so
   * refreshing only its `jd_id` can mint a second entry for the same lineage
   * and leave the one an open panel is reading untouched.
   *
   * Refreshed rather than dropped: clearing the entries would leave an open
   * panel with nothing to render and no fetch to bring it back, since the
   * fetch is triggered by opening the panel.
   */
  const refreshAssessmentExistence = async (alsoLoad?: string) => {
    const keys = new Set(Object.keys(assessmentLineages));
    if (alsoLoad) keys.add(alsoLoad);
    await Promise.all([
      loadJdsWithAssessments(),
      ...[...keys].map(key => loadAssessmentLineage(key, true)),
    ]);
  };

  /**
   * How many versions this assessment's lineage already holds — the number
   * the duplicate cap is read against.
   *
   * Two sources, in order of authority:
   *
   *   1. The fetched lineage (`assessmentLineages[jd_id]`). Unfiltered, and
   *      it is the very list the Assessment Versions table renders, so the
   *      cap and the table can never disagree about how many versions exist.
   *   2. The loaded list, as a fallback before any panel has been opened.
   *      This one is tab-filtered — the Active tab never loaded the drafts —
   *      so it can only undercount, never over-, which is why it is second.
   *
   * Archived versions are excluded from both: archiving is what the cap
   * message tells a recruiter to do to make room, so counting archived rows
   * would make that advice do nothing.
   */
  const countAssessmentVersions = (
    assessment: { jd_id?: string },
    lineage?: AssessmentVersionRow[],
  ) => {
    if (!assessment.jd_id) return 0;
    const fetched = lineage ?? assessmentLineages[assessment.jd_id];
    if (fetched?.length) {
      return fetched.filter(v => String(v.status || '').toLowerCase() !== 'archived').length;
    }
    return apiAssessments.filter(
      (x: any) => x.jd_id === assessment.jd_id && x.status !== 'Archived',
    ).length;
  };

  /** At the cap — Duplicate must not mint another version. */
  const isVersionCapReached = (
    assessment: { jd_id?: string },
    lineage?: AssessmentVersionRow[],
  ) => countAssessmentVersions(assessment, lineage) >= MAX_ASSESSMENT_VERSIONS;

  /**
   * A lineage may only hold one unpublished version at a time — creating a
   * second draft while one is already sitting unfinished just buries the
   * first. Finds that sibling draft (if any) so Duplicate can point the
   * recruiter at it instead of minting another one. Excludes `assessment`
   * itself so duplicating a row that IS the draft isn't mistaken for a
   * conflicting sibling (that case is already blocked separately, since the
   * Duplicate button is disabled on a draft row).
   */
  const findPendingDraftVersion = (
    assessment: { id?: string; jd_id?: string },
    lineage?: AssessmentVersionRow[],
  ): AssessmentVersionRow | undefined => {
    if (!assessment.jd_id) return undefined;
    const fetched = lineage ?? assessmentLineages[assessment.jd_id];
    const rows: AssessmentVersionRow[] = fetched?.length
      ? fetched
      : (apiAssessments.filter((x: any) => x.jd_id === assessment.jd_id) as AssessmentVersionRow[]);
    return rows.find(
      v => String(v.status || '').toLowerCase() === 'draft' && v.id !== assessment.id,
    );
  };

  /**
   * Create an assessment for ONE job version, from the Job Version History.
   *
   * The same navigation Job Details uses (`AssessmentsForJD.handleCreateAssessment`
   * and the Job Details Quick Action both push
   * `/recruitment/assessments/create?jd_id=<id>`), so the creation flow, its
   * validations, its plan gate and its API calls are the ones already in
   * service — nothing about creating an assessment is reimplemented here.
   *
   * The id passed is the JOB VERSION's own JD row id, not the card's, which is
   * what associates the new assessment with the version the recruiter clicked.
   * `returnUrl` brings them back to this list afterwards, where the row will
   * have refetched and now shows the assessment.
   */
  const handleCreateAssessmentForJobVersion = (jobVersionId: string) => {
    if (!canCreateAssessment) {
      toast.error('You do not have permission to create assessments');
      return;
    }
    /* `step=configure` lands the recruiter on the Configure form with THIS job
       version already chosen, rather than on the JD picker.

       That is not a shortcut, it is the correctness of the version. The picker
       collapses a lineage to one row - its latest Published or Republished
       version (`buildAssessmentJobList`) - so a V2 whose lineage has a V3 is
       not a row there at all. Landing on the picker after clicking V2's own
       Create therefore offered the job's latest version instead, which is the
       wrong assessment to author. With `step=configure` the step is settled
       from the first render: the flow holds a loader while it resolves the id,
       and `AssessmentCreation` keeps the step the URL asked for rather than
       rewriting the route a moment later.

       `jd_id` is the JOB VERSION's own JD row id, passed from the clicked row
       (`group.jobVersionId` on the version panel) - never the card's, and
       never a version number. The create flow resolves that id directly,
       fetching the record by id when the list did not include it, so V1, V2
       and V3 each open on themselves. */
    router.push(
      '/recruitment/assessments/create?step=configure'
      + `&jd_id=${encodeURIComponent(jobVersionId)}`
      + `&returnUrl=${encodeURIComponent('/recruitment/assessments')}`
    );
  };

  /* mapAssessmentFromApi (below) turns the backend's raw status into a
     display word for the rest of the page. AssessmentVersionRow.status is
     documented as "straight off assessmentService.list" — i.e. the RAW word —
     so reusing apiAssessments for the optimistic paint below has to translate
     back, or `assessmentStatusLabel` (which expects 'published'/'draft'/...)
     would read "Active" as an unrecognised status and render it as Draft. */
  const DISPLAY_TO_RAW_ASSESSMENT_STATUS: Record<string, string> = {
    Active: 'published', Completed: 'closed', Archived: 'archived', Draft: 'draft',
  };

  /**
   * Best-effort assessment rows for the version panel's FIRST paint, read
   * from the full assessment list (`apiAssessments`) this page already has in
   * memory — filtered to this job's known version ids, straight off
   * `jdLineage.lineages` if that lineage happens to already be cached (e.g.
   * from the "LATEST badge" prefetch), else just this row's own JD id.
   *
   * Complete and correct whenever the page has no status/search filter active
   * (the default "Total Jobs" view — see `getAssessmentStatusFilter`), and
   * merely a head start otherwise: `loadAssessmentLineage`'s own per-version
   * fetch still runs regardless and overwrites `assessmentLineages[jdId]` the
   * moment it resolves, so a filtered tab or an unknown lineage self-corrects
   * rather than getting stuck on a guess.
   */
  const getOptimisticAssessmentRows = (jdId: string): AssessmentVersionRow[] => {
    const knownVersionIds = new Set<string>([jdId, ...(jdLineage.lineages[jdId] || []).map(v => v.id)]);
    return apiAssessments
      .filter(a => a.jd_id && knownVersionIds.has(a.jd_id))
      .map(a => ({ ...a, status: DISPLAY_TO_RAW_ASSESSMENT_STATUS[a.status] || a.status })) as AssessmentVersionRow[];
  };

  const toggleAssessmentVersions = (assessment: AssessmentLineageRef) => {
    const opening = openVersionsFor !== assessment.id;
    setOpenVersionsFor(opening ? assessment.id : null);
    if (opening && assessment.jd_id) {
      /* First open of this job seeds the pick with the row's own assessment -
         the one the panel highlights as current. Reopening leaves an existing
         pick alone, which is what makes the choice survive a close. */
      const jdId = assessment.jd_id;
      setSelectedAssessmentVersionByJob((current) =>
        current[jdId] ? current : { ...current, [jdId]: assessment.id },
      );
      /* Both halves of the history: the JD's job versions, and the assessments
         authored against them. Each caches independently, so reopening - or
         opening a sibling row of the same JD - costs no second request. */
      void loadAssessmentLineage(assessment.jd_id);
      jdLineage.ensureLoaded(assessment.jd_id, assessment.jd_id);
    }
  };

  /**
   * This row's JOB version history — the rows the LATEST badge is decided
   * from. The panel's own fetch wins where it exists (card and open table then
   * read one identical list); the badge prefetch below covers every other row.
   * An empty cache entry is a failed fetch, not a one-version job, so it falls
   * through rather than being read as the history.
   */
  const getJobLineageRows = (assessment: { jd_id?: string; jd_short_id?: string }) => {
    const opened = assessment.jd_id ? jdLineage.lineages[assessment.jd_id] : undefined;
    if (opened?.length) return opened;
    const prefetched = jdLineage.filterLineages[assessment.jd_short_id || assessment.jd_id || ''];
    return prefetched?.length ? prefetched : undefined;
  };

  /**
   * The live job version of this row's lineage — the ONE number every "latest"
   * question on this page is answered from: the LATEST badge, which version of
   * a lineage the list collapses down to, and the row the Job Version History
   * table beneath it badges LATEST (it is handed this number, see
   * `latestJobVersion` on `AssessmentVersionHistoryPanel`). Card and table
   * naming different versions is only possible if they resolve it separately,
   * so they don't.
   *
   * SEQUENCE decides it, exactly as on the Job Openings page (`byLatestVersion`
   * / `latestVersionNumber`): the highest version number in the lineage is the
   * latest one. Not its status — a Draft v2 over a Published v1 is the latest
   * version, and the page reads that lineage as being re-drafted rather than
   * falling back to the published v1. Not `is_latest_version` either: that flag
   * names a row already counted below, so consulting it separately could only
   * ever LOWER the answer onto a superseded version.
   *
   * Every source of version numbers the page holds is reduced to their maximum,
   * so the badge tracks the data instead of one lookup that can miss:
   *
   *   1. the JD's own lineage — the authority, and the same rows the
   *      version-history table marks up, so card and table cannot disagree;
   *   2. the published JDs this page already loaded, matched by the lineage's
   *      human-readable Job ID (`job_id` / `jd_short_id`) rather than by row
   *      id — a republish mints a NEW JD row, so matching on `jd_id` finds
   *      nothing for exactly the older versions the badge has to rule out;
   *   3. the other assessments loaded from the same lineage, which name the
   *      job versions they were authored against;
   *   4. the lineage fetch behind an open version panel, which is that panel's
   *      other source of job versions — counting it here is what stops the
   *      panel from ever knowing a version this number does not.
   *
   * The row's own version is the floor, so a lineage nothing else knows about
   * still reads as the newest version known here rather than dropping to 1.
   *
   * This replaces a comparison against `currentVersion`, which is the JD's
   * REPUBLISH COUNTER and not its lineage version at all — two different
   * numberings — and the lookup that fed it (`jobs.find(j => j.id === jd_id)`)
   * missed on every non-current version, so the guard fell through to
   * `return true` and the card claimed LATEST whatever version it was on.
   */
  const getLatestJobVersion = (assessment: { jd_id?: string; jd_short_id?: string; jd_version?: number }) => {
    const own = assessment.jd_version ?? 1;

    let latest = latestVersionNumber(getJobLineageRows(assessment), own);

    for (const job of jobs) {
      const sameLineage = assessment.jd_short_id
        ? job.job_id === assessment.jd_short_id
        : job.id === assessment.jd_id;
      if (sameLineage) latest = Math.max(latest, job.versionNumber ?? 1);
    }

    for (const row of apiAssessments) {
      const sameLineage = assessment.jd_short_id
        ? row.jd_short_id === assessment.jd_short_id
        : row.jd_id === assessment.jd_id;
      if (sameLineage) latest = Math.max(latest, row.jd_version ?? 1);
    }

    for (const row of assessmentLineages[assessment.jd_id ?? ''] ?? []) {
      latest = Math.max(latest, row.jd_version ?? 1);
    }

    return latest;
  };

  /**
   * Fetch every listed job's lineage, so the LATEST badge is answered from the
   * JD itself rather than from what the assessments happen to reveal.
   *
   * The rows only name the job version they were authored against: a JD
   * republished to v3 whose newest assessment is still on v1 looks, from the
   * list alone, exactly like a JD that only ever had a v1. Nothing on the row
   * can tell those apart, so the badge is fetched rather than inferred.
   *
   * This is `ensureFilterLineages` — the same batch path the Job Openings list
   * uses to resolve its status pills. One lineage request per JOB (not per
   * assessment), cached in the hook, never refetched, and every write lands in
   * a promise callback, so a landing lineage re-renders the badge and nothing
   * else.
   */
  const { ensureFilterLineages: ensureJobLineages } = jdLineage;
  useEffect(() => {
    /* Keyed by the lineage, not the row: every version of a job resolves to
       the same history, so JD-080 is fetched once however many of its
       assessments are loaded. */
    const targets = new Map<string, string>();
    for (const row of apiAssessments) {
      if (!row?.jd_id) continue;
      const key = row.jd_short_id || row.jd_id;
      if (!targets.has(key)) targets.set(key, row.jd_id);
    }
    if (targets.size === 0) return;
    ensureJobLineages([...targets].map(([key, jobId]) => ({ key, jobId })));
  }, [apiAssessments, ensureJobLineages]);

  /**
   * Whether this row can open a version history — every job entry can.
   *
   * The control used to appear only where the row itself already proved a
   * second version existed (job v2+, or a second assessment on the same JD).
   * With one row per Job ID the row no longer carries that proof: the other
   * versions are exactly what has been collapsed out of the list, so hiding
   * the button on a row showing "Job v1" would hide the only way to reach
   * them. Every job now gets it, in both views; a job that genuinely has one
   * version opens onto that one version, which is an answer rather than a
   * dead end.
   *
   * A row with no JD has no job history to open, and gets no button — it is
   * not a job entry.
   */
  const hasVersionHistory = (assessment: AssessmentLineageRef) => !!assessment.jd_id;
  // Assessment list search + filters. `assessmentSearch` is what the user types;
  // `assessmentSearchQuery` is the debounced value sent to the API, so the search
  // spans every page rather than only the one on screen. The rest narrow the
  // loaded page client-side — the list endpoint takes no filters beyond search.

  const [showAssessmentFilters, setShowAssessmentFilters] = useState(false);
  // True once the user confirms the More Filters panel with "Done" — mirrors
  // job-openings, so Clear appears only after filters are applied.
  // Search + filters in the shared hook. Search is SERVER-side here, so
  // `appliedQuery` is what the request is built from; the four filters are
  // applied in the browser (see the full-set fetch in loadAssessmentsPage).
  const assessmentListSearch = useListSearch({
    initialFilters: {
      /* Position — WHICH JOB, keyed on the job's human id (JD-014) so it
         selects the whole job rather than one version of it; every republish
         mints a new jd_id under the same JD number, and a recruiter picking
         "Senior Java Developer" means all of it.

         Unset is '' rather than the 'all' the two selects below use, because
         that is SearchableSelect's contract for "nothing picked" — one
         representation of the empty state instead of a translation layer at
         the control. `useListSearch` counts a filter as active by comparing to
         the initial value, so the badge count is right either way. */
      position: '',
      type: 'all' as 'all' | 'Technical' | 'Behavioral' | 'Aptitude',
      createdBy: 'all',
      createdFrom: '',
      createdTo: '',
    },
    debounceMs: 350,
    onChange: () => setAssessmentCurrentPage(1),
  });
  const assessmentSearch = assessmentListSearch.query;
  const assessmentSearchQuery = assessmentListSearch.appliedQuery;
  const {
    position: filterPosition,
    type: filterType,
    createdBy: filterCreatedBy,
    createdFrom: filterCreatedFrom,
    createdTo: filterCreatedTo,
  } = assessmentListSearch.filters;
  const [availableUnits, setAvailableUnits] = useState<number | null>(null);
  const [totalUnits, setTotalUnits] = useState<number>(10); // Total subscription limit
  const [isUnlimited, setIsUnlimited] = useState<boolean>(false); // Track if quota is unlimited
  const [quotaPercentage, setQuotaPercentage] = useState<number>(0); // Percentage of quota used
  const [trackingCurrentPage, setTrackingCurrentPage] = useState(1);
  const [trackingTotalItems, setTrackingTotalItems] = useState(0);
  const [trackingTotalPages, setTrackingTotalPages] = useState(1);
  const [trackingFilters, setTrackingFilters] = useState<InviteFilterState>(EMPTY_INVITE_FILTERS);

  // Cross-assessment "Candidate Results" tab — aggregates every completed
  // attempt across all assessments by fanning out listResults() calls (no
  // global endpoint exists yet). Client-side paginated.
  const [completedCandidates, setCompletedCandidates] = useState<CandidateResultRow[]>([]);
  const [isLoadingCompletedCandidates, setIsLoadingCompletedCandidates] = useState(false);
  const [completedCandidatesError, setCompletedCandidatesError] = useState<string | null>(null);
  const [completedCandidatesPage, setCompletedCandidatesPage] = useState(1);

  const COMPLETED_PAGE_SIZE = 20;

  /* Cross-assessment "Invitation Status" tab — the Track Invites popup's view
     widened to the whole page: every invitation of every assessment, not one
     assessment at a time. Same fan-out shape as Candidate Results above (no
     global invitations endpoint exists either), and the same stat row, filter
     bar and status badges the popup uses, so the two cannot read differently.
     Filtering and paging are client-side because the rows are already merged
     here — a per-request filter would have to be re-fanned out to be correct. */
  const [inviteStatusRows, setInviteStatusRows] = useState<any[]>([]);
  const [isLoadingInviteStatus, setIsLoadingInviteStatus] = useState(false);
  const [inviteStatusError, setInviteStatusError] = useState<string | null>(null);
  const [inviteStatusPage, setInviteStatusPage] = useState(1);
  const [inviteStatusFilters, setInviteStatusFilters] = useState<InviteFilterState>(EMPTY_INVITE_FILTERS);

  const INVITE_STATUS_PAGE_SIZE = 20;

  /* Row selection on the Invitation Status tab, and the export it feeds.
     Selection is by invitation id and survives paging, because the export acts
     on the whole selection rather than the page in front of you. It is dropped
     on a reload, where those ids may no longer exist. */
  const [selectedInviteIds, setSelectedInviteIds] = useState<Set<string>>(new Set());
  const [showInviteExportModal, setShowInviteExportModal] = useState(false);
  const [inviteExportFormat, setInviteExportFormat] = useState<'csv' | 'xls'>('csv');

  /* Same permission the Resume Scoring page's export is behind — one export
     right across the app, not a per-page one. */
  const canExportInvites = isTenantAdmin || (user?.permissions?.canExport ?? false);

  /* Which summary card reads as the active one: the one whose tab and in-page
     list are currently showing. */
  const isOverviewCardActive = (tab: typeof activeTab) => pageView === 'list' && activeTab === tab;

  const openAssessmentsList = (tab: AssessmentPageTab = 'all') => {
    try {
      window.sessionStorage.removeItem('listScroll:assessments');
    } catch {
      /* Ignore unavailable sessionStorage. */
    }
    setActiveTab(tab);
    setAssessmentCurrentPage(1);
    setCompletedCandidatesPage(1);
    setPageView('list');
    setListScrollRequest((request) => request + 1);
  };


  // Proctoring settings from API
  const [proctoringSettings, setProctoringSettings] = useState<ProctoringSettings | null>(null);
  const [isLoadingProctoring, setIsLoadingProctoring] = useState(false);
  const [isSavingProctoring, setIsSavingProctoring] = useState(false);
  const [proctoringError, setProctoringError] = useState<string | null>(null);
  const [proctoringEvents, setProctoringEvents] = useState<ProctoringEvent[]>([]);
  const [proctoringEventsTotal, setProctoringEventsTotal] = useState(0);
  const [isLoadingProctoringEvents, setIsLoadingProctoringEvents] = useState(false);
  const [flaggedCount, setFlaggedCount] = useState(0);

  // Topic settings state
  interface TopicSettings {
    hr_enabled: boolean;
    hr_scoring_type: 'informational' | 'scored';
    technical_enabled: boolean;
    technical_scoring_type: 'informational' | 'scored';
    coding_enabled: boolean;
    coding_scoring_type: 'informational' | 'scored';
  }
  const [topicSettings, setTopicSettings] = useState<TopicSettings>({
    hr_enabled: true,
    hr_scoring_type: 'informational',
    technical_enabled: true,
    technical_scoring_type: 'scored',
    coding_enabled: true,
    coding_scoring_type: 'scored',
  });
  const [isLoadingTopics, setIsLoadingTopics] = useState(false);
  const [isSavingTopics, setIsSavingTopics] = useState(false);
  const [topicsError, setTopicsError] = useState<string | null>(null);

  // Stats from API
  const [stats, setStats] = useState({
    total_assessments: 0,
    total_ever_created: 0,
    total_deleted: 0,
    active_assessments: 0,
    draft_assessments: 0,
    archived_assessments: 0,
    /* The two shapes of "how many candidates have been assessed" the stats
       endpoint can answer with. `total_candidates_tested` is declared required
       on AssessmentStatsResponse and is what /assessments/stats actually
       sends; `total_candidates_completed` is the dashboard view's
       completion-only breakdown and is optional, so it arrives as undefined
       here. Both are kept and read in that order of preference below
       (`candidatesAssessed`), which is why the Candidates Assessed card is not
       stuck on 0 the way reading the optional field alone left it. */
    total_candidates_tested: 0,
    total_candidates_completed: 0,
    average_pass_rate: null as number | null,
    average_score: null as number | null,
    units_consumed: 0,
  });
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  // Persist scroll position + view state so returning from a detail/results
  // page lands the user exactly where they left off. Re-detect the scroll
  // container when the two-step view flips (cards overview vs. full list —
  // its height changes drastically).
  const rootRef = useScrollRestoration('assessments', !isLoading, [pageView]);
  useListStatePersistence(
    'assessments',
    {
      activeTab,
      settingsSubTab,
      assessmentCurrentPage,
      assessmentItemsPerPage,
      assessmentSearch,
      filterPosition,
      filterType,
      filterCreatedBy,
      filterCreatedFrom,
      filterCreatedTo,
      // The cards<->list drill-in. Everything else here was already restored,
      // but pageView reset to 'cards' on every remount, so returning from a
      // detail/results page hid the whole list behind the stat tiles.
      pageView,
      /* Which row has its Job Version History open. Restored for the same
         reason as pageView: creating an assessment from a job-version row
         leaves the page and comes back, and the point of returning is to see
         that row now carrying the assessment - which a collapsed panel hides. */
      openVersionsFor,
    },
    (s) => {
      /* An arrival that NAMED its tab (`initialListTab`, from `?tab=`) beats
         the snapshot for everything that decides which rows are on screen.
         The snapshot is meant for "I went to a detail page and came back";
         here the recruiter has just been sent somewhere specific, and
         restoring the last visit's cards view, Draft tab, page 3 or leftover
         search would land them anywhere but there — intermittently, depending
         on what they happened to be doing last. What still restores is display
         preference: rows per page, the settings sub-tab. */
      if (!initialListTab) {
        if (s.pageView === 'cards' || s.pageView === 'list') setPageView(s.pageView);
        if (typeof s.activeTab === 'string') setActiveTab(s.activeTab as typeof activeTab);
        if (typeof s.openVersionsFor === 'string') setOpenVersionsFor(s.openVersionsFor);
        if (typeof s.assessmentCurrentPage === 'number') setAssessmentCurrentPage(s.assessmentCurrentPage);
        if (typeof s.assessmentSearch === 'string') assessmentListSearch.setQuery(s.assessmentSearch);
        assessmentListSearch.setFilters({
          position: typeof s.filterPosition === 'string' ? s.filterPosition : '',
          type:
            s.filterType === 'Technical' || s.filterType === 'Behavioral' || s.filterType === 'Aptitude'
              ? s.filterType
              : 'all',
          createdBy: typeof s.filterCreatedBy === 'string' ? s.filterCreatedBy : 'all',
          createdFrom: typeof s.filterCreatedFrom === 'string' ? s.filterCreatedFrom : '',
          createdTo: typeof s.filterCreatedTo === 'string' ? s.filterCreatedTo : '',
        });
      }
      if (s.settingsSubTab === 'proctoring' || s.settingsSubTab === 'topics') setSettingsSubTab(s.settingsSubTab);
      if (typeof s.assessmentItemsPerPage === 'number') setAssessmentItemsPerPage(s.assessmentItemsPerPage);
    },
  );

  /* The other half of that override: the saved SCROLL offset, which
     `useScrollRestoration` above would otherwise apply and drop the recruiter
     into the middle of the list they were just sent to the top of. Cleared on
     mount, before that hook's restore effect can run (it waits on `!isLoading`
     — this does not), and only for a tab-named arrival, so returning from a
     detail page still lands where it left off. Same key, same reason, as
     `openAssessmentsList`. */
  useEffect(() => {
    if (!initialListTab) return;
    try {
      window.sessionStorage.removeItem('listScroll:assessments');
    } catch {
      /* Ignore unavailable sessionStorage. */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* A version history that is open because it was RESTORED (the recruiter left
     to create an assessment for one of its job versions and came back) has no
     click behind it to have loaded its lineage, and the caches are per-mount.
     This fills them once the assessments themselves have landed - which is also
     what makes an assessment created while away appear on the row. Both loaders
     no-op on a cache hit, so this is safe to re-run. */
  useEffect(() => {
    if (!openVersionsFor || apiAssessments.length === 0) return;
    const row = apiAssessments.find((a) => a.id === openVersionsFor);
    if (!row?.jd_id) return;
    /* Both loaders flip a loading flag before their first await, which is a
       setState during this effect - the thing the rule guards against. Here it
       is the point: this effect exists to kick off a fetch for a row that was
       restored rather than clicked, and the flag is what renders its spinner. */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAssessmentLineage(row.jd_id);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    jdLineage.ensureLoaded(row.jd_id, row.jd_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openVersionsFor, apiAssessments]);

  useEffect(() => {
    if (listScrollRequest === 0 || pageView !== 'list') return;

    let nestedFrame = 0;
    const frame = window.requestAnimationFrame(() => {
      nestedFrame = window.requestAnimationFrame(() => {
        listSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    return () => {
      window.cancelAnimationFrame(frame);
      if (nestedFrame) window.cancelAnimationFrame(nestedFrame);
    };
  }, [listScrollRequest, pageView, activeTab]);

  const getAssessmentStatusFilter = (tab: typeof activeTab) => {
    if (tab === 'active') return 'published';
    if (tab === 'draft') return 'draft';
    if (tab === 'completed') return 'closed';
    if (tab === 'archived') return 'archived';
    return undefined;
  };

  const mapAssessmentFromApi = (a: any, index: number) => {
    const rawStatus = (a.status || 'draft').toLowerCase();
    const shortId = a.short_id || `AS-${String(a.sequence_number || index + 1).padStart(3, '0')}`;
    return {
      id: a.id,
      short_id: shortId,
      sequence_number: a.sequence_number,
      title: a.title,
      description: a.description,
      type: a.technical_enabled ? 'Technical' : a.hr_enabled ? 'Behavioral' : 'Aptitude',
      duration: `${a.duration_minutes} min`,
      duration_minutes: a.duration_minutes,
      questions: (a.hr_enabled ? 10 : 0) + (a.technical_enabled ? 10 : 0) + (a.coding_enabled ? 5 : 0),
      candidates: a.invitations_count || 0,
      invitations_count: a.invitations_count || 0,
      completed_count: a.completed_count || 0,
      passed_count: a.passed_count || 0,
      average_score: a.average_score,
      pass_rate: a.pass_rate,
      status: rawStatus === 'published' ? 'Active' : rawStatus === 'closed' ? 'Completed' : rawStatus === 'archived' ? 'Archived' : 'Draft',
      passRate: a.completed_count > 0 ? `${Math.round((a.passed_count / a.completed_count) * 100)}%` : 'N/A',
      created: a.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
      created_at: a.created_at,
      updated_at: a.updated_at,
      created_by_name: a.created_by_name || 'System',
      version: a.version || 1,
      // The backend's own clone verdicts, carried through unchanged.
      //
      // They no longer GATE the Duplicate action: each encodes a rule this
      // flow has replaced — `clone_button_disabled` folds in "only version 1
      // can be cloned", and `clone_cap_reached` counts to a cap of 3, where
      // MAX_ASSESSMENT_VERSIONS is 5. The gate is computed in the menu, from
      // the lineage this page has loaded (see `isVersionCapReached`). These
      // stay mapped so nothing else that reads them breaks, and so a backend
      // that later reports the new rules is one line from being trusted again.
      can_clone: a.can_clone !== undefined ? a.can_clone : true,
      clone_button_disabled: a.clone_button_disabled === true,
      clone_cap_reached: a.clone_cap_reached === true,
      jd_assessment_count: a.jd_assessment_count,
      // Once invites are revoked the assessment is sealed: Share + Revoke
      // both get disabled. The recruiter clones a new version if they
      // want to start a fresh invite round. We OR the backend flag with
      // the session-local ref so the seal sticks on backends that don't
      // yet return has_revoked_invites — and survives reloadAssessments
      // because the ref is mutated synchronously (state would be stale).
      has_revoked_invites: a.has_revoked_invites === true || locallyRevokedIdsRef.current.has(a.id),
      jd_id: a.jd_id,
      jd_short_id: a.jd_short_id,
      jd_version: a.jd_version,
      /* Carried flat as well as inside `job`. ShareAssessmentModal declares
         `jd_title` on its own prop type and prints it beside the JD id, but
         nothing ever set it - the mapper folded the title into `job.title`
         only - so that line has always rendered empty. */
      jd_title: a.jd_title,
      job: { title: a.jd_title || 'General Assessment', department: 'Engineering', version: a.jd_version },
      hr_enabled: a.hr_enabled,
      hr_percentage: a.hr_percentage,
      hr_topics: a.hr_topics,
      technical_enabled: a.technical_enabled,
      technical_percentage: a.technical_percentage,
      technical_topics: a.technical_topics,
      coding_enabled: a.coding_enabled,
      coding_percentage: a.coding_percentage,
      coding_topics: a.coding_topics,
      coding_languages: a.coding_languages,
      proctoring_enabled: a.proctoring_enabled,
      average_time_seconds: a.average_time_seconds,
      hr_score: a.hr_score,
      technical_score: a.technical_score,
      coding_score: a.coding_score,
    };
  };

  /* Only Completed and Auto Completed invites open the Result Details page.
     Auto Completed is a completed invite whose attempt was auto-submitted on
     session timeout (termination_code TENANT_SESSION_TIMEOUT), so the same
     completed_at/attempt_id check covers both. Every other status — In
     Progress, System Check, Expired, Invited, Terminated, ... — stays on the
     tracking popup: there is no result to show, so the row doesn't navigate. */
  const isTrackedInviteCompleted = (invitation: any): boolean =>
    (invitation.status === 'completed' || !!invitation.completed_at) && !!invitation.attempt_id;

  const opensTrackedDetails = (invitation: any): boolean =>
    isTrackedInviteCompleted(invitation);

  const openTrackedInviteResult = (invitation: any) => {
    if (!selectedAssessmentForTracking) return;
    if (!opensTrackedDetails(invitation)) return;
    /* The invite's OWN assessment where the row carries one - in job scope the
       table holds invites from several, and the representative's id would open
       the wrong assessment's result. */
    const resultAssessmentId = invitation._assessment_id || selectedAssessmentForTracking.id;
    const base = `/recruitment/assessments/${resultAssessmentId}/results/details`;
    const cid = invitation.candidate_display_id ? `&cid=${encodeURIComponent(invitation.candidate_display_id)}` : '';
    const name = invitation.candidate_name ? `&candidate_name=${encodeURIComponent(invitation.candidate_name)}` : '';
    router.push(`${base}?candidate_id=${invitation.attempt_id}${cid}${name}`);
  };

  /* Past its configured expiry with no terminal state and no unit consumed: the
     invite IS expired now, whatever the backend last wrote to `status`. Once a
     unit has been consumed the candidate actually started, so expiry no longer
     applies. */
  const isInviteExpired = (inv: any): boolean => {
    const s = inv.status;
    if (['completed', 'failed', 'bounced', 'abandoned', 'expired'].includes(s) || inv.completed_at || inv.bounced_at) return false;
    if (inv.unit_consumed) return false;
    return !!(inv.expires_at && new Date(inv.expires_at) < new Date());
  };

  /* The invite status badge, one copy for both readers of it — the Track
     Invites popup and the page-level Invitation Status tab. It used to be
     declared inside the popup's row map, which is exactly how the two would
     have drifted. Base comes from the AI Interviews tracker's
     AIInviteStatusBadge so all three trackers read the same.

     Colours for the four lifecycle statuses are the `--status-*` tokens in
     globals.css (see the block beside --score-*), not literal Tailwind
     palette classes: the Invitation Status tab's filter segments wear the same
     tokens, so a badge and the segment that filters to it cannot disagree, and
     each token's dark value lives with the token instead of in a `dark:`
     variant on every badge. In Progress and System Check share
     --status-progress because they always shared the same cyan.

     The terminal failure states (Invite Failed / Bounced / Terminated) and
     Pending keep their per-component red and slate — nothing else draws them
     yet, so there is nothing for them to stay in step with. */
  const renderInviteStatusBadge = (inv: any) => {
    const s = inv.status;
    const base = "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium whitespace-nowrap flex-shrink-0 ring-1";
    /* Resolved first so a lapsed invite shows only the Expired badge — never
       the stale pre-expiry status. */
    if (isInviteExpired(inv)) {
      return <span className={`${base} bg-status-expired/10 text-status-expired ring-status-expired/20`}><Clock className="w-3 h-3" /> Expired</span>;
    }
    if (s === 'completed' || inv.completed_at) {
      const autoCompleted = inv.termination_code === 'TENANT_SESSION_TIMEOUT';
      return (
        <span
          className={`${base} bg-status-completed/10 dark:bg-status-completed/15 text-status-completed ring-status-completed/20 dark:ring-status-completed/25`}
          title={autoCompleted ? 'Auto-submitted when the assessment duration elapsed' : undefined}
        >
          <CheckCircle className="w-3 h-3" />
          Completed
          {autoCompleted && <span className="text-status-completed/80">(Auto)</span>}
        </span>
      );
    }
    if (s === 'failed') {
      return <span className={`${base} bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300 ring-red-200 dark:ring-red-500/25`}><X className="w-3 h-3" /> Invite Failed</span>;
    }
    if (s === 'bounced' || inv.bounced_at) {
      return <span className={`${base} bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300 ring-red-200 dark:ring-red-500/25`}><RefreshCw className="w-3 h-3" /> Bounced</span>;
    }
    if (s === 'expired') {
      return <span className={`${base} bg-status-expired/10 text-status-expired ring-status-expired/20`}><Clock className="w-3 h-3" /> Expired</span>;
    }
    if (s === 'abandoned') {
      return <span className={`${base} bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300 ring-red-200 dark:ring-red-500/25`} title="Ended before completion — the candidate left the assessment"><Ban className="w-3 h-3" /> Terminated</span>;
    }
    if (s === 'started' || inv.started_at) {
      return <span className={`${base} bg-status-progress/10 text-status-progress ring-status-progress/20`}><Play className="w-3 h-3" /> In Progress</span>;
    }
    if (s === 'opened' || inv.opened_at) {
      return <span className={`${base} bg-status-progress/10 text-status-progress ring-status-progress/20`} title="Consent accepted — the candidate is on the system check step"><Monitor className="w-3 h-3" /> System Check</span>;
    }
    if (s === 'sent' || inv.sent_at) {
      return <span className={`${base} bg-status-invited/10 text-status-invited ring-status-invited/20`}><Mail className="w-3 h-3" /> Invited</span>;
    }
    return <span className={`${base} bg-slate-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 ring-gray-200 dark:ring-slate-700`}><Clock className="w-3 h-3" /> Pending</span>;
  };

  /* The mark a round is passed at. Shared by the Candidate Results table and
     the two score cells below — the popup spelled 70 into each of its own. */
  const RESULT_PASS_MARK = 70;

  /* One round's score for an invite row — the Tech Score and Coding Score
     cells of the Invitation Status tab, which are the same two cells the Track
     Invites popup draws from the same `listInvitations` records: percentage
     over a Pass/Fail chip, brand blue at or above the pass mark and red below.
     Written once for both rounds so they cannot drift apart.

     A score shows as soon as a numeric value is on the row. The scoring_status
     guard is the popup's: while the backend is still scoring ('pending' /
     'processing') the number on the record is not final, so the cell waits.

     A dash covers every reason there is no score — the round is not enabled on
     that assessment, the candidate has not sat it, or scoring has not finished
     — and `title` says which, because this table spans assessments with
     different rounds enabled and a blank cell would otherwise be a puzzle. */
  const renderInviteScoreCell = (inv: any, round: 'technical' | 'coding') => {
    const score = round === 'technical' ? inv.technical_score : inv.coding_score;
    const roundEnabled = round === 'technical'
      ? (inv._technical_enabled ?? true)
      : !!inv._coding_enabled;
    const scoring = inv.scoring_status === 'pending' || inv.scoring_status === 'processing';
    const ready = score != null && !scoring;

    if (!ready) {
      const why = !roundEnabled
        ? `This assessment has no ${round === 'technical' ? 'technical' : 'coding'} round`
        : scoring
          ? 'Scoring in progress'
          : 'Not scored yet';
      return (
        <td className="px-4 py-4 align-middle text-sm text-center">
          <span className="text-gray-400" title={why}>&mdash;</span>
        </td>
      );
    }

    const passed = score >= RESULT_PASS_MARK;
    return (
      <td className="px-4 py-4 align-middle text-sm text-center">
        <div className="flex flex-col items-center gap-0.5">
          <span className={`font-medium ${passed ? 'text-brand-blue' : 'text-red-600'}`}>
            {Math.round(score)}%
          </span>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ring-1 ${passed ? 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20' : 'bg-red-50 text-red-600 ring-red-200'}`}>
            {passed ? 'Pass' : 'Fail'}
          </span>
        </div>
      </td>
    );
  };

  /* The bucket a row counts in. The Invitation Status tab's stat cards, its
     status dropdown and its badges all read this one function, so a card's
     number always matches the rows selecting it produces — including for
     clock-expired invites, which `status` still calls 'sent'. */
  const inviteStatusBucket = (inv: any): string => {
    if (isInviteExpired(inv)) return 'expired';
    if (inv.status === 'completed' || inv.completed_at) return 'completed';
    if (inv.status === 'failed') return 'failed';
    if (inv.status === 'bounced' || inv.bounced_at) return 'bounced';
    if (inv.status === 'expired') return 'expired';
    if (inv.status === 'abandoned') return 'abandoned';
    if (inv.status === 'started' || inv.started_at) return 'started';
    if (inv.status === 'opened' || inv.opened_at) return 'opened';
    if (inv.status === 'sent' || inv.sent_at) return 'sent';
    return 'pending';
  };

  /* Bulk Resend on the Invitation Status tab — the popup's control, for the
     rows ticked there. Its own confirm state because the dialog names its own
     count; everything that does the work is shared. */
  const [showInviteBulkResendConfirm, setShowInviteBulkResendConfirm] = useState(false);

  /* Eligibility for a resend: Expired, and not already started or completed.
     Read off the bucket, so a link that lapsed on the clock counts — the same
     row the Status column shows as Expired, and the same test the per-row
     Resend item uses. */
  const isInviteResendable = (inv: any): boolean =>
    inviteStatusBucket(inv) === 'expired' && !inv.started_at && !inv.completed_at;

  /* The count the confirm dialog shows. Derived here rather than in the tab's
     render scope, because the dialog is a page-level sibling of it — same
     filter-and-tick rule the button applies. */
  const inviteBulkResendCount = inviteStatusRows.filter(
    (inv: any) => selectedInviteIds.has(inv.id) && isInviteResendable(inv)
  ).length;

  const handleInviteBulkResend = async () => {
    /* Re-derived at send time rather than trusting what was ticked — a status
       can have moved since, which is the popup's reasoning too. */
    const targets = inviteStatusRows.filter(
      (inv: any) => selectedInviteIds.has(inv.id) && isInviteResendable(inv)
    );
    if (targets.length === 0) {
      setShowInviteBulkResendConfirm(false);
      return;
    }
    setIsBulkResending(true);
    await resendInvitationsSequentially(targets);
    setSelectedInviteIds(new Set());
    setShowInviteBulkResendConfirm(false);
    setIsBulkResending(false);
    await loadAllInviteStatuses();
  };

  /* Which row's report is being fetched, so its menu item can show progress
     and a second click cannot start a second download. */
  const [downloadingInviteReportId, setDownloadingInviteReportId] = useState<string | null>(null);

  /* A completed invite with an attempt behind it is the only kind with a result
     to open, and the report is a rendering of that result, so both actions rest
     on this. Same test as isTrackedInviteCompleted, which the popup's row
     navigation uses — kept separate only because it reads a row's own
     assessment rather than the one assessment that popup is pinned to. */
  const inviteHasResult = (inv: any): boolean =>
    (inv.status === 'completed' || !!inv.completed_at) && !!inv.attempt_id && !!inv._assessment_id;

  /* View Result — the same Result Details route the popup and the Candidate
     Results tab open, addressed with the ROW's assessment: these rows span
     every assessment, so there is no single "current" one to fall back on. */
  const openInviteResult = (inv: any) => {
    if (!inviteHasResult(inv)) return;
    const cid = inv.candidate_display_id ? `&cid=${encodeURIComponent(inv.candidate_display_id)}` : '';
    const name = inv.candidate_name ? `&candidate_name=${encodeURIComponent(inv.candidate_name)}` : '';
    router.push(`/recruitment/assessments/${inv._assessment_id}/results/details?candidate_id=${inv.attempt_id}${cid}${name}`);
  };

  /* Download Report — assessmentService.exportPDF, the same call (and the same
     blob-to-<a download> handling and filename shape) the Assessment Results
     page's per-candidate PDF uses, so a report downloaded from here is the
     report downloaded from there. Scoring must have finished: the PDF renders
     scores, and a half-scored attempt would render an empty one. */
  const downloadInviteReport = async (inv: any) => {
    if (downloadingInviteReportId) return;
    if (!inviteHasResult(inv) || inv.scoring_status === 'pending' || inv.scoring_status === 'processing') {
      toast.error('The report is available once scoring is completed.');
      return;
    }
    setDownloadingInviteReportId(inv.id);
    try {
      const blob = await assessmentService.exportPDF(inv._assessment_id, inv.attempt_id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const safeId = inv.candidate_display_id?.replace(/[^a-zA-Z0-9]/g, '_')
        || `CID_${String(inv.attempt_id).replace(/[^a-zA-Z0-9]/g, '_')}`;
      const safeJob = inv._jd_title?.replace(/[^a-zA-Z0-9]/g, '_') || 'Assessment';
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      link.download = `${safeId}_${safeJob}_${stamp}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download invitation report:', error);
      toast.error('Failed to download the report. Please try again.');
    } finally {
      setDownloadingInviteReportId(null);
    }
  };

  /* The status a row reads as, in words — the same vocabulary the badge draws,
     for the file where a coloured chip cannot go. */
  const inviteStatusText = (inv: any): string => {
    const labels: Record<string, string> = {
      expired: 'Expired',
      completed: 'Completed',
      failed: 'Invite Failed',
      bounced: 'Bounced',
      abandoned: 'Terminated',
      started: 'In Progress',
      opened: 'System Check',
      sent: 'Invited',
      pending: 'Pending',
    };
    return labels[inviteStatusBucket(inv)] || 'Pending';
  };

  /* The exported sheet's columns, in table order: what is on screen, with the
     Candidate cell's two lines and the Timeline cell's stamps split into
     columns of their own — a spreadsheet has no room for a stacked cell, and a
     date is worth more in its own column anyway.

     One list feeding both formats, the way ScoredResumesTable's
     `enabledColumns` + `getCellValue` do, so CSV and Excel cannot disagree
     about either the columns or their order. */
  const INVITE_EXPORT_COLUMNS: { label: string; value: (inv: any) => string }[] = [
    { label: 'CID', value: (inv) => inv.candidate_display_id || '' },
    { label: 'Candidate', value: (inv) => inv.candidate_name || '' },
    { label: 'Email', value: (inv) => inv.candidate_email || '' },
    { label: 'Job ID', value: (inv) => inv._jd_short_id || '' },
    { label: 'Job Name', value: (inv) => inv._jd_title || '' },
    { label: 'Job Version', value: (inv) => (inv._jd_version ? `v${inv._jd_version}` : '') },
    { label: 'Assessment Version', value: (inv) => (inv._assessment_version ? `v${inv._assessment_version}` : '') },
    { label: 'Assessment', value: (inv) => inv._assessment_title || '' },
    { label: 'Status', value: (inv) => inviteStatusText(inv) },
    { label: 'Invited On', value: (inv) => (inv.sent_at || inv.created_at ? formatIST(inv.sent_at || inv.created_at) : '') },
    { label: 'Started At', value: (inv) => (inv.started_at ? formatIST(inv.started_at) : '') },
    { label: 'Completed At', value: (inv) => (inv.completed_at ? formatIST(inv.completed_at) : '') },
    /* Scores follow the table's own rule for showing one: a number that the
       backend has finished scoring. Anything else is blank rather than 0, which
       would read as a candidate who scored nothing. */
    {
      label: 'Tech Score',
      value: (inv) => (inv.technical_score != null && inv.scoring_status !== 'pending' && inv.scoring_status !== 'processing'
        ? `${Math.round(inv.technical_score)}%`
        : ''),
    },
    {
      label: 'Coding Score',
      value: (inv) => (inv.coding_score != null && inv.scoring_status !== 'pending' && inv.scoring_status !== 'processing'
        ? `${Math.round(inv.coding_score)}%`
        : ''),
    },
  ];

  /* DD-MM-YYYY for filenames — the same helper (and reason) as the Resume
     Scoring export: formatISTDate's "31 Aug 2026" carries spaces and no fixed
     width, so it does not belong in a filename. */
  const inviteExportFileDate = (date: Date): string => {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    return `${dd}-${mm}-${date.getFullYear()}`;
  };

  const inviteExportFileName = (ext: string) =>
    `Completed_Invitations_${inviteExportFileDate(new Date())}.${ext}`;

  /* Both writers are the Resume Scoring export's, unchanged in behaviour: a
     Blob, an <a download> clicked and revoked, then a toast naming the count.
     CSV leads with a BOM so Excel opens UTF-8 correctly, and XLS is the same
     HTML-table-Excel-reads trick rather than a real workbook. */
  const downloadInviteExport = (blob: Blob, filename: string, count: number, label: string) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    toast.success(`Exported ${count} record${count === 1 ? '' : 's'} to ${label}`);
    setShowInviteExportModal(false);
  };

  const exportInvitesToCSV = (rows: any[]) => {
    const headers = INVITE_EXPORT_COLUMNS.map((col) => `"${col.label}"`).join(',');
    const body = rows.map((inv) =>
      INVITE_EXPORT_COLUMNS.map((col) => `"${col.value(inv).replace(/"/g, '""')}"`).join(',')
    );
    const csv = [headers, ...body].join('\n');
    downloadInviteExport(
      new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }),
      inviteExportFileName('csv'),
      rows.length,
      'CSV',
    );
  };

  const exportInvitesToXLS = (rows: any[]) => {
    const escape = (value: string) =>
      value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
      <head><meta charset="UTF-8" /></head>
      <body>
        <h3>Completed Invitations</h3>
        <p>Exported: ${formatIST(new Date().toISOString())}</p>
        <p>Total Records: ${rows.length}</p>
        <table border="1">
          <thead>
            <tr>${INVITE_EXPORT_COLUMNS.map((col) => `<th>${escape(col.label)}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${rows.map((inv) => `<tr>${INVITE_EXPORT_COLUMNS.map((col) => `<td>${escape(col.value(inv))}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </body>
      </html>`;
    downloadInviteExport(
      new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' }),
      inviteExportFileName('xls'),
      rows.length,
      'Excel',
    );
  };

  /* Bulk selection for the tracking popup — same control and semantics as the
     AI Interviews tracker's Select All bar, targeting the rows on the CURRENT
     page. Only candidates a bulk Resend can act on are selectable: Invited
     ('sent') and Expired rows that haven't started or completed. In Progress
     ('started'), System Check ('opened'), Completed, failed and bounced rows
     get no checkbox — their per-row actions (or lack of one) already say what
     can be done with them. */
  const isBulkResendable = (inv: any): boolean =>
    ['sent', 'expired'].includes(inv.status)
    && !inv.started_at
    && !inv.completed_at;
  const [trackingSelectedIds, setTrackingSelectedIds] = useState<Set<string>>(new Set());
  const trackingSelectableIds = trackingInvitations.filter(isBulkResendable).map((inv: any) => inv.id);
  const allTrackingSelected =
    trackingSelectableIds.length > 0 && trackingSelectableIds.every((id: string) => trackingSelectedIds.has(id));
  const toggleTrackingSelectAll = () =>
    setTrackingSelectedIds(() => (allTrackingSelected ? new Set<string>() : new Set<string>(trackingSelectableIds)));
  const toggleTrackingSelectOne = (id: string) =>
    setTrackingSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  /* Reloads (paging, filtering, a resend flipping a status) can leave selected
     ids pointing at rows that are gone or no longer eligible — drop those so
     the bulk button's count always matches what a resend would actually do. */
  useEffect(() => {
    setTrackingSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const valid = new Set(trackingInvitations.filter(isBulkResendable).map((inv: any) => inv.id));
      const next = new Set([...prev].filter((id) => valid.has(id)));
      return next.size === prev.size ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackingInvitations]);

  /* Which score columns the tracking table carries.
     In job scope the answer is "any assessment of this job runs that round":
     dropping a column because the row's representative has no coding round
     would hide the coding scores of a sibling version that does. Reading one
     assessment, it is that assessment's own rule, unchanged. */
  const trackingTechEnabled = trackingJob
    ? trackingJob.assessments.some((scoped) => scoped.technical_enabled ?? true)
    : (selectedAssessmentForTracking?.technical_enabled ?? true);
  const trackingCodingEnabled = trackingJob
    ? trackingJob.assessments.some((scoped) => !!scoped.coding_enabled)
    : !!selectedAssessmentForTracking?.coding_enabled;

  const closeTrackInvitesModal = () => {
    setShowTrackInvitesModal(false);
    setSelectedAssessmentForTracking(null);
    setTrackingJob(null);
    setTrackingInvitations([]);
    setTrackingCurrentPage(1);
    setTrackingTotalItems(0);
    setTrackingTotalPages(1);
    setTrackingFilters(EMPTY_INVITE_FILTERS);
    setEditingEmailId(null);
    setNewEmailValue('');
    setTrackingSelectedIds(new Set());
  };

  const loadAssessmentsPage = async (page: number) => {
    setIsLoading(true);
    try {
      const filters: any = {};
      if (preSelectedJdId) {
        filters.jd_id = preSelectedJdId;
      }
      const status = getAssessmentStatusFilter(activeTab);
      if (status) {
        filters.status = status;
      }
      if (assessmentSearchQuery.trim()) {
        filters.search = assessmentSearchQuery.trim();
      }

      /* The whole result set, always — never one server page.

         Two reasons, and each one alone would be enough.

         Type / Created by / Created date are applied in the browser: the
         /assessments endpoint takes only jd_id, status, search and paging. Over
         a single server page that silently scoped them to the rows on screen —
         "Created by Priya" on page 1 of 5 never saw pages 2-5, and the match
         count was page-local too.

         And the list now collapses an assessment's versions into ONE row (see
         `collapsedAssessments`), which means it has to see every version to
         know which is the latest and how many there are. A lineage that
         straddled a page boundary would show up as two separate rows, and the
         footer would be counting versions where it claims to count
         assessments. */
      {
        const collected: any[] = [];
        let apiPage = 1;
        // Batched rather than one page_size=total request, matching how the AI
        // Interviews list pulls its full set.
        for (;;) {
          const batch = await assessmentService.list({
            ...filters,
            page: apiPage,
            page_size: FULL_SET_BATCH_SIZE,
          });
          const items = batch.items || [];
          collected.push(...items);
          const total = batch.total ?? collected.length;
          if (items.length < FULL_SET_BATCH_SIZE || collected.length >= total) break;
          apiPage++;
        }
        setApiAssessments(collected.map((a: any, index: number) => mapAssessmentFromApi(a, index)));
        /* The count of everything that matched, before the browser-side
           filters and the version collapse narrow it further. What the footer
           actually counts is `assessmentResultCount`, derived below from the
           collapsed list. */
        /* A page that no longer exists after a reload — everything on it
           deleted, or a filter narrowed the set — falls back to the first
           rather than rendering an empty list with a pager pointing at
           nothing. */
        if (page > 1 && collected.length === 0) {
          setAssessmentCurrentPage(1);
        }
      }
    } catch (error) {
      console.log('[TalentFlow] Failed to load assessments:', error);
      setApiAssessments([]);
    } finally {
      setIsLoading(false);
    }
  };

  /* Which assessment - and so which JOB VERSION - one invite belongs to.
     Stamped on the row because a job-scoped table holds invites from several
     assessments and the record itself does not say which. `_assessment_id` is
     the field the row actions already read (resend, revoke, edit email, open
     result), so stamping it is what makes them act on the invite's own
     assessment rather than on the row the popup was opened from. */
  const stampJobScopedInvite = (invitation: any, scoped: any) => ({
    ...invitation,
    _assessment_id: scoped.id,
    _assessment_short_id: scoped.short_id,
    _assessment_title: scoped.title,
    _assessment_version: scoped.version ?? 1,
    _jd_version: scoped.jd_version ?? 1,
  });

  /* Newest invite first, across assessments - the order the single-assessment
     endpoint returns, kept after the merge so a job-scoped page reads the same
     way round. */
  const inviteRecency = (invitation: any) =>
    new Date(invitation.sent_at || invitation.created_at || 0).getTime();

  /* One page per assessment is enough to merge from: a job's assessments are
     few (the create flow caps them at 3 per job version), and the merged list
     is then paged in the browser at the popup's own page size. */
  const JOB_TRACKING_FETCH_SIZE = 200;

  const loadTrackingInvitationSummary = async (assessment: any) => {
    try {
      if (trackingJob) {
        /* Job scope: the same summary call per assessment, added up. The
           endpoint has no job-wide mode, and the cards must describe every
           version the popup is showing. */
        const summaries = await Promise.all(
          trackingJob.assessments.map(async (scoped) => {
            try {
              return await assessmentService.listInvitations(scoped.id, { page: 1, page_size: 1 });
            } catch {
              return null;
            }
          }),
        );
        const sum = (read: (response: any) => number) =>
          summaries.reduce((total, response) => total + (response ? read(response) : 0), 0);
        setInvitationStats({
          total: sum((r) => r.total || 0),
          expired: sum((r) => r.expired || 0),
          started: sum((r) => r.started || 0),
          completed: sum((r) => r.completed || 0),
          failed: sum((r) => r.failed || 0),
          terminated: sum((r) => r.terminated || 0),
        });
        return;
      }
      const response = await assessmentService.listInvitations(assessment.id, {
        page: 1,
        page_size: 1,
      });
      setInvitationStats({
        total: response.total || 0,
        expired: response.expired || 0,
        started: response.started || 0,
        completed: response.completed || 0,
        failed: response.failed || 0,
        terminated: response.terminated || 0,
      });
    } catch (error) {
      console.error('Failed to load invitation summary:', error);
      setInvitationStats({
        total: 0,
        expired: 0,
        started: 0,
        completed: 0,
        failed: 0,
        terminated: 0,
      });
    }
  };

  const loadTrackingInvitations = async (assessment: any, page: number, filters: InviteFilterState) => {
    setIsLoadingInvitations(true);
    try {
      const query = {
        status: filters.status !== 'all' ? filters.status : undefined,
        search: filters.search.trim() || undefined,
        invite_date_from: filters.dateFrom || undefined,
        invite_date_to: filters.dateTo || undefined,
      };
      if (trackingJob) {
        /* Job scope: one request per assessment of the job, merged into one
           list. Every filter still goes to the server - the endpoint applies
           them per assessment exactly as it does for one - so only the paging
           happens here, over the merged result. A failed request for one
           assessment contributes nothing rather than emptying the table. */
        const perAssessment = await Promise.all(
          trackingJob.assessments.map(async (scoped) => {
            try {
              const scopedResponse = await assessmentService.listInvitations(scoped.id, {
                ...query,
                page: 1,
                page_size: JOB_TRACKING_FETCH_SIZE,
              });
              return (scopedResponse.items || []).map((invitation: any) =>
                stampJobScopedInvite(invitation, scoped),
              );
            } catch (error) {
              console.error('Failed to load invitations for assessment', scoped.id, error);
              return [];
            }
          }),
        );
        const merged = perAssessment.flat().sort((a, b) => inviteRecency(b) - inviteRecency(a));
        const totalPages = Math.max(1, Math.ceil(merged.length / INVITATIONS_PAGE_SIZE));
        const currentPage = Math.min(Math.max(1, page), totalPages);
        setTrackingInvitations(
          merged.slice((currentPage - 1) * INVITATIONS_PAGE_SIZE, currentPage * INVITATIONS_PAGE_SIZE),
        );
        setTrackingTotalItems(merged.length);
        setTrackingTotalPages(totalPages);
        /* A filter that empties the last page pulls the popup back onto a page
           that exists, as the single-assessment path does below. */
        if (currentPage !== page) setTrackingCurrentPage(currentPage);
        return;
      }
      const response = await assessmentService.listInvitations(assessment.id, {
        ...query,
        page,
        page_size: INVITATIONS_PAGE_SIZE,
      });
      const invitations = response.items || [];
      setTrackingInvitations(invitations);
      setTrackingTotalItems(response.total || 0);
      const totalPages = Math.max(1, response.total_pages || Math.ceil((response.total || 0) / INVITATIONS_PAGE_SIZE));
      setTrackingTotalPages(totalPages);

      if (invitations.length === 0 && (response.total || 0) > 0 && page > 1) {
        setTrackingCurrentPage(Math.min(page - 1, totalPages));
      }
    } catch (error) {
      console.error('Failed to load invitations:', error);
      setTrackingInvitations([]);
      setTrackingTotalItems(0);
      setTrackingTotalPages(1);
      setInvitationStats({
        total: 0,
        expired: 0,
        started: 0,
        completed: 0,
        failed: 0,
        terminated: 0,
      });
    } finally {
      setIsLoadingInvitations(false);
    }
  };

  /* Manual Refresh in the tracking popup — refetches the row list and the
     stat-card summary in place, no page reload. Guarded so rapid clicks (or a
     click while the popup's own load is still in flight) can't stack
     duplicate API calls. */
  const refreshTrackingInvitations = async () => {
    if (!selectedAssessmentForTracking || isRefreshingTracking || isLoadingInvitations) return;
    setIsRefreshingTracking(true);
    try {
      /* The dialog holds the height it had for the whole request - see
         `useDialogHeightLock`. The rows staying mounted underneath (the veil,
         below) is the other half of it; the pin alone would have nothing to
         hold up once released. */
      await trackingHeightLock.run(() => Promise.all([
        loadTrackingInvitations(selectedAssessmentForTracking, trackingCurrentPage, trackingFilters),
        loadTrackingInvitationSummary(selectedAssessmentForTracking),
      ]));
    } finally {
      setIsRefreshingTracking(false);
    }
  };

  // Aggregate all "Completed" invitations across every assessment.
  // No backend endpoint for this yet — we list assessments, then fan out a
  // listInvitations(id, {status:'completed'}) call per assessment in parallel
  // and merge. Stamps each invitation with its assessment title/id so the
  // table can show which assessment each completion belongs to.
  // Rounds are optional per assessment, so a missing score is "not run" rather
  // than zero. Pass/fail colouring follows the assessment pass mark.

  const formatTimeSpent = (seconds?: number) => {
    if (typeof seconds !== 'number' || seconds <= 0) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  // Same vocabulary as the per-assessment Candidate Results table.
  const inviteSourceMeta = (source?: string) => {
    const value = source || 'Manual';
    const styles: Record<string, string> = {
      'JD': 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20',
      'Assessment': 'bg-brand-blue/10 text-brand-blue-2 ring-1 ring-brand-blue/20',
      'Resume Scoring': 'bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20',
      'My Resumes': 'bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20',
      'Internal DB': 'bg-brand-teal/10 text-brand-teal ring-1 ring-brand-teal/20',
      'Manual': 'bg-gray-100 text-gray-600 ring-1 ring-gray-200',
    };
    const labels: Record<string, string> = { 'JD': 'Job' };
    return {
      label: labels[value] || value,
      cls: styles[value] || styles['Manual'],
    };
  };

  const resultStatusClass = (status?: string) => {
    if (status === 'completed') return 'bg-green-100 text-green-700';
    if (status === 'in_progress') return 'bg-blue-100 text-blue-700';
    return 'bg-gray-100 text-gray-600';
  };

  const resultStatusLabel = (status?: string) => {
    if (status === 'completed') return 'Completed';
    if (status === 'in_progress') return 'In Progress';
    return 'Pending';
  };

  // Row click opens that candidate's result view. The detail route builds its
  // own breadcrumb (Dashboard > Assessments > assessment > candidate) and pages
  // through `assessmentResultNavList`, so seed it with the rows on screen.
  const openCandidateResult = (result: CandidateResultRow, rows: CandidateResultRow[]) => {
    const attemptId = result.id;
    if (!attemptId) {
      toast.error('No result record for this candidate yet');
      return;
    }
    try {
      sessionStorage.setItem(
        'assessmentResultNavList',
        JSON.stringify(
          rows
            .filter(row => row.id && row._assessment_id === result._assessment_id)
            .map(row => ({ id: row.id, cid: row.candidate_display_id || '' }))
        )
      );
    } catch { /* ignore quota errors */ }

    const cid = result.candidate_display_id ? `&cid=${encodeURIComponent(result.candidate_display_id)}` : '';
    // `from` marks the cross-assessment origin so the details breadcrumb stays
    // flat instead of inserting an assessment crumb the recruiter never visited.
    router.push(`/recruitment/assessments/${result._assessment_id}/results/details?candidate_id=${attemptId}${cid}&from=candidate-results`);
  };

  const loadAllCompletedCandidates = async () => {
    setIsLoadingCompletedCandidates(true);
    setCompletedCandidatesError(null);
    try {
      const assessmentsResp = await assessmentService.list({ page: 1, page_size: 500 });
      const items = assessmentsResp.items || [];
      if (items.length === 0) {
        setCompletedCandidates([]);
        return;
      }
      // Results rather than invitations: the attempt carries the scores and the
      // pass/fail verdict this tab is about.
      const results = await Promise.all(
        items.map(async (a: any) => {
          try {
            const r = await assessmentService.listResults(a.id, { status_filter: 'completed', page_size: 1000 });
            const attempts = r.items || [];
            return attempts.map((attempt): CandidateResultRow => ({
              ...attempt,
              _assessment_id: a.id,
              _assessment_short_id: a.short_id,
              _assessment_title: a.title,
              /* Job Version, straight off the assessment this attempt belongs
                 to. The fan-out is already holding that record, so the column
                 costs no request of its own. */
              _jd_id: a.jd_id,
              _jd_version: a.jd_version,
            }));
          } catch {
            return [];
          }
        })
      );
      const merged = results.flat();

      /* ── Resume Version ────────────────────────────────────────────────
         Joined from the scoring records, which are where this app already
         keeps "which version of the resume was used" (`resume_version` on
         ScoringResponse - the same field the Scored Resumes table's own
         Resume Version column reads).

         Scoped to the JDs that actually have completed attempts, not to every
         scored resume in the tenant: `/scoring/all` would be a far larger
         response, most of it for jobs with no candidate results at all. One
         request per distinct JD, in parallel, alongside the per-assessment
         fan-out already running.

         Keyed on jd_id + lowercased email. jd_id rather than the job's
         lineage id because every republish mints a new JD row: two versions of
         one job can each have scored the same candidate at different resume
         versions, and the row must report the one scored against ITS version.
         Email because that is the only candidate identity both an attempt and
         a scoring record carry.

         A failed lookup leaves the field undefined, which the column renders
         as a dash - a candidate invited by hand was never scored, and
         defaulting that to v1 would state something untrue. */
      const jdIds = [...new Set(merged.map((row) => row._jd_id).filter(Boolean))] as string[];
      const resumeVersionByKey = new Map<string, number>();
      if (jdIds.length > 0) {
        const scoreKey = (jdId: string, email?: string) => `${jdId}|${(email || '').trim().toLowerCase()}`;
        await Promise.all(
          jdIds.map(async (jdId) => {
            try {
              const scored = await scoringService.getJDScoredResumes(jdId, { page_size: 1000 });
              for (const score of scored.items || []) {
                const email = score.candidate_email || score.email;
                if (!email || score.resume_version == null) continue;
                const key = scoreKey(jdId, email);
                /* Several scorings of one candidate against one job version is
                   possible (a resume re-uploaded and re-scored). The HIGHEST
                   resume version wins, which is the latest resume the pairing
                   knows about. */
                const prev = resumeVersionByKey.get(key);
                if (prev == null || score.resume_version > prev) {
                  resumeVersionByKey.set(key, score.resume_version);
                }
              }
            } catch {
              /* One job's scoring being unavailable must not empty the tab -
                 those rows simply show a dash in this one column. */
            }
          })
        );
        for (const row of merged) {
          if (!row._jd_id) continue;
          row._resume_version = resumeVersionByKey.get(scoreKey(row._jd_id, row.candidate_email));
        }
      }
      // Sort newest-first by completed_at, then created_at.
      merged.sort((x: any, y: any) => {
        const tx = new Date(x.completed_at || x.created_at || 0).getTime();
        const ty = new Date(y.completed_at || y.created_at || 0).getTime();
        return ty - tx;
      });
      setCompletedCandidates(merged);
      setCompletedCandidatesPage(1);
    } catch (err: any) {
      console.error('Failed to load completed candidates:', err);
      setCompletedCandidatesError(err?.message || 'Failed to load completed candidates');
      setCompletedCandidates([]);
    } finally {
      setIsLoadingCompletedCandidates(false);
    }
  };

  // Trigger the aggregated load whenever the user switches into this tab.
  useEffect(() => {
    if (activeTab === 'completed-candidates') {
      loadAllCompletedCandidates();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  /* Every invitation of every assessment, for the Invitation Status tab. Same
     fan-out as the results aggregation above — list the assessments, then one
     listInvitations() per assessment in parallel — with each row stamped with
     the assessment it belongs to so the table can name it. Unfiltered on the
     request: the tab's stat cards must keep counting the whole set while the
     table is narrowed, so narrowing happens client-side over these rows. */
  const loadAllInviteStatuses = async () => {
    setIsLoadingInviteStatus(true);
    setInviteStatusError(null);
    try {
      const assessmentsResp = await assessmentService.list({ page: 1, page_size: 500 });
      const items = assessmentsResp.items || [];
      if (items.length === 0) {
        setInviteStatusRows([]);
        return;
      }
      const perAssessment = await Promise.all(
        items.map(async (a: any) => {
          try {
            const resp = await assessmentService.listInvitations(a.id, { page_size: 1000 });
            return (resp.items || []).map((inv: any) => ({
              ...inv,
              _assessment_id: a.id,
              _assessment_short_id: a.short_id,
              _assessment_title: a.title,
              /* The job and version columns. An invitation record carries none
                 of this — it knows its candidate and its assessment — but the
                 fan-out is already holding the parent assessment, which has
                 all four on it (AssessmentResponse), so the columns cost no
                 request of their own and cannot disagree with the assessment
                 they came from.

                   _jd_short_id        the human-readable Job ID, e.g. JD-014.
                   _jd_title           the job's name.
                   _jd_version         the job version the assessment was
                                       authored against.
                   _assessment_version the assessment's own version, which
                                       increments on each edit/publish. */
              _jd_id: a.jd_id,
              _jd_short_id: a.jd_short_id,
              _jd_title: a.jd_title,
              _jd_version: a.jd_version,
              _assessment_version: a.version,
              /* Which rounds this assessment has. Only the score cells' "why
                 is this blank" tooltip reads them — the columns themselves
                 stay put, because rows here span assessments and a column
                 cannot come and go per row the way the popup's can. */
              _technical_enabled: a.technical_enabled,
              _coding_enabled: a.coding_enabled,
            }));
          } catch {
            /* One assessment's invitations being unavailable must not empty the
               tab — the rest still list. */
            return [];
          }
        })
      );
      const merged = perAssessment.flat();
      // Newest invite first: sent_at is the moment the recruiter cares about,
      // created_at covers a row that never made it out of the queue.
      merged.sort((x: any, y: any) => {
        const tx = new Date(x.sent_at || x.created_at || 0).getTime();
        const ty = new Date(y.sent_at || y.created_at || 0).getTime();
        return ty - tx;
      });
      setInviteStatusRows(merged);
      setInviteStatusPage(1);
      // The ids just went stale; a selection pointing at them would export rows
      // the recruiter can no longer see.
      setSelectedInviteIds(new Set());
    } catch (err: any) {
      console.error('Failed to load invitation statuses:', err);
      setInviteStatusError(err?.message || 'Failed to load invitation statuses');
      setInviteStatusRows([]);
    } finally {
      setIsLoadingInviteStatus(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'invitation-status') {
      loadAllInviteStatuses();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // FIX-004: Auto-open creation view inline if requested via props
  useEffect(() => {
    if (autoOpenCreate) {
      // Open inline creation view instead of navigating
      setShowCreation(true);
      console.log('[TalentFlow] Auto-opening assessment creation for JD:', preSelectedJdId, preSelectedJdTitle);
    }
  }, [autoOpenCreate, preSelectedJdId, preSelectedJdTitle]);

  // Load all data in parallel on mount (faster than 3 separate useEffects)
  useEffect(() => {
    const loadAllData = async () => {
      setIsLoadingStats(true);

      // Run all API calls in parallel for faster loading
      const [statsResult, quotaResult, topicsResult] = await Promise.allSettled([
        assessmentService.getStats(),
        api.get('/usage/quota-status'),
        api.get('/assessments/settings/topics'),
      ]);

      // Process stats
      if (statsResult.status === 'fulfilled') {
        const response = statsResult.value;
        setStats({
          total_assessments: response.total_assessments,
          total_ever_created: response.total_ever_created || response.total_assessments,
          total_deleted: response.total_deleted || 0,
          active_assessments: response.active_assessments,
          draft_assessments: response.draft_assessments || 0,
          archived_assessments: response.archived_assessments || 0,
          total_candidates_tested: response.total_candidates_tested || 0,
          total_candidates_completed: response.total_candidates_completed || 0,
          average_pass_rate: response.average_pass_rate,
          average_score: response.average_score,
          units_consumed: response.units_consumed || 0,
        });
        console.log('[TalentFlow] Loaded assessment stats from API');
      } else {
        console.log('[TalentFlow] Failed to load stats:', statsResult.reason);
      }

      // Process quota
      if (quotaResult.status === 'fulfilled') {
        const apiData = quotaResult.value.data?.data;
        const quotas = apiData?.quotas;
        const subscriptionStatus = (apiData?.subscription_status || '').toLowerCase();
        const isTrial = apiData?.is_trial;
        const quotaSource = apiData?.quota_source;

        console.log('[TalentFlow] Quota API response:', { subscriptionStatus, isTrial, quotaSource, hasAS: !!quotas?.AS, asData: quotas?.AS });

        // Determine if plan is inactive/expired — don't show "quota exhausted" for these
        const isActivePlan = subscriptionStatus === 'active' || subscriptionStatus === 'trial';

        if (quotas?.AS) {
          const sub = quotas.AS.subscription || {};
          const addon = quotas.AS.addon || {};
          const subLimit = sub.limit;
          const used = sub.used || 0;
          // addon.remaining removed from API — derive from total_purchased - total_consumed
          const addonPurchased = typeof addon.total_purchased === 'number' ? addon.total_purchased : 0;
          const addonConsumed = typeof addon.total_consumed === 'number' ? addon.total_consumed : 0;
          const addonRemaining = Math.max(0, addonPurchased - addonConsumed);

          // Check if unlimited
          const unlimited = subLimit === -1 || subLimit === 'unlimited';
          setIsUnlimited(unlimited);

          if (unlimited) {
            setTotalUnits(-1);
            setAvailableUnits(-1);
            setQuotaPercentage(0);
          } else if (typeof subLimit === 'number' && subLimit > 0) {
            // Valid quota limit from API — totalLimit includes all purchased addon credits
            const totalLimit = subLimit + addonPurchased;
            setTotalUnits(totalLimit);

            const subRemaining = Math.max(0, subLimit - used);
            const remaining = typeof quotas.AS.total_remaining === 'number'
              ? Math.max(0, quotas.AS.total_remaining)
              : Math.max(0, subRemaining + addonRemaining);
            setAvailableUnits(remaining);

            const percentage = totalLimit > 0 ? (used / totalLimit) * 100 : 0;
            setQuotaPercentage(percentage);
          } else if (isActivePlan) {
            // Active plan but limit is 0/null — use fallback
            const totalLimit = 10 + addonPurchased;
            setTotalUnits(totalLimit);
            const subRemaining = Math.max(0, 10 - used);
            const remaining = typeof quotas.AS.total_remaining === 'number'
              ? Math.max(0, quotas.AS.total_remaining)
              : Math.max(0, subRemaining + addonRemaining);
            setAvailableUnits(remaining);
          } else {
            // Inactive/expired plan with 0 or null limit — don't set quota values
            // Leave availableUnits as null so the "exhausted" banner never shows
            console.log('[TalentFlow] Inactive plan — skipping quota display');
          }

          console.log('[TalentFlow] Quota loaded: limit=', subLimit, 'used=', used, 'remaining=', quotas.AS.total_remaining, 'unlimited=', unlimited, 'isActivePlan=', isActivePlan);
        }
      } else {
        console.log('[TalentFlow] Failed to load quota:', quotaResult.reason);
      }

      // Process topic settings (for assessment creation)
      if (topicsResult.status === 'fulfilled') {
        const topicsData = topicsResult.value.data;
        if (topicsData) {
          setTopicSettings(topicsData);
          console.log('[TalentFlow] Loaded topic settings from API');
        }
      } else {
        console.log('[TalentFlow] Failed to load topic settings:', topicsResult.reason);
      }

      setIsLoadingStats(false);
    };

    loadAllData();
  }, []);

  useEffect(() => {
    if (activeTab === 'audit' || activeTab === 'consent' || activeTab === 'invitation-status' || activeTab === 'settings') {
      return;
    }
    loadAssessmentsPage(assessmentCurrentPage);
    // The advanced filters belong here too: turning one on switches the loader
    // between "one server page" and "the whole result set", and without the
    // dependency that switch never happened.
  }, [activeTab, preSelectedJdId, assessmentCurrentPage, assessmentItemsPerPage, assessmentSearchQuery,
      filterType, filterCreatedBy, filterCreatedFrom, filterCreatedTo]);

  // The hook's `onChange` covers query/filter changes; this handles the rest.
  useEffect(() => {
    setAssessmentCurrentPage(1);
  }, [activeTab, preSelectedJdId, assessmentItemsPerPage]);


  useEffect(() => {
    if (!showTrackInvitesModal || !selectedAssessmentForTracking) return;
    loadTrackingInvitations(selectedAssessmentForTracking, trackingCurrentPage, trackingFilters);
  }, [showTrackInvitesModal, selectedAssessmentForTracking, trackingJob, trackingCurrentPage, trackingFilters]);

  useEffect(() => {
    if (!showTrackInvitesModal || !selectedAssessmentForTracking) return;
    loadTrackingInvitationSummary(selectedAssessmentForTracking);
  }, [showTrackInvitesModal, selectedAssessmentForTracking, trackingJob]);

  // Load settings data when settings tab is active
  useEffect(() => {
    if (activeTab === 'settings') {
      if (settingsSubTab === 'proctoring') {
        loadProctoringData();
      } else if (settingsSubTab === 'topics') {
        loadTopicSettings();
      }
    }
  }, [activeTab, settingsSubTab]);

  // Load topic settings from API
  const loadTopicSettings = async () => {
    setIsLoadingTopics(true);
    setTopicsError(null);
    try {
      const response = await api.get('/assessments/settings/topics');
      if (response.data) {
        setTopicSettings(response.data);
      }
    } catch (error: any) {
      console.error('Failed to load topic settings:', error);
      // Use defaults if API fails (settings might not exist yet)
      if (error.response?.status !== 404) {
        setTopicsError('Failed to load topic settings');
      }
    } finally {
      setIsLoadingTopics(false);
    }
  };

  // Update topic settings
  const updateTopicSettings = async (updates: Partial<TopicSettings>) => {
    setIsSavingTopics(true);
    setTopicsError(null);

    // Optimistically update local state
    const previousSettings = topicSettings;
    setTopicSettings({ ...topicSettings, ...updates });

    try {
      const response = await api.put('/assessments/settings/topics', { ...topicSettings, ...updates });
      if (response.data) {
        setTopicSettings(response.data);
      }
    } catch (error) {
      console.error('Failed to update topic settings:', error);
      setTopicsError('Failed to save settings');
      // Rollback on error
      setTopicSettings(previousSettings);
    } finally {
      setIsSavingTopics(false);
    }
  };

  // Load proctoring settings and events from API.
  // Settings and events load independently so the toggles paint as soon as
  // the (fast) settings call returns; the recent-events list is the slow
  // part and fills in afterwards.
  const loadProctoringData = async () => {
    setIsLoadingProctoring(true);
    setProctoringError(null);
    try {
      const settings = await proctoringService.getSettings();
      setProctoringSettings(settings);
    } catch (error) {
      console.error('Failed to load proctoring settings:', error);
      setProctoringError('Failed to load proctoring settings');
    } finally {
      setIsLoadingProctoring(false);
    }

    setIsLoadingProctoringEvents(true);
    try {
      const events = await proctoringService.getEvents({ page_size: 10 });
      setProctoringEvents(events.items);
      setProctoringEventsTotal(events.total);
      setFlaggedCount(events.flagged_attempts);
    } catch (error) {
      console.error('Failed to load proctoring events:', error);
    } finally {
      setIsLoadingProctoringEvents(false);
    }
  };

  // Update proctoring setting
  const updateProctoringSettings = async (updates: Partial<ProctoringSettings>) => {
    if (!proctoringSettings) return;

    setIsSavingProctoring(true);
    setProctoringError(null);

    // Optimistically update local state
    const previousSettings = proctoringSettings;
    setProctoringSettings({ ...proctoringSettings, ...updates });

    try {
      const updated = await proctoringService.updateSettings(updates);
      setProctoringSettings(updated);
    } catch (error) {
      console.error('Failed to update proctoring settings:', error);
      setProctoringError('Failed to save settings');
      // Rollback on error
      setProctoringSettings(previousSettings);
    } finally {
      setIsSavingProctoring(false);
    }
  };

  // Use API assessments only (no local state needed - all assessments are saved to DB)
  const assessments = apiAssessments;

  // Handle edit assessment - redirect to config page instead of modal
  const handleEditAssessment = (assessment: any) => {
    // Block edits once the assessment is published AND candidates have
    // been invited. Editing after invites would diverge questions across
    // candidates and break fairness. Buttons are also visually disabled
    // in the dropdowns for this case; this is the last-line defence for
    // any caller that bypasses the dropdown (e.g. AssessmentDetailsView's
    // onEdit callback or future code paths).
    const inviteCount = assessment.invitations_count || assessment.candidates || 0;
    if (assessment.status === 'Active' && inviteCount > 0) {
      toast.warning(`Cannot edit — assessment is published and ${inviteCount} candidate(s) have been invited. Please clone it as a new draft instead.`);
      return;
    }

    // Redirect to the assessment creation page with edit mode
    router.push(`/recruitment/assessments/create?step=configure&jd_id=${assessment.jd_id}&edit=${assessment.id}`);
  };

  /**
   * Open ONE assessment on the page its OWN status calls for.
   *
   * A Draft opens the draft page — the configure form it was left in, ready to
   * be finished and published. Anything else opens the details page.
   *
   * One helper because the rule was previously written into the grid card's
   * click handler alone, and the version panel's rows pushed straight at
   * `/recruitment/assessments/<id>` for every row they carried. A Draft
   * clicked there landed on the published details page: invitations, analytics
   * and results for an assessment that has none of them, and no way to carry
   * on editing it. Status is read per ROW, never from the card or the lineage
   * it sits in, so a Draft and a Published assessment on the same job version
   * open their own pages.
   */
  const openAssessment = (assessment: { id: string; status?: string; jd_id?: string }) => {
    if (assessment.status === 'Draft') {
      if (!canUpdateAssessment) {
        toast.error('You do not have permission to edit assessments');
        return;
      }
      /* No `jd_id`, no draft page to open — the configure form is scoped to a
         job. Falls through to the details page rather than pushing a URL that
         cannot resolve. */
      if (assessment.jd_id) {
        handleEditAssessment(assessment);
        return;
      }
    }
    router.push(`/recruitment/assessments/${assessment.id}`);
  };

  // Reload quota from API
  const reloadQuota = async () => {
    try {
      const quotaResponse = await api.get('/usage/quota-status');
      const apiData = quotaResponse.data?.data;
      const quotas = apiData?.quotas;
      const subscriptionStatus = (apiData?.subscription_status || '').toLowerCase();
      const isActivePlan = subscriptionStatus === 'active' || subscriptionStatus === 'trial';

      if (quotas?.AS) {
        const sub = quotas.AS.subscription || {};
        const addon = quotas.AS.addon || {};
        const subLimit = sub.limit;
        const used = sub.used || 0;
        // addon.remaining removed from API — derive from total_purchased - total_consumed
        const addonPurchased = typeof addon.total_purchased === 'number' ? addon.total_purchased : 0;
        const addonConsumed = typeof addon.total_consumed === 'number' ? addon.total_consumed : 0;
        const addonRemaining = Math.max(0, addonPurchased - addonConsumed);

        const unlimited = subLimit === -1 || subLimit === 'unlimited';
        setIsUnlimited(unlimited);

        if (unlimited) {
          setTotalUnits(-1);
          setAvailableUnits(-1);
          setQuotaPercentage(0);
        } else if (typeof subLimit === 'number' && subLimit > 0) {
          const totalLimit = subLimit + addonPurchased;
          setTotalUnits(totalLimit);
          const subRemaining = Math.max(0, subLimit - used);
          const remaining = typeof quotas.AS.total_remaining === 'number'
            ? Math.max(0, quotas.AS.total_remaining)
            : Math.max(0, subRemaining + addonRemaining);
          setAvailableUnits(remaining);
          const percentage = totalLimit > 0 ? (used / totalLimit) * 100 : 0;
          setQuotaPercentage(percentage);
        } else if (isActivePlan) {
          const totalLimit = 10 + addonPurchased;
          setTotalUnits(totalLimit);
          const subRemaining = Math.max(0, 10 - used);
          const remaining = typeof quotas.AS.total_remaining === 'number'
            ? Math.max(0, quotas.AS.total_remaining)
            : Math.max(0, subRemaining + addonRemaining);
          setAvailableUnits(remaining);
        } else {
          // Inactive/expired — reset to avoid false "exhausted" banner
          setAvailableUnits(null);
          console.log('[TalentFlow] Inactive plan — skipping quota display');
        }
      }
    } catch (error) {
      console.log('[TalentFlow] Failed to reload quota:', error);
    }
  };

  // Reload stats from API
  const reloadStats = async () => {
    try {
      const statsResponse = await assessmentService.getStats();
      setStats({
        total_assessments: statsResponse.total_assessments,
        total_ever_created: statsResponse.total_ever_created || statsResponse.total_assessments,
        total_deleted: statsResponse.total_deleted || 0,
        active_assessments: statsResponse.active_assessments,
        draft_assessments: statsResponse.draft_assessments || 0,
        archived_assessments: statsResponse.archived_assessments || 0,
        total_candidates_tested: statsResponse.total_candidates_tested || 0,
        total_candidates_completed: statsResponse.total_candidates_completed || 0,
        average_pass_rate: statsResponse.average_pass_rate,
        average_score: statsResponse.average_score,
        units_consumed: statsResponse.units_consumed || 0,
      });
    } catch (error) {
      console.log('[TalentFlow] Failed to reload stats:', error);
    }
  };

  // Reload assessments from API
  /**
   * Assessments that can actually take an invite — the same three rules the
   * per-row Share button enforces: published, not archived, invites not revoked.
   */
  const shareableAssessments = assessments.filter(
    (assessment: any) =>
      assessment.status !== 'Draft' && assessment.status !== 'Archived' && !assessment.has_revoked_invites
  );

  /**
   * The assessment version picked in the dialog, resolved against live data.
   *
   * NOT a lookup in `shareableAssessments`. The pick is now made in the
   * assessment table inside a job's version panel, and that table lists every
   * version of the job - Draft and Archived included. A Draft is exactly what
   * `shareableAssessments` filters out, so looking there would return nothing
   * for a real, visible selection and the dialog would report "select a job"
   * over a ticked radio.
   *
   * The loaded list first (already mapped), then the panel's own lineage cache
   * (raw rows, so they go through the list's mapper) - the two sources the
   * table's rows actually come from. Resolved at the moment it is needed, so a
   * reload under the open dialog cannot hand the share modal a stale row.
   */
  const resolveInvitePickerChoice = () => {
    const pickedId = invitePickerSelection?.assessmentId;
    if (!pickedId) return null;
    const fromList = assessments.find((a) => a.id === pickedId);
    if (fromList) return fromList;
    for (const rows of Object.values(assessmentLineages)) {
      const raw = rows?.find((r) => r.id === pickedId);
      if (raw) return mapAssessmentFromApi(raw, 0);
    }
    return null;
  };

  /**
   * Can the picked version actually take an invite? The same three rules the
   * per-row Share button and `shareableAssessments` enforce, asked of one row
   * - because the table it is picked from does not pre-filter by them, so the
   * answer has to be given here rather than assumed.
   */
  const invitePickerBlockedReason = (choice: ReturnType<typeof resolveInvitePickerChoice>) => {
    if (!choice) return 'Select an assessment version to continue';
    if (choice.status === 'Draft') return 'This version is a Draft — publish it, or pick another version';
    if (choice.status === 'Archived') return 'This version is Archived — pick another version';
    if ((choice as { has_revoked_invites?: boolean }).has_revoked_invites)
      return 'Invitations were revoked for this version — pick another version';
    return null;
  };

  /**
   * Page-level Send Invite. With exactly one shareable assessment the picker is
   * pointless, so it goes straight to the share modal.
   */
  const handleSendInvite = () => {
    if (shareableAssessments.length === 0) {
      toast.error('No published assessment to invite candidates to. Publish one first.');
      return;
    }
    if (shareableAssessments.length === 1) {
      setSelectedAssessmentForShare(shareableAssessments[0]);
      setShowShareModal(true);
      return;
    }
    setInvitePickerQuery('');
    setInvitePickerSelection(null);
    setShowInvitePicker(true);
  };

  /* Closing has to reset the pick as well as the query, and it is reachable
     four ways (backdrop, X, Cancel, and continuing through) — so it is one
     function rather than the same two setters copied into four handlers, which
     is how the query got left behind on some paths before. */
  const closeInvitePicker = () => {
    setShowInvitePicker(false);
    setInvitePickerQuery('');
    setInvitePickerSelection(null);
  };

  const reloadAssessments = async () => {
    try {
      await loadAssessmentsPage(assessmentCurrentPage);
      // Also reload stats and quota
      await Promise.all([reloadStats(), reloadQuota()]);
    } catch (error) {
      console.log('[TalentFlow] Failed to reload assessments:', error);
    }
  };

  // FIX-004: Check quota before opening creation view (inline instead of navigation)
  const handleOpenCreation = async () => {
    // If unlimited, allow creation
    if (isUnlimited) {
      setShowCreation(true);
      return;
    }

    // Check if quota is available (use availableUnits from API)
    if (availableUnits !== null && availableUnits <= 0) {
      toast.warning('Assessment quota exhausted. Please upgrade your plan or purchase add-on credits to continue.');
      return;
    }

    // FIX-004: Open inline creation view instead of navigating
    setShowCreation(true);
  };

  const handleCreateAssessment = async (assessment: any) => {
    // Don't add to local list - assessment is already saved to DB
    // Just close the creation view and reload from API
    setShowCreation(false);

    /* Land on All Assessments, not on the summary cards the flow was opened
       from. The recruiter has just made a thing and the next question is
       "where is it" — this is the tab that lists it, and the same state the
       Total Assessments card selects, so that card reads as active too.
       The standalone /assessments/create route arrives at the same place by
       URL (`?tab=all`) since it navigates rather than closing in place. */
    openAssessmentsList('all');

    /* Reload the list to pick up the new assessment — and, with it, everything
       that decides a job version's action. The new assessment is what turns
       its version from Create Assessment to View Assessment, so leaving those
       sources stale would keep offering Create for a version that now has one. */
    await Promise.all([
      reloadAssessments(),
      refreshAssessmentExistence(assessment?.jd_id),
    ]);

    // Track usage via external API
    if (assessment?.id) {
      recordAssessment(assessment.id, {
        assessment_title: assessment.title,
        type: assessment.type
      });
    }
  };

  // Delete assessment via API
  const handleDeleteAssessment = async (assessmentId: string) => {
    // Find the assessment to check if candidates have started
    const assessment = assessments.find((a: any) => a.id === assessmentId);
    if (assessment && (assessment.completed_count > 0 || assessment.invitations_count > 0)) {
      toast.error('Cannot delete — candidates have already been invited to this assessment');
      setOpenMenuId(null);
      return;
    }

    if (!await dialog.confirm({
      title: 'Delete Assessment',
      message: 'Are you sure you want to delete this assessment?\nThis action cannot be undone.',
      variant: 'delete',
      confirmText: 'Delete Assessment',
      item: assessment ? { label: 'ASSESSMENT', name: assessment.title } : undefined,
      warningNote: 'Deleting this assessment will permanently remove it and cannot be restored.',
    })) return;

    try {
      await assessmentService.delete(assessmentId);
      // Reload from API
      await reloadAssessments();
      setOpenMenuId(null);
    } catch (error) {
      console.error('Failed to delete assessment:', error);
      toast.error(`Failed to delete assessment: ${error instanceof Error ? error.message : 'Only draft assessments can be deleted'}`);
      setOpenMenuId(null);
    }
  };

  // Pause assessment (set status to closed)
  const handlePauseAssessment = async (assessmentId: string) => {
    if (!await dialog.confirm({ title: 'Pause Assessment', message: 'Are you sure you want to pause this assessment?', variant: 'warning', confirmText: 'Pause' })) return;

    try {
      await assessmentService.update(assessmentId, { status: 'closed' as any });
      await reloadAssessments();
      setOpenMenuId(null);
    } catch (error) {
      console.error('Failed to pause assessment:', error);
      toast.error(`Failed to pause assessment: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setOpenMenuId(null);
    }
  };

  // Open the clone confirmation modal. The recruiter then publishes and
  // invites the new version's candidates manually via the normal invite flow.
  // If the lineage is already at MAX_ASSESSMENT_VERSIONS, show a max-reached
  // popup instead of opening the duplicate confirmation.
  const handleOpenCloneModal = async (assessment: any) => {
    /* Re-read the lineage before deciding, rather than trusting whatever the
       menu's own gate could see.

       The menu greys Duplicate out from the same count, but that count can be
       short: with no panel yet opened for this JD it falls back to the loaded
       list, which is filtered by the active tab — on the Active tab the
       drafts were never fetched, so a lineage sitting at the cap can still
       look like it has room. This fetch is the unfiltered lineage, so the cap
       is checked against every version that actually exists at the moment of
       the click. It also lands the rows the versions table will render, so
       the duplicate that follows has nothing left to load. */
    const lineage = assessment.jd_id
      ? await loadAssessmentLineage(assessment.jd_id, true)
      : undefined;
    if (isVersionCapReached(assessment, lineage)) {
      await dialog.alert({
        title: 'Maximum versions reached',
        message: `This assessment already has ${MAX_ASSESSMENT_VERSIONS} versions (the maximum allowed). Archive or delete a version before duplicating again.`,
        variant: 'warning',
      });
      return;
    }
    // Only one draft may exist per lineage at a time — offer to open the
    // existing one instead of minting a second (the backend blocks this
    // too, but checking here avoids the round trip and gives the recruiter
    // a direct way into the draft they should be using).
    const pendingDraft = findPendingDraftVersion(assessment, lineage);
    if (pendingDraft) {
      const openIt = await dialog.confirm({
        title: 'Draft already exists',
        message: `Already one assessment version is in draft ("${pendingDraft.title || 'Untitled'}"). Use this draft instead of creating a new one.`,
        variant: 'warning',
        confirmText: 'Open Draft',
      });
      if (openIt) {
        handleEditAssessment({
          id: pendingDraft.id,
          jd_id: assessment.jd_id,
          status: 'Draft',
          invitations_count: 0,
        });
      }
      return;
    }
    setCloneTargetAssessment(assessment);
  };

  const handleConfirmClone = async () => {
    if (!cloneTargetAssessment || isCloning) return;
    setIsCloning(true);
    /* Read off the target BEFORE the await: `setCloneTargetAssessment(null)`
       below clears the state, and the lineage refresh needs the JD the clone
       was made under. */
    const clonedFromJdId: string | undefined = cloneTargetAssessment.jd_id;
    try {
      const response = await assessmentService.clone(cloneTargetAssessment.id);
      /* Both halves of what is on screen, refreshed together and awaited, so
         the new version is there before the toast says it was created:

           - the lineage cache, FORCED past its cache hit, because that cache
             is what the open Assessment Versions table renders. Without the
             force the table kept its pre-click rows and only a page reload
             showed the new one.
           - the list itself, which owns the version counts the cap is read
             against and the totals on each card.

         The Main Assessment List row is unaffected by design: the clone is a
         Draft, and `collapsedAssessments` keeps a lineage represented by its
         non-draft version, so the row keeps its name, stage and Active
         status, and the panel it has open stays keyed to the same id. */
      await Promise.all([
        refreshAssessmentExistence(clonedFromJdId),
        reloadAssessments(),
      ]);
      toast.success(`Assessment duplicated: "${response.cloned_title}"`);
      setCloneTargetAssessment(null);
      // Take the recruiter straight into the new draft's edit form instead
      // of leaving them to find it themselves in the JD's version panel.
      handleEditAssessment({
        id: response.cloned_id,
        jd_id: clonedFromJdId,
        status: 'Draft',
        invitations_count: 0,
      });
    } catch (error: any) {
      console.error('Failed to duplicate assessment:', error);
      const msg =
        error?.response?.data?.detail?.message ||
        error?.response?.data?.message ||
        (typeof error?.response?.data?.detail === 'string' ? error.response.data.detail : null) ||
        'Failed to duplicate assessment. Please try again.';
      toast.error(msg);
    } finally {
      setIsCloning(false);
    }
  };

  // Open the revoke confirmation modal. Fetch eligible count so the
  // recruiter sees exactly how many links will be invalidated.
  const handleOpenRevokeModal = async (assessment: any) => {
    setRevokeTargetAssessment(assessment);
    setRevokeCount(null);
    try {
      const count = await assessmentService.getRevokableInvitationsCount(assessment.id);
      setRevokeCount(count);
    } catch (err) {
      console.error('Failed to fetch revokable count:', err);
      setRevokeCount(null);
    }
  };

  const handleConfirmRevoke = async () => {
    if (!revokeTargetAssessment || isRevoking) return;
    setIsRevoking(true);
    const revokedId = revokeTargetAssessment.id;
    try {
      const result = await assessmentService.revokePendingInvitations(revokedId);
      // SYNCHRONOUSLY add to the ref before the await so the mapper inside
      // reloadAssessments() sees it. Then bump the tick to force a re-render.
      // This guarantees the seal survives the upcoming refetch even when the
      // backend hasn't been redeployed with the has_revoked_invites flag.
      // Persist to sessionStorage so the seal also survives component
      // unmount/remount (user navigating away to another module and back).
      locallyRevokedIdsRef.current.add(revokedId);
      persistLocallyRevokedIds();
      setRevokedTick(t => t + 1);
      // Also patch the current state directly so the seal flips BEFORE the
      // refetch round-trip completes.
      setApiAssessments(prev => prev.map(a =>
        a.id === revokedId
          ? { ...a, has_revoked_invites: true }
          : a
      ));
      await reloadAssessments();
      toast.success(
        result.revoked_count > 0
          ? `Revoked ${result.revoked_count} pending invite link(s).`
          : 'No pending invites to revoke.'
      );
      setRevokeTargetAssessment(null);
    } catch (error) {
      console.error('Failed to revoke pending invites:', error);
      toast.error('Failed to revoke pending invites. Please try again.');
    } finally {
      setIsRevoking(false);
    }
  };

  // Activate assessment (publish)
  const handleActivateAssessment = async (assessmentId: string) => {
    try {
      await assessmentService.publish(assessmentId);
      await reloadAssessments();
      setOpenMenuId(null);
    } catch (error) {
      console.error('Failed to activate assessment:', error);
      toast.error(`Failed to activate assessment: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setOpenMenuId(null);
    }
  };

  // Archive assessment
  const handleArchiveAssessment = async (assessmentId: string) => {
    if (!await dialog.confirm({ title: 'Archive Assessment', message: 'Archive this assessment? It will be moved to the archived section.', variant: 'warning', confirmText: 'Archive' })) return;

    try {
      await assessmentService.update(assessmentId, { status: 'archived' as any });
      await reloadAssessments();
      setOpenMenuId(null);
    } catch (error) {
      console.error('Failed to archive assessment:', error);
      toast.error(`Failed to archive assessment: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setOpenMenuId(null);
    }
  };

  // Track Invites - Load invitations for an assessment
  const handleTrackInvites = async (assessment: any) => {
    /* Loading from the very first paint. The popup opens with no rows (the
       close handler clears them), and the effect that fetches them runs AFTER
       that paint - so for one frame the body rendered "No invitations found",
       which is both wrong and a third height for the dialog to pass through on
       the way in: empty state, then spinner, then table. Declaring the load
       here collapses that to one. */
    setIsLoadingInvitations(true);
    // One assessment - the popup's original scope. Cleared explicitly so a
    // per-assessment Track after a job-wide one is not still job-scoped.
    setTrackingJob(null);
    setSelectedAssessmentForTracking(assessment);
    setShowTrackInvitesModal(true);
    setTrackingFilters(EMPTY_INVITE_FILTERS);
    setTrackingCurrentPage(1);
  };

  /**
   * Track for a whole JOB, from a Job List row — the same popup, reading every
   * assessment of the job rather than one, with each row stating which job
   * version its assessment belongs to.
   *
   * The job's assessments are resolved here, once, before the popup opens: from
   * the lineage cache the row's version panel fills, or by the same request that
   * fills it. The row's own assessment stands in if that comes back empty, so
   * Track always opens on something.
   */
  const handleTrackJob = async (assessment: any) => {
    const jdId = assessment?.jd_id;
    if (!jdId) return;
    /* Same reason as `handleTrackInvites`: the popup must open on its loader,
       not on a momentary "No invitations found". */
    setIsLoadingInvitations(true);
    let rows: any[] = (assessmentLineages[jdId] as any[]) || [];
    if (!rows.length) {
      try {
        const response = await assessmentService.list({ jd_id: jdId, page_size: 50 });
        rows = response.items || [];
        setAssessmentLineages(prev => ({ ...prev, [jdId]: rows as AssessmentVersionRow[] }));
      } catch (error) {
        console.error('Failed to load the job\'s assessments for tracking:', error);
        rows = [];
      }
    }
    setTrackingJob({
      jobId: assessment.jd_short_id,
      jobTitle: assessment.job?.title || stripVersionFromTitle(assessment.title),
      jdId,
      assessments: rows.length ? rows : [assessment],
    });
    setSelectedAssessmentForTracking(assessment);
    setTrackingFilters(EMPTY_INVITE_FILTERS);
    setTrackingCurrentPage(1);
    setTrackingSelectedIds(new Set());
    setShowTrackInvitesModal(true);
  };

  const isValidInviteEmail = (email: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  // Preview the new expiry the backend will produce. Mirrors backend logic:
  // reuses the original invitation's configured duration, measured from the LAST
  // send (expires_at - sent_at). Anchoring on created_at would promise a longer
  // window than the server grants on a second resend, since created_at never moves.
  const computeResendExpiryPreview = (invitation: any): { dateLabel: string; durationLabel: string } | null => {
    if (!invitation) return null;
    const sentAnchor = invitation.sent_at || invitation.created_at;
    const createdMs = sentAnchor ? new Date(sentAnchor).getTime() : NaN;
    const expiresMs = invitation.expires_at ? new Date(invitation.expires_at).getTime() : NaN;
    let durationMs = 24 * 60 * 60 * 1000; // default 1 day
    if (Number.isFinite(createdMs) && Number.isFinite(expiresMs) && expiresMs > createdMs) {
      durationMs = expiresMs - createdMs;
    }
    const newExpiry = new Date(Date.now() + durationMs);
    const totalMinutes = Math.max(1, Math.round(durationMs / 60000));
    let durationLabel: string;
    if (totalMinutes >= 60 * 24) {
      const days = Math.round(totalMinutes / (60 * 24));
      durationLabel = days === 1 ? '1 day' : `${days} days`;
    } else if (totalMinutes >= 60) {
      const hours = Math.round(totalMinutes / 60);
      durationLabel = hours === 1 ? '1 hour' : `${hours} hours`;
    } else {
      durationLabel = `${totalMinutes} minute${totalMinutes === 1 ? '' : 's'}`;
    }
    return { dateLabel: formatIST(newExpiry.toISOString()), durationLabel };
  };

  // Revoke current link and resend with a freshly generated link.
  // The backend regenerates invitation_token and refreshes expires_at using
  // the original configured duration. Confirmation dialog handles user intent.
  /* Resend, for both callers: the Track Invites popup (pinned to one
     assessment) and the page-level Invitation Status tab (whose rows span
     every assessment and each carry their own `_assessment_id`). Same
     endpoint, same confirmation dialog, same toasts — only which assessment
     the row belongs to, and which list is refetched afterwards, differ. */
  const handleResendInvitation = async (invitation: any) => {
    const assessmentId = invitation._assessment_id || selectedAssessmentForTracking?.id;
    if (!assessmentId) {
      toast.error('Could not tell which assessment this invitation belongs to.');
      setResendTargetInvitation(null);
      return;
    }
    setIsResending(true);
    try {
      await api.post(
        `/assessments/${assessmentId}/invitations/${invitation.id}/resend`
      );
      toast.success('New invitation link generated and emailed!');
      /* Refresh whichever list the row came from — the row's own
         `_assessment_id` is what marks it as the tab's. */
      if (invitation._assessment_id) {
        await loadAllInviteStatuses();
      } else if (selectedAssessmentForTracking) {
        await Promise.all([
          loadTrackingInvitations(selectedAssessmentForTracking, trackingCurrentPage, trackingFilters),
          loadTrackingInvitationSummary(selectedAssessmentForTracking),
        ]);
      }
    } catch (error: any) {
      console.error('Failed to resend invitation:', error);
      const detail = error?.response?.data?.detail;
      const msg =
        (typeof detail === 'object' && detail?.message) ||
        (typeof detail === 'string' && detail) ||
        'Failed to resend invitation. Please try again.';
      toast.error(msg);
    } finally {
      setIsResending(false);
      setResendTargetInvitation(null);
    }
  };

  /* The resend loop itself, shared by both bulk callers — the Track Invites
     popup's Bulk Resend and the Invitation Status tab's. Sequential on
     purpose: a burst of parallel resends is exactly the kind of thing mail
     rate-limiters punish. Each row is sent against its OWN assessment when it
     carries one (the tab's rows span assessments), else the popup's pinned
     one, the same rule handleResendInvitation follows.

     Toasts live here because both callers reported identically; the caller
     keeps what only it knows — which selection to clear, which dialog to
     close, which list to refetch. */
  const resendInvitationsSequentially = async (targets: any[]): Promise<{ sent: number; failedCount: number }> => {
    let sent = 0;
    let failedCount = 0;
    for (const inv of targets) {
      const assessmentId = inv._assessment_id || selectedAssessmentForTracking?.id;
      if (!assessmentId) {
        console.error(`No assessment for invitation ${inv.id}; skipped.`);
        failedCount++;
        continue;
      }
      try {
        await api.post(`/assessments/${assessmentId}/invitations/${inv.id}/resend`);
        sent++;
      } catch (error) {
        console.error(`Failed to resend invitation ${inv.id}:`, error);
        failedCount++;
      }
    }
    if (sent > 0) {
      toast.success(`New invitation link${sent === 1 ? '' : 's'} sent to ${sent} candidate${sent === 1 ? '' : 's'}.`);
    }
    if (failedCount > 0) {
      toast.error(`${failedCount} invitation${failedCount === 1 ? '' : 's'} could not be resent.`);
    }
    return { sent, failedCount };
  };

  // Bulk resend for the selected Invited/Expired candidates — same endpoint as
  // the single-row Resend, called per invitation. Sequential on purpose: the
  // selection is at most one page of rows, and a burst of parallel resends is
  // exactly the kind of thing mail rate-limiters punish.
  const [showBulkResendConfirm, setShowBulkResendConfirm] = useState(false);
  const [isBulkResending, setIsBulkResending] = useState(false);

  const handleBulkResend = async () => {
    if (!selectedAssessmentForTracking) return;
    // Re-derive eligibility at send time — a status can have moved since the
    // row was ticked, and only Invited/Expired rows may be resent.
    const targets = trackingInvitations.filter(
      (inv: any) => trackingSelectedIds.has(inv.id) && isBulkResendable(inv)
    );
    if (targets.length === 0) {
      setShowBulkResendConfirm(false);
      return;
    }
    setIsBulkResending(true);
    await resendInvitationsSequentially(targets);
    setTrackingSelectedIds(new Set());
    setShowBulkResendConfirm(false);
    setIsBulkResending(false);
    await Promise.all([
      loadTrackingInvitations(selectedAssessmentForTracking, trackingCurrentPage, trackingFilters),
      loadTrackingInvitationSummary(selectedAssessmentForTracking),
    ]);
  };

  // Change email and resend for bounced invitations
  const handleUpdateEmail = async (invitation: any) => {
    if (!isValidInviteEmail(newEmailValue)) return;
    setIsSendingChangeEmail(true);
    try {
      /* The invite's own assessment where the row carries one, the pinned one
         otherwise - the same rule resend and revoke follow, and what keeps this
         correct when the popup is scoped to a whole job. */
      const assessmentId = invitation._assessment_id || selectedAssessmentForTracking?.id;
      await api.patch(
        `/assessments/${assessmentId}/invitations/${invitation.id}/update-email`,
        { new_email: newEmailValue.trim() }
      );
      setEditingEmailId(null);
      setNewEmailValue('');
      toast.success('Email updated and invitation resent!');
      await Promise.all([
        loadTrackingInvitations(selectedAssessmentForTracking, trackingCurrentPage, trackingFilters),
        loadTrackingInvitationSummary(selectedAssessmentForTracking),
      ]);
    } catch (error: any) {
      console.error('Failed to update email:', error);
      const msg =
        error?.response?.data?.detail?.message ||
        error?.response?.data?.message ||
        (typeof error?.response?.data?.detail === 'string' ? error.response.data.detail : null) ||
        'Failed to update email. Please try again.';
      toast.error(msg);
    } finally {
      setIsSendingChangeEmail(false);
    }
  };

  if (showCreation) {
    return (
      <AssessmentCreation
        onBack={() => setShowCreation(false)}
        jobs={jobs}
        onCreateAssessment={handleCreateAssessment}
        onCreateNewJD={onNavigateToJDCreation}
        topicSettings={topicSettings}
        preSelectedJobId={preSelectedJdId}
        proctoringSettings={proctoringSettings}
      />
    );
  }

  if (showResults && selectedAssessmentForResults) {
    return (
      <AssessmentResults
        onBack={() => {
          setShowResults(false);
          // If we came from the details view, go back to it
          if (selectedAssessmentForDetails) {
            setShowDetailsView(true);
          }
          setSelectedAssessmentForResults(null);
        }}
        assessmentId={selectedAssessmentForResults.id}
        assessmentTitle={selectedAssessmentForResults.title}
        jdTitle={selectedAssessmentForResults.job?.title}
        canDownloadPDF={canDownloadAssessmentPDF}
        canBatchDownload={canBatchDownloadAssessmentPDF}
      />
    );
  }

  if (showDetailsView && selectedAssessmentForDetails) {
    return (
      <>
        <AssessmentDetailsView
          assessment={selectedAssessmentForDetails}
          onBack={() => {
            setShowDetailsView(false);
            setSelectedAssessmentForDetails(null);
          }}
          onEdit={() => {
            if (!canUpdateAssessment) {
              toast.error('You do not have permission to edit assessments');
              return;
            }
            // Keep details view open, modal will overlay on top
            handleEditAssessment(selectedAssessmentForDetails);
          }}
          onPreview={() => {
            // Keep details view open, modal will overlay on top
            setSelectedAssessmentForPreview(selectedAssessmentForDetails);
            setShowPreviewModal(true);
          }}
          onShare={(hasPermission('canUpdateAssessments') || isTenantAdmin) ? () => {
            // Keep details view open, modal will overlay on top
            setSelectedAssessmentForShare(selectedAssessmentForDetails);
            setShowShareModal(true);
          } : undefined}
          onViewResults={() => {
            setShowDetailsView(false);
            setSelectedAssessmentForResults(selectedAssessmentForDetails);
            setShowResults(true);
          }}
          onRefresh={reloadAssessments}
        />

        {/* Modals - rendered as overlays on top of details view */}
        {showShareModal && selectedAssessmentForShare && (
          <ShareAssessmentModal
            isOpen={showShareModal}
            onClose={() => {
              setShowShareModal(false);
              setSelectedAssessmentForShare(null);
              // Refresh the list so invitation counts / Track Invites
              // badges reflect the just-sent invites.
              reloadAssessments();
            }}
            assessment={selectedAssessmentForShare}
            inviteSource="Assessment"
          />
        )}

        {showPreviewModal && selectedAssessmentForPreview && (
          <AssessmentPreviewModal
            isOpen={showPreviewModal}
            onClose={() => {
              setShowPreviewModal(false);
              setSelectedAssessmentForPreview(null);
            }}
            assessment={selectedAssessmentForPreview}
          />
        )}

        {showEditModal && selectedAssessmentForEdit && (
          <AssessmentEditModal
            isOpen={showEditModal}
            onClose={() => {
              setShowEditModal(false);
              setSelectedAssessmentForEdit(null);
            }}
            assessment={selectedAssessmentForEdit}
            onSave={async (updatedAssessment) => {
              await reloadAssessments();
              // Update the selected assessment for details view with fresh data
              const updated = await assessmentService.get(selectedAssessmentForDetails.id);
              setSelectedAssessmentForDetails(mapAssessmentFromApi(updated, 0));
            }}
          />
        )}
      </>
    );
  }

  /* The key every version of one job collapses onto. Extracted because the
     per-job totals below have to bucket by exactly the same rule the rows are
     built with — two copies of `jd_short_id || jd_id || __unlinked__` would be
     one edit away from a row whose counts belong to a different job.

     Declared HERE, above `filteredAssessments`, because the Position filter and
     its option list both key on it and both run earlier in this body than the
     row collapse that used to own it. It is a pure helper, so the move is
     positional only.

     The rule itself now lives at module scope as `jobLineageKey`, because the
     Send Invite picker groups its jobs by it too and a second copy of the
     expression was exactly the drift this comment warns about. */
  const lineageKeyOf = jobLineageKey;

  // Everyone who has created one of the loaded assessments, for the filter list.
  const assessmentCreators = Array.from(
    new Set(assessments.map((a) => a.created_by_name).filter(Boolean))
  ).sort();

  /* Every job that has an assessment, for the Position filter — derived from
     the loaded rows rather than fetched, so the dropdown can only ever offer a
     job that some assessment on this page actually belongs to. No dead
     options, and no second request.

     Keyed and counted by lineage, so a job republished three times is ONE
     option carrying the count of its assessments, not three identical rows.
     The job id sits in the label as well as the hint so typing either the
     title or "JD-014" finds it. */
  const positionOptions: SearchableSelectOption[] = (() => {
    const byLineage = new Map<string, { title: string; count: number }>();
    for (const assessment of assessments) {
      const key = lineageKeyOf(assessment);
      if (!key) continue;
      const entry = byLineage.get(key)
        ?? { title: assessment.job?.title || stripVersionFromTitle(assessment.title), count: 0 };
      entry.count += 1;
      byLineage.set(key, entry);
    }
    return [...byLineage.entries()]
      .sort((a, b) => a[1].title.localeCompare(b[1].title, undefined, { sensitivity: 'base' }))
      .map(([key, { title, count }]) => ({
        value: key,
        label: key.startsWith('__unlinked__') ? title : `${title} (${key})`,
        hint: String(count),
      }));
  })();

  const assessmentFilterCount = assessmentListSearch.activeFilterCount;
  const assessmentFiltersActive = assessmentListSearch.filtersApplied;
  const assessmentListNarrowed = assessmentListSearch.isNarrowed;
  const clearAssessmentFilters = assessmentListSearch.reset;

  const filteredAssessments = assessments.filter((assessment) => {
    if (activeTab === 'active' && assessment.status !== 'Active') return false;
    if (activeTab === 'draft' && assessment.status !== 'Draft') return false;
    if (activeTab === 'completed' && assessment.status !== 'Completed') return false;
    if (activeTab === 'archived' && assessment.status !== 'Archived') return false;

    /* Position, on the same lineage key the rows are collapsed by
       (`lineageKeyOf`), so picking a job selects every version of it and the
       count in the toolbar agrees with the rows on screen. */
    if (filterPosition && lineageKeyOf(assessment) !== filterPosition) return false;
    if (filterType !== 'all' && assessment.type !== filterType) return false;
    if (filterCreatedBy !== 'all' && assessment.created_by_name !== filterCreatedBy) return false;
    // `created` is the YYYY-MM-DD date, so the range compares as plain strings.
    if (filterCreatedFrom && assessment.created < filterCreatedFrom) return false;
    if (filterCreatedTo && assessment.created > filterCreatedTo) return false;

    return true;
  });

  /**
   * One row per ASSESSMENT, not one per version.
   *
   * An assessment duplicated to V2 and V3 used to put three cards on the page,
   * repeating the same job title, each with its own vN badge and nothing
   * saying they were the same assessment. Only the latest version is listed
   * now; the rest live behind that card's View Versions button.
   *
   * An assessment's versions are the other assessments sharing its JD — that
   * is what the version cap counts and what the details view's own
   * "New Versions" tab fetches, so it is the app's existing definition rather
   * than a new one. Rows with no JD are their own lineage: unrelated
   * assessments must not collapse into each other just because they share a
   * missing field.
   *
   * "Sharing its JD" means the JOB, not one version of it. Every republish
   * mints a new JD row with its own `jd_id` under the same human-readable
   * `jd_short_id` (JD-025), so keying on `jd_id` put one card on the page per
   * job VERSION — three rows all badged JD-025, which is the duplication a
   * recruiter sees. `jd_short_id` is what the versions of a job share, and it
   * is the same key the Job Openings list collapses on (`lineageKey` in
   * lib/utils/jobOpeningDisplay), so one Job ID means one row here too. The
   * versions behind it are what View Versions opens.
   *
   * Order is by each lineage's FIRST appearance in the server's ordering, so
   * collapsing does not reshuffle a list the user was already reading.
   *
   * Note this runs on the tab-filtered set: on the Draft tab a lineage whose
   * V3 alone is a draft is represented by V3, which is the right answer for
   * "the draft assessments" — and the version panel fetches the lineage
   * unfiltered, so opening it still shows every version whatever its status.
   */

  const collapseByLineage = (list: typeof assessments) => {
    const byLineage = new Map<string, (typeof list)[number]>();

    /* Which of two rows of one lineage is the newer VERSION — the Job Openings
       list's `byLatestVersion`, read against the pair of numbers an assessment
       carries. Negative when `a` is newer, so it reads like a sort comparator.

       Newest JOB version wins, and only then the newest assessment version
       within it. The job is the parent, so "which row represents this job" is
       answered by the job's own version first - picking on the assessment
       number alone could put an older job version on the card whenever an
       assessment was duplicated after a republish.

       DRAFT IS THE ONE STATUS TERM, and it outranks nothing: a version that
       is still a draft never represents a lineage that has a non-draft
       version in it. This is what keeps the Main Assessment List still when
       a version is duplicated. Duplicate mints the next version as a Draft,
       and on a pure sequence rule that draft immediately became the row —
       so an Active assessment turned Draft, its name grew a "- Version 2"
       suffix, its stage moved and the open version panel (keyed on the old
       row's id) closed itself, all from an action that was supposed to touch
       only the versions table. None of that was a data change; the list was
       simply pointing at a different member of the same lineage.

       Only DRAFT is weighed, not a full status ranking: Active vs Completed
       vs Archived still sort purely by version, exactly as before, so the
       only lineage whose row moves is one that had a draft on top of a
       non-draft. A lineage that is all drafts still shows its newest draft —
       there is no non-draft version for it to be represented by.

       `created_at` is the last tie-break, for the same reason it is one there:
       when the list endpoint omits `version` every row falls back to 1, both
       numeric comparisons tie, and "latest" would quietly become whatever order
       the API happened to return — enough to flip a lineage's card between its
       draft and its published version from one load to the next. */
    const isNewerVersion = (
      a: (typeof list)[number],
      b: (typeof list)[number],
    ) => {
      /* A draft loses to any non-draft in the same lineage, whatever the
         version numbers say. Checked before the job version too: a draft
         authored against a newer JOB version is still a draft, and letting
         it through here would flip the row on the next republish-and-
         duplicate just as surely. */
      const aIsDraft = a.status === 'Draft';
      const bIsDraft = b.status === 'Draft';
      if (aIsDraft !== bIsDraft) return !aIsDraft;
      const jobDelta = (a.jd_version ?? 1) - (b.jd_version ?? 1);
      if (jobDelta !== 0) return jobDelta > 0;
      const versionDelta = (a.version ?? 1) - (b.version ?? 1);
      if (versionDelta !== 0) return versionDelta > 0;
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return aTime > bTime;
    };

    for (const assessment of list) {
      const key = lineageKeyOf(assessment);
      const current = byLineage.get(key);
      if (!current || isNewerVersion(assessment, current)) {
        byLineage.set(key, assessment);
      }
    }
    return [...byLineage.values()];
  };

  const collapsedAssessments = collapseByLineage(filteredAssessments);

  const assessmentResultCount = collapsedAssessments.length;

  /**
   * Per-job totals for the Job List rows, bucketed by lineage.
   *
   * Summed over `filteredAssessments` — the same set the rows are collapsed
   * from — so the counts always describe what the current tab and filters
   * select. On the Draft tab a job's "Assessments" is its draft count, which
   * is the honest reading of a row that is only on screen because it has one.
   *
   * Taken over a LIST rather than closing over `filteredAssessments`, because
   * the Send Invite picker renders the same job rows over a different set:
   * `shareableAssessments`. Same bucketing, same numbers, applied to whatever
   * that surface actually lists — which is the invariant the paragraph above
   * states, not an exception to it. The Job List's own call passes
   * `filteredAssessments` and is unchanged.
   */
  const buildJobRowTotals = (list: typeof assessments) => {
    const totals = new Map<string, { assessments: number; invitations: number; completed: number }>();
    for (const assessment of list) {
      const key = lineageKeyOf(assessment);
      const entry = totals.get(key) ?? { assessments: 0, invitations: 0, completed: 0 };
      entry.assessments += 1;
      entry.invitations += assessment.invitations_count ?? 0;
      /* Attempts the candidates actually finished, as the backend counts them
         (`completed_count` on AssessmentResponse, carried through
         `mapAssessmentFromApi`) - the same field the assessment's own pass rate
         is computed against. Summed over the job's assessments so it reads as
         the pair of the invitations beside it: sent, then finished. */
      entry.completed += assessment.completed_count ?? 0;
      totals.set(key, entry);
    }
    return totals;
  };

  const jobRowTotals = buildJobRowTotals(filteredAssessments);

  /**
   * How many versions this job has.
   *
   * The fetched lineage is the authority and is what the version panel lists,
   * so the row's count and the panel's row count agree. Until it lands (or if
   * the fetch failed) the highest known version number stands in — the same
   * number the LATEST badge is decided from, via the existing helper.
   */
  const getJobVersionCount = (assessment: { jd_id?: string; jd_short_id?: string; jd_version?: number }) =>
    getJobLineageRows(assessment)?.length ?? getLatestJobVersion(assessment);

  /**
   * Invitations sent for a JOB - what the Job List's Track button is gated on.
   *
   * Track opens on the whole job (every assessment of every version of it, see
   * `handleTrackJob`), so "is there anything to track" is a question about the
   * Job ID, not about the row's representative assessment. A job nobody has
   * been invited against would open the popup on an empty table.
   *
   * Two readings, the larger winning, because each sees rows the other cannot:
   *
   *   `jobRowTotals` is summed over `filteredAssessments` - the very set the
   *   row's own "Invitations Sent" metric is read from, so the button can never
   *   be disabled on a row that is showing a non-zero count. It moves with the
   *   tab and the filters, and covers only the assessments the list loaded.
   *
   *   `assessmentLineages[jd_id]` is the job's own assessments, fetched
   *   unfiltered by the version panel and by Track itself, so once it has
   *   landed it also covers versions this tab never listed. Undefined until
   *   then, which is why it cannot be the only reading.
   *
   * `invitations_count` is the backend's count of invitations sent for an
   * assessment (AssessmentResponse.invitations_count) - the same field the
   * per-assessment Track in `renderAssessmentQuickActions` is gated on, so the
   * job-wide gate and the per-version ones inside the panel agree. It is
   * re-read on every render and `reloadAssessments()` runs when the share
   * modal closes, so the first invitation sent for a job enables its Track.
   */
  const getJobInvitationsSent = (assessment: { id: string; jd_id?: string; jd_short_id?: string }) => {
    const fromListedRows = jobRowTotals.get(lineageKeyOf(assessment))?.invitations ?? 0;
    const lineageRows = assessment.jd_id ? assessmentLineages[assessment.jd_id] : undefined;
    const fromLineage = (lineageRows ?? []).reduce(
      (sum, row) => sum + (row.invitations_count ?? 0),
      0,
    );
    return Math.max(fromListedRows, fromLineage);
  };

  /**
   * The four figures a Job List row reports, in the order it shows them.
   *
   * `iconClass` is a global colour utility from app/globals.css - no value is
   * written here. Four families far enough apart to tell at a glance, which is
   * why brand-teal is not among them: at #099ab6 against brand-cyan's #079cc4
   * it is the same colour in a 16px glyph. Each carries its light and dark
   * value in the stylesheet, so no `dark:` variant is needed:
   *
   *   Job Versions  brand-blue   the job-version blue, as the version chips
   *                              in the panel below already use.
   *   Assessments   brand-cyan   the assessment cyan, from the same pair.
   *   Invitations   brand-orange outbound.
   *   Completed     menu-icon-activate - the palette's only green, and the one
   *                              a finished thing reads as. Named for the menu
   *                              action it was minted for; it is the token, not
   *                              a new colour.
   */
  const getJobRowMetrics = (
    assessment: {
      id: string;
      jd_id?: string;
      jd_short_id?: string;
      jd_version?: number;
    },
    /* Which bucketing to read. Defaults to the Job List's, so every existing
       call site is untouched; Send Invite passes its own so the figures on a
       picker row describe the assessments the picker is offering. */
    totalsByLineage: ReturnType<typeof buildJobRowTotals> = jobRowTotals,
  ) => {
    const totals = totalsByLineage.get(lineageKeyOf(assessment))
      ?? { assessments: 0, invitations: 0, completed: 0 };
    return [
      { key: 'job-versions', icon: Layers, iconClass: 'text-brand-blue', value: getJobVersionCount(assessment), label: 'Job Versions' },
      { key: 'assessments', icon: ClipboardList, iconClass: 'text-brand-cyan', value: totals.assessments, label: 'Assessments' },
      { key: 'invitations', icon: Send, iconClass: 'text-brand-orange', value: totals.invitations, label: 'Invitations Sent' },
      { key: 'completed', icon: ClipboardCheck, iconClass: 'text-menu-icon-activate', value: totals.completed, label: 'Completed' },
    ];
  };

  /**
   * The status pill a Job List row carries, for the job's representative
   * assessment.
   *
   * Lifted out of that row so the Send Invite picker's job headings can show
   * the same pill rather than a second set of colour branches — the page
   * already learned this lesson with `getJobRowMetrics`. The markup is the
   * row's, moved verbatim: same ring, same dot, same fixed-width box that
   * keeps the metric columns starting on one line whatever word is inside.
   */
  const renderJobStatusPill = (status?: string) => (
    <div className="flex-shrink-0 @4xl/job-row:w-[104px]">
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ring-1 ${
          status === 'Active'
            ? 'bg-green-100 text-green-700 ring-green-200'
            : status === 'Draft'
            ? 'bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20'
            : status === 'Archived'
            ? 'bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20'
            : status === 'Completed'
            ? 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20'
            : status === 'Paused'
            ? 'bg-slate-200 text-gray-600 ring-gray-300'
            : 'bg-slate-100 text-gray-700 ring-gray-200'
        }`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
        {status}
      </span>
    </div>
  );

  /**
   * ONE JOB, as the Total Jobs list draws it.
   *
   * Lifted verbatim out of the Total Jobs list view so the Send Invite picker
   * can render the same rows rather than a second job list of its own. There
   * is one copy of this markup; both surfaces call it, and neither can be
   * restyled without the other following.
   *
   * `selectMode` is the picker. It changes behaviour, never appearance:
   *
   *   - a radio joins the identity column, because the dialog sends to exactly
   *     one job and that is the control it already used to say so;
   *   - the row click SELECTS instead of toggling version history. View
   *     Versions still toggles it, so nothing is unreachable - the click just
   *     answers the question the dialog is asking;
   *   - Track and Result are dropped. Both leave the dialog - Result
   *     `router.push`es to another page and Track opens a popup over the open
   *     modal - so in a picker they are a way to lose the invite you came to
   *     send, not a feature. Everything that describes the job (chip, Job ID,
   *     title, status pill, all four metrics) is untouched, which is what the
   *     row is for here.
   *
   * `totals` picks which bucketing the metrics read; see `getJobRowMetrics`.
   */
  const renderJobListRow = (
    assessment: (typeof assessments)[number],
    {
      selectMode = false,
      selected = false,
      disabled = false,
      dimmed = false,
      totals,
      selectedAssessmentId,
      onSelectAssessment,
      activeSelection = null,
    }: {
      selectMode?: boolean;
      /** This job owns the current pick — a highlight, not a control. */
      selected?: boolean;
      /**
       * Truly inert — the job has nothing that can be invited against. A fact
       * about the data, not about what is currently selected.
       */
      disabled?: boolean;
      /**
       * Faded back because another job holds the selection. Still entirely
       * usable: opening it and picking an assessment replaces the selection,
       * which is how a choice is meant to change.
       */
      dimmed?: boolean;
      totals?: ReturnType<typeof buildJobRowTotals>;
      /** Panel selection, passed through. Defaults to the Job List's own
       *  per-job store, so the page's rows need not pass anything. */
      selectedAssessmentId?: string;
      onSelectAssessment?: (
        assessmentId: string,
        context: { jobVersion: number; jobVersionId?: string },
      ) => void;
      /** Highlights one job version + assessment pair inside the panel. */
      activeSelection?: { jobVersion: number; assessmentId: string } | null;
    } = {},
  ) => (
    <div
      key={assessment.id}
      /* The row is one JOB. On the Job List, clicking it opens
         that job's version history in place - the same thing the
         View Versions button beside it does, through the same
         handler, so the two can never disagree about what a
         click on this row means. In the picker it selects the
         job instead, which is the question that dialog is
         asking; View Versions still opens the history there.

         It used to navigate: to the representative assessment,
         or to the edit modal when that assessment was a Draft.
         Both were the row acting as ONE assessment, which is
         exactly what a job row is not - and it meant a recruiter
         scanning the list was taken off the page by a click they
         had aimed at a job. The assessments are still one step
         away, listed per job version inside the panel this now
         opens, each with its own row and its own actions.

         Gated on `hasVersionHistory` (the row having a `jd_id`),
         which is the same test the View Versions button renders
         on: a row with no job behind it has no history to open,
         and it drops the pointer cursor and the lift so it does
         not offer a click that would do nothing. */
      onClick={() => hasVersionHistory(assessment) && toggleAssessmentVersions(assessment)}
      /* `relative` only. The raised z-index this carried was
         for the row's own three-dot dropdown, which is gone -
         the menus that remain belong to the version panel's
         assessment rows and are keyed `version:<id>`, so they
         never matched this test anyway. */
      /* A CONTAINER, not a viewport reader. The row's wide layout used to be
         keyed on `xl:` - the browser window - which is true of the Job List
         (its row is about as wide as the window) and false of the Send Invite
         dialog, whose rows sit in a 768px modal however wide the screen is. On
         a desktop the modal's rows therefore took the wide layout and tried to
         fit four metric columns into ~100px: the icons, values and labels
         landed on top of each other and ran into View Versions.

         `@4xl` (896px) is measured against THIS row instead. The page's row
         clears it and is unchanged; the modal's row never does, so it takes
         the stacked layout the Job List itself uses on a narrow window - the
         same component answering the same question, against the width it has
         rather than the width the window has. */
      aria-disabled={disabled || undefined}
      className={`@container/job-row relative p-3 sm:p-4 bg-white dark:bg-slate-900 rounded-xl border ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 transition-all duration-150 ${
        selected
          ? 'border-brand-blue/40 ring-brand-blue/30 bg-brand-blue/[0.03]'
          : 'border-gray-300 dark:border-slate-700'
      } ${
        /* Two different states that used to be one.

           `disabled` is a fact about the job: it has no published assessment,
           so there is nothing here to send whatever the reader does. Inert.

           `dimmed` only means another job currently holds the selection. That
           is not a reason to bar this one - picking an assessment inside it is
           precisely how the selection is changed. It fades back so the chosen
           job stands out, and hover brings it fully forward again. Making this
           case inert too is what forced select → clear → navigate → select. */
        disabled
          ? 'opacity-45 grayscale-[0.35] pointer-events-none select-none'
          : `${dimmed ? 'opacity-60 hover:opacity-100' : ''} ${
              hasVersionHistory(assessment)
                ? 'cursor-pointer hover:border-brand-blue/30 hover:shadow-md hover:shadow-brand-blue/10 hover:-translate-y-0.5'
                : 'cursor-default'
            }`
      }`}
    >
      {/* One row = one JOB. The list has always collapsed to one
          row per job lineage (see `collapsedAssessments`); what
          the row now reports is that lineage's totals rather than
          only the representative assessment's own figures.

          Share / Track Invites / Results moved off the row. They
          act on ONE assessment, and a job row is not one
          assessment - they are rendered per version inside View
          Versions, which already carried them. */}
      <div className="flex flex-col gap-3 @4xl/job-row:flex-row @4xl/job-row:items-center @4xl/job-row:gap-4">
        {/* Identity - icon, Job ID, title */}
        <div className="flex items-center gap-2.5 min-w-0 @4xl/job-row:w-[360px] @4xl/job-row:flex-shrink-0">
          <div className="h-9 w-9 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg flex items-center justify-center flex-shrink-0">
            <Briefcase className="h-4 w-4 text-brand-blue" />
          </div>
          {assessment.jd_short_id && (
            /* The Job Openings chip, not the solid blue one this
               row used to carry - same JD id, one house style. */
            <JobIdBadge className="flex-shrink-0">{assessment.jd_short_id}</JobIdBadge>
          )}
          <h3
            className="text-sm font-medium text-gray-900 dark:text-slate-50 truncate min-w-0"
            title={assessment.job?.title || stripVersionFromTitle(assessment.title)}
          >
            {assessment.job?.title || stripVersionFromTitle(assessment.title)}
          </h3>
        </div>

        {/* Status of the job's newest assessment - the row's
            representative, unchanged from before. */}
        {/* Boxed to a fixed width so the metric columns start
            on the same line in every row - the pill's own width
            varies with the word inside it. Shared with the Send
            Invite picker's job headings via the helper. */}
        {renderJobStatusPill(assessment.status)}

        {/* Totals for the job. Two columns on a phone, four in a
            divided row once there is width for them. */}
        <div className="grid grid-cols-2 gap-x-2 gap-y-3 sm:grid-cols-4 sm:gap-x-0 sm:gap-y-0 @4xl/job-row:flex-1 @4xl/job-row:min-w-0">
          {getJobRowMetrics(assessment, totals).map(({ key, icon: MetricIcon, iconClass, value, label }) => (
            <div
              key={key}
              className="min-w-0 sm:px-3 sm:border-l sm:border-gray-100 dark:sm:border-slate-700/60 sm:first:border-l-0 sm:first:pl-0"
            >
              <div className="flex items-center gap-1.5">
                <MetricIcon className={`w-4 h-4 flex-shrink-0 ${iconClass}`} />
                <span className="text-sm font-semibold text-gray-900 dark:text-slate-50">{value}</span>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-slate-500 truncate mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div
          className="flex items-center gap-2 flex-shrink-0 self-start @4xl/job-row:self-auto @4xl/job-row:ml-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Trigger only - the panel it opens is untouched. */}
          {hasVersionHistory(assessment) && (
            <button
              type="button"
              onClick={(e) => {
                /* The row toggles the same panel, so the click is
                   stopped here rather than letting it bubble and
                   toggle twice - which would leave the panel shut
                   on the very click that asked for it. */
                e.stopPropagation();
                toggleAssessmentVersions(assessment);
              }}
              aria-expanded={openVersionsFor === assessment.id}
              title={openVersionsFor === assessment.id ? 'Hide version history' : 'View version history'}
              className={`h-8 px-3 inline-flex items-center gap-1.5 whitespace-nowrap border rounded-lg text-xs font-medium transition-all ${
                openVersionsFor === assessment.id
                  ? 'bg-brand-blue/10 text-brand-blue border-brand-blue/30'
                  : 'bg-white dark:bg-slate-900 text-brand-blue border-brand-blue/30 hover:bg-brand-blue/5'
              }`}
            >
              {openVersionsFor === assessment.id ? 'Hide' : 'View'} Versions
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform ${
                  openVersionsFor === assessment.id ? 'rotate-180' : ''
                }`}
              />
            </button>
          )}

          {/* Track - the assessment history of this job, read
              along its job versions: V3, V2, V1 down the popup,
              each naming the assessments built against it.

              Beside View Versions because the two answer
              neighbouring questions from the same two caches, and
              it opens them the same way: the panel is the working
              table with the per-assessment actions, this is the
              read-only overview - and the only one of the two
              that can show a version nothing was ever built for.

              Rendered on `hasVersionHistory` (a `jd_id`), the
              same test View Versions and the row click use, and
              ENABLED on the job having at least one invitation
              sent - see the gate below. The click is stopped so
              it does not also toggle the panel.

              Radar is the glyph Track Invites already uses on
              this page, so "track" reads the same wherever it
              appears; brand-cyan is the assessment colour, which
              is what this popup is about. */}
          {!selectMode && hasVersionHistory(assessment) && (() => {
            /* Gated on the JOB's invitations, per Job ID: the
               popup lists the invitations sent against this
               job's assessments, so with none sent it would
               open on an empty table. Greyed with the reason in
               its tooltip rather than dropped, which is how the
               Result button beside it and the per-assessment
               Track in the version panel both handle "nothing to
               show yet" - the row keeps its shape and says why.

               Each row asks this of its own lineage, so one job
               being invited says nothing about the next; and the
               count is re-read on every render from the reloaded
               list, so the first invitation sent for a job flips
               its own Track on and no other. */
            const invitationsSent = getJobInvitationsSent(assessment);
            const hasInvitations = invitationsSent > 0;
            const reason = hasInvitations
              ? `Track the assessments created for this job's versions (${invitationsSent} invitation${invitationsSent === 1 ? '' : 's'} sent)`
              : 'No invitations have been sent for this job yet';
            return (
              <button
                type="button"
                disabled={!hasInvitations}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!hasInvitations) return;
                  void handleTrackJob(assessment);
                }}
                className={`h-8 px-3 inline-flex items-center gap-1.5 whitespace-nowrap border rounded-lg text-xs font-medium transition-all ${
                  hasInvitations
                    ? 'bg-white dark:bg-slate-900 text-brand-cyan border-brand-cyan/30 hover:bg-brand-cyan/5'
                    : 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 text-gray-400 dark:text-slate-500 cursor-not-allowed'
                }`}
                aria-label={reason}
                title={reason}
              >
                <Radar className="w-3.5 h-3.5" />
                Track
              </button>
            );
          })()}

          {/* Result - the scores for the assessment this row
              represents (the job's newest, the same one the row
              click and the menu act on), on the page the
              per-assessment Results button already opens.

              Gated the way that button is: with no invitation
              sent there is no attempt to score, so the results
              page would open empty. It greys with the reason in
              its tooltip rather than disappearing, so the row
              keeps its shape and says why.

              brand-blue, which Results has always been on this
              page, against Track's cyan beside it. */}
          {!selectMode && (() => {
            const invitationsSent =
              assessment.invitations_count ?? assessment.candidates ?? 0;
            const hasBeenShared = invitationsSent > 0;
            const reason = hasBeenShared
              ? 'View results'
              : assessment.status === 'Draft'
                ? 'Publish the assessment to view results'
                : 'Share the assessment to view results';
            return (
              <button
                type="button"
                disabled={!hasBeenShared}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!hasBeenShared) return;
                  router.push(`/recruitment/assessments/${assessment.id}/results`);
                }}
                className={`h-8 px-3 inline-flex items-center gap-1.5 whitespace-nowrap border rounded-lg text-xs font-medium transition-all ${
                  hasBeenShared
                    ? 'bg-white dark:bg-slate-900 text-brand-blue border-brand-blue/30 hover:bg-brand-blue/5'
                    : 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 text-gray-400 dark:text-slate-500 cursor-not-allowed'
                }`}
                aria-label={reason}
                title={reason}
              >
                <BarChart className="w-3.5 h-3.5" />
                Result
              </button>
            );
          })()}

          {/* The eye moved onto the Job Versions panel's own
              heading - it reads the job's versions, so it sits on
              the table that lists them rather than in this
              cluster. See `headerAction` below. */}
        </div>
      </div>
      {/* Expanded in place, below the card's own content and
          across its full width — the version table needs the
          room, and hanging it off the right-hand action column
          would box it into a third of the card. Click is stopped
          here: a click on a version row must not bubble to the
          row behind it, which would collapse the panel it was
          aimed at. */}
      {openVersionsFor === assessment.id && assessment.jd_id && (() => {
        const jdId = assessment.jd_id!;
        /* The real, authoritative rows once loadAssessmentLineage's own fetch
           lands; the best-effort optimistic guess (see its own doc comment)
           until then, so the panel has something to show on first paint
           instead of a spinner. Every lookup below reads this one value, so
           the panel and its row actions never disagree about what's on
           screen. */
        const displayedRows = assessmentLineages[jdId] ?? getOptimisticAssessmentRows(jdId);
        const hasRowsToShow = !!assessmentLineages[jdId] || displayedRows.length > 0;
        return (
        <div onClick={(e) => e.stopPropagation()}>
          <AssessmentVersionHistoryPanel
            jobVersions={jdLineage.lineages[assessment.jd_id]}
            jobVersionDetails={jdLineage.versionDetails}
            assessments={displayedRows}
            /* The backend's per-version "has an assessment" index,
               read beside the rows - see the prop for why both. */
            jdsWithAssessments={jdsWithAssessments}
            loading={!hasRowsToShow && (!!loadingLineages[assessment.jd_id] || jdLineage.isLoading(assessment.jd_id))}
            currentAssessmentId={assessment.id}
            latestJobVersion={getLatestJobVersion(assessment)}
            /* Opened on the page the ROW's own status calls for -
               a Draft on the draft page, everything else on the
               details page. The row is found by ASSESSMENT id in
               the lineage, the same lookup `renderAction` makes,
               so two assessments on one job version each open
               themselves. */
            /* Read-only inside the picker. Each of these
               leaves the dialog - opening an assessment page,
               starting a new assessment, viewing a job version,
               or firing a per-version action - so in a modal
               whose whole job is "pick a job and continue" they
               are ways to lose the invite, not features. The
               panel still LISTS the versions, which is what
               View Versions is reached for. */
            onRowClick={selectMode ? undefined : (versionId) => {
              const raw = displayedRows.find((v) => v.id === versionId);
              openAssessment(raw ? mapAssessmentFromApi(raw, 0) : { id: versionId });
            }}
            /* Every version gets the card's own menu, keyed
               separately so opening one row's does not also open
               the card's for the same assessment. The lineage
               rows come back raw from the API, so they run
               through the list's own mapper first - the menu
               reads the mapped shape (status wording, the
               revoked-invites seal, the clone flags). */
            /* Selection, wherever this row is drawn. The Job List
               keeps its own per-job answer; Send Invite passes its
               own pair in, because there the choice IS the dialog's
               output. Same control either way - there is one place
               in this component tree that selects an assessment
               version, and it is the assessment table. */
            selectedAssessmentId={
              selectedAssessmentId !== undefined
                ? selectedAssessmentId
                : selectedAssessmentVersionByJob[assessment.jd_id!]
            }
            selectionGroupName={
              selectMode ? 'send-invite-assessment-version' : 'job-list-assessment-version'
            }
            activeSelection={activeSelection}
            /* The eye on an assessment row - the page's own preview modal,
               against the assessment that row IS. Same component the list's
               Preview action opens, so there is one assessment-details view
               in the app and this is it. */
            onViewAssessment={(version) => {
              const raw = displayedRows.find((v) => v.id === version.id);
              if (!raw) return;
              setSelectedAssessmentForPreview(mapAssessmentFromApi(raw, 0));
              setShowPreviewModal(true);
            }}
            onSelectAssessment={
              onSelectAssessment ??
              ((assessmentId) =>
                setSelectedAssessmentVersionByJob((current) => ({
                  ...current,
                  [assessment.jd_id!]: assessmentId,
                })))
            }
            onCreateAssessment={selectMode ? undefined : handleCreateAssessmentForJobVersion}
              headerAction={
              /* The job version details popup, pinned to the
                 table's top-right corner. Opens on the version
                 LIST, from which any one version can be read;
                 each row's own eye opens a single version
                 directly.

                 Gated on `jd_id` - a row with no job behind it
                 (the `__unlinked__` case) has no job to open,
                 and the panel simply gets no header control. */
              assessment.jd_id ? (
                <button
                  type="button"
                  onClick={(e) => {
                  e.stopPropagation();
                  openJobDetails(
                  assessment.jd_id!,
                  assessment.job?.title || stripVersionFromTitle(assessment.title),
                  );
                  }}
                  className="h-7 w-7 flex items-center justify-center bg-white dark:bg-slate-900 text-brand-blue border border-brand-blue/40 rounded-md hover:bg-brand-blue/10 hover:border-brand-blue transition-all flex-shrink-0"
                  aria-label="View job version details"
                  title="View job version details"
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>
              ) : undefined
            }
            /* Opens the same popup the header eye opens, landing on
               THIS version rather than on the version list. */
            /* The eye on a JOB VERSION row, in both surfaces. It opens
               `JDVersionHistoryModal` on that one version - the same popup
               the Total Jobs list's own Version History eye opens, through
               the same handler, so the dialog shows the job exactly as the
               page does rather than a second rendering of it. */
            onViewJobVersion={(jobVersionId, jobVersion) =>
              openJobDetails(
                jobVersionId,
                assessment.job?.title || stripVersionFromTitle(assessment.title),
                jobVersion,
              )
            }
            /* Invite / Track / Results and the same menu the card
               carries, against THIS row's assessment. The lineage
               rows come back raw from the API, so they run through
               the list's own mapper first - both helpers read the
               mapped shape (status wording, the revoked-invites
               seal, the clone flags). */
            /* The Total Jobs tab's own Actions column - same quick actions,
               same compact menu, same spacing, from the same two helpers.

               The Send Invite dialog takes none of them. Its assessment rows
               exist to be CHOSEN between, and Send / Track / Result each act
               on an assessment instead: Send opens a second share flow inside
               the one already running, Result navigates the page out from
               under the dialog, Track stacks a popup over it. The eye is the
               one control that answers "which of these am I picking?", so in
               the dialog the column holds that alone. */
            renderAction={selectMode ? undefined : (version) => {
              const raw = displayedRows.find((v) => v.id === version.id);
              if (!raw) return null;
              const mapped = mapAssessmentFromApi(raw, 0);
              return (
                <>
                  {renderAssessmentQuickActions(mapped)}
                  {renderAssessmentMenu(mapped, `version:${version.id}`, 'compact')}
                </>
              );
            }}
          />
        </div>
        );
      })()}
    </div>
  );

  /* How many JOBS the tenant has, for the Total Jobs summary card.

     `jobs` is the route's fetch of JD rows and holds one row per VERSION — a
     job republished twice is three rows in it — so `jobs.length` here would
     report versions while reading as a job count. `groupByLineage` is the
     shared helper the Job Openings list counts its own "Total Jobs" tile with
     (keyed on `job_id`, falling back to the row id), so the two pages cannot
     report different numbers of jobs for the same tenant.

     No new request: this is the list the page is already handed as a prop and
     already reads for the LATEST badge and the Position filter.

     Deliberately NOT the Job List heading's `assessmentResultCount` below,
     which counts the jobs that HAVE assessments and moves with the filters —
     a header tile answers "how many jobs are there", which is this. */
  const totalJobs = groupByLineage(jobs).size;

  /* Candidates who have actually SAT an assessment, from the same
     /assessments/stats response the Total and Active figures come from — one
     request, already in flight on mount, so this card adds no fetch of its own
     and cannot drift from the other two.

     `total_candidates_completed` first because it is the endpoint's explicit
     completion-only figure where it is sent, then `total_candidates_tested`,
     which is the required field the basic stats endpoint always returns and is
     the same population (it reconciles as total_passed + total_failed). Read
     in that order rather than either alone: the optional field is undefined on
     the basic endpoint, and reading only it is what would show 0 here.

     Deliberately NOT summed from `assessments[].completed_count`: that list is
     narrowed server-side by the active tab and the search box, so on the Draft
     tab this card would report the draft rows' candidates instead of the
     account's. All three remaining cards read the account-wide stats for that
     reason. */
  const candidatesAssessed =
    stats.total_candidates_completed || stats.total_candidates_tested || 0;

  const visibleAssessments = collapsedAssessments.slice(
    (assessmentCurrentPage - 1) * assessmentItemsPerPage,
    assessmentCurrentPage * assessmentItemsPerPage
  );
  const activeTabOwnsListContent =
    isFlatAssessmentTab(activeTab) ||
    ['completed-candidates', 'audit', 'consent', 'invitation-status', 'settings'].includes(activeTab);

  /* No rows on screen for a tab that lists assessments — whether the tenant
     has none of that kind or a search narrowed them away. The "Job List (0)"
     heading and the list/grid toggle then have nothing to count or switch
     between, so the tab drops both and shows only its empty state. The search
     toolbar stays: it lives above the card and is the way out of a narrowed
     zero, alongside the Reset in the empty state itself.

     `!isLoading` so the heading does not blink out and back while the first
     page is still arriving. */
  const assessmentListEmpty = !activeTabOwnsListContent
    && !isLoading
    && filteredAssessments.length === 0;

  /* What the empty state says, per tab. One place, because the message is the
     only thing that differs between them — every tab renders the same shared
     ListEmptyState around it.

     Only the tabs where creating an assessment would actually fill the tab
     carry the Create action: a new assessment lands in Draft (and in All and
     Total Jobs), never in Archived, so offering it on Archived would answer a
     question nobody asked. Active is the same story one step on — a draft has
     to be published, not created, to show up there. */
  const assessmentEmptyCopy = (): { title: string; description: string; canCreate: boolean } => {
    switch (activeTab) {
      case 'archived':
        return {
          title: 'No archived assessments found.',
          description: 'Assessments you archive will appear here.',
          canCreate: false,
        };
      case 'draft':
        return {
          title: 'No draft assessments',
          description: 'Assessments you save without publishing appear here.',
          canCreate: true,
        };
      case 'active':
        return {
          title: 'No active assessments',
          description: 'Publish a draft assessment and it appears here, ready for invites.',
          canCreate: false,
        };
      case 'jobs':
        return {
          title: 'No jobs with assessments yet',
          description: 'Create an assessment against a job and that job appears here.',
          canCreate: true,
        };
      default:
        return {
          title: 'No assessments yet',
          description: 'Create your first AI-powered assessment to start evaluating candidates.',
          canCreate: true,
        };
    }
  };

  const assessmentPaginationVisible = !activeTabOwnsListContent && assessmentResultCount > 5;
  const assessmentStartIndex = assessmentResultCount === 0 ? 0 : (assessmentCurrentPage - 1) * assessmentItemsPerPage + 1;
  const assessmentEndIndex = Math.min(assessmentCurrentPage * assessmentItemsPerPage, assessmentResultCount);
  const trackingPaginationVisible = trackingTotalPages > 1;
  const trackingStartIndex = trackingTotalItems === 0 ? 0 : (trackingCurrentPage - 1) * INVITATIONS_PAGE_SIZE + 1;
  const trackingEndIndex = Math.min(trackingCurrentPage * INVITATIONS_PAGE_SIZE, trackingTotalItems);
  const trackingHasActiveFilters =
    trackingFilters.search.trim() !== '' ||
    trackingFilters.status !== 'all' ||
    trackingFilters.dateFrom !== '' ||
    trackingFilters.dateTo !== '';
  const trackingResultsLabel = trackingHasActiveFilters
    ? `${trackingTotalItems} matching invite${trackingTotalItems === 1 ? '' : 's'}`
    : `Showing ${trackingStartIndex} to ${trackingEndIndex} of ${trackingTotalItems} invites`;

  /**
   * Two different loading states in the tracking popup, because they have to
   * look different.
   *
   * The popup has NOTHING to show yet (first open, or a filter that emptied
   * it): the centred spinner is the whole body, which is right - there is no
   * content for it to sit over.
   *
   * The popup already HAS rows and is re-reading them (Refresh, a page turn, a
   * filter change): the rows stay exactly where they are and the spinner rides
   * over them. Swapping a full table for a `py-12` spinner is what made
   * Refresh shake the dialog - the body collapsed to about a tenth of its
   * height, the content-driven dialog shrank with it and re-centred, then grew
   * back a moment later when the rows returned. The rows never leave now, so
   * there is nothing to collapse.
   */
  const trackingHasRows = trackingInvitations.length > 0;
  const showTrackingInitialLoader = isLoadingInvitations && !trackingHasRows;
  const showTrackingRefreshVeil = isLoadingInvitations && trackingHasRows;

  /**
   * The per-assessment three-dot menu, as ONE definition.
   *
   * Lifted out of the list card so the version panel's rows can carry the
   * same menu. That is not a nicety: Duplicate is gated to V1, and the list
   * now shows only each assessment's latest version - so with the menu on the
   * card alone, a lineage sitting at V2 would have no reachable Duplicate at
   * all. Sharing one definition also keeps the publish-state, permission,
   * revoked-invites and version-cap gates in a single place, where a change
   * to any of them cannot land on one surface and miss the other.
   *
   * `menuKey` is what the open/closed state is keyed on, NOT the assessment
   * id: an expanded lineage puts the same assessment on screen twice (the
   * card is the latest version, and the panel lists that version too), and
   * keying on the id alone opened both dropdowns at once.
   */
  const QUICK_ACTION_BASE =
    'h-7 w-7 flex items-center justify-center bg-white dark:bg-slate-900 border rounded-md transition-all';
  const QUICK_ACTION_DISABLED =
    'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 text-gray-400 dark:text-slate-500 cursor-not-allowed';

  /* `variant` is the trigger's chrome, not its behaviour:
       'default' — the borderless 32px button the Job List row carries;
       'compact' — the 28px bordered square the Assessment Versions table's
                   Share / Track / Result icons use, so the menu sits in that
                   Action column as a fourth peer rather than an odd one out.
     No `ml-auto` on the wrapper any more. Inside a content-width action
     cluster it did nothing; inside the version table's Action cell it pushed
     the menu to the far edge, away from the three icons it belongs with. */
  const renderAssessmentMenu = (
    assessment: any,
    menuKey: string = assessment.id,
    variant: 'default' | 'compact' = 'default',
  ) => (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      {/* Three Dots Menu */}
      <div className="relative">
        <button
          data-assessment-menu-trigger
          onClick={(e) => {
            e.stopPropagation();
            const willOpen = openMenuId !== menuKey;
            if (willOpen) {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setMenuDropUp(window.innerHeight - rect.bottom < 280);
              setMenuAnchor({ top: rect.top, bottom: rect.bottom, right: rect.right });
            }
            setOpenMenuId(willOpen ? menuKey : null);
          }}
          aria-label="More actions"
          title="More actions"
          className={
            variant === 'compact'
              ? `${QUICK_ACTION_BASE} text-gray-600 dark:text-slate-300 border-gray-300 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 hover:border-gray-400`
              : 'p-2 bg-white rounded-lg hover:bg-gray-50 transition-all'
          }
        >
          <MoreVertical className={variant === 'compact' ? 'w-3.5 h-3.5' : 'w-4 h-4 text-gray-600'} />
        </button>

      {/* Dropdown Menu */}
      {openMenuId === menuKey && menuAnchor && typeof document !== 'undefined' && createPortal(
          <div
            ref={openMenuRef}
            /* `fixed` and portalled to <body>, not `absolute`
               in the row. In the version panel this menu's
               cell sits inside the table's `overflow-x-auto`
               box, and overflow clipping is not something
               z-index can escape - the menu would be sliced
               off at the column edge. Placed from the
               trigger's own rect, which the click already
               measures for the drop-up decision. The menu
               closes on any scroll or resize (see the
               dismissal effect), so these coordinates cannot
               go stale while it is open. */
            className="fixed w-52 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-[9999] max-h-[70dvh] overflow-y-auto"
            style={{
              top: menuDropUp ? undefined : menuAnchor.bottom + 4,
              bottom: menuDropUp ? Math.max(8, window.innerHeight - menuAnchor.top + 4) : undefined,
              // Right-aligned to the trigger, as `right-0`
              // used to do, and kept clear of the viewport.
              left: Math.max(8, menuAnchor.right - 208),
            }}
          >
            {assessment.status !== 'Archived' && canCreateAssessment && (() => {
              // Gating computed FRONT-END, on the lineage this page has
              // actually loaded, so it does not depend on which of the
              // backend's clone_* flags a deployment happens to return.
              // Two reasons to disable, and only two:
              //   1. Draft → must publish this version first.
              //   2. Cap reached → the lineage already holds
              //      MAX_ASSESSMENT_VERSIONS versions, so there is no next
              //      sequential version to mint.
              //
              // What is deliberately NOT a reason any more:
              //
              //   - version > 1. Duplicate now walks the lineage forward
              //     from whichever version it is invoked on (V2 → V3,
              //     V3 → V4, V4 → V5), so gating it to V1 would stop the
              //     chain at V2.
              //   - `clone_button_disabled` / `clone_cap_reached` from the
              //     API. Both encode the OLD rules — "only V1" and a cap of
              //     3 — so honouring them would re-impose exactly the two
              //     limits this flow replaces. They stay on the mapped
              //     record for other readers; they just do not gate here.
              const isDraft = assessment.status === 'Draft';
              const capReached = isVersionCapReached(assessment);
              const buttonDisabled = isDraft || capReached;
              const disabledReason = isDraft
                ? 'Publish the assessment before duplicating.'
                : capReached
                ? `Maximum ${MAX_ASSESSMENT_VERSIONS} versions reached. Archive a version to duplicate again.`
                : '';
              return (
                <button
                  onClick={() => {
                    if (buttonDisabled) return;
                    setOpenMenuId(null);
                    handleOpenCloneModal(assessment);
                  }}
                  disabled={buttonDisabled}
                  title={disabledReason || undefined}
                  className={`group w-full px-4 py-2.5 text-sm flex items-center gap-2 transition-colors ${
                    buttonDisabled
                      ? 'text-gray-400 cursor-not-allowed'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Copy className={`w-4 h-4 flex-shrink-0 ${buttonDisabled ? 'text-gray-300' : 'text-menu-icon-download'}`} />
                  <span className={MENU_ITEM_SCALE_CLASS}>Duplicate</span>
                </button>
              );
            })()}
            {assessment.status === 'Active' && canUpdateAssessment && (() => {
              // Revoke is only meaningful once at least one invite
              // exists, AND only once. After a recruiter has already
              // revoked invites on this assessment the action is
              // sealed — they'd duplicate the assessment to start
              // a fresh invite round, not re-run revoke.
              const hasInvites = (assessment.invitations_count || 0) > 0;
              const alreadyRevoked = !!assessment.has_revoked_invites;
              const revokeDisabled = !hasInvites || alreadyRevoked;
              const revokeReason = !hasInvites
                ? 'No invites have been sent yet.'
                : alreadyRevoked
                ? 'Invites for this assessment have already been revoked.'
                : undefined;
              return (
                <button
                  onClick={() => {
                    if (revokeDisabled) return;
                    setOpenMenuId(null);
                    handleOpenRevokeModal(assessment);
                  }}
                  disabled={revokeDisabled}
                  title={revokeReason}
                  className={`group w-full px-4 py-2.5 text-sm flex items-center gap-2 transition-colors ${
                    revokeDisabled
                      ? 'text-gray-400 cursor-not-allowed'
                      : 'text-red-700 hover:bg-red-50'
                  }`}
                >
                  <Ban className={`w-4 h-4 flex-shrink-0 ${revokeDisabled ? 'text-gray-300' : ''}`} />
                  <span className={MENU_ITEM_SCALE_CLASS}>Revoke pending invites</span>
                </button>
              );
            })()}
            <div className="border-t border-gray-100 my-1"></div>
            {/* Draft assessments hide Activate/Archive — drafts
                go through the configure-page Publish button,
                and an unpublished row has nothing meaningful
                to archive. */}
            {canUpdateAssessment && assessment.status !== 'Active' && assessment.status !== 'Draft' && (
              <button
                onClick={() => handleActivateAssessment(assessment.id)}
                className="group w-full px-4 py-2.5 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 flex items-center gap-2 transition-colors"
              >
                <Play className="w-4 h-4 text-menu-icon-activate flex-shrink-0" />
                <span className={MENU_ITEM_SCALE_CLASS}>Activate</span>
              </button>
            )}
            {assessment.status !== 'Archived' && assessment.status !== 'Draft' && (
            <button
              onClick={() => {
                if (!canDeleteAssessment) {
                  toast.error('You do not have permission to archive assessments');
                  return;
                }
                handleArchiveAssessment(assessment.id);
              }}
              disabled={!canDeleteAssessment}
              title={!canDeleteAssessment ? 'You do not have permission to archive assessments' : ''}
              className={`group w-full px-4 py-2.5 text-sm flex items-center gap-2 ${
                !canDeleteAssessment
                  ? 'text-gray-400 cursor-not-allowed opacity-60'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Archive className="w-4 h-4 text-menu-icon-archive flex-shrink-0" />
              <span className={MENU_ITEM_SCALE_CLASS}>Archive</span>
            </button>
            )}
            {assessment.status !== 'Archived' && (
              <div className="border-t border-gray-100 dark:border-slate-700/60 my-1"></div>
            )}
            {assessment.status !== 'Archived' && (hasPermission('canDeleteAssessments') || isTenantAdmin) && (() => {
              const hasCandidates = assessment.invitations_count > 0;
              const isDisabled = !canDeleteAssessment || hasCandidates;
              const disabledReason = !canDeleteAssessment
                ? 'You do not have permission to delete assessments'
                : hasCandidates
                  ? 'Cannot delete — candidates have already been invited to this assessment'
                  : '';
              return (
                <button
                  onClick={() => {
                    if (isDisabled) {
                      toast.error(disabledReason);
                      return;
                    }
                    handleDeleteAssessment(assessment.id);
                  }}
                  disabled={isDisabled}
                  title={disabledReason}
                  className={`group w-full px-4 py-2.5 text-sm flex items-center gap-2 ${
                    isDisabled
                      ? 'text-gray-400 cursor-not-allowed opacity-60'
                      : 'text-red-600 hover:bg-red-50'
                  }`}
                >
                  <Trash2 className="w-4 h-4 flex-shrink-0" />
                  <span className={MENU_ITEM_SCALE_CLASS}>Delete</span>
                </button>
              );
            })()}
          </div>,
          document.body,
        )}
    </div>
    </div>
  );

  /**
   * Invite / Track / Results for one assessment, as ONE definition.
   *
   * Lifted out of the list card so the Job Version History rows can offer
   * the same three actions against the assessment of THEIR job version. The
   * gates travel with them - publish state, the archived and revoked-invites
   * seals, the permission check, and the invite count that decides whether
   * Track appears at all - so a change to any of them cannot land on the card
   * and miss the history, or the other way round.
   */
  /* Icon-only, on the Assessment Versions table's Action column — its only
     caller. The chrome is the job-openings row's icon-button (that page is the
     house reference for this control): a 28px square, the action's own colour
     at /40 on the border, hovering to a /10 tint and a solid border. Colours
     come from the dashboard's own action palette — Share is `--menu-icon-share`
     (brand-teal), and Results keeps the brand-blue it has always been.

     Every handler, guard, toast and disabled rule below is unchanged; only the
     label moved into `aria-label`/`title`, which now carry it for both screen
     readers and hover. */
  const renderAssessmentQuickActions = (assessment: ReturnType<typeof mapAssessmentFromApi>) => {
    /* The create -> share -> track/results chain, read off the record itself.
     *
     * `invitations_count` is the backend's own count of invitations sent for
     * this assessment (AssessmentResponse.invitations_count, surfaced by
     * mapAssessmentFromApi as both `invitations_count` and `candidates`), so
     * "has it been shared with anyone" is answered by the data rather than by
     * any local flag. Zero means nobody has been invited yet, which is what
     * gates Track and Results below. */
    const invitationsSent = assessment.invitations_count ?? assessment.candidates ?? 0;
    const hasBeenShared = invitationsSent > 0;

    return (
    <div className="flex items-center gap-1.5 flex-nowrap">
      {/* Share via Email.
          Every row in this table IS a created assessment, so the "created
          successfully" precondition is met by definition. What decides whether
          a created assessment can be shared is unchanged: a Draft has nothing
          published to send, an Archived one is out of circulation, and one
          whose invites were revoked is sealed until it is duplicated. */}
      {(hasPermission('canUpdateAssessments') || isTenantAdmin) && (() => {
        const shareBlockedReason =
          assessment.status === 'Draft' ? 'Publish assessment first to share' :
          assessment.status === 'Archived' ? 'Archived assessments cannot be shared' :
          assessment.has_revoked_invites ? 'Invites for this assessment have been revoked. Duplicate it to start fresh.' :
          '';
        const isShareBlocked = !!shareBlockedReason;
        return (
          <button
            onClick={() => {
              if (assessment.status === 'Draft') {
                toast.warning('Please publish the assessment before sharing');
                return;
              }
              if (assessment.status === 'Archived') {
                toast.warning('Archived assessments cannot be shared');
                return;
              }
              if (assessment.has_revoked_invites) {
                toast.warning('Invites for this assessment have been revoked. Duplicate it to start fresh.');
                return;
              }
              setSelectedAssessmentForShare(assessment);
              setShowShareModal(true);
            }}
            disabled={isShareBlocked}
            className={`${QUICK_ACTION_BASE} ${
              isShareBlocked
                ? QUICK_ACTION_DISABLED
                : 'text-brand-teal border-brand-teal/40 hover:bg-brand-teal/10 hover:border-brand-teal'
            }`}
            aria-label={shareBlockedReason || 'Share via email'}
            title={shareBlockedReason || 'Share via email'}
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        );
      })()}

      {/* Track Invites — enabled once the assessment has been shared with at
          least one candidate. It used to be omitted entirely at zero
          invitations, which left the Action column a control short and gave the
          reader nothing to explain why; it is now always present and disabled
          until there is something to track. */}
      <button
        onClick={() => handleTrackInvites(assessment)}
        disabled={!hasBeenShared}
        className={`${QUICK_ACTION_BASE} ${
          hasBeenShared
            ? 'text-brand-cyan border-brand-cyan/40 hover:bg-brand-cyan/10 hover:border-brand-cyan'
            : QUICK_ACTION_DISABLED
        }`}
        aria-label={hasBeenShared ? `Track invitation status (${invitationsSent})` : 'Share the assessment to track invitations'}
        title={hasBeenShared ? `Track invitation status (${invitationsSent})` : 'Share the assessment to track invitations'}
      >
        <Radar className="w-3.5 h-3.5" />
      </button>

      {/* View Results — also gated on having been shared: with no invitation
          sent there is no attempt to score, so the results page would open
          empty. This subsumes the old Draft-only check (a Draft cannot have
          been shared, so it fails this test too) while additionally covering a
          published assessment nobody has been invited to yet. The Draft
          early-return in the handler is kept as a belt. */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (assessment.status === 'Draft') return;
          router.push(`/recruitment/assessments/${assessment.id}/results`);
        }}
        disabled={!hasBeenShared}
        aria-label={
          hasBeenShared
            ? 'View results'
            : assessment.status === 'Draft'
            ? 'Publish the assessment to view results'
            : 'Share the assessment to view results'
        }
        title={
          hasBeenShared
            ? 'View results'
            : assessment.status === 'Draft'
            ? 'Publish the assessment to view results'
            : 'Share the assessment to view results'
        }
        className={`${QUICK_ACTION_BASE} ${
          hasBeenShared
            ? 'text-brand-blue border-brand-blue/40 hover:bg-brand-blue/10 hover:border-brand-blue'
            : QUICK_ACTION_DISABLED
        }`}
      >
        <BarChart className="w-3.5 h-3.5" />
      </button>
    </div>
    );
  };

  return (
    <main ref={rootRef} className="flex-1 overflow-x-clip bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
        <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Assessments' }]} />
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <div className="flex items-start gap-3">
            <div className="hidden sm:flex w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 items-center justify-center shrink-0">
              <ClipboardList className="w-4 h-4 text-brand-blue" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl text-gray-900 dark:text-slate-50 mb-0.5 tracking-tight font-semibold">Assessment Management</h1>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400">
                Create and manage skill assessments for candidates
              </p>
              {/* JD Filter Indicator */}
              {preSelectedJdId && preSelectedJdTitle && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="inline-flex items-center gap-2 bg-brand-blue/5 text-brand-blue px-3 py-1.5 rounded-lg ring-1 ring-brand-blue/20">
                    <Info className="w-4 h-4" />
                    <span className="text-sm font-medium">Filtered by JD: {preSelectedJdTitle}</span>
                    <button
                      onClick={() => router.push('/recruitment/assessments')}
                      className="ml-1 hover:bg-brand-blue/10 rounded p-0.5 transition-colors"
                      aria-label="Clear filter" title="Clear filter"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Assessment Quota Badge with color coding - use stats.units_consumed for consistency */}
            {totalUnits > 0 && (
              <QuotaBadge
                label="Assessment Quota"
                availableUnits={availableUnits}
                totalUnits={totalUnits}
                isUnlimited={isUnlimited}
              />
            )}
            {canAccessHRQuestionBank && (
              <button
                onClick={() => {
                  // Tells the question bank which module to name in its breadcrumb.
                  try { sessionStorage.setItem('questionBankSource', 'assessments'); } catch { /* ignore */ }
                  router.push('/recruitment/hr-question-bank');
                }}
                className="flex items-center gap-1.5 border border-brand-blue/30 text-brand-blue bg-white dark:bg-slate-900 px-3 py-2 rounded-lg hover:bg-brand-blue/5 transition-colors shadow-sm text-sm"
              >
                <ClipboardList className="w-4 h-4" />
                <span className="hidden sm:inline">HR Question Bank</span>
                <span className="sm:hidden">Questions</span>
              </button>
            )}
            {/* Send Invite — same permission as the per-row Share action. */}
            {(hasPermission('canUpdateAssessments') || isTenantAdmin) && (
              <button
                onClick={handleSendInvite}
                disabled={shareableAssessments.length === 0}
                title={
                  shareableAssessments.length === 0
                    ? 'Publish an assessment before inviting candidates'
                    : 'Send an assessment invitation'
                }
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors shadow-sm text-sm border ${
                  shareableAssessments.length === 0
                    ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                    : 'border-brand-blue/30 text-brand-blue bg-white dark:bg-slate-900 hover:bg-brand-blue/5'
                }`}
              >
                <Mail className="w-4 h-4" />
                <span className="hidden sm:inline">Send Invite</span>
                <span className="sm:hidden">Invite</span>
              </button>
            )}
            {onOpenCandidateView && (
              <button
                onClick={onOpenCandidateView}
                className="flex items-center gap-1.5 border border-brand-blue/30 text-brand-blue bg-white dark:bg-slate-900 px-3 py-2 rounded-lg hover:bg-brand-blue/5 transition-colors shadow-sm text-sm"
              >
                <Eye className="w-4 h-4" />
                Preview Candidate View
              </button>
            )}
            {(hasPermission('canCreateAssessments') || isTenantAdmin) && (
              <button
                onClick={() => {
                  if (!canCreateAssessment) {
                    toast.error('You do not have permission to create assessments');
                    return;
                  }
                  handleOpenCreation();
                }}
                disabled={!canCreateAssessment || (!isUnlimited && totalUnits > 0 && (totalUnits - stats.units_consumed) <= 0)}
                title={!canCreateAssessment ? 'You do not have permission to create assessments' : (!isUnlimited && totalUnits > 0 && (totalUnits - stats.units_consumed) <= 0 ? 'No assessment units available' : '')}
                className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg transition-all shadow-md text-sm ${
                  !canCreateAssessment || (!isUnlimited && totalUnits > 0 && (totalUnits - stats.units_consumed) <= 0)
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-60 shadow-none'
                    : 'bg-brand-blue hover:bg-brand-blue-2 text-white shadow-brand-blue/25 ring-1 ring-white/10'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                <span className="hidden sm:inline">Create Assessment</span>
                <span className="sm:hidden">Create</span>
              </button>
            )}
          </div>
        </div>

        {/* Low Quota Warning Banner */}
        {!isUnlimited && availableUnits !== null && availableUnits > 0 && availableUnits <= 3 && (
          <div className="mb-4 sm:mb-6 bg-amber-50 border border-amber-300 rounded-lg p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-amber-800 mb-0.5">Low Assessment Quota</h3>
                <p className="text-sm text-amber-700">
                  You have only <span className="font-semibold">{availableUnits}</span> assessment unit{availableUnits !== 1 ? 's' : ''} remaining out of {totalUnits}.
                  {' '}Consider purchasing add-on credits to avoid interruptions.
                </p>
              </div>
              <button
                onClick={() => window.location.href = '/subscription/usage-quotas'}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors flex-shrink-0"
              >
                Add Credits
              </button>
            </div>
          </div>
        )}

        {/* Quota Exhausted Banner — only show when units were actually consumed */}
        {!isUnlimited && availableUnits !== null && availableUnits <= 0 && stats.units_consumed > 0 && (
          <div className="mb-4 sm:mb-6 bg-red-50 border border-red-300 rounded-lg p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <Lock className="w-4 h-4 text-red-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-red-800 mb-0.5">Assessment Quota Exhausted</h3>
                <p className="text-sm text-red-700">
                  You have used all {totalUnits} assessment units in your current plan. Purchase add-on credits or upgrade your plan to create more assessments.
                </p>
              </div>
              <button
                onClick={() => window.location.href = '/subscription/usage-quotas'}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors flex items-center gap-2 flex-shrink-0"
              >
                <Plus className="w-4 h-4" />
                Add Credits
              </button>
            </div>
          </div>
        )}

        {/* Summary — the shared StatsCard / StatsCardGrid from
            /recruitment/job-openings (the master reference those tokens were
            extracted from), the same `space-y-3 sm:space-y-4 mb-4 sm:mb-6`
            shell, the same neutral tone, `sparkline={false}` and
            `showClickArrow` on every card, and the same click-through into the
            list. Card design, tokens and spacing are untouched; only the
            metrics and the tab each one opens changed.

            Five cards, so the grid is on `columns={5}` — the shared
            1-up / 2-up / 3-up / 5-up ladder, which is what keeps a five-card
            row from leaving one orphan tile on its own line. Nothing else
            about the row changed: same shell, same gaps, same tone.

            Every card stays on THIS page: each selects a tab and reveals the
            list, so the row is five ways into one screen.

            Each card opens the tab that shows the rows it counts:

              Total Jobs          -> the Total Jobs tab, which is the
                                     job-grouped list. `totalJobs`, the
                                     distinct job lineages in the `jobs` prop
                                     — see its derivation above. It leads the
                                     row for the same reason its tab leads the
                                     tab strip: the job is what an assessment
                                     hangs off, so it is the widest of these
                                     counts.
              Total Assessments   -> the All Assessments tab.
                                     `stats.total_assessments`.
              Active Assessments  -> the Active tab. `stats.active_assessments`,
                                     the backend's count of `published` rows —
                                     the SAME status
                                     the embedded list requests, so the card and
                                     the tab it opens cannot report different
                                     numbers.
              Draft Assessments   -> the Draft tab. `stats.draft_assessments`,
                                     against that tab's `status: 'draft'`
                                     request — the same construction, so the
                                     same guarantee.
              Candidates Assessed -> the Candidate Results tab, which lists the
                                     completed attempts across every
                                     assessment. `candidatesAssessed`, derived
                                     above.

            The All, Active and Draft tabs render the flat one-row-per-
            assessment table in this page. Candidate Results keeps its aggregate
            result table here as well. The Total Jobs tab remains the
            job-grouped list.

            No new endpoint: the four assessment figures come from the single
            `assessmentService.getStats()` call this page already makes on mount
            (and re-makes through `reloadStats`), and the job count is derived
            from the `jobs` prop the route already fetched. Nothing here is a
            literal.

            Icons come from the vocabulary already in use — `Briefcase` is what
            the Job Openings list marks its own Total Jobs card with, `Users` is
            what this page marks candidate results with, `Globe` is what the
            sibling AI Interviews overview marks its "Active / published & live"
            card with, and `Pencil` is this page's own edit-a-draft icon, which
            is what a draft assessment is: one still being written. (The tab
            pills these cards open are text-only, so none of this is shared
            with them.) */}
        <div className="space-y-3 sm:space-y-4 mb-4 sm:mb-6">
          <StatsCardGrid columns={5}>
            {/* Total Jobs — the count of jobs this tenant has, opening the
                job-grouped Total Jobs tab, which is the list those jobs are
                the rows of. Same shared StatsCard as the four beside it, on the
                same neutral tone with `sparkline={false}` and `showClickArrow`,
                so it is the row's fifth card rather than a card of its own
                kind. `isLoadingStats` is deliberately NOT read here: this value
                does not come from the stats request, and the route holds its
                own spinner until `jobs` has landed, so the number is real on
                first paint. */}
            <StatsCard
              tone="neutral"
              active={isOverviewCardActive('jobs')}
              showClickArrow
              icon={Briefcase}
              label="Total Jobs"
              value={totalJobs.toLocaleString()}
              sparkline={false}
              onClick={() => openAssessmentsList('jobs')}
            />
            {/* Total Assessments now opens the All Assessments TAB on this page
                rather than routing to /recruitment/assessments/all. That route
                still exists and still works if opened directly — nothing about
                it changed; this card simply no longer leaves the page to reach
                it. */}
            <StatsCard
              tone="neutral"
              active={isOverviewCardActive('all')}
              showClickArrow
              icon={FileText}
              label="Total Assessments"
              value={isLoadingStats ? '...' : stats.total_assessments.toLocaleString()}
              sparkline={false}
              onClick={() => openAssessmentsList('all')}
            />
            <StatsCard
              tone="neutral"
              active={isOverviewCardActive('active')}
              showClickArrow
              icon={Globe}
              label="Active Assessments"
              value={isLoadingStats ? '...' : stats.active_assessments.toLocaleString()}
              sparkline={false}
              onClick={() => openAssessmentsList('active')}
            />
            {/* Draft Assessments, third: it sits beside Active because the two
                are the same split of the Total above them — Active + Draft is
                how that figure divides — and reading them apart would make the
                row three unrelated numbers and one pair.

                `stats.draft_assessments` was already in this page's stats state
                and already mapped from the same /assessments/stats response the
                other figures come from; it had simply never been rendered. So
                this card adds no request, and it cannot disagree with the tab
                it opens: the Draft tab asks the API for `status: 'draft'` (see
                `getAssessmentStatusFilter`), which is what the backend counts
                here. */}
            <StatsCard
              tone="neutral"
              active={isOverviewCardActive('draft')}
              showClickArrow
              icon={Pencil}
              label="Draft Assessments"
              value={isLoadingStats ? '...' : stats.draft_assessments.toLocaleString()}
              sparkline={false}
              onClick={() => openAssessmentsList('draft')}
            />
            <StatsCard
              tone="neutral"
              active={isOverviewCardActive('completed-candidates')}
              showClickArrow
              icon={Users}
              label="Candidates Assessed"
              value={isLoadingStats ? '...' : candidatesAssessed.toLocaleString()}
              sparkline={false}
              onClick={() => openAssessmentsList('completed-candidates')}
            />
          </StatsCardGrid>
        </div>

        {pageView === 'list' && (
        <>
        <div ref={listSectionRef} className="scroll-mt-4" aria-hidden="true" />

        {/* Search + filters, ABOVE the tabs. Still gated to the tabs that
            list assessments — the log, consent and settings tabs bring their
            own controls, and Candidate Results has its own table — so on
            those the toolbar is absent rather than inert. Same ListToolbar,
            same panel, same handlers; only its position moved. */}
          {!activeTabOwnsListContent && (
            <div className="mb-4">
              <ListToolbar
                searchValue={assessmentListSearch.query}
                // The hook debounces (350ms) into `appliedQuery` before the
                // request, so the toolbar hands keystrokes straight through.
                searchDebounceMs={0}
                onSearchChange={assessmentListSearch.setQuery}
                searchPlaceholder="Search by assessment name, ID or description..."
                onToggleFilters={() => setShowAssessmentFilters(!showAssessmentFilters)}
                filtersOpen={showAssessmentFilters}
                activeFilterCount={assessmentFilterCount}
                filtersApplied={assessmentFiltersActive}
                onClearFilters={clearAssessmentFilters}
                className="mb-0"
                countBadge={
                  <ListCountBadge
                    filtered={filteredAssessments.length}
                    total={assessments.length}
                    noun="job"
                  />
                }
              />

              {showAssessmentFilters && (
                <div className="mt-3 rounded-xl border border-gray-100 dark:border-slate-700/60 bg-slate-50/60 dark:bg-slate-800/30 p-3 sm:p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    {/* Position — first, because it is the widest cut of the
                        list and the one a recruiter reaches for before
                        narrowing by type or author. Commits on change like
                        every other control in this panel (Done just closes
                        it), so it needs no Apply of its own. */}
                    <SearchableSelect
                      label="Position"
                      value={filterPosition}
                      onChange={(value) => assessmentListSearch.setFilter('position', value)}
                      options={positionOptions}
                      placeholder="All positions"
                      searchPlaceholder="Search job or JD number..."
                      allLabel="All positions"
                      emptyMessage="No positions match"
                    />

                    <div>
                      <label htmlFor="assessment-type" className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                        Type
                      </label>
                      <select
                        id="assessment-type"
                        value={filterType}
                        onChange={(e) => assessmentListSearch.setFilter('type', e.target.value as typeof filterType)}
                        className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-black dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40"
                      >
                        <option value="all">All types</option>
                        <option value="Technical">Technical</option>
                        <option value="Behavioral">Behavioral</option>
                        <option value="Aptitude">Aptitude</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="assessment-creator" className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                        Created by
                      </label>
                      <select
                        id="assessment-creator"
                        value={filterCreatedBy}
                        onChange={(e) => assessmentListSearch.setFilter('createdBy', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-black dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40"
                      >
                        <option value="all">Anyone</option>
                        {assessmentCreators.map((name) => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="assessment-created-from" className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                        Created from
                      </label>
                      <input
                        id="assessment-created-from"
                        type="date"
                        value={filterCreatedFrom}
                        max={filterCreatedTo || undefined}
                        onChange={(e) => assessmentListSearch.setFilter('createdFrom', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-black dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40"
                      />
                    </div>

                    <div>
                      <label htmlFor="assessment-created-to" className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                        Created to
                      </label>
                      <input
                        id="assessment-created-to"
                        type="date"
                        value={filterCreatedTo}
                        min={filterCreatedFrom || undefined}
                        onChange={(e) => assessmentListSearch.setFilter('createdTo', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-black dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40"
                      />
                    </div>
                  </div>

                  {/* Panel footer: "Done" applies the selection and reveals the
                      toolbar Clear — same flow as job-openings. */}
                  <div className="mt-4 pt-3 border-t border-gray-200 dark:border-slate-700/60 flex items-center justify-end gap-2">
                    <button
                      // The controls above commit as they change, so Done just closes.
                      onClick={() => setShowAssessmentFilters(false)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-brand-blue transition-colors hover:bg-brand-blue-2 shadow-sm shadow-brand-blue/25"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}

              {assessmentListNarrowed && !isLoading && (
                <p className="mt-3 text-xs sm:text-sm text-gray-600 dark:text-slate-400">
                  <span className="font-semibold text-gray-900 dark:text-slate-50">{assessmentResultCount}</span>
                  {' '}assessment{assessmentResultCount === 1 ? '' : 's'} match
                  {assessmentSearch.trim() ? ` "${assessmentSearch.trim()}"` : ' your filters'}
                </p>
              )}
            </div>
          )}

        {/* ── Tabs, BELOW the filters, in the Job Openings status-pill
            treatment ──────────────────────────────────────────────────────
            Taken from that page's "Row 2: Status tabs" block
            (components/JobsListing.tsx): the same `flex items-center gap-2
            flex-wrap` container behind a `Show:` label, the same
            `px-3 py-1.5 rounded-lg text-xs sm:text-sm transition-all` pill,
            the same solid `bg-brand-blue text-white shadow-sm
            shadow-brand-blue/25` active state and the same tinted
            `bg-brand-blue/5 … hover:bg-brand-blue/10` resting state.

            `rounded-lg`, not `rounded-full`: that is what the reference page
            uses, and matching the reference is what was asked for.

            The tabs are DATA here rather than nine hand-written buttons. The
            underline strip they replace repeated its full class string on every
            button, which is how two of them (Activity Logs and Consent Logs)
            had drifted to `py-3 sm:py-4` while the rest sat at `py-2.5 sm:py-3`
            — a difference nothing intended. One class string, one map, and a
            new tab cannot arrive with different padding.

            Every `key` is the value `activeTab` already held and every handler
            is still `setActiveTab`, so each tab's behaviour is untouched;
            `adminOnly` reproduces the `isTenantAdmin` gate the two log tabs
            were already wrapped in. Short labels keep the mobile row from
            overflowing, exactly as the strip's `sm:hidden` spans did. */}
        {(() => {
          /* The row splits into the tabs that show assessment data and the
             three that don't — Activity Logs, Consent Logs, Settings are the
             page's own records and configuration, not a cut of the list — with
             the reference page's divider between them.

             Divider, spacing and placement are the Job Openings status-tab
             row's, verbatim: `sm:ml-2 sm:border-l sm:border-gray-200 sm:pl-3`
             on the wrapper of the trailing group (see the AI/Manual group in
             components/JobsListing.tsx). It is a left border on the group
             rather than a divider element, so there is nothing decorative in
             the row, and it is `sm:`-only because both rows wrap on a phone,
             where a vertical rule would end up pointing at nothing. The one
             addition is this file's dark border token, which the reference —
             a light-only page — has no equivalent for.

             `flex-wrap` on the group as well as the row: the reference group
             holds one compact segmented control, this one holds three
             full-width pills, which need to be able to wrap among themselves
             on a narrow screen.

             The pill itself is untouched — same single class string, same
             `setActiveTab` handler, same admin gate, rendered by one function
             for both groups so the two cannot drift apart. */
          /* The seven list tabs are text-only; `icon` survives only on the three
             after the divider. Omitting the key is all it takes — the renderer
             already draws the glyph conditionally (`'icon' in tab`), which is
             what let All Assessments, Active and Draft go without one from the
             start. */
          const TABS = ([
            { key: 'jobs', label: 'Total Jobs', short: 'Jobs' },
            { key: 'all', label: 'All Assessments', short: 'All' },
            { key: 'active', label: 'Active' },
            { key: 'draft', label: 'Draft' },
            { key: 'archived', label: 'Archived' },
            { key: 'completed-candidates', label: 'Candidate Results', short: 'Results' },
            { key: 'invitation-status', label: 'Invitation Status', short: 'Invites' },
            { key: 'audit', label: 'Activity Logs', short: 'Activity', icon: Activity, adminOnly: true },
            { key: 'consent', label: 'Consent Logs', short: 'Consent', icon: FileCheck, adminOnly: true },
            { key: 'settings', label: 'Settings', icon: Shield },
          ] as const);

          /* Which tabs sit after the divider. Named by key rather than by
             position so reordering the list above cannot silently move the
             divider. */
          const AFTER_DIVIDER: readonly string[] = ['audit', 'consent', 'settings'];

          const renderTabPill = (tab: (typeof TABS)[number]) => {
            const TabIcon = 'icon' in tab ? tab.icon : undefined;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                aria-current={isActive ? 'page' : undefined}
                className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm transition-all whitespace-nowrap inline-flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25'
                    : 'bg-brand-blue/5 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/10 hover:text-brand-blue'
                }`}
              >
                {TabIcon && <TabIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                {'short' in tab && tab.short ? (
                  <>
                    <span className="hidden sm:inline">{tab.label}</span>
                    <span className="sm:hidden">{tab.short}</span>
                  </>
                ) : (
                  tab.label
                )}
              </button>
            );
          };

          const visibleTabs = TABS.filter((tab) => !('adminOnly' in tab && tab.adminOnly) || isTenantAdmin);

          return (
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <span className="text-sm text-gray-600 dark:text-slate-400">Show:</span>
              {visibleTabs.filter((tab) => !AFTER_DIVIDER.includes(tab.key)).map(renderTabPill)}
              <div className="flex items-center gap-2 flex-wrap sm:ml-2 sm:border-l sm:border-gray-200 dark:sm:border-slate-700/60 sm:pl-3">
                {visibleTabs.filter((tab) => AFTER_DIVIDER.includes(tab.key)).map(renderTabPill)}
              </div>
            </div>
          );
        })()}

        {/* The list itself. Same card as before — it simply no longer
            carries the tab strip in its header. */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5">
          {/* Assessment List */}
          <div className="p-3 sm:p-6">

            {/* Job List header — just the section title now that the view
                toggle is gone. It only renders for the tabs that actually
                list jobs, so Settings and the log tabs no longer carry a
                heading that does nothing for them. */}
            {!activeTabOwnsListContent && !assessmentListEmpty && (
              <div className="flex items-center justify-between gap-3 mb-3 sm:mb-4">
                <h2 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-slate-50 tracking-tight">
                  Job List{' '}
                  <span className="font-normal text-gray-500 dark:text-slate-500">({assessmentResultCount})</span>
                </h2>
              </div>
            )}

            {isFlatAssessmentTab(activeTab) ? (() => {
              const config = FLAT_ASSESSMENT_TABLE_CONFIG[activeTab];
              return (
                <AllAssessmentsTable
                  key={`assessment-list-${activeTab}`}
                  embedded
                  fixedStatus={config.fixedStatus}
                  title={config.title}
                  description={config.description}
                />
              );
            })() : activeTab === 'completed-candidates' ? (() => {
              /* Candidate Results tab - every completed attempt across all assessments */
              const total = completedCandidates.length;
              const totalPages = Math.max(1, Math.ceil(total / COMPLETED_PAGE_SIZE));
              const safePage = Math.min(Math.max(1, completedCandidatesPage), totalPages);
              const pageItems = completedCandidates.slice((safePage - 1) * COMPLETED_PAGE_SIZE, safePage * COMPLETED_PAGE_SIZE);
              return (
                <div>
                  {isLoadingCompletedCandidates ? (
                    <div className="flex items-center justify-center py-16 tf-loader-center">
                      <Loader2 className="w-6 h-6 animate-spin text-brand-blue" />
                      <span className="ml-2 text-sm text-gray-600 dark:text-slate-400">Loading candidate results…</span>
                    </div>
                  ) : completedCandidatesError ? (
                    <div className="p-6 text-center">
                      <p className="text-sm text-red-600 mb-3">{completedCandidatesError}</p>
                      <button
                        onClick={loadAllCompletedCandidates}
                        className="px-4 py-2 text-sm bg-brand-blue text-white rounded-lg hover:bg-brand-blue-2 transition-colors"
                      >
                        Retry
                      </button>
                    </div>
                  ) : total === 0 ? (
                    /* The shared tab empty state — this tab has no search or
                       filter of its own, so there is no narrowed flavour to
                       distinguish and nothing to reset. */
                    <TabEmptyState
                      icon={Users}
                      title="No Candidate Results Yet"
                      description="Results appear here once candidates complete an assessment."
                    />
                  ) : (
                    <>
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <span className="text-xs sm:text-sm text-gray-600 dark:text-slate-400">
                          <span className="font-semibold text-gray-900 dark:text-slate-50">{total.toLocaleString()}</span> result{total === 1 ? '' : 's'} across all assessments
                        </span>
                      </div>
                      {/* Same card + title as the per-assessment results view. */}
                      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 overflow-hidden">
                        <div className="px-4 sm:px-6 py-3 border-b border-gray-100 dark:border-slate-700/60">
                          <h2 className="text-sm sm:text-base font-medium text-gray-900 dark:text-slate-50 tracking-tight">Candidate Results</h2>
                        </div>
                        <div className="min-h-[400px] max-h-[calc(100dvh-24rem)] overflow-auto tf-table-shell">
                        {/* 1500 -> 1720 for the two added columns. The shell
                            already scrolls horizontally (tf-table-shell), so
                            the widening changes nothing but which point the
                            scroll starts at; leaving it at 1500 would have
                            squeezed the existing columns instead. */}
                        <table className="w-full min-w-[1720px] table-auto">
                          <thead className="sticky top-0 z-10 [&_th]:bg-slate-50 dark:[&_th]:bg-slate-800 [&_th]:border-b [&_th]:border-gray-200 dark:[&_th]:border-slate-700">
                            <tr>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">CID</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Candidate</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Email</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">JD Title</th>
                              {/* The two version columns sit next to JD Title
                                  so the job, the version of it, and the resume
                                  version scored against it read as one group.
                                  Same th classes as every other column. */}
                              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Job Version</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Resume Version</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Phone</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Invite Source</th>
                              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Tech Score</th>
                              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Coding Score</th>
                              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Result Status</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Timeline</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Completed</th>
                              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Duration</th>
                              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle tf-sticky-col">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                            {pageItems.map((result) => {
                              const invite = inviteSourceMeta(result.invite_source);
                              return (
                                <tr
                                  key={`${result._assessment_id}-${result.invitation_id}`}
                                  onClick={() => openCandidateResult(result, pageItems)}
                                  className="hover:bg-brand-blue/5 transition-colors cursor-pointer"
                                  title={`View ${result.candidate_name || 'candidate'}'s result`}
                                >
                                  <td className="px-4 py-4 align-middle whitespace-nowrap">
                                    {result.candidate_display_id ? (
                                      <span className="inline-flex items-center px-2 py-0.5 bg-brand-blue/10 text-brand-blue rounded text-xs font-mono font-medium ring-1 ring-brand-blue/20">
                                        {result.candidate_display_id}
                                      </span>
                                    ) : (
                                      <span className="text-gray-400 text-sm">-</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-4 align-middle whitespace-nowrap">
                                    <div className="flex items-center gap-2.5">
                                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-blue text-white text-xs font-semibold">
                                        {(result.candidate_name || 'U').charAt(0).toUpperCase()}
                                      </span>
                                      <span className="text-sm font-medium text-gray-900 dark:text-slate-50">
                                        {result.candidate_name || 'Unknown'}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-4 align-middle text-sm text-gray-600 dark:text-slate-400 whitespace-nowrap">
                                    {result.candidate_email || '-'}
                                  </td>
                                  <td className="px-4 py-4 align-middle text-sm text-gray-700 dark:text-slate-300 whitespace-nowrap">
                                    {result.jd_title || result._assessment_title || '-'}
                                  </td>
                                  {/* Job Version — plain `v3`, the same
                                      treatment the Scored Resumes table gives
                                      its own Job Version column, so a job
                                      version reads identically in both. */}
                                  <td className="px-4 py-4 align-middle text-sm text-gray-700 dark:text-slate-300 whitespace-nowrap">
                                    {result._jd_version ? `v${result._jd_version}` : '-'}
                                  </td>
                                  {/* Resume Version — the blue pill that
                                      table uses for the same field. A dash
                                      when the candidate has no scoring record
                                      for this job version; see the join in
                                      loadAllCompletedCandidates. */}
                                  <td className="px-4 py-4 align-middle whitespace-nowrap">
                                    {result._resume_version ? (
                                      <span className="inline-flex px-2 py-1 rounded-full text-xs border bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-400/30">
                                        v{result._resume_version}
                                      </span>
                                    ) : (
                                      <span className="text-sm text-gray-400">-</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-4 align-middle text-sm text-gray-600 dark:text-slate-400 whitespace-nowrap">
                                    {result.candidate_phone || '-'}
                                  </td>
                                  <td className="px-4 py-4 align-middle whitespace-nowrap">
                                    <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${invite.cls}`}>
                                      {invite.label}
                                    </span>
                                  </td>
                                  <td className="px-4 py-4 align-middle text-center">
                                    <div className="flex flex-col items-center gap-1">
                                      <span className={`text-lg font-semibold ${typeof result.technical_score === 'number' ? (result.technical_score >= RESULT_PASS_MARK ? 'text-green-600' : 'text-red-600') : 'text-gray-400'}`}>
                                        {typeof result.technical_score === 'number' ? `${Math.round(result.technical_score)}%` : '-'}
                                      </span>
                                      {typeof result.technical_score === 'number' && (
                                        <span className={`text-xs font-medium ${result.technical_score >= RESULT_PASS_MARK ? 'text-green-600' : 'text-red-600'}`}>
                                          {result.technical_score >= RESULT_PASS_MARK ? 'Pass' : 'Fail'}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-4 py-4 align-middle text-center">
                                    <div className="flex flex-col items-center gap-1">
                                      <span className={`text-lg font-semibold ${typeof result.coding_score === 'number' ? (result.coding_score >= RESULT_PASS_MARK ? 'text-green-600' : 'text-red-600') : 'text-gray-400'}`}>
                                        {typeof result.coding_score === 'number' ? `${Math.round(result.coding_score)}%` : '-'}
                                      </span>
                                      {typeof result.coding_score === 'number' && (
                                        <span className={`text-xs font-medium ${result.coding_score >= RESULT_PASS_MARK ? 'text-green-600' : 'text-red-600'}`}>
                                          {result.coding_score >= RESULT_PASS_MARK ? 'Pass' : 'Fail'}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-4 py-4 align-middle text-center whitespace-nowrap">
                                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs ${resultStatusClass(result.status)}`}>
                                      {resultStatusLabel(result.status)}
                                    </span>
                                  </td>
                                  <td className="px-4 py-4 align-middle text-xs text-gray-500 dark:text-slate-400 whitespace-nowrap">
                                    <div className="space-y-1">
                                      {result.started_at && (
                                        <div className="flex items-center gap-2 whitespace-nowrap">
                                          <Play className="w-3 h-3 text-brand-orange-deep" />
                                          <span>Started: {formatIST(result.started_at)}</span>
                                        </div>
                                      )}
                                      {result.completed_at && (
                                        <div className="flex items-center gap-2 whitespace-nowrap">
                                          <CheckCircle className="w-3 h-3 text-green-500" />
                                          <span>Completed: {formatIST(result.completed_at)}</span>
                                        </div>
                                      )}
                                      {!result.started_at && !result.completed_at && <span>-</span>}
                                    </div>
                                  </td>
                                  <td className="px-4 py-4 align-middle whitespace-nowrap">
                                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400">
                                      <Calendar className="w-4 h-4" />
                                      {result.completed_at ? formatISTDate(result.completed_at) : '-'}
                                    </div>
                                  </td>
                                  <td className="px-4 py-4 align-middle text-center whitespace-nowrap">
                                    <div className="flex items-center justify-center gap-2 text-sm text-gray-600 dark:text-slate-400">
                                      <Clock className="w-4 h-4" />
                                      {formatTimeSpent(result.time_spent_seconds)}
                                    </div>
                                  </td>
                                  <td className="px-2 sm:px-4 py-4 align-middle tf-sticky-col" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-center justify-center">
                                      <button
                                        onClick={() => openCandidateResult(result, pageItems)}
                                        className="inline-flex items-center justify-center w-9 h-9 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-md shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors"
                                        title="View candidate result"
                                        aria-label={`View result for ${result.candidate_name || 'candidate'}`}
                                      >
                                        <Eye className="w-3.5 h-3.5 shrink-0" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        </div>
                      </div>
                      {total > COMPLETED_PAGE_SIZE && (
                        <div className="mt-4 flex items-center justify-between gap-3">
                          <span className="text-xs text-gray-600 dark:text-slate-400">
                            {total.toLocaleString()} total
                          </span>
                          <InlinePageNav
                            page={safePage}
                            totalPages={totalPages}
                            onPageChange={setCompletedCandidatesPage}
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })() : activeTab === 'invitation-status' ? (() => {
              /* Invitation Status tab — every invitation across every
                 assessment. The summary is a segmented status filter and an
                 inline completion meter (see below), deliberately not a card
                 row; the filter bar and the status badges are the Track Invites
                 popup's, reused rather than rebuilt, so the two cannot drift. */
              const bucketCount = (bucket: string) =>
                inviteStatusRows.filter((inv) => inviteStatusBucket(inv) === bucket).length;
              const totalInvites = inviteStatusRows.length;
              const completedInvites = bucketCount('completed');

              const search = inviteStatusFilters.search.trim().toLowerCase();
              /* Date range is inclusive of the whole `to` day — a recruiter
                 picking today expects today's invites, not those sent at
                 exactly 00:00. */
              const fromTime = inviteStatusFilters.dateFrom ? new Date(`${inviteStatusFilters.dateFrom}T00:00:00`).getTime() : null;
              const toTime = inviteStatusFilters.dateTo ? new Date(`${inviteStatusFilters.dateTo}T23:59:59.999`).getTime() : null;
              const filtered = inviteStatusRows.filter((inv) => {
                if (inviteStatusFilters.status !== 'all' && inviteStatusBucket(inv) !== inviteStatusFilters.status) return false;
                if (search) {
                  /* Every identifier the row shows is searchable, plus the
                     assessment title, which the table no longer has a column
                     for but is still how a recruiter names what they invited
                     someone to. */
                  const haystack = [
                    inv.candidate_name,
                    inv.candidate_email,
                    inv.candidate_display_id,
                    inv._jd_short_id,
                    inv._jd_title,
                    inv._assessment_title,
                  ].filter(Boolean).join(' ').toLowerCase();
                  if (!haystack.includes(search)) return false;
                }
                if (fromTime !== null || toTime !== null) {
                  const sentAt = new Date(inv.sent_at || inv.created_at || 0).getTime();
                  if (!sentAt) return false;
                  if (fromTime !== null && sentAt < fromTime) return false;
                  if (toTime !== null && sentAt > toTime) return false;
                }
                return true;
              });

              const total = filtered.length;
              const totalPages = Math.max(1, Math.ceil(total / INVITE_STATUS_PAGE_SIZE));
              const safePage = Math.min(Math.max(1, inviteStatusPage), totalPages);
              const pageItems = filtered.slice((safePage - 1) * INVITE_STATUS_PAGE_SIZE, safePage * INVITE_STATUS_PAGE_SIZE);

              /* Selection, and the export it gates. Intersected with `filtered`
                 rather than read raw, so a row that a later filter or search
                 hid can never leave through the export — the same rule the
                 Resume Scoring table exports by.

                 Select All ticks every FILTERED row, not just the page in
                 front of you (again the Resume Scoring behaviour), so a
                 recruiter exporting 60 completed invites does not have to
                 visit three pages to pick them.

                 The Export button appears only on the Completed bucket, and
                 only with something selected: a part-finished invite has no
                 scores or completion date to put in a sheet, so exporting one
                 would produce mostly empty rows. */
              const selectedInviteRows = filtered.filter((inv) => selectedInviteIds.has(inv.id));
              const selectableIds = filtered.map((inv) => inv.id);
              const allFilteredSelected = selectableIds.length > 0
                && selectableIds.every((id) => selectedInviteIds.has(id));
              const toggleSelectAllInvites = () =>
                setSelectedInviteIds(() => (allFilteredSelected ? new Set<string>() : new Set<string>(selectableIds)));
              const toggleSelectInvite = (id: string) =>
                setSelectedInviteIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id); else next.add(id);
                  return next;
                });
              const showInviteExport = canExportInvites
                && inviteStatusFilters.status === 'completed'
                && selectedInviteRows.length > 0;

              /* Bulk Resend mirrors Export's gate on the other bucket: the
                 Expired filter, plus a selection. A resend only means anything
                 for a lapsed link, so offering it under any other filter would
                 be offering a no-op. */
              const resendableSelectedRows = selectedInviteRows.filter(isInviteResendable);
              const showInviteBulkResend = inviteStatusFilters.status === 'expired'
                && resendableSelectedRows.length > 0;

              return (
                <div>
                  {isLoadingInviteStatus ? (
                    <div className="flex items-center justify-center py-16 tf-loader-center">
                      <Loader2 className="w-6 h-6 animate-spin text-brand-blue" />
                      <span className="ml-2 text-sm text-gray-600 dark:text-slate-400">Loading invitation statuses…</span>
                    </div>
                  ) : inviteStatusError ? (
                    <div className="p-6 text-center">
                      <p className="text-sm text-red-600 mb-3">{inviteStatusError}</p>
                      <button
                        onClick={loadAllInviteStatuses}
                        className="px-4 py-2 text-sm bg-brand-blue text-white rounded-lg hover:bg-brand-blue-2 transition-colors"
                      >
                        Retry
                      </button>
                    </div>
                  ) : totalInvites === 0 ? (
                    /* Nothing invited anywhere: the shared tab empty state,
                       and with it none of the tab's own chrome — no status
                       segments, no filter bar, no table header over zero rows.
                       A zero caused by this tab's OWN filters is a different
                       case and keeps all of that, with the "no match" row
                       inside the table. */
                    <TabEmptyState
                      icon={Mail}
                      title="No Invitations Sent Yet"
                      description="Invite candidates to an assessment and their status appears here."
                    />
                  ) : (
                    <>
                      {/* Summary + status filter, with no cards in it.

                          A four-tile card row for four counts was more
                          furniture than the numbers deserved: it pushed the
                          table below the fold, and a card whose whole purpose
                          is to be clicked as a filter is a filter drawn as a
                          card. So the buckets are a segmented control — the
                          same one the AI Interviews list filters its modes with
                          (slate trough, white raised pill for the selection,
                          count badge from that page's tab strip) — and the
                          completion rate, which was never a filter, is the
                          inline meter used for the score breakdowns.

                          Nothing about the data or the behaviour moved: each
                          segment still writes its bucket into
                          `inviteStatusFilters.status`, the selected segment
                          still clears back to all when clicked again, and the
                          counts are still counts of the WHOLE set, so narrowing
                          the table never changes them. */}
                      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-4 sm:mb-5">
                        <div
                          role="group"
                          aria-label="Filter invitations by status"
                          className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] self-start overflow-x-auto scrollbar-hide max-w-full"
                        >
                          {/* Each segment wears its own status colour, drawn
                              from the `--status-*` tokens in globals.css — the
                              same tokens the status badges in the table below
                              now read, so a segment and the rows it filters to
                              can never disagree about what colour a status is.
                              No literal colour appears here, and each token's
                              dark value comes with it.

                              Total Invited takes the Invited colour: it is the
                              bucket every invite starts in, and the badge on a
                              sent-but-untouched invite is already that blue.

                              The classes are spelled out per segment rather
                              than built from the key — `text-status-${key}`
                              would be invisible to Tailwind's scanner, which
                              only sees literal class strings. */}
                          {([
                            { key: 'all', label: 'Total Invited', icon: Users, value: totalInvites,
                              text: 'text-status-invited', hover: 'hover:text-status-invited', tint: 'bg-status-invited/10', ring: 'ring-status-invited/20' },
                            { key: 'expired', label: 'Expired', icon: Clock, value: bucketCount('expired'),
                              text: 'text-status-expired', hover: 'hover:text-status-expired', tint: 'bg-status-expired/10', ring: 'ring-status-expired/20' },
                            { key: 'started', label: 'In Progress', icon: Play, value: bucketCount('started'),
                              text: 'text-status-progress', hover: 'hover:text-status-progress', tint: 'bg-status-progress/10', ring: 'ring-status-progress/20' },
                            { key: 'completed', label: 'Completed', icon: CheckCircle, value: completedInvites,
                              text: 'text-status-completed', hover: 'hover:text-status-completed', tint: 'bg-status-completed/10', ring: 'ring-status-completed/20' },
                          ] as const).map((segment) => {
                            const SegmentIcon = segment.icon;
                            const isActive = inviteStatusFilters.status === segment.key;
                            return (
                              <button
                                key={segment.key}
                                type="button"
                                aria-pressed={isActive}
                                title={segment.key === 'all'
                                  ? 'Show all invitations'
                                  : isActive
                                    ? `Stop filtering by ${segment.label.toLowerCase()}`
                                    : `Show only ${segment.label.toLowerCase()} invitations`}
                                /* Clicking the selected segment clears back to
                                   all. `all` is exempt — it already IS the
                                   cleared state, so it stays lit as the
                                   default. Same rule the card row had. */
                                onClick={() => {
                                  setInviteStatusFilters({
                                    ...inviteStatusFilters,
                                    status: isActive && segment.key !== 'all' ? 'all' : segment.key,
                                  });
                                  setInviteStatusPage(1);
                                }}
                                /* Shape, padding, raised-white selection and
                                   shadow are the segmented control's as before.
                                   The only change is which colour the selected
                                   segment's label and ring take: its status
                                   colour, where every segment used to share
                                   brand blue. */
                                className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-medium transition-all duration-200 whitespace-nowrap ${
                                  isActive
                                    ? `bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/10 ring-1 ${segment.text} ${segment.ring}`
                                    : `text-gray-600 dark:text-slate-400 ${segment.hover}`
                                }`}
                              >
                                {/* The icon wears the status colour in every
                                    state, so it does NOT inherit the button's
                                    label colour (grey at rest) — hence the
                                    explicit class. */}
                                <SegmentIcon className={`w-3.5 h-3.5 flex-shrink-0 ${segment.text}`} />
                                {segment.label}
                                {/* Count badge: the status tint, the same
                                    bg/10 + ring/20 treatment the table's status
                                    badges use. tabular-nums so a segment
                                    doesn't change width as its count refreshes
                                    underneath. */}
                                <span className={`inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full text-[10px] font-semibold tabular-nums ring-1 transition-colors ${segment.text} ${segment.tint} ${segment.ring}`}>
                                  {segment.value.toLocaleString()}
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        {/* Completion rate — derived from two of the counts
                            beside it rather than a bucket of its own, so it is
                            deliberately not clickable and not shaped like a
                            segment. The bar gives the reading at a glance and
                            the figures behind it follow, because a bare
                            percentage says nothing about how big the sample
                            was. */}
                        <div className="flex items-center gap-2.5 sm:gap-3 lg:justify-end flex-shrink-0">
                          <span className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 whitespace-nowrap">Completion rate</span>
                          <div className="h-1.5 w-20 sm:w-28 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden flex-shrink-0">
                            {/* Solid `bg-brand-blue`, not the blue→cyan gradient
                                this started as: one brand colour, matching the
                                icons beside it, and the gradient's
                                `from-`/`to-` utilities are the two that
                                globals.css does NOT retune for dark mode (only
                                `.dark .bg-brand-*` is), so the bar used to stay
                                at the deep light-mode blue on a dark page. */}
                            <div
                              className="h-full rounded-full bg-brand-blue transition-all"
                              style={{ width: `${totalInvites > 0 ? Math.round((completedInvites / totalInvites) * 100) : 0}%` }}
                            />
                          </div>
                          <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-slate-50">
                            {totalInvites > 0 ? Math.round((completedInvites / totalInvites) * 100) : 0}%
                          </span>
                          <span className="text-xs text-gray-500 dark:text-slate-500 whitespace-nowrap hidden sm:inline">
                            {completedInvites.toLocaleString()} of {totalInvites.toLocaleString()} completed
                          </span>
                        </div>
                      </div>

                      {/* The list card, same treatment as the Candidate Results
                          tab's. The filter bar carries its own padding and
                          divider, so it sits inside the card under the header
                          rather than loose on the page. */}
                      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 overflow-hidden">
                        {/* Header — the Candidate Results card's title row, with
                            the house count badge (which states the narrowing:
                            "12 of 40 invitations") and the popup's Refresh
                            control, since invite statuses move while the tab
                            sits open. */}
                        <div className="px-4 sm:px-6 py-3 border-b border-gray-100 dark:border-slate-700/60 flex flex-wrap items-center justify-between gap-2 sm:gap-3">
                          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                            <h2 className="text-sm sm:text-base font-medium text-gray-900 dark:text-slate-50 tracking-tight">Invitations</h2>
                            <ListCountBadge
                              filtered={total}
                              total={totalInvites}
                              noun="invitation"
                              className="text-xs px-2 py-1"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            {/* Export — the Resume Scoring page's control:
                                FileDown, the green "you have a selection"
                                treatment, and a click that opens the format
                                dialog rather than downloading straight away.
                                It is absent (not disabled) outside the
                                Completed bucket, because there is nothing a
                                recruiter could do to make it work there. */}
                            {/* Bulk Resend — the popup's own button, classes
                                and spinner, acting on the ticked Expired rows.
                                Absent (not disabled) under the other filters,
                                for the same reason Export is. */}
                            {showInviteBulkResend && (
                              <button
                                onClick={() => setShowInviteBulkResendConfirm(true)}
                                disabled={isBulkResending}
                                title="Resend a fresh link to the selected expired invitations"
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-semibold bg-brand-blue text-white rounded-lg hover:bg-brand-blue-2 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 transition-colors whitespace-nowrap"
                              >
                                {isBulkResending
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : <Mail className="w-3.5 h-3.5" />}
                                {isBulkResending ? 'Sending…' : `Resend (${resendableSelectedRows.length})`}
                              </button>
                            )}
                            {showInviteExport && (
                              <button
                                onClick={() => setShowInviteExportModal(true)}
                                title="Export the selected completed invitations"
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors font-medium whitespace-nowrap"
                              >
                                <FileDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                                Export ({selectedInviteRows.length})
                              </button>
                            )}
                            <button
                              onClick={loadAllInviteStatuses}
                              disabled={isLoadingInviteStatus}
                              title="Fetch the latest invite statuses"
                              className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 text-xs sm:text-sm border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 ${isLoadingInviteStatus ? 'animate-spin' : ''}`} />
                              Refresh
                            </button>
                          </div>
                        </div>

                        <InviteFilterBar
                          filters={inviteStatusFilters}
                          onChange={(nextFilters) => {
                            setInviteStatusFilters(nextFilters);
                            setInviteStatusPage(1);
                          }}
                          /* Same trimmed status list as the assessment popup —
                             one option per stat card above. */
                          statusOptions={ASSESSMENT_INVITE_STATUS_OPTIONS.filter(
                            (option) => !['failed', 'abandoned'].includes(option.value)
                          )}
                          searchPlaceholder="Search by candidate, email, CID, job, or assessment..."
                        />

                        <div className="min-h-[320px] max-h-[calc(100dvh-28rem)] overflow-auto tf-table-shell">
                          {/* 1200 -> 1400 for the two score columns. The shell
                              already scrolls sideways, so this only moves where
                              that scroll starts; leaving it at 1200 would have
                              squeezed the columns already there. */}
                          <table className="w-full min-w-[1550px] table-auto">
                            <thead className="sticky top-0 z-10 [&_th]:bg-slate-50 dark:[&_th]:bg-slate-800 [&_th]:border-b [&_th]:border-gray-200 dark:[&_th]:border-slate-700">
                              <tr>
                                {/* Select All — the pinned checkbox column
                                    the Resume Scoring table opens with, in the
                                    same place and with the same CheckSquare /
                                    Square pair. `tf-sticky-col-left` is the
                                    shared class documented for exactly this
                                    (a left-pinned Select-All cell on any
                                    table), so the checkbox stays put while the
                                    wide table scrolls sideways. */}
                                <th className="text-left px-4 py-3 w-12 align-middle tf-sticky-col-left">
                                  <button
                                    onClick={toggleSelectAllInvites}
                                    className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded"
                                    aria-label={allFilteredSelected ? 'Deselect all invitations' : 'Select all invitations'}
                                    title={allFilteredSelected ? 'Deselect all' : `Select all ${selectableIds.length} matching`}
                                  >
                                    {allFilteredSelected ? (
                                      <CheckSquare className="w-4 h-4 text-gray-800 dark:text-slate-200" />
                                    ) : (
                                      <Square className="w-4 h-4 text-gray-400" />
                                    )}
                                  </button>
                                </th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">CID</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Candidate</th>
                                {/* One column for all four job/assessment
                                    fields — together they identify a single
                                    thing (the job version this candidate was
                                    assessed against), so four headers spent on
                                    it widened every row without telling a
                                    recruiter anything more. Same th classes as
                                    every other column. */}
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Job &amp; Assessment</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Status</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Invited On</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Timeline</th>
                                {/* Centred, like the score columns on the
                                    Candidate Results table — a percentage over
                                    its Pass/Fail chip reads as a unit, and
                                    centring keeps the two columns symmetrical.

                                    Both columns always render, unlike the
                                    popup's, which appear only when the one
                                    assessment being tracked has that round.
                                    These rows span every assessment, so a
                                    column that came and went would have to do
                                    it per row, which a table cannot. Rows
                                    without the round show a dash. */}
                                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Tech Score</th>
                                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Coding Score</th>
                                {/* Action — pinned to the right edge with
                                    `tf-sticky-col`, the mirror of the Select
                                    All column's `tf-sticky-col-left`, so on
                                    this wide table the checkbox and the kebab
                                    both stay reachable while the columns
                                    between them scroll. Same treatment as the
                                    Track Invites popup's own Actions column. */}
                                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle tf-sticky-col">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                              {total === 0 ? (
                                <tr>
                                  <td colSpan={10} className="px-4 py-12 text-center text-sm text-gray-500 dark:text-slate-500">
                                    No invitations match the current filters.
                                  </td>
                                </tr>
                              ) : pageItems.map((inv: any) => {
                                const initials = inv.candidate_name
                                  ?.split(' ')
                                  .map((n: string) => n[0])
                                  .join('')
                                  .toUpperCase()
                                  .slice(0, 2) || '??';
                                return (
                                  <tr key={inv.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-slate-800">
                                    <td className="px-4 py-4 align-middle tf-sticky-col-left">
                                      <button
                                        onClick={() => toggleSelectInvite(inv.id)}
                                        className="p-1 hover:bg-gray-200 dark:hover:bg-slate-700 rounded"
                                        aria-label={`Select ${inv.candidate_name || inv.candidate_email || 'candidate'}`}
                                      >
                                        {selectedInviteIds.has(inv.id) ? (
                                          <CheckSquare className="w-4 h-4 text-gray-800 dark:text-slate-200" />
                                        ) : (
                                          <Square className="w-4 h-4 text-gray-400" />
                                        )}
                                      </button>
                                    </td>
                                    <td className="px-4 py-4 align-middle whitespace-nowrap">
                                      <span className="inline-block text-xs font-mono font-medium text-brand-blue bg-brand-blue/5 px-2 py-1 rounded ring-1 ring-brand-blue/20">
                                        {inv.candidate_display_id || '-'}
                                      </span>
                                    </td>
                                    <td className="px-4 py-4 align-middle">
                                      <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/20 flex items-center justify-center text-brand-blue font-medium text-xs flex-shrink-0">
                                          {initials}
                                        </div>
                                        <div className="min-w-0 max-w-[240px]">
                                          <p className="font-medium text-gray-900 dark:text-slate-50 text-sm truncate" title={inv.candidate_name}>{inv.candidate_name || '-'}</p>
                                          <p className="text-xs text-gray-500 dark:text-slate-500 truncate" title={inv.candidate_email}>{inv.candidate_email}</p>
                                        </div>
                                      </div>
                                    </td>
                                    {/* Job & Assessment — four fields in one
                                        cell, in the two-line stack this table
                                        already uses for its Candidate column:
                                        identity on top, its detail beneath in
                                        the muted size.

                                        Line 1 says which job: the shared
                                        JobIdBadge, which is how this identifier
                                        is drawn on every list in the app, and
                                        the job's name beside it — truncated,
                                        with the full name on hover, so one long
                                        title cannot set the column's width.

                                        Line 2 is the two versions, each behind
                                        its own word so neither can be taken for
                                        the other, separated by the middot this
                                        page already uses to join short facts.
                                        Labelled rather than two bare `v3`s,
                                        which is the one thing a shared cell
                                        must not leave ambiguous. A missing
                                        value is a dash, not an invented v1. */}
                                    <td className="px-4 py-4 align-middle">
                                      <div className="space-y-1">
                                        <div className="flex items-center gap-2 min-w-0">
                                          {inv._jd_short_id && (
                                            <JobIdBadge className="inline-flex items-center flex-shrink-0">{inv._jd_short_id}</JobIdBadge>
                                          )}
                                          <p className="text-sm text-gray-900 dark:text-slate-50 truncate max-w-[220px]" title={inv._jd_title}>{inv._jd_title || '-'}</p>
                                        </div>
                                        <p className="text-xs text-gray-500 dark:text-slate-500 whitespace-nowrap">
                                          Job {inv._jd_version ? `v${inv._jd_version}` : '-'}
                                          <span className="mx-1.5 text-gray-300 dark:text-slate-600" aria-hidden="true">·</span>
                                          Assessment {inv._assessment_version ? `v${inv._assessment_version}` : '-'}
                                        </p>
                                      </div>
                                    </td>
                                    <td className="px-4 py-4 align-middle">{renderInviteStatusBadge(inv)}</td>
                                    <td className="px-4 py-4 align-middle whitespace-nowrap">
                                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400">
                                        <Calendar className="w-4 h-4" />
                                        {inv.sent_at || inv.created_at ? formatISTDate(inv.sent_at || inv.created_at) : '-'}
                                      </div>
                                    </td>
                                    {/* Same lifecycle stamps the popup's Timeline
                                        column shows, in the same order. */}
                                    <td className="px-4 py-4 align-middle text-xs text-gray-500 dark:text-slate-500">
                                      <div className="space-y-1">
                                        {inv.sent_at && (
                                          <div className="flex items-center gap-2 whitespace-nowrap">
                                            <Mail className="w-3 h-3 text-status-invited flex-shrink-0" />
                                            <span className="text-status-invited">Invited: {formatIST(inv.sent_at)}</span>
                                          </div>
                                        )}
                                        {inv.opened_at && (
                                          <div className="flex items-center gap-2 whitespace-nowrap">
                                            <Monitor className="w-3 h-3 text-status-progress flex-shrink-0" />
                                            <span className="text-status-progress">System Check: {formatIST(inv.opened_at)}</span>
                                          </div>
                                        )}
                                        {inv.started_at && (
                                          <div className="flex items-center gap-2 whitespace-nowrap">
                                            <Play className="w-3 h-3 text-status-progress flex-shrink-0" />
                                            <span className="text-status-progress">Started: {formatIST(inv.started_at)}</span>
                                          </div>
                                        )}
                                        {inv.completed_at && (
                                          <div className="flex items-center gap-2 whitespace-nowrap">
                                            <CheckCircle className="w-3 h-3 text-status-completed flex-shrink-0" />
                                            <span className="text-status-completed">Completed: {formatIST(inv.completed_at)}</span>
                                          </div>
                                        )}
                                        {inv.terminated_at && !inv.completed_at && (
                                          <div className="flex items-center gap-2 whitespace-nowrap">
                                            <Ban className="w-3 h-3 text-red-600 flex-shrink-0" />
                                            <span className="text-red-600">Terminated: {formatIST(inv.terminated_at)}</span>
                                          </div>
                                        )}
                                        {inviteStatusBucket(inv) === 'expired' && inv.expires_at && (
                                          <div className="flex items-center gap-2 whitespace-nowrap">
                                            <Clock className="w-3 h-3 text-status-expired flex-shrink-0" />
                                            <span className="text-status-expired">Expired at: {formatIST(inv.expires_at)}</span>
                                          </div>
                                        )}
                                        {!inv.sent_at && !inv.started_at && (
                                          <div className="flex items-center gap-2 whitespace-nowrap">
                                            <Clock className="w-3 h-3 text-gray-400 flex-shrink-0" />
                                            <span>Created: {formatIST(inv.created_at)}</span>
                                          </div>
                                        )}
                                      </div>
                                    </td>
                                    {renderInviteScoreCell(inv, 'technical')}
                                    {renderInviteScoreCell(inv, 'coding')}
                                    {/* Actions in a kebab, using Radix's
                                        DropdownMenu for the same reason the
                                        popup's does: this table sits inside
                                        tf-table-shell (overflow: auto), where
                                        an absolutely positioned menu would be
                                        clipped by the scroll container. Radix
                                        portals it out.

                                        Both items act on a completed attempt,
                                        so a row without one gets no trigger at
                                        all rather than a menu that opens onto
                                        nothing — the popup's rule. */}
                                    <td className="px-4 py-4 align-middle text-center tf-sticky-col">
                                      {(() => {
                                        const hasResult = inviteHasResult(inv);
                                        const scored = inv.scoring_status !== 'pending' && inv.scoring_status !== 'processing';
                                        const canDownload = hasResult && scored && canDownloadInviteReport;
                                        /* Resend is offered on Expired rows and
                                           only those. `isInviteResendable` is
                                           the one definition of that — the bulk
                                           Resend button and its confirmation
                                           read the same helper, so a row cannot
                                           offer an action the bulk path would
                                           skip, or the reverse. */
                                        const canResend = isInviteResendable(inv);
                                        // No trigger at all rather than a menu that
                                        // opens onto nothing — the popup's rule.
                                        if (!hasResult && !canResend) return null;
                                        return (
                                          <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                              <button
                                                aria-label="Actions"
                                                title="Actions"
                                                className="p-1.5 text-gray-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-gray-700 dark:hover:text-slate-200 rounded transition-colors"
                                              >
                                                <MoreVertical className="w-4 h-4" />
                                              </button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-48">
                                              {hasResult && (
                                                <DropdownMenuItem
                                                  className={assessmentDropdownMenuItemClass}
                                                  onSelect={() => openInviteResult(inv)}
                                                >
                                                  <Eye className="w-3.5 h-3.5 text-menu-icon-view" />
                                                  <span className={MENU_ITEM_SCALE_CLASS}>View Result</span>
                                                </DropdownMenuItem>
                                              )}
                                              {/* Resend — the popup's item, opening
                                                  the same page-level confirmation
                                                  (new-link expiry preview and all)
                                                  through the same state. The work is
                                                  handleResendInvitation's; nothing
                                                  about it is reimplemented here. */}
                                              {canResend && (
                                                <DropdownMenuItem
                                                  className={assessmentDropdownMenuItemClass}
                                                  onSelect={() => setResendTargetInvitation(inv)}
                                                >
                                                  <Mail className="w-3.5 h-3.5 text-menu-icon-share" />
                                                  <span className={MENU_ITEM_SCALE_CLASS}>Resend</span>
                                                </DropdownMenuItem>
                                              )}
                                              {/* Disabled rather than hidden while
                                                  scoring runs: the action exists for
                                                  this row, it is just not ready yet,
                                                  and hiding it would read as "this
                                                  row has no report". */}
                                              {hasResult && canDownloadInviteReport && (
                                                <DropdownMenuItem
                                                  className={assessmentDropdownMenuItemClass}
                                                  disabled={!canDownload || downloadingInviteReportId === inv.id}
                                                  onSelect={() => downloadInviteReport(inv)}
                                                >
                                                  {downloadingInviteReportId === inv.id
                                                    ? <Loader2 className="w-3.5 h-3.5 text-menu-icon-download animate-spin" />
                                                    : <Download className="w-3.5 h-3.5 text-menu-icon-download" />}
                                                  <span className={MENU_ITEM_SCALE_CLASS}>
                                                    {downloadingInviteReportId === inv.id ? 'Preparing…' : 'Download Report'}
                                                  </span>
                                                </DropdownMenuItem>
                                              )}
                                            </DropdownMenuContent>
                                          </DropdownMenu>
                                        );
                                      })()}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {total > INVITE_STATUS_PAGE_SIZE && (
                        <div className="mt-4 flex items-center justify-between gap-3">
                          <span className="text-xs text-gray-600 dark:text-slate-400">
                            {total.toLocaleString()} total
                          </span>
                          <InlinePageNav
                            page={safePage}
                            totalPages={totalPages}
                            onPageChange={setInviteStatusPage}
                          />
                        </div>
                      )}

                      {/* Export format dialog — the Resume Scoring page's
                          export modal: the FileDown header stating what will
                          be written, the two format cards (CSV / Excel .xls)
                          as radio options, the list of columns included, and
                          Cancel / Export in the footer. Rendered here rather
                          than beside the page's other modals because the rows
                          it exports are derived in this scope.

                          `selectedInviteRows` is the same intersection the
                          button counts, so what the dialog says and what the
                          file holds cannot disagree. */}
                      {showInviteExportModal && (
                        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
                          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 w-full max-w-[95vw] sm:max-w-md max-h-[calc(100dvh-2rem)] flex flex-col">
                            <div className="flex items-start justify-between gap-3 p-5 border-b border-gray-200 dark:border-slate-700 shrink-0">
                              <div className="flex items-start gap-3">
                                <div className="w-11 h-11 rounded-full bg-blue-50 dark:bg-blue-500/15 flex items-center justify-center flex-shrink-0">
                                  <FileDown className="w-5 h-5 text-blue-600 dark:text-blue-300" />
                                </div>
                                <div>
                                  <h3 className="text-lg font-bold text-gray-900 dark:text-slate-50">Export Completed Invitations</h3>
                                  <p className="text-sm text-gray-500 dark:text-slate-500 mt-1 flex items-center gap-1.5">
                                    {selectedInviteRows.length} selected record{selectedInviteRows.length === 1 ? '' : 's'}
                                    <span className="w-1 h-1 rounded-full bg-blue-500" />
                                    {INVITE_EXPORT_COLUMNS.length} columns
                                  </p>
                                </div>
                              </div>
                              <button
                                onClick={() => setShowInviteExportModal(false)}
                                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 rounded-md hover:bg-gray-100 dark:hover:bg-slate-800 flex-shrink-0"
                                aria-label="Close"
                              >
                                <X className="w-5 h-5" />
                              </button>
                            </div>

                            <div className="p-5 overflow-y-auto flex-1">
                              <p className="text-sm font-bold text-gray-900 dark:text-slate-50 mb-3">Choose export format</p>

                              <div className="space-y-3">
                                <button
                                  onClick={() => setInviteExportFormat('csv')}
                                  className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                                    inviteExportFormat === 'csv'
                                      ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-500/10'
                                      : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800'
                                  }`}
                                >
                                  <div className="w-12 h-12 bg-green-100 dark:bg-green-500/15 rounded-lg flex items-center justify-center flex-shrink-0">
                                    <FileText className="w-6 h-6 text-green-700 dark:text-green-300" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-bold text-gray-900 dark:text-slate-50">CSV Format</div>
                                    <div className="text-sm text-gray-500 dark:text-slate-500">Compatible with Excel, Google Sheets, and most spreadsheet apps.</div>
                                  </div>
                                  <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                                    inviteExportFormat === 'csv' ? 'border-blue-600' : 'border-gray-300 dark:border-slate-600'
                                  }`}>
                                    {inviteExportFormat === 'csv' && <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />}
                                  </span>
                                </button>

                                <button
                                  onClick={() => setInviteExportFormat('xls')}
                                  className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                                    inviteExportFormat === 'xls'
                                      ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-500/10'
                                      : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800'
                                  }`}
                                >
                                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-500/15 rounded-lg flex items-center justify-center flex-shrink-0">
                                    <FileSpreadsheet className="w-6 h-6 text-blue-700 dark:text-blue-300" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-bold text-gray-900 dark:text-slate-50">Excel Format (.xls)</div>
                                    <div className="text-sm text-gray-500 dark:text-slate-500">Native Excel format with formatting and styling.</div>
                                  </div>
                                  <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                                    inviteExportFormat === 'xls' ? 'border-blue-600' : 'border-gray-300 dark:border-slate-600'
                                  }`}>
                                    {inviteExportFormat === 'xls' && <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />}
                                  </span>
                                </button>
                              </div>

                              <div className="mt-4 p-4 bg-blue-50/60 dark:bg-blue-500/10 rounded-xl flex items-start gap-3">
                                <Info className="w-4 h-4 text-blue-600 dark:text-blue-300 flex-shrink-0 mt-0.5" />
                                <p className="text-sm text-gray-600 dark:text-slate-400">
                                  <span className="block font-bold text-blue-700 dark:text-blue-300 mb-0.5">Columns included</span>
                                  {INVITE_EXPORT_COLUMNS.map((col) => col.label).join(', ')}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200 dark:border-slate-700 shrink-0">
                              <button
                                onClick={() => setShowInviteExportModal(false)}
                                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 border border-gray-300 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => (inviteExportFormat === 'csv'
                                  ? exportInvitesToCSV(selectedInviteRows)
                                  : exportInvitesToXLS(selectedInviteRows))}
                                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-sm"
                              >
                                <Download className="w-4 h-4" />
                                Export
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })() : activeTab === 'audit' ? (
              /* Activity Logs Tab */
              <AssessmentAuditTrail />
            ) : activeTab === 'consent' ? (
              /* Consent Logs Tab */
              <ConsentLogs defaultFeature="ASSESSMENT" />
            ) : activeTab === 'settings' ? (
              /* Settings Tab with Sub-tabs */
              <div className="space-y-4 sm:space-y-6">
                {/* Settings Sub-tabs */}
                <div className="flex gap-2 sm:gap-4 border-b border-gray-200 dark:border-slate-700 overflow-x-auto scrollbar-hide">
                  {/* Proctoring & Security — staging-only testing menu; hidden in production. */}
                  {!IS_PRODUCTION_ENV && (
                  <button
                    onClick={() => setSettingsSubTab('proctoring')}
                    className={`pb-2.5 sm:pb-3 text-xs sm:text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 sm:gap-2 whitespace-nowrap ${
                      settingsSubTab === 'proctoring'
                        ? 'border-brand-blue text-brand-blue font-medium'
                        : 'border-transparent text-gray-500 dark:text-slate-500 hover:text-brand-blue'
                    }`}
                  >
                    <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">Proctoring & Security</span>
                    <span className="sm:hidden">Proctoring</span>
                  </button>
                  )}
                  <button
                    onClick={() => setSettingsSubTab('topics')}
                    className={`pb-2.5 sm:pb-3 text-xs sm:text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 sm:gap-2 whitespace-nowrap ${
                      settingsSubTab === 'topics'
                        ? 'border-brand-blue text-brand-blue font-medium'
                        : 'border-transparent text-gray-500 dark:text-slate-500 hover:text-brand-blue'
                    }`}
                  >
                    <ClipboardList className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    Topics
                  </button>
                </div>

                {/* Content: Topics is shown normally; the Proctoring & Security
                    content is gated to non-production (staging-only testing menu). */}
                {settingsSubTab === 'topics' || IS_PRODUCTION_ENV ? (
                  <div className="space-y-4 sm:space-y-6">
                    {/* Header */}
                    <div>
                      <h2 className="text-sm sm:text-lg font-semibold text-gray-900 dark:text-slate-50 flex items-center gap-1.5 sm:gap-2">
                        <ClipboardList className="w-4 h-4 sm:w-5 sm:h-5" />
                        Assessment Topics Settings
                      </h2>
                      <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 mt-0.5 sm:mt-1">
                        Enable or disable topics for all assessments. Disabled topics will not appear in the section distribution.
                      </p>
                    </div>

                    {/* Loading State */}
                    {isLoadingTopics ? (
                      <div className="flex items-center justify-center py-12 tf-loader-center">
                        <div className="text-center">
                          <Loader2 className="w-10 h-10 text-brand-blue animate-spin mx-auto mb-3" />
                          <p className="text-gray-600 dark:text-slate-400">Loading topic settings...</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Error Message */}
                        {topicsError && (
                          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                            <AlertTriangle className="w-4 h-4 text-red-500" />
                            <p className="text-sm text-red-700">{topicsError}</p>
                          </div>
                        )}

                        {/* Topic Availability Header — solid `bg-brand-blue`,
                            not the blue→cyan gradient it started as.

                            One brand colour, matching the `bg-brand-blue` the
                            On badges and toggles directly below it already use,
                            so the header and the controls it introduces read as
                            one surface rather than two colour ideas.

                            It also fixes a dark-mode bug, which is the same
                            reason the Invitation Status completion meter gave up
                            its gradient: globals.css retunes `.dark
                            .bg-brand-blue` (to #2563eb) and the whole
                            `.dark .text-brand-*` family, but nothing retunes the
                            `from-`/`to-` gradient utilities — so this bar stayed
                            at the deep light-mode blue→cyan on a dark page while
                            everything around it lifted. Nothing else here
                            changes: the white text, the `bg-white/20` icon chip
                            and the `ring-white/10` all still sit on brand blue. */}
                        <div className="bg-brand-blue rounded-xl p-3 sm:p-4 shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 sm:gap-3">
                              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                                <ClipboardList className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                              </div>
                              <div>
                                <h3 className="text-xs sm:text-sm font-medium text-white">Topic Availability</h3>
                                <p className="text-[10px] sm:text-xs text-white/80">
                                  Control which topics are available
                                </p>
                              </div>
                            </div>
                            {isSavingTopics && (
                              <span className="text-[10px] sm:text-xs text-white/80 flex items-center gap-1">
                                <RefreshCw className="w-3 h-3 animate-spin" />
                                Saving...
                              </span>
                            )}
                          </div>
                        </div>

                        {/* HR Section */}
                        <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-3 sm:p-5">
                          <div className="flex items-center justify-between gap-2 mb-1.5 sm:mb-2">
                            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                              <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
                                <Users className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-brand-blue" />
                              </div>
                              <div className="flex flex-wrap items-center gap-1 sm:gap-2 min-w-0">
                                <h4 className="text-[11px] sm:text-sm font-medium text-gray-900 dark:text-slate-50">HR</h4>
                                <span className={`px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-xs font-medium ${
                                  topicSettings.hr_enabled
                                    ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25'
                                    : 'bg-slate-200 text-gray-600'
                                }`}>
                                  {topicSettings.hr_enabled ? 'On' : 'Off'}
                                </span>
                                <span className="hidden sm:inline px-2 py-0.5 rounded text-xs font-medium bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20">
                                  {topicSettings.hr_scoring_type === 'informational' ? 'Informational Only' : 'Scored (0-10)'}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <span className="text-[10px] sm:text-xs text-gray-500 dark:text-slate-500 font-medium">
                                {topicSettings.hr_enabled ? 'ON' : 'OFF'}
                              </span>
                              <button
                                onClick={() => updateTopicSettings({ hr_enabled: !topicSettings.hr_enabled })}
                                disabled={isSavingTopics}
                                className={`relative w-9 sm:w-14 h-5 sm:h-7 rounded-full transition-colors ${
                                  topicSettings.hr_enabled
                                    ? 'bg-brand-blue shadow-sm shadow-brand-blue/25'
                                    : 'bg-gray-300'
                                } ${isSavingTopics ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                <div className={`absolute top-0.5 sm:top-1 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-white shadow-md transition-transform ${
                                  topicSettings.hr_enabled
                                    ? 'translate-x-4 sm:translate-x-8'
                                    : 'translate-x-0.5 sm:translate-x-1'
                                }`} />
                              </button>
                            </div>
                          </div>
                          <p className="text-[10px] sm:text-sm text-gray-600 dark:text-slate-400 pl-9 sm:pl-[52px]">
                            Behavioral questions, cultural fit, and soft skills evaluation.
                          </p>
                        </div>

                        {/* Technical Section */}
                        <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-3 sm:p-5">
                          <div className="flex items-center justify-between gap-2 mb-1.5 sm:mb-2">
                            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                              <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-xl bg-brand-cyan/10 ring-1 ring-brand-cyan/15 flex items-center justify-center flex-shrink-0">
                                <Brain className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-brand-cyan" />
                              </div>
                              <div className="flex flex-wrap items-center gap-1 sm:gap-2 min-w-0">
                                <h4 className="text-[11px] sm:text-sm font-medium text-gray-900 dark:text-slate-50">Technical</h4>
                                <span className={`px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-xs font-medium ${
                                  topicSettings.technical_enabled
                                    ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25'
                                    : 'bg-slate-200 text-gray-600'
                                }`}>
                                  {topicSettings.technical_enabled ? 'On' : 'Off'}
                                </span>
                                <span className="hidden sm:inline px-2 py-0.5 rounded text-xs font-medium bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20">
                                  {topicSettings.technical_scoring_type === 'informational' ? 'Informational Only' : 'Scored (0-10)'}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <span className="text-[10px] sm:text-xs text-gray-500 dark:text-slate-500 font-medium">
                                {topicSettings.technical_enabled ? 'ON' : 'OFF'}
                              </span>
                              <button
                                onClick={() => updateTopicSettings({ technical_enabled: !topicSettings.technical_enabled })}
                                disabled={isSavingTopics}
                                className={`relative w-9 sm:w-14 h-5 sm:h-7 rounded-full transition-colors ${
                                  topicSettings.technical_enabled
                                    ? 'bg-brand-blue shadow-sm shadow-brand-blue/25'
                                    : 'bg-gray-300'
                                } ${isSavingTopics ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                <div className={`absolute top-0.5 sm:top-1 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-white shadow-md transition-transform ${
                                  topicSettings.technical_enabled
                                    ? 'translate-x-4 sm:translate-x-8'
                                    : 'translate-x-0.5 sm:translate-x-1'
                                }`} />
                              </button>
                            </div>
                          </div>
                          <p className="text-[10px] sm:text-sm text-gray-600 dark:text-slate-400 pl-9 sm:pl-[52px]">
                            Domain knowledge, tools, regulations, and workflows.
                          </p>
                        </div>

                        {/* Coding Section */}
                        <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-3 sm:p-5">
                          <div className="flex items-center justify-between gap-2 mb-1.5 sm:mb-2">
                            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                              <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-xl bg-brand-orange/10 ring-1 ring-brand-orange/15 flex items-center justify-center flex-shrink-0">
                                <Code className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-brand-orange" />
                              </div>
                              <div className="flex flex-wrap items-center gap-1 sm:gap-2 min-w-0">
                                <h4 className="text-[11px] sm:text-sm font-medium text-gray-900 dark:text-slate-50">Coding</h4>
                                <span className={`px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-xs font-medium ${
                                  topicSettings.coding_enabled
                                    ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25'
                                    : 'bg-slate-200 text-gray-600'
                                }`}>
                                  {topicSettings.coding_enabled ? 'On' : 'Off'}
                                </span>
                                <span className="hidden sm:inline px-2 py-0.5 rounded text-xs font-medium bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20">
                                  {topicSettings.coding_scoring_type === 'informational' ? 'Informational Only' : 'Scored (0-10)'}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <span className="text-[10px] sm:text-xs text-gray-500 dark:text-slate-500 font-medium">
                                {topicSettings.coding_enabled ? 'ON' : 'OFF'}
                              </span>
                              <button
                                onClick={() => updateTopicSettings({ coding_enabled: !topicSettings.coding_enabled })}
                                disabled={isSavingTopics}
                                className={`relative w-9 sm:w-14 h-5 sm:h-7 rounded-full transition-colors ${
                                  topicSettings.coding_enabled
                                    ? 'bg-brand-blue shadow-sm shadow-brand-blue/25'
                                    : 'bg-gray-300'
                                } ${isSavingTopics ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                <div className={`absolute top-0.5 sm:top-1 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-white shadow-md transition-transform ${
                                  topicSettings.coding_enabled
                                    ? 'translate-x-4 sm:translate-x-8'
                                    : 'translate-x-0.5 sm:translate-x-1'
                                }`} />
                              </button>
                            </div>
                          </div>
                          <p className="text-[10px] sm:text-sm text-gray-600 dark:text-slate-400 pl-9 sm:pl-[52px]">
                            Algorithms, data structures, frameworks, and patterns.
                          </p>
                        </div>

                        {/* Important Notice */}
                        <div className="flex items-start gap-2 p-3 sm:p-4 bg-amber-50 rounded-lg border border-amber-200">
                          <Info className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs sm:text-sm text-amber-800">
                              <span className="font-medium">Important:</span> Disabled topics won't appear in section distribution when creating assessments. Existing assessments remain unchanged.
                            </p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  /* Proctoring Settings Content */
                  <div className="space-y-4 sm:space-y-6">
                {/* Loading State */}
                {isLoadingProctoring ? (
                  <div className="flex items-center justify-center py-8 sm:py-12 tf-loader-center">
                    <div className="text-center">
                      <Loader2 className="w-10 h-10 text-brand-blue animate-spin mx-auto mb-3" />
                      <p className="text-sm text-gray-600 dark:text-slate-400">Loading proctoring settings...</p>
                    </div>
                  </div>
                ) : proctoringError && !proctoringSettings ? (
                  <div className="flex flex-col items-center justify-center py-8 sm:py-12">
                    <AlertTriangle className="w-10 h-10 sm:w-12 sm:h-12 text-red-400 mb-3 sm:mb-4" />
                    <p className="text-sm text-red-600 mb-3 sm:mb-4 text-center">{proctoringError}</p>
                    <button
                      onClick={loadProctoringData}
                      className="flex items-center gap-2 px-4 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg text-sm transition-all shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Retry
                    </button>
                  </div>
                ) : proctoringSettings && (
                  <>
                    {/* Settings Header with Status */}
                    <div className="bg-brand-blue rounded-xl p-3 sm:p-4 shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                            <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                          </div>
                          <div>
                            <h3 className="text-xs sm:text-sm font-medium text-white">Proctoring Settings</h3>
                            <p className="text-[10px] sm:text-xs text-white/80">
                              Configure security features
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                          {isSavingProctoring && (
                            <span className="text-[10px] sm:text-xs text-white/80 flex items-center gap-1">
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              <span className="hidden sm:inline">Saving...</span>
                            </span>
                          )}
                          {flaggedCount > 0 && (
                            <span className="px-2 sm:px-3 py-0.5 sm:py-1 bg-red-500 text-white rounded-full text-[10px] sm:text-xs font-medium whitespace-nowrap">
                              {flaggedCount} Flagged
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Error Message */}
                    {proctoringError && (
                      <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                        <p className="text-sm text-red-700">{proctoringError}</p>
                      </div>
                    )}

                    {/* Main Proctoring Toggle */}
                    <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-3 sm:p-5">
                      <div className="flex flex-col gap-3">
                        {/* Top row: icon + title + toggle */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
                              <Video className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue" />
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
                              <h4 className="text-xs sm:text-sm font-medium text-gray-900 dark:text-slate-50">Proctoring Mode</h4>
                              <span className={`px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-xs font-medium ${
                                proctoringSettings.proctoring_enabled
                                  ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25'
                                  : 'bg-slate-200 text-gray-600'
                              }`}>
                                {proctoringSettings.proctoring_enabled ? 'Enabled' : 'Disabled'}
                              </span>
                            </div>
                          </div>
                          {/* Toggle Switch */}
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className="text-[10px] sm:text-xs text-gray-500 dark:text-slate-500 font-medium">
                              {proctoringSettings.proctoring_enabled ? 'ON' : 'OFF'}
                            </span>
                            <button
                              onClick={() => updateProctoringSettings({ proctoring_enabled: !proctoringSettings.proctoring_enabled })}
                              disabled={isSavingProctoring}
                              className={`relative w-10 sm:w-14 h-5 sm:h-7 rounded-full transition-colors ${
                                proctoringSettings.proctoring_enabled
                                  ? 'bg-brand-blue shadow-sm shadow-brand-blue/25'
                                  : 'bg-gray-300'
                              } ${isSavingProctoring ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                              <div className={`absolute top-0.5 sm:top-1 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-white shadow-md transition-transform ${
                                proctoringSettings.proctoring_enabled
                                  ? 'translate-x-5 sm:translate-x-8'
                                  : 'translate-x-0.5 sm:translate-x-1'
                              }`} />
                            </button>
                          </div>
                        </div>
                        {/* Description */}
                        <p className="text-[10px] sm:text-sm text-gray-600 dark:text-slate-400">
                          {proctoringSettings.proctoring_enabled
                            ? 'Advanced monitoring is active for test integrity.'
                            : 'Standard mode — no advanced monitoring. Enable for high-stakes assessments.'
                          }
                        </p>
                        {/* Privacy Notice */}
                        {proctoringSettings.proctoring_enabled && (
                          <div className="flex items-start gap-1.5 sm:gap-2 p-2 sm:p-3 bg-brand-blue/5 rounded-lg ring-1 ring-brand-blue/15">
                            <Info className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-blue flex-shrink-0 mt-0.5" />
                            <p className="text-[10px] sm:text-xs text-gray-700 dark:text-slate-300">
                              <span className="font-medium">Privacy:</span> Candidates are informed before starting. Recordings stored for {proctoringSettings.recording_retention_days} days.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Individual Security Features */}
                    <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-3 sm:p-6">
                      <h3 className="text-xs sm:text-sm font-medium text-gray-900 dark:text-slate-50 mb-3 sm:mb-4">Security Features</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-4">
                        {[
                          { key: 'webcam_monitoring', name: 'Webcam Monitoring', description: 'Record and analyze candidate video during assessment', icon: Video },
                          { key: 'screen_recording', name: 'Screen Recording', description: 'Capture screen activity throughout the test', icon: Monitor },
                          { key: 'screenshot_blocking', name: 'Screenshot Block', description: 'Detect screenshot and screen recording attempts. When enabled, apply best-effort blocking in browser.', icon: Monitor },
                          { key: 'tab_switch_detection', name: 'Tab Switch Detection', description: 'Detect when candidates switch browser tabs', icon: Eye },
                          { key: 'ai_cheating_prevention', name: 'AI Cheating Prevention', description: 'AI-powered detection of suspicious behavior', icon: Brain },
                          { key: 'copy_paste_blocking', name: 'Copy-Paste Blocking', description: 'Prevent copying questions or pasting answers', icon: Clipboard },
                          { key: 'browser_lockdown', name: 'Browser Lockdown', description: 'Restrict access to other applications', icon: Lock },
                        ].map((feature) => {
                          const IconComponent = feature.icon;
                          const isEnabled = proctoringSettings[feature.key as keyof ProctoringSettings] as boolean;
                          return (
                            <div key={feature.key} className="flex items-center justify-between gap-2 p-2.5 sm:p-4 bg-gray-50 dark:bg-slate-800/50 rounded-lg">
                              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                                <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-white dark:bg-slate-900 flex items-center justify-center flex-shrink-0 border border-gray-200 dark:border-slate-700">
                                  <IconComponent className="w-3 h-3 sm:w-4 sm:h-4 text-gray-600 dark:text-slate-400" />
                                </div>
                                <div className="min-w-0">
                                  <div className="text-[10px] sm:text-sm font-medium text-gray-900 dark:text-slate-50 leading-tight">{feature.name}</div>
                                  <div className="text-[10px] sm:text-xs text-gray-500 dark:text-slate-500 line-clamp-1 sm:line-clamp-2 hidden sm:block">{feature.description}</div>
                                </div>
                              </div>
                              <button
                                onClick={() => updateProctoringSettings({ [feature.key]: !isEnabled })}
                                disabled={isSavingProctoring || !proctoringSettings.proctoring_enabled}
                                className={`relative w-9 sm:w-11 h-5 sm:h-6 rounded-full transition-colors flex-shrink-0 ${
                                  isEnabled && proctoringSettings.proctoring_enabled
                                    ? 'bg-green-500'
                                    : 'bg-gray-300'
                                } ${isSavingProctoring || !proctoringSettings.proctoring_enabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                <div className={`absolute top-0.5 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-white shadow-md transition-transform ${
                                  isEnabled ? 'translate-x-4 sm:translate-x-5' : 'translate-x-0.5'
                                }`} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Masking */}
                    <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-4 sm:p-6">
                      <h3 className="text-sm font-medium text-gray-900 dark:text-slate-50 mb-4 tracking-tight">Masking</h3>
                      <div className="flex items-start justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
                            <Mail className="w-4 h-4 text-brand-blue" />
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-900 dark:text-slate-50">Email Masking in PDF</div>
                            <div className="text-xs text-gray-500 dark:text-slate-500">
                              When enabled, candidate emails are masked (e.g. j******e@example.com) in downloaded Assessment PDFs.
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <button
                            onClick={() => updateProctoringSettings({ email_masking_enabled: !proctoringSettings.email_masking_enabled })}
                            disabled={isSavingProctoring}
                            className={`relative w-14 h-7 rounded-full transition-colors ${
                              proctoringSettings.email_masking_enabled ? 'bg-green-500' : 'bg-gray-300'
                            } ${isSavingProctoring ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            <div className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-md transition-transform ${
                              proctoringSettings.email_masking_enabled ? 'translate-x-7' : 'translate-x-0.5'
                            }`} />
                          </button>
                          <span className="text-xs text-gray-500 dark:text-slate-500 font-medium">
                            {proctoringSettings.email_masking_enabled ? 'ON' : 'OFF'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Threshold Settings */}
                    <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-4 sm:p-6">
                      <h3 className="text-sm font-medium text-gray-900 dark:text-slate-50 mb-4 tracking-tight">Threshold Settings</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
                        <div>
                          <label className="block text-xs text-gray-600 dark:text-slate-400 mb-2">Max Tab Switches Before Warning</label>
                          <input
                            type="number"
                            value={proctoringSettings.max_tab_switches}
                            onChange={(e) => updateProctoringSettings({ max_tab_switches: parseInt(e.target.value) || 3 })}
                            disabled={isSavingProctoring || !proctoringSettings.proctoring_enabled}
                            className="w-full px-3 py-1.5 sm:py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue disabled:bg-slate-100 disabled:cursor-not-allowed text-black"
                            min="1"
                            max="10"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] sm:text-xs text-gray-600 dark:text-slate-400 mb-1.5 sm:mb-2">Max Violations Before Flag</label>
                          <input
                            type="number"
                            value={proctoringSettings.max_violations_before_flag}
                            onChange={(e) => updateProctoringSettings({ max_violations_before_flag: parseInt(e.target.value) || 5 })}
                            disabled={isSavingProctoring || !proctoringSettings.proctoring_enabled}
                            className="w-full px-3 py-1.5 sm:py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue disabled:bg-slate-100 disabled:cursor-not-allowed text-black"
                            min="1"
                            max="20"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] sm:text-xs text-gray-600 dark:text-slate-400 mb-1.5 sm:mb-2">Recording Retention (Days)</label>
                          <input
                            type="number"
                            value={proctoringSettings.recording_retention_days}
                            onChange={(e) => updateProctoringSettings({ recording_retention_days: parseInt(e.target.value) || 90 })}
                            disabled={isSavingProctoring || !proctoringSettings.proctoring_enabled}
                            className="w-full px-3 py-1.5 sm:py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue disabled:bg-slate-100 disabled:cursor-not-allowed text-black"
                            min="7"
                            max="365"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Recent Proctoring Events */}
                    <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-3 sm:p-6">
                      <div className="flex items-center justify-between mb-3 sm:mb-4">
                        <h3 className="text-xs sm:text-sm font-medium text-gray-900 dark:text-slate-50">Recent Proctoring Events</h3>
                        <span className="text-[10px] sm:text-xs text-gray-500 dark:text-slate-500">{proctoringEventsTotal} total</span>
                      </div>
                      {isLoadingProctoringEvents ? (
                        <div className="flex items-center justify-center py-8 tf-loader-center">
                          <Loader2 className="w-6 h-6 text-brand-blue animate-spin mr-2" />
                          <span className="text-sm text-gray-500 dark:text-slate-500">Loading events...</span>
                        </div>
                      ) : proctoringEvents.length === 0 ? (
                        <div className="text-center py-8">
                          <Shield className="w-12 h-12 text-brand-blue/40 mx-auto mb-3" />
                          <p className="text-sm text-gray-500 dark:text-slate-500">No proctoring events recorded yet</p>
                          <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">Events will appear here when candidates take proctored assessments</p>
                        </div>
                      ) : (
                        <div className="space-y-2 sm:space-y-3">
                          {proctoringEvents.slice(0, 5).map((event) => (
                            <div key={event.id} className="flex items-center justify-between gap-2 p-2.5 sm:p-3 bg-gray-50 dark:bg-slate-800/50 rounded-lg">
                              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                                <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                                  event.severity === 'high' ? 'bg-red-100' :
                                  event.severity === 'medium' ? 'bg-yellow-100' : 'bg-gray-100'
                                }`}>
                                  <AlertTriangle className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${
                                    event.severity === 'high' ? 'text-red-500' :
                                    event.severity === 'medium' ? 'text-yellow-500' : 'text-gray-400'
                                  }`} />
                                </div>
                                <div className="min-w-0">
                                  <div className="text-xs sm:text-sm font-medium text-gray-900 dark:text-slate-50 capitalize truncate">
                                    {event.event_type.replace(/_/g, ' ')}
                                  </div>
                                  <div className="text-[10px] sm:text-xs text-gray-500 dark:text-slate-500 truncate">
                                    {event.candidate_name || 'Unknown'} • {event.assessment_title || 'Assessment'}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                                <span className={`px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-xs font-medium ${
                                  event.severity === 'high' ? 'bg-red-100 text-red-700' :
                                  event.severity === 'medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'
                                }`}>
                                  {event.severity}
                                </span>
                                {event.reviewed ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-500" />
                                ) : (
                                  <span className="w-2 h-2 bg-orange-400 rounded-full" />
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
                  </div>
                )}
              </div>
            ) : isLoading ? (
              /* Loading State */
              <div className="flex items-center justify-center py-12 tf-loader-center">
                <div className="text-center">
                  <Loader2 className="w-10 h-10 text-brand-blue animate-spin mx-auto mb-3" />
                  <p className="text-gray-600 dark:text-slate-400">Loading assessments...</p>
                </div>
              </div>
            ) : filteredAssessments.length === 0 ? (() => {
              /* One shared ListEmptyState for both zeros this list can reach.
                 It picks the flavour itself from `isNarrowed`: a search or
                 filter that matched nothing gets "No assessments match …" plus
                 a Reset, and a tab with no records of its own gets that tab's
                 wording from `assessmentEmptyCopy`.

                 This replaces three hand-rolled blocks — a "no match" state, a
                 "no assessments yet" state and the Archived one — whose icon
                 sizes, heading weights and copy had each been written
                 separately. */
              const copy = assessmentEmptyCopy();
              return (
                <ListEmptyState
                  icon={activeTab === 'archived' ? Archive : FileText}
                  isNarrowed={assessmentListNarrowed}
                  query={assessmentSearchQuery}
                  entityLabel="assessment"
                  emptyTitle={copy.title}
                  emptyDescription={copy.description}
                  onReset={clearAssessmentFilters}
                  action={copy.canCreate ? (
                    /* The page's own Create action, permission handling and
                       all, in the shared empty-state button class. */
                    <button
                      onClick={() => {
                        if (!canCreateAssessment) {
                          toast.error('You do not have permission to create assessments');
                          return;
                        }
                        handleOpenCreation();
                      }}
                      disabled={!canCreateAssessment}
                      title={!canCreateAssessment ? 'You do not have permission to create assessments' : ''}
                      className={TAB_EMPTY_ACTION_CLASS}
                    >
                      <Sparkles className="w-4 h-4" />
                      Create Assessment
                    </button>
                  ) : undefined}
                />
              );
            })()
            : (
              /* List View */
              <div className="space-y-3">
                {visibleAssessments.map((assessment) => renderJobListRow(assessment))}
              </div>
            )}

            {assessmentPaginationVisible && (
              <ListPagination
                currentPage={assessmentCurrentPage}
                itemsPerPage={assessmentItemsPerPage}
                totalItems={assessmentResultCount}
                onPageChange={setAssessmentCurrentPage}
                onItemsPerPageChange={setAssessmentItemsPerPage}
                itemLabel="jobs"
              />
            )}
          </div>
        </div>
        </>
        )}

      </div>
      </div>

      {/* Share Assessment Modal */}
      {/* Send Invite picker — which assessment are we inviting to? Only shown
          when more than one is shareable; a single one goes straight through.

          Rebuilt on the Invite to Assessment dialog in My Resumes
          (`app/(dashboard)/recruitment/my-resumes/page.tsx`), which is the
          fuller treatment of the same question, and which in turn takes its
          shell, header, body and footer from the Apply to Job / Score Resume
          dialogs. So this is not a new design; it is this dialog rejoining the
          one the rest of the candidate actions already share.

          What that changes, beyond paint:

            - The pick is now a pick. Rows are radios, one at a time, in a
              card that lights up when chosen — instead of a plain button that
              fired on click and closed the dialog before you could see what
              you had done.
            - A footer that reports the state ("Select one job to continue",
              then what is about to happen) and carries Cancel and the primary
              action, so leaving and committing are both explicit.
            - The list IS the Total Jobs list. It is not styled after it and
              not grouped into a hierarchy of its own: `renderJobListRow` and
              `collapseByLineage` are the functions the Job List on this page
              renders from, called here over `shareableAssessments`. One job
              per row, with that job's Job ID chip, title, status pill and all
              four metrics, exactly as the list behind the dialog draws them.
              The earlier job → job version → assessment version hierarchy is
              gone; picking a job sends against the assessment that represents
              it, which is the same assessment Total Jobs shows on that row.
            - The header loses its `from-brand-blue via-brand-cyan` gradient for
              the reference's plain bar and small tinted icon chip. Same reason
              the Topic Availability header lost its gradient: nothing retunes
              the `from-`/`to-` utilities for dark mode.

          The icon stays `Mail` rather than the reference's `ClipboardCheck` —
          the chip's shape and tint are what make it the same dialog, and this
          one is about sending rather than about assessments.

          One deliberate divergence in wording: the reference's primary button
          says "Send Invitations" because by then the candidates are already
          picked and unticked on that screen. Here nobody has been addressed
          yet — the recipients are entered in the Share modal this opens — so
          the button says "Continue". Same position, same styling, same icon;
          only the promise is scaled to what actually happens next. */}
      {showInvitePicker && (
        <>
          <div
            className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm z-50 animate-in fade-in duration-200"
            onClick={closeInvitePicker}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] w-full max-w-[95vw] sm:max-w-lg md:max-w-2xl lg:max-w-6xl xl:max-w-7xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="flex-shrink-0 flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-slate-700/60">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex-shrink-0">
                    <Mail className="w-4 h-4 text-brand-blue" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50 tracking-tight">Send Invite</h2>
                    <p className="text-xs text-gray-500 dark:text-slate-500 mt-0.5">Open a job&rsquo;s versions, then pick the assessment version to send</p>
                  </div>
                </div>
                <button
                  onClick={closeInvitePicker}
                  className="p-1.5 text-gray-500 dark:text-slate-500 hover:text-brand-blue hover:bg-brand-blue/5 rounded-md transition-colors flex-shrink-0"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
                {/* Search first, then the list — the reference's order and its
                    labelled, icon-led field, rather than a bare input. */}
                <div className="mb-4">
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Search Jobs</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" />
                    <input
                      type="text"
                      value={invitePickerQuery}
                      onChange={(e) => setInvitePickerQuery(e.target.value)}
                      placeholder="Search by job title, Job ID, assessment name or assessment ID..."
                      className="w-full pl-10 pr-4 py-2 text-sm text-black dark:text-slate-100 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 mb-3">
                  <label className="text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-300">
                    Select an Assessment
                    {/* The SAME number the Total Jobs list prints in its
                        "Job List (N)" heading, from the same collapse over the
                        same array - not a second count of a narrower set.
                        Counting `shareableAssessments` instead is what made
                        the two disagree: it drops Drafts, Archived rows and
                        revoked-invite rows, so the dialog reported fewer jobs
                        than the page behind it. Those jobs are listed here now
                        and disabled, which is why the counts can match. */}
                    {assessments.length > 0 && (() => {
                      const jobCount = collapseByLineage(assessments).length;
                      return (
                        <span className="ml-2 font-normal text-gray-500 dark:text-slate-400">
                          {jobCount} job{jobCount !== 1 ? 's' : ''}
                        </span>
                      );
                    })()}
                  </label>
                  {/* Back to nothing picked. Both, because the version list
                      only exists under a picked job - clearing the version
                      alone would leave that list open over no choice. */}
                  {invitePickerSelection && (
                    <button
                      onClick={() => setInvitePickerSelection(null)}
                      className="text-xs text-brand-blue hover:text-brand-blue-2 font-medium"
                    >
                      Clear Selection
                    </button>
                  )}
                </div>

                {(() => {
                  const query = invitePickerQuery.trim().toLowerCase();
                  /* Narrowed BEFORE the collapse, so a job stays on screen when
                     the version that matched is not the one representing it -
                     searching an older version's assessment id still finds its
                     job. The fields are the ones the old picker searched. */
                  /* Narrowed BEFORE the collapse, so a job stays on screen
                     when the version that matched is not the one representing
                     it. Over `assessments` - the whole loaded set, the array
                     the Total Jobs list collapses too - rather than only the
                     sendable ones, so this list and that one hold the same
                     jobs and can report the same count. */
                  const matching = assessments.filter((assessment) =>
                    !query ||
                    `${assessment.title || ''} ${assessment.short_id || ''} ${assessment.job?.title || ''} ${assessment.jd_short_id || ''}`
                      .toLowerCase()
                      .includes(query)
                  );
                  /* One row per job, from `collapseByLineage` - the very
                     function the Job List builds its rows with, so a job is
                     represented here by the same assessment it is represented
                     by there. */
                  const jobRows = collapseByLineage(matching);
                  /* Which jobs actually have something sendable. Not a
                     filter any more - a job with only Drafts is listed and
                     disabled rather than omitted, which is what lets this
                     list hold the same jobs, and print the same count, as the
                     Total Jobs list behind it. */
                  const invitableJobKeys = new Set(
                    shareableAssessments.map((a) => lineageKeyOf(a)),
                  );
                  /* Per-job figures over the very set these rows are built
                     from, so a card's metrics describe the job as this list
                     shows it. Not `jobRowTotals`, which is summed over
                     `filteredAssessments` and therefore moves with the page's
                     active tab - on the Draft tab it would report 0
                     assessments beside every job in this dialog. */
                  const pickerJobTotals = buildJobRowTotals(assessments);
                  if (jobRows.length === 0) {
                    return (
                      <div className="text-center py-8 text-gray-500 dark:text-slate-400">
                        <Briefcase className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-slate-700" />
                        <p>{query ? 'No jobs match your search' : 'No jobs found'}</p>
                        <p className="text-sm">{query ? 'Try a different job title or Job ID.' : 'Create an assessment against a job first.'}</p>
                      </div>
                    );
                  }
                  const selection = invitePickerSelection;
                  return (
                    <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-0.5">
                      {jobRows.map((assessment) => {
                        const jobKey = lineageKeyOf(assessment);
                        const ownsSelection = selection?.jobKey === jobKey;
                        /* Two different reasons a card can be out of play, and
                           they read the same to the eye but not to the copy:
                           another job holds the pick, or this job has no
                           version that can take an invite at all. */
                        /* Faded, not barred. Another job holding the
                           selection is not a reason this one cannot be
                           opened - picking an assessment inside it is exactly
                           how the selection moves. */
                        const dimmed = !!selection && !ownsSelection;
                        /* The only genuinely inert case, and it is about the
                           DATA: no published assessment anywhere in this job,
                           so there is nothing to send however the reader
                           clicks. */
                        const nothingSendable = !invitableJobKeys.has(jobKey);
                        const jobTitle =
                          assessment.job?.title || stripVersionFromTitle(assessment.title);
                        return (
                          <div
                            key={jobKey}
                            title={
                              nothingSendable
                                ? 'This job has no published assessment to invite against'
                                : dimmed
                                  ? 'Open this job and pick an assessment to move your selection here'
                                  : undefined
                            }
                            className={nothingSendable ? 'cursor-not-allowed' : undefined}
                          >
                            {renderJobListRow(assessment, {
                              selectMode: true,
                              selected: !!ownsSelection,
                              disabled: nothingSendable,
                              dimmed,
                              totals: pickerJobTotals,
                              selectedAssessmentId: ownsSelection
                                ? selection?.assessmentId
                                : undefined,
                              /* Highlights the chosen PAIR inside this job's
                                 panel - the job version and the assessment -
                                 and fades its siblings without disabling any
                                 of them. Only for the job that owns the pick;
                                 the others have nothing to highlight. */
                              activeSelection:
                                ownsSelection && selection
                                  ? {
                                      jobVersion: selection.jobVersion,
                                      assessmentId: selection.assessmentId,
                                    }
                                  : null,
                              /* Everything the Share modal will need, recorded
                                 where all three parts are actually known: the
                                 job from this card, the job version from the
                                 panel group the radio sits in, the assessment
                                 from the row itself. */
                              onSelectAssessment: (assessmentId, context) =>
                                setInvitePickerSelection({
                                  jobKey,
                                  jdId: assessment.jd_id,
                                  jdShortId: assessment.jd_short_id,
                                  jobTitle,
                                  jobVersion: context.jobVersion,
                                  jobVersionId: context.jobVersionId,
                                  assessmentId,
                                }),
                            })}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Footer */}
              <div className="shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 sm:p-6 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-200 dark:border-slate-700">
                {/* One line, always: it sits beside the buttons, and a second
                    line would push the footer taller. */}
                <div className="min-w-0 truncate whitespace-nowrap text-xs sm:text-sm text-gray-700 dark:text-slate-300">
                  {/* Names the VERSION that will be sent, or says why the
                      picked one cannot be - the table offers every version of
                      a job, Drafts and Archived among them, so "selected" and
                      "sendable" are two different questions and the footer has
                      to answer the second. Resolved off live data for the same
                      reason Continue is. */}
                  {(() => {
                    const chosen = resolveInvitePickerChoice();
                    const blocked = invitePickerBlockedReason(chosen);
                    if (!invitePickerSelection) {
                      return 'Open a job\u2019s versions and select an assessment to continue';
                    }
                    if (blocked) {
                      return (
                        <span className="inline-flex items-center gap-1.5 align-middle text-brand-orange-deep">
                          <Info className="w-4 h-4 flex-shrink-0" />
                          {blocked}
                        </span>
                      );
                    }
                    const jobV = invitePickerSelection.jobVersion;
                    const assessmentV = typeof chosen?.version === 'number' ? chosen.version : null;
                    return (
                      <span className="inline-flex items-center gap-1.5 align-middle">
                        <CheckCircle className="w-4 h-4 text-brand-blue flex-shrink-0" />
                        {assessmentV
                          ? `Ready to invite candidates to Assessment V${assessmentV}${jobV ? ` (Job V${jobV})` : ''}`
                          : 'Ready to invite candidates to 1 assessment'}
                      </span>
                    );
                  })()}
                </div>
                <div className="flex gap-2 sm:gap-3 w-full sm:w-auto">
                  <button
                    onClick={closeInvitePicker}
                    className="flex-1 sm:flex-none px-4 py-2 text-sm bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      const choice = resolveInvitePickerChoice();
                      const blocked = invitePickerBlockedReason(choice);
                      if (!choice || !invitePickerSelection || blocked) {
                        toast.error(blocked ?? 'Please select an assessment version');
                        return;
                      }
                      /* Hand the share dialog the triple that was actually
                         picked, not just the assessment record.
                         `resolveInvitePickerChoice` may have found the row in
                         the panel's lineage cache, and those rows carry
                         `jd_id` and `jd_version` but neither the JD's short id
                         nor its title - so the modal's "JD-025 - Senior QA v2"
                         line came out blank, or worse, showed the job version
                         recorded on the assessment rather than the one the
                         reader chose it under.

                         The selection knows all three parts because each was
                         recorded where it was known: the job from the card,
                         the job version from the panel group the radio sat in,
                         the assessment from the row. Selection wins over the
                         record for exactly those fields; everything else on
                         the assessment is passed through untouched. */
                      setSelectedAssessmentForShare({
                        ...choice,
                        jd_id: invitePickerSelection.jobVersionId ?? choice.jd_id,
                        jd_short_id: choice.jd_short_id ?? invitePickerSelection.jdShortId,
                        jd_title: choice.jd_title || invitePickerSelection.jobTitle,
                        jd_version: invitePickerSelection.jobVersion,
                        job: {
                          ...(choice.job ?? {}),
                          title: choice.job?.title || invitePickerSelection.jobTitle,
                          version: invitePickerSelection.jobVersion,
                        },
                      });
                      closeInvitePicker();
                      setShowShareModal(true);
                    }}
                    disabled={!!invitePickerBlockedReason(resolveInvitePickerChoice())}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 text-sm whitespace-nowrap bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-colors shadow-md shadow-brand-blue/25 ring-1 ring-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Mail className="w-4 h-4" />
                    Continue
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {showShareModal && selectedAssessmentForShare && (
        <ShareAssessmentModal
          isOpen={showShareModal}
          onClose={() => {
            setShowShareModal(false);
            setSelectedAssessmentForShare(null);
            // Refresh the list so invitation counts / Track Invites
            // badges reflect the just-sent invites.
            reloadAssessments();
          }}
          assessment={selectedAssessmentForShare}
          inviteSource="Assessment"
        />
      )}
      
      {/* Preview Assessment Modal */}
      {showPreviewModal && selectedAssessmentForPreview && (
        <AssessmentPreviewModal
          isOpen={showPreviewModal}
          onClose={() => {
            setShowPreviewModal(false);
            setSelectedAssessmentForPreview(null);
          }}
          assessment={selectedAssessmentForPreview}
        />
      )}
      
      {/* Job Version History popup - the Job Details page's own, unwrapped, so
          the job read from this list is the one that page shows. Opened by the
          Job List row's eye (on the version list) and by each Job Versions
          row's eye (on that version). */}
      {jobDetailsPopup && (
        <JDVersionHistoryModal
          isOpen
          onClose={() => setJobDetailsPopup(null)}
          jdId={jobDetailsPopup.jdId}
          jdTitle={jobDetailsPopup.jdTitle}
          initialVersionNumber={jobDetailsPopup.versionNumber ?? undefined}
        />
      )}

      {/* Edit Assessment Modal */}
      {showEditModal && selectedAssessmentForEdit && (
        <AssessmentEditModal
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setSelectedAssessmentForEdit(null);
          }}
          assessment={selectedAssessmentForEdit}
          onSave={async (updatedAssessment) => {
            // Reload from API to get the updated assessment
            await reloadAssessments();
            console.log('Assessment updated:', updatedAssessment);
          }}
        />
      )}

      {/* Track Invites Modal */}
      {showTrackInvitesModal && selectedAssessmentForTracking && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-4 md:p-6">
          {/* Height is content-driven with a viewport cap, not a fixed 95dvh:
              a 3-invite list on a 27" monitor used to stretch the dialog the
              full screen with an empty table below the rows. The table shell
              (flex-1 min-h-0) absorbs the overflow once the cap engages, so a
              long list still scrolls inside the dialog on a 320px phone. */}
          <div
            /* Width was never in question - it is fixed by the breakpoint
               ladder below and no state touches it. Height is what moved, so
               only height is pinned, and only while a refresh is in flight. */
            {...trackingHeightLock.dialogProps}
            className={TRACKER_DIALOG_PANEL_CLASS}>
            {/* Modal Header */}
            <div className="px-3 sm:px-6 py-2.5 sm:py-4 border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 flex items-center justify-between flex-shrink-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-brand-blue flex items-center justify-center shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 flex-shrink-0">
                    <Users className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm sm:text-lg font-semibold text-gray-900 dark:text-slate-50 truncate tracking-tight">
                      <span className="hidden sm:inline">Assessments - Invite Status Tracking</span>
                      <span className="sm:hidden">Invite Status</span>
                    </h2>
                    {/* What the popup is scoped to. A job names itself and
                        says how many versions are in the table, so the reader
                        knows the rows below span more than one assessment; a
                        single assessment names itself, as before. */}
                    {trackingJob ? (
                      <p
                        className="text-[10px] sm:text-sm text-gray-500 dark:text-slate-500 mt-0.5 truncate"
                        title={`${trackingJob.jobId ? trackingJob.jobId + ' - ' : ''}${trackingJob.jobTitle}`}
                      >
                        {trackingJob.jobId ? `${trackingJob.jobId} - ` : ''}
                        {trackingJob.jobTitle}
                        {' '}
                        <span className="text-gray-400 dark:text-slate-600">
                          - all job versions ({trackingJob.assessments.length} assessment
                          {trackingJob.assessments.length === 1 ? '' : 's'})
                        </span>
                      </p>
                    ) : (
                      <p className="text-[10px] sm:text-sm text-gray-500 dark:text-slate-500 mt-0.5 truncate">{selectedAssessmentForTracking.title}</p>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                {/* Refetches the live statuses in place — the popup stays open,
                    the icon spins while the request runs, and the handler's
                    guard drops repeat clicks until it settles. */}
                <button
                  onClick={refreshTrackingInvitations}
                  disabled={isRefreshingTracking || isLoadingInvitations}
                  title="Fetch the latest invite statuses"
                  aria-label="Refresh"
                  className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 text-xs sm:text-sm border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 ${isRefreshingTracking ? 'animate-spin' : ''}`} />
                  {/* The label swaps to "Refreshing..." mid-request, and the
                      longer word used to widen the button and shove the close
                      X sideways - a small shake of its own, right where the
                      pointer still is. The span reserves the wider word's
                      width in both states, so the header never moves. */}
                  <span className="hidden sm:inline-block min-w-[5.5rem] text-left">
                    {isRefreshingTracking ? 'Refreshing...' : 'Refresh'}
                  </span>
                </button>
                <button
                  onClick={closeTrackInvitesModal}
                  className="p-2 text-gray-400 dark:text-slate-500 hover:text-brand-blue hover:bg-brand-blue/5 rounded-lg transition-colors"
                 aria-label="Close">
                  <X className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>
            </div>

            {/* Stat row doubles as the status filter — same component, buckets
                and wording as the JD-level popup and the AI Interview trackers.
                Counts come from the API's unfiltered summary, so selecting a
                bucket narrows the table without collapsing the other cards. */}
            <InviteStatCards
              gridClassName="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-5 gap-1 sm:gap-2 lg:gap-4"
              activeStatus={trackingFilters.status}
              onSelect={(status) => {
                setTrackingFilters({ ...trackingFilters, status });
                setTrackingCurrentPage(1);
              }}
              cards={[
                { key: 'all', label: 'Total Invited', Icon: Users, value: invitationStats.total, ...INVITE_CARD_TONES.blue },
                { key: 'expired', label: 'Expired', Icon: Clock, value: invitationStats.expired, ...INVITE_CARD_TONES.orange },
                { key: 'started', label: 'In Progress', Icon: Play, value: invitationStats.started, ...INVITE_CARD_TONES.cyan },
                { key: 'completed', label: 'Completed', Icon: CheckCircle, value: invitationStats.completed, ...INVITE_CARD_TONES.green },
                {
                  key: 'completion-rate',
                  label: 'Completion Rate',
                  Icon: TrendingUp,
                  value: `${invitationStats.total > 0 ? Math.round((invitationStats.completed / invitationStats.total) * 100) : 0}%`,
                  filterable: false,
                  ...INVITE_CARD_TONES.purple,
                },
              ]}
            />

            {/* Row clicks open Result Details only for Completed / Auto
                Completed invites — this note tells the recruiter why the
                other rows don't navigate anywhere. Same banner treatment as
                the Note on the duplicate-resume dialog, in the brand blue
                info tone. */}
            <div className="px-2.5 sm:px-6 pt-2 sm:pt-3 flex-shrink-0">
              <div className="flex items-center gap-2.5 rounded-xl bg-brand-blue/[0.08] border border-brand-blue/20 px-3 py-2.5">
                <Info className="w-4 h-4 text-brand-blue flex-shrink-0" />
                <p className="text-xs sm:text-sm text-gray-700 dark:text-slate-300">
                  <span className="font-semibold">Note:</span> Results are available only for candidates with Complete status. Other candidates&rsquo; results are not available.
                </p>
              </div>
            </div>

            <InviteFilterBar
              filters={trackingFilters}
              onChange={(nextFilters) => {
                setTrackingFilters(nextFilters);
                setTrackingCurrentPage(1);
              }}
              /* Invite Failed / Terminated are dropped from this popup's status
                 dropdown (their stat cards are gone too); the shared list is
                 filtered here so the JD-level tracker keeps its full set.
                 "All Statuses" stays first — selecting it clears the status
                 narrowing, i.e. every status is included again. */
              statusOptions={ASSESSMENT_INVITE_STATUS_OPTIONS.filter(
                (option) => !['failed', 'abandoned'].includes(option.value)
              )}
              searchPlaceholder="Search by candidate name, email, or CID..."
            />

            {/* Select All — same control, wording and placement as the AI
                Interviews tracker's bulk-select bar. */}
            {/* `showTrackingInitialLoader`, not `isLoadingInvitations`: this
                bar disappearing and reappearing during a Refresh was one more
                height change in the stack of them. Its own contents come from
                `trackingInvitations`, which the refresh keeps. */}
            {!showTrackingInitialLoader && trackingSelectableIds.length > 0 && (
              <div className="flex items-center justify-between gap-2 px-2.5 sm:px-6 pt-2.5 sm:pt-3 flex-shrink-0">
                <button
                  type="button"
                  onClick={toggleTrackingSelectAll}
                  className="flex items-center gap-2 text-xs sm:text-sm text-gray-600 dark:text-slate-400 hover:text-brand-blue transition-colors"
                >
                  <span
                    role="checkbox"
                    aria-checked={allTrackingSelected}
                    className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors ${
                      allTrackingSelected
                        ? 'bg-brand-blue border-brand-blue'
                        : 'bg-white dark:bg-slate-900 border-gray-300 dark:border-slate-600'
                    }`}
                  >
                    {allTrackingSelected && <Check className="w-3 h-3 text-white" />}
                  </span>
                  Select All ({trackingSelectableIds.length})
                </button>
                {/* Bulk Resend — appears once something is ticked. Count and
                    targets are the still-eligible selection only. */}
                {trackingSelectedIds.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowBulkResendConfirm(true)}
                    disabled={isBulkResending}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-semibold bg-brand-blue text-white rounded-lg hover:bg-brand-blue-2 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 transition-colors whitespace-nowrap"
                  >
                    {isBulkResending
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Mail className="w-3.5 h-3.5" />}
                    {isBulkResending ? 'Sending…' : `Resend (${trackingSelectedIds.size})`}
                  </button>
                )}
              </div>
            )}

            {/* Invitations Table / Cards */}
            {/* overflow-hidden, not overflow-auto: the shell below is the
                single vertical scroller. Two nested scrollers meant this one
                won, scrolling the sticky header and pinned Actions column
                away with the rest of the table. */}
            {/* `relative` so the refresh veil below can cover exactly this
                body without being part of its flow - an overlay adds no
                height, which is the whole point of it. */}
            <div className="relative px-2.5 sm:px-6 py-2.5 sm:py-4 overflow-hidden flex-1 min-h-0 flex flex-col">
              {showTrackingInitialLoader ? (
                /* Nothing to show yet, so the spinner IS the body - and it
                   FILLS it, rather than collapsing the dialog to a 200px box
                   that then jumps to table height when the rows land. The
                   dialog's min-height reserves the space; this occupies it. */
                <div className={TRACKER_DIALOG_PLACEHOLDER_CLASS}>
                  <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 text-brand-blue animate-spin" />
                </div>
              ) : trackingInvitations.length === 0 ? (
                <div className={`${TRACKER_DIALOG_PLACEHOLDER_CLASS} text-gray-500 dark:text-slate-500`}>
                  <Users className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 text-brand-blue/40" />
                  <p className="text-xs sm:text-sm">
                    {trackingHasActiveFilters
                      ? 'No invitations match the current filters.'
                      : trackingJob
                        ? 'No invitations found for any version of this job.'
                        : 'No invitations found for this assessment.'}
                  </p>
                </div>
              ) : (
                /* Outer border on the scroll shell rather than the table: the
                   shell is what stays put, so a border on the table itself would
                   scroll away with the content. Deliberately no overflow-hidden —
                   the shell's overflow:auto is what lets the wide auto-layout
                   table scroll sideways. */
                <div className="tf-table-shell tf-table-shell--compact tf-table-shell--fill flex-1 min-h-0 border border-gray-200 dark:border-slate-700 rounded-lg">
                  {/* Auto layout, not table-fixed. The colgroup widths summed
                      past the table's min-width, so every column was scaled
                      down; combined with the shell's white-space: nowrap the
                      content overflowed its cell instead of reflowing, and the
                      sticky header stopped lining up with the rows. Columns now
                      size to their own content and the shell scrolls sideways.
                      px-4 on every cell gives the consistent column gutter. */}
                  <table className="w-max min-w-full">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-slate-700">
                        <th className="w-8 py-3 pl-4 pr-0 tf-sticky-col-left" aria-label="Select" />
                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">CID</th>
                        {/* Job scope only: with invites from several
                            assessments in one table, the row has to say which
                            job version its assessment belongs to - that is the
                            whole point of tracking a job rather than an
                            assessment. Reading one assessment there is nothing
                            to disambiguate, so neither column is there.

                            TWO columns, not one compound cell: a job version
                            and an assessment version are separate facts about
                            the row - the job was republished, the assessment
                            was re-authored - and they do not move together.
                            Side by side in this order they still read as the
                            relationship they are: this assessment version, on
                            that job version. */}
                        {trackingJob && (
                          <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Job Version</th>
                        )}
                        {trackingJob && (
                          <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Assessment Version</th>
                        )}
                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Candidate</th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                        {/* hidden md:table-cell mirrors this column's <td>. Without
                            it the header carried one more cell than the body between
                            sm and md, shifting every heading after Timeline off its
                            column. */}
                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Timeline</th>
                        {/* Tech / Coding Score columns are conditional on the
                            assessment having that round enabled — same rule as
                            the Results page. Showing a "Coding Score" column
                            for a JD without a coding round produced a
                            permanent "—" column that confused recruiters. */}
                        {trackingTechEnabled && (
                          <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tech Score</th>
                        )}
                        {trackingCodingEnabled && (
                          <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Coding Score</th>
                        )}
                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider tf-sticky-col">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                      {trackingInvitations.map((invitation: any) => {
                            const initials = invitation.candidate_name
                              ?.split(' ')
                              .map((n: string) => n[0])
                              .join('')
                              .toUpperCase()
                              .slice(0, 2) || '??';
  
                        /* Only Completed / Auto Completed rows are interactive —
                           other statuses have no Result Details to open, so the
                           row carries no click handler, button role, or pointer
                           cursor. */
                        const rowOpensDetails = opensTrackedDetails(invitation);

                        return (
                          <tr
                            key={invitation.id}
                            onClick={rowOpensDetails ? () => openTrackedInviteResult(invitation) : undefined}
                            onKeyDown={rowOpensDetails ? (e: React.KeyboardEvent) => {
                              // The row is exposed as a button to assistive tech,
                              // so it has to answer to the button keys too.
                              if (e.key !== 'Enter' && e.key !== ' ') return;
                              e.preventDefault();
                              openTrackedInviteResult(invitation);
                            } : undefined}
                            role={rowOpensDetails ? 'button' : undefined}
                            tabIndex={rowOpensDetails ? 0 : undefined}
                            title={rowOpensDetails ? 'View result details' : undefined}
                            className={rowOpensDetails
                              ? 'transition-colors cursor-pointer hover:bg-brand-blue/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue/40'
                              : 'transition-colors hover:bg-gray-50 dark:hover:bg-slate-800'}
                          >
                            {/* stopPropagation: Complete rows navigate on click —
                                ticking a checkbox must never also open the row.
                                Only bulk-resendable rows (Invited/Expired) get a
                                checkbox; the rest keep a fixed-width slot so the
                                columns stay aligned. */}
                            <td className="py-3 pl-4 pr-0 align-top tf-sticky-col-left" onClick={(e) => e.stopPropagation()}>
                              {isBulkResendable(invitation) ? (
                                <button
                                  type="button"
                                  role="checkbox"
                                  aria-checked={trackingSelectedIds.has(invitation.id)}
                                  aria-label={`Select ${invitation.candidate_name || invitation.candidate_email || 'candidate'}`}
                                  onClick={() => toggleTrackingSelectOne(invitation.id)}
                                  className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors ${
                                    trackingSelectedIds.has(invitation.id)
                                      ? 'bg-brand-blue border-brand-blue'
                                      : 'bg-white dark:bg-slate-900 border-gray-300 dark:border-slate-600 hover:border-brand-blue/50'
                                  }`}
                                >
                                  {trackingSelectedIds.has(invitation.id) && <Check className="w-3 h-3 text-white" />}
                                </button>
                              ) : (
                                <span className="inline-block w-5" />
                              )}
                            </td>
                            <td className="py-3 px-4 align-top">
                              <span className="inline-block text-xs font-mono font-medium text-brand-blue bg-brand-blue/5 px-2 py-1 rounded ring-1 ring-brand-blue/20">
                                {invitation.candidate_display_id || '-'}
                              </span>
                            </td>
                            {/* The job version this invite's assessment was
                                built against - the version panel's own blue
                                chip, so V2 reads the same wherever a recruiter
                                meets it. */}
                            {trackingJob && (
                              <td className="py-3 px-4 align-top">
                                <VersionChip kind="job" version={invitation._jd_version} />
                              </td>
                            )}
                            {/* The assessment version, in the panel's cyan -
                                the version and nothing else. The assessment's
                                own id sat under it and was noise in a column
                                asked for a version; the assessment is named in
                                the row's actions and on the page it opens. */}
                            {trackingJob && (
                              <td className="py-3 px-4 align-top">
                                <VersionChip kind="assessment" version={invitation._assessment_version} />
                              </td>
                            )}
                            <td className="py-3 px-4 align-top">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/20 flex items-center justify-center text-brand-blue font-medium text-sm flex-shrink-0">
                                  {initials}
                                </div>
                                {/* Capped rather than free: under auto layout a
                                    single long email would otherwise set the
                                    column width for the whole table. */}
                                <div className="min-w-0 max-w-[240px]">
                                  <p className="font-medium text-gray-900 dark:text-slate-50 text-sm truncate" title={invitation.candidate_name}>{invitation.candidate_name}</p>
                                  <p className="text-xs text-gray-500 dark:text-slate-500 truncate" title={invitation.candidate_email}>{invitation.candidate_email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4 align-top">
                              {/* Status is the badge alone. Expiry is resolved inside
                                  renderInviteStatusBadge, so a lapsed invite renders one Expired
                                  badge — not its old status with a chip beside it — and
                                  the failed row's "Incorrect Email" note now lives only
                                  in the Edit Email flow. */}
                              {renderInviteStatusBadge(invitation)}
                            </td>
                                <td className="py-3 px-4 align-top text-xs text-gray-500 dark:text-slate-500 hidden md:table-cell">
                                  <div className="space-y-1">
                                    {invitation.sent_at && (
                                      <div className="flex items-center gap-2">
                                        <Mail className="w-3 h-3 text-status-invited flex-shrink-0" />
                                        <span className="text-status-invited">Invited: {formatIST(invitation.sent_at)}</span>
                                  </div>
                                )}
                                {invitation.bounced_at && (
                                  <div className="flex items-center gap-2">
                                    <RefreshCw className="w-3 h-3 text-red-600 flex-shrink-0" />
                                    <span className="text-red-600">Bounced: {formatIST(invitation.bounced_at)}</span>
                                  </div>
                                )}
                                {invitation.opened_at && (
                                  <div className="flex items-center gap-2">
                                    <Monitor className="w-3 h-3 text-status-progress flex-shrink-0" />
                                    <span className="text-status-progress">System Check: {formatIST(invitation.opened_at)}</span>
                                  </div>
                                )}
                                {invitation.started_at && (
                                  <div className="flex items-center gap-2">
                                    <Play className="w-3 h-3 text-status-progress flex-shrink-0" />
                                    <span className="text-status-progress">Started: {formatIST(invitation.started_at)}</span>
                                  </div>
                                )}
                                {invitation.completed_at && (
                                  <div className="flex items-center gap-2">
                                    <CheckCircle className="w-3 h-3 text-status-completed flex-shrink-0" />
                                    <span className="text-status-completed">Completed: {formatIST(invitation.completed_at)}</span>
                                  </div>
                                )}
                                {invitation.terminated_at && !invitation.completed_at && (
                                  <div className="flex items-center gap-2">
                                    <Ban className="w-3 h-3 text-red-600 flex-shrink-0" />
                                    <span className="text-red-600">Terminated: {formatIST(invitation.terminated_at)}</span>
                                  </div>
                                )}
                                {/* Expired-at timestamp — shown when the link
                                    has expired (status='expired' or clock-based
                                    expiry on a never-started invite). The
                                    expires_at column holds the deadline; we
                                    surface it as the moment of expiry. */}
                                {(() => {
                                  const s = (invitation.status || '').toLowerCase();
                                  const clockExpired = !invitation.started_at
                                    && !invitation.unit_consumed
                                    && invitation.expires_at
                                    && new Date(invitation.expires_at) < new Date();
                                  const isExpired = !invitation.completed_at
                                    && (s === 'expired' || clockExpired);
                                  if (!isExpired || !invitation.expires_at) return null;
                                  return (
                                    <div className="flex items-center gap-2">
                                      <Clock className="w-3 h-3 text-status-expired flex-shrink-0" />
                                      <span className="text-status-expired">Expired at: {formatIST(invitation.expires_at)}</span>
                                    </div>
                                  );
                                })()}
                                {!invitation.sent_at && !invitation.started_at && (
                                  <div className="flex items-center gap-2">
                                    <Clock className="w-3 h-3 text-gray-400 flex-shrink-0" />
                                    <span>Created: {formatIST(invitation.created_at)}</span>
                                  </div>
                                )}
                              </div>
                            </td>
                            {/* Tech Score / Coding Score columns. Same pattern
                                as the Results page: percent number on top, small
                                Pass/Fail tag below, both colored against the 70%
                                threshold. Rounded so the value matches every
                                other surface (Results list, Detail view, PDF).
                                Show "—" until AI scoring is finished — surfacing
                                0% / Fail mid-evaluation was misleading because
                                the candidate's answers haven't been judged yet.
                                Cells are gated on the round being enabled for
                                this assessment so a Tech-only JD doesn't carry
                                an empty Coding column. */}
                            {/* Score is shown when a numeric value is on the
                                row. Earlier the gate also required
                                scoring_status === 'completed', but the
                                listInvitations endpoint didn't include that
                                field — which silently hid every score. The
                                backend now ships scoring_status; we still
                                treat its absence as "show the score if it
                                exists" so the popup keeps parity with the
                                Results page. */}
                            {trackingTechEnabled && (() => {
                              const techReady =
                                invitation.technical_score != null
                                && invitation.scoring_status !== 'processing'
                                && invitation.scoring_status !== 'pending';
                              return (
                                <td className="py-3 px-4 align-top text-sm text-center">
                                  {techReady ? (
                                    <div className="flex flex-col items-center gap-0.5">
                                      <span className={`font-medium ${invitation.technical_score >= 70 ? 'text-brand-blue' : 'text-red-600'}`}>
                                        {Math.round(invitation.technical_score)}%
                                      </span>
                                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ring-1 ${invitation.technical_score >= 70 ? 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20' : 'bg-red-50 text-red-600 ring-red-200'}`}>
                                        {invitation.technical_score >= 70 ? 'Pass' : 'Fail'}
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="text-gray-400">—</span>
                                  )}
                                </td>
                              );
                            })()}
                            {trackingCodingEnabled && (() => {
                              const codingReady =
                                invitation.coding_score != null
                                && invitation.scoring_status !== 'processing'
                                && invitation.scoring_status !== 'pending';
                              return (
                                <td className="py-3 px-4 align-top text-sm text-center">
                                  {codingReady ? (
                                    <div className="flex flex-col items-center gap-0.5">
                                      <span className={`font-medium ${invitation.coding_score >= 70 ? 'text-brand-blue' : 'text-red-600'}`}>
                                        {Math.round(invitation.coding_score)}%
                                      </span>
                                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ring-1 ${invitation.coding_score >= 70 ? 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20' : 'bg-red-50 text-red-600 ring-red-200'}`}>
                                        {invitation.coding_score >= 70 ? 'Pass' : 'Fail'}
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="text-gray-400">—</span>
                                  )}
                                </td>
                              );
                            })()}
                            <td className="py-3 px-4 align-top tf-sticky-col" onClick={(e) => e.stopPropagation()}>
                              {/* Actions collapse into a kebab menu. This uses Radix's
                                  DropdownMenu rather than the hand-rolled absolute
                                  dropdown the cards above use, because this table sits
                                  inside tf-table-shell (overflow: auto) — an absolutely
                                  positioned menu would be clipped by the scroll
                                  container. Radix portals the menu out of it. */}
                              {editingEmailId === invitation.id ? (
                                /* The email editor stays inline in the cell rather than
                                   living in the menu: a text input inside a menu fights
                                   the menu's own keyboard handling. Choosing "Edit Email"
                                   closes the menu and swaps the cell to this form. Held
                                   once here — it used to be duplicated across the bounced
                                   and resendable branches. */
                                <div className="flex flex-col gap-1.5 min-w-[190px]">
                                  <input
                                    type="email"
                                    value={newEmailValue}
                                    onChange={e => setNewEmailValue(e.target.value)}
                                    placeholder="new@email.com"
                                    className="text-xs border border-gray-200 dark:border-slate-700 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue w-full"
                                    autoFocus
                                  />
                                  <div className="flex gap-1">
                                    <button
                                      onClick={() => handleUpdateEmail(invitation)}
                                      disabled={!isValidInviteEmail(newEmailValue) || isSendingChangeEmail || newEmailValue.trim().toLowerCase() === (invitation.candidate_email || '').trim().toLowerCase()}
                                      className="flex items-center gap-1 px-2 py-1 text-xs bg-brand-blue hover:bg-brand-blue-2 text-white rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-brand-blue/25 ring-1 ring-white/10"
                                    >
                                      <Send className="w-3 h-3" />
                                      {isSendingChangeEmail ? 'Sending…' : 'Send'}
                                    </button>
                                    <button
                                      onClick={() => { setEditingEmailId(null); setNewEmailValue(''); }}
                                      className="px-2 py-1 text-xs text-gray-600 dark:text-slate-400 hover:bg-slate-100 rounded transition-colors"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (() => {
                                const isCompleted = invitation.status === 'completed' || !!invitation.completed_at;
                                const isBounced = invitation.status === 'bounced';
                                // Action rules by status: Invited/Expired → Resend only;
                                // System Check ('opened') and In Progress → no menu at all;
                                // Completed → View Results only. Edit Email survives only
                                // where fixing the address is the point — a failed invite
                                // (mistyped address) or a bounce.
                                const canResend = ['sent', 'failed', 'expired'].includes(invitation.status)
                                  && !invitation.started_at
                                  && !invitation.completed_at;
                                const canEditEmail = invitation.status === 'failed'
                                  && !invitation.started_at
                                  && !invitation.completed_at;

                                // Nothing actionable — render no trigger rather than an
                                // empty menu the user can open onto nothing.
                                if (!isCompleted && !isBounced && !canResend) return null;

                                return (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <button
                                        aria-label="Actions"
                                        title="Actions"
                                        className="p-1.5 text-gray-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-gray-700 dark:hover:text-slate-200 rounded transition-colors"
                                      >
                                        <MoreVertical className="w-4 h-4" />
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-44">
                                      {isCompleted && (
                                        // Completed-but-no-attempt is a rare orphaned
                                        // invitation: disabled, so we never silently drop
                                        // the user on the aggregate results page.
                                        <DropdownMenuItem
                                          className={assessmentDropdownMenuItemClass}
                                          disabled={!invitation.attempt_id}
                                          onSelect={() => openTrackedInviteResult(invitation)}
                                        >
                                          <Eye className="w-3.5 h-3.5 text-menu-icon-view" />
                                          <span className={MENU_ITEM_SCALE_CLASS}>View Results</span>
                                        </DropdownMenuItem>
                                      )}
                                      {canResend && (
                                        <DropdownMenuItem className={assessmentDropdownMenuItemClass} onSelect={() => setResendTargetInvitation(invitation)}>
                                          <Mail className="w-3.5 h-3.5 text-menu-icon-share" />
                                          <span className={MENU_ITEM_SCALE_CLASS}>Resend</span>
                                        </DropdownMenuItem>
                                      )}
                                      {(isBounced || canEditEmail) && (
                                        <DropdownMenuItem
                                          className={assessmentDropdownMenuItemClass}
                                          onSelect={() => {
                                            setEditingEmailId(invitation.id);
                                            setNewEmailValue(invitation.candidate_email);
                                          }}
                                        >
                                          <Pencil className="w-3.5 h-3.5 text-menu-icon-edit" />
                                          <span className={MENU_ITEM_SCALE_CLASS}>{isBounced ? 'Change Email' : 'Edit Email'}</span>
                                        </DropdownMenuItem>
                                      )}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                );
                              })()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Re-reading rows that are already on screen - Refresh, a page
                  turn, a filter change. The table underneath keeps its exact
                  size and place; this only tints it and says why, and it takes
                  the clicks so nobody acts on a row that is about to be
                  replaced. Absolutely positioned, so it contributes no height
                  and the dialog cannot move because of it. */}
              {showTrackingRefreshVeil && (
                <div
                  className="absolute inset-0 z-10 flex items-start justify-center pt-10 sm:pt-14 bg-white/60 dark:bg-slate-900/60 rounded-lg"
                  aria-live="polite"
                >
                  <span className="inline-flex items-center gap-2 rounded-full bg-white dark:bg-slate-900 px-3 py-1.5 text-xs sm:text-sm text-gray-600 dark:text-slate-300 shadow-sm ring-1 ring-black/[0.06] dark:ring-white/10">
                    <Loader2 className="w-3.5 h-3.5 text-brand-blue animate-spin" />
                    Refreshing invite statuses...
                  </span>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            {/* Stacks on phones: the count line plus four page buttons and Close
                overflowed a 320px row and pushed Close off-screen. First/Last are
                hidden below sm — Prev/Next and the page indicator are enough on a
                phone, and the full set comes back from sm up. */}
            <div className="px-3 sm:px-6 py-2.5 sm:py-4 border-t border-gray-100 dark:border-slate-700/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-3 bg-slate-50 dark:bg-slate-950 shrink-0">
              <p className="text-[11px] sm:text-sm text-gray-500 dark:text-slate-500 text-center sm:text-left order-2 sm:order-1">
                {trackingResultsLabel}
              </p>
              <div className="flex items-center justify-center sm:justify-end flex-wrap gap-1.5 sm:gap-2 order-1 sm:order-2">
                {trackingPaginationVisible && (
                  <InlinePageNav
                    page={trackingCurrentPage}
                    totalPages={trackingTotalPages}
                    onPageChange={setTrackingCurrentPage}
                  />
                )}
                <button
                  onClick={closeTrackInvitesModal}
                  className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-all shadow-sm shadow-brand-blue/25 ring-1 ring-white/10"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Resend confirmation — regenerates token, invalidates old link */}
      <ConfirmationDialog
        isOpen={!!resendTargetInvitation}
        onClose={() => { if (!isResending) setResendTargetInvitation(null); }}
        onConfirm={() => resendTargetInvitation && handleResendInvitation(resendTargetInvitation)}
        title="Invalidate old link & send new invitation?"
        description={
          resendTargetInvitation
            ? `A fresh invitation will be emailed to ${resendTargetInvitation.candidate_email}. The previous link will stop working immediately.`
            : ''
        }
        confirmText={isResending ? 'Sending…' : 'Yes, send new link'}
        cancelText="Cancel"
        variant="warning"
      >
        {resendTargetInvitation && (() => {
          const preview = computeResendExpiryPreview(resendTargetInvitation);
          if (!preview) return null;
          return (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
              <p className="text-amber-900 font-medium mb-1">New link expiry</p>
              <p className="text-amber-800">
                Valid for <strong>{preview.durationLabel}</strong> from now — expires on{' '}
                <strong>{preview.dateLabel}</strong>.
              </p>
              <p className="text-amber-700 text-xs mt-2">
                Same duration as the original invitation.
              </p>
            </div>
          );
        })()}
      </ConfirmationDialog>

      {/* Bulk resend confirmation for the Invitation Status tab — the same
          ConfirmationDialog, wording and warning tone as the popup's below,
          counting its own selection. */}
      <ConfirmationDialog
        isOpen={showInviteBulkResendConfirm}
        onClose={() => { if (!isBulkResending) setShowInviteBulkResendConfirm(false); }}
        onConfirm={handleInviteBulkResend}
        title="Resend invitations to selected candidates?"
        description={`A fresh invitation link will be emailed to ${inviteBulkResendCount} selected candidate${inviteBulkResendCount === 1 ? '' : 's'}. Each candidate's previous link will stop working immediately.`}
        confirmText={isBulkResending ? 'Sending…' : `Yes, resend to ${inviteBulkResendCount}`}
        cancelText="Cancel"
        variant="warning"
      />

      {/* Bulk resend confirmation — selected Invited/Expired candidates only. */}
      <ConfirmationDialog
        isOpen={showBulkResendConfirm}
        onClose={() => { if (!isBulkResending) setShowBulkResendConfirm(false); }}
        onConfirm={handleBulkResend}
        title="Resend invitations to selected candidates?"
        description={`A fresh invitation link will be emailed to ${trackingSelectedIds.size} selected candidate${trackingSelectedIds.size === 1 ? '' : 's'}. Each candidate's previous link will stop working immediately.`}
        confirmText={isBulkResending ? 'Sending…' : `Yes, resend to ${trackingSelectedIds.size}`}
        cancelText="Cancel"
        variant="warning"
      />

      {/* Duplicate confirmation — creates a DRAFT copy as the lineage's next
          version. The recruiter publishes it and invites its candidates
          manually through the normal invite flow; nothing is sent from here.

          Its own dialog rather than the shared `ConfirmationDialog` the other
          confirmations on this page use: this one has to SHOW the move it is
          about to make — the job the version stays on, and the draft version
          that comes out the other side — and a title/description pair cannot
          draw that. Everything it acts on is the same state as before
          (`cloneTargetAssessment`, `isCloning`, `handleConfirmClone`). */}
      {cloneTargetAssessment && (() => {
        /* WHICH version this will mint. `handleOpenCloneModal` force-loads the
           lineage before opening this dialog, so the highest version that
           actually exists is already on hand; the target's own version stands
           in if that fetch failed.

           Archived rows COUNT here, unlike the cap they are excluded from: an
           archived V3 still owns the number 3, so the next version is 4
           whether or not it is archived. */
        const sourceVersion = Number(cloneTargetAssessment.version) || 1;
        const lineageRows = assessmentLineages[cloneTargetAssessment.jd_id ?? ''] ?? [];
        const nextVersion = lineageRows.reduce(
          (highest, row) => Math.max(highest, Number(row.version) || 0),
          sourceVersion,
        ) + 1;
        const jobTitle = cloneTargetAssessment.jd_title
          || cloneTargetAssessment.job?.title
          || stripVersionFromTitle(cloneTargetAssessment.title || '')
          || 'This job';
        const jobVersion = cloneTargetAssessment.jd_version ?? 1;

        const closeIfIdle = () => { if (!isCloning) setCloneTargetAssessment(null); };

        return (
        <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 w-full max-w-[95vw] sm:max-w-2xl max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden">
            {/* Header and the two panels scroll together, so the actions stay
                reachable on a short viewport. */}
            <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-7 pt-5 sm:pt-7 pb-5 sm:pb-6">
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-blue-50 dark:bg-blue-500/15 flex items-center justify-center flex-shrink-0">
                  <Copy className="w-5 h-5 sm:w-6 sm:h-6 text-brand-blue dark:text-blue-300" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-slate-50 tracking-tight leading-tight">
                    Create Version {nextVersion}?
                  </h3>
                  <p className="text-sm sm:text-base text-gray-500 dark:text-slate-400 mt-1 leading-snug">
                    A new draft version of this assessment will be created for the same job.
                    Version {sourceVersion} will remain unchanged, and you can edit Version{' '}
                    {nextVersion} before publishing.
                  </p>
                </div>
                <button
                  onClick={closeIfIdle}
                  disabled={isCloning}
                  className="p-1.5 -mr-1.5 -mt-1 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 flex-shrink-0"
                  aria-label="Close"
                >
                  <X className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
              </div>

              {/* FROM — the job the lineage belongs to, which the new version
                  stays on. Unchanged by the duplicate, which is the point of
                  showing it. */}
              <div className="mt-5 sm:mt-6 rounded-xl border border-gray-200/80 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3 sm:p-4">
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-brand-blue/10 flex items-center justify-center flex-shrink-0">
                    <Briefcase className="w-5 h-5 text-brand-blue" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400">Current Job</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                      {cloneTargetAssessment.jd_short_id && (
                        <>
                          {/* The app's one Job ID badge, not a fourth variant
                              of the same identifier — see JobIdBadge. */}
                          <JobIdBadge className="flex-shrink-0">
                            {cloneTargetAssessment.jd_short_id}
                          </JobIdBadge>
                          <span aria-hidden="true" className="text-gray-300 dark:text-slate-600">|</span>
                        </>
                      )}
                      <span className="text-sm sm:text-lg font-semibold text-gray-900 dark:text-slate-50 break-words">
                        {jobTitle}
                      </span>
                      <span aria-hidden="true" className="text-gray-300 dark:text-slate-600">|</span>
                      <span className="text-sm sm:text-lg font-semibold text-gray-900 dark:text-slate-50">
                        V{jobVersion}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-center py-2 sm:py-2.5" aria-hidden="true">
                <ArrowDown className="w-5 h-5 sm:w-6 sm:h-6 text-gray-400 dark:text-slate-500" />
              </div>

              {/* TO — what the confirm button actually produces: a draft, which
                  is why the panel is amber and carries the same Draft pill the
                  lists use. */}
              <div className="rounded-xl border border-amber-200/70 bg-amber-50 p-3 sm:p-4">
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-amber-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400">New Assessment Version</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <span className="text-sm sm:text-lg font-semibold text-gray-900 dark:text-slate-50">
                        Assessment Version {nextVersion}
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800 text-xs sm:text-sm font-semibold">
                        Draft
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex-shrink-0 border-t border-gray-200 dark:border-slate-700 px-5 sm:px-7 py-3 sm:py-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3">
              <button
                onClick={closeIfIdle}
                disabled={isCloning}
                className="px-5 sm:px-8 py-2.5 text-sm font-semibold text-gray-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmClone}
                disabled={isCloning}
                className="px-5 sm:px-8 py-2.5 text-sm font-semibold bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
              >
                {isCloning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Duplicating…
                  </>
                ) : (
                  <>
                    Create Version {nextVersion}
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Revoke confirmation — invalidates only PENDING / SENT links.
          Candidates who have opened, started, or completed the assessment
          are deliberately not touched. */}
      <ConfirmationDialog
        isOpen={!!revokeTargetAssessment}
        onClose={() => { if (!isRevoking) setRevokeTargetAssessment(null); }}
        onConfirm={handleConfirmRevoke}
        title="Revoke pending invite links?"
        description={
          revokeTargetAssessment
            ? `Pending invite links for "${stripVersionFromTitle(revokeTargetAssessment.title || '')}" will stop working immediately.`
            : ''
        }
        confirmText={isRevoking ? 'Revoking…' : 'Revoke links'}
        cancelText="Cancel"
        variant="warning"
      >
        {revokeTargetAssessment && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
            <p className="text-amber-900 font-medium mb-1">
              {revokeCount === null
                ? 'Counting eligible invitations…'
                : `${revokeCount} link${revokeCount === 1 ? '' : 's'} will be revoked.`}
            </p>
            <p className="text-amber-800 text-xs mt-1">
              Only candidates who have <strong>not yet opened</strong> their invitation are affected. Anyone already in progress or completed will be left alone and can finish.
            </p>
          </div>
        )}
      </ConfirmationDialog>
    </main>
  );
}
