'use client';

import JobIdBadge from '@/components/jobs/JobIdBadge';
import { InviteSourceValue, assessmentInviteSource } from '@/components/AIInterviewInviteTable';
import { Plus, Clock, Calendar, Users, CheckCircle, FileText, ArrowDown, ArrowRight, FileCheck, MoreVertical, Play, Sparkles, Eye, Edit2, BarChart, Mail, Trash2, Copy, Archive, Download, Link2, Share2, PauseCircle, Monitor, Brain, Code, ClipboardList, Globe, Pencil, Shield, Video, X, Info, CheckCircle2, Check, MonitorOff, Clipboard, Lock, TrendingUp, Activity, Loader2, ClipboardCheck, ChevronRight, ListFilter, FilterX, FileDown, FileSpreadsheet, CheckSquare, Square } from 'lucide-react';
import { StatsCard, StatsCardGrid } from '@/components/ui/stats-card';
import { MENU_ITEM_SCALE_CLASS } from '@/lib/constants/menuAnimation';
import { useState, useEffect, useRef, type Dispatch, type ReactNode, type SetStateAction } from 'react';
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
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import InviteFilterBar, { EMPTY_INVITE_FILTERS, ASSESSMENT_INVITE_STATUS_OPTIONS, type InviteFilterState } from './InviteFilterBar';
import InviteStatCards, { INVITE_CARD_TONES } from './InviteStatCards';
import AssessmentInviteTable, {
  InviteStatusBadge,
  isTrackedInviteCompleted,
  opensTrackedInviteDetails,
  isValidInviteEmail,
} from '@/components/assessments/AssessmentInviteTable';
import ListToolbar from '@/components/ui/list-toolbar';
import ListFilterPanel from '@/components/ui/list-filter-panel';
/* The one position every tab's search row lands in. See the note on the
   component: the toolbar itself was already shared, but each tab drew it
   somewhere else, so switching tabs moved the search box. */
import {
  ListToolbarSlot,
  ListToolbarSlotProvider,
  ListToolbarPortal,
  useListToolbarSlot,
} from '@/components/ui/list-toolbar-slot';
import { Skeleton } from '@/components/ui/skeleton';
import ListCountBadge from '@/components/ui/list-count-badge';
/* The two shared empty states. ListEmptyState covers a LIST in its two
   flavours — narrowed to nothing by a search/filter (keep the controls, offer
   a reset) versus no records at all; TabEmptyState covers a tab that has no
   records at all and no filters of its own. Both are documented at their
   definitions, and this page had been hand-rolling four variants of them. */
import ListEmptyState from '@/components/ui/list-empty-state';
import TabEmptyState from '@/components/ui/tab-empty-state';
/* The Position filter's control. The same SearchableSelect the All Assessments
   table uses for its Job filter — a plain <select> stops working once the
   option list is drawn from data, which a tenant's job list is. */
import SearchableSelect, { type SearchableSelectOption } from '@/components/ui/searchable-select';
import { useListSearch } from '@/lib/hooks/useListSearch';
import type { AssessmentAttemptResponse } from '@/lib/services/assessmentService';

import { Job } from '@/lib/types/types';
import { assessmentService } from '@/lib/services';
import {
  buildInvitationRowActions,
  InvitationActionsMenu,
  InvitationActionButtons,
  ViewFullHistoryLink,
  hasMoreTimelineHistory,
  EditInvitationModal,
  RevokeInvitationDialog,
  InvitationHistoryDialog,
  timelineEvents,
  latestTimelineStatus,
  isRevocableInvitation,
  canResendInvite,
} from '@/components/AssessmentInviteActions';

/* Bulk-selection eligibility for the Invite Tracking popup and the
   Invitation Status tab — the two surfaces whose per-row menu comes from
   AssessmentInviteActions (buildInvitationRowActions), so their bulk rule has
   to match ITS status split, not the simpler Invited-is-directly-resendable
   rule the Assessment Details page's own invite table uses (Scenario 4:
   bulk action must match the row action, and a mixed-status selection gets
   neither). */
const isBulkRevocable = isRevocableInvitation;
const isBulkResendable = canResendInvite;
const isBulkActionable = (inv: any): boolean => isBulkRevocable(inv) || isBulkResendable(inv);
/* Resume versions live on the scoring records — see the join in
   loadAllCompletedCandidates. */
import { scoringService } from '@/lib/services/scoringService';
import { recordAssessment } from '@/lib/services/usageTrackingService';
import api from '@/lib/services/api';
import { proctoringService, ProctoringSettings, ProctoringEvent } from '@/lib/services/proctoringService';
import { AlertTriangle, RefreshCw, Send, Ban, Layers, Briefcase, ChevronDown, Radar, Search, ChevronLeft, ArrowUpDown } from 'lucide-react';
import { stripVersionFromTitle, isAssessmentRevoked } from '@/lib/utils/assessmentUtils';
import { formatIST, formatISTDate } from '@/lib/utils/dateUtils';
import { useGlobalDialog } from '@/components/providers/GlobalDialogProvider';
import { toast } from 'sonner';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { IS_PRODUCTION_ENV } from '@/lib/utils/env';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import QuotaBadge from '@/components/ui/quota-badge';
import AllAssessmentsTable, { VersionPill } from '@/components/assessments/AllAssessmentsTable';
import AssessmentVersionHistoryPanel, { type AssessmentVersionRow, VersionChip } from '@/components/assessments/AssessmentVersionHistoryPanel';
import { useJobVersionLineage } from '@/lib/hooks/useJobVersionLineage';
import { latestVersionNumber } from '@/lib/utils/jobOpeningDisplay';
/* The Job Opening → Job Version → Assessment retrieval, as one implementation
   shared with every surface that reports on a whole job. It owns both halves
   this page kept getting wrong on its own: one request PER JOB VERSION (a
   single `jd_id` request answers only for the version it named), and resolving
   an assessment's job version from the JD ROW it points at rather than from its
   own `jd_version` snapshot. See the module header. */
import {
  loadJobAssessmentHierarchy,
  resolveJobVersionsByJdId,
  jobVersionOfAssessment,
  listAllAssessments,
  type JobAssessmentHierarchy,
} from '@/lib/utils/jobAssessmentHierarchy';
import { TABLE_EMPTY_PANEL_CLASS } from '@/lib/constants/tableEmptyPanel';
import { formatScore, SCORE_CELL_TEXT } from '@/lib/utils/score';


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
    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
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

/**
 * Counts the completed candidates of the assessments it is handed, and reports
 * them back — one request per assessment, from the endpoint that reports on the
 * candidate records themselves (`/assessments/{id}/results` with `page_size: 1`:
 * the summary is what is wanted, not the rows).
 *
 * A component rather than an effect inside the page, because the page returns
 * early (Creation, Results, Details) above every derivation these ids come
 * from, so an effect there would be a hook after a conditional return. It
 * renders nothing; it is mounted by the Job List, which is the one surface
 * these figures are drawn on, so no other tab pays for them.
 *
 * `ids` arrives already narrowed to what the page does not know yet. The
 * in-flight set is this mount's own: an id is released again when its request
 * fails, so a failure retries rather than caching itself as "no completed
 * candidates", and the page remounts this loader (by `key`) when it wants
 * everything recounted.
 */
function JobCompletedCandidateCounts({
  ids,
  onCounted,
}: {
  ids: string[];
  /* The page's own setter, passed as-is because React keeps it stable — an
     inline callback would be a new dependency on every render. */
  onCounted: Dispatch<SetStateAction<Record<string, number>>>;
}) {
  const requestedRef = useRef<Set<string>>(new Set());
  /* One dependency that changes exactly when there is new work, rather than on
     every render that mints a new array. */
  const idsKey = ids.join(',');

  useEffect(() => {
    const pending = (idsKey ? idsKey.split(',') : []).filter((id) => !requestedRef.current.has(id));
    if (pending.length === 0) return;
    for (const id of pending) requestedRef.current.add(id);
    /* In small batches rather than all at once: a page of jobs can hold a few
       dozen assessments and the list is already fetching beside this. */
    const CONCURRENCY = 6;
    void (async () => {
      for (let start = 0; start < pending.length; start += CONCURRENCY) {
        const batch = pending.slice(start, start + CONCURRENCY);
        const counted = await Promise.all(
          batch.map(async (id) => {
            try {
              const response = await assessmentService.listResults(id, { page: 1, page_size: 1 });
              return [id, response.completed_count ?? 0] as const;
            } catch (error) {
              /* One assessment failing must not stop the others, and must not
                 be remembered as a zero — the row keeps the listed figure and
                 the id is released, so paging to another set of jobs and back,
                 or a refresh, asks again rather than being told no. */
              console.log('[TalentFlow] Failed to count completed candidates for an assessment:', error);
              requestedRef.current.delete(id);
              return null;
            }
          }),
        );
        const landed = counted.filter(Boolean) as (readonly [string, number])[];
        if (landed.length > 0) {
          onCounted((previous) => ({ ...previous, ...Object.fromEntries(landed) }));
        }
      }
    })();
  }, [idsKey, onCounted]);

  return null;
}

const INVITATIONS_PAGE_SIZE = 10;
/** Batch size when pulling every assessment for a browser-side filter. */
const FULL_SET_BATCH_SIZE = 100;
/**
 * Page size for the cross-job fan-outs (the Candidate Results and Invitation
 * Status tabs). Unchanged from the single fixed page they used to ask for, so
 * an assessment under this size still costs exactly one request — what is new
 * is that a bigger one is now followed to the end rather than truncated.
 */
const CROSS_JOB_FETCH_SIZE = 1000;

/**
 * Every page of a paged assessment endpoint, merged.
 *
 * `listAllAssessments` does this for the assessment LIST; this is the same rule
 * for the per-assessment fan-outs beneath it, which asked for one fixed page
 * and dropped whatever did not fit — the candidates of a heavily-invited
 * assessment, silently, with the tab's counts short by the same number.
 *
 * Stops on a short page, on reaching the reported total, and at a hard cap so a
 * server that ignores `page` cannot loop forever — the three guards
 * `listAllAssessments` already uses.
 */
async function collectAllPages<T>(
  fetchPage: (page: number, pageSize: number) => Promise<{ items?: T[]; total?: number }>,
  pageSize: number = CROSS_JOB_FETCH_SIZE,
): Promise<T[]> {
  const collected: T[] = [];
  let page = 1;
  for (;;) {
    const response = await fetchPage(page, pageSize);
    const items = response.items || [];
    collected.push(...items);
    const total = response.total ?? collected.length;
    if (items.length < pageSize || collected.length >= total) break;
    page++;
    if (page > 50) break;
  }
  return collected;
}
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

/* The tabs that list ASSESSMENTS, one row each, in `AllAssessmentsTable`.

   Archived joins them. It used to be the odd one out: it drew the page's own
   job-grouped list — one row per JOB, versions folded in behind View Versions
   — while Draft, the tab it sits next to and is read against, drew a flat
   table of assessments. Same page, same kind of question ("what is in this
   state?"), two different answers with different rows, different columns,
   different actions and a count in a different noun.

   Nothing about archiving changes here, and no new list is introduced: the
   Archived tab now asks `AllAssessmentsTable` for `status: 'archived'`
   exactly as Draft asks it for `status: 'draft'`. */
type FlatAssessmentTab = Extract<AssessmentPageTab, 'all' | 'active' | 'draft' | 'archived'>;

const FLAT_ASSESSMENT_TABS = ['all', 'active', 'draft', 'archived'] as const;

const isFlatAssessmentTab = (tab: AssessmentPageTab): tab is FlatAssessmentTab =>
  (FLAT_ASSESSMENT_TABS as readonly AssessmentPageTab[]).includes(tab);

/* Which cut of the assessment list each flat tab asks for — and nothing else.
   It used to carry a title and a description per tab too, which
   `AllAssessmentsTable` drew as a heading over a paragraph. Both are gone:
   embedded, that table is a tab, and the pill above it already says "All
   Assessments" / "Active" / "Draft", so the heading repeated the pill and the
   paragraph repeated the heading. The table's own route still draws the pair
   from its own defaults, where there is no pill to have named the list. */
const FLAT_ASSESSMENT_TABLE_CONFIG = {
  all: { fixedStatus: undefined },
  active: { fixedStatus: 'published' },
  draft: { fixedStatus: 'draft' },
  archived: { fixedStatus: 'archived' },
} satisfies Record<FlatAssessmentTab, { fixedStatus?: 'published' | 'draft' | 'archived' }>;

/** A completed attempt, tagged with the assessment it belongs to. */
type CandidateResultRow = AssessmentAttemptResponse & {
  _assessment_id: string;
  _assessment_short_id?: string;
  _assessment_title?: string;
  /* The three version columns. None is on AssessmentAttemptResponse - an
     attempt records the candidate and the scores, not the job version it was
     built against, nor which version of the assessment they sat, nor which
     resume got them the invite - so all three are joined on during the load
     and carried here.

       _jd_version         the JOB VERSION the parent assessment was authored
                           against (`AssessmentResponse.jd_version`). Free: the
                           load already walks those assessments.
       _assessment_version the version of the ASSESSMENT ITSELF that this
                           attempt was sat against, which increments on each
                           edit/publish. Free for the same reason - it is
                           `AssessmentResponse.version`, already on the record
                           the fan-out holds - and named to match the identical
                           field the Invitation Status rows carry, so one
                           reading of "assessment version" serves both tabs.
       _resume_version     the RESUME VERSION scored for this candidate against
                           that same job (`ScoringResponse.resume_version`).
                           Undefined when the candidate has no scoring record
                           for the job - a manually invited candidate has none -
                           and the column shows a dash rather than inventing a
                           v1. */
  /* The human-readable Job ID, e.g. JD-014 — the identifier the Job ID column
     shows. Not on the attempt either (it records the candidate, not the job's
     id), so it is joined from the parent assessment during the load, under the
     same name the Invitation Status rows give it. */
  _jd_short_id?: string;
  _jd_id?: string;
  _jd_version?: number;
  _assessment_version?: number;
  _resume_version?: number;
};

/** Session key holding the Total Jobs page a job's Results was opened from. */
const RESULTS_RETURN_PAGE_KEY = 'assessments:resultsReturnPage';

export default function Assessments({ jobs, onOpenCandidateView, onNavigateToJDCreation, autoOpenCreate, preSelectedJdId, preSelectedJdTitle, initialListTab }: AssessmentsProps) {
  const router = useRouter();
  const dialog = useGlobalDialog();
  const { user, isTenantAdmin, hasPermissionCode } = useAuth();

  // Permission checks for CRUD operations (bypass for tenant admin)
  const canCreateAssessment = isTenantAdmin || (user?.permissions?.canCreateAssessments ?? false);
  const canUpdateAssessment = isTenantAdmin || (user?.permissions?.canUpdateAssessments ?? false);
  const canDeleteAssessment = isTenantAdmin || (user?.permissions?.canDeleteAssessments ?? false);
  const canDownloadAssessmentPDF = isTenantAdmin || (user?.permissions?.canDownloadAssessmentPDF ?? false);
  const canBatchDownloadAssessmentPDF = isTenantAdmin || hasPermissionCode('assessments:batch_download');
  /* Download Report on an invitation row — gated on its own permission code only
     (a generic canDownloadAssessmentPDF/canExport fallback would default this on
     for most roles and defeat the specific toggle). */
  const canDownloadInviteReport = isTenantAdmin || hasPermissionCode('assessments:download_report');
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
  /* The single slot every tab's search / More Filters / count badge row is
     drawn in — directly above the tab pills, where the Total Jobs tab has
     always put it. Tabs whose content is a component of its own (All / Active /
     Draft, Activity Logs, Consent Logs) portal their existing toolbar up into
     it; nothing about what those toolbars filter or how moves with them. */
  const toolbarSlot = useListToolbarSlot();
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
  /* The Send Invite picker's own view state - the AI Interviews picker's:
     Ungrouped (one row per sendable assessment) or Grouped (one card per
     job), paged five at a time. UI only; the pick above is the same either
     way. Reset whenever the picker opens or closes. */
  const [invitePickerViewMode, setInvitePickerViewMode] = useState<'ungrouped' | 'grouped'>('ungrouped');
  const [invitePickerPage, setInvitePickerPage] = useState(1);
  const [invitePickerPageSize, setInvitePickerPageSize] = useState(5);
  const invitePickerScrollRef = useRef<HTMLDivElement | null>(null);
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
  /**
   * Which JOB VERSIONS have their assessment table open inside that panel,
   * per JOB.
   *
   * Held here rather than inside `AssessmentVersionHistoryPanel` because the
   * panel does not outlive the reading: opening an assessment version from it
   * navigates to that assessment's own page, and the panel is unmounted with
   * the whole list. Owning the set here is what lets it be persisted beside
   * `openVersionsFor` and restored on the way back, so Back returns the
   * recruiter to Job → V2 expanded rather than to a collapsed table they have
   * to walk down again.
   *
   * Keyed by `jd_id` for the same reason as `selectedAssessmentVersionByJob`
   * beside it: one job's reading position is not another's, and the answer has
   * to survive closing the panel and opening it again. Version NUMBERS, which
   * is what the panel groups by.
   */
  const [expandedJobVersionsByJob, setExpandedJobVersionsByJob] =
    useState<Record<string, number[]>>({});
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
    /** JD row id → job version number, resolved with the assessments above so
     *  every row can be stamped with the version it actually belongs to rather
     *  than with the `jd_version` snapshot on the record. */
    jobVersionByJdId: Map<string, number>;
  } | null>(null);
  const [selectedAssessmentForTracking, setSelectedAssessmentForTracking] = useState<any>(null);
  /* When Share is opened from the tracking popup's Invite More, the popup it
     came from — its assessment and, for a job-wide Track, its job — so closing
     Share reopens that popup rather than dropping the user on the list. The AI
     Interview page's Invite More works the same way (`shareReturnToInvites`). */
  const [shareReturnToTracking, setShareReturnToTracking] = useState<{ assessment: typeof selectedAssessmentForTracking; job: typeof trackingJob } | null>(null);
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
    invited: 0,
    revoked: 0,
  });
  const [editingEmailId, setEditingEmailId] = useState<string | null>(null);
  const [newEmailValue, setNewEmailValue] = useState('');
  const [isSendingChangeEmail, setIsSendingChangeEmail] = useState(false);
  // Resend confirmation dialog state
  const [resendTargetInvitation, setResendTargetInvitation] = useState<any | null>(null);
  const [isResending, setIsResending] = useState(false);
  // Single-invitation Revoke / Edit ("Save & Send") / full-history state —
  // shared by the Track Invites popup and the Invitation Status tab, since
  // both surfaces get the full action set and only one is ever visible.
  const [revokeInviteTarget, setRevokeInviteTarget] = useState<any | null>(null);
  const [editInviteTarget, setEditInviteTarget] = useState<any | null>(null);
  const [historyInviteTarget, setHistoryInviteTarget] = useState<any | null>(null);
  /* Clear Sort for the All / Active / Draft / Archived tables: the button
     (beside the Settings tab) bumps the signal, and the mounted table reports
     whether its sort is off the default. Recorded as WHICH tab is sorted, not
     a bare flag, so moving to another tab hides the button at once instead of
     showing it until the new table reports in. */
  const [clearAssessmentSortSignal, setClearAssessmentSortSignal] = useState(0);
  const [sortedAssessmentTab, setSortedAssessmentTab] = useState<string | null>(null);
  // Clone confirmation state — simple confirm-only modal. The recruiter
  // invites V2 candidates manually via the normal invite flow.
  const [cloneTargetAssessment, setCloneTargetAssessment] = useState<any | null>(null);
  const [isCloning, setIsCloning] = useState(false);
  // Draft-conflict modal — shown instead of the clone confirmation when the
  // lineage already has an unfinished draft; offers to open it directly.
  const [pendingDraftConflict, setPendingDraftConflict] = useState<{
    target: any;
    draft: AssessmentVersionRow;
  } | null>(null);
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
   * Completed candidates per ASSESSMENT, counted from the candidate records
   * themselves — `completed_count` off `/assessments/{id}/results`, which is
   * the tally that endpoint takes over the attempts it is reporting on, and
   * the same figure the Results page's own Completed card shows.
   *
   * Read INSTEAD OF the counter carried on the assessment list row, which is
   * what the Job List's Completed metric used to be summed from. Two different
   * numbers were being called the same thing: a recruiter who opened a job's
   * results and counted the completed candidates there did not get the number
   * the list printed beside that job.
   *
   * Keyed by assessment id — never by job or by version — so the job-wide
   * total is a sum over the job's assessments and a value is reusable by every
   * surface that asks about the same assessment. Filled in by
   * `JobCompletedCandidateCounts`, which the Job List mounts and which only
   * ever asks about the jobs on screen.
   */
  const [completedCandidatesByAssessment, setCompletedCandidatesByAssessment] = useState<Record<string, number>>({});
  /* Bumped to recount from scratch. It is the loader's `key`, so a bump
     remounts it and every count is asked for again — see `reloadAssessments`,
     where a refresh is exactly the moment a candidate may have finished. */
  const [completedCandidatesGeneration, setCompletedCandidatesGeneration] = useState(0);

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
   * JD row id → job version number, accumulated from every lineage this page
   * has resolved.
   *
   * The answer to "which job version does this assessment belong to". An
   * assessment names the JD ROW it was authored against (`jd_id`), and that row
   * is one job version exactly — while the `jd_version` number on the record is
   * a snapshot the backend stamps at creation that comes back as 1 for
   * assessments authored against later versions. Reading the number first is
   * what put every row under Job v1.
   *
   * A ref, not state: it is read while a load is building its rows (each row is
   * stamped with its version as it is merged), never during render, so filling
   * it must not schedule one. It only ever grows — a JD row's version number
   * does not change — so a hit is always as good as a fetch.
   */
  const jobVersionByJdIdRef = useRef<Map<string, number>>(new Map());

  const rememberJobVersions = (resolved: Map<string, number>) => {
    for (const [id, version] of resolved) jobVersionByJdIdRef.current.set(id, version);
    return jobVersionByJdIdRef.current;
  };

  /**
   * The last resolved Job Opening → Job Version → Assessment hierarchy per job,
   * keyed by EVERY JD row of that job rather than only the one it was requested
   * for.
   *
   * Keyed that way because the assessments list collapses a job's lineage down
   * to one representative row, and which version that is changes with the sort
   * and the filters. A hierarchy is about the whole job, so a request made
   * under any of its versions must be answerable from the entry another version
   * already filled — otherwise the same job is fetched once per version anyone
   * happens to click.
   *
   * Alongside `assessmentLineages` (the rows, which are state because the
   * version panel renders them) and written in the same place, so the two
   * cannot disagree. This half is a ref: only event handlers read it.
   */
  const jobHierarchyRef = useRef<Map<string, JobAssessmentHierarchy>>(new Map());

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
      /* The retrieval itself lives in `loadJobAssessmentHierarchy` — the
         lineage lookup, the one-request-per-version fan-out, the dedupe by
         assessment id and the job-version resolution, in one place shared with
         every other surface that reports on a whole job. What stays here is
         this page's caching of the result.
         A lineage that fails to load degrades to the card's own JD row, which
         is exactly the single-request behaviour this replaces — never worse
         than it was. */
      const hierarchy = await loadJobAssessmentHierarchy(jdId);
      /* Learned once, reused by everything that has to name a row's job
         version: the tracking popup, the Invitation Status tab, the Candidate
         Results tab. */
      rememberJobVersions(hierarchy.jobVersionByJdId);
      /* Under every version of the job, not just the one asked about — see the
         ref's own note. */
      for (const versionJdId of [jdId, ...hierarchy.jdIds]) {
        jobHierarchyRef.current.set(versionJdId, hierarchy);
      }
      const rows = hierarchy.assessments as unknown as AssessmentVersionRow[];
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

    // Deferred by one tick, deliberately. This effect is declared earlier in
    // the component than the one that loads the four stat cards
    // (`loadAllData`, further down) and React fires mount effects in
    // declaration order — so on a tenant with dozens of jobs, this used to
    // dispatch a LINEAGE REQUEST PER JOB (real traffic: ~90 concurrent
    // `GET /jd/{id}/lineage` calls, one per distinct job behind this page's
    // assessments) before the three small, critical stats/quota/topics
    // requests had even been sent. The browser's own per-host connection cap
    // then queued those critical calls behind the lineage flood, which is
    // what actually made the stat cards "take too long to load" — the stats
    // endpoint itself answers in well under a second once it's allowed to
    // run. Nothing here needs to be first paint: the LATEST-version badges
    // these lineages feed are below the fold and unaffected by a ~0-tick
    // delay, so yielding once is enough to let whatever the mount phase
    // already queued (the stats call) claim a connection slot first.
    const timer = setTimeout(() => {
      ensureJobLineages([...targets].map(([key, jobId]) => ({ key, jobId })));
    }, 0);
    return () => clearTimeout(timer);
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
  /* Candidate Results' own search and filters, in the shared hook every other
     tab on this page already uses. The tab had neither: it listed every
     completed attempt across every assessment with no way to narrow them, so
     the only tool for finding one candidate among hundreds was the browser's
     own Find. Both are client-side, because the rows are already merged here
     (see the fan-out in `loadAllCompletedCandidates`) — a server-side filter
     would have to be re-fanned out to be correct.

     Four controls, matching the Total Jobs panel's shape: the widest cut of
     the list first, then the outcome, then the date range. */
  const [showCompletedCandidateFilters, setShowCompletedCandidateFilters] = useState(false);
  const completedCandidatesSearch = useListSearch({
    initialFilters: {
      /* '' rather than 'all' — SearchableSelect's contract for "nothing
         picked", same as the Position filter on Total Jobs. */
      job: '',
      outcome: 'all' as 'all' | 'pass' | 'fail',
      completedFrom: '',
      completedTo: '',
    },
    debounceMs: 350,
    onChange: () => setCompletedCandidatesPage(1),
  });

  /* Candidate Results' page size, on Total Jobs' pagination — the same
     ListPagination and the same starting size (see assessmentItemsPerPage). */
  const [completedCandidatesPageSize, setCompletedCandidatesPageSize] = useState(10);

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
  /* Whether this tab's More Filters panel is open. The FILTER VALUES stay in
     `inviteStatusFilters` above and are read by exactly the same code as
     before — what changed is only which controls write them: the toolbar's
     search box and the panel's status/date fields, in place of the
     `InviteFilterBar` row that used to sit inside the card. Same four fields,
     same commit-as-you-change behaviour, same `EMPTY_INVITE_FILTERS` reset. */
  const [showInviteStatusFilters, setShowInviteStatusFilters] = useState(false);

  /* Rows per page — the pagination bar's Per Page select. */
  const [inviteStatusPageSize, setInviteStatusPageSize] = useState(10);

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

  /** Open a job's Results from the Total Jobs list, noting the list page so
   *  coming back lands on it again — see `heldPageResetKeyRef`. */
  const openJobResults = (href: string) => {
    try {
      window.sessionStorage.setItem(RESULTS_RETURN_PAGE_KEY, String(assessmentCurrentPage));
    } catch {
      /* Ignore unavailable sessionStorage. */
    }
    router.push(href);
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
    total_jobs_with_assessments: 0,
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
  /**
   * The JOB whose card the recruiter is to be put back in front of, set by the
   * restore below and consumed once by the effect further down.
   *
   * A ref, not state: it is a one-shot instruction for this mount, and nothing
   * renders from it. Null the rest of the time, which is also how the effect
   * knows a fresh visit from a return — a fresh visit scrolls nowhere.
   */
  const restoreScrollTargetRef = useRef<string | null>(null);
  /**
   * Coming back from a job's Results page onto the Total Jobs page it was
   * opened from. The Results buttons (`openJobResults`) store the page number
   * under `RESULTS_RETURN_PAGE_KEY`; the restore below reads it once and puts
   * that page back.
   *
   * `heldPageResetKeyRef` is the other half: the "back to page 1" effect further
   * down fires on mount and again when the restore puts the saved tab and
   * rows-per-page back, and either would throw the returned page away. Set only
   * on a return from Results, so every other arrival behaves as before.
   */
  const pageResetKey = `${activeTab}|${preSelectedJdId ?? ''}|${assessmentItemsPerPage}`;
  const heldPageResetKeyRef = useRef<string | null>(null);
  const pageResetMountedRef = useRef(false);
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
      /* And how far INTO that panel the recruiter had read: which job versions
         they had expanded, and which assessment version they were on. Opening
         an assessment version leaves this page, so without these three saved
         together Back reopened the job row onto a collapsed table — the
         recruiter's Job → V2 → Assessment V3 position gone, to be walked down
         again. Keyed per job, so several jobs keep their own place. */
      expandedJobVersionsByJob,
      selectedAssessmentVersionByJob,
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
        if (typeof s.openVersionsFor === 'string') {
          setOpenVersionsFor(s.openVersionsFor);
          /* Restoring the open card is only half of putting the recruiter
             back: the card may be anywhere down a long list. Note it here,
             where we know this mount is a RETURN rather than a fresh visit,
             and let the effect below scroll to it once it has actually
             rendered and expanded. */
          restoreScrollTargetRef.current = s.openVersionsFor;
        }
        /* The reading position inside that panel, restored with it. Both are
           read defensively down to their element types: a snapshot is
           whatever was in sessionStorage, and a malformed one must not put a
           string into a set of version numbers the panel compares with
           `has`. */
        if (s.expandedJobVersionsByJob && typeof s.expandedJobVersionsByJob === 'object') {
          const restored: Record<string, number[]> = {};
          for (const [jdId, versions] of Object.entries(s.expandedJobVersionsByJob)) {
            if (Array.isArray(versions)) {
              restored[jdId] = versions.filter((version): version is number => typeof version === 'number');
            }
          }
          setExpandedJobVersionsByJob(restored);
        }
        if (s.selectedAssessmentVersionByJob && typeof s.selectedAssessmentVersionByJob === 'object') {
          const restored: Record<string, string> = {};
          for (const [jdId, assessmentId] of Object.entries(s.selectedAssessmentVersionByJob)) {
            if (typeof assessmentId === 'string') restored[jdId] = assessmentId;
          }
          setSelectedAssessmentVersionByJob(restored);
        }
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

      /* Back from Results: the page the recruiter opened it from. Set LAST —
         restoring the search and filters above fires their "back to page 1"
         `onChange`, and whichever page update is queued last is the one kept. */
      let resultsReturnPage: number | null = null;
      try {
        const raw = window.sessionStorage.getItem(RESULTS_RETURN_PAGE_KEY);
        window.sessionStorage.removeItem(RESULTS_RETURN_PAGE_KEY);
        const page = Number(raw);
        if (raw && Number.isInteger(page) && page >= 1) resultsReturnPage = page;
      } catch {
        /* Ignore unavailable sessionStorage. */
      }
      if (resultsReturnPage !== null && !initialListTab) {
        setAssessmentCurrentPage(resultsReturnPage);
        const restoredTab = typeof s.activeTab === 'string' ? s.activeTab : activeTab;
        const restoredPerPage = typeof s.assessmentItemsPerPage === 'number' ? s.assessmentItemsPerPage : assessmentItemsPerPage;
        heldPageResetKeyRef.current = `${restoredTab}|${preSelectedJdId ?? ''}|${restoredPerPage}`;
      }
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

  /**
   * Put the recruiter back in front of the card they left from.
   *
   * The snapshot already restores WHICH job row is open, which job versions
   * are expanded inside it and which assessment version was being read - but
   * that card can be the ninth of ten on the page, so the restored state was
   * landing off-screen and the recruiter had to go looking for it. This is the
   * other half: once the card is really on screen, scroll to it.
   *
   * AFTER the restore, never racing it. The panel's rows arrive from two
   * fetches (`loadAssessmentLineage` and the JD lineage), so the element to
   * scroll to does not exist on the first paint - and a scroll aimed at a card
   * that is still a spinner lands on the wrong offset and stays there. So this
   * polls for the target and scrolls only when it finds one, which is also
   * what makes it safe: no target, no scroll, and the page behaves exactly as
   * it did before.
   *
   * Three targets, finest first, because "where I was" gets more specific the
   * further in the reader had got:
   *   1. the picked ASSESSMENT version's row,
   *   2. the expanded JOB VERSION's row,
   *   3. the job card itself.
   * Each is found through a marker the panel sets from the same value it
   * renders the highlight from, so the row scrolled to is the row that looks
   * selected. The lookup is scoped INSIDE the card, so a job's markers can
   * never be answered by another job's rows.
   *
   * Starts after `useScrollRestoration`'s own saved-offset restore has had its
   * last go (300ms), rather than fighting it: that restore usually lands close
   * already, so this refines the position instead of replacing it - and if the
   * target never appears, the offset it left in place is still the right
   * fallback.
   */
  useEffect(() => {
    if (!restoreScrollTargetRef.current || pageView !== 'list' || isLoading) return;
    const jobId = restoreScrollTargetRef.current;

    /* Long enough for the panel's two fetches on a cold cache, short enough
       that a job whose lineage never loads is not still lurching under a
       recruiter who has started reading something else. */
    const DEADLINE_MS = 3000;
    const RETRY_MS = 120;
    const startedAt = Date.now();
    let timer = 0;

    /* `center` for a row, which is small enough to sit in the middle of the
       viewport with its neighbours around it for context; `start` for the job
       card, which is taller than the viewport once its panel is open and would
       be centred by its middle, pushing its heading off the top. */
    const scrollTo = (element: Element, block: ScrollLogicalPosition) => {
      element.scrollIntoView({ behavior: 'smooth', block });
      /* One shot per mount. Cleared before the scroll settles on purpose: the
         recruiter may scroll away mid-animation, and a second attempt would
         drag them back. */
      restoreScrollTargetRef.current = null;
    };

    const attempt = () => {
      /* `CSS.escape` because the id goes into a selector; ids here are UUIDs,
         but a selector built from data is a selector that has to be escaped. */
      const card = document.querySelector(
        `[data-tf-job-row="${typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(jobId) : jobId}"]`,
      );
      const precise =
        card?.querySelector('[data-tf-assessment-selected="true"]')
        ?? card?.querySelector('[data-tf-job-version-open="true"]');
      if (precise) {
        scrollTo(precise, 'center');
        return;
      }
      /* Nothing finer to wait for. A recruiter who opened the job's panel but
         never expanded a version inside it has the CARD as their position, so
         waiting out the deadline for a row that is never coming would just
         leave them looking at the wrong part of the list for three seconds. */
      const jdId = card?.getAttribute('data-tf-job-jd');
      const awaitsExpandedVersion = !!jdId && (expandedJobVersionsByJob[jdId]?.length ?? 0) > 0;
      if (card && !awaitsExpandedVersion) {
        scrollTo(card, 'start');
        return;
      }
      if (Date.now() - startedAt >= DEADLINE_MS) {
        /* Out of time. The card alone is still better than leaving the
           recruiter wherever the saved offset put them; nothing at all, and we
           simply stop. */
        if (card) scrollTo(card, 'start');
        else restoreScrollTargetRef.current = null;
        return;
      }
      timer = window.setTimeout(attempt, RETRY_MS);
    };

    timer = window.setTimeout(attempt, 350);
    return () => window.clearTimeout(timer);
    /* `openVersionsFor` and `activeTab` are listed although the body does not
       read them: they are what a restore CHANGES, so re-running on them is how
       a snapshot that lands after this effect's first pass gets one. The ref
       guard at the top makes every re-run after the scroll free. Deliberately
       NOT listed: anything that changes as the panel's fetches land, which
       would restart the wait each time the thing being waited for got closer. */
  }, [pageView, isLoading, openVersionsFor, activeTab, expandedJobVersionsByJob]);

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

  /* Completed, Auto Completed and Terminated invites open the Result Details
     page. Auto Completed is a completed invite whose attempt was auto-submitted
     on session timeout (termination_code TENANT_SESSION_TIMEOUT), so the same
     completed_at/attempt_id check covers both. Terminated rows carry no scores,
     but they do carry the recording and the Integrity Check evidence, which is
     exactly what a recruiter opens a terminated candidate to see (2026-09-30).
     Every other status — In Progress, System Check, Expired, Invited, ... —
     stays on the tracking popup: there is no attempt to show. */

  const opensTrackedDetails = (invitation: any): boolean =>
    opensTrackedInviteDetails(invitation);

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
    if (['completed', 'failed', 'bounced', 'abandoned', 'expired', 'revoked'].includes(s) || inv.completed_at || inv.bounced_at) return false;
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
  /* Drawing is split from deciding: `renderInviteBadgeForStatus` draws one
     status key in its house badge; `currentInviteStatus` decides it from the
     row's Timeline (both the Track Invites popup and the Invitation Status
     tab), with `resolveInviteFieldStatus` — the row's own fields — only as
     its fallback. */
  const renderInviteBadgeForStatus = (status: string, inv: { termination_code?: string | null }) => {
    const base = "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs sm:text-xs font-medium whitespace-nowrap flex-shrink-0 ring-1";
    switch (status) {
      case 'expired':
        return <span className={`${base} bg-status-expired/10 text-status-expired ring-status-expired/20`}><Clock className="w-3 h-3" /> Expired</span>;
      case 'completed': {
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
      case 'failed':
        return <span className={`${base} bg-destructive-subtle text-destructive ring-destructive-line`}><X className="w-3 h-3" /> Invite Failed</span>;
      case 'bounced':
        return <span className={`${base} bg-destructive-subtle text-destructive ring-destructive-line`}><RefreshCw className="w-3 h-3" /> Bounced</span>;
      case 'revoked':
        return <span className={`${base} bg-destructive-subtle text-destructive ring-destructive-line`}><Ban className="w-3 h-3" /> Revoked</span>;
      case 'abandoned':
        return <span className={`${base} bg-destructive-subtle text-destructive ring-destructive-line`} title="Ended before completion — the candidate left the assessment"><Ban className="w-3 h-3" /> Terminated</span>;
      case 'started':
        return <span className={`${base} bg-status-progress/10 text-status-progress ring-status-progress/20`}><Play className="w-3 h-3" /> In Progress</span>;
      case 'opened':
        return <span className={`${base} bg-status-progress/10 text-status-progress ring-status-progress/20`} title="Consent accepted — the candidate is on the system check step"><Monitor className="w-3 h-3" /> System Check</span>;
      case 'sent':
        return <span className={`${base} bg-status-invited/10 text-status-invited ring-status-invited/20`}><Mail className="w-3 h-3" /> Invited</span>;
      default:
        return <span className={`${base} bg-slate-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 ring-gray-200 dark:ring-slate-700`}><Clock className="w-3 h-3" /> Pending</span>;
    }
  };

  /* The status the row's own fields say, in the precedence this badge has
     always used. Expiry is resolved first so a lapsed invite shows only the
     Expired badge — never the stale pre-expiry status. */
  const resolveInviteFieldStatus = (inv: any): string => {
    const s = inv.status;
    if (isInviteExpired(inv)) return 'expired';
    if (s === 'completed' || inv.completed_at) return 'completed';
    if (s === 'failed') return 'failed';
    if (s === 'bounced' || inv.bounced_at) return 'bounced';
    if (s === 'revoked') return 'revoked';
    if (s === 'expired') return 'expired';
    if (s === 'abandoned') return 'abandoned';
    if (s === 'started' || inv.started_at) return 'started';
    if (s === 'opened' || inv.opened_at) return 'opened';
    if (s === 'sent' || inv.sent_at) return 'sent';
    return 'pending';
  };

  /* The Invitation Status tab's one status rule: the latest status in the
     row's Timeline (`latestTimelineStatus`, which reads the same trail the
     Timeline column prints). Its Status badge, tab counts, tab filter, bulk
     Resend eligibility and exported Status all go through here, so none of
     them can disagree with the Timeline or with each other. The row's own
     fields are only the fallback for a trail with no status in it. */
  const currentInviteStatus = (inv: any): string =>
    latestTimelineStatus(inv) ?? resolveInviteFieldStatus(inv);

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
          <span className={`${SCORE_CELL_TEXT} ${passed ? 'text-brand-blue' : 'text-destructive'}`}>
            {formatScore(score)}%
          </span>
          <span className={`text-2xs font-medium px-1.5 py-0.5 rounded ring-1 ${passed ? 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20' : 'bg-destructive-subtle text-destructive ring-destructive-line'}`}>
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

  /* Bulk Resend on the Invitation Status tab — the popup's control, for the
     rows ticked there. Its own confirm state because the dialog names its own
     count; everything that does the work is shared. */
  const [showInviteBulkResendConfirm, setShowInviteBulkResendConfirm] = useState(false);

  /* Eligibility for a resend: Expired, and not already started or completed.
     Read off the bucket, so a link that lapsed on the clock counts — the same
     row the Status column shows as Expired, and the same test the per-row
     Resend item uses. */
  const isInviteResendable = (inv: any): boolean =>
    currentInviteStatus(inv) === 'expired' && !inv.started_at && !inv.completed_at;

  /* Eligibility for a bulk revoke: Invited ('sent'), same rule as the per-row
     Revoke action (isRevocableInvitation). Scenario 4's "all selected are
     Invited -> Revoke" case, mirrored for this tab. */
  const isInviteRevocable = (inv: any): boolean => isRevocableInvitation(inv);

  /* The count the confirm dialog shows. Derived here rather than in the tab's
     render scope, because the dialog is a page-level sibling of it — same
     filter-and-tick rule the button applies. */
  const inviteBulkResendCount = inviteStatusRows.filter(
    (inv: any) => selectedInviteIds.has(inv.id) && isInviteResendable(inv)
  ).length;
  const inviteBulkRevokeCount = inviteStatusRows.filter(
    (inv: any) => selectedInviteIds.has(inv.id) && isInviteRevocable(inv)
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

  const handleInviteBulkRevoke = async () => {
    const targets = inviteStatusRows.filter(
      (inv: any) => selectedInviteIds.has(inv.id) && isInviteRevocable(inv)
    );
    if (targets.length === 0) {
      setShowInviteBulkRevokeConfirm(false);
      return;
    }
    setIsBulkRevoking(true);
    await revokeInvitationsSequentially(targets);
    setSelectedInviteIds(new Set());
    setShowInviteBulkRevokeConfirm(false);
    setIsBulkRevoking(false);
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
      revoked: 'Revoked',
      pending: 'Pending',
    };
    return labels[currentInviteStatus(inv)] || 'Pending';
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
    { label: 'Invite Source', value: (inv) => (inv.resume_id ? 'From Resume' : 'From Email') },
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
        ? `${formatScore(inv.technical_score)}%`
        : ''),
    },
    {
      label: 'Coding Score',
      value: (inv) => (inv.coding_score != null && inv.scoring_status !== 'pending' && inv.scoring_status !== 'processing'
        ? `${formatScore(inv.coding_score)}%`
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
     page. Any row a bulk Revoke OR a bulk Resend can act on gets a checkbox:
     Invited ('sent'), and Expired/Failed rows that haven't started or
     completed. In Progress ('started'), System Check ('opened'), Completed,
     bounced and Revoked rows get no checkbox — their per-row actions (or lack
     of one) already say what can be done with them.

     Which bulk BUTTON appears depends on the selection being uniformly one
     status-class or the other — see allTrackingRevocable/allTrackingResendable
     below. A mixed Invited+Expired selection shows neither: an action valid
     for one status must never be applied to the other (Scenario 4). */
  const [trackingSelectedIds, setTrackingSelectedIds] = useState<Set<string>>(new Set());
  const trackingSelectableIds = trackingInvitations.filter(isBulkActionable).map((inv: any) => inv.id);
  const trackingSelectedRows = trackingInvitations.filter((inv: any) => trackingSelectedIds.has(inv.id));
  const allTrackingRevocable = trackingSelectedRows.length > 0 && trackingSelectedRows.every(isBulkRevocable);
  const allTrackingResendable = trackingSelectedRows.length > 0 && trackingSelectedRows.every(isBulkResendable);
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
  /* Reloads (paging, filtering, a resend/revoke flipping a status) can leave
     selected ids pointing at rows that are gone or no longer eligible — drop
     those so the bulk button's count always matches what an action would
     actually do. */
  useEffect(() => {
    setTrackingSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const valid = new Set(trackingInvitations.filter(isBulkActionable).map((inv: any) => inv.id));
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
     assessment rather than on the row the popup was opened from.

     The job version comes from the JD ROW the assessment points at, resolved
     when the popup's scope was built (`trackingJob.jobVersionByJdId`), and only
     then from `scoped.jd_version`. That field is a creation-time snapshot which
     comes back as 1 for assessments authored against a later version, so
     reading it first filed every candidate of every version under Job v1 —
     the same precedence `jobVersionOf` follows in the version panel. */
  const stampJobScopedInvite = (invitation: any, scoped: any, jobVersionByJdId: Map<string, number>) => ({
    ...invitation,
    _assessment_id: scoped.id,
    _assessment_short_id: scoped.short_id,
    _assessment_title: scoped.title,
    _assessment_version: scoped.version ?? 1,
    _jd_version: jobVersionOfAssessment(scoped, jobVersionByJdId) ?? 1,
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
          invited: sum((r) => r.invited || 0),
          revoked: sum((r) => r.revoked || 0),
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
        invited: response.invited || 0,
        revoked: response.revoked || 0,
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
        invited: 0,
        revoked: 0,
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
                stampJobScopedInvite(invitation, scoped, trackingJob.jobVersionByJdId),
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
        invited: 0,
        revoked: 0,
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

  const resultStatusClass = (status?: string) => {
    if (status === 'completed') return 'bg-success-subtle text-success';
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
      /* Every assessment of every job version, paged to the end rather than
         asked for one fixed page — a tenant past that page size lost whole
         assessments off the reply, and with them their candidates. */
      const items = await listAllAssessments();
      if (items.length === 0) {
        setCompletedCandidates([]);
        return;
      }
      /* Which job version each assessment belongs to, resolved from the JD ROW
         it points at. One lineage lookup per job answers for all of its
         versions, so this costs a request per job rather than per assessment. */
      const jobVersionByJdId = rememberJobVersions(
        await resolveJobVersionsByJdId(items.map((a) => a.jd_id)),
      );
      // Results rather than invitations: the attempt carries the scores and the
      // pass/fail verdict this tab is about.
      const results = await Promise.all(
        items.map(async (a: any) => {
          try {
            const attempts = await collectAllPages((page, page_size) =>
              assessmentService.listResults(a.id, { status_filter: 'completed', page, page_size }),
            );
            return attempts.map((attempt): CandidateResultRow => ({
              ...attempt,
              _assessment_id: a.id,
              _assessment_short_id: a.short_id,
              _assessment_title: a.title,
              /* Job Version of the assessment this attempt belongs to, resolved
                 from that assessment's JD ROW — `a.jd_version` is a
                 creation-time snapshot that reads 1 for assessments authored
                 against later versions, so it is the fallback only. */
              _jd_id: a.jd_id,
              /* Job ID, from the same record and for the same reason as the
                 version below: already in hand, so the column costs no
                 request and cannot disagree with the assessment it came
                 from. */
              _jd_short_id: a.jd_short_id,
              _jd_version: jobVersionOfAssessment(a, jobVersionByJdId),
              /* The assessment's OWN version, straight off the record this
                 fan-out already holds — no extra request, and it cannot
                 disagree with the assessment it came from. Same field, same
                 name, as the Invitation Status rows use. */
              _assessment_version: a.version,
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
      /* Every assessment of every job version, paged to the end — see the same
         call in `loadAllCompletedCandidates`. */
      const items = await listAllAssessments();
      if (items.length === 0) {
        setInviteStatusRows([]);
        return;
      }
      /* Job versions resolved from the JD rows, once for the whole set. */
      const jobVersionByJdId = rememberJobVersions(
        await resolveJobVersionsByJdId(items.map((a) => a.jd_id)),
      );
      const perAssessment = await Promise.all(
        items.map(async (a: any) => {
          try {
            const invitations = await collectAllPages((page, page_size) =>
              assessmentService.listInvitations(a.id, { page, page_size }),
            );
            return invitations.map((inv: any) => ({
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
                                       authored against — resolved from its JD
                                       ROW, since the `jd_version` number on the
                                       record is a creation-time snapshot that
                                       reads 1 for assessments authored against
                                       later versions.
                   _assessment_version the assessment's own version, which
                                       increments on each edit/publish. */
              _jd_id: a.jd_id,
              _jd_short_id: a.jd_short_id,
              _jd_title: a.jd_title,
              _jd_version: jobVersionOfAssessment(a, jobVersionByJdId),
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
      /* One row per invitation: paging that shifts while it is being walked
         can hand the same record back twice, and it would list as two rows. */
      const seenInviteIds = new Set<string>();
      const merged = perAssessment.flat().filter((inv: any) => {
        if (!inv.id) return true;
        if (seenInviteIds.has(inv.id)) return false;
        seenInviteIds.add(inv.id);
        return true;
      });
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

      // Everything below reads `.value` off three settled results and writes
      // several pieces of state, ending in `setIsLoadingStats(false)`. That
      // final call used to sit bare at the end of the function: an unexpected
      // shape from any one of the three responses (e.g. `getStats()`
      // resolving with an empty body) threw synchronously, and since nothing
      // called this with a `.catch()`, the throw silently aborted the whole
      // function — leaving the four stat cards on "..." and the quota pill on
      // "Loading..." forever, with only an "Uncaught (in promise)" console
      // warning to show for it. try/finally guarantees the loading state
      // always clears, however any individual branch below behaves.
      try {
        // Run all API calls in parallel for faster loading. `Promise.allSettled`
        // only ever resolves once every one of these has settled — the shared
        // axios client (lib/services/api.ts) carries no default timeout, so a
        // single leg that stalls on the server (a slow DB session, a stuck
        // external quota lookup) left the whole page waiting forever with no
        // way to recover short of a manual reload. A bounded timeout on each
        // call turns "hangs forever" into "fails after 20s", which the
        // existing per-branch fallbacks below already handle correctly.
        const STATS_TIMEOUT_MS = 20000;
        const [statsResult, quotaResult, topicsResult] = await Promise.allSettled([
          assessmentService.getStats({ timeout: STATS_TIMEOUT_MS }),
          api.get('/usage/quota-status', { timeout: STATS_TIMEOUT_MS }),
          api.get('/assessments/settings/topics', { timeout: STATS_TIMEOUT_MS }),
        ]);

        // Process stats. Guarded against a fulfilled-but-empty/malformed body
        // (`response` falsy) — the fields below used to be read off it
        // unconditionally, which crashed this function before it ever reached
        // the quota block or the final `setIsLoadingStats(false)`.
        if (statsResult.status === 'fulfilled' && statsResult.value) {
          const response = statsResult.value;
          setStats({
            total_assessments: response.total_assessments,
            total_jobs_with_assessments: response.total_jobs_with_assessments || 0,
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
          console.log(
            '[TalentFlow] Failed to load stats:',
            statsResult.status === 'rejected' ? statsResult.reason : 'empty response'
          );
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
      } catch (error) {
        console.error('[TalentFlow] loadAllData failed unexpectedly:', error);
      } finally {
        // Always clears, whatever happened above — see the comment at the top
        // of this function for why that used to not be guaranteed.
        setIsLoadingStats(false);
      }
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
  /* Back from Results (`heldPageResetKeyRef`), the mount pass and the pass
     that only puts the saved tab / rows-per-page back are skipped, so the
     returned page stands; the first real change resets to page 1 as usual. */
  useEffect(() => {
    const held = heldPageResetKeyRef.current;
    const isMountPass = !pageResetMountedRef.current;
    pageResetMountedRef.current = true;
    if (held !== null) {
      if (isMountPass || pageResetKey === held) return;
      heldPageResetKeyRef.current = null;
    }
    setAssessmentCurrentPage(1);
  }, [pageResetKey]);


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
        total_jobs_with_assessments: statsResponse.total_jobs_with_assessments || 0,
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
    setInvitePickerViewMode('ungrouped');
    setInvitePickerPage(1);
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
    setInvitePickerViewMode('ungrouped');
    setInvitePickerPage(1);
  };

  const reloadAssessments = async () => {
    try {
      /* The Completed metric is counted from candidate records, so a reload has
         to recount rather than redraw what it counted last time: a candidate
         finishing an assessment is exactly the change this refresh is for, and
         it moves no field on the assessment rows themselves. Dropping the cache
         and remounting the loader is what makes it ask again. */
      setCompletedCandidatesByAssessment({});
      setCompletedCandidatesGeneration((generation) => generation + 1);
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

    /* Land on the tab that actually LISTS what was just saved, not on the
       summary cards the flow was opened from. The recruiter has just made a
       thing and the next question is "where is it".

       A publish goes to All Assessments — the same state the Total Assessments
       card selects, so that card reads as active too.

       A DRAFT goes to Draft Assessments, because All Assessments cannot be
       relied on to show it. That list collapses a job's assessments to one row
       per lineage (`collapseByLineage`, keyed by `jobLineageKey` = the job's
       `jd_short_id`, shared by every VERSION of the job), and its tie-break
       rule makes a draft lose to any non-draft in the same lineage whatever
       the version numbers say. So on a republished job whose earlier version
       already carries a published/completed/archived assessment, a brand-new
       draft is collapsed out of sight the moment it is saved — success toast,
       empty-handed list. The Draft tab filters the non-drafts out first
       (`filteredAssessments`), which leaves the new draft to represent its own
       lineage, so it is the one cut of the list guaranteed to contain it.

       The standalone /assessments/create route arrives at the same place by
       URL (`?tab=all` / `?tab=draft`) since it navigates rather than closing
       in place. */
    openAssessmentsList(String(assessment?.status || '').toLowerCase() === 'draft' ? 'draft' : 'all');

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
      setPendingDraftConflict({ target: assessment, draft: pendingDraft });
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
   * The job's assessments are resolved here, once, before the popup opens, by
   * the SAME retrieval the version panel uses — the full Job Opening → Job
   * Version → Assessment walk, one request per job version, deduped by
   * assessment id. The row's own assessment stands in if that comes back empty,
   * so Track always opens on something.
   *
   * It used to fall back to `list({ jd_id })` for the row's own JD row whenever
   * the lineage cache was cold — which is the normal case, since Track can be
   * clicked without ever expanding the row's version panel. That request answers
   * for ONE job version, so every assessment authored against a sibling version
   * was missing from the popup, and with it every candidate invited from those
   * assessments. The cache is still consulted first, but a miss now loads the
   * whole hierarchy rather than a slice of it.
   */
  const handleTrackJob = async (assessment: any) => {
    const jdId = assessment?.jd_id;
    if (!jdId) return;
    /* Same reason as `handleTrackInvites`: the popup must open on its loader,
       not on a momentary "No invitations found". */
    setIsLoadingInvitations(true);
    /* The hierarchy, from the cache or freshly walked. `loadAssessmentLineage`
       fills both caches, so reopening Track — or expanding the row's version
       panel afterwards — is free and shows the same set. */
    if (!jobHierarchyRef.current.has(jdId)) await loadAssessmentLineage(jdId);
    const hierarchy = jobHierarchyRef.current.get(jdId);
    const rows: any[] = hierarchy?.assessments ?? assessmentLineages[jdId] ?? [];
    /* Which version each row belongs to. The hierarchy already resolved it; a
       hierarchy that failed to load leaves the accumulated map, and one lineage
       lookup for the rows we do have is enough to fill it — the popup must
       never fall back to the rows' own `jd_version`, which reads 1 for every
       assessment authored against a later version. */
    if (!hierarchy) {
      rememberJobVersions(
        await resolveJobVersionsByJdId([jdId, ...rows.map((row) => row?.jd_id)]),
      );
    }
    setTrackingJob({
      jobId: assessment.jd_short_id,
      jobTitle: assessment.job?.title || stripVersionFromTitle(assessment.title),
      jdId,
      assessments: rows.length ? rows : [assessment],
      /* A snapshot, so a later job's lineage landing in the shared ref cannot
         change what this popup is showing under the user. */
      jobVersionByJdId: new Map(
        hierarchy ? [...jobVersionByJdIdRef.current, ...hierarchy.jobVersionByJdId] : jobVersionByJdIdRef.current,
      ),
    });
    setSelectedAssessmentForTracking(assessment);
    setTrackingFilters(EMPTY_INVITE_FILTERS);
    setTrackingCurrentPage(1);
    setTrackingSelectedIds(new Set());
    setShowTrackInvitesModal(true);
  };


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
      await refreshInviteSurfaces();
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

  /* The revoke loop itself, shared by both bulk callers (Scenario 4's "all
     selected are Invited -> Revoke" case) — same shape as
     resendInvitationsSequentially, calling the existing single-row revoke
     endpoint (assessmentService.revokeInvitation) per invitation. Revoking
     carries no send-rate concern, but it stays sequential anyway so a
     mid-batch failure is attributable to one row rather than lost in a
     Promise.allSettled fan-out. */
  const revokeInvitationsSequentially = async (targets: any[]): Promise<{ revoked: number; failedCount: number }> => {
    let revoked = 0;
    let failedCount = 0;
    for (const inv of targets) {
      const assessmentId = getInviteAssessmentId(inv);
      if (!assessmentId) {
        console.error(`No assessment for invitation ${inv.id}; skipped.`);
        failedCount++;
        continue;
      }
      try {
        await assessmentService.revokeInvitation(assessmentId, inv.id);
        revoked++;
      } catch (error) {
        console.error(`Failed to revoke invitation ${inv.id}:`, error);
        failedCount++;
      }
    }
    if (revoked > 0) {
      toast.success(`Revoked ${revoked} invitation${revoked === 1 ? '' : 's'}.`);
    }
    if (failedCount > 0) {
      toast.error(`${failedCount} invitation${failedCount === 1 ? '' : 's'} could not be revoked.`);
    }
    return { revoked, failedCount };
  };

  // Bulk resend for the selected Invited/Expired candidates — same endpoint as
  // the single-row Resend, called per invitation. Sequential on purpose: the
  // selection is at most one page of rows, and a burst of parallel resends is
  // exactly the kind of thing mail rate-limiters punish.
  const [showBulkResendConfirm, setShowBulkResendConfirm] = useState(false);
  const [isBulkResending, setIsBulkResending] = useState(false);

  // Bulk revoke — shown only when every selected row is currently Invited
  // ('sent'); shares its loading flag across both surfaces the same way the
  // resend confirms already do.
  const [showTrackingBulkRevokeConfirm, setShowTrackingBulkRevokeConfirm] = useState(false);
  const [showInviteBulkRevokeConfirm, setShowInviteBulkRevokeConfirm] = useState(false);
  const [isBulkRevoking, setIsBulkRevoking] = useState(false);

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
    await refreshInviteSurfaces();
  };

  // Bulk revoke for the Track Invites popup — mirrors handleBulkResend, only
  // for the selected candidates that are all still Invited ('sent').
  const handleTrackingBulkRevoke = async () => {
    if (!selectedAssessmentForTracking) return;
    const targets = trackingInvitations.filter(
      (inv: any) => trackingSelectedIds.has(inv.id) && isBulkRevocable(inv)
    );
    if (targets.length === 0) {
      setShowTrackingBulkRevokeConfirm(false);
      return;
    }
    setIsBulkRevoking(true);
    await revokeInvitationsSequentially(targets);
    setTrackingSelectedIds(new Set());
    setShowTrackingBulkRevokeConfirm(false);
    setIsBulkRevoking(false);
    await refreshInviteSurfaces();
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
      await refreshInviteSurfaces();
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

  /** Which invitation an invite-management action targets — the row's own
   *  assessment where it carries one, else the popup's pinned one. */
  const getInviteAssessmentId = (invitation: any): string | undefined =>
    invitation?._assessment_id || invitation?.assessment_id || selectedAssessmentForTracking?.id;

  /** Refetch whatever invitation surface is on screen after ANY invite action
   *  (resend, revoke, edit, change email, bulk resend).
   *
   *  It keys off which surface is open, never off the row. The old check was
   *  `if (row._assessment_id) reload the Invitation Status tab`, but the
   *  job-wide Track Invites popup stamps `_assessment_id` on its rows too
   *  (stampJobScopedInvite) — so an action taken in that popup reloaded the
   *  hidden tab and left the popup's own rows (and stat cards) frozen on the
   *  pre-action data until a full page reload. The tab needs no refetch while
   *  hidden: it reloads on activation. */
  const refreshInviteSurfaces = async () => {
    const pending: Promise<unknown>[] = [];
    if (showTrackInvitesModal && selectedAssessmentForTracking) {
      pending.push(
        loadTrackingInvitations(selectedAssessmentForTracking, trackingCurrentPage, trackingFilters),
        loadTrackingInvitationSummary(selectedAssessmentForTracking),
      );
    }
    if (activeTab === 'invitation-status') {
      pending.push(loadAllInviteStatuses());
    }
    await Promise.all(pending);
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
          onShare={(isTenantAdmin || hasPermissionCode('assessments:share')) ? () => {
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
            // reloadAssessments() above only refreshes the assessment cards'
            // own counters, not the Track Invites / Invitation Status row
            // data — that row sat stale (or on whatever it last loaded)
            // until some OTHER action (Resend/Revoke/Edit) happened to
            // trigger refreshInviteSurfaces. Fire it as soon as the send
            // actually completes, not just on modal close.
            onInviteSent={refreshInviteSurfaces}
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
   * JD ROW id -> the lineage key of the job that row belongs to.
   *
   * Every job version is its own JD row, and only the assessments carry both
   * ends of that join (`jd_id` names the version, `jd_short_id` names the
   * job), so this is where a bare version id is turned back into its job.
   */
  const lineageKeyByJdId = new Map<string, string>();
  for (const assessment of assessments) {
    if (assessment.jd_id) lineageKeyByJdId.set(assessment.jd_id, lineageKeyOf(assessment));
  }

  /**
   * EVERY assessment of a job, whichever job version and whichever assessment
   * version it is - keyed by job, holding each assessment's id and the row's
   * own completed counter as the fallback figure.
   *
   * Built over `assessments` (the page's WHOLE loaded set, before the tab and
   * the browser-side filters narrow it) rather than over `filteredAssessments`,
   * because "how many candidates finished this job's assessments" is a fact
   * about the job and not about what the list is currently showing. Summed
   * from the filtered set instead, the Completed metric fell to the selected
   * slice: the Draft tab counted the drafts' candidates, a Created-by filter
   * counted one author's, and a job whose three job versions each hold their
   * own assessment versions reported whichever of them survived the filter.
   *
   * Unioned with the fetched lineages, which are the one source that also
   * covers assessments the list never returned - the same second reading
   * `getJobInvitationsSent` takes for the invitations beside this figure. Those
   * rows are raw and carry no `jd_short_id`, so they are attributed through the
   * JD row id they were fetched under, then through any row that resolves;
   * rows belonging to a job this page has not listed are left out rather than
   * guessed into a bucket.
   */
  const jobAssessmentIndex = (() => {
    const index = new Map<string, Map<string, number>>();
    const add = (key: string | undefined, id: string | undefined, completed: number) => {
      if (!key || !id) return;
      const entry = index.get(key) ?? new Map<string, number>();
      /* The larger of the two readings of one assessment: the list row and the
         lineage row are the same record fetched twice, and a reply that came
         back before a candidate finished must not lower the other. */
      entry.set(id, Math.max(entry.get(id) ?? 0, completed));
      index.set(key, entry);
    };
    for (const assessment of assessments) {
      add(lineageKeyOf(assessment), assessment.id, assessment.completed_count ?? 0);
    }
    for (const [fetchedUnderJdId, rows] of Object.entries(assessmentLineages)) {
      const lineageRows = rows ?? [];
      const key =
        lineageKeyByJdId.get(fetchedUnderJdId)
        ?? lineageRows.map((row) => (row.jd_id ? lineageKeyByJdId.get(row.jd_id) : undefined)).find(Boolean);
      for (const row of lineageRows) add(key, row.id, row.completed_count ?? 0);
    }
    return index;
  })();

  /** Every assessment id of this job, across all of its versions. */
  const getJobAssessmentIds = (assessment: { id: string; jd_id?: string; jd_short_id?: string }) =>
    [...(jobAssessmentIndex.get(lineageKeyOf(assessment))?.keys() ?? [])];

  /**
   * THE JOB'S COMPLETED CANDIDATES: JD -> every job version -> every
   * assessment version -> the candidates who finished.
   *
   * Summed over the job's whole assessment set (see `jobAssessmentIndex`), one
   * term per assessment, each term counted from that assessment's own
   * candidate records (`completedCandidatesByAssessment`) and falling back to
   * the row's `completed_count` until its count has landed. So the figure is
   * never blank while it resolves, and never narrower than the job.
   *
   * Summing per assessment - rather than asking one endpoint for a job-wide
   * number - is what makes it correct across the hierarchy: there is no
   * job-scoped results endpoint, every other job-wide reading on this page
   * (Track, the Invitation Status tab, the Candidate Results tab) is built the
   * same way, and a candidate is counted under the assessment they actually
   * sat, so no version can count another's.
   */
  const getJobCompletedCandidates = (assessment: { id: string; jd_id?: string; jd_short_id?: string }) => {
    const entries = jobAssessmentIndex.get(lineageKeyOf(assessment));
    if (!entries) return 0;
    let total = 0;
    for (const [assessmentId, listedCount] of entries) {
      total += completedCandidatesByAssessment[assessmentId] ?? listedCount;
    }
    return total;
  };

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
   * per-assessment Track in `renderAssessmentRowMenuItems` is gated on, so the
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
      /* Completed is the one metric here that is NOT read from `totals`. The
         other three describe the assessments this surface is listing, which is
         what the bucketing is for; Completed describes the job's candidates,
         across every job version and every assessment version of it, so it is
         counted over the whole hierarchy instead - see
         `getJobCompletedCandidates`. */
      { key: 'completed', icon: ClipboardCheck, iconClass: 'text-menu-icon-activate', value: getJobCompletedCandidates(assessment), label: 'Completed' },
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
            ? 'bg-success-subtle text-success ring-success-line'
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
      /* The anchor the return-from-a-detail-page scroll aims at — see
         `restoreScrollTargetRef`. Only on the Job List: the Send Invite picker
         renders these same jobs inside a dialog, and an attribute on both
         would let a document-wide lookup find the dialog's copy instead of the
         list's. No attribute there, nothing to find. */
      data-tf-job-row={selectMode ? undefined : assessment.id}
      /* The job behind it, so that scroll can ask whether this job HAS an
         expanded version worth waiting for without reaching back into the
         page's state and re-running on every fetch that lands. */
      data-tf-job-jd={selectMode ? undefined : assessment.jd_id}
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
              <p className="text-2xs text-gray-500 dark:text-slate-500 truncate mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div
          className="flex flex-wrap items-center gap-2 max-w-full flex-shrink-0 self-start @4xl/job-row:flex-nowrap @4xl/job-row:self-auto @4xl/job-row:ml-auto"
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
              <Button
                variant="secondary"
                size="sm"
                disabled={!hasInvitations}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!hasInvitations) return;
                  void handleTrackJob(assessment);
                }}
                /* Coloured only while enabled - the same token the version
                   panel's Track menu item uses; a disabled button keeps the
                   button's own grey. */
                icon={<Radar className={`w-3.5 h-3.5${hasInvitations ? ' text-menu-icon-secondary' : ''}`} />}
                aria-label={reason}
                title={reason}
              >
                Track
              </Button>
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
              <Button
                variant="secondary"
                size="sm"
                disabled={!hasBeenShared}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!hasBeenShared) return;
                  /* The JOB's results: every job version of it and every
                     assessment revision within them, combined. BOTH scopes are
                     named explicitly rather than left to the results page's
                     default, because that page restores the last scope the
                     recruiter left it on — so arriving from the job row could
                     otherwise land on whichever single version was selected
                     last time. The row is the job; its Result must read as the
                     job. */
                  openJobResults(`/recruitment/assessments/${assessment.id}/results?job_version_id=all&assessment_version=all&view=total`);
                }}
                /* Same rule, with the version panel's Result colour. */
                icon={<BarChart className={`w-3.5 h-3.5${hasBeenShared ? ' text-menu-icon-score' : ''}`} />}
                aria-label={reason}
                title={reason}
              >
                Result
              </Button>
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
        /* The page's own preview modal, against the assessment that row IS.
           Same component the list's Preview action opens, so there is one
           assessment-details view in the app and this is it. */
        const viewAssessmentVersion = (version: { id: string }) => {
          const raw = displayedRows.find((v) => v.id === version.id);
          if (!raw) return;
          setSelectedAssessmentForPreview(mapAssessmentFromApi(raw, 0));
          setShowPreviewModal(true);
        };
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
            /* Total Jobs lists published/active job versions only - a
               Draft version is hidden here, not changed. Send Invite
               (selectMode) keeps its own listing as it was. */
            hideDraftJobVersions={!selectMode}
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
              /* Opening a version is also a reading position, so record it as
                 the job's pick before leaving. The click navigates away and
                 takes this whole list with it; on the way back the panel is
                 rebuilt from what was saved, and without this the table would
                 reopen highlighting the row's own representative assessment
                 rather than the version the recruiter actually went into.
                 The radio and this agree deliberately — they are two ways of
                 saying "this is the one I am on". */
              setSelectedAssessmentVersionByJob((current) => ({ ...current, [jdId]: versionId }));
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
            /* Expansion, held by this page rather than by the panel, so the
               open job version survives leaving for an assessment page and
               coming back — see `expandedJobVersionsByJob`.

               Only on the Job List. The Send Invite picker passes neither half
               and keeps the panel's own set: it lives in a dialog, the dialog
               closing IS the end of that reading, and a version opened while
               choosing whom to invite has no business reopening on the list
               behind it. */
            /* The job version's eye sits AFTER View Assessment here, not
               before it. On this surface the row's point is the assessment
               built against the version, so the version's own eye reads as the
               aside it is rather than as the column's first action.
               Only here: the Send Invite picker below keeps the default order,
               and so do the AI Interview panels. */
            viewJobVersionPlacement={selectMode ? 'leading' : 'trailing'}
            expandedJobVersions={selectMode ? undefined : expandedJobVersionsByJob[jdId] ?? []}
            onToggleJobVersion={
              selectMode
                ? undefined
                : (jobVersion) =>
                    setExpandedJobVersionsByJob((current) => {
                      const open = current[jdId] ?? [];
                      return {
                        ...current,
                        [jdId]: open.includes(jobVersion)
                          ? open.filter((version) => version !== jobVersion)
                          : [...open, jobVersion],
                      };
                    })
            }
            /* Only the Send Invite picker gets the panel's own eye; everywhere
               else View is the first item of the row's ⋮ menu (see
               `renderAction` below), so the Action column holds that menu
               alone. */
            onViewAssessment={selectMode ? viewAssessmentVersion : undefined}
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
            /* The Action column: one ⋮ menu per row, leading with View /
               Send / Track / Result and then the same items the card's menu
               carries, against THIS row's assessment. The lineage rows come
               back raw from the API, so they run through the list's own
               mapper first - both helpers read the mapped shape (status
               wording, the revoked-invites seal, the clone flags). The menu
               is keyed on the row, so opening one never opens another.

               The Send Invite dialog takes none of them. Its assessment rows
               exist to be CHOSEN between, and Send / Track / Result each act
               on an assessment instead: Send opens a second share flow inside
               the one already running, Result navigates the page out from
               under the dialog, Track stacks a popup over it. The eye is the
               one control that answers "which of these am I picking?", so in
               the dialog the column holds that alone. */
            singleActionControl
            renderAction={selectMode ? undefined : (version) => {
              const raw = displayedRows.find((v) => v.id === version.id);
              if (!raw) return null;
              const mapped = mapAssessmentFromApi(raw, 0);
              return renderAssessmentMenu(
                mapped,
                `version:${version.id}`,
                'compact',
                renderAssessmentRowMenuItems(mapped, () => viewAssessmentVersion(version)),
              );
            }}
          />
        </div>
        );
      })()}
    </div>
  );

  /* How many JOBS have at least one assessment, for the Total Jobs card.

     The card opens the Total Jobs tab, whose Job List heading counts jobs that
     HAVE assessments — so the card must count the same population. It used to
     count every job the tenant has (`groupByLineage(jobs)`, the JD list), which
     reported e.g. 193 above a Job List of 59.

     Read from /assessments/stats rather than derived from the page's own
     assessment list: that list follows the active tab and the search box, and
     a summary card must not move with them. The backend counts distinct job
     lineages with the same key the Job List collapses by (`jobLineageKey`):
     the JD's job_id, then jd_id, then the assessment's own id. */
  const totalJobs = stats.total_jobs_with_assessments;

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

  /**
   * The assessments whose completed-candidate count the Job List still needs,
   * for the jobs ON SCREEN.
   *
   * Handed to `JobCompletedCandidateCounts` below, which is where the requests
   * are made: this component returns early (Creation, Results, Details) above
   * every one of the derivations these ids come from, so the fetch cannot be
   * an effect of its own here - it would be a hook after a conditional return.
   *
   * Scoped to the visible page of the list, which is the only place these
   * figures are drawn, and already filtered to what is not known yet, so a job
   * paged back to costs nothing. A job's assessments are few - the create flow
   * caps versions per lineage in single digits - so a page of ten jobs is a
   * couple of dozen small requests, fewer than the Candidate Results tab
   * beside it already makes.
   */
  const jobCompletedCountsToFetch = [
    ...new Set(visibleAssessments.flatMap(getJobAssessmentIds)),
  ].filter((id) => completedCandidatesByAssessment[id] === undefined);
  const activeTabOwnsListContent =
    isFlatAssessmentTab(activeTab) ||
    ['completed-candidates', 'audit', 'consent', 'invitation-status', 'settings'].includes(activeTab);

  /* `assessmentListEmpty` stood here — the "this tab has no rows on screen"
     test. Its only reader was the "Job List (N)" heading, which it hid so the
     tab would not draw "Job List (0)" over its own empty state. The heading is
     gone (the count is in the tab pill now), and with it the last thing that
     needed the flag. The empty state itself picks its own wording from
     `assessmentListNarrowed` and `assessmentEmptyCopy` below, as it always
     did. */

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

  /* `variant` is the trigger's chrome, not its behaviour:
       'default' — the borderless 32px button the Job List row carries;
       'compact' — the 28px bordered square the Assessment Versions table's
                   Action column uses, where this menu is the only control.
     No `ml-auto` on the wrapper: inside the version table's Action cell it
     would push the menu to the far edge of the column. */
  /* `leadingItems` go at the top of the menu, above a divider. The Assessment
     Versions table passes its row actions (View / Send / Track / Result) here,
     so its Action column holds this one menu and nothing else. */
  const renderAssessmentMenu = (
    assessment: any,
    menuKey: string = assessment.id,
    variant: 'default' | 'compact' = 'default',
    leadingItems?: ReactNode,
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
            className="fixed w-52 max-w-[calc(100vw-1rem)] bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-[9999] max-h-[70dvh] overflow-y-auto"
            style={{
              top: menuDropUp ? undefined : menuAnchor.bottom + 4,
              bottom: menuDropUp ? Math.max(8, window.innerHeight - menuAnchor.top + 4) : undefined,
              // Right-aligned to the trigger, as `right-0`
              // used to do, and kept clear of the viewport.
              left: Math.max(8, menuAnchor.right - 208),
            }}
          >
            {leadingItems && (
              <>
                {leadingItems}
                <div className="border-t border-gray-100 dark:border-slate-700/60 my-1"></div>
              </>
            )}
            {assessment.status !== 'Archived' && (() => {
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
              const buttonDisabled = !canCreateAssessment || isDraft || capReached;
              const disabledReason = !canCreateAssessment
                ? 'You do not have permission to create assessments'
                : isDraft
                ? 'Publish the assessment before duplicating.'
                : capReached
                ? `Maximum ${MAX_ASSESSMENT_VERSIONS} versions reached. Archive a version to duplicate again.`
                : '';
              return (
                <button
                  onClick={() => {
                    if (buttonDisabled) {
                      if (!canCreateAssessment) toast.error(disabledReason);
                      return;
                    }
                    setOpenMenuId(null);
                    handleOpenCloneModal(assessment);
                  }}
                  disabled={buttonDisabled}
                  title={disabledReason || undefined}
                  className={`group w-full px-4 py-2.5 text-left text-sm flex items-center gap-2 transition-colors ${
                    buttonDisabled
                      ? 'text-gray-400 cursor-not-allowed'
                      : 'text-gray-700'
                  }`}
                >
                  <Copy className={`w-4 h-4 flex-shrink-0 ${buttonDisabled ? 'text-gray-300' : 'text-menu-icon-download'}`} />
                  <span className={MENU_ITEM_SCALE_CLASS}>Duplicate</span>
                </button>
              );
            })()}
            {assessment.status === 'Active' && (() => {
              // Revoke is only meaningful once at least one invite
              // exists, AND only once. After a recruiter has already
              // revoked invites on this assessment the action is
              // sealed — they'd duplicate the assessment to start
              // a fresh invite round, not re-run revoke.
              const hasInvites = (assessment.invitations_count || 0) > 0;
              const alreadyRevoked = !!assessment.has_revoked_invites;
              const revokeDisabled = !canUpdateAssessment || !hasInvites || alreadyRevoked;
              const revokeReason = !canUpdateAssessment
                ? 'You do not have permission to edit assessments'
                : !hasInvites
                ? 'No invites have been sent yet.'
                : alreadyRevoked
                ? 'Invites for this assessment have already been revoked.'
                : undefined;
              return (
                <button
                  onClick={() => {
                    if (revokeDisabled) {
                      if (!canUpdateAssessment) toast.error(revokeReason as string);
                      return;
                    }
                    setOpenMenuId(null);
                    handleOpenRevokeModal(assessment);
                  }}
                  disabled={revokeDisabled}
                  title={revokeReason}
                  className={`group w-full px-4 py-2.5 text-left text-sm flex items-center gap-2 transition-colors ${
                    revokeDisabled
                      ? 'text-gray-400 cursor-not-allowed'
                      : 'text-destructive'
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
            {assessment.status !== 'Active' && assessment.status !== 'Draft' && (
              <button
                onClick={() => {
                  if (!canUpdateAssessment) {
                    toast.error('You do not have permission to edit assessments');
                    return;
                  }
                  handleActivateAssessment(assessment.id);
                }}
                aria-disabled={!canUpdateAssessment}
                title={!canUpdateAssessment ? 'You do not have permission to edit assessments' : ''}
                className={`group w-full px-4 py-2.5 text-left text-sm flex items-center gap-2 transition-colors ${
                  canUpdateAssessment ? 'text-gray-700 dark:text-slate-300' : 'text-gray-400 cursor-not-allowed opacity-60'
                }`}
              >
                <Play className={`w-4 h-4 flex-shrink-0 ${canUpdateAssessment ? 'text-menu-icon-activate' : 'text-gray-300'}`} />
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
              aria-disabled={!canDeleteAssessment}
              title={!canDeleteAssessment ? 'You do not have permission to archive assessments' : ''}
              className={`group w-full px-4 py-2.5 text-left text-sm flex items-center gap-2 ${
                !canDeleteAssessment
                  ? 'text-gray-400 cursor-not-allowed opacity-60'
                  : 'text-gray-700'
              }`}
            >
              <Archive className="w-4 h-4 text-menu-icon-archive flex-shrink-0" />
              <span className={MENU_ITEM_SCALE_CLASS}>Archive</span>
            </button>
            )}
            {assessment.status !== 'Archived' && (
              <div className="border-t border-gray-100 dark:border-slate-700/60 my-1"></div>
            )}
            {assessment.status !== 'Archived' && (() => {
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
                  className={`group w-full px-4 py-2.5 text-left text-sm flex items-center gap-2 ${
                    isDisabled
                      ? 'text-gray-400 cursor-not-allowed opacity-60'
                      : 'text-destructive'
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
   * View / Send / Track / Result for one Assessment Versions row, as ⋮ menu
   * items. They used to be icon buttons beside the menu; they now lead it, so
   * the Action column holds the menu alone. The gates are unchanged: publish
   * state, the archived and revoked-invites seals and the permission check for
   * Send, and "has it been shared with anyone" for Track and Result. A gated
   * item stays in the menu, disabled, with its reason on hover, as it did as a
   * button.
   */
  const renderAssessmentRowMenuItems = (
    assessment: ReturnType<typeof mapAssessmentFromApi>,
    onView?: () => void,
  ) => {
    /* `invitations_count` is the backend's own count of invitations sent for
     * this assessment (surfaced by mapAssessmentFromApi as both
     * `invitations_count` and `candidates`). Zero means nobody has been
     * invited yet, which is what gates Track and Result below. */
    const invitationsSent = assessment.invitations_count ?? assessment.candidates ?? 0;
    const hasBeenShared = invitationsSent > 0;

    const itemClass = (disabled: boolean) =>
      `group w-full px-4 py-2.5 text-left text-sm flex items-center gap-2 transition-colors ${
        disabled
          ? 'text-gray-400 cursor-not-allowed'
          : 'text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800'
      }`;
    const iconClass = (disabled: boolean, enabledColor: string) =>
      `w-4 h-4 flex-shrink-0 ${disabled ? 'text-gray-300' : enabledColor}`;

    const canShare = isTenantAdmin || hasPermissionCode('assessments:share');
    const shareBlockedReason =
      assessment.status === 'Draft' ? 'Publish assessment first to share' :
      assessment.status === 'Archived' ? 'Archived assessments cannot be shared' :
      assessment.has_revoked_invites ? 'Invites for this assessment have been revoked. Duplicate it to start fresh.' :
      '';
    const isShareBlocked = !!shareBlockedReason;
    const trackReason = hasBeenShared
      ? `Track invitation status (${invitationsSent})`
      : 'Share the assessment to track invitations';
    const resultReason = hasBeenShared
      ? 'View results'
      : assessment.status === 'Draft'
      ? 'Publish the assessment to view results'
      : 'Share the assessment to view results';

    return (
      <>
        {/* Not on a Draft: a draft is opened through Edit below, on the
            Configure page it is still being built on. */}
        {onView && assessment.status !== 'Draft' && (
          <button
            onClick={() => {
              setOpenMenuId(null);
              onView();
            }}
            title={`View assessment V${assessment.version ?? 1} details`}
            className={itemClass(false)}
          >
            <Eye className={iconClass(false, 'text-menu-icon-view')} />
            <span className={MENU_ITEM_SCALE_CLASS}>View Details</span>
          </button>
        )}

        {/* Edit — the inverse of Track below: open while nothing has been
            sent (Track disabled), disabled once an invitation has gone out
            (Track enabled), which is the rule `handleEditAssessment` itself
            enforces. Archived stays read-only, as everywhere else. */}
        {(() => {
          const editReason = !canUpdateAssessment
            ? 'You do not have permission to edit assessments'
            : hasBeenShared
            ? 'Cannot edit — this assessment has already been sent to candidates'
            : assessment.status === 'Archived'
            ? 'Archived assessments cannot be edited'
            : '';
          const editDisabled = !!editReason;
          return (
            <button
              onClick={() => {
                if (editDisabled) return;
                setOpenMenuId(null);
                handleEditAssessment(assessment);
              }}
              disabled={editDisabled}
              title={editReason || `Edit assessment V${assessment.version ?? 1}`}
              className={itemClass(editDisabled)}
            >
              <Pencil className={iconClass(editDisabled, 'text-menu-icon-edit')} />
              <span className={MENU_ITEM_SCALE_CLASS}>Edit</span>
            </button>
          );
        })()}

        {/* Share via Email. Every row in this table IS a created assessment;
            what decides whether it can be shared is unchanged: a Draft has
            nothing published to send, an Archived one is out of circulation,
            and one whose invites were revoked is sealed until duplicated. */}
        <button
          onClick={() => {
            if (!canShare) {
              setOpenMenuId(null);
              toast.error('You do not have permission to share assessments');
              return;
            }
            if (isShareBlocked) return;
            setOpenMenuId(null);
            setSelectedAssessmentForShare(assessment);
            setShowShareModal(true);
          }}
          disabled={isShareBlocked}
          aria-disabled={!canShare}
          title={!canShare ? 'You do not have permission to share assessments' : (shareBlockedReason || 'Share via email')}
          className={itemClass(isShareBlocked || !canShare)}
        >
          <Send className={iconClass(isShareBlocked || !canShare, 'text-menu-icon-share')} />
          <span className={MENU_ITEM_SCALE_CLASS}>Share/Invite</span>
        </button>

        {/* Track Invites — always offered, enabled once the assessment has been
            shared with at least one candidate. */}
        <button
          onClick={() => {
            if (!hasBeenShared) return;
            setOpenMenuId(null);
            handleTrackInvites(assessment);
          }}
          disabled={!hasBeenShared}
          title={trackReason}
          className={itemClass(!hasBeenShared)}
        >
          <Radar className={iconClass(!hasBeenShared, 'text-menu-icon-secondary')} />
          <span className={MENU_ITEM_SCALE_CLASS}>Track</span>
        </button>

        {/* View Results — also gated on having been shared: with no invitation
            sent there is no attempt to score, so the results page would open
            empty. */}
        <button
          onClick={() => {
            if (!hasBeenShared || assessment.status === 'Draft') return;
            setOpenMenuId(null);
            /* Opened on the row's own coordinates: the JOB VERSION it sits
               under (the JD row the assessment points at) AND the ASSESSMENT
               VERSION it is — the same page, with the same two selectors, the
               Job List row's Result opens. `view=total` opens it on Total
               Candidates, as that Result button does. */
            const jobScope = assessment.jd_id ? encodeURIComponent(assessment.jd_id) : 'all';
            const versionScope = typeof assessment.version === 'number' ? assessment.version : 'all';
            openJobResults(`/recruitment/assessments/${assessment.id}/results?job_version_id=${jobScope}&assessment_version=${versionScope}&view=total`);
          }}
          disabled={!hasBeenShared}
          title={resultReason}
          className={itemClass(!hasBeenShared)}
        >
          <BarChart className={iconClass(!hasBeenShared, 'text-menu-icon-score')} />
          <span className={MENU_ITEM_SCALE_CLASS}>View Results</span>
        </button>
      </>
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
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl text-gray-900 dark:text-slate-50 mb-0.5 tracking-tight font-semibold">Assessment Management</h1>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400">
                Create and manage skill assessments for candidates
              </p>
              {/* JD Filter Indicator */}
              {preSelectedJdId && preSelectedJdTitle && (
                <div className="mt-2 flex items-center gap-2 min-w-0">
                  <div className="inline-flex items-center gap-2 max-w-full min-w-0 bg-brand-blue/5 text-brand-blue px-3 py-1.5 rounded-lg ring-1 ring-brand-blue/20">
                    <Info className="w-4 h-4 shrink-0" />
                    <span className="text-sm font-medium min-w-0 truncate" title={preSelectedJdTitle}>Filtered by JD: {preSelectedJdTitle}</span>
                    <button
                      onClick={() => router.push('/recruitment/assessments')}
                      className="ml-1 shrink-0 hover:bg-brand-blue/10 rounded p-0.5 transition-colors"
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
              <Button
                variant="secondary"
                size="md"
                onClick={() => {
                  // Tells the question bank which module to name in its breadcrumb.
                  try { sessionStorage.setItem('questionBankSource', 'assessments'); } catch { /* ignore */ }
                  router.push('/recruitment/hr-question-bank');
                }}
                icon={<ClipboardList className="w-4 h-4" />}
              >
                <span className="hidden sm:inline">HR Question Bank</span>
                <span className="sm:hidden">Questions</span>
              </Button>
            )}
            {/* Send Invite — same permission as the per-row Share action. Always visible; disabled without permission. */}
            <Button
              variant="secondary"
              size="md"
              onClick={() => {
                if (!canUpdateAssessment) {
                  toast.error('You do not have permission to edit assessments');
                  return;
                }
                handleSendInvite();
              }}
              disabled={shareableAssessments.length === 0}
              aria-disabled={!canUpdateAssessment}
              title={
                !canUpdateAssessment
                  ? 'You do not have permission to edit assessments'
                  : shareableAssessments.length === 0
                    ? 'Publish an assessment before inviting candidates'
                    : 'Send an assessment invitation'
              }
              icon={<Mail className="w-4 h-4" />}
            >
              <span className="hidden sm:inline">Send Invite</span>
              <span className="sm:hidden">Invite</span>
            </Button>
            {onOpenCandidateView && (
              <Button variant="secondary" size="md" onClick={onOpenCandidateView} icon={<Eye className="w-4 h-4" />}>
                Preview Candidate View
              </Button>
            )}
            <Button
              variant="primary"
              size="md"
              onClick={() => {
                if (!canCreateAssessment) {
                  toast.error('You do not have permission to create assessments');
                  return;
                }
                handleOpenCreation();
              }}
              disabled={!isUnlimited && totalUnits > 0 && (totalUnits - stats.units_consumed) <= 0}
              aria-disabled={!canCreateAssessment}
              title={!canCreateAssessment ? 'You do not have permission to create assessments' : (!isUnlimited && totalUnits > 0 && (totalUnits - stats.units_consumed) <= 0 ? 'No assessment units available' : '')}
              icon={<Sparkles className="w-4 h-4" />}
              className={!canCreateAssessment ? 'opacity-50 cursor-not-allowed' : ''}
            >
              <span className="hidden sm:inline">Create Assessment</span>
                <span className="sm:hidden">Create</span>
              </Button>
          </div>
        </div>

        {/* Low Quota Warning Banner */}
        {!isUnlimited && availableUnits !== null && availableUnits > 0 && availableUnits <= 3 && (
          <div className="mb-4 sm:mb-6 bg-warning-subtle border border-warning-line rounded-lg p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-warning-subtle flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-4 h-4 text-warning" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-warning-strong mb-0.5">Low Assessment Quota</h3>
                <p className="text-sm text-warning">
                  You have only <span className="font-semibold">{availableUnits}</span> assessment unit{availableUnits !== 1 ? 's' : ''} remaining out of {totalUnits}.
                  {' '}Consider purchasing add-on credits to avoid interruptions.
                </p>
              </div>
              <Button variant="primary" size="md" onClick={() => window.location.href = '/subscription/usage-quotas'} className="flex-shrink-0">
                Add Credits
              </Button>
            </div>
          </div>
        )}

        {/* Quota Exhausted Banner — only show when units were actually consumed */}
        {!isUnlimited && availableUnits !== null && availableUnits <= 0 && stats.units_consumed > 0 && (
          <div className="mb-4 sm:mb-6 bg-destructive-subtle border border-destructive-line rounded-lg p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-destructive-subtle flex items-center justify-center flex-shrink-0">
                <Lock className="w-4 h-4 text-destructive" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-destructive-strong mb-0.5">Assessment Quota Exhausted</h3>
                <p className="text-sm text-destructive">
                  You have used all {totalUnits} assessment units in your current plan. Purchase add-on credits or upgrade your plan to create more assessments.
                </p>
              </div>
              <Button variant="primary" size="md" onClick={() => window.location.href = '/subscription/usage-quotas'} icon={<Plus className="w-4 h-4" />} className="flex-shrink-0">
                Add Credits
              </Button>
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
                                     distinct jobs that HAVE assessments
                                     (stats.total_jobs_with_assessments). It leads the
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
            {/* Total Jobs — the count of jobs (that have an assessment) this
                tenant has, opening the job-grouped Total Jobs tab, which is
                the list those jobs are the rows of. Same shared StatsCard as
                the four beside it, on the same neutral tone with
                `sparkline={false}` and `showClickArrow`, so it is the row's
                fifth card rather than a card of its own kind.
                `totalJobs` (`stats.total_jobs_with_assessments`) comes off
                the SAME `/assessments/stats` response the other four read —
                see the note above — so it gates on `isLoadingStats` the same
                way they do; showing its 0-until-loaded default instead used
                to read as "this tenant has zero jobs" while the real request
                was still in flight (or had failed silently). */}
            <StatsCard
              tone="neutral"
              active={isOverviewCardActive('jobs')}
              showClickArrow
              icon={Briefcase}
              label="Total Jobs"
              value={isLoadingStats ? '...' : totalJobs.toLocaleString()}
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
        <ListToolbarSlotProvider value={toolbarSlot.node}>
        <div ref={listSectionRef} className="scroll-mt-4" aria-hidden="true" />

        {/* ── Section heading — the active tab's name and the size of the list
            under it, on one line directly above the search row.

            Lifted from /recruitment/resume-scoring, which is where this shape
            comes from: that page heads its list with `All Candidates (73)` —
            `${section.title} (${count})` in an <h2> above the same ListToolbar
            — and keeps the toolbar's own "24 of 56" badge below it. The two
            are not a duplicate pair, they answer different questions: the
            heading is how big this list IS, the badge is how much of it you
            are currently seeing. Only the badge moves as you type.

            Which count each tab states is decided by what that tab actually
            lists, so a heading can never disagree with its own rows:

              Total Jobs / Archived   the page lists these itself, as JOB rows
                                      — `assessmentResultCount`, the same
                                      figure the "Job List (N)" heading this
                                      replaces always used.
              All / Active / Draft    the rows live in `AllAssessmentsTable`,
                                      so the count comes from /assessments/stats
                                      instead — the same fields the summary
                                      cards above read, so the heading and the
                                      card that opened it always match.
              Candidate Results       the loaded fan-out, before this tab's own
                                      search narrows it.

            An em dash while the figure is still loading rather than a 0: "(0)"
            is a claim, and a heading that reads 0 and then 25 has moved the
            search row under it.

            The four tabs with no entry are the ones that are not a cut of the
            assessment list — Invitation Status, the two log tabs and Settings
            — and each already carries its own card header. */}
        {(() => {
          const sectionHeading: Partial<Record<AssessmentPageTab, { title: string; count: number; loading: boolean }>> = {
            jobs: { title: 'Job List', count: assessmentResultCount, loading: isLoading },
            all: { title: 'All Assessments', count: stats.total_assessments, loading: isLoadingStats },
            active: { title: 'Active Assessments', count: stats.active_assessments, loading: isLoadingStats },
            draft: { title: 'Draft Assessments', count: stats.draft_assessments, loading: isLoadingStats },
            /* Stats, not `assessmentResultCount`, now that Archived lists
               assessments in `AllAssessmentsTable` alongside Draft rather than
               the page's own job rows — the count has to be of the same thing
               the rows are. */
            archived: { title: 'Archived', count: stats.archived_assessments, loading: isLoadingStats },
            'completed-candidates': {
              title: 'Candidate Results',
              count: completedCandidates.length,
              loading: isLoadingCompletedCandidates,
            },
          };
          const section = sectionHeading[activeTab];
          if (!section) return null;
          return (
            /* The page's own heading treatment, unchanged — it is the one the
               "Job List (N)" header wore, down to the lighter weight on the
               figure so the line reads as a name first and a number second. */
            <h2 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-slate-50 tracking-tight mb-3">
              {section.title}{' '}
              <span className="font-normal text-gray-500 dark:text-slate-500 tabular-nums">
                ({section.loading ? '—' : section.count.toLocaleString()})
              </span>
            </h2>
          );
        })()}

        {/* THE search position for this page: one row, directly above the tab
            pills, for every tab.

            It used to be this block alone — gated to Total Jobs and Archived,
            the two tabs the page lists itself — and each remaining tab drew its
            own search somewhere else: All/Active/Draft inside
            `AllAssessmentsTable`, Activity Logs inside its card's header,
            Invitation Status inside the card as an `InviteFilterBar`, Consent
            Logs as a hand-built filter row, Candidate Results not at all. Same
            search box, five different places, so changing tab moved it.

            Now the slot is the page's and every tab renders THROUGH it (see
            `ListToolbarPortal`), including the tabs whose content is a
            component of its own. Each toolbar keeps its own state, its own
            placeholder and its own filter fields — what is shared is the row,
            its position and its order: search, More Filters, Reset, count
            badge. */}
        <ListToolbarSlot ref={toolbarSlot.ref} />

        {/* Total Jobs and Archived — the two tabs the page lists itself. Same
            ListToolbar, same panel, same handlers as before; the only change is
            that the wrapper div is now the shared slot above. */}
          {!activeTabOwnsListContent && (
            <ListToolbarPortal>
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
                /* The shared panel — see `ListFilterPanel`. This tab is where
                   its shell came from, so the markup below is unchanged; what
                   moved out is the wrapper, the grid and the footer rule, so
                   the assessment tabs can open the same object rather than a
                   copy of it. */
                <ListFilterPanel
                  footer={
                    <Button
                      // The controls above commit as they change, so Done just closes.
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowAssessmentFilters(false)}
                    >
                      Done
                    </Button>
                  }
                >
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
                </ListFilterPanel>
              )}

              {assessmentListNarrowed && !isLoading && (
                <p className="mt-3 text-xs sm:text-sm text-gray-600 dark:text-slate-400">
                  <span className="font-semibold text-gray-900 dark:text-slate-50">{assessmentResultCount}</span>
                  {' '}assessment{assessmentResultCount === 1 ? '' : 's'} match
                  {assessmentSearch.trim() ? ` "${assessmentSearch.trim()}"` : ' your filters'}
                </p>
              )}
            </ListToolbarPortal>
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
          /* Labels only — no counts in the pills.

             The count for whatever is on screen lives in the search row above,
             as the `ListCountBadge` that closes it. That is the arrangement on
             /recruitment/resume-scoring, this row's reference page: its search
             row ends with "24 of 56 candidates" and its "Show:" pills below
             carry nothing but their names.

             A number in the pill as well would be a second count a few pixels
             from the first, and a worse one: the badge states the narrowing
             ("18 of 42"), which is the figure that actually moves as you search,
             while a pill can only ever show a fixed total. It also widened
             every pill enough to wrap the row onto a third line. */
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

          /* One pill class for the row — the tab pills and Clear Sort beside
             Settings — so the button sits at exactly Settings' size. */
          const TAB_PILL_CLASS = 'px-3 py-1.5 rounded-lg text-xs sm:text-sm transition-all whitespace-nowrap inline-flex items-center gap-1.5';
          const TAB_PILL_IDLE_CLASS = 'bg-brand-blue/5 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/10 hover:text-brand-blue';
          const TAB_PILL_ICON_CLASS = 'w-3.5 h-3.5 sm:w-4 sm:h-4';

          const renderTabPill = (tab: (typeof TABS)[number]) => {
            const TabIcon = 'icon' in tab ? tab.icon : undefined;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                aria-current={isActive ? 'page' : undefined}
                className={`${TAB_PILL_CLASS} ${
                  isActive
                    ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25'
                    : TAB_PILL_IDLE_CLASS
                }`}
              >
                {TabIcon && <TabIcon className={TAB_PILL_ICON_CLASS} />}
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
                {/* Clear Sort — All / Active / Draft / Archived, right after
                    Settings, in Settings' own pill styling. Shown only while
                    this tab's table is sorted off its default — the same
                    appear-when-there-is-something-to-undo rule as the
                    toolbar's Reset. Puts the sort back to its default and
                    nothing else: search and filters stay as they are. */}
                {isFlatAssessmentTab(activeTab) && sortedAssessmentTab === activeTab && (
                  <button
                    type="button"
                    onClick={() => setClearAssessmentSortSignal((n) => n + 1)}
                    title="Return the table to its default order"
                    className={`${TAB_PILL_CLASS} ${TAB_PILL_IDLE_CLASS}`}
                  >
                    <ArrowUpDown className={TAB_PILL_ICON_CLASS} />
                    Clear Sort
                  </button>
                )}
                {/* Invitation Status's Refresh — icon only, right after
                    Settings. Same handler and spinner, and shown on the same
                    terms the toolbar it came from was. */}
                {activeTab === 'invitation-status' && !inviteStatusError && inviteStatusRows.length > 0 && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={loadAllInviteStatuses}
                    disabled={isLoadingInviteStatus}
                    title="Fetch the latest invite statuses"
                    aria-label="Refresh"
                    className="px-2"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isLoadingInviteStatus ? 'animate-spin' : ''}`} />
                  </Button>
                )}
              </div>
            </div>
          );
        })()}

        {/* The list itself. Same card as before — it simply no longer
            carries the tab strip in its header. */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5">
          {/* Assessment List */}
          <div className="p-3 sm:p-6">

            {/* The "Job List (25)" header stood here. Its treatment is what
                the tab pills now wear — label, then the figure in parentheses
                a shade lighter — and with the count in the pill this heading
                said the same number twice on the same screen, a few pixels
                apart: the lit pill reads "Total Jobs (25)" and this read "Job
                List (25)".

                So the pill keeps the count and the card starts at its rows,
                which is where All / Active / Draft already start since their
                own headings came off. */}

            {isFlatAssessmentTab(activeTab) ? (() => {
              const config = FLAT_ASSESSMENT_TABLE_CONFIG[activeTab];
              return (
                <AllAssessmentsTable
                  key={`assessment-list-${activeTab}`}
                  embedded
                  fixedStatus={config.fixedStatus}
                  clearSortSignal={clearAssessmentSortSignal}
                  onSortDefaultChange={(isDefault) => setSortedAssessmentTab(isDefault ? null : activeTab)}
                />
              );
            })() : activeTab === 'completed-candidates' ? (() => {
              /* Candidate Results tab - every completed attempt across all assessments */
              const resultsTotal = completedCandidates.length;

              /* Search + filters, applied here rather than in the request: the
                 rows are a client-side merge of one listResults() call per
                 assessment (see `loadAllCompletedCandidates`), so there is no
                 single endpoint to hand a query to.

                 The haystack is every identifier the row actually shows, plus
                 the assessment title — the table has no column for it, but it
                 is still how a recruiter names what someone sat. Same rule the
                 Invitation Status search below already follows. */
              const resultQuery = completedCandidatesSearch.appliedQuery.trim().toLowerCase();
              const {
                job: filterResultJob,
                outcome: filterResultOutcome,
                completedFrom: filterResultFrom,
                completedTo: filterResultTo,
              } = completedCandidatesSearch.filters;
              /* Inclusive of the whole `to` day — a recruiter picking today
                 expects today's results, not those finished at exactly 00:00.
                 The same pair of lines the Invitation Status tab uses. */
              const resultFromTime = filterResultFrom ? new Date(`${filterResultFrom}T00:00:00`).getTime() : null;
              const resultToTime = filterResultTo ? new Date(`${filterResultTo}T23:59:59.999`).getTime() : null;

              /* Pass/Fail for the whole attempt, read the same way the two
                 score cells below read it: a round counts as passed at
                 RESULT_PASS_MARK, and an attempt passes when every round it
                 has a score for did. An attempt with no score at all is
                 neither, so it falls out of both filters rather than being
                 quietly counted as a fail. */
              const resultOutcomeOf = (row: CandidateResultRow): 'pass' | 'fail' | null => {
                const scores = [row.technical_score, row.coding_score]
                  .filter((value): value is number => typeof value === 'number');
                if (scores.length === 0) return null;
                return scores.every((value) => value >= RESULT_PASS_MARK) ? 'pass' : 'fail';
              };

              const filteredResults = completedCandidates.filter((row) => {
                if (resultQuery) {
                  const haystack = [
                    row.candidate_name,
                    row.candidate_email,
                    row.candidate_display_id,
                    row.candidate_phone,
                    /* The Job ID joins the haystack with its column: every
                       other identifier this table SHOWS is searchable, and a
                       JD-014 on screen that the search box cannot find reads
                       as broken. It is also what the Invitation Status search
                       beside it already matches on. */
                    row._jd_short_id,
                    row.jd_title,
                    row._assessment_title,
                    row._assessment_short_id,
                  ].filter(Boolean).join(' ').toLowerCase();
                  if (!haystack.includes(resultQuery)) return false;
                }
                if (filterResultJob && (row.jd_title || row._assessment_title || '') !== filterResultJob) return false;
                if (filterResultOutcome !== 'all' && resultOutcomeOf(row) !== filterResultOutcome) return false;
                if (resultFromTime !== null || resultToTime !== null) {
                  const completedAt = new Date(row.completed_at || 0).getTime();
                  if (!completedAt) return false;
                  if (resultFromTime !== null && completedAt < resultFromTime) return false;
                  if (resultToTime !== null && completedAt > resultToTime) return false;
                }
                return true;
              });

              /* The Job filter's options — the jobs actually present in the
                 loaded rows, so the control can never offer a value that
                 selects nothing. */
              const resultJobOptions: SearchableSelectOption[] = [...new Set(
                completedCandidates
                  .map((row) => row.jd_title || row._assessment_title || '')
                  .filter(Boolean),
              )].sort((a, b) => a.localeCompare(b)).map((title) => ({ value: title, label: title }));

              const total = filteredResults.length;
              const totalPages = Math.max(1, Math.ceil(total / completedCandidatesPageSize));
              const safePage = Math.min(Math.max(1, completedCandidatesPage), totalPages);
              const pageItems = filteredResults.slice((safePage - 1) * completedCandidatesPageSize, safePage * completedCandidatesPageSize);
              return (
                <div>
                  {/* This tab's row in the page's one toolbar position — the
                      same ListToolbar, in the same place, as every other tab.

                      Absent on an error and on a tab with no results at all:
                      both show their own state, with nothing to search — the
                      rule the empty states below already followed. A zero
                      caused by the search itself keeps the toolbar, because it
                      is the way back. A refresh does too: the gate is on the
                      rows already loaded, not on `isLoading`, so the row does
                      not blink out and back under the cursor. */}
                  {!completedCandidatesError && resultsTotal > 0 && (
                    <ListToolbarPortal>
                      <ListToolbar
                        searchValue={completedCandidatesSearch.query}
                        // The hook debounces (350ms) into `appliedQuery`, so the
                        // toolbar hands keystrokes straight through.
                        searchDebounceMs={0}
                        onSearchChange={completedCandidatesSearch.setQuery}
                        searchPlaceholder="Search by candidate, email, CID, job or assessment..."
                        onToggleFilters={() => setShowCompletedCandidateFilters(!showCompletedCandidateFilters)}
                        filtersOpen={showCompletedCandidateFilters}
                        activeFilterCount={completedCandidatesSearch.activeFilterCount}
                        filtersApplied={completedCandidatesSearch.filtersApplied}
                        onClearFilters={completedCandidatesSearch.reset}
                        className="mb-0"
                        countBadge={
                          <ListCountBadge filtered={total} total={resultsTotal} noun="result" />
                        }
                      />

                      {showCompletedCandidateFilters && (
                        /* Controls commit as they change, so Done just closes —
                           the same panel contract the Total Jobs tab uses. */
                        <ListFilterPanel
                          footer={
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setShowCompletedCandidateFilters(false)}
                            >
                              Done
                            </Button>
                          }
                        >
                          <SearchableSelect
                            label="Job"
                            value={filterResultJob}
                            onChange={(value) => completedCandidatesSearch.setFilter('job', value)}
                            options={resultJobOptions}
                            placeholder="All jobs"
                            searchPlaceholder="Search job..."
                            allLabel="All jobs"
                            emptyMessage="No jobs match"
                          />

                          <div>
                            <label htmlFor="result-outcome" className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                              Outcome
                            </label>
                            <select
                              id="result-outcome"
                              value={filterResultOutcome}
                              onChange={(e) => completedCandidatesSearch.setFilter('outcome', e.target.value as typeof filterResultOutcome)}
                              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-black dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40"
                            >
                              <option value="all">All outcomes</option>
                              <option value="pass">Passed</option>
                              <option value="fail">Failed</option>
                            </select>
                          </div>

                          <div>
                            <label htmlFor="result-completed-from" className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                              Completed from
                            </label>
                            <input
                              id="result-completed-from"
                              type="date"
                              value={filterResultFrom}
                              max={filterResultTo || undefined}
                              onChange={(e) => completedCandidatesSearch.setFilter('completedFrom', e.target.value)}
                              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-black dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40"
                            />
                          </div>

                          <div>
                            <label htmlFor="result-completed-to" className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                              Completed to
                            </label>
                            <input
                              id="result-completed-to"
                              type="date"
                              value={filterResultTo}
                              min={filterResultFrom || undefined}
                              onChange={(e) => completedCandidatesSearch.setFilter('completedTo', e.target.value)}
                              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-black dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40"
                            />
                          </div>
                        </ListFilterPanel>
                      )}
                    </ListToolbarPortal>
                  )}
                  {isLoadingCompletedCandidates ? (
                    <>
                      {/* No skeleton line above the card any more: it stood in
                          for the "N results across all assessments" text, and
                          that count is now the toolbar's badge, which lives
                          outside this card. */}
                      {/* No title-strip skeleton either — the loaded card has
                          no title strip to stand in for. */}
                      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] shadow-sm overflow-hidden">
                        <div className="min-h-[400px] overflow-auto tf-table-shell">
                          {/* Same floor as the loaded table below, so the rows
                              do not shift sideways when the skeleton swaps
                              out. */}
                          <table className="w-full min-w-[1930px] table-auto">
                            <thead className="[&_th]:bg-slate-50 dark:[&_th]:bg-slate-800 [&_th]:border-b [&_th]:border-gray-200 dark:[&_th]:border-slate-700">
                              <tr>
                                {['CID', 'Candidate', 'Email', 'Job ID', 'JD Title', 'Job Version', 'Assessment Version', 'Resume Version', 'Phone', 'Tech Score', 'Coding Score', 'Invite Source', 'Result Status', 'Timeline', 'Completed', 'Duration', 'Actions'].map((c) => (
                                  <th key={c} className="px-4 py-3"><Skeleton className="h-3 w-20" /></th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                              {Array.from({ length: 8 }).map((_, r) => (
                                <tr key={r}>
                                  <td className="px-4 py-4"><Skeleton className="h-5 w-16 rounded" /></td>
                                  <td className="px-4 py-4">
                                    <div className="flex items-center gap-2.5">
                                      <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
                                      <Skeleton className="h-4 w-28" />
                                    </div>
                                  </td>
                                  <td className="px-4 py-4"><Skeleton className="h-4 w-40" /></td>
                                  {/* Job ID — badge-shaped, like the CID chip
                                      in the first column. */}
                                  <td className="px-4 py-4"><Skeleton className="h-5 w-16 rounded" /></td>
                                  <td className="px-4 py-4"><Skeleton className="h-4 w-36" /></td>
                                  <td className="px-4 py-4"><Skeleton className="h-4 w-10" /></td>
                                  {/* Assessment Version — same width as the Job
                                      Version cell above it, since both settle
                                      into the same short `v3`. */}
                                  <td className="px-4 py-4"><Skeleton className="h-4 w-10" /></td>
                                  <td className="px-4 py-4"><Skeleton className="h-5 w-10 rounded-full" /></td>
                                  <td className="px-4 py-4"><Skeleton className="h-4 w-28" /></td>
                                  <td className="px-4 py-4"><Skeleton className="h-5 w-20 rounded" /></td>
                                  <td className="px-4 py-4"><Skeleton className="h-6 w-12 mx-auto" /></td>
                                  <td className="px-4 py-4"><Skeleton className="h-6 w-12 mx-auto" /></td>
                                  <td className="px-4 py-4"><Skeleton className="h-6 w-20 rounded-full mx-auto" /></td>
                                  <td className="px-4 py-4"><Skeleton className="h-4 w-40" /></td>
                                  <td className="px-4 py-4"><Skeleton className="h-4 w-24" /></td>
                                  <td className="px-4 py-4"><Skeleton className="h-4 w-16 mx-auto" /></td>
                                  <td className="px-4 py-4"><Skeleton className="h-9 w-9 rounded-md mx-auto" /></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  ) : completedCandidatesError ? (
                    <div className="p-6 text-center">
                      <p className="text-sm text-destructive mb-3">{completedCandidatesError}</p>
                      <Button variant="primary" size="md" onClick={loadAllCompletedCandidates}>
                        Retry
                      </Button>
                    </div>
                  ) : resultsTotal === 0 ? (
                    /* No results anywhere: the shared tab empty state, and with
                       it none of the tab's own chrome — the toolbar above is
                       gated on the same count, because there is nothing to
                       search. */
                    <TabEmptyState
                      icon={Users}
                      title="No Candidate Results Yet"
                      description="Results appear here once candidates complete an assessment."
                    />
                  ) : total === 0 ? (
                    /* A zero this tab's OWN search or filters caused. Different
                       case, different state: the toolbar stays (it is the way
                       out) and the message offers the same Reset it does. */
                    <ListEmptyState
                      icon={Users}
                      isNarrowed
                      query={completedCandidatesSearch.appliedQuery}
                      entityLabel="result"
                      emptyTitle="No Candidate Results Yet"
                      onReset={completedCandidatesSearch.reset}
                    />
                  ) : (
                    <>
                      {/* The count that used to sit here — "N results across
                          all assessments" — is now the toolbar's count badge,
                          in the same corner as every other tab's. */}
                      {/* Same card as the per-assessment results view, minus
                          its title strip: "Candidate Results" is now the
                          section heading above the search row, and repeating it
                          on the card meant the same two words twice down the
                          page with the search and the tabs in between. */}
                      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 overflow-hidden">
                        <div className="min-h-[400px] max-h-[calc(100dvh-24rem)] overflow-auto tf-table-shell">
                        {/* 1500 -> 1720 for the two version columns, then
                            1720 -> 1830 for Assessment Version, then
                            1830 -> 1930 for Job ID. The shell
                            already scrolls horizontally (tf-table-shell), so
                            each widening changes nothing but which point the
                            scroll starts at; leaving the floor where it was
                            would squeeze the existing columns instead, which is
                            the one way adding a column could change the others.
                            110px is what an "Assessment Version" heading needs
                            — the widest thing in the column, since the cells
                            under it are a three-character `v3` — and 100px is
                            what a JD-014 badge needs beside its heading. */}
                        <table className="w-full min-w-[1930px] table-auto">
                          <thead className="sticky top-0 z-10 [&_th]:bg-slate-50 dark:[&_th]:bg-slate-800 [&_th]:border-b [&_th]:border-gray-200 dark:[&_th]:border-slate-700">
                            <tr>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">CID</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Candidate</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Email</th>
                              {/* Job ID leads the job group — the id first,
                                  then the name, then the versions — which is
                                  the order the Invitation Status rows and the
                                  All Assessments table both put them in. */}
                              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Job ID</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">JD Title</th>
                              {/* The three version columns sit next to JD
                                  Title so the job, the version of it, the
                                  version of the assessment sat against it and
                                  the resume version scored for it read as one
                                  group. Same th classes as every other column.

                                  Assessment Version goes directly after Job
                                  Version, which is the pairing and the order
                                  the Track Invites table already uses: a job
                                  version and an assessment version are
                                  separate facts about the row — the job was
                                  republished, the assessment was re-authored —
                                  and side by side in this order they read as
                                  the relationship they are, this assessment
                                  version on that job version. */}
                              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Job Version</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Assessment Version</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Resume Version</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Phone</th>
                              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Tech Score</th>
                              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Coding Score</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Invite Source</th>
                              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Result Status</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Timeline</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Completed</th>
                              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Duration</th>
                              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle tf-sticky-col">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                            {pageItems.map((result) => {
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
                                      <span className="block max-w-[14rem] truncate text-sm font-medium text-gray-900 dark:text-slate-50" title={result.candidate_name || 'Unknown'}>
                                        {result.candidate_name || 'Unknown'}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-4 align-middle text-sm text-gray-600 dark:text-slate-400 whitespace-nowrap">
                                    <span className="block max-w-[16rem] truncate" title={result.candidate_email || undefined}>{result.candidate_email || '-'}</span>
                                  </td>
                                  {/* Job ID — the shared `JobIdBadge`, which is
                                      the one definition of this identifier in
                                      the app (nine hand-rolled variants were
                                      collapsed into it). Used here rather than
                                      the CID chip beside it so a JD-014 reads
                                      the same on this table as on the
                                      Invitation Status rows, the job list and
                                      the All Assessments table.

                                      A dash when the assessment has no job —
                                      a general assessment is not tied to one,
                                      which is the same case `jd_title` already
                                      falls back for. */}
                                  <td className="px-4 py-4 align-middle whitespace-nowrap">
                                    {result._jd_short_id ? (
                                      <JobIdBadge className="inline-flex items-center">{result._jd_short_id}</JobIdBadge>
                                    ) : (
                                      <span className="text-gray-400 text-sm">-</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-4 align-middle text-sm text-gray-700 dark:text-slate-300 whitespace-nowrap">
                                    <span className="block max-w-[16rem] truncate" title={result.jd_title || result._assessment_title || undefined}>{result.jd_title || result._assessment_title || '-'}</span>
                                  </td>
                                  {/* Job Version / Assessment Version — the
                                      All Assessments table's blue / cyan
                                      VersionPill, as the Invitation Status
                                      rows draw the same two fields. A dash
                                      when the record carries no version,
                                      rather than an invented v1. */}
                                  <td className="px-4 py-4 align-middle whitespace-nowrap">
                                    {result._jd_version ? (
                                      <VersionPill kind="job" version={result._jd_version} />
                                    ) : (
                                      <span className="text-gray-400 text-sm">-</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-4 align-middle whitespace-nowrap">
                                    {result._assessment_version ? (
                                      <VersionPill kind="assessment" version={result._assessment_version} />
                                    ) : (
                                      <span className="text-gray-400 text-sm">-</span>
                                    )}
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
                                  <td className="px-4 py-4 align-middle text-center">
                                    <div className="flex flex-col items-center gap-1">
                                      <span className={`${SCORE_CELL_TEXT} ${typeof result.technical_score === 'number' ? (result.technical_score >= RESULT_PASS_MARK ? 'text-success' : 'text-destructive') : 'text-gray-400'}`}>
                                        {typeof result.technical_score === 'number' ? `${formatScore(result.technical_score)}%` : '-'}
                                      </span>
                                      {typeof result.technical_score === 'number' && (
                                        <span className={`text-xs font-medium ${result.technical_score >= RESULT_PASS_MARK ? 'text-success' : 'text-destructive'}`}>
                                          {result.technical_score >= RESULT_PASS_MARK ? 'Pass' : 'Fail'}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-4 py-4 align-middle text-center">
                                    <div className="flex flex-col items-center gap-1">
                                      <span className={`${SCORE_CELL_TEXT} ${typeof result.coding_score === 'number' ? (result.coding_score >= RESULT_PASS_MARK ? 'text-success' : 'text-destructive') : 'text-gray-400'}`}>
                                        {typeof result.coding_score === 'number' ? `${formatScore(result.coding_score)}%` : '-'}
                                      </span>
                                      {typeof result.coding_score === 'number' && (
                                        <span className={`text-xs font-medium ${result.coding_score >= RESULT_PASS_MARK ? 'text-success' : 'text-destructive'}`}>
                                          {result.coding_score >= RESULT_PASS_MARK ? 'Pass' : 'Fail'}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  {/* Invite Source — how this candidate was
                                      actually invited, from the invitation's
                                      own resume_id; sits right before Status. */}
                                  <td className="px-4 py-4 align-middle text-sm text-gray-700 dark:text-slate-300 whitespace-nowrap">
                                    <InviteSourceValue inv={assessmentInviteSource(result)} iconClassName="w-3.5 h-3.5" />
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
                                          <CheckCircle className="w-3 h-3 text-success" />
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
                                      <Button
                                        variant="primary"
                                        size="sm"
                                        onClick={() => openCandidateResult(result, pageItems)}
                                        title="View candidate result"
                                        aria-label={`View result for ${result.candidate_name || 'candidate'}`}
                                      >
                                        <Eye className="w-3.5 h-3.5 shrink-0" />
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        </div>
                      </div>
                      {/* Total Jobs' pagination, as that tab renders it. */}
                      <ListPagination
                        currentPage={safePage}
                        itemsPerPage={completedCandidatesPageSize}
                        totalItems={total}
                        onPageChange={setCompletedCandidatesPage}
                        onItemsPerPageChange={setCompletedCandidatesPageSize}
                        itemLabel="candidates"
                      />
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
              /* Each row's current status, worked out once per render — the
                 counts, the filter and the Status badge below all read it. */
              type InviteRow = (typeof inviteStatusRows)[number];
              const statusOfInvite = new Map<InviteRow, string>(
                inviteStatusRows.map((inv) => [inv, currentInviteStatus(inv)]),
              );
              const statusOf = (inv: InviteRow) => statusOfInvite.get(inv) ?? currentInviteStatus(inv);
              const bucketCount = (bucket: string) =>
                inviteStatusRows.filter((inv) => statusOf(inv) === bucket).length;
              /* The More Filters Status dropdown — the tabs below, as options. */
              const INVITATION_STATUS_TAB_OPTIONS = [
                { value: 'all', label: 'All Statuses' },
                { value: 'sent', label: 'Invited' },
                { value: 'revoked', label: 'Revoked' },
                { value: 'expired', label: 'Expired' },
                { value: 'started', label: 'In Progress' },
                { value: 'completed', label: 'Completed' },
              ];
              const totalInvites = inviteStatusRows.length;
              const completedInvites = bucketCount('completed');

              const search = inviteStatusFilters.search.trim().toLowerCase();
              /* Date range is inclusive of the whole `to` day — a recruiter
                 picking today expects today's invites, not those sent at
                 exactly 00:00. */
              const fromTime = inviteStatusFilters.dateFrom ? new Date(`${inviteStatusFilters.dateFrom}T00:00:00`).getTime() : null;
              const toTime = inviteStatusFilters.dateTo ? new Date(`${inviteStatusFilters.dateTo}T23:59:59.999`).getTime() : null;
              const filtered = inviteStatusRows.filter((inv) => {
                if (inviteStatusFilters.status !== 'all' && statusOf(inv) !== inviteStatusFilters.status) return false;
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
              const totalPages = Math.max(1, Math.ceil(total / inviteStatusPageSize));
              const safePage = Math.min(Math.max(1, inviteStatusPage), totalPages);
              const pageItems = filtered.slice((safePage - 1) * inviteStatusPageSize, safePage * inviteStatusPageSize);

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
              /* The checkbox column exists only on the sub-tabs whose rows a
                 bulk action can act on: Invited (Revoke), Expired (Resend) and
                 Completed (Export). Total, Revoked and In Progress have no bulk
                 action, so they get no column, no Select All and no selection
                 — the rows below read nothing from a selection there. */
              const showInviteSelection = ['sent', 'expired', 'completed'].includes(inviteStatusFilters.status);
              const selectedInviteRows = showInviteSelection
                ? filtered.filter((inv) => selectedInviteIds.has(inv.id))
                : [];
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

              /* Bulk Revoke — same gate, on the Invited ('sent') bucket
                 (Scenario 4: all selected Invited -> Revoke, never Resend). */
              const revocableSelectedRows = selectedInviteRows.filter(isInviteRevocable);
              const showInviteBulkRevoke = inviteStatusFilters.status === 'sent'
                && revocableSelectedRows.length > 0;
              /* What the More Filters button reports. The date range is one
                 logical filter, not two, so From + To count as 1 — the same
                 rule `useListSearch`'s `countFilters` applies on the tabs that
                 use the hook. Status counts only when it is off 'all'.

                 The status select and the segmented control above write the
                 same field, so picking Completed either way lights the button
                 and the segment together; that was already true of the filter
                 bar this replaces. */
              const inviteStatusFilterCount =
                (inviteStatusFilters.status !== 'all' ? 1 : 0)
                + (inviteStatusFilters.dateFrom || inviteStatusFilters.dateTo ? 1 : 0);
              const clearInviteStatusFilters = () => {
                setInviteStatusFilters(EMPTY_INVITE_FILTERS);
                setInviteStatusPage(1);
              };

              return (
                <div>
                  {/* This tab's row in the page's one toolbar position.

                      It is the same four fields the `InviteFilterBar` inside
                      the card used to carry — search, status, invited-from,
                      invited-to — writing the same `inviteStatusFilters`
                      state, read by the same filter above. What changed is the
                      row they are drawn as and where it sits: the shared
                      ListToolbar, above the tab pills, with the count badge in
                      the same corner as every other tab's.

                      Gated on having invitations at all, because the "nothing
                      invited yet" state below deliberately shows none of this
                      tab's chrome. */}
                  {!inviteStatusError && totalInvites > 0 && (
                    <ListToolbarPortal>
                      <ListToolbar
                        searchValue={inviteStatusFilters.search}
                        /* 300ms in the toolbar, which is the debounce the
                           filter bar applied to the same box. */
                        onSearchChange={(value) => {
                          setInviteStatusFilters({ ...inviteStatusFilters, search: value });
                          setInviteStatusPage(1);
                        }}
                        searchPlaceholder="Search by candidate, email, CID, job or assessment..."
                        onToggleFilters={() => setShowInviteStatusFilters(!showInviteStatusFilters)}
                        filtersOpen={showInviteStatusFilters}
                        activeFilterCount={inviteStatusFilterCount}
                        filtersApplied={inviteStatusFilterCount > 0}
                        onClearFilters={clearInviteStatusFilters}
                        className="mb-0"
                        countBadge={
                          <ListCountBadge
                            filtered={total}
                            total={totalInvites}
                            noun="invitation"
                            selected={selectedInviteRows.length}
                          />
                        }
                      />

                      {showInviteStatusFilters && (
                        /* Commit-as-you-change, Done just closes — the Total
                           Jobs panel's contract, and the behaviour the filter
                           bar already had. */
                        <ListFilterPanel
                          footer={
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setShowInviteStatusFilters(false)}
                            >
                              Done
                            </Button>
                          }
                        >
                          <div>
                            <label htmlFor="invite-status-filter" className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                              Status
                            </label>
                            <select
                              id="invite-status-filter"
                              value={inviteStatusFilters.status}
                              onChange={(e) => {
                                setInviteStatusFilters({ ...inviteStatusFilters, status: e.target.value });
                                setInviteStatusPage(1);
                              }}
                              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-black dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40"
                            >
                              {/* One option per status tab, in tab order and
                                  on the same keys, so a pick here can never
                                  return rows the tabs cannot explain. */}
                              {INVITATION_STATUS_TAB_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label htmlFor="invite-sent-from" className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                              Invited from
                            </label>
                            <input
                              id="invite-sent-from"
                              type="date"
                              value={inviteStatusFilters.dateFrom}
                              max={inviteStatusFilters.dateTo || undefined}
                              onChange={(e) => {
                                setInviteStatusFilters({ ...inviteStatusFilters, dateFrom: e.target.value });
                                setInviteStatusPage(1);
                              }}
                              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-black dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40"
                            />
                          </div>

                          <div>
                            <label htmlFor="invite-sent-to" className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                              Invited to
                            </label>
                            <input
                              id="invite-sent-to"
                              type="date"
                              value={inviteStatusFilters.dateTo}
                              min={inviteStatusFilters.dateFrom || undefined}
                              onChange={(e) => {
                                setInviteStatusFilters({ ...inviteStatusFilters, dateTo: e.target.value });
                                setInviteStatusPage(1);
                              }}
                              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-black dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40"
                            />
                          </div>
                        </ListFilterPanel>
                      )}
                    </ListToolbarPortal>
                  )}
                  {isLoadingInviteStatus ? (
                    <>
                      {/* Summary + status filter row */}
                      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-4 sm:mb-5">
                        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] self-start">
                          {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 min-h-[36px]">
                              <Skeleton className="h-3.5 w-3.5 rounded" />
                              <Skeleton className="h-3.5 w-16" />
                              <Skeleton className="h-[18px] w-6 rounded-full" />
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center gap-2.5 sm:gap-3 lg:justify-end flex-shrink-0">
                          <Skeleton className="h-3.5 w-24" />
                          <Skeleton className="h-1.5 w-20 sm:w-28 rounded-full" />
                          <Skeleton className="h-4 w-8" />
                        </div>
                      </div>
                      {/* Invitations card */}
                      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] shadow-sm overflow-hidden">
                        <div className="px-4 sm:px-6 py-3 border-b border-gray-100 dark:border-slate-700/60 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 sm:gap-3">
                            <Skeleton className="h-5 w-24" />
                            <Skeleton className="h-6 w-16 rounded-full" />
                          </div>
                          <Skeleton className="h-8 w-24 rounded-lg" />
                        </div>
                        <div className="min-h-[320px] overflow-auto tf-table-shell">
                          <table className="w-full min-w-[1690px] table-auto">
                            <thead className="[&_th]:bg-slate-50 dark:[&_th]:bg-slate-800 [&_th]:border-b [&_th]:border-gray-200 dark:[&_th]:border-slate-700">
                              <tr>
                                <th className="px-4 py-3 w-12"><Skeleton className="h-4 w-4 rounded" /></th>
                                {['CID', 'Candidate', 'Job & Assessment', 'Invite Source', 'Status', 'Invited On', 'Timeline', 'Tech Score', 'Coding Score', 'Action'].map((c) => (
                                  <th key={c} className="px-4 py-3"><Skeleton className="h-3 w-20" /></th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                              {Array.from({ length: 8 }).map((_, r) => (
                                <tr key={r}>
                                  <td className="px-4 py-4"><Skeleton className="h-4 w-4 rounded" /></td>
                                  <td className="px-4 py-4"><Skeleton className="h-5 w-16 rounded" /></td>
                                  <td className="px-4 py-4">
                                    <div className="flex items-center gap-3">
                                      <Skeleton className="h-9 w-9 rounded-full flex-shrink-0" />
                                      <div className="space-y-1.5">
                                        <Skeleton className="h-4 w-32" />
                                        <Skeleton className="h-3 w-40" />
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-4 py-4">
                                    <div className="space-y-1.5">
                                      <Skeleton className="h-4 w-48" />
                                      <Skeleton className="h-3 w-32" />
                                    </div>
                                  </td>
                                  <td className="px-4 py-4"><Skeleton className="h-4 w-24" /></td>
                                  <td className="px-4 py-4"><Skeleton className="h-6 w-20 rounded-full" /></td>
                                  <td className="px-4 py-4"><Skeleton className="h-4 w-24" /></td>
                                  <td className="px-4 py-4"><Skeleton className="h-4 w-40" /></td>
                                  <td className="px-4 py-4"><Skeleton className="h-6 w-12 mx-auto" /></td>
                                  <td className="px-4 py-4"><Skeleton className="h-6 w-12 mx-auto" /></td>
                                  <td className="px-4 py-4"><Skeleton className="h-8 w-8 rounded-md mx-auto" /></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  ) : inviteStatusError ? (
                    <div className="p-6 text-center">
                      <p className="text-sm text-destructive mb-3">{inviteStatusError}</p>
                      <Button variant="primary" size="md" onClick={loadAllInviteStatuses}>
                        Retry
                      </Button>
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

                              Total is every invite, in no one status, so it
                              takes a neutral slate rather than a status
                              colour. Invited is the 'sent' bucket — sent, not
                              yet opened or started — the same bucket the
                              status dropdown's Invited option and the bulk
                              Revoke gate read, in the Invited badge's blue.

                              The classes are spelled out per segment rather
                              than built from the key — `text-status-${key}`
                              would be invisible to Tailwind's scanner, which
                              only sees literal class strings. */}
                          {([
                            { key: 'all', label: 'Total', icon: Users, value: totalInvites,
                              text: 'text-slate-700 dark:text-slate-200', hover: 'hover:text-slate-900 dark:hover:text-slate-100', tint: 'bg-slate-500/10', ring: 'ring-slate-500/20' },
                            { key: 'sent', label: 'Invited', icon: Mail, value: bucketCount('sent'),
                              text: 'text-status-invited', hover: 'hover:text-status-invited', tint: 'bg-status-invited/10', ring: 'ring-status-invited/20' },
                            /* Revoked wears the Revoked badge's own red, per
                               the segment-matches-badge rule above. */
                            { key: 'revoked', label: 'Revoked', icon: Ban, value: bucketCount('revoked'),
                              text: 'text-destructive', hover: 'hover:text-destructive', tint: 'bg-destructive-subtle', ring: 'ring-destructive-line' },
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
                                <span className={`inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full text-2xs font-semibold tabular-nums ring-1 transition-colors ${segment.text} ${segment.tint} ${segment.ring}`}>
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
                          tab's. */}
                      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 overflow-hidden">
                        {/* Header — the Candidate Results card's title row, with
                            the popup's Refresh control, since invite statuses
                            move while the tab sits open.

                            The count badge that stood beside the title has
                            moved to the toolbar above the tab pills, where
                            every other tab keeps its own — two badges for one
                            list, in two different sizes, was exactly the drift
                            being straightened out. */}
                        {/* No "Invitations" title and no Refresh here any more
                            (Refresh sits beside More Filters in the toolbar).
                            What is left are the selection actions, each shown
                            only under its own filter, so the row appears only
                            when one of them does. */}
                        {(showInviteBulkResend || showInviteBulkRevoke || showInviteExport) && (
                        <div className="px-4 sm:px-6 py-3 border-b border-gray-100 dark:border-slate-700/60 flex flex-wrap items-center justify-end gap-2 sm:gap-3">
                          <div className="flex flex-wrap items-center justify-end gap-2">
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
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => setShowInviteBulkResendConfirm(true)}
                                disabled={isBulkResending}
                                title="Resend a fresh link to the selected expired invitations"
                                icon={isBulkResending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                              >
                                {isBulkResending ? 'Sending…' : `Resend (${resendableSelectedRows.length})`}
                              </Button>
                            )}
                            {/* Bulk Revoke — the Invited bucket's own action.
                                Never shown alongside Resend: the two buttons'
                                gates are on disjoint status filters. */}
                            {showInviteBulkRevoke && (
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => setShowInviteBulkRevokeConfirm(true)}
                                disabled={isBulkRevoking}
                                title="Revoke the selected invited candidates' links"
                                icon={isBulkRevoking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                              >
                                {isBulkRevoking ? 'Revoking…' : `Revoke (${revocableSelectedRows.length})`}
                              </Button>
                            )}
                            {showInviteExport && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setShowInviteExportModal(true)}
                                title="Export the selected completed invitations"
                                icon={<FileDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                              >
                                Export ({selectedInviteRows.length})
                              </Button>
                            )}
                          </div>
                        </div>
                        )}

                        {/* The `InviteFilterBar` that sat here is gone: its
                            four fields are the page toolbar above the tab
                            pills now, so this tab's search is where every
                            other tab's is instead of inside the card. Nothing
                            it filtered by changed — same state, same fields,
                            same reset. */}

                        <div className="min-h-[320px] max-h-[calc(100dvh-28rem)] overflow-auto tf-table-shell">
                          {/* 1200 -> 1400 for the two score columns. The shell
                              already scrolls sideways, so this only moves where
                              that scroll starts; leaving it at 1200 would have
                              squeezed the columns already there. */}
                          {/* With no rows the width floor and the header come
                              off — see `TABLE_EMPTY_PANEL_CLASS`. A 1550px table holding
                              one empty cell centres that cell across 1550px, so
                              the message sat off the side of the shell behind a
                              scrollbar that existed only to reach it. */}
                          <table className={`w-full table-auto ${total === 0 ? '' : 'min-w-[1690px]'}`}>
                            {total > 0 && (
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
                                {showInviteSelection && (
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
                                )}
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">CID</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Candidate</th>
                                {/* One column for all four job/assessment
                                    fields — together they identify a single
                                    thing (the job version this candidate was
                                    assessed against), so four headers spent on
                                    it widened every row without telling a
                                    recruiter anything more. Same th classes as
                                    every other column. */}
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Job ID</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Job Role</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Job Version</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Assessment Version</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Invite Source</th>
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
                            )}
                            <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                              {total === 0 ? (
                                <tr>
                                  <td colSpan={showInviteSelection ? 14 : 13} className="p-0">
                                    <div className={`${TABLE_EMPTY_PANEL_CLASS} text-sm text-gray-500 dark:text-slate-500`}>
                                      No invitations match the current filters.
                                    </div>
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
                                    {showInviteSelection && (
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
                                    )}
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
                                        {/* Invited / Expired name the email on the
                                            name's own line ("Name — email"), so it
                                            is not repeated on a second one; every
                                            other tab keeps the two-line stack. */}
                                        {(inviteStatusFilters.status === 'sent' || inviteStatusFilters.status === 'expired') ? (
                                          <p
                                            className="min-w-0 max-w-[360px] text-sm truncate"
                                            title={[inv.candidate_name, inv.candidate_email].filter(Boolean).join(' — ')}
                                          >
                                            <span className="font-medium text-gray-900 dark:text-slate-50">{inv.candidate_name || '-'}</span>
                                            {inv.candidate_email && (
                                              <span className="text-xs text-gray-500 dark:text-slate-500"> — {inv.candidate_email}</span>
                                            )}
                                          </p>
                                        ) : (
                                          <div className="min-w-0 max-w-[240px]">
                                            <p className="font-medium text-gray-900 dark:text-slate-50 text-sm truncate" title={inv.candidate_name}>{inv.candidate_name || '-'}</p>
                                            <p className="text-xs text-gray-500 dark:text-slate-500 truncate" title={inv.candidate_email}>{inv.candidate_email}</p>
                                          </div>
                                        )}
                                      </div>
                                    </td>
                                    {/* Job ID / Job Role / Job Version /
                                        Assessment Version — four columns, each
                                        drawn exactly as the All Assessments
                                        table draws it: the JobIdBadge, the job
                                        name alone (truncated, full name on
                                        hover), and that table's own blue / cyan
                                        VersionPill. A missing value is a dash,
                                        not an invented v1. */}
                                    <td className="px-4 py-4 align-middle whitespace-nowrap">
                                      {inv._jd_short_id ? (
                                        <JobIdBadge>{inv._jd_short_id}</JobIdBadge>
                                      ) : (
                                        <span className="text-xs text-gray-400">—</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-4 align-middle">
                                      {/* The cap sits on the span: a table cell's own
                                          max-width is ignored, so on the td it let a
                                          long title widen the column uncut. */}
                                      <span
                                        className="block max-w-[16rem] truncate text-sm font-medium text-gray-900 dark:text-slate-50"
                                        title={inv._jd_title}
                                      >
                                        {inv._jd_title || '—'}
                                      </span>
                                    </td>
                                    <td className="px-4 py-4 align-middle">
                                      {inv._jd_version ? (
                                        <VersionPill kind="job" version={inv._jd_version} />
                                      ) : (
                                        <span className="text-xs text-gray-400">—</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-4 align-middle">
                                      {inv._assessment_version ? (
                                        <VersionPill kind="assessment" version={inv._assessment_version} />
                                      ) : (
                                        <span className="text-xs text-gray-400">—</span>
                                      )}
                                    </td>
                                    {/* The Timeline's latest status, on every
                                        tab — the same value that decided
                                        which tab this row is under. */}
                                    {/* Invite Source — how this candidate was actually
                                        invited, from the invitation's own resume_id. */}
                                    <td className="px-4 py-4 align-middle text-sm text-gray-700 dark:text-slate-300 whitespace-nowrap">
                                      <InviteSourceValue inv={assessmentInviteSource(inv)} iconClassName="w-3.5 h-3.5" />
                                    </td>
                                    <td className="px-4 py-4 align-middle">
                                      {renderInviteBadgeForStatus(statusOf(inv), inv)}
                                    </td>
                                    <td className="px-4 py-4 align-middle whitespace-nowrap">
                                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400">
                                        <Calendar className="w-4 h-4" />
                                        {inv.sent_at || inv.created_at ? formatISTDate(inv.sent_at || inv.created_at) : '-'}
                                      </div>
                                    </td>
                                    {/* Every audit-logged event on its own line, oldest
                                        first (timelineEvents/buildFullTimeline in
                                        AssessmentInviteActions) — not just the latest
                                        per milestone type, so a revoke followed by an
                                        edited resend shows both, not just the resend. */}
                                    <td className="px-4 py-4 align-middle text-xs text-gray-500 dark:text-slate-500">
                                      <div className="space-y-1">
                                        {timelineEvents(inv).length === 0 ? (
                                          <div className="flex items-center gap-2 whitespace-nowrap">
                                            <Clock className="w-3 h-3 text-gray-400 flex-shrink-0" />
                                            <span>Created: {formatIST(inv.created_at)}</span>
                                          </div>
                                        ) : (
                                          timelineEvents(inv).map(({ label, at, Icon, tone }, i) => (
                                            <div key={`${label}-${i}`} className="flex items-center gap-2 whitespace-nowrap">
                                              <Icon className={`w-3 h-3 flex-shrink-0 ${tone}`} />
                                              <span className={tone}>{label}: {formatIST(at)}</span>
                                            </div>
                                          ))
                                        )}
                                      </div>
                                      {hasMoreTimelineHistory(inv) && (
                                        <ViewFullHistoryLink onClick={() => setHistoryInviteTarget(inv)} />
                                      )}
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
                                        // Edit Email/Change Email (the pre-existing
                                        // failed/bounced "fix the address" flow)
                                        // isn't wired on this tab — it never had
                                        // that inline editor UI, only Resend. The
                                        // new Edit (revoked)/Revoke/Copy Link are
                                        // added here alongside it.
                                        const actions = buildInvitationRowActions(inv, {
                                          onResend: (target) => setResendTargetInvitation(target),
                                          resendingId: isResending ? resendTargetInvitation?.id : null,
                                          onEdit: (target) => setEditInviteTarget(target),
                                          onRevoke: (target) => setRevokeInviteTarget(target),
                                          revokingId: revokeInviteTarget?.id,
                                        });
                                        const extraItems = (
                                          <>
                                            {hasResult && (
                                              <DropdownMenuItem
                                                className={assessmentDropdownMenuItemClass}
                                                onSelect={() => openInviteResult(inv)}
                                              >
                                                <Eye className="w-3.5 h-3.5 text-menu-icon-view" />
                                                <span className={MENU_ITEM_SCALE_CLASS}>View Result</span>
                                              </DropdownMenuItem>
                                            )}
                                            {/* Disabled rather than hidden while
                                                scoring runs: the action exists for
                                                this row, it is just not ready yet,
                                                and hiding it would read as "this
                                                row has no report". */}
                                            {hasResult && (
                                              <DropdownMenuItem
                                                className={`${assessmentDropdownMenuItemClass} ${!canDownloadInviteReport ? 'opacity-50' : ''}`}
                                                disabled={!scored || downloadingInviteReportId === inv.id}
                                                title={!canDownloadInviteReport ? 'You do not have permission to download assessment reports' : undefined}
                                                onSelect={() => {
                                                  if (!canDownloadInviteReport) {
                                                    toast.error('You do not have permission to download assessment reports');
                                                    return;
                                                  }
                                                  downloadInviteReport(inv);
                                                }}
                                              >
                                                {downloadingInviteReportId === inv.id
                                                  ? <Loader2 className="w-3.5 h-3.5 text-menu-icon-download animate-spin" />
                                                  : <Download className="w-3.5 h-3.5 text-menu-icon-download" />}
                                                <span className={MENU_ITEM_SCALE_CLASS}>
                                                  {downloadingInviteReportId === inv.id ? 'Preparing…' : 'Download Report'}
                                                </span>
                                              </DropdownMenuItem>
                                            )}
                                          </>
                                        );
                                        return <InvitationActionsMenu actions={actions} extraItems={extraItems} className="w-48" />;
                                      })()}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Total Jobs' pagination, as that tab renders it. */}
                      <ListPagination
                        currentPage={safePage}
                        itemsPerPage={inviteStatusPageSize}
                        totalItems={total}
                        onPageChange={setInviteStatusPage}
                        onItemsPerPageChange={(size) => { setInviteStatusPageSize(size); setInviteStatusPage(1); }}
                        itemLabel="invitations"
                      />

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
                        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-6">
                          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 w-full max-w-[95vw] sm:max-w-md max-h-[calc(100dvh-1.5rem)] flex flex-col">
                            <div className="flex items-start justify-between gap-3 p-4 sm:p-5 border-b border-gray-200 dark:border-slate-700 shrink-0">
                              <div className="flex items-start gap-3 min-w-0">
                                <div className="w-11 h-11 rounded-full bg-blue-50 dark:bg-blue-500/15 flex items-center justify-center flex-shrink-0">
                                  <FileDown className="w-5 h-5 text-blue-600 dark:text-blue-300" />
                                </div>
                                <div>
                                  <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-slate-50">Export Completed Invitations</h3>
                                  <p className="text-sm text-gray-500 dark:text-slate-500 mt-1 flex items-center gap-1.5">
                                    {selectedInviteRows.length} selected record{selectedInviteRows.length === 1 ? '' : 's'}
                                    <span className="w-1 h-1 rounded-full bg-blue-500" />
                                    {INVITE_EXPORT_COLUMNS.length} columns
                                  </p>
                                </div>
                              </div>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setShowInviteExportModal(false)}
                                className="px-2 flex-shrink-0"
                                aria-label="Close"
                              >
                                <X className="w-5 h-5" />
                              </Button>
                            </div>

                            <div className="p-4 sm:p-5 overflow-y-auto flex-1 min-h-0">
                              <p className="text-sm font-bold text-gray-900 dark:text-slate-50 mb-3">Choose export format</p>

                              <div className="space-y-3">
                                <button
                                  onClick={() => setInviteExportFormat('csv')}
                                  className={`w-full flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl border-2 transition-all text-left ${
                                    inviteExportFormat === 'csv'
                                      ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-500/10'
                                      : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800'
                                  }`}
                                >
                                  <div className="w-12 h-12 bg-success-subtle rounded-lg flex items-center justify-center flex-shrink-0">
                                    <FileText className="w-6 h-6 text-success" />
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
                                  className={`w-full flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl border-2 transition-all text-left ${
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

                            <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3 p-4 sm:p-5 border-t border-gray-200 dark:border-slate-700 shrink-0">
                              <Button
                                variant="primary"
                                size="md"
                                onClick={() => (inviteExportFormat === 'csv'
                                  ? exportInvitesToCSV(selectedInviteRows)
                                  : exportInvitesToXLS(selectedInviteRows))}
                                icon={<Download className="w-4 h-4" />}
                              >
                                Export
                              </Button>
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
                      <>
                        {/* Topic Availability banner */}
                        <div className="bg-white border border-gray-100 rounded-xl p-3 sm:p-4">
                          <div className="flex items-center gap-2 sm:gap-3">
                            <Skeleton className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg" />
                            <div className="space-y-2">
                              <Skeleton className="h-4 w-32" />
                              <Skeleton className="h-3 w-40" />
                            </div>
                          </div>
                        </div>
                        {/* Section cards: HR, Technical, Coding */}
                        {Array.from({ length: 3 }).map((_, i) => (
                          <div key={i} className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] shadow-sm rounded-xl p-3 sm:p-5">
                            <div className="flex items-center justify-between gap-2 mb-1.5 sm:mb-2">
                              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                                <Skeleton className="w-7 h-7 sm:w-10 sm:h-10 rounded-xl flex-shrink-0" />
                                <div className="flex items-center gap-2">
                                  <Skeleton className="h-4 w-20" />
                                  <Skeleton className="h-5 w-10 rounded" />
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <Skeleton className="h-3.5 w-8" />
                                <Skeleton className="w-9 sm:w-14 h-5 sm:h-7 rounded-full" />
                              </div>
                            </div>
                            <Skeleton className="h-4 w-2/3 ml-9 sm:ml-[52px]" />
                          </div>
                        ))}
                      </>
                    ) : (
                      <>
                        {/* Error Message */}
                        {topicsError && (
                          <div className="flex items-center gap-2 p-3 bg-destructive-subtle border border-destructive-line rounded-lg">
                            <AlertTriangle className="w-4 h-4 text-destructive" />
                            <p className="text-sm text-destructive">{topicsError}</p>
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
                                <p className="text-2xs sm:text-xs text-white/80">
                                  Control which topics are available
                                </p>
                              </div>
                            </div>
                            {isSavingTopics && (
                              <span className="text-2xs sm:text-xs text-white/80 flex items-center gap-1">
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
                                <h4 className="text-2xs sm:text-sm font-medium text-gray-900 dark:text-slate-50">HR</h4>
                                <span className={`px-1.5 sm:px-2 py-0.5 rounded text-2xs sm:text-xs font-medium ${
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
                              <span className="text-2xs sm:text-xs text-gray-500 dark:text-slate-500 font-medium">
                                {topicSettings.hr_enabled ? 'ON' : 'OFF'}
                              </span>
                              <button
                                onClick={() => {
                                  if (!canUpdateAssessment) {
                                    toast.error('You do not have permission to edit assessment settings');
                                    return;
                                  }
                                  updateTopicSettings({ hr_enabled: !topicSettings.hr_enabled });
                                }}
                                disabled={isSavingTopics || !canUpdateAssessment}
                                title={!canUpdateAssessment ? 'You do not have permission to edit assessment settings' : ''}
                                className={`relative w-9 sm:w-14 h-5 sm:h-7 rounded-full transition-colors ${
                                  topicSettings.hr_enabled
                                    ? 'bg-brand-blue shadow-sm shadow-brand-blue/25'
                                    : 'bg-gray-300'
                                } ${(isSavingTopics || !canUpdateAssessment) ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                <div className={`absolute top-0.5 sm:top-1 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-white shadow-md transition-transform ${
                                  topicSettings.hr_enabled
                                    ? 'translate-x-4 sm:translate-x-8'
                                    : 'translate-x-0.5 sm:translate-x-1'
                                }`} />
                              </button>
                            </div>
                          </div>
                          <p className="text-2xs sm:text-sm text-gray-600 dark:text-slate-400 pl-9 sm:pl-[52px]">
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
                                <h4 className="text-2xs sm:text-sm font-medium text-gray-900 dark:text-slate-50">Technical</h4>
                                <span className={`px-1.5 sm:px-2 py-0.5 rounded text-2xs sm:text-xs font-medium ${
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
                              <span className="text-2xs sm:text-xs text-gray-500 dark:text-slate-500 font-medium">
                                {topicSettings.technical_enabled ? 'ON' : 'OFF'}
                              </span>
                              <button
                                onClick={() => {
                                  if (!canUpdateAssessment) {
                                    toast.error('You do not have permission to edit assessment settings');
                                    return;
                                  }
                                  updateTopicSettings({ technical_enabled: !topicSettings.technical_enabled });
                                }}
                                disabled={isSavingTopics || !canUpdateAssessment}
                                title={!canUpdateAssessment ? 'You do not have permission to edit assessment settings' : ''}
                                className={`relative w-9 sm:w-14 h-5 sm:h-7 rounded-full transition-colors ${
                                  topicSettings.technical_enabled
                                    ? 'bg-brand-blue shadow-sm shadow-brand-blue/25'
                                    : 'bg-gray-300'
                                } ${(isSavingTopics || !canUpdateAssessment) ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                <div className={`absolute top-0.5 sm:top-1 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-white shadow-md transition-transform ${
                                  topicSettings.technical_enabled
                                    ? 'translate-x-4 sm:translate-x-8'
                                    : 'translate-x-0.5 sm:translate-x-1'
                                }`} />
                              </button>
                            </div>
                          </div>
                          <p className="text-2xs sm:text-sm text-gray-600 dark:text-slate-400 pl-9 sm:pl-[52px]">
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
                                <h4 className="text-2xs sm:text-sm font-medium text-gray-900 dark:text-slate-50">Coding</h4>
                                <span className={`px-1.5 sm:px-2 py-0.5 rounded text-2xs sm:text-xs font-medium ${
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
                              <span className="text-2xs sm:text-xs text-gray-500 dark:text-slate-500 font-medium">
                                {topicSettings.coding_enabled ? 'ON' : 'OFF'}
                              </span>
                              <button
                                onClick={() => {
                                  if (!canUpdateAssessment) {
                                    toast.error('You do not have permission to edit assessment settings');
                                    return;
                                  }
                                  updateTopicSettings({ coding_enabled: !topicSettings.coding_enabled });
                                }}
                                disabled={isSavingTopics || !canUpdateAssessment}
                                title={!canUpdateAssessment ? 'You do not have permission to edit assessment settings' : ''}
                                className={`relative w-9 sm:w-14 h-5 sm:h-7 rounded-full transition-colors ${
                                  topicSettings.coding_enabled
                                    ? 'bg-brand-blue shadow-sm shadow-brand-blue/25'
                                    : 'bg-gray-300'
                                } ${(isSavingTopics || !canUpdateAssessment) ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                <div className={`absolute top-0.5 sm:top-1 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-white shadow-md transition-transform ${
                                  topicSettings.coding_enabled
                                    ? 'translate-x-4 sm:translate-x-8'
                                    : 'translate-x-0.5 sm:translate-x-1'
                                }`} />
                              </button>
                            </div>
                          </div>
                          <p className="text-2xs sm:text-sm text-gray-600 dark:text-slate-400 pl-9 sm:pl-[52px]">
                            Algorithms, data structures, frameworks, and patterns.
                          </p>
                        </div>

                        {/* Important Notice */}
                        <div className="flex items-start gap-2 p-3 sm:p-4 bg-warning-subtle rounded-lg border border-warning-line">
                          <Info className="w-4 h-4 sm:w-5 sm:h-5 text-warning flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs sm:text-sm text-warning-strong">
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
                  <>
                    {/* Settings header banner */}
                    <div className="bg-white border border-gray-100 rounded-xl p-3 sm:p-4">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <Skeleton className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg" />
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-36" />
                          <Skeleton className="h-3 w-40" />
                        </div>
                      </div>
                    </div>
                    {/* Main proctoring toggle card */}
                    <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] shadow-sm rounded-xl p-3 sm:p-5">
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                            <Skeleton className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex-shrink-0" />
                            <div className="flex items-center gap-2">
                              <Skeleton className="h-4 w-32" />
                              <Skeleton className="h-5 w-16 rounded" />
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <Skeleton className="h-3.5 w-8" />
                            <Skeleton className="w-10 sm:w-14 h-5 sm:h-7 rounded-full" />
                          </div>
                        </div>
                        <Skeleton className="h-4 w-3/4" />
                      </div>
                    </div>
                    {/* Security Features grid */}
                    <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] shadow-sm rounded-xl p-3 sm:p-6">
                      <Skeleton className="h-4 w-32 mb-3 sm:mb-4" />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-4">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <div key={i} className="flex items-center justify-between gap-2 p-3 rounded-lg border border-gray-100 dark:border-slate-700/60">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Skeleton className="w-8 h-8 rounded-lg flex-shrink-0" />
                              <div className="space-y-1.5 min-w-0">
                                <Skeleton className="h-3.5 w-28" />
                                <Skeleton className="h-3 w-40" />
                              </div>
                            </div>
                            <Skeleton className="w-10 h-5 rounded-full flex-shrink-0" />
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : proctoringError && !proctoringSettings ? (
                  <div className="flex flex-col items-center justify-center py-8 sm:py-12">
                    <AlertTriangle className="w-10 h-10 sm:w-12 sm:h-12 text-destructive mb-3 sm:mb-4" />
                    <p className="text-sm text-destructive mb-3 sm:mb-4 text-center">{proctoringError}</p>
                    <Button variant="primary" size="md" onClick={loadProctoringData} icon={<RefreshCw className="w-4 h-4" />}>
                      Retry
                    </Button>
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
                            <p className="text-2xs sm:text-xs text-white/80">
                              Configure security features
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                          {isSavingProctoring && (
                            <span className="text-2xs sm:text-xs text-white/80 flex items-center gap-1">
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              <span className="hidden sm:inline">Saving...</span>
                            </span>
                          )}
                          {flaggedCount > 0 && (
                            <span className="px-2 sm:px-3 py-0.5 sm:py-1 bg-destructive text-white rounded-full text-2xs sm:text-xs font-medium whitespace-nowrap">
                              {flaggedCount} Flagged
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Error Message */}
                    {proctoringError && (
                      <div className="flex items-center gap-2 p-3 bg-destructive-subtle border border-destructive-line rounded-lg">
                        <AlertTriangle className="w-4 h-4 text-destructive" />
                        <p className="text-sm text-destructive">{proctoringError}</p>
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
                              <span className={`px-1.5 sm:px-2 py-0.5 rounded text-2xs sm:text-xs font-medium ${
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
                            <span className="text-2xs sm:text-xs text-gray-500 dark:text-slate-500 font-medium">
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
                        <p className="text-2xs sm:text-sm text-gray-600 dark:text-slate-400">
                          {proctoringSettings.proctoring_enabled
                            ? 'Advanced monitoring is active for test integrity.'
                            : 'Standard mode — no advanced monitoring. Enable for high-stakes assessments.'
                          }
                        </p>
                        {/* Privacy Notice */}
                        {proctoringSettings.proctoring_enabled && (
                          <div className="flex items-start gap-1.5 sm:gap-2 p-2 sm:p-3 bg-brand-blue/5 rounded-lg ring-1 ring-brand-blue/15">
                            <Info className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-blue flex-shrink-0 mt-0.5" />
                            <p className="text-2xs sm:text-xs text-gray-700 dark:text-slate-300">
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
                                  <div className="text-2xs sm:text-sm font-medium text-gray-900 dark:text-slate-50 leading-tight">{feature.name}</div>
                                  <div className="text-2xs sm:text-xs text-gray-500 dark:text-slate-500 line-clamp-1 sm:line-clamp-2 hidden sm:block">{feature.description}</div>
                                </div>
                              </div>
                              <button
                                onClick={() => updateProctoringSettings({ [feature.key]: !isEnabled })}
                                disabled={isSavingProctoring || !proctoringSettings.proctoring_enabled}
                                className={`relative w-9 sm:w-11 h-5 sm:h-6 rounded-full transition-colors flex-shrink-0 ${
                                  isEnabled && proctoringSettings.proctoring_enabled
                                    ? 'bg-success'
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
                      <div className="flex items-start justify-between gap-3 p-3 sm:p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
                            <Mail className="w-4 h-4 text-brand-blue" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-900 dark:text-slate-50">Email Masking in PDF</div>
                            <div className="text-xs text-gray-500 dark:text-slate-500 [overflow-wrap:anywhere]">
                              When enabled, candidate emails are masked (e.g. j******e@example.com) in downloaded Assessment PDFs.
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-center gap-1 shrink-0">
                          <button
                            onClick={() => updateProctoringSettings({ email_masking_enabled: !proctoringSettings.email_masking_enabled })}
                            disabled={isSavingProctoring}
                            className={`relative w-14 h-7 rounded-full transition-colors ${
                              proctoringSettings.email_masking_enabled ? 'bg-success' : 'bg-gray-300'
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
                          <label className="block text-2xs sm:text-xs text-gray-600 dark:text-slate-400 mb-1.5 sm:mb-2">Max Violations Before Flag</label>
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
                          <label className="block text-2xs sm:text-xs text-gray-600 dark:text-slate-400 mb-1.5 sm:mb-2">Recording Retention (Days)</label>
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
                        <span className="text-2xs sm:text-xs text-gray-500 dark:text-slate-500">{proctoringEventsTotal} total</span>
                      </div>
                      {isLoadingProctoringEvents ? (
                        <div className="space-y-2 sm:space-y-3">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="flex items-center justify-between gap-2 p-2.5 sm:p-3 bg-gray-50 dark:bg-slate-800/50 rounded-lg">
                              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                                <Skeleton className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex-shrink-0" />
                                <div className="space-y-1.5 min-w-0">
                                  <Skeleton className="h-3.5 w-32" />
                                  <Skeleton className="h-3 w-40" />
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                                <Skeleton className="h-5 w-14 rounded" />
                                <Skeleton className="w-4 h-4 rounded-full" />
                              </div>
                            </div>
                          ))}
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
                                  event.severity === 'high' ? 'bg-destructive-subtle' :
                                  event.severity === 'medium' ? 'bg-warning-subtle' : 'bg-gray-100'
                                }`}>
                                  <AlertTriangle className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${
                                    event.severity === 'high' ? 'text-destructive' :
                                    event.severity === 'medium' ? 'text-warning' : 'text-gray-400'
                                  }`} />
                                </div>
                                <div className="min-w-0">
                                  <div className="text-xs sm:text-sm font-medium text-gray-900 dark:text-slate-50 capitalize truncate">
                                    {event.event_type.replace(/_/g, ' ')}
                                  </div>
                                  <div className="text-2xs sm:text-xs text-gray-500 dark:text-slate-500 truncate">
                                    {event.candidate_name || 'Unknown'} • {event.assessment_title || 'Assessment'}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                                <span className={`px-1.5 sm:px-2 py-0.5 rounded text-2xs sm:text-xs font-medium ${
                                  event.severity === 'high' ? 'bg-destructive-subtle text-destructive' :
                                  event.severity === 'medium' ? 'bg-warning-subtle text-warning' : 'bg-gray-100 text-gray-600'
                                }`}>
                                  {event.severity}
                                </span>
                                {event.reviewed ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-success" />
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
              /* Loading State — mirrors the job-list rows (renderJobListRow) */
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="relative p-3 sm:p-4 bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] shadow-sm">
                    <div className="flex flex-col gap-3 @4xl/job-row:flex-row @4xl/job-row:items-center @4xl/job-row:gap-4 lg:flex-row lg:items-center lg:gap-4">
                      {/* Identity */}
                      <div className="flex items-center gap-2.5 min-w-0 lg:w-[360px] lg:flex-shrink-0">
                        <Skeleton className="h-9 w-9 rounded-lg flex-shrink-0" />
                        <Skeleton className="h-6 w-16 rounded-md flex-shrink-0" />
                        <Skeleton className="h-4 w-40" />
                      </div>
                      {/* Status pill */}
                      <Skeleton className="h-6 w-20 rounded-full flex-shrink-0" />
                      {/* Metrics grid */}
                      <div className="grid grid-cols-2 gap-x-2 gap-y-3 sm:grid-cols-4 lg:flex-1">
                        {Array.from({ length: 4 }).map((_, m) => (
                          <div key={m} className="min-w-0 space-y-1.5 sm:px-3">
                            <div className="flex items-center gap-1.5">
                              <Skeleton className="w-4 h-4 rounded flex-shrink-0" />
                              <Skeleton className="h-4 w-8" />
                            </div>
                            <Skeleton className="h-3 w-16" />
                          </div>
                        ))}
                      </div>
                      {/* Actions */}
                      <div className="flex flex-wrap items-center gap-2 flex-shrink-0 self-start lg:self-auto lg:ml-auto">
                        <Skeleton className="h-8 w-28 rounded-lg" />
                        <Skeleton className="h-8 w-20 rounded-lg" />
                      </div>
                    </div>
                  </div>
                ))}
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
                  /* Always FileText now. The Archive glyph was for the
                     Archived tab, which no longer reaches this list — it draws
                     `AllAssessmentsTable`, with that table's own empty state,
                     the same as Draft. TypeScript says as much: `activeTab` is
                     narrowed to 'jobs' here, so the other branch could not be
                     taken. */
                  icon={FileText}
                  isNarrowed={assessmentListNarrowed}
                  query={assessmentSearchQuery}
                  entityLabel="assessment"
                  emptyTitle={copy.title}
                  emptyDescription={copy.description}
                  onReset={clearAssessmentFilters}
                  action={copy.canCreate ? (
                    /* The page's own Create action, permission handling and
                       all, in the shared empty-state button class. */
                    <Button
                      variant="primary"
                      size="md"
                      onClick={() => {
                        if (!canCreateAssessment) {
                          toast.error('You do not have permission to create assessments');
                          return;
                        }
                        handleOpenCreation();
                      }}
                      aria-disabled={!canCreateAssessment}
                      className={!canCreateAssessment ? 'opacity-50 cursor-not-allowed' : ''}
                      title={!canCreateAssessment ? 'You do not have permission to create assessments' : ''}
                      icon={<Sparkles className="w-4 h-4" />}
                    >
                      Create Assessment
                    </Button>
                  ) : undefined}
                />
              );
            })()
            : (
              /* List View */
              <div className="space-y-3">
                {/* Renders nothing — it counts each visible job's completed
                    candidates from their own records and hands the numbers
                    back, so the rows' Completed metric reads the whole JD
                    hierarchy rather than the assessment rows' own counters.
                    Mounted here because this list is where that metric is
                    drawn; `key` remounts it when the page wants a recount. */}
                <JobCompletedCandidateCounts
                  key={completedCandidatesGeneration}
                  ids={jobCompletedCountsToFetch}
                  onCounted={setCompletedCandidatesByAssessment}
                />
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
        </ListToolbarSlotProvider>
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
          {/* Shell, header and footer are the AI Interviews page's Send Invite
              picker's, class for class, and the body below is its layout -
              search, Ungrouped/Grouped, the selection line, the single-pick
              note, the list, the pager - so the two pages' Send Invite read
              as one dialog. */}
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
                    <p className="text-xs text-gray-500 dark:text-slate-500 mt-0.5">Pick the active assessment to send</p>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={closeInvitePicker}
                  className="px-2 flex-shrink-0"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>

              {/* Content */}
              <div ref={invitePickerScrollRef} className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
                {/* Search first, then the list — the reference's order and its
                    labelled, icon-led field, rather than a bare input. */}
                <div className="mb-4">
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Search Jobs</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" />
                    <input
                      type="text"
                      autoFocus
                      value={invitePickerQuery}
                      onChange={(e) => { setInvitePickerQuery(e.target.value); setInvitePickerPage(1); }}
                      placeholder="Search by job title, Job ID, assessment name or assessment ID..."
                      className="w-full pl-10 pr-4 py-2 text-sm text-black dark:text-slate-100 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                    />
                  </div>
                </div>

                {/* Grouped/Ungrouped — the AI Interviews picker's toggle.
                    Ungrouped: one row per sendable assessment. Grouped: one
                    card per job, versions behind View Versions. Switching
                    drops the pick, as it does there. */}
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <span className="text-sm text-gray-600 dark:text-slate-400">View:</span>
                  <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
                    {([
                      { key: 'ungrouped', label: 'Ungrouped' },
                      { key: 'grouped', label: 'Grouped' },
                    ] as const).map((mode) => {
                      const isActive = invitePickerViewMode === mode.key;
                      return (
                        <button
                          key={mode.key}
                          type="button"
                          aria-pressed={isActive}
                          onClick={() => { setInvitePickerViewMode(mode.key); setInvitePickerSelection(null); setInvitePickerPage(1); }}
                          className={`px-2.5 sm:px-3 py-1.5 min-h-[32px] rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                            isActive
                              ? 'bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/10 ring-1 ring-brand-blue/20 text-brand-blue'
                              : 'text-gray-600 dark:text-slate-400 hover:text-brand-blue'
                          }`}
                        >
                          {mode.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {(() => {
                  const query = invitePickerQuery.trim().toLowerCase();
                  const matchesQuery = (assessment: (typeof assessments)[number]) =>
                    !query ||
                    `${assessment.title || ''} ${assessment.short_id || ''} ${assessment.job?.title || ''} ${assessment.jd_short_id || ''}`
                      .toLowerCase()
                      .includes(query);

                  /* Ungrouped: every assessment that can take an invite —
                     `shareableAssessments`, the per-row Share button's rules —
                     newest first, as the AI Interviews picker lists its
                     active interviews. */
                  const pickerRows = shareableAssessments
                    .filter(matchesQuery)
                    .slice()
                    .sort((x, y) => new Date(y.created_at || 0).getTime() - new Date(x.created_at || 0).getTime());

                  /* Grouped: narrowed BEFORE the collapse, so a job stays on
                     screen when the version that matched is not the one
                     representing it, over `assessments` — the whole loaded
                     set the Total Jobs list collapses too — so this list and
                     that one hold the same jobs and report the same count.
                     One row per job from `collapseByLineage`, the function the
                     Job List builds its rows with. */
                  const jobRows = collapseByLineage(assessments.filter(matchesQuery));
                  const jobCount = collapseByLineage(assessments).length;
                  /* Which jobs actually have something sendable. A job with
                     only Drafts is listed and disabled rather than omitted. */
                  const invitableJobKeys = new Set(
                    shareableAssessments.map((a) => lineageKeyOf(a)),
                  );
                  /* Per-job figures over the very set these rows are built
                     from — not `jobRowTotals`, which moves with the page's
                     active tab. */
                  const pickerJobTotals = buildJobRowTotals(assessments);

                  const isUngrouped = invitePickerViewMode === 'ungrouped';
                  const pickerTotal = isUngrouped ? pickerRows.length : jobRows.length;
                  const pickerTotalPages = Math.max(1, Math.ceil(pickerTotal / invitePickerPageSize));
                  const pickerSafePage = Math.min(Math.max(1, invitePickerPage), pickerTotalPages);
                  const pageSlice = <T,>(list: T[]) =>
                    list.slice((pickerSafePage - 1) * invitePickerPageSize, pickerSafePage * invitePickerPageSize);
                  const pagedPickerRows = pageSlice(pickerRows);
                  const pagedJobRows = pageSlice(jobRows);
                  const selection = invitePickerSelection;
                  const PICKER_TH = 'px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 whitespace-nowrap bg-slate-50 dark:bg-slate-800';

                  return (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <label className="min-w-0 text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-300">
                          Select an Assessment
                          <span className="ml-2 font-normal text-gray-500 dark:text-slate-400">
                            {isUngrouped
                              ? `${pickerRows.length} active assessment${pickerRows.length !== 1 ? 's' : ''}`
                              : `${jobCount} job${jobCount !== 1 ? 's' : ''}`}
                          </span>
                        </label>
                        {selection && (
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20">
                              <CheckCircle className="w-3 h-3" />
                              1 selected
                            </span>
                            <button
                              onClick={() => setInvitePickerSelection(null)}
                              className="text-xs text-brand-blue hover:text-brand-blue-2 font-medium"
                            >
                              Clear Selection
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Why the pick is single — the AI Interviews picker's note. */}
                      <div className="mb-3 flex items-start gap-2 rounded-lg bg-brand-blue/[0.06] border border-brand-blue/20 px-3 py-2.5">
                        <Info className="w-4 h-4 text-brand-blue flex-shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-gray-900 dark:text-slate-100">One assessment per invite</p>
                          <p className="mt-0.5 text-xs text-gray-700 dark:text-slate-300">
                            You can pick only one assessment at a time, so everyone you invite gets the same assessment. To invite people to a different assessment, send another invite.
                          </p>
                        </div>
                      </div>

                      {isUngrouped ? (
                        pickerRows.length === 0 ? (
                          <div className="text-center py-8 text-gray-500 dark:text-slate-400">
                            <Briefcase className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-slate-700" />
                            <p>{query ? 'No active assessments match your search' : 'No active assessments'}</p>
                            <p className="text-sm">{query ? 'Try a different job title or Job ID.' : 'Publish an assessment to invite candidates to it.'}</p>
                          </div>
                        ) : (
                          <div className="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
                            <div className="overflow-x-auto scrollbar-visible">
                              <table className="w-full text-sm border-collapse">
                                <thead className="sticky top-0 z-[6]">
                                  <tr className="border-b border-gray-200 dark:border-slate-700">
                                    <th className={`${PICKER_TH} w-14 tf-sticky-col-left !bg-slate-50 dark:!bg-slate-800`}>Select</th>
                                    <th className={PICKER_TH}>Job ID</th>
                                    <th className={PICKER_TH}>Job Name</th>
                                    <th className={PICKER_TH}>Job Version</th>
                                    <th className={PICKER_TH}>Assessment Version</th>
                                    <th className={PICKER_TH}>Status</th>
                                    <th className={PICKER_TH}>Invitations Sent</th>
                                    <th className={PICKER_TH}>Created On</th>
                                    <th className={`${PICKER_TH} pr-6`}>Created By</th>
                                    <th className={`${PICKER_TH} !text-center tf-sticky-col !bg-slate-50 dark:!bg-slate-800`}>Preview</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {pagedPickerRows.map((assessment) => {
                                    const isSelected = selection?.assessmentId === assessment.id;
                                    const jobTitle = assessment.job?.title || stripVersionFromTitle(assessment.title);
                                    const jobVersion = jobVersionOfAssessment(assessment, jobVersionByJdIdRef.current) ?? 1;
                                    /* The same fields a pick in a Grouped card's
                                       version panel records, so Continue hands the
                                       Share modal the same thing from either view. */
                                    const pick = () => setInvitePickerSelection(
                                      isSelected
                                        ? null
                                        : {
                                            jobKey: lineageKeyOf(assessment),
                                            jdId: assessment.jd_id,
                                            jdShortId: assessment.jd_short_id,
                                            jobTitle,
                                            jobVersion,
                                            jobVersionId: assessment.jd_id,
                                            assessmentId: assessment.id,
                                          },
                                    );
                                    return (
                                      <tr
                                        key={assessment.id}
                                        onClick={pick}
                                        aria-selected={isSelected}
                                        data-row-selected={isSelected ? 'true' : undefined}
                                        className={`border-b border-gray-100 dark:border-slate-700/60 last:border-b-0 cursor-pointer transition-colors ${
                                          isSelected ? 'bg-brand-blue/[0.06] dark:bg-brand-blue/15' : 'hover:bg-brand-blue/5 dark:hover:bg-brand-blue/10'
                                        }`}
                                      >
                                        <td className="px-3 py-2.5 align-middle tf-sticky-col-left">
                                          <input
                                            type="radio"
                                            name="assessment-invite-picker-selection"
                                            checked={isSelected}
                                            onChange={pick}
                                            onClick={(e) => e.stopPropagation()}
                                            aria-label={`Select ${jobTitle || assessment.title || 'assessment'}`}
                                            className="w-4 h-4 accent-brand-blue cursor-pointer"
                                          />
                                        </td>
                                        <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                                          {assessment.jd_short_id ? <JobIdBadge>{assessment.jd_short_id}</JobIdBadge> : <span className="text-xs text-gray-400">—</span>}
                                        </td>
                                        <td className="px-3 py-2.5 align-middle">
                                          <span className="block max-w-[16rem] truncate font-medium text-gray-900 dark:text-slate-50" title={jobTitle || 'Untitled'}>
                                            {jobTitle || 'Untitled'}
                                          </span>
                                        </td>
                                        <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                                          <VersionPill kind="job" version={jobVersion} />
                                        </td>
                                        <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                                          <VersionPill kind="assessment" version={assessment.version ?? 1} />
                                        </td>
                                        <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 bg-success-subtle text-success ring-success-line">
                                            <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
                                            Active
                                          </span>
                                        </td>
                                        <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                                          <span className="tabular-nums text-gray-900 dark:text-slate-100">{(assessment.invitations_count ?? 0).toLocaleString()}</span>
                                          <span className="text-xs text-gray-400 ml-1">sent</span>
                                        </td>
                                        <td className="px-3 py-2.5 align-middle whitespace-nowrap text-gray-600 dark:text-slate-400 tabular-nums">
                                          {assessment.created_at ? formatIST(assessment.created_at) : '—'}
                                        </td>
                                        <td className="px-3 pr-6 py-2.5 align-middle whitespace-nowrap text-gray-600 dark:text-slate-400">
                                          {assessment.created_by_name || 'System'}
                                        </td>
                                        <td className="px-3 py-2.5 align-middle text-center tf-sticky-col" onClick={(e) => e.stopPropagation()}>
                                          {/* The page's own assessment preview — the one a
                                              Grouped card's version panel opens. */}
                                          <button
                                            type="button"
                                            onClick={() => { setSelectedAssessmentForPreview(assessment); setShowPreviewModal(true); }}
                                            className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-gray-300 dark:border-slate-700 text-gray-600 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-brand-blue/10 hover:text-brand-blue hover:border-brand-blue/40 transition-colors"
                                            aria-label="Preview assessment"
                                            title="Preview"
                                          >
                                            <Eye className="w-3.5 h-3.5" />
                                          </button>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )
                      ) : jobRows.length === 0 ? (
                        <div className="text-center py-8 text-gray-500 dark:text-slate-400">
                          <Briefcase className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-slate-700" />
                          <p>{query ? 'No jobs match your search' : 'No jobs found'}</p>
                          <p className="text-sm">{query ? 'Try a different job title or Job ID.' : 'Create an assessment against a job first.'}</p>
                        </div>
                      ) : (
                    <div className="space-y-3">
                      {pagedJobRows.map((assessment) => {
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
                      )}

                      {pickerTotal > 0 && (
                        <ListPagination
                          currentPage={pickerSafePage}
                          itemsPerPage={invitePickerPageSize}
                          totalItems={pickerTotal}
                          onPageChange={setInvitePickerPage}
                          onItemsPerPageChange={(size) => { setInvitePickerPageSize(size); setInvitePickerPage(1); }}
                          itemLabel={isUngrouped ? 'assessments' : 'jobs'}
                          scrollContainerRef={invitePickerScrollRef}
                          compact
                          alwaysShow
                        />
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Footer */}
              <div className="shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 sm:p-6 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-200 dark:border-slate-700">
                {/* One line, always: it sits beside the buttons, and a second
                    line would push the footer taller. */}
                <div className="min-w-0 sm:truncate sm:whitespace-nowrap text-xs sm:text-sm text-gray-700 dark:text-slate-300">
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
                  <Button
                    variant="primary"
                    size="md"
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
                    icon={<Mail className="w-4 h-4" />}
                    className="flex-1 sm:flex-none whitespace-nowrap"
                  >
                    Continue
                  </Button>
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
            /* Opened from the tracking popup's Invite More: reopen that popup,
               on the same assessment and (for a job-wide Track) the same job,
               the way handleTrackInvites opens it. Its effect refetches the
               invitations, so the ones just sent are listed. */
            if (shareReturnToTracking) {
              setIsLoadingInvitations(true);
              setTrackingJob(shareReturnToTracking.job);
              setSelectedAssessmentForTracking(shareReturnToTracking.assessment);
              setTrackingFilters(EMPTY_INVITE_FILTERS);
              setTrackingCurrentPage(1);
              setShowTrackInvitesModal(true);
              setShareReturnToTracking(null);
            }
          }}
          // See the other ShareAssessmentModal above — onClose's
          // reloadAssessments() doesn't touch the Track Invites /
          // Invitation Status row data, so fire the dedicated refetch as
          // soon as the send itself completes.
          onInviteSent={refreshInviteSurfaces}
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
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4 md:p-6">
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
            <div className="px-3 sm:px-6 py-2.5 sm:py-4 border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 flex items-center justify-between gap-2 flex-shrink-0">
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
                        className="text-2xs sm:text-sm text-gray-500 dark:text-slate-500 mt-0.5 truncate"
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
                      <p className="text-2xs sm:text-sm text-gray-500 dark:text-slate-500 mt-0.5 truncate">{selectedAssessmentForTracking.title}</p>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                {/* Refetches the live statuses in place — the popup stays open,
                    the icon spins while the request runs, and the handler's
                    guard drops repeat clicks until it settles. */}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={refreshTrackingInvitations}
                  disabled={isRefreshingTracking || isLoadingInvitations}
                  title="Fetch the latest invite statuses"
                  aria-label="Refresh"
                  icon={<RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isRefreshingTracking ? 'animate-spin' : ''}`} />}
                >
                  {/* The label swaps to "Refreshing..." mid-request, and the
                      longer word used to widen the button and shove the close
                      X sideways - a small shake of its own, right where the
                      pointer still is. The span reserves the wider word's
                      width in both states, so the header never moves. */}
                  <span className="hidden sm:inline-block min-w-[5.5rem] text-left">
                    {isRefreshingTracking ? 'Refreshing...' : 'Refresh'}
                  </span>
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={closeTrackInvitesModal}
                  className="px-2"
                 aria-label="Close">
                  <X className="w-4 h-4 sm:w-5 sm:h-5" />
                </Button>
              </div>
            </div>

            {/* Stat row doubles as the status filter — same component, buckets
                and wording as the JD-level popup and the AI Interview trackers.
                Counts come from the API's unfiltered summary, so selecting a
                bucket narrows the table without collapsing the other cards. */}
            <InviteStatCards
              gridClassName="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-1 sm:gap-2 lg:gap-3"
              activeStatus={trackingFilters.status}
              onSelect={(status) => {
                setTrackingFilters({ ...trackingFilters, status });
                setTrackingCurrentPage(1);
              }}
              /* Lifecycle order: invited, then sitting it, then finished, and
                 the lapsed ones last. Expired used to sit second, directly
                 after Total Invited, which put the one terminal failure state
                 ahead of the two states a live invite actually passes through.

                 It is also the order `AssessmentDetailsView` already lays the
                 same five cards out in — same component, same keys, same tones
                 — so the per-assessment tracker and this page-level one now
                 read identically instead of differing by one position.

                 Order only. Every key, label, icon, value and tone is the one
                 it already had, so which card filters to what, and the counts
                 behind them, are untouched. */
              cards={[
                { key: 'all', label: 'Total Invited', Icon: Users, value: invitationStats.total, ...INVITE_CARD_TONES.blue },
                { key: 'sent', label: 'Invited', Icon: Mail, value: invitationStats.invited, ...INVITE_CARD_TONES.slate },
                { key: 'started', label: 'In Progress', Icon: Play, value: invitationStats.started, ...INVITE_CARD_TONES.cyan },
                { key: 'completed', label: 'Completed', Icon: CheckCircle, value: invitationStats.completed, ...INVITE_CARD_TONES.green },
                { key: 'expired', label: 'Expired', Icon: Clock, value: invitationStats.expired, ...INVITE_CARD_TONES.orange },
                { key: 'terminated', label: 'Terminated', Icon: Ban, value: invitationStats.terminated, ...INVITE_CARD_TONES.red },
                { key: 'revoked', label: 'Revoked', Icon: Ban, value: invitationStats.revoked, ...INVITE_CARD_TONES.indigo },
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
                  <span className="font-semibold">Note:</span> Results are available only for candidates with Completed and Terminated status. Other candidates&rsquo; results are not available.
                </p>
                {/* Completion rate lives here, not in the card row: the row is
                    the status FILTER and this was the one tile that filtered
                    nothing. Same placement and treatment as the AI interview
                    tracker (2026-09-30). */}
                <span className="ml-auto flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20">
                  <TrendingUp className="w-3.5 h-3.5" />
                  {invitationStats.total > 0 ? Math.round((invitationStats.completed / invitationStats.total) * 100) : 0}% Completion
                </span>
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
              <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 sm:px-6 pt-2.5 sm:pt-3 flex-shrink-0">
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
                {/* Bulk Resend/Revoke — only once the ticked selection is
                    uniformly one status-class. A mixed Invited+Expired
                    selection shows neither button (Scenario 4). */}
                {allTrackingResendable && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setShowBulkResendConfirm(true)}
                    disabled={isBulkResending}
                    icon={isBulkResending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                  >
                    {isBulkResending ? 'Sending…' : `Resend (${trackingSelectedIds.size})`}
                  </Button>
                )}
                {allTrackingRevocable && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setShowTrackingBulkRevokeConfirm(true)}
                    disabled={isBulkRevoking}
                    icon={isBulkRevoking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                  >
                    {isBulkRevoking ? 'Revoking…' : `Revoke (${trackingSelectedIds.size})`}
                  </Button>
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
                /* Nothing to show yet, so a skeleton of the invitations table
                   FILLS the body — it mirrors the table's shell and columns
                   rather than collapsing the dialog to a spinner box that then
                   jumps to table height when the rows land. */
                <div className="tf-table-shell tf-table-shell--compact tf-table-shell--fill flex-1 min-h-0 border border-gray-200 dark:border-slate-700 rounded-lg">
                  <table className="w-max min-w-full">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-slate-700">
                        <th className="w-8 py-3 pl-4 pr-0"><Skeleton className="h-4 w-4 rounded-full" /></th>
                        {['CID', 'Candidate', 'Invite Source', 'Status', 'Timeline', 'Actions'].map((c) => (
                          <th key={c} className="py-3 px-4 text-left"><Skeleton className="h-3 w-16" /></th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                      {Array.from({ length: 7 }).map((_, r) => (
                        <tr key={r}>
                          <td className="py-3 pl-4 pr-0"><Skeleton className="h-4 w-4 rounded-full" /></td>
                          <td className="py-3 px-4"><Skeleton className="h-5 w-16 rounded" /></td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <Skeleton className="h-9 w-9 rounded-full flex-shrink-0" />
                              <div className="space-y-1.5">
                                <Skeleton className="h-4 w-28" />
                                <Skeleton className="h-3 w-36" />
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4"><Skeleton className="h-4 w-24" /></td>
                          <td className="py-3 px-4"><Skeleton className="h-6 w-20 rounded-full" /></td>
                          <td className="py-3 px-4"><Skeleton className="h-4 w-40" /></td>
                          <td className="py-3 px-4"><Skeleton className="h-8 w-8 rounded-md" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Candidate</th>
                        {/* hidden md:table-cell mirrors this column's <td>. Without
                            it the header carried one more cell than the body between
                            sm and md, shifting every heading after Timeline off its
                            column. */}
                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Timeline</th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
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
                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Invite Source</th>
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
                                Only bulk-actionable rows (Invited/Expired) get a
                                checkbox; the rest keep a fixed-width slot so the
                                columns stay aligned. */}
                            <td className="py-3 pl-4 pr-0 align-top tf-sticky-col-left" onClick={(e) => e.stopPropagation()}>
                              {isBulkActionable(invitation) ? (
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
                                <td className="py-3 px-4 align-top text-xs text-gray-500 dark:text-slate-500 hidden md:table-cell">
                                  <div className="space-y-1">
                                    {/* Every audit-logged event on its own line, oldest
                                        first (timelineEvents/buildFullTimeline in
                                        AssessmentInviteActions) — not just the latest
                                        per milestone type, so a revoke followed by an
                                        edited resend shows both, not just the resend. */}
                                    {timelineEvents(invitation).length === 0 ? (
                                      <div className="flex items-center gap-2">
                                        <Clock className="w-3 h-3 text-gray-400 flex-shrink-0" />
                                        <span>Created: {formatIST(invitation.created_at)}</span>
                                      </div>
                                    ) : (
                                      timelineEvents(invitation).map(({ label, at, Icon, tone }, i) => (
                                        <div key={`${label}-${i}`} className="flex items-center gap-2">
                                          <Icon className={`w-3 h-3 flex-shrink-0 ${tone}`} />
                                          <span className={tone}>{label}: {formatIST(at)}</span>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                  {hasMoreTimelineHistory(invitation) && (
                                    <ViewFullHistoryLink onClick={() => setHistoryInviteTarget(invitation)} />
                                  )}
                                </td>
                            <td className="py-3 px-4 align-top">
                              {/* Status is the badge alone: the latest status in the
                                  row's Timeline (the bottom status line beside it),
                                  so the two cannot disagree. The failed row's
                                  "Incorrect Email" note lives only in the Edit
                                  Email flow. */}
                              {renderInviteBadgeForStatus(currentInviteStatus(invitation), invitation)}
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
                                      <span className={`${SCORE_CELL_TEXT} ${invitation.technical_score >= 70 ? 'text-brand-blue' : 'text-destructive'}`}>
                                        {formatScore(invitation.technical_score)}%
                                      </span>
                                      <span className={`text-2xs font-medium px-1.5 py-0.5 rounded ring-1 ${invitation.technical_score >= 70 ? 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20' : 'bg-destructive-subtle text-destructive ring-destructive-line'}`}>
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
                                      <span className={`${SCORE_CELL_TEXT} ${invitation.coding_score >= 70 ? 'text-brand-blue' : 'text-destructive'}`}>
                                        {formatScore(invitation.coding_score)}%
                                      </span>
                                      <span className={`text-2xs font-medium px-1.5 py-0.5 rounded ring-1 ${invitation.coding_score >= 70 ? 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20' : 'bg-destructive-subtle text-destructive ring-destructive-line'}`}>
                                        {invitation.coding_score >= 70 ? 'Pass' : 'Fail'}
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="text-gray-400">—</span>
                                  )}
                                </td>
                              );
                            })()}
                            {/* Invite Source — how this candidate was actually
                                invited, from the invitation's own resume_id. */}
                            <td className="py-3 px-4 align-top text-sm text-gray-700 dark:text-slate-300 whitespace-nowrap">
                              <InviteSourceValue inv={assessmentInviteSource(invitation)} iconClassName="w-3.5 h-3.5" />
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
                                    <Button
                                      variant="primary"
                                      size="sm"
                                      onClick={() => handleUpdateEmail(invitation)}
                                      disabled={!isValidInviteEmail(newEmailValue) || isSendingChangeEmail || newEmailValue.trim().toLowerCase() === (invitation.candidate_email || '').trim().toLowerCase()}
                                      icon={<Send className="w-3 h-3" />}
                                    >
                                      {isSendingChangeEmail ? 'Sending…' : 'Send'}
                                    </Button>
                                    <Button variant="secondary" size="sm" onClick={() => { setEditingEmailId(null); setNewEmailValue(''); }}>
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <InvitationActionsMenu
                                  actions={buildInvitationRowActions(invitation, {
                                    onResend: (target) => setResendTargetInvitation(target),
                                    resendingId: isResending ? resendTargetInvitation?.id : null,
                                    onEditEmail: (target) => { setEditingEmailId(target.id); setNewEmailValue(target.candidate_email); },
                                    onEdit: (target) => setEditInviteTarget(target),
                                    onRevoke: (target) => setRevokeInviteTarget(target),
                                    revokingId: revokeInviteTarget?.id,
                                    onViewResult: openTrackedInviteResult,
                                  })}
                                />
                              )}
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
              <p className="text-2xs sm:text-sm text-gray-500 dark:text-slate-500 text-center sm:text-left order-2 sm:order-1">
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
                {/* Invite More — the AI Interview tracking popup's button (primary,
                    sm, Send icon first) and its interaction: this popup closes,
                    the Share dialog opens on the SAME assessment, and closing
                    Share brings this popup back (see `shareReturnToTracking`).
                    Gated exactly as every other Share on this page is. */}
                {(() => {
                  const target = selectedAssessmentForTracking;
                  const canShare = isTenantAdmin || hasPermissionCode('assessments:share');
                  const status = String(target?.status ?? '').toLowerCase();
                  const blockedReason = !target ? 'No assessment selected'
                    : !canShare ? 'You do not have permission to invite candidates'
                    : status === 'draft' ? 'Publish assessment first to share'
                    : status === 'archived' ? 'Archived assessments cannot be shared'
                    : isAssessmentRevoked(target) ? 'Invites for this assessment have been revoked. Duplicate it to start fresh.'
                    : '';
                  return (
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={!!blockedReason}
                      title={blockedReason || 'Invite more candidates to this assessment'}
                      onClick={() => {
                        if (blockedReason) return;
                        // Remember where we came from so closing Share returns here.
                        setShareReturnToTracking({ assessment: target, job: trackingJob });
                        closeTrackInvitesModal();
                        setSelectedAssessmentForShare(target);
                        setShowShareModal(true);
                      }}
                      icon={<Send className="w-3.5 h-3.5" />}
                    >
                      Invite More
                    </Button>
                  );
                })()}
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
            <div className="bg-warning-subtle border border-warning-line rounded-lg p-3 text-sm">
              <p className="text-warning-strong font-medium mb-1">New link expiry</p>
              <p className="text-warning-strong">
                Valid for <strong>{preview.durationLabel}</strong> from now — expires on{' '}
                <strong>{preview.dateLabel}</strong>.
              </p>
              <p className="text-warning text-xs mt-2">
                Same duration as the original invitation.
              </p>
            </div>
          );
        })()}
      </ConfirmationDialog>

      {/* Revoke / Edit ("Save & Send") / full-history — shared by the Track
          Invites popup and the Invitation Status tab (see
          getInviteAssessmentId / refreshInviteSurfaces above). */}
      <RevokeInvitationDialog
        target={revokeInviteTarget}
        onClose={() => setRevokeInviteTarget(null)}
        getAssessmentId={getInviteAssessmentId}
        onRevoked={refreshInviteSurfaces}
      />
      <EditInvitationModal
        target={editInviteTarget}
        onClose={() => setEditInviteTarget(null)}
        getAssessmentId={getInviteAssessmentId}
        onSaved={refreshInviteSurfaces}
      />
      <InvitationHistoryDialog
        target={historyInviteTarget}
        onClose={() => setHistoryInviteTarget(null)}
        getAssessmentId={getInviteAssessmentId}
      />

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

      {/* Bulk revoke confirmation for the Invitation Status tab. */}
      <ConfirmationDialog
        isOpen={showInviteBulkRevokeConfirm}
        onClose={() => { if (!isBulkRevoking) setShowInviteBulkRevokeConfirm(false); }}
        onConfirm={handleInviteBulkRevoke}
        title="Revoke selected invitations?"
        description={`This will immediately expire the invitation link${inviteBulkRevokeCount === 1 ? '' : 's'} for ${inviteBulkRevokeCount} selected candidate${inviteBulkRevokeCount === 1 ? '' : 's'}. You'll be able to edit their details and send a new invitation afterwards.`}
        confirmText={isBulkRevoking ? 'Revoking…' : `Yes, revoke ${inviteBulkRevokeCount}`}
        cancelText="Cancel"
        variant="danger"
      />

      {/* Bulk revoke confirmation for the Track Invites popup — selected
          Invited candidates only. */}
      <ConfirmationDialog
        isOpen={showTrackingBulkRevokeConfirm}
        onClose={() => { if (!isBulkRevoking) setShowTrackingBulkRevokeConfirm(false); }}
        onConfirm={handleTrackingBulkRevoke}
        title="Revoke selected invitations?"
        description={`This will immediately expire the invitation link${trackingSelectedIds.size === 1 ? '' : 's'} for ${trackingSelectedIds.size} selected candidate${trackingSelectedIds.size === 1 ? '' : 's'}. You'll be able to edit their details and send a new invitation afterwards.`}
        confirmText={isBulkRevoking ? 'Revoking…' : `Yes, revoke ${trackingSelectedIds.size}`}
        cancelText="Cancel"
        variant="danger"
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
        <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 w-full max-w-[95vw] sm:max-w-2xl max-h-[calc(100dvh-1.5rem)] flex flex-col overflow-hidden">
            {/* Header and the two panels scroll together, so the actions stay
                reachable on a short viewport. */}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-7 pt-5 sm:pt-7 pb-5 sm:pb-6">
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
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={closeIfIdle}
                  disabled={isCloning}
                  className="px-2 -mr-1.5 -mt-1 flex-shrink-0"
                  aria-label="Close"
                >
                  <X className="w-5 h-5 sm:w-6 sm:h-6" />
                </Button>
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
              <div className="rounded-xl border border-warning-line/70 bg-warning-subtle p-3 sm:p-4">
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-warning-subtle flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-warning" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400">New Assessment Version</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <span className="text-sm sm:text-lg font-semibold text-gray-900 dark:text-slate-50">
                        Assessment Version {nextVersion}
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-warning-subtle text-warning-strong text-xs sm:text-sm font-semibold">
                        Draft
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex-shrink-0 border-t border-gray-200 dark:border-slate-700 px-4 sm:px-7 py-3 sm:py-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3">
              <Button
                variant="primary"
                size="md"
                onClick={handleConfirmClone}
                disabled={isCloning}
                icon={isCloning ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
              >
                {isCloning ? 'Duplicating…' : (
                  <>
                    Create Version {nextVersion}
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Draft-conflict modal — shown by handleOpenCloneModal instead of the
          clone confirmation when the lineage already has an unfinished
          draft. Points the recruiter at that draft rather than letting them
          create a second one (the backend blocks the second one too, but
          this avoids the round trip). */}
      {pendingDraftConflict && (() => {
        const { target, draft } = pendingDraftConflict;
        const closeConflict = () => setPendingDraftConflict(null);
        const lastEdited = draft.updated_at || draft.created_at;
        // Same fields/fallbacks the clone-confirmation modal uses for its
        // "Current Job" card, so the JD name/version shown here always
        // agrees with what that modal (and the list row) would show.
        const jdShortId = target?.jd_short_id;
        const jobTitle = target?.jd_title
          || target?.job?.title
          || stripVersionFromTitle(target?.title || draft.title || '')
          || 'This job';
        const jobVersion = target?.jd_version ?? draft.jd_version ?? 1;
        const draftVersion = draft.version ?? 1;
        return (
          <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-6">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 w-full max-w-[95vw] sm:max-w-lg max-h-[calc(100dvh-1.5rem)] flex flex-col overflow-hidden">
              <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-7 pt-5 sm:pt-7 pb-5 sm:pb-6">
                <div className="flex justify-end">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={closeConflict}
                    className="px-2 -mr-1.5 -mt-1"
                    aria-label="Close"
                  >
                    <X className="w-5 h-5 sm:w-6 sm:h-6" />
                  </Button>
                </div>

                <div className="flex flex-col items-center text-center -mt-4">
                  <div className="w-14 h-14 rounded-full bg-warning-subtle flex items-center justify-center">
                    <AlertTriangle className="w-6 h-6 text-warning" />
                  </div>
                  <h3 className="mt-4 text-xl sm:text-2xl font-bold text-gray-900 dark:text-slate-50 tracking-tight">
                    Draft already exists
                  </h3>
                  <p className="mt-2 text-sm sm:text-base text-gray-500 dark:text-slate-400 leading-snug">
                    A draft version already exists for this assessment.
                    Open the existing draft to continue editing, or cancel to stay here.
                  </p>
                </div>

                <div className="mt-5 sm:mt-6 rounded-xl border border-gray-200/80 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3 sm:p-4">
                  <div className="flex items-start gap-3 sm:gap-4">
                    <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-500/15 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-brand-blue dark:text-blue-300" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400">Existing Draft</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                        <span className="text-sm sm:text-base font-bold text-gray-900 dark:text-slate-50 break-words">
                          {jdShortId ? `${jdShortId.replace(/-/g, ' ')}  ` : ''}
                          {jobTitle} v{jobVersion} - Assessment V {draftVersion}
                        </span>
                        <span className="px-2.5 py-1 rounded-lg bg-warning-subtle text-warning-strong text-xs font-semibold flex-shrink-0">
                          Draft
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-gray-500 dark:text-slate-400">
                        {lastEdited && (
                          <span className="inline-flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5" />
                            Last edited on {formatIST(lastEdited)}
                          </span>
                        )}
                        {draft.created_by_name && (
                          <>
                            <span aria-hidden="true" className="text-gray-300 dark:text-slate-600">|</span>
                            <span className="inline-flex items-center gap-1.5">
                              <Users className="w-3.5 h-3.5" />
                              Edited by {draft.created_by_name}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="shrink-0 border-t border-gray-200 dark:border-slate-700 px-4 sm:px-7 py-3 sm:py-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3">
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => {
                    handleEditAssessment({
                      id: draft.id,
                      jd_id: target?.jd_id,
                      status: 'Draft',
                      invitations_count: 0,
                    });
                    closeConflict();
                  }}
                >
                  Open Draft
                  <ArrowRight className="w-4 h-4" />
                </Button>
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
          <div className="bg-warning-subtle border border-warning-line rounded-lg p-3 text-sm">
            <p className="text-warning-strong font-medium mb-1">
              {revokeCount === null
                ? 'Counting eligible invitations…'
                : `${revokeCount} link${revokeCount === 1 ? '' : 's'} will be revoked.`}
            </p>
            <p className="text-warning-strong text-xs mt-1">
              Only candidates who have <strong>not yet opened</strong> their invitation are affected. Anyone already in progress or completed will be left alone and can finish.
            </p>
          </div>
        )}
      </ConfirmationDialog>
    </main>
  );
}
