'use client';

import JobIdBadge from '@/components/jobs/JobIdBadge';
import { InviteSourceValue, assessmentInviteSource, inviteSourceLabel } from '@/components/AIInterviewInviteTable';
import { Plus, Clock, Calendar, Users, CheckCircle, FileText, ArrowDown, ArrowRight, FileCheck, MoreVertical, Play, Sparkles, Eye, Edit2, BarChart, Mail, Trash2, Copy, Archive, ArchiveRestore, Download, Link2, Share2, PauseCircle, Monitor, Brain, Code, ClipboardList, Globe, Pencil, Shield, Video, X, Info, CheckCircle2, Check, MonitorOff, Clipboard, Lock, TrendingUp, Loader2, ClipboardCheck, ChevronRight, ListFilter, FilterX, FileDown, FileSpreadsheet, CheckSquare, Square } from 'lucide-react';
import { StatsCard, StatsCardGrid } from '@/components/ui/stats-card';
import { MENU_ITEM_SCALE_CLASS } from '@/lib/constants/menuAnimation';
import { useState, useEffect, useRef, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { useDialogHeightLock } from '@/lib/hooks/useDialogHeightLock';
import { useTrackerPoll } from '@/lib/hooks/useTrackerPoll';
import { TRACKER_DIALOG_PANEL_CLASS, TRACKER_DIALOG_PLACEHOLDER_CLASS } from '@/lib/constants/trackerDialog';
import { createPortal } from 'react-dom';
import { readListSnapshot, writeListSnapshot, perfNote } from '@/lib/utils/listSnapshot';
import { mapLimit } from '@/lib/utils/mapLimit';
import { startWarmUp } from '@/lib/utils/warmUp';
import { prefetchAssessmentRows } from '@/components/assessments/AllAssessmentsTable';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import AssessmentCreation from './AssessmentCreation';
import ListPagination from './ListPagination';
import AssessmentResults from './AssessmentResults';
import { useInviteDialog } from '@/components/talent-match-invite/InviteDialogProvider';
import AssessmentAuditTrail from './AssessmentAuditTrail';
import ConsentLogs from './compliance/ConsentLogs';
import AssessmentPreviewModal from './AssessmentPreviewModal';
import AssessmentConfigureModal from './AssessmentConfigureModal';
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
import { DateField } from '@/components/ui/date-field';
/* The one position every tab's search row lands in. See the note on the
   component: the toolbar itself was already shared, but each tab drew it
   somewhere else, so switching tabs moved the search box. */
import {
  ListToolbarSlot,
  ListToolbarSlotProvider,
  ListBulkActions,
  useListSortSlot,
  ListToolbarPortal,
  useListToolbarSlot,
} from '@/components/ui/list-toolbar-slot';
import { Skeleton, CardGridSkeleton } from '@/components/ui/skeleton';
import GridCardSelect, { gridCardSelectedClass } from '@/components/ui/grid-card-select';
import ExportColumnsModal from '@/components/ExportColumnsModal';
import { isPhoneWidth } from '@/components/ai-interview/ResultRowActions';
import ListCountBadge from '@/components/ui/list-count-badge';
import ListViewToggle, { type ListDisplayMode } from '@/components/ui/list-view-toggle';
import CandidateResultCard from '@/components/assessments/CandidateResultCard';
/* The two shared empty states. ListEmptyState covers a LIST in its two
   flavours — narrowed to nothing by a search/filter (keep the controls, offer
   a reset) versus no records at all; TabEmptyState covers a tab that has no
   records at all and no filters of its own. Both are documented at their
   definitions, and this page had been hand-rolling four variants of them. */
import ListEmptyState from '@/components/ui/list-empty-state';
import TabEmptyState from '@/components/ui/tab-empty-state';
/* The Candidate Results Job filter's control. The same SearchableSelect the
   All Assessments table uses for its Job filter — a plain <select> stops
   working once the option list is drawn from data, which a tenant's job list is. */
import SearchableSelect, { type SearchableSelectOption } from '@/components/ui/searchable-select';
import FilterSelect from '@/components/ui/filter-select';
import { useListSearch } from '@/lib/hooks/useListSearch';
import type { AssessmentAttemptResponse } from '@/lib/services/assessmentService';
import { isAssessmentArchived } from '@/lib/services/assessmentService';

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
import api from '@/lib/services/api';
import { proctoringService, ProctoringSettings, ProctoringEvent } from '@/lib/services/proctoringService';
import { AlertTriangle, RefreshCw, Send, Ban, Layers, Briefcase, ChevronDown, Radar, Search, ChevronLeft, ArrowUpDown, Timer } from 'lucide-react';
import { stripVersionFromTitle, isAssessmentRevoked } from '@/lib/utils/assessmentUtils';
import { formatIST, formatISTDate, parseIST } from '@/lib/utils/dateUtils';
import { useGlobalDialog } from '@/components/providers/GlobalDialogProvider';
import { toast } from 'sonner';
import { friendlyErrorMessage } from '@/lib/utils/friendlyError';
import { assessmentJobLockMessage, loadJobVersionLineages, jobVersionStatusesFrom, checkAssessmentJobLock, isJdDisabled } from '@/lib/utils/assessmentJobLock';
import { jobLockBadgeFor } from '@/components/jobs/JobStatusBadge';
import type { JDLineageVersion } from '@/lib/services/jdService';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { IS_PRODUCTION_ENV } from '@/lib/utils/env';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import QuotaBadge from '@/components/ui/quota-badge';
import { useModuleQuota } from '@/contexts/QuotaContext';
import Dropdown from '@/components/ui/filter-select';
import AllAssessmentsTable, { VersionPill, AssessmentJobStatusBadge, type AssessmentRowAction } from '@/components/assessments/AllAssessmentsTable';
import type { AssessmentResponse } from '@/lib/services/assessmentService';
import DraftAssessmentExistsModal from '@/components/assessments/DraftAssessmentExistsModal';
import AssessmentVersionHistoryPanel, { type AssessmentVersionRow, VersionChip, jobVersionDisplayStatus, assessmentStatusLabel } from '@/components/assessments/AssessmentVersionHistoryPanel';
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
  MAX_ASSESSMENT_VERSIONS,
  type JobAssessmentHierarchy,
} from '@/lib/utils/jobAssessmentHierarchy';
import { TABLE_EMPTY_PANEL_CLASS } from '@/lib/constants/tableEmptyPanel';
import { formatScore, SCORE_CELL_TEXT } from '@/lib/utils/score';
import { useArchiveAssessmentConfirm } from '@/components/assessments/ArchiveAssessmentModal';
import { useDeleteRecordConfirm } from '@/components/recruitment/DeleteRecordModal';
import NameAvatar from '@/components/ui/name-avatar';
import { jobLineageKey, collapseByLineage as collapseJobLineages, orderTotalJobs } from '@/lib/utils/assessmentJobOrder';


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
        <span className="text-sm text-gray-600 whitespace-nowrap">Go to</span>
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
   bucket where unrelated rows would look like versions of one another.

   The key, the collapse and the Total Jobs order now live in
   lib/utils/assessmentJobOrder, shared with the assessment details page's
   Prev / Next so its "X / N" is this list's position. */

/**
 * Counts the completed candidates of the assessments it is handed, and reports
 * them back — one request for the whole set (`/assessments/completed-counts`),
 * which tallies the candidate records themselves, not a request per assessment.
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
  onUncounted,
}: {
  ids: string[];
  /* The page's own setter, passed as-is because React keeps it stable — an
     inline callback would be a new dependency on every render. */
  onCounted: Dispatch<SetStateAction<Record<string, number>>>;
  /* Ids this mount could not get a count for (a failed batch, or an id the
     answer left out) — the page's setter again. Without it the row would wait
     on a figure that is never coming. */
  onUncounted: Dispatch<SetStateAction<Set<string>>>;
}) {
  const requestedRef = useRef<Set<string>>(new Set());
  /* False once this mount is gone. A recount remounts the loader (by `key`),
     and a request the old mount left in flight must not land on top of the
     new mount's fresher answer. Set in the effect, not the initializer, so a
     Strict Mode remount turns it back on. */
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  /* One dependency that changes exactly when there is new work, rather than on
     every render that mints a new array. */
  const idsKey = ids.join(',');

  useEffect(() => {
    const pending = (idsKey ? idsKey.split(',') : []).filter((id) => !requestedRef.current.has(id));
    if (pending.length === 0) return;
    for (const id of pending) requestedRef.current.add(id);
    /* One request per COUNT_BATCH assessments — `/assessments/completed-counts`
       answers for all of them at once, where this used to ask once per
       assessment. The backend caps a request at 200 ids, hence the batch. */
    const COUNT_BATCH = 200;
    void (async () => {
      for (let start = 0; start < pending.length; start += COUNT_BATCH) {
        const batch = pending.slice(start, start + COUNT_BATCH);
        try {
          const counts = await assessmentService.getCompletedCounts(batch);
          if (!aliveRef.current) return;
          if (Object.keys(counts).length > 0) {
            onCounted((previous) => ({ ...previous, ...counts }));
          }
          const missing = batch.filter((id) => counts[id] === undefined);
          if (missing.length > 0) {
            onUncounted((previous) => new Set([...previous, ...missing]));
          }
        } catch (error) {
          /* A failed batch must not stop the others, and must not be remembered
             as a zero — the rows keep the listed figure and the ids are
             released, so paging to another set of jobs and back, or a refresh,
             asks again rather than being told no. */
          console.log('[TalentFlow] Failed to count completed candidates for assessments:', error);
          if (!aliveRef.current) return;
          for (const id of batch) requestedRef.current.delete(id);
          onUncounted((previous) => new Set([...previous, ...batch]));
        }
      }
    })();
  }, [idsKey, onCounted, onUncounted]);

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
  /** Open the Total Jobs tab (`jobs`) on this assessment: its job row's versions
   *  expanded with it selected, on the right page, scrolled to. Used for a
   *  draft just saved from the standalone create route. */
  initialFocusAssessmentId?: string;
}

type AssessmentPageTab =
  | 'jobs'
  | 'all'
  | 'active'
  | 'draft'
  | 'completed'
  | 'completed-candidates'
  | 'invitation-status'
  | 'archived'
  | 'audit'
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

/** What the Send Invite picker's preview needs of an assessment: its id, and
 *  the job the Configure form lays itself out from. */
type PickerPreviewAssessment = { id: string; jd_id?: string; [key: string]: unknown };

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

/** Distinct candidates in a set of results: one per email (trimmed, lowercased);
 *  rows with no email are left out. */
const countCandidateEmails = (rows: { candidate_email?: string | null }[]): number =>
  new Set(rows.map((r) => (r.candidate_email || '').trim().toLowerCase()).filter(Boolean)).size;

export default function Assessments({ jobs, onOpenCandidateView, onNavigateToJDCreation, autoOpenCreate, preSelectedJdId, preSelectedJdTitle, initialListTab, initialFocusAssessmentId }: AssessmentsProps) {
  const router = useRouter();
  const dialog = useGlobalDialog();
  const { confirmArchive, archiveConfirmModal } = useArchiveAssessmentConfirm();
  const { confirmDelete, deleteConfirmModal } = useDeleteRecordConfirm('Assessment');
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
  const sortSlotEl = useListSortSlot(toolbarSlot.node);
  // Proctoring settings are a staging-only testing menu — in production it's
  // hidden, so land on Topics instead.
  /* Activity Logs and Consent Logs sit here, beside Proctoring & Security and
     Topics, rather than as page tabs of their own. */
  const [settingsSubTab, setSettingsSubTab] = useState<'proctoring' | 'topics' | 'activity' | 'consent'>(IS_PRODUCTION_ENV ? 'topics' : 'proctoring');
  const [showCreation, setShowCreation] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedAssessmentForResults, setSelectedAssessmentForResults] = useState<any>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [selectedAssessmentForPreview, setSelectedAssessmentForPreview] = useState<any>(null);
  /* The Send Invite picker's eye: the Configure Assessment form, read-only —
     the view the assessment details page's own version preview opens. A popup
     there because the picker is itself a dialog mid-choice, and navigating
     away would throw the choice away. Everywhere else, View opens the
     assessment details page (see `openAssessmentDetailsPage`). */
  const [configurePreviewAssessment, setConfigurePreviewAssessment] = useState<PickerPreviewAssessment | null>(null);
  /** Preview inside the Send Invite picker. The Configure form is scoped to a
   *  job, so an assessment with no `jd_id` keeps the older preview modal,
   *  which needs none. */
  const previewAssessmentInPicker = (mapped: PickerPreviewAssessment) => {
    if (mapped?.jd_id) {
      setConfigurePreviewAssessment(mapped);
      return;
    }
    setSelectedAssessmentForPreview(mapped);
    setShowPreviewModal(true);
  };
  /** View, from the list: the assessment details page — the complete reading
   *  of an assessment, with its actions. The Total Jobs list saves which job
   *  had View Versions open and which version was picked
   *  (`useListStatePersistence`), so Back lands where the reader left. */
  const openAssessmentDetailsPage = (assessmentId: string) => {
    router.push(`/recruitment/assessments/${assessmentId}`);
  };
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
    // Capture phase catches scrolling inside the list container, not just the
    // page. Scrolling the menu's OWN option list is not a reason to close it —
    // the Assessment Versions menu is height-capped and scrolls internally.
    const handleScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && openMenuRef.current?.contains(target)) return;
      close();
    };
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
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
  const [trackingInvitations, setTrackingInvitations] = useState<any[]>([]);
  const [isLoadingInvitations, setIsLoadingInvitations] = useState(false);
  /* Bumped by every tracking-popup list / summary load, and on close, so an
     older answer (the previous page or filter, a poll that started before
     them, a popup already closed or opened on another job) is dropped when it
     lands instead of overwriting the newer one. */
  const trackingListSeqRef = useRef(0);
  const trackingSummarySeqRef = useRef(0);
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
  /* The pill row's Sort by, shared by Total Jobs and the flat tabs. */
  const [listSortBy, setListSortBy] = useState<'newest' | 'oldest' | 'active' | 'draft'>('newest');
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
  /* Bumped by every `loadAssessmentsPage` run, so a slower earlier run (the
     tab the recruiter just left, say) is dropped when it lands instead of
     replacing the newer list, and only the latest run clears `isLoading`. */
  const assessmentsFetchSeqRef = useRef(0);
  const [apiAssessments, setApiAssessments] = useState<any[]>([]);
  /* Each linked job version's live status, by its JD id: Duplicate is off on
     an Archived / Disabled one (the AI Interview rule, for Create / Duplicate
     only). Read in one batch for the jobs the loaded assessments point at. */
  const [jobVersionStatusById, setJobVersionStatusById] = useState<Record<string, string>>({});
  /* Every version of each linked job, from the same read — the Job Name badge
     is judged on the whole job (jobLockBadgeFor), as on AI Interview. */
  const [jobLineageById, setJobLineageById] = useState<Record<string, JDLineageVersion[]>>({});
  useEffect(() => {
    const missing = Array.from(new Set(
      apiAssessments.map((a: any) => a?.jd_id).filter((id: any) => id && !(id in jobVersionStatusById)),
    )) as string[];
    if (missing.length === 0) return;
    let cancelled = false;
    loadJobVersionLineages(missing)
      .then((lineages) => {
        if (cancelled) return;
        setJobVersionStatusById((prev) => ({ ...prev, ...jobVersionStatusesFrom(lineages) }));
        setJobLineageById((prev) => ({ ...prev, ...lineages }));
      })
      .catch(() => { /* the click-time check still blocks */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiAssessments]);
  /** Why Duplicate / Share / Revoke / Archive is off for this assessment's
   *  job version, or null. */
  const jobLockReason = (assessment: { jd_id?: string } | null | undefined): string | null =>
    assessment?.jd_id ? assessmentJobLockMessage(jobVersionStatusById[assessment.jd_id]) : null;
  /* THE invite popup (VersionInviteDialog, via the dashboard-level provider) —
     the one AI Interviews and every other invite button open. Share/Invite
     opens from many places (row menus, details page, Track's Invite More);
     whichever one did, the job version is read fresh first and a locked one
     shows the message instead of the popup. */
  const { open: openInviteDialog } = useInviteDialog();
  /** Reopen the tracking popup on the assessment / job Invite More left. */
  const reopenTracking = (ret: { assessment: typeof selectedAssessmentForTracking; job: typeof trackingJob }) => {
    setIsLoadingInvitations(true);
    setTrackingJob(ret.job);
    setSelectedAssessmentForTracking(ret.assessment);
    setTrackingFilters(EMPTY_INVITE_FILTERS);
    setTrackingCurrentPage(1);
    setShowTrackInvitesModal(true);
  };
  const openAssessmentInvite = async (
    assessment: any,
    returnTo?: { assessment: typeof selectedAssessmentForTracking; job: typeof trackingJob },
  ) => {
    if (!assessment?.id) return;
    if (assessment.jd_id) {
      const lock = await checkAssessmentJobLock(assessment.jd_id);
      if (lock) {
        toast.error(lock);
        if (returnTo) reopenTracking(returnTo);
        return;
      }
    }
    const jdTitle = assessment.jd_title || assessment.job?.title || stripVersionFromTitle(assessment.title || '') || '';
    const versionNumber = jobVersionOfAssessment(assessment, jobVersionByJdIdRef.current) ?? assessment.jd_version ?? assessment.job?.version;
    openInviteDialog({
      kind: 'assessment',
      job: assessment.jd_id
        ? { jdId: assessment.jd_id, jdTitle, jdCode: assessment.jd_short_id || undefined, versionNumber: typeof versionNumber === 'number' ? versionNumber : undefined }
        : undefined,
      versionId: assessment.id,
      onSent: () => {
        void reloadAssessments();
        void refreshInviteSurfaces();
      },
      onClose: () => {
        /* Opened from the tracking popup's Invite More: reopen that popup, on
           the same assessment and (for a job-wide Track) the same job. Its
           effect refetches the invitations, so the ones just sent are listed. */
        if (returnTo) reopenTracking(returnTo);
      },
    });
  };
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
  /** Bumped by `reloadAssessments`, so the flat tables (Active …) refetch
   *  after a share, duplicate or revoke started from their menus. */
  const [flatTableReloadSignal, setFlatTableReloadSignal] = useState(0);
  /** An assessment the Total Jobs list should open on once it is loaded (a
   *  draft just saved) — see the focus effect near `collapsedAssessments`. */
  const [pendingFocusAssessmentId, setPendingFocusAssessmentId] = useState<string | null>(initialFocusAssessmentId ?? null);
  /** The focused draft's JOB version still to expand in its row's panel —
   *  waits for the job's lineage, the only reliable source of the number. */
  const [pendingFocusExpand, setPendingFocusExpand] = useState<{ rowJdId: string; draftJdId: string; fallback?: number } | null>(null);
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
  /* The counts from before the last recount, still drawn while it is in
     flight — a reload swaps each figure for its fresh one as it lands, rather
     than blanking every row and redrawing it. Never asked about again: what
     is fetched is decided by `completedCandidatesByAssessment` alone. */
  const [previousCompletedCandidates, setPreviousCompletedCandidates] = useState<Record<string, number>>({});
  /* Ids the loader could not count (see `JobCompletedCandidateCounts`). Only
     these fall back to the assessment row's own `completed_count`; an id
     merely not counted YET shows a placeholder instead. */
  const [uncountedCompletedIds, setUncountedCompletedIds] = useState<Set<string>>(() => new Set());
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
   * Archived versions count too (same as Create on the job page and the
   * Create / Send Assessment popup).
   */
  const countAssessmentVersions = (
    assessment: { jd_id?: string },
    lineage?: AssessmentVersionRow[],
  ) => jobVersionRows(assessment, lineage).length;

  /** The versions of THIS assessment's job version (its JD row) — what the
   *  cap, the latest-version rule and the one-draft rule are judged on, as on
   *  Job Details and its Create / Send Assessment popup. The fetched lineage
   *  holds every job version of the job, and assessment version numbers
   *  restart per job version, so it is narrowed to the row first. */
  const jobVersionRows = (
    assessment: { jd_id?: string },
    lineage?: AssessmentVersionRow[],
  ): AssessmentVersionRow[] => {
    if (!assessment.jd_id) return [];
    const fetched = (lineage ?? assessmentLineages[assessment.jd_id])
      ?.filter((x) => x.jd_id === assessment.jd_id);
    return fetched?.length
      ? fetched
      : (apiAssessments.filter((x: any) => x.jd_id === assessment.jd_id) as AssessmentVersionRow[]);
  };

  /** Why this version is not the one to duplicate, or null when it is. Only the
   *  LATEST version (highest number, archived included) can be duplicated, and
   *  an archived one must be unarchived first. */
  const latestVersionBlockedReason = (
    assessment: { id?: string; jd_id?: string; version?: number; status?: string },
    lineage?: AssessmentVersionRow[],
  ): string | null => {
    if (!assessment.jd_id) return null;
    const rows: any[] = jobVersionRows(assessment, lineage);
    const mine = assessment.version || 1;
    const latest = rows.reduce((best: any, v: any) => ((v.version || 1) > (best?.version || 0) ? v : best), null);
    const latestVersion = latest?.version || 1;
    const archivedSelf = String(assessment.status || '').toLowerCase() === 'archived';
    if (mine >= latestVersion) {
      return archivedSelf ? 'Unarchive this version to duplicate it.' : null;
    }
    const latestArchived = String(latest?.status || '').toLowerCase() === 'archived';
    return `Only the latest version (V${latestVersion}) can be duplicated.${latestArchived ? ' It is archived — unarchive it to duplicate.' : ''}`;
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
    return jobVersionRows(assessment, lineage).find(
      v => String(v.status || '').toLowerCase() === 'draft' && v.id !== assessment.id,
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
  const { ensureFilterLineages: ensureJobLineages, ensureVersionCounts } = jdLineage;
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
      /* ONE request for every job on the page, not one per job — the count the
         row prints comes from here rather than from whichever lineage happened
         to have landed. Same deferred tick, for the reason above. */
      ensureVersionCounts([...targets.values()]);
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
  // `assessmentSearchQuery` is the debounced value. Search matches the Job ID and
  // the Job Name only, so it runs in the browser over the full set the loader
  // already pulls (the API's own `search` matches other fields too), alongside
  // the filters — the list endpoint takes no filters beyond search.

  const [showAssessmentFilters, setShowAssessmentFilters] = useState(false);
  // True once the user confirms the More Filters panel with "Done" — mirrors
  // job-openings, so Clear appears only after filters are applied.
  // Search + filters in the shared hook. Search is SERVER-side here, so
  // `appliedQuery` is what the request is built from; the four filters are
  // applied in the browser (see the full-set fetch in loadAssessmentsPage).
  const assessmentListSearch = useListSearch({
    initialFilters: {
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
    type: filterType,
    createdBy: filterCreatedBy,
    createdFrom: filterCreatedFrom,
    createdTo: filterCreatedTo,
  } = assessmentListSearch.filters;
  // AS units from the shared QuotaContext — the same fetch as the header and AI
  // Interview, kept live by the units-consumed event. (This page used to fetch
  // /usage/quota-status itself, start at a made-up 10, and invent a 10-unit
  // limit when the plan reported none.)
  const {
    availableUnits,
    totalUnits,
    isUnlimited,
    isActivePlan: isQuotaPlanActive,
    refresh: refreshQuota,
  } = useModuleQuota('AS');
  // Out of assessment units: a real limit, nothing left, plan active.
  const asUnitsExhausted =
    isQuotaPlanActive && !isUnlimited && totalUnits > 0 && availableUnits !== null && availableUnits <= 0;
  const [trackingCurrentPage, setTrackingCurrentPage] = useState(1);
  const [trackingTotalItems, setTrackingTotalItems] = useState(0);
  const [trackingTotalPages, setTrackingTotalPages] = useState(1);
  const [trackingFilters, setTrackingFilters] = useState<InviteFilterState>(EMPTY_INVITE_FILTERS);

  // Cross-assessment "Candidate Results" tab — aggregates every completed
  // attempt across all assessments by fanning out listResults() calls (no
  // global endpoint exists yet). Client-side paginated.
  /* Both cross-assessment tabs start from the last set this page loaded, so a
     return from a details page (or reopening the tab) shows rows at once; their
     loads below still run and replace them. */
  /* Candidates assessed, one per email, counted from the completed results
     when the stats endpoint does not send `total_unique_candidates`. */
  const [uniqueEmailsAssessed, setUniqueEmailsAssessed] = useState<number | undefined>(undefined);
  const [completedCandidates, setCompletedCandidates] = useState<CandidateResultRow[]>(() => readListSnapshot<CandidateResultRow[]>('assessments-results:rows') ?? []);
  const completedCandidatesRef = useRef(completedCandidates);
  completedCandidatesRef.current = completedCandidates;
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
  /* ONE List / Card choice for every list tab (Total Jobs, All / Active /
     Draft / Archived, Candidate Results, Invitation Status) — display only,
     the same rows, page, search and filters feed both. Switching on one tab
     switches them all, as on the AI Interviews page. Phones start on cards
     (tables only scroll sideways there); the restore below wins elsewhere. */
  const [listDisplayMode, setListDisplayMode] = useState<ListDisplayMode>('list');
  /* Candidate Results' ticked rows, keyed by assessment + invitation (rows span
     assessments). Ticks from the table and from the cards feed the same set;
     the toolbar's Actions (N) menu acts on it. */
  const [selectedResultKeys, setSelectedResultKeys] = useState<Set<string>>(() => new Set());
  const [showResultsExportModal, setShowResultsExportModal] = useState(false);
  const [resultsExportFormat, setResultsExportFormat] = useState<'csv' | 'xls'>('csv');
  const [downloadingResultPdfs, setDownloadingResultPdfs] = useState(false);
  useEffect(() => {
    if (isPhoneWidth()) setListDisplayMode('grid');
  }, []);

  /* Cross-assessment "Invitation Status" tab — the Track Invites popup's view
     widened to the whole page: every invitation of every assessment, not one
     assessment at a time. Same fan-out shape as Candidate Results above (no
     global invitations endpoint exists either), and the same stat row, filter
     bar and status badges the popup uses, so the two cannot read differently.
     Filtering and paging are client-side because the rows are already merged
     here — a per-request filter would have to be re-fanned out to be correct. */
  const [inviteStatusRows, setInviteStatusRows] = useState<any[]>(() => readListSnapshot<any[]>('assessments-invite-status:rows') ?? []);
  const inviteStatusRowsRef = useRef(inviteStatusRows);
  inviteStatusRowsRef.current = inviteStatusRows;
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

  /* Every export on this page is behind `assessments:export`, read as the RBAC
     code itself. It used to read the legacy `canExport` flag, which
     `internal_db:export` also sets — so an Internal DB exporter could export
     assessments with this permission switched off. Without it, Export controls
     stay listed but greyed with this reason (grey out + tooltip, never hide). */
  const canExportAssessments = isTenantAdmin || hasPermissionCode('assessments:export');
  const EXPORT_DENIED_REASON = 'You do not have permission to export assessments';

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
  // Tracks which individual setting key(s) are currently being saved, so only
  // the toggle/input the user actually touched shows a disabled/busy state
  // instead of every control in the section.
  const [savingProctoringKeys, setSavingProctoringKeys] = useState<Set<string>>(new Set());
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
  // Tracks which individual topic key(s) are currently being saved, so only
  // the toggle the user actually touched shows a disabled/busy state instead
  // of every toggle in the section.
  const [savingTopicsKeys, setSavingTopicsKeys] = useState<Set<string>>(new Set());
  const [topicsError, setTopicsError] = useState<string | null>(null);

  // Stats from API
  const [stats, setStats] = useState(() => {
    const defaults = {
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
       (`candidatesAssessed`), which is why the Total Assessed card is not
       stuck on 0 the way reading the optional field alone left it. */
    total_candidates_tested: 0,
    /* People behind those attempts — one per candidate email — when the
       stats endpoint sends it (`total_unique_candidates`). */
    total_unique_candidates: undefined as number | undefined,
    total_invitations: 0,
    total_candidates_completed: 0,
    average_pass_rate: null as number | null,
    average_score: null as number | null,
    units_consumed: 0,
    };
    // The last stats this page loaded, so a return visit shows real numbers at once.
    return { ...defaults, ...(readListSnapshot<Partial<typeof defaults>>('assessments:stats') ?? {}) };
  });
  /* Starts true when nothing is remembered: the mount effect (`loadAllData`) is
     what fills `stats`, and until it has run the five cards would otherwise
     print their 0 defaults for a frame. Remembered stats skip that placeholder
     and the load refreshes them quietly. Its `finally` always clears this, on
     every path. */
  const [isLoadingStats, setIsLoadingStats] = useState(() => readListSnapshot('assessments:stats') === null);

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
      // The page-wide List / Card view choice.
      listDisplayMode,
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
        if ((s.activeTab as string) === 'consent') setActiveTab('settings');
        else if (typeof s.activeTab === 'string') setActiveTab(s.activeTab as typeof activeTab);
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
          type:
            s.filterType === 'Technical' || s.filterType === 'Behavioral' || s.filterType === 'Aptitude'
              ? s.filterType
              : 'all',
          createdBy: typeof s.filterCreatedBy === 'string' ? s.filterCreatedBy : 'all',
          createdFrom: typeof s.filterCreatedFrom === 'string' ? s.filterCreatedFrom : '',
          createdTo: typeof s.filterCreatedTo === 'string' ? s.filterCreatedTo : '',
        });
      }
      if (!initialListTab && (s.activeTab as string) === 'consent') {
        setSettingsSubTab('consent');
      } else if (!initialListTab && s.settingsSubTab === 'activity') {
        // Activity Logs moved out of Settings into its own tab.
        setActiveTab('audit');
      } else if (
        s.settingsSubTab === 'proctoring' || s.settingsSubTab === 'topics'
        || s.settingsSubTab === 'consent'
      ) {
        setSettingsSubTab(s.settingsSubTab);
      }
      if (typeof s.assessmentItemsPerPage === 'number') setAssessmentItemsPerPage(s.assessmentItemsPerPage);
      // Display preference, like rows per page — restored even on a tab-named arrival.
      if ((s.listDisplayMode === 'list' || s.listDisplayMode === 'grid') && !isPhoneWidth()) setListDisplayMode(s.listDisplayMode);

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
      /* When the assessment was published (AssessmentResponse.published_at) —
         what the Total Jobs list orders its jobs by, see `orderTotalJobs`. */
      published_at: a.published_at,
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
    const base = "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 ring-1";
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
        return <span className={`${base} bg-slate-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 ring-gray-200 dark:ring-slate-700`} title="Link created — no email sent yet"><Mail className="w-3 h-3" /> Invited</span>;
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
        <td className="px-3 sm:px-4 py-3 align-middle text-sm text-center">
          <span className="text-gray-400" title={why}>&mdash;</span>
        </td>
      );
    }

    const passed = score >= RESULT_PASS_MARK;
    return (
      <td className="px-3 sm:px-4 py-3 align-middle text-sm text-center">
        <div className="flex flex-col items-center gap-0.5">
          <span className={`${SCORE_CELL_TEXT} ${passed ? 'text-success' : 'text-destructive'}`}>
            {formatScore(score)}%
          </span>
          <span className={`text-2xs font-medium px-1.5 py-0.5 rounded ring-1 ${passed ? 'bg-success-subtle text-success ring-success-line' : 'bg-destructive-subtle text-destructive ring-destructive-line'}`}>
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
    currentInviteStatus(inv) === 'expired' && !inv.started_at && !inv.completed_at && !inviteJobLock(inv);

  /* Eligibility for a bulk revoke: Invited ('sent'), same rule as the per-row
     Revoke action (isRevocableInvitation). Scenario 4's "all selected are
     Invited -> Revoke" case, mirrored for this tab. */
  const isInviteRevocable = (inv: any): boolean => isRevocableInvitation(inv) && !inviteJobLock(inv);

  /* A row whose job version is Disabled/Archived can't be ticked or acted on —
     the same lock Share/Invite reads (jobLockReason), addressed by the row's job. */
  const inviteJobLock = (inv: any): string | null => jobLockReason({ jd_id: inv._jd_id });
  /* Resend and Revoke email or cut off a candidate — the module's Invite
     permission, as on the AI Interviews Invitation Status tab. */
  const canInviteFromStatusTab = isTenantAdmin || hasPermissionCode('assessments:invite');

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
    // `from` marks the cross-assessment origin, as the Candidate Results tab
    // does: a flat trail, and "Assessments" / Back return to this tab.
    router.push(`/recruitment/assessments/${inv._assessment_id}/results/details?candidate_id=${inv.attempt_id}${cid}${name}&from=invitation-status`);
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

  /* Bulk Download PDF Reports on the Invitation Status tab — the Candidate
     Results tab's handleDownloadResultPdfs, read off invitation rows: a row's
     report is its attempt (`attempt_id`) under its own assessment, and only a
     completed, fully scored attempt has one. One PDF for one row; several go
     as one ZIP per assessment (the bulk endpoint takes one assessment's ids). */
  const [downloadingInvitePdfs, setDownloadingInvitePdfs] = useState(false);
  const inviteHasReport = (inv: any): boolean =>
    inviteHasResult(inv) && inv.scoring_status !== 'pending' && inv.scoring_status !== 'processing';
  const handleDownloadInviteReportPdfs = async (rows: any[]) => {
    if (downloadingInvitePdfs) return;
    const eligible = rows.filter(inviteHasReport);
    if (eligible.length === 0) {
      toast.warning('No scored results to download — reports are available once scoring is completed.');
      return;
    }
    const skipped = rows.length - eligible.length;
    setDownloadingInvitePdfs(true);
    try {
      const save = (blob: Blob, filename: string) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      };
      const stamp = inviteExportFileDate(new Date());
      if (eligible.length === 1) {
        const inv = eligible[0];
        const blob = await assessmentService.exportPDF(inv._assessment_id, inv.attempt_id);
        const who = (inv.candidate_display_id || inv.candidate_name || 'Candidate').replace(/[^a-zA-Z0-9]/g, '_');
        const job = (inv._jd_title || inv._assessment_title || 'Assessment').replace(/[^a-zA-Z0-9]/g, '_');
        save(blob, `${who}_${job}_${stamp}.pdf`);
      } else {
        const byAssessment = new Map<string, any[]>();
        for (const inv of eligible) {
          const list = byAssessment.get(inv._assessment_id) ?? [];
          list.push(inv);
          byAssessment.set(inv._assessment_id, list);
        }
        for (const [assessmentId, group] of byAssessment) {
          const blob = await assessmentService.exportResultsBulkPDFs(assessmentId, group.map((inv) => String(inv.attempt_id)));
          const name = (group[0]._assessment_short_id || group[0]._assessment_title || 'Assessment').replace(/[^a-zA-Z0-9]/g, '_');
          save(blob, `${name}_Invitation_Reports_${stamp}.zip`);
        }
      }
      toast.success(
        `Downloaded ${eligible.length} report${eligible.length === 1 ? '' : 's'}`
        + (skipped > 0 ? `. ${skipped} invitation${skipped === 1 ? ' has' : 's have'} no report yet.` : '.'),
      );
    } catch (error) {
      console.error('Failed to download invitation report PDFs:', error);
      toast.error('Could not download the reports. Please try again.');
    } finally {
      setDownloadingInvitePdfs(false);
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
      pending: 'Invited',
    };
    return labels[currentInviteStatus(inv)] || 'Invited';
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
    { label: 'JD ID', value: (inv) => inv._jd_short_id || '' },
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

  /* `cols` — the columns picked in the Export popup (all by default). */
  const exportInvitesToCSV = (rows: any[], cols = INVITE_EXPORT_COLUMNS) => {
    const headers = cols.map((col) => `"${col.label}"`).join(',');
    const body = rows.map((inv) =>
      cols.map((col) => `"${col.value(inv).replace(/"/g, '""')}"`).join(',')
    );
    const csv = [headers, ...body].join('\n');
    downloadInviteExport(
      new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }),
      inviteExportFileName('csv'),
      rows.length,
      'CSV',
    );
  };

  const exportInvitesToXLS = (rows: any[], cols = INVITE_EXPORT_COLUMNS) => {
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
            <tr>${cols.map((col) => `<th>${escape(col.label)}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${rows.map((inv) => `<tr>${cols.map((col) => `<td>${escape(col.value(inv))}</td>`).join('')}</tr>`).join('')}
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

  /* ── Candidate Results: Actions (N) — Export and Download PDF Reports ──
     The Resume Scoring pattern: both act on the ticked rows only. */
  const resultRowKey = (row: CandidateResultRow) => `${row._assessment_id}-${row.invitation_id}`;
  const toggleResultSelected = (row: CandidateResultRow) =>
    setSelectedResultKeys((prev) => {
      const next = new Set(prev);
      const key = resultRowKey(row);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const selectedResultRows = completedCandidates.filter((row) => selectedResultKeys.has(resultRowKey(row)));

  /* Export columns, in the table's order. Timeline splits into its three parts
     so each lands in its own spreadsheet column. */
  const resultStatusLabel = (row: CandidateResultRow) =>
    row.status === 'completed' ? 'Completed' : row.status === 'in_progress' ? 'In Progress' : 'Pending';
  const resultScoreText = (value?: number) => (typeof value === 'number' ? `${formatScore(value)}%` : '');
  const RESULT_EXPORT_COLUMNS: { id: string; label: string; headers: string[]; cells: (row: CandidateResultRow) => string[] }[] = [
    { id: 'candidate', label: 'Candidate', headers: ['Candidate'], cells: (r) => [r.candidate_name || ''] },
    { id: 'email', label: 'Email', headers: ['Email'], cells: (r) => [r.candidate_email || ''] },
    {
      id: 'timeline', label: 'Timeline', headers: ['Started At', 'Completed At', 'Duration'],
      cells: (r) => [
        r.started_at ? formatIST(r.started_at) : '',
        r.completed_at ? formatIST(r.completed_at) : '',
        formatTimeSpent(r.time_spent_seconds) !== '-' ? formatTimeSpent(r.time_spent_seconds) : '',
      ],
    },
    { id: 'completed', label: 'Completed', headers: ['Completed'], cells: (r) => [r.completed_at ? formatISTDate(r.completed_at) : ''] },
    { id: 'resultStatus', label: 'Result Status', headers: ['Result Status'], cells: (r) => [resultStatusLabel(r)] },
    { id: 'techScore', label: 'Tech Score', headers: ['Tech Score'], cells: (r) => [resultScoreText(r.technical_score)] },
    { id: 'codingScore', label: 'Coding Score', headers: ['Coding Score'], cells: (r) => [resultScoreText(r.coding_score)] },
    { id: 'inviteSource', label: 'Invite Source', headers: ['Invite Source'], cells: (r) => [inviteSourceLabel(assessmentInviteSource(r)) || ''] },
    { id: 'phone', label: 'Phone', headers: ['Phone'], cells: (r) => [r.candidate_phone || ''] },
    { id: 'cid', label: 'CID', headers: ['CID'], cells: (r) => [r.candidate_display_id || ''] },
    { id: 'jobId', label: 'JD ID', headers: ['JD ID'], cells: (r) => [r._jd_short_id || ''] },
    { id: 'jdTitle', label: 'JD Title', headers: ['JD Title'], cells: (r) => [r.jd_title || r._assessment_title || ''] },
    { id: 'jobVersion', label: 'Job Version', headers: ['Job Version'], cells: (r) => [r._jd_version ? `V${r._jd_version}` : ''] },
    { id: 'assessmentVersion', label: 'Assessment Version', headers: ['Assessment Version'], cells: (r) => [r._assessment_version ? `V${r._assessment_version}` : ''] },
    { id: 'resumeVersion', label: 'Resume Version', headers: ['Resume Version'], cells: (r) => [r._resume_version ? `V${r._resume_version}` : ''] },
  ];

  const handleResultsExport = (ids: string[]) => {
    if (!canExportAssessments) return;
    const rows = selectedResultRows;
    if (rows.length === 0) {
      toast.warning('No candidates to export');
      return;
    }
    const cols = RESULT_EXPORT_COLUMNS.filter((col) => ids.includes(col.id));
    const headers = cols.flatMap((col) => col.headers);
    const data = rows.map((row) => cols.flatMap((col) => col.cells(row)));
    const baseName = `Assessment_Candidate_Results_${inviteExportFileDate(new Date())}`;
    if (resultsExportFormat === 'csv') {
      const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
      const csv = [headers.map(q).join(','), ...data.map((cells) => cells.map(q).join(','))].join('\n');
      downloadInviteExport(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }), `${baseName}.csv`, rows.length, 'CSV');
    } else {
      const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8" /></head><body><table border="1"><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${data.map((cells) => `<tr>${cells.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`;
      downloadInviteExport(new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' }), `${baseName}.xls`, rows.length, 'Excel');
    }
    // Built in the browser, so the audit row comes from this call (fire and forget).
    void assessmentService.logListExport({
      format: resultsExportFormat,
      record_count: rows.length,
      export_type: 'assessment_candidate_results',
      tab: 'completed-candidates',
      ids: rows.map((row) => String(row.id ?? '')).filter(Boolean),
    });
    setShowResultsExportModal(false);
  };

  /* The per-result report PDF the assessment Results page downloads
     (AssessmentResults' handleDownloadPDF / handleDownloadBulkPDFs): only a
     completed, fully scored attempt has one. One eligible row saves its PDF;
     several go as one ZIP per assessment, since the bulk endpoint takes the
     result ids of a single assessment. */
  const handleDownloadResultPdfs = async () => {
    if (downloadingResultPdfs || !canDownloadInviteReport) return;
    const eligible = selectedResultRows.filter((row) =>
      row.id && row.status === 'completed' && (row as any).scoring_status === 'completed');
    if (eligible.length === 0) {
      toast.warning('No scored results to download — reports are available once scoring is completed.');
      return;
    }
    const skipped = selectedResultRows.length - eligible.length;
    setDownloadingResultPdfs(true);
    try {
      const save = (blob: Blob, filename: string) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      };
      const stamp = inviteExportFileDate(new Date());
      if (eligible.length === 1) {
        const row = eligible[0];
        const blob = await assessmentService.exportPDF(row._assessment_id, row.id);
        const who = (row.candidate_display_id || row.candidate_name || 'Candidate').replace(/[^a-zA-Z0-9]/g, '_');
        const job = (row.jd_title || row._assessment_title || 'Assessment').replace(/[^a-zA-Z0-9]/g, '_');
        save(blob, `${who}_${job}_${stamp}.pdf`);
      } else {
        const byAssessment = new Map<string, CandidateResultRow[]>();
        for (const row of eligible) {
          const list = byAssessment.get(row._assessment_id) ?? [];
          list.push(row);
          byAssessment.set(row._assessment_id, list);
        }
        for (const [assessmentId, rows] of byAssessment) {
          const blob = await assessmentService.exportResultsBulkPDFs(assessmentId, rows.map((row) => row.id as string));
          const name = (rows[0]._assessment_short_id || rows[0]._assessment_title || 'Assessment').replace(/[^a-zA-Z0-9]/g, '_');
          save(blob, `${name}_Reports_${stamp}.zip`);
        }
      }
      toast.success(
        `Downloaded ${eligible.length} report${eligible.length === 1 ? '' : 's'}`
        + (skipped > 0 ? `. ${skipped} result${skipped === 1 ? ' has' : 's have'} no report yet.` : '.'),
      );
    } catch (error) {
      console.error('Failed to download result PDFs:', error);
      toast.error('Could not download the reports. Please try again.');
    } finally {
      setDownloadingResultPdfs(false);
    }
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
  /* The assessment this row's Track popup is archived for — job scope reads
     each row's own assessment (several versions, several statuses, stamped by
     stampJobScopedInvite above); single-assessment scope is the one assessment
     the popup is open on. Archived keeps every row visible but greys Copy
     Link / Revoke / Edit / Resend, the same way `configArchived` does for the
     AI Interview tracker. */
  const trackingInviteArchived = (inv: any): boolean =>
    isAssessmentArchived(trackingJob ? inv._assessment_status : selectedAssessmentForTracking?.status);
  /** The JD behind this row's assessment is disabled — same lock as
   *  `trackingInviteArchived`, just keyed off the JD rather than the
   *  assessment. Job scope: each row can belong to a different job VERSION
   *  (a different JD row), read via the row's own `_jd_id`. Single-assessment
   *  scope: the one JD the popup is open on. Reads the same
   *  `jobVersionStatusById` cache Duplicate/Share/Revoke already use for this
   *  list, rather than a separate lineage fetch. */
  const trackingInviteJdDisabled = (inv: any): boolean => {
    const jdId = trackingJob ? inv._jd_id : selectedAssessmentForTracking?.jd_id;
    return isJdDisabled(jobVersionStatusById[jdId || '']);
  };
  const [trackingSelectedIds, setTrackingSelectedIds] = useState<Set<string>>(new Set());
  const trackingSelectableIds = trackingInvitations
    .filter((inv: any) => isBulkActionable(inv) && !trackingInviteArchived(inv) && !trackingInviteJdDisabled(inv))
    .map((inv: any) => inv.id);
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
    trackingListSeqRef.current += 1;
    trackingSummarySeqRef.current += 1;
    /* The load just invalidated cannot clear its own spinner any more. */
    setIsLoadingInvitations(false);
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

  /** Every assessment matching `filters`, fetched in batches to the end of the set. */
  const fetchAllAssessments = async (filters: any) => {
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
    /* Offset paging over a list that can change between batches can hand the
       same assessment back on two pages — one row per id. */
    const seen = new Set<string>();
    return collected
      .filter((a) => !seen.has(a.id) && !!seen.add(a.id))
      .map((a: any, index: number) => mapAssessmentFromApi(a, index));
  };

  /* The whole-set answers this page has already fetched, per filter set. A tab
     click reuses a fresh one (and refreshes a stale one quietly behind it)
     instead of downloading every assessment again behind a skeleton; anything
     that changes data reloads for real and clears them. */
  const [initialAssessmentsCache] = useState(
    () => new Map(readListSnapshot<[string, { rows: any[]; at: number }][]>('assessments:page-cache') ?? []),
  );
  const assessmentsCacheRef = useRef(initialAssessmentsCache);
  const ASSESSMENTS_FRESH_MS = 60_000;
  const loadAssessmentsPage = async (page: number, mode: 'reload' | 'tab' = 'reload') => {
    const seq = ++assessmentsFetchSeqRef.current;
    const isStale = () => seq !== assessmentsFetchSeqRef.current;
    const filters: any = {};
    if (preSelectedJdId) {
      filters.jd_id = preSelectedJdId;
    }
    const status = getAssessmentStatusFilter(activeTab);
    if (status) {
      filters.status = status;
    }
    const cacheKey = JSON.stringify(filters);
    const cached = mode === 'tab' ? assessmentsCacheRef.current.get(cacheKey) : undefined;
    if (mode === 'reload') {
      assessmentsCacheRef.current.clear();
      writeListSnapshot('assessments:page-cache', []);
    }
    if (cached) {
      setApiAssessments(cached.rows);
      setIsLoading(false);
      if (Date.now() - cached.at < ASSESSMENTS_FRESH_MS) return;
    } else {
      setIsLoading(true);
    }
    try {
      /* No `search` param: the search box matches Job ID and Job Name only,
         in `filteredAssessments`, over this full set. */

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
        const collected = await fetchAllAssessments(filters);
        if (isStale()) return;
        assessmentsCacheRef.current.set(cacheKey, { rows: collected, at: Date.now() });
        writeListSnapshot('assessments:page-cache', Array.from(assessmentsCacheRef.current.entries()));
        setApiAssessments(collected);
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
      if (isStale()) return;
      console.log('[TalentFlow] Failed to load assessments:', error);
      setApiAssessments([]);
    } finally {
      if (!isStale()) setIsLoading(false);
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
    _assessment_status: scoped.status,
    _jd_id: scoped.jd_id,
    _jd_version: jobVersionOfAssessment(scoped, jobVersionByJdId) ?? 1,
  });

  /* Newest invite first, across assessments - the order the single-assessment
     endpoint returns, kept after the merge so a job-scoped page reads the same
     way round. */
  const inviteRecency = (invitation: any) =>
    new Date(invitation.sent_at || invitation.created_at || 0).getTime();

  /* Every invitation of every assessment of the job, paged through in
     batches of this size (`collectAllPages`) — one page per assessment
     silently dropped everything past the 200th — and the merged list is then
     paged in the browser at the popup's own page size. */
  const JOB_TRACKING_FETCH_SIZE = 200;

  const loadTrackingInvitationSummary = async (assessment: any) => {
    const seq = ++trackingSummarySeqRef.current;
    const isStale = () => seq !== trackingSummarySeqRef.current;
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
        if (isStale()) return;
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
      if (isStale()) return;
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
      if (isStale()) return;
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

  const loadTrackingInvitations = async (assessment: any, page: number, filters: InviteFilterState, silent = false) => {
    const seq = ++trackingListSeqRef.current;
    const isStale = () => seq !== trackingListSeqRef.current;
    if (!silent) setIsLoadingInvitations(true);
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
              const scopedItems = await collectAllPages(
                (scopedPage, page_size) => assessmentService.listInvitations(scoped.id, {
                  ...query,
                  page: scopedPage,
                  page_size,
                }),
                JOB_TRACKING_FETCH_SIZE,
              );
              return scopedItems.map((invitation: any) =>
                stampJobScopedInvite(invitation, scoped, trackingJob.jobVersionByJdId),
              );
            } catch (error) {
              console.error('Failed to load invitations for assessment', scoped.id, error);
              return [];
            }
          }),
        );
        if (isStale()) return;
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
      if (isStale()) return;
      const invitations = response.items || [];
      setTrackingInvitations(invitations);
      setTrackingTotalItems(response.total || 0);
      const totalPages = Math.max(1, response.total_pages || Math.ceil((response.total || 0) / INVITATIONS_PAGE_SIZE));
      setTrackingTotalPages(totalPages);

      if (invitations.length === 0 && (response.total || 0) > 0 && page > 1) {
        setTrackingCurrentPage(Math.min(page - 1, totalPages));
      }
    } catch (error) {
      if (isStale()) return;
      console.error('Failed to load invitations:', error);
      /* The summary cards are not touched here: they have their own request
         (`loadTrackingInvitationSummary`), which may well have succeeded, and
         zeroing them on a failed LIST put the popup's counts at 0. */
      setTrackingInvitations([]);
      setTrackingTotalItems(0);
      setTrackingTotalPages(1);
    } finally {
      /* Only the latest run clears the spinner — a superseded load must not
         end the newer one's — and a silent latest run may clear the spinner
         a load it superseded had set. */
      if (!isStale()) setIsLoadingInvitations(false);
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

  // Row click opens that candidate's result view. The detail route builds its
  // own breadcrumb (Dashboard > Assessments > assessment > candidate) and pages
  // through `assessmentResultNavList`, so seed it with EVERY row of this tab's
  // current list (search and filters applied, every page), in its order - so
  // its "X / N" counts Candidate Results records. Each entry carries its own
  // assessment (`aid`): this tab spans assessments, and the details route is
  // keyed on the result's assessment, so the neighbour may live under another.
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
            .filter(row => row.id && row._assessment_id)
            .map(row => ({ id: row.id, cid: row.candidate_display_id || '', aid: row._assessment_id }))
        )
      );
    } catch { /* ignore quota errors */ }

    const cid = result.candidate_display_id ? `&cid=${encodeURIComponent(result.candidate_display_id)}` : '';
    // `from` marks the cross-assessment origin so the details breadcrumb stays
    // flat instead of inserting an assessment crumb the recruiter never visited.
    router.push(`/recruitment/assessments/${result._assessment_id}/results/details?candidate_id=${attemptId}${cid}&from=candidate-results`);
  };

  const loadAllCompletedCandidates = async () => {
    const startedAt = performance.now();
    // Rows already on screen: refresh behind them rather than back to a skeleton.
    if (completedCandidatesRef.current.length === 0) setIsLoadingCompletedCandidates(true);
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
      /* Skip assessments with no completed candidates: one batched
         `/assessments/completed-counts` request (200 ids max) tells us which,
         instead of paging every assessment's results only to get an empty
         list. An id missing from the answer, or a failed batch, is fetched
         as before, so nothing is dropped on a count error. */
      /* Fast path: every completed result in ONE request (backend
         /assessments/all-results), instead of the counts + per-assessment
         fan-out below. Any failure leaves `fastAttempts` null and the original
         path runs unchanged. */
      let fastAttempts: any[] | null = null;
      try {
        fastAttempts = await assessmentService.getAllResults();
      } catch {
        fastAttempts = null;
      }
      const knownEmpty = new Set<string>();
      const COUNT_BATCH = 200;
      for (let start = 0; !fastAttempts && start < items.length; start += COUNT_BATCH) {
        const batch = items.slice(start, start + COUNT_BATCH).map((a: any) => a.id);
        try {
          const counts = await assessmentService.getCompletedCounts(batch);
          for (const id of batch) {
            if (counts[id] === 0) knownEmpty.add(id);
          }
        } catch {
          /* fall back to fetching this batch */
        }
      }
      // Results rather than invitations: the attempt carries the scores and the
      // pass/fail verdict this tab is about.
      const assessmentById = new Map<string, any>(items.map((a: any) => [a.id, a]));
      const stampAttempt = (a: any, attempt: any): CandidateResultRow => ({
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
      });
      const results = fastAttempts
        // A row whose assessment is not in `items` has nothing to stamp it with.
        ? [fastAttempts.flatMap((attempt: any) => {
            const a = assessmentById.get(attempt.assessment_id);
            return a ? [stampAttempt(a, attempt)] : [];
          })]
        : await Promise.all(
            items.map(async (a: any) => {
              if (knownEmpty.has(a.id)) return [];
              try {
                const attempts = await collectAllPages((page, page_size) =>
                  assessmentService.listResults(a.id, { status_filter: 'completed', page, page_size }),
                );
                return attempts.map((attempt) => stampAttempt(a, attempt));
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
        /* Fast path: one request per 200 jobs (backend /scoring/resume-versions)
           instead of a page of full scoring records per job. Same value, same
           (job, email) key. On any failure the per-job reads below run as before. */
        let resumeVersionsBatched = false;
        try {
          const batched = await scoringService.getResumeVersions(jdIds);
          for (const [jdId, byEmail] of Object.entries(batched)) {
            for (const [email, version] of Object.entries(byEmail)) {
              resumeVersionByKey.set(scoreKey(jdId, email), version);
            }
          }
          resumeVersionsBatched = true;
        } catch {
          resumeVersionsBatched = false;
        }
        if (!resumeVersionsBatched) await Promise.all(
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
      /* Most recently COMPLETED first, then earlier completions in order —
         the completion time from the API (`completed_at`), parsed the way the
         Active tab's table parses its timestamps (`parseIST`: a stamp with no
         zone is IST, not the browser's local time). An unparseable stamp
         counts as 0 instead of NaN, which made the comparator inconsistent
         and the whole order arbitrary. A row with no completion time (not
         expected here — every row is a completed result) sorts after the
         completed ones; ties fall back to `created_at`, newest first. */
      const stampTime = (value?: string) => {
        const time = value ? parseIST(value).getTime() : NaN;
        return Number.isFinite(time) ? time : 0;
      };
      merged.sort((x: any, y: any) =>
        (stampTime(y.completed_at) - stampTime(x.completed_at))
        || (stampTime(y.created_at) - stampTime(x.created_at)));
      setCompletedCandidates(merged);
      writeListSnapshot('assessments-results:rows', merged);
      perfNote('Assessments / Results — loaded', startedAt);
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
  /* Bumped by every load, so only the latest one's rows land — the full
     fan-out takes long enough for a 15s poll, a Refresh or a status action's
     reload to overlap it. `inviteStatusInFlightRef` counts the loads still
     running, and the poll skips a tick while it is non-zero rather than
     stacking another fan-out on top. */
  const inviteStatusSeqRef = useRef(0);
  const inviteStatusInFlightRef = useRef(0);
  const loadAllInviteStatuses = async (silent = false) => {
    const seq = ++inviteStatusSeqRef.current;
    const isStale = () => seq !== inviteStatusSeqRef.current;
    inviteStatusInFlightRef.current += 1;
    const startedAt = performance.now();
    // Rows already on screen: refresh behind them rather than back to a skeleton.
    if (!silent && inviteStatusRowsRef.current.length === 0) setIsLoadingInviteStatus(true);
    if (!silent) setInviteStatusError(null);
    try {
      /* Every assessment of every job version, paged to the end — see the same
         call in `loadAllCompletedCandidates`. */
      const items = await listAllAssessments();
      if (isStale()) return;
      if (items.length === 0) {
        setInviteStatusRows([]);
        return;
      }
      /* Job versions resolved from the JD rows, once for the whole set. */
      const jobVersionByJdId = rememberJobVersions(
        await resolveJobVersionsByJdId(items.map((a) => a.jd_id)),
      );
      /* Stamps an invitation with the assessment it belongs to. Used by both the
         one-request path and the per-assessment fallback below, so the rows
         are identical either way. */
      const stampInvite = (inv: any, a: any) => ({
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
      });
      /* ONE request for every invitation of every assessment (rows carry their
         `assessment_id`); a failure or an older backend falls through to the
         per-assessment path below, unchanged. */
      let fastRows: any[] | null = null;
      try {
        const assessmentById = new Map<string, any>(items.map((a: any) => [a.id, a]));
        const rows = await assessmentService.getAllInvitations();
        if (isStale()) return;
        fastRows = rows
          .filter((inv: any) => inv.assessment_id && assessmentById.has(inv.assessment_id))
          .map((inv: any) => stampInvite(inv, assessmentById.get(inv.assessment_id)));
      } catch {
        fastRows = null;
      }

      const perAssessment = fastRows ? [fastRows] : await mapLimit(
        // Fewer in flight for a background/silent run (warm-up, poll) so a click
        // made meanwhile is not queued behind it.
        items, silent ? 3 : 6, async (a: any) => {
          /* The list already says how many invitations each assessment has (the
             same table `listInvitations` reads), so one with none costs no
             request. Most assessments are in that group. */
          if (typeof a.invitations_count === 'number' && a.invitations_count === 0) return [];
          try {
            const invitations = await collectAllPages((page, page_size) =>
              assessmentService.listInvitations(a.id, { page, page_size }),
            );
            return invitations.map((inv: any) => stampInvite(inv, a));
          } catch {
            /* One assessment's invitations being unavailable must not empty the
               tab — the rest still list. */
            return [];
          }
        },
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
      if (isStale()) return;
      setInviteStatusRows(merged);
      writeListSnapshot('assessments-invite-status:rows', merged);
      perfNote('Assessments / Invitation Status — loaded', startedAt);
      /* A background poll must not yank the recruiter back to page 1 or drop
         their selection — only an explicit load does. */
      if (!silent) {
        setInviteStatusPage(1);
        // The ids just went stale; a selection pointing at them would export rows
        // the recruiter can no longer see.
        setSelectedInviteIds(new Set());
      }
    } catch (err: any) {
      if (silent || isStale()) return;
      console.error('Failed to load invitation statuses:', err);
      setInviteStatusError(err?.message || 'Failed to load invitation statuses');
      setInviteStatusRows([]);
    } finally {
      inviteStatusInFlightRef.current -= 1;
      /* Only the latest load clears the spinner; a superseded one must not
         end the newer load's, and a silent latest one may clear what a load
         it superseded had set. */
      if (!isStale()) setIsLoadingInviteStatus(false);
    }
  };

  /* Warm-up: once the page's own stats have loaded, load the other tabs' data in
     the background, lightest first, so a click on any tab finds it ready instead
     of starting from a skeleton. Each step is skipped quietly if it fails (the
     tab then loads normally when opened). Runs once per visit; only leaving the
     page stops it. */
  const warmFnsRef = useRef({ results: loadAllCompletedCandidates, invites: loadAllInviteStatuses });
  warmFnsRef.current = { results: loadAllCompletedCandidates, invites: loadAllInviteStatuses };
  const warmedRef = useRef(false);
  const cancelWarmUpRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (isLoadingStats || warmedRef.current) return;
    warmedRef.current = true;
    cancelWarmUpRef.current = startWarmUp([
      () => prefetchAssessmentRows(),
      () => prefetchAssessmentRows('published'),
      () => prefetchAssessmentRows('draft'),
      () => prefetchAssessmentRows('archived'),
      () => warmFnsRef.current.results(),
      () => warmFnsRef.current.invites(true),
    ]);
  }, [isLoadingStats]);
  useEffect(() => () => cancelWarmUpRef.current?.(), []);

  useEffect(() => {
    if (activeTab !== 'invitation-status') return;
    loadAllInviteStatuses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);
  /* Candidates open, start and finish on their own, so the tab polls quietly
     instead of waiting for a page refresh. Skipped while the browser tab is
     hidden. */
  useTrackerPoll(activeTab === 'invitation-status', () => {
    if (inviteStatusInFlightRef.current === 0) return loadAllInviteStatuses(true);
  });

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
      // Remembered stats are already on screen: refresh without the placeholder.
      if (readListSnapshot('assessments:stats') === null) setIsLoadingStats(true);

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
        const [statsResult, topicsResult] = await Promise.allSettled([
          assessmentService.getStats({ timeout: STATS_TIMEOUT_MS }),
          api.get('/assessments/settings/topics', { timeout: STATS_TIMEOUT_MS }),
        ]);

        // Process stats. Guarded against a fulfilled-but-empty/malformed body
        // (`response` falsy) — the fields below used to be read off it
        // unconditionally, which crashed this function before it ever reached
        // the quota block or the final `setIsLoadingStats(false)`.
        if (statsResult.status === 'fulfilled' && statsResult.value) {
          const response = statsResult.value;
          const freshStats = {
            total_assessments: response.total_assessments,
            total_jobs_with_assessments: response.total_jobs_with_assessments || 0,
            total_ever_created: response.total_ever_created || response.total_assessments,
            total_deleted: response.total_deleted || 0,
            active_assessments: response.active_assessments,
            draft_assessments: response.draft_assessments || 0,
            archived_assessments: response.archived_assessments || 0,
            total_candidates_tested: response.total_candidates_tested || 0,
            total_unique_candidates: response.total_unique_candidates,
            total_invitations: response.total_invitations || 0,
            total_candidates_completed: response.total_candidates_completed || 0,
            average_pass_rate: response.average_pass_rate,
            average_score: response.average_score,
            units_consumed: response.units_consumed || 0,
          };
          setStats(freshStats);
          writeListSnapshot('assessments:stats', freshStats);
          /* No people count from the server: count them here, one per
             candidate email across every completed result (one request). */
          if (response.total_unique_candidates == null) {
            assessmentService.getAllResults()
              .then((rows) => setUniqueEmailsAssessed(countCandidateEmails(rows)))
              .catch(() => setUniqueEmailsAssessed(undefined));
          }
          console.log('[TalentFlow] Loaded assessment stats from API');
        } else {
          console.log(
            '[TalentFlow] Failed to load stats:',
            statsResult.status === 'rejected' ? statsResult.reason : 'empty response'
          );
        }

        // Quota (AS units) comes from the shared QuotaContext via useModuleQuota.

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
    if (activeTab === 'invitation-status' || activeTab === 'settings') {
      return;
    }
    loadAssessmentsPage(assessmentCurrentPage, 'tab');
    // The advanced filters belong here too: turning one on switches the loader
    // between "one server page" and "the whole result set", and without the
    // dependency that switch never happened.
    // Not the page or the page size: the loader always fetches the whole set
    // and the list pages it in the browser (`visibleAssessments`), so paging
    // used to refetch everything just to slice it differently.
  }, [activeTab, preSelectedJdId,
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
  useTrackerPoll(showTrackInvitesModal && !!selectedAssessmentForTracking, () => Promise.all([
    loadTrackingInvitations(selectedAssessmentForTracking, trackingCurrentPage, trackingFilters, true),
    loadTrackingInvitationSummary(selectedAssessmentForTracking),
  ]));

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
    const keys = Object.keys(updates);
    setSavingTopicsKeys(prev => new Set([...prev, ...keys]));
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
      setSavingTopicsKeys(prev => {
        const next = new Set(prev);
        keys.forEach(k => next.delete(k));
        return next;
      });
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

    const keys = Object.keys(updates);
    setSavingProctoringKeys(prev => new Set([...prev, ...keys]));
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
      setSavingProctoringKeys(prev => {
        const next = new Set(prev);
        keys.forEach(k => next.delete(k));
        return next;
      });
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
    // A Disabled / Archived job version takes no edits — the menu's job lock.
    const editJobLock = jobLockReason(assessment);
    if (editJobLock) {
      toast.error(editJobLock);
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

  // Refresh the shared quota (header, this page and AI Interview update together).
  const reloadQuota = async () => {
    try {
      await refreshQuota();
    } catch {
      /* the shared context keeps its last good data */
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
        total_unique_candidates: statsResponse.total_unique_candidates,
        total_invitations: statsResponse.total_invitations || 0,
        total_candidates_completed: statsResponse.total_candidates_completed || 0,
        average_pass_rate: statsResponse.average_pass_rate,
        average_score: statsResponse.average_score,
        units_consumed: statsResponse.units_consumed || 0,
      });
      // As on the first load: no people count from the server, count emails here.
      if (statsResponse.total_unique_candidates == null) {
        assessmentService.getAllResults()
          .then((rows) => setUniqueEmailsAssessed(countCandidateEmails(rows)))
          .catch(() => setUniqueEmailsAssessed(undefined));
      }
    } catch (error) {
      console.log('[TalentFlow] Failed to reload stats:', error);
    }
  };

  // Reload assessments from API
  const reloadAssessments = async () => {
    // The Active tab's table keeps its own rows — have it refetch too.
    setFlatTableReloadSignal((n) => n + 1);
    try {
      /* The Completed metric is counted from candidate records, so a reload has
         to recount rather than redraw what it counted last time: a candidate
         finishing an assessment is exactly the change this refresh is for, and
         it moves no field on the assessment rows themselves. Dropping the cache
         and remounting the loader is what makes it ask again. The dropped
         counts stay on screen until their recount lands. */
      setPreviousCompletedCandidates((previous) => ({ ...previous, ...completedCandidatesByAssessment }));
      setCompletedCandidatesByAssessment({});
      setUncountedCompletedIds(new Set());
      setCompletedCandidatesGeneration((generation) => generation + 1);
      await loadAssessmentsPage(assessmentCurrentPage);
      // Also reload stats and quota
      await Promise.all([reloadStats(), reloadQuota()]);
    } catch (error) {
      console.log('[TalentFlow] Failed to reload assessments:', error);
    }
  };

  /* Refresh button at the right end of the tab-pills row — the AI Interviews
     page's. Refetches whichever tab is on screen; it replaces the icon-only
     Refresh that only Invitation Status had. */
  const [isRefreshingTab, setIsRefreshingTab] = useState(false);
  // Activity Logs owns its data — bumped by Refresh as its cue to refetch.
  const [auditRefreshSignal, setAuditRefreshSignal] = useState(0);
  const handleRefreshCurrentTab = async () => {
    if (isRefreshingTab) return;
    setIsRefreshingTab(true);
    try {
      if (activeTab === 'completed-candidates') {
        await loadAllCompletedCandidates();
      } else if (activeTab === 'invitation-status') {
        await loadAllInviteStatuses();
      } else if (activeTab === 'audit') {
        setAuditRefreshSignal((n) => n + 1);
      } else if (activeTab === 'settings') {
        await Promise.all([loadTopicSettings(), loadProctoringData()]);
      } else {
        // Total Jobs / All / Active / Draft / Archived (+ stats and quota).
        await Promise.all([reloadAssessments(), loadJdsWithAssessments()]);
      }
    } finally {
      setIsRefreshingTab(false);
    }
  };

  /**
   * After a status action SUCCEEDS (Activate, Unarchive, Archive, Pause,
   * Delete): put the outcome on screen at once, then re-read.
   *
   * `reloadAssessments` alone left the Assessment Versions table behind: that
   * table renders the lineage cache (`assessmentLineages`), which is only ever
   * forced after an ADD, so an unarchived version kept its Archived badge and
   * its Unarchive menu until the page was reloaded. So the record is patched,
   * from the API's own reply, in both places it lives — every cached lineage
   * row and the list row — and then the list, its counts and every cached
   * lineage (plus the jds-with-assessments index, which ignores archived ones)
   * are re-read from the server, as the clone flow does. Called only after the
   * request resolves, so a failed action leaves the screen as it was.
   */
  const syncAssessmentAfterStatusChange = async (
    assessmentId: string,
    /** The API's reply to the status write, or `null` when the record is gone. */
    updated: { status?: string } | null,
  ) => {
    if (updated === null) {
      setAssessmentLineages(prev => Object.fromEntries(
        Object.entries(prev).map(([key, rows]) => [key, rows.filter(row => row.id !== assessmentId)]),
      ));
      setApiAssessments(prev => prev.filter(a => a.id !== assessmentId));
    } else if (updated.status) {
      const rawStatus = updated.status;
      setAssessmentLineages(prev => Object.fromEntries(
        Object.entries(prev).map(([key, rows]) => [
          key,
          rows.map(row => (row.id === assessmentId ? { ...row, status: rawStatus } : row)),
        ]),
      ));
      /* The list holds MAPPED records, so the reply's status goes through the
         list's own mapper rather than a second copy of its wording. */
      const status = mapAssessmentFromApi({ status: rawStatus }, 0).status;
      setApiAssessments(prev => prev.map(a => (a.id === assessmentId ? { ...a, status } : a)));
    }
    await Promise.all([reloadAssessments(), refreshAssessmentExistence()]);
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

       A DRAFT goes to Total Jobs — the job list, one row per job with View
       Versions. A draft loses to any non-draft version of the same job
       (`collapseByLineage`), so it can sit behind its job's row rather than
       be one; the focus effect finds that row, opens its View Versions with
       the draft selected and its job version expanded, moves to its page and
       scrolls to it.

       The standalone /assessments/create route arrives at the same place by
       URL (`?tab=jobs&focus=<id>`) since it navigates rather than closing in
       place. */
    const isDraft = String(assessment?.status || '').toLowerCase() === 'draft';
    openAssessmentsList(isDraft ? 'jobs' : 'all');
    if (isDraft && assessment?.id) {
      setPendingFocusAssessmentId(String(assessment.id));
    }

    /* Reload the list to pick up the new assessment — and, with it, everything
       that decides a job version's action. The new assessment is what turns
       its version from Create Assessment to View Assessment, so leaving those
       sources stale would keep offering Create for a version that now has one. */
    await Promise.all([
      reloadAssessments(),
      refreshAssessmentExistence(assessment?.jd_id),
    ]);

    // No charge here. Assessment units are charged by the backend, one per
    // candidate start ("assessment_start"). Recording another unit at creation
    // billed every assessment one extra AS unit.
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
    const deleteJobLock = await checkAssessmentJobLock(
      apiAssessments.find((a) => a.id === assessmentId)?.jd_id ?? assessment?.jd_id,
    );
    if (deleteJobLock) {
      toast.error(deleteJobLock);
      setOpenMenuId(null);
      return;
    }

    if (!await confirmDelete({
      jobShortId: assessment?.jd_short_id,
      jobTitle: assessment?.jd_title || assessment?.title || 'Untitled',
      jobVersion: assessment?.jd_version,
      version: assessment?.version,
      createdAt: assessment?.created_at,
      createdBy: assessment?.created_by_name,
    })) return;

    try {
      await assessmentService.delete(assessmentId);
      setOpenMenuId(null);
      // Off the screen at once, then reload from API
      await syncAssessmentAfterStatusChange(assessmentId, null);
    } catch (error) {
      console.error('Failed to delete assessment:', error);
      toast.error(`Couldn't delete assessment. ${friendlyErrorMessage(error, 'Only draft assessments can be deleted.')}`);
      setOpenMenuId(null);
    }
  };

  // Pause assessment (set status to closed)
  const handlePauseAssessment = async (assessmentId: string) => {
    if (!await dialog.confirm({ title: 'Pause Assessment', message: 'Are you sure you want to pause this assessment?', variant: 'warning', confirmText: 'Pause' })) return;

    try {
      const updated = await assessmentService.update(assessmentId, { status: 'closed' as any });
      setOpenMenuId(null);
      await syncAssessmentAfterStatusChange(assessmentId, updated);
    } catch (error) {
      console.error('Failed to pause assessment:', error);
      toast.error(`Couldn't pause assessment. ${friendlyErrorMessage(error, 'Please try again.')}`);
      setOpenMenuId(null);
    }
  };

  // Open the clone confirmation modal. The recruiter then publishes and
  // invites the new version's candidates manually via the normal invite flow.
  // If the lineage is already at MAX_ASSESSMENT_VERSIONS, show a max-reached
  // popup instead of opening the duplicate confirmation.
  const handleOpenCloneModal = async (assessment: any) => {
    /* First: the linked job version, read fresh — an Archived / Disabled one
       takes no new version, whatever the menu could see when it opened. */
    const jobLock = await checkAssessmentJobLock(assessment.jd_id);
    if (jobLock) {
      await dialog.alert({ title: 'Cannot duplicate this assessment', message: jobLock, variant: 'warning' });
      return;
    }
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
        message: `All ${MAX_ASSESSMENT_VERSIONS} versions are used (the maximum allowed): ${
          jobVersionRows(assessment, lineage)
            .slice()
            .sort((a: any, b: any) => (Number(a.version) || 1) - (Number(b.version) || 1))
            .map((v: any) => `V${Number(v.version) || 1} (${assessmentStatusLabel(v.status)})`)
            .join(', ')
        }. Archived versions count too — delete a version before duplicating again.`,
        variant: 'warning',
      });
      return;
    }
    const versionBlocked = latestVersionBlockedReason(assessment, lineage);
    if (versionBlocked) {
      await dialog.alert({ title: 'Cannot duplicate this version', message: versionBlocked, variant: 'warning' });
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
    const jobLock = await checkAssessmentJobLock(assessment?.jd_id);
    if (jobLock) {
      await dialog.alert({ title: 'Cannot revoke invites', message: jobLock, variant: 'warning' });
      return;
    }
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
      await Promise.all([reloadAssessments(), refreshInviteSurfaces(true)]);
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
      const updated = await assessmentService.publish(assessmentId);
      setOpenMenuId(null);
      await syncAssessmentAfterStatusChange(assessmentId, updated);
    } catch (error) {
      console.error('Failed to activate assessment:', error);
      toast.error(`Couldn't activate assessment. ${friendlyErrorMessage(error, 'Please try again.')}`);
      setOpenMenuId(null);
    }
  };

  /* Unarchive — the All Assessments table's and the details page's, as is:
     the dedicated /{id}/unarchive endpoint, which restores the status the
     assessment held right before it was archived, gated on the Archive
     permission, same toast. Archived rows get this instead of Activate. */
  const handleUnarchiveAssessment = async (assessmentId: string) => {
    if (!canDeleteAssessment) {
      toast.error('You do not have permission to unarchive assessments');
      return;
    }
    const unarchiveJobLock = await checkAssessmentJobLock(apiAssessments.find((a) => a.id === assessmentId)?.jd_id);
    if (unarchiveJobLock) {
      toast.error(unarchiveJobLock);
      setOpenMenuId(null);
      return;
    }
    try {
      const updated = await assessmentService.unarchive(assessmentId);
      toast.success('Assessment restored to Active');
      setOpenMenuId(null);
      await syncAssessmentAfterStatusChange(assessmentId, updated);
    } catch (error) {
      console.error('Failed to unarchive assessment:', error);
      toast.error(`Couldn't unarchive assessment. ${friendlyErrorMessage(error, 'Please try again.')}`);
      setOpenMenuId(null);
    }
  };

  // Archive assessment
  const handleArchiveAssessment = async (assessmentId: string) => {
    const target = apiAssessments.find((a) => a.id === assessmentId);
    const jobLock = await checkAssessmentJobLock(target?.jd_id);
    if (jobLock) {
      await dialog.alert({ title: 'Cannot archive this assessment', message: jobLock, variant: 'warning' });
      return;
    }
    if (!await confirmArchive({
      title: `${target?.jd_title || target?.title || 'Untitled'} - Assessment`,
      version: target?.version,
      createdAt: target?.created_at,
      durationMinutes: target?.duration_minutes,
    })) return;

    try {
      const updated = await assessmentService.archive(assessmentId);
      setOpenMenuId(null);
      await syncAssessmentAfterStatusChange(assessmentId, updated);
    } catch (error) {
      console.error('Failed to archive assessment:', error);
      toast.error(`Couldn't archive assessment. ${friendlyErrorMessage(error, 'Please try again.')}`);
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
  const refreshInviteSurfaces = async (silent = false) => {
    const pending: Promise<unknown>[] = [];
    if (showTrackInvitesModal && selectedAssessmentForTracking) {
      pending.push(
        loadTrackingInvitations(selectedAssessmentForTracking, trackingCurrentPage, trackingFilters, silent),
        loadTrackingInvitationSummary(selectedAssessmentForTracking),
      );
    }
    if (activeTab === 'invitation-status') {
      pending.push(loadAllInviteStatuses(silent));
    }
    // Cards and list rows carry per-assessment invitation counts. The silent
    // path (fired the instant an invite is minted) leaves this to the modal's
    // onClose reload so the page behind the popup does not flash.
    if (!silent) pending.push(reloadAssessments());
    await Promise.all(pending);
  };

  /* The Total Jobs list's rows (filter → one row per job), computed ABOVE the
     early returns below so the focus effect that reads them is a hook called
     on every render. Pure computations — their position changes nothing else. */
  /* The key every version of one job collapses onto. Extracted because the
     per-job totals below have to bucket by exactly the same rule the rows are
     built with — two copies of `jd_short_id || jd_id || __unlinked__` would be
     one edit away from a row whose counts belong to a different job.

     Declared HERE, above `filteredAssessments`; it is a pure helper, so its
     position is the only thing about it that matters to the row collapse below.

     The rule itself now lives at module scope as `jobLineageKey`, because the
     Send Invite picker groups its jobs by it too and a second copy of the
     expression was exactly the drift this comment warns about. */
  const lineageKeyOf = jobLineageKey;

  const jobSearchTerm = assessmentSearchQuery.trim().toLowerCase();
  const filteredAssessments = assessments.filter((assessment) => {
    /* Search: Job ID (JD-014) or Job Name only. */
    if (jobSearchTerm && !`${assessment.jd_short_id || ''} ${assessment.jd_title || ''}`.toLowerCase().includes(jobSearchTerm)) return false;
    if (activeTab === 'active' && assessment.status !== 'Active') return false;
    if (activeTab === 'draft' && assessment.status !== 'Draft') return false;
    if (activeTab === 'completed' && assessment.status !== 'Completed') return false;
    if (activeTab === 'archived' && assessment.status !== 'Archived') return false;

    if (filterType !== 'all' && assessment.type !== filterType) return false;
    if (filterCreatedBy !== 'all' && assessment.created_by_name !== filterCreatedBy) return false;
    // `created` is the YYYY-MM-DD date, so the range compares as plain strings.
    if (filterCreatedFrom && assessment.created < filterCreatedFrom) return false;
    if (filterCreatedTo && assessment.created > filterCreatedTo) return false;

    return true;
  });

  /* One row per job, picked and ordered by the Total Jobs rules in
     lib/utils/assessmentJobOrder (`collapseByLineage`: a draft never
     represents a job with a non-draft version; `orderTotalJobs`: latest
     publish first, stable otherwise). Shared with the assessment details
     page's Prev / Next, so the two cannot drift into different orders.
     `collapseByLineage` stays a local name for the Send Invite picker's
     call sites below. */
  const collapseByLineage = (list: typeof assessments) => collapseJobLineages(list);

  const collapsedAssessments = (() => {
    const ordered = orderTotalJobs(filteredAssessments);
    if (listSortBy === 'oldest') return [...ordered].reverse();
    if (listSortBy === 'newest') return ordered;
    const first = listSortBy === 'active' ? 'active' : 'draft';
    const isFirst = (a: (typeof ordered)[number]) => String(a.status ?? '').toLowerCase() === first;
    return [...ordered.filter(isFirst), ...ordered.filter((a) => !isFirst(a))];
  })();

  /* Open the Total Jobs list on a just-saved draft. Waits for the reload that
     brings the draft in, then: the job row that holds it (the row may stand
     for a published version of the same job), the page that row is on, its
     versions opened with the draft selected and the draft's job version
     expanded. `restoreScrollTargetRef` hands the scroll to the existing
     scroll-to-card effect, which waits for the panel's rows before scrolling
     to the selected version. One shot: cleared as soon as it is acted on. */
  useEffect(() => {
    // Total Jobs only: the job list with View Versions is what it opens.
    if (!pendingFocusAssessmentId || isLoading || activeTab !== 'jobs') return;
    const target = assessments.find((a) => a.id === pendingFocusAssessmentId);
    if (!target) return; // not loaded yet — this re-runs as the list lands
    const key = lineageKeyOf(target);
    const index = collapsedAssessments.findIndex((row) => lineageKeyOf(row) === key);
    // Acting on a one-shot request the list just made possible; not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingFocusAssessmentId(null);
    if (index < 0) return;
    const row = collapsedAssessments[index];
    setPageView('list');
    setAssessmentCurrentPage(Math.floor(index / assessmentItemsPerPage) + 1);
    setOpenVersionsFor(row.id);
    if (row.jd_id) {
      const jdId = row.jd_id;
      setSelectedAssessmentVersionByJob((current) => ({ ...current, [jdId]: String(target.id) }));
      /* Expand the draft's JOB version once the job's lineage names its
         number (see the effect below) — the record's own `jd_version` is a
         snapshot that reads 1 for later versions, so it is only a fallback. */
      if (target.jd_id) {
        setPendingFocusExpand({
          rowJdId: jdId,
          draftJdId: String(target.jd_id),
          fallback: (target as { jd_version?: number }).jd_version,
        });
      }
      void loadAssessmentLineage(jdId);
      jdLineage.ensureLoaded(jdId, jdId);
    }
    restoreScrollTargetRef.current = String(row.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFocusAssessmentId, isLoading, activeTab, assessments, collapsedAssessments]);

  /* The second half of the focus: expand the job version the draft belongs
     to, once its number is known — from the versions this page has already
     resolved, else the job's lineage as it lands. If the lineage arrives and
     does not list it, the record's snapshot is the last resort. */
  useEffect(() => {
    if (!pendingFocusExpand) return;
    const { rowJdId, draftJdId, fallback } = pendingFocusExpand;
    const lineage = jdLineage.lineages[rowJdId];
    const fromLineage = lineage?.find((v) => v.id === draftJdId)?.version_number;
    const version = jobVersionByJdIdRef.current.get(draftJdId) ?? fromLineage ?? (lineage ? fallback : undefined);
    if (version === undefined) return; // lineage still loading
    setPendingFocusExpand(null);
    setExpandedJobVersionsByJob((current) => ({
      ...current,
      [rowJdId]: Array.from(new Set([...(current[rowJdId] ?? []), version])),
    }));
  }, [pendingFocusExpand, jdLineage.lineages]);

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
            if (!canUpdateAssessment) return;
            // Keep details view open, modal will overlay on top
            handleEditAssessment(selectedAssessmentForDetails);
          }}
          onPreview={() => {
            // Keep details view open, modal will overlay on top
            setSelectedAssessmentForPreview(selectedAssessmentForDetails);
            setShowPreviewModal(true);
          }}
          onShare={() => {
            // Keep details view open; THE invite popup overlays it.
            void openAssessmentInvite(selectedAssessmentForDetails);
          }}
          canShare={isTenantAdmin || hasPermissionCode('assessments:share')}
          canEdit={canUpdateAssessment}
          onViewResults={() => {
            setShowDetailsView(false);
            setSelectedAssessmentForResults(selectedAssessmentForDetails);
            setShowResults(true);
          }}
          onRefresh={reloadAssessments}
        />

        {/* Modals - rendered as overlays on top of details view */}
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


  // Everyone who has created one of the loaded assessments, for the filter list.
  const assessmentCreators = Array.from(
    new Set(assessments.map((a) => a.created_by_name).filter(Boolean))
  ).sort();

  const assessmentFilterCount = assessmentListSearch.activeFilterCount;
  const assessmentFiltersActive = assessmentListSearch.filtersApplied;
  const assessmentListNarrowed = assessmentListSearch.isNarrowed;
  const clearAssessmentFilters = assessmentListSearch.reset;


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
   * candidate records (`completedCandidatesByAssessment`). Null - drawn as a
   * placeholder - until every term has landed, rather than a provisional sum
   * of the row's `completed_count`, a different counter that the figure then
   * jumped away from. A recount keeps the previous figure meanwhile, and only
   * an assessment the loader could not count falls back to `completed_count`.
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
      const count = completedCandidatesByAssessment[assessmentId]
        ?? previousCompletedCandidates[assessmentId]
        ?? (uncountedCompletedIds.has(assessmentId) ? listedCount : undefined);
      if (count === undefined) return null;
      total += count;
    }
    return total;
  };

  /**
   * How many versions this job has — the figure the row prints beside Layers.
   *
   * MUST equal the "Job Versions (N)" heading of the panel that opens beneath
   * it. Two things used to break that:
   *
   *   1. the panel drops DRAFT job versions when `hideDraftJobVersions` is set
   *      (it is, outside select mode), while this counted the raw lineage — a
   *      job with a draft read "3 Job Versions" above a panel listing 2;
   *   2. the lineage it counted was whatever had loaded, so the same row could
   *      answer differently before and after the panel was opened.
   *
   * So the count now comes from /jd/version-counts, which answers both
   * readings for every job on the page in one request, and `includeDrafts` is
   * passed the same flag the panel is given. The lineage (filtered the same
   * way) is the fallback while that is in flight, and the highest known
   * version number only if neither is available.
   */
  const getJobVersionCount = (
    assessment: { id: string; jd_id?: string; jd_short_id?: string; jd_version?: number },
    includeDrafts = false,
  ) => {
    /* The Job List's panel lists only job versions with an assessment
       (`hideJobVersionsWithoutAssessments`), so its figure is counted the way
       that panel decides: the job's assessments resolved to their job
       version, plus the backend's per-version index, Draft versions out. */
    if (!includeDrafts) return getJobVersionsWithAssessmentCount(assessment);
    const counts = assessment.jd_id ? jdLineage.versionCounts[assessment.jd_id] : undefined;
    if (counts) return includeDrafts ? counts.total : counts.active;

    const rows = getJobLineageRows(assessment);
    if (rows?.length) {
      if (includeDrafts) return rows.length;
      /* Same test the panel filters by, so the fallback cannot disagree with
         it either: the DISPLAYED status, not the raw one. */
      const visible = rows.filter(
        (row) => jobVersionDisplayStatus(row.status, row.current_version) !== 'Draft',
      );
      return visible.length || rows.length;
    }
    return getLatestJobVersion(assessment);
  };

  /**
   * How many of this job's versions have an assessment — the Job List row's
   * Job Versions figure, equal to the "Job Versions (N)" its panel lists.
   *
   * The panel's own test (`hasAssessment` in AssessmentVersionHistoryPanel),
   * over the same data: an assessment counts for the job version its JD row
   * (`jd_id`) resolves to through the lineage, falling back to its
   * `jd_version`; a lineage version the jds-with-assessments index names
   * counts too. Assessments are read from the job's fetched lineage AND the
   * page's whole loaded set, so the figure is right before the panel opens.
   * Versions are counted by NUMBER, as the panel groups them, and a version
   * the lineage shows as Draft is left out, as the panel leaves it out.
   *
   * Null - drawn as a placeholder - while the job's lineage is still in
   * flight: without it every assessment falls back to its `jd_version`, so the
   * row read "1" and then jumped to the real figure. A lineage that FAILED is
   * cached as an empty list (see `getJobLineageRows`), which counts as landed,
   * so a failure falls through to that fallback rather than waiting forever.
   */
  const getJobVersionsWithAssessmentCount = (
    assessment: { id: string; jd_id?: string; jd_short_id?: string; jd_version?: number },
  ) => {
    if (
      assessment.jd_id
      && getJobLineageRows(assessment) === undefined
      && jdLineage.lineages[assessment.jd_id] === undefined
      && jdLineage.filterLineages[assessment.jd_short_id || assessment.jd_id] === undefined
    ) {
      return null;
    }
    const lineageRows = getJobLineageRows(assessment) ?? [];
    const versionByJdId = new Map<string, number>();
    const draftVersions = new Set<number>();
    const seenVersions = new Set<number>();
    for (const row of lineageRows) {
      const number = row.version_number ?? 1;
      versionByJdId.set(row.id, number);
      /* First entry for a number decides its status, as in the panel. */
      if (seenVersions.has(number)) continue;
      seenVersions.add(number);
      if (jobVersionDisplayStatus(row.status, row.current_version) === 'Draft') draftVersions.add(number);
    }
    const versions = new Set<number>();
    const addFor = (jdId?: string, jdVersion?: number) => {
      const byId = jdId ? versionByJdId.get(jdId) : undefined;
      const resolved = byId ?? (typeof jdVersion === 'number' ? jdVersion : undefined);
      if (resolved !== undefined) versions.add(resolved);
    };
    const key = lineageKeyOf(assessment);
    for (const row of (assessment.jd_id ? assessmentLineages[assessment.jd_id] : undefined) ?? []) {
      addFor(row.jd_id, row.jd_version);
    }
    for (const loaded of assessments) {
      if (lineageKeyOf(loaded) === key) addFor(loaded.jd_id, loaded.jd_version);
    }
    for (const row of lineageRows) {
      if (jdsWithAssessments.has(row.id)) versions.add(row.version_number ?? 1);
    }
    for (const draft of draftVersions) versions.delete(draft);
    return versions.size;
  };

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
    /* Whether Draft job versions count — the picker's panel lists them, the
       Job List's does not. Passed through from the row so the figure always
       describes the panel that opens under it. */
    includeDraftJobVersions = false,
  ) => {
    const totals = totalsByLineage.get(lineageKeyOf(assessment))
      ?? { assessments: 0, invitations: 0, completed: 0 };
    return [
      { key: 'job-versions', icon: Layers, iconClass: 'text-brand-blue', value: getJobVersionCount(assessment, includeDraftJobVersions), label: 'Job Versions' },
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
      className={`@container/job-row relative p-3 sm:p-4 ${
        /* Card view: the open version history is a wide table — give it the whole row. */
        !selectMode && listDisplayMode === 'grid' && openVersionsFor === assessment.id ? 'col-span-full' : ''
      } bg-white dark:bg-slate-900 rounded-xl border ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 transition-all duration-150 ${
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
          {(() => {
            /* The linked job's own Disabled / Archived / Draft status, judged
               on the whole job — the AI Interview card's badge. */
            const kind = assessment.jd_id
              ? jobLockBadgeFor(jobVersionStatusById[assessment.jd_id], jobLineageById[assessment.jd_id])
              : null;
            return kind ? <AssessmentJobStatusBadge kind={kind} /> : null;
          })()}
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
        {/* An opened card spans the full row (col-span-full), so it takes the
            list layout: one row of four metrics, not a 2 x 2 block. */}
        <div className={!selectMode && listDisplayMode === 'grid' && openVersionsFor !== assessment.id
          ? 'grid grid-cols-2 gap-x-2 gap-y-3'
          : 'grid grid-cols-2 gap-x-2 gap-y-3 sm:grid-cols-4 sm:gap-x-0 sm:gap-y-0 @4xl/job-row:flex-1 @4xl/job-row:min-w-0'}>
          {/* `selectMode` is exactly what the panel below is given as
              `hideDraftJobVersions`, so the row's Job Versions figure and the
              panel's "Job Versions (N)" heading count the same versions. */}
          {getJobRowMetrics(assessment, totals, selectMode).map(({ key, icon: MetricIcon, iconClass, value, label }) => (
            <div
              key={key}
              className={!selectMode && listDisplayMode === 'grid' && openVersionsFor !== assessment.id
                ? 'min-w-0'
                : 'min-w-0 sm:px-3 sm:border-l sm:border-gray-100 dark:sm:border-slate-700/60 sm:first:border-l-0 sm:first:pl-0'}
            >
              <div className="flex items-center gap-1.5">
                <MetricIcon className={`w-4 h-4 flex-shrink-0 ${iconClass}`} />
                {/* Null while the figure is still resolving - the same "..." the
                    stat cards above show, rather than a provisional number. */}
                <span className="text-sm font-semibold text-gray-900 dark:text-slate-50">{value ?? '...'}</span>
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
            /* Gated on the JOB's completed candidates (`getJobCompletedCandidates`,
               the same figure the row's own Completed tile shows), not on
               invitations: a job can be fully shared with nobody having
               finished it yet, in which case the results page is still empty. */
            const completedCount = getJobCompletedCandidates(assessment);
            const hasCompleted = (completedCount ?? 0) > 0;
            const reason = hasCompleted
              ? 'View results'
              : hasBeenShared
                ? 'No candidates have completed this assessment yet'
                : assessment.status === 'Draft'
                  ? 'Publish the assessment to view results'
                  : 'Share the assessment to view results';
            return (
              <Button
                variant="secondary"
                size="sm"
                disabled={!hasCompleted}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!hasCompleted) return;
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
                icon={<BarChart className={`w-3.5 h-3.5${hasCompleted ? ' text-menu-icon-score' : ''}`} />}
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
        /* On the Active / Draft / Archived pills the panel lists only that
           status, like the rows it opens from - not the job's whole history,
           which put Active and Draft versions on the Archived pill. All, Total
           Jobs and the Send Invite picker keep every version. */
        const panelStatus = selectMode ? undefined : (
          activeTab === 'active' ? 'published'
            : activeTab === 'draft' ? 'draft'
              : activeTab === 'archived' ? 'archived'
                : undefined
        );
        const lineageRows = assessmentLineages[jdId] ?? getOptimisticAssessmentRows(jdId);
        const displayedRows = panelStatus
          ? lineageRows.filter((v: any) => String(v.status || 'draft').toLowerCase() === panelStatus)
          : lineageRows;
        const hasRowsToShow = !!assessmentLineages[jdId] || displayedRows.length > 0;
        /* The Send Invite picker's eye on a version row: a read-only preview
           over the picker (see `previewAssessmentInPicker`). */
        const viewAssessmentVersion = (version: { id: string }) => {
          const raw = displayedRows.find((v) => v.id === version.id);
          if (!raw) return;
          previewAssessmentInPicker(mapAssessmentFromApi(raw, 0));
        };
        return (
        <div onClick={(e) => e.stopPropagation()}>
          <AssessmentVersionHistoryPanel
            jobVersions={jdLineage.lineages[assessment.jd_id]}
            jobVersionDetails={jdLineage.versionDetails}
            assessments={displayedRows}
            /* The backend's per-version "has an assessment" index,
               read beside the rows - see the prop for why both. */
            /* Not on a status pill: the index knows a version has SOME
               assessment, not one of this status, so it would keep job
               versions listed with nothing under them. */
            jdsWithAssessments={panelStatus ? undefined : jdsWithAssessments}
            loading={!hasRowsToShow && (!!loadingLineages[assessment.jd_id] || jdLineage.isLoading(assessment.jd_id))}
            currentAssessmentId={assessment.id}
            latestJobVersion={getLatestJobVersion(assessment)}
            /* Total Jobs lists published/active job versions only - a
               Draft version is hidden here, not changed. Send Invite
               (selectMode) keeps its own listing as it was. */
            hideDraftJobVersions={!selectMode}
            /* ...and only the job versions an assessment was created
               for: a version without one is left out rather than
               shown with an empty action slot. Send Invite keeps
               its own listing. */
            hideJobVersionsWithoutAssessments={!selectMode}
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
            /* No `onCreateAssessment`: Total Jobs does not create assessments.
               A job version with an assessment shows View Assessment; one
               without shows nothing in that slot. */
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
                  className="h-8 w-8 flex items-center justify-center bg-white dark:bg-slate-900 text-brand-blue border border-brand-blue/40 rounded-md hover:bg-brand-blue/10 hover:border-brand-blue transition-all flex-shrink-0"
                  aria-label="View job version details"
                  title="View job version details"
                >
                  <Eye className="w-4 h-4" />
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
                /* View Details: the assessment details page, not a popup. */
                renderAssessmentRowMenuItems(mapped, () => openAssessmentDetailsPage(version.id)),
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
  /* The Total Assessed card's big number is `candidatesAssessed` — the
     attempt count the Results tab lists row by row, like every other card
     matches its tab. Its pill counts PEOPLE: one per candidate email, however
     many assessments they took. Undefined while an older backend doesn't send
     the unique figure, and the pill is then hidden. */
  const uniqueCandidatesAssessed =
    stats.total_unique_candidates
    ?? (completedCandidates.length > 0 ? countCandidateEmails(completedCandidates) : uniqueEmailsAssessed);

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
  /* All / Active / Draft / Archived always draw the flat table. */
  const showFlatAssessmentTable = isFlatAssessmentTab(activeTab);
  const activeTabOwnsListContent =
    showFlatAssessmentTable ||
    ['completed-candidates', 'invitation-status', 'audit', 'settings'].includes(activeTab);

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
    'h-8 w-8 flex items-center justify-center bg-white dark:bg-slate-900 border rounded-md transition-all';

  /* `variant` is the trigger's chrome, not its behaviour:
       'default' — the borderless 32px button the Job List row carries;
       'compact' — the 32px bordered square the Assessment Versions table's
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
              const spaceBelow = window.innerHeight - rect.bottom;
              /* 'compact' lists every option, so it opens on whichever side
                 has more room rather than flipping up into a shorter one. */
              setMenuDropUp(
                variant === 'compact'
                  ? spaceBelow < 320 && rect.top > spaceBelow
                  : spaceBelow < 280,
              );
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
          <MoreVertical className={variant === 'compact' ? 'w-4 h-4' : 'w-4 h-4 text-gray-600'} />
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
               go stale while it is open.

               'compact' (the Assessment Versions table) shows
               every option: rows tightened to 2rem (py-1.5 + a
               1.25rem text-sm line) and dividers to my-0.5, set
               here on the container so the shared items keep
               their own classes. Its height is capped at the room
               between the trigger and the viewport edge (8px
               clear), so it never runs off screen; only past that
               does it scroll, inside the menu, with overscroll
               contained so reaching the end does not chain into
               the page. */
            className={`fixed w-52 max-w-[calc(100vw-1rem)] bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-[9999] overflow-y-auto ${
              variant === 'compact'
                ? 'overscroll-contain scroll-smooth [&>button]:py-1.5 [&>div]:my-0.5'
                : 'max-h-[70dvh]'
            }`}
            style={{
              top: menuDropUp ? undefined : menuAnchor.bottom + 4,
              bottom: menuDropUp ? Math.max(8, window.innerHeight - menuAnchor.top + 4) : undefined,
              maxHeight: variant === 'compact'
                ? Math.max(
                    96,
                    menuDropUp
                      ? menuAnchor.top - 4 - 8
                      : window.innerHeight - menuAnchor.bottom - 4 - 8,
                  )
                : undefined,
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
            {(() => {
              // Gating computed FRONT-END, on the lineage this page has
              // actually loaded, so it does not depend on which of the
              // backend's clone_* flags a deployment happens to return.
              // Two reasons to disable, and only two:
              //   1. Draft → must publish this version first.
              //   (added) Not invited → this version is still editable.
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
              // Judged on THIS version's own invitations (revoked ones count):
              // a published version nobody was invited to is still editable,
              // so it is edited, not duplicated.
              const notInvited = (assessment.invitations_count || 0) === 0;
              const versionBlocked = latestVersionBlockedReason(assessment);
              const jobLocked = jobLockReason(assessment);
              const buttonDisabled = !canCreateAssessment || !!jobLocked || isDraft || notInvited || capReached || !!versionBlocked;
              const disabledReason = !canCreateAssessment
                ? 'You do not have permission to create assessments'
                : jobLocked
                ? jobLocked
                : isDraft
                ? 'Publish the assessment before duplicating.'
                : notInvited
                ? 'No candidates invited yet — edit this version instead.'
                : versionBlocked
                ? versionBlocked
                : capReached
                ? `Maximum ${MAX_ASSESSMENT_VERSIONS} versions reached — archived versions count too.`
                : '';
              return (
                <button
                  onClick={() => {
                    if (buttonDisabled) return;
                    setOpenMenuId(null);
                    handleOpenCloneModal(assessment);
                  }}
                  disabled={buttonDisabled && canCreateAssessment}
                  aria-disabled={buttonDisabled}
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
              const revokeJobLocked = jobLockReason(assessment);
              const revokeDisabled = !canUpdateAssessment || !!revokeJobLocked || !hasInvites || alreadyRevoked;
              const revokeReason = !canUpdateAssessment
                ? 'You do not have permission to edit assessments'
                : revokeJobLocked
                ? revokeJobLocked
                : !hasInvites
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
                  disabled={revokeDisabled && canUpdateAssessment}
                  aria-disabled={revokeDisabled}
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
                to archive. Archived is restored through
                Unarchive, not Activate - the All Assessments
                table's and details page's action. */}
            {assessment.status === 'Archived' && (() => {
              const unarchiveJobLocked = jobLockReason(assessment);
              const unarchiveOff = !canDeleteAssessment || !!unarchiveJobLocked;
              return (
              <button
                onClick={() => {
                  if (unarchiveOff) return;
                  handleUnarchiveAssessment(assessment.id);
                }}
                aria-disabled={unarchiveOff}
                title={!canDeleteAssessment ? 'You do not have permission to unarchive assessments' : (unarchiveJobLocked ?? '')}
                className={`group w-full px-4 py-2.5 text-left text-sm flex items-center gap-2 transition-colors ${
                  unarchiveOff ? 'text-gray-400 cursor-not-allowed opacity-60' : 'text-gray-700 dark:text-slate-300'
                }`}
              >
                <ArchiveRestore className={`w-4 h-4 flex-shrink-0 ${unarchiveOff ? 'text-gray-300' : 'text-menu-icon-archive'}`} />
                <span className={MENU_ITEM_SCALE_CLASS}>Unarchive</span>
              </button>
              );
            })()}
            {assessment.status !== 'Active' && assessment.status !== 'Draft' && assessment.status !== 'Archived' && (
              <button
                onClick={() => {
                  if (!canUpdateAssessment) return;
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
            {assessment.status !== 'Archived' && assessment.status !== 'Draft' && (() => {
            const archiveJobLocked = jobLockReason(assessment);
            const archiveOff = !canDeleteAssessment || !!archiveJobLocked;
            return (
            <button
              onClick={() => {
                if (archiveOff) return;
                handleArchiveAssessment(assessment.id);
              }}
              aria-disabled={archiveOff}
              title={!canDeleteAssessment ? 'You do not have permission to archive assessments' : (archiveJobLocked ?? '')}
              className={`group w-full px-4 py-2.5 text-left text-sm flex items-center gap-2 ${
                archiveOff
                  ? 'text-gray-400 cursor-not-allowed opacity-60'
                  : 'text-gray-700'
              }`}
            >
              <Archive className="w-4 h-4 text-menu-icon-archive flex-shrink-0" />
              <span className={MENU_ITEM_SCALE_CLASS}>Archive</span>
            </button>
            );
            })()}
            {assessment.status !== 'Archived' && (
              <div className="border-t border-gray-100 dark:border-slate-700/60 my-1"></div>
            )}
            {assessment.status !== 'Archived' && (() => {
              const hasCandidates = assessment.invitations_count > 0;
              const deleteJobLocked = jobLockReason(assessment);
              const isDisabled = !canDeleteAssessment || !!deleteJobLocked || hasCandidates;
              const disabledReason = !canDeleteAssessment
                ? 'You do not have permission to delete assessments'
                : deleteJobLocked
                  ? deleteJobLocked
                : hasCandidates
                  ? 'Cannot delete — candidates have already been invited to this assessment'
                  : '';
              return (
                <button
                  onClick={() => {
                    if (isDisabled) return;
                    handleDeleteAssessment(assessment.id);
                  }}
                  disabled={isDisabled && canDeleteAssessment}
                  aria-disabled={isDisabled}
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
  /* The flat tabs' (All / Active / Draft / Archived) extra ⋮ items: what the
     same assessment's row offers on Total Jobs (`renderAssessmentRowMenuItems`
     + the menu's Duplicate and Revoke), with the SAME rules and handlers, built
     as data for the flat table's menu, for every status. View, View Results,
     Archive / Unarchive and Delete are the table's own. */
  const buildFlatTabExtraActions = (raw: AssessmentResponse): { main: AssessmentRowAction[]; more: AssessmentRowAction[] } => {
    const assessment = mapAssessmentFromApi(raw, 0);
    const invitationsSent = assessment.invitations_count ?? assessment.candidates ?? 0;
    const hasBeenShared = invitationsSent > 0;
    const version = assessment.version ?? 1;
    const isDraft = assessment.status === 'Draft';
    const isArchived = assessment.status === 'Archived';

    // Edit — open until an invitation has gone out. The version cap does not
    // apply: republishing a never-invited version keeps its number (the
    // backend only mints a new one once candidates were invited).
    const editReason = !canUpdateAssessment
      ? 'You do not have permission to edit assessments'
      : jobLockReason(assessment)
        ? jobLockReason(assessment)!
      : hasBeenShared
        ? 'Cannot edit — this assessment has already been sent to candidates'
      : isArchived
        ? 'Archived assessments cannot be edited'
        : '';
    // Share/Invite — a Draft has nothing published to send, an Archived one is
    // out of circulation, and revoked invites seal it until duplicated.
    const canShare = isTenantAdmin || hasPermissionCode('assessments:share');
    const shareReason = !canShare
      ? 'You do not have permission to share assessments'
      : jobLockReason(assessment)
        ? jobLockReason(assessment)!
      : isDraft
        ? 'Publish assessment first to share'
      : isArchived
        ? 'Archived assessments cannot be shared'
      : assessment.has_revoked_invites
        ? 'Invites for this assessment have been revoked. Duplicate it to start fresh.'
        : '';
    // Duplicate — the Total Jobs menu's gates: published, invited, under the cap.
    const capReached = isVersionCapReached(assessment);
    const versionBlockedReason = latestVersionBlockedReason(assessment);
    const jobLockedReason = jobLockReason(assessment);
    const duplicateReason = !canCreateAssessment
      ? 'You do not have permission to create assessments'
      : jobLockedReason
        ? jobLockedReason
      : isDraft
        ? 'Publish the assessment before duplicating.'
      : !hasBeenShared
        ? 'No candidates invited yet — edit this version instead.'
      : versionBlockedReason
        ? versionBlockedReason
      : capReached
        ? `Maximum ${MAX_ASSESSMENT_VERSIONS} versions reached — archived versions count too.`
        : '';
    // Revoke — once there are invites, and only once.
    const revokeReason = !canUpdateAssessment
      ? 'You do not have permission to edit assessments'
      : jobLockedReason
        ? jobLockedReason
      : !hasBeenShared
        ? 'No invites have been sent yet.'
        : assessment.has_revoked_invites
          ? 'Invites for this assessment have already been revoked.'
          : '';

    return {
      main: [
        {
          // A draft is unfinished — its Edit reads "Continue Editing".
          key: 'edit', label: isDraft ? 'Continue Editing' : 'Edit', icon: Pencil, iconClassName: 'text-menu-icon-edit',
          disabled: !!editReason, title: editReason || `${isDraft ? 'Continue editing' : 'Edit'} assessment V${version}`,
          run: () => handleEditAssessment(assessment),
        },
        {
          key: 'share', label: 'Share/Invite', icon: Send, iconClassName: 'text-menu-icon-share',
          disabled: !!shareReason, title: shareReason || 'Share via email',
          run: () => { void openAssessmentInvite(assessment); },
        },
        {
          key: 'track', label: 'Track', icon: Radar, iconClassName: 'text-menu-icon-secondary',
          disabled: !hasBeenShared,
          title: hasBeenShared ? `Track invitation status (${invitationsSent})` : 'Share the assessment to track invitations',
          run: () => handleTrackInvites(assessment),
        },
      ],
      more: [
        {
          key: 'duplicate', label: 'Duplicate', icon: Copy, iconClassName: 'text-menu-icon-download',
          disabled: !!duplicateReason, title: duplicateReason || undefined,
          run: () => void handleOpenCloneModal(assessment),
        },
        // Revoke — Active only, as on Total Jobs.
        ...(assessment.status === 'Active' ? [{
          key: 'revoke', label: 'Revoke pending invites', icon: Ban, iconClassName: '',
          destructive: true, disabled: !!revokeReason, title: revokeReason || undefined,
          run: () => handleOpenRevokeModal(assessment),
        }] : []),
      ],
    };
  };

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
      jobLockReason(assessment) ? jobLockReason(assessment)! :
      assessment.status === 'Draft' ? 'Publish assessment first to share' :
      assessment.status === 'Archived' ? 'Archived assessments cannot be shared' :
      assessment.has_revoked_invites ? 'Invites for this assessment have been revoked. Duplicate it to start fresh.' :
      '';
    const isShareBlocked = !!shareBlockedReason;
    const trackReason = hasBeenShared
      ? `Track invitation status (${invitationsSent})`
      : 'Share the assessment to track invitations';
    /* View Results is gated on the COMPLETED count, not invitations: an
       assessment can be shared with candidates who haven't finished it yet,
       in which case there's still nothing to show on the results page. */
    const hasCompleted = (assessment.completed_count ?? 0) > 0;
    const resultReason = hasCompleted
      ? 'View results'
      : hasBeenShared
      ? 'No candidates have completed this assessment yet'
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
          // At MAX_ASSESSMENT_VERSIONS, the next edit-and-republish would be
          // version 6 — the backend's publish_assessment hard-blocks that
          // (see talentflow-data-plane-backend/app/services/assessment.py).
          // Greyed like the other blocks below, but deliberately NOT folded
          // into `editDisabled` / the native `disabled` attribute: a disabled
          // button eats the click, so there'd be no way to find out WHY short
          // of hovering for the title tooltip. Same fix as the JD edit icon
          // (job-details/page.tsx) — the click is how a recruiter learns the
          // reason and stays clickable for it.
          // The cap no longer blocks Edit: a never-invited version keeps its
          // number when republished, so editing it never mints a version 6.
          const editJobLocked = jobLockReason(assessment);
          const editReason = !canUpdateAssessment
            ? 'You do not have permission to edit assessments'
            : editJobLocked
            ? editJobLocked
            : hasBeenShared
            ? 'Cannot edit — this assessment has already been sent to candidates'
            : assessment.status === 'Archived'
            ? 'Archived assessments cannot be edited'
            : '';
          const editDisabled = !canUpdateAssessment || !!editJobLocked || hasBeenShared || assessment.status === 'Archived';
          const editGreyed = editDisabled;
          /* A draft isn't finished yet, so its Edit reads "Continue Editing" -
             same action, same Configure page. Status is checked loosely: the
             job row passes the list's 'Draft', a version row the API's 'draft'. */
          const isDraftVersion = String(assessment.status || '').toLowerCase() === 'draft';
          const editLabel = isDraftVersion ? 'Continue Editing' : 'Edit';
          return (
            <button
              onClick={() => {
                if (editDisabled) return;
                setOpenMenuId(null);
                handleEditAssessment(assessment);
              }}
              disabled={editDisabled && canUpdateAssessment}
              aria-disabled={editDisabled}
              title={editReason || `${isDraftVersion ? 'Continue editing' : 'Edit'} assessment V${assessment.version ?? 1}`}
              className={itemClass(editGreyed)}
            >
              <Pencil className={iconClass(editGreyed, 'text-menu-icon-edit')} />
              <span className={MENU_ITEM_SCALE_CLASS}>{editLabel}</span>
            </button>
          );
        })()}

        {/* Share via Email. Every row in this table IS a created assessment;
            what decides whether it can be shared is unchanged: a Draft has
            nothing published to send, an Archived one is out of circulation,
            and one whose invites were revoked is sealed until duplicated. */}
        <button
          onClick={() => {
            if (!canShare || isShareBlocked) return;
            setOpenMenuId(null);
            void openAssessmentInvite(assessment);
          }}
          disabled={isShareBlocked && canShare}
          aria-disabled={isShareBlocked || !canShare}
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

        {/* View Results — gated on the completed count: with nobody finished
            yet (whether or not anyone has been invited) the results page
            would open empty. */}
        <button
          onClick={() => {
            if (!hasCompleted || assessment.status === 'Draft') return;
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
          disabled={!hasCompleted}
          title={resultReason}
          className={itemClass(!hasCompleted)}
        >
          <BarChart className={iconClass(!hasCompleted, 'text-menu-icon-score')} />
          <span className={MENU_ITEM_SCALE_CLASS}>View Results</span>
        </button>
      </>
    );
  };

  /* First load: a full-page skeleton (same shape as the AI Interviews page)
     until the stats are in, instead of a page of "..." placeholders. Remembered
     stats from an earlier visit skip it — `isLoadingStats` then starts false. */
  if (isLoadingStats) {
    return (
      <main className="flex-1 overflow-x-clip bg-slate-50">
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
            <Skeleton className="h-4 w-48 mb-4 md:mb-6" />
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3 lg:gap-4 mb-5">
              <div className="flex items-start gap-3 min-w-0">
                <Skeleton className="hidden sm:block h-9 w-9 rounded-lg shrink-0" />
                <div className="space-y-2">
                  <Skeleton className="h-6 w-56" />
                  <Skeleton className="h-4 w-80 max-w-full" />
                </div>
              </div>
              <div className="flex items-stretch gap-2 sm:gap-3 flex-wrap lg:flex-nowrap">
                <Skeleton className="h-9 w-36 rounded-lg" />
                <Skeleton className="h-9 w-32 rounded-lg" />
                <Skeleton className="h-9 w-40 rounded-lg" />
              </div>
            </div>
            {/* Stats cards */}
            <div className="grid gap-2.5 sm:gap-3 mb-5 sm:mb-8 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-brand-blue/15 bg-white px-3.5 py-3.5 sm:px-4 sm:py-4">
                  <div className="flex items-start gap-2.5">
                    <Skeleton className="h-9 w-9 rounded-xl shrink-0" />
                    <div className="min-w-0 space-y-1.5 flex-1">
                      <Skeleton className="h-3.5 w-20" />
                      <Skeleton className="h-6 w-10" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {/* Assessment rows */}
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="p-3 sm:p-4 bg-white rounded-xl border border-gray-300 shadow-sm shadow-brand-blue/5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
                    <div className="flex items-center gap-2.5 min-w-0 lg:w-[360px] lg:flex-shrink-0">
                      <Skeleton className="h-9 w-9 rounded-lg shrink-0" />
                      <Skeleton className="h-4 w-16 rounded-md shrink-0" />
                      <Skeleton className="h-4 w-40" />
                    </div>
                    <div className="flex-shrink-0 lg:w-[104px]">
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </div>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-3 sm:grid-cols-4 lg:flex-1 lg:min-w-0">
                      {Array.from({ length: 4 }).map((_, j) => (
                        <div key={j} className="space-y-1.5">
                          <Skeleton className="h-3 w-16" />
                          <Skeleton className="h-4 w-10" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main ref={rootRef} className="flex-1 overflow-x-clip bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
        <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'AI Assessments' }]} />
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-5">
          <div className="flex items-start gap-3">
            <div className="hidden sm:flex w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 items-center justify-center shrink-0">
              <ClipboardList className="w-4 h-4 text-brand-blue" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg lg:text-xl text-gray-900 dark:text-slate-50 mb-0.5 tracking-tight font-semibold">Assessment Management</h1>
              <p className="text-xs lg:text-sm text-gray-600 dark:text-slate-400">
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
            {/* RBAC: always shown; greyed with a tooltip without access. */}
            <Button
              variant="secondary"
              size="md"
              onClick={() => {
                if (!canAccessHRQuestionBank) return;
                // Tells the question bank which module to name in its breadcrumb.
                try { sessionStorage.setItem('questionBankSource', 'assessments'); } catch { /* ignore */ }
                router.push('/recruitment/hr-question-bank');
              }}
              aria-disabled={!canAccessHRQuestionBank}
              title={!canAccessHRQuestionBank ? 'You do not have permission to access the HR Question Bank' : undefined}
              icon={<ClipboardList className="w-4 h-4" />}
              className={`${!canAccessHRQuestionBank ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span className="hidden sm:inline">HR Question Bank</span>
              <span className="sm:hidden">Questions</span>
            </Button>
            {/* Send Invite — opens THE invite popup with no job, so it starts on
                its own picker of every published assessment (the AI Interviews
                page's Send Invite does the same). Gated on the permission the
                server checks for sending (`assessments:invite`); greyed with a
                tooltip, never hidden. */}
            <Button
              variant="secondary"
              size="md"
              onClick={() => {
                if (!canInviteFromStatusTab) return;
                openInviteDialog({
                  kind: 'assessment',
                  /* Opened from a job's Assessments page: start on that job. */
                  job: preSelectedJdId && preSelectedJdTitle
                    ? { jdId: preSelectedJdId, jdTitle: preSelectedJdTitle }
                    : undefined,
                  onSent: () => {
                    void reloadAssessments();
                    void refreshInviteSurfaces();
                  },
                });
              }}
              aria-disabled={!canInviteFromStatusTab}
              title={
                !canInviteFromStatusTab
                  ? 'You do not have permission to invite candidates'
                  : 'Send an assessment invitation'
              }
              icon={<Mail className="w-4 h-4" />}
              className={`${!canInviteFromStatusTab ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span className="hidden sm:inline">Send Invite</span>
              <span className="sm:hidden">Invite</span>
            </Button>
            {onOpenCandidateView && (
              <Button variant="secondary" size="md" onClick={onOpenCandidateView} icon={<Eye className="w-4 h-4" />} >
                Preview Candidate View
              </Button>
            )}
            <Button
              variant="primary"
              size="md"
              onClick={() => {
                if (!canCreateAssessment) return;
                handleOpenCreation();
              }}
              // Same "units left" as the badge and the header (shared quota).
              disabled={asUnitsExhausted}
              aria-disabled={!canCreateAssessment}
              title={!canCreateAssessment ? 'You do not have permission to create assessments' : (asUnitsExhausted ? 'No assessment units available' : '')}
              icon={<Sparkles className="w-4 h-4" />}
              className={`${!canCreateAssessment ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span className="hidden sm:inline">Create AI Assessment</span>
                <span className="sm:hidden">Create</span>
              </Button>
          </div>
        </div>

        {/* Low Quota Warning Banner */}
        {isQuotaPlanActive && !isUnlimited && availableUnits !== null && availableUnits > 0 && availableUnits <= 3 && (
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

        {/* Quota Exhausted Banner — active plan with a real limit and nothing left
            (an expired plan or one that reports no limit never shows it). */}
        {asUnitsExhausted && (
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
              Total Assessed      -> the Candidate Results tab, which lists the
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
          <StatsCardGrid columns={4}>
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
              label="Configured Jobs"
              value={isLoadingStats ? '...' : totalJobs.toLocaleString()}
              sparkline={false}
              onClick={() => openAssessmentsList('jobs')}
            >
              {/* The versions behind the job count: every assessment row is
                  one version of a job's assessment (Total Assessments). */}
              {!isLoadingStats && (
                <span className="mt-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 ring-1 ring-gray-200 dark:ring-slate-700">
                  {stats.total_assessments} {stats.total_assessments === 1 ? 'version' : 'versions'}
                </span>
              )}
            </StatsCard>
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
            >
              {!isLoadingStats && (
                <span className="mt-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 ring-1 ring-gray-200 dark:ring-slate-700">
                  {stats.total_assessments} {stats.total_assessments === 1 ? 'version' : 'versions'}
                </span>
              )}
            </StatsCard>
            <StatsCard
              tone="neutral"
              active={isOverviewCardActive('active')}
              showClickArrow
              icon={Globe}
              label="Active Assessments"
              value={isLoadingStats ? '...' : stats.active_assessments.toLocaleString()}
              sparkline={false}
              onClick={() => openAssessmentsList('active')}
            >
              {!isLoadingStats && (
                <span className="mt-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 ring-1 ring-gray-200 dark:ring-slate-700">
                  {stats.active_assessments} {stats.active_assessments === 1 ? 'version' : 'versions'}
                </span>
              )}
            </StatsCard>
            <StatsCard
              tone="neutral"
              active={isOverviewCardActive('completed-candidates')}
              showClickArrow
              icon={Users}
              label="Total Assessed"
              value={isLoadingStats ? '...' : candidatesAssessed.toLocaleString()}
              sparkline={false}
              onClick={() => openAssessmentsList('completed-candidates')}
            >
              {/* The people behind the attempt count, like the versions pill
                  under Configured Jobs. */}
              {!isLoadingStats && uniqueCandidatesAssessed !== undefined && (
                <span className="mt-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 ring-1 ring-gray-200 dark:ring-slate-700">
                  {uniqueCandidatesAssessed} {uniqueCandidatesAssessed === 1 ? 'candidate' : 'candidates'}
                </span>
              )}
            </StatsCard>
          </StatsCardGrid>
        </div>

        {pageView === 'list' && (
        <ListToolbarSlotProvider value={toolbarSlot.node}>
        <div ref={listSectionRef} className="scroll-mt-4" aria-hidden="true" />

        {/* No section heading above the search row - the pills already name
            the tab, and the count is the search row's "X of Y" badge. */}

        {/* One toolbar card, laid out like the Job Descriptions page's
            (components/JobsListing.tsx): search + More Filters on top, a rule,
            then the tab pills. The rule is the slot's bottom border, so a tab
            with no toolbar (Settings) leaves no stray line above the pills;
            `[&>*:last-child:not(:first-child)]:mb-3` spaces an open filter
            panel (or the match line) off that rule the way the toolbar row's
            own mb-3 already does when it is alone. */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 p-3 sm:p-4 mb-4">

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
        <ListToolbarSlot ref={toolbarSlot.ref} className="mb-3 [&>*:last-child:not(:first-child)]:mb-3" />

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
                searchPlaceholder="Search by job name or job ID..."
                onToggleFilters={() => setShowAssessmentFilters(!showAssessmentFilters)}
                filtersOpen={showAssessmentFilters}
                activeFilterCount={assessmentFilterCount}
                filtersApplied={assessmentFiltersActive}
                onClearFilters={clearAssessmentFilters}
                className="mb-0"
                /* The page-wide List / Card switch, pinned far right. */
                trailing={<ListViewToggle value={listDisplayMode} onChange={setListDisplayMode} />}
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
                    <div>
                      <label htmlFor="assessment-type" className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                        Type
                      </label>
                      <FilterSelect
                        id="assessment-type"
                        value={filterType}
                        onChange={(v) => assessmentListSearch.setFilter('type', v as typeof filterType)}
                        options={[
                          { value: 'all', label: 'All types' },
                          { value: 'Technical', label: 'Technical' },
                          { value: 'Behavioral', label: 'Behavioral' },
                          { value: 'Aptitude', label: 'Aptitude' },
                        ]}
                        className="w-full sm:w-full min-w-0 py-2 sm:py-2 pl-3 sm:pl-3 pr-3 sm:pr-3 rounded-lg sm:rounded-lg text-black dark:text-slate-100"
                      />
                    </div>

                    <div>
                      <label htmlFor="assessment-creator" className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                        Created by
                      </label>
                      <FilterSelect
                        id="assessment-creator"
                        value={filterCreatedBy}
                        onChange={(v) => assessmentListSearch.setFilter('createdBy', v)}
                        options={[
                          { value: 'all', label: 'Anyone' },
                          ...assessmentCreators.map((name) => ({ value: String(name), label: String(name) })),
                        ]}
                        className="w-full sm:w-full min-w-0 py-2 sm:py-2 pl-3 sm:pl-3 pr-3 sm:pr-3 rounded-lg sm:rounded-lg text-black dark:text-slate-100"
                      />
                    </div>

                    <div>
                      <label htmlFor="assessment-created-from" className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                        Created from
                      </label>
                      <DateField
                        id="assessment-created-from"
                        value={filterCreatedFrom}
                        max={filterCreatedTo || undefined}
                        onChange={(v) => assessmentListSearch.setFilter('createdFrom', v)}
                        className="min-w-0"
                      />
                    </div>

                    <div>
                      <label htmlFor="assessment-created-to" className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                        Created to
                      </label>
                      <DateField
                        id="assessment-created-to"
                        value={filterCreatedTo}
                        min={filterCreatedFrom || undefined}
                        onChange={(v) => assessmentListSearch.setFilter('createdTo', v)}
                        className="min-w-0"
                      />
                    </div>
                </ListFilterPanel>
              )}

              {assessmentListNarrowed && !isLoading && (
                <p className="mt-3 text-sm text-gray-600 dark:text-slate-400">
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
            `px-3 py-1.5 rounded-lg text-sm transition-all` pill,
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
            { key: 'jobs', label: 'Configured Jobs', short: 'Jobs', count: totalJobs },
            { key: 'all', label: 'All Assessments', short: 'All', count: stats.total_assessments },
            { key: 'active', label: 'Active', count: stats.active_assessments },
            { key: 'draft', label: 'Draft', count: stats.draft_assessments },
            { key: 'archived', label: 'Archived', count: stats.archived_assessments },
            { key: 'completed-candidates', label: 'Results', count: candidatesAssessed },
            { key: 'invitation-status', label: 'Invitation Status', short: 'Invites', count: stats.total_invitations },
            // Its own tab, beside Settings — as on the AI Interviews page. It
            // used to be an admin-only sub-tab inside Settings.
            { key: 'audit', label: 'Activity Logs', short: 'Activity' },
            { key: 'settings', label: 'Settings', icon: Shield },
          ] as const);

          /* Which tabs sit after the divider. Named by key rather than by
             position so reordering the list above cannot silently move the
             divider. */
          const AFTER_DIVIDER: readonly string[] = ['audit', 'settings'];
          /* Candidates and invitations — their own divided group between the
             assessment lists and Settings, as on the AI Interviews page. */
          const CANDIDATE_GROUP: readonly string[] = ['completed-candidates', 'invitation-status'];

          /* One pill class for the row — the tab pills and Clear Sort beside
             Settings — so the button sits at exactly Settings' size. */
          const TAB_PILL_CLASS = 'px-2.5 h-9 rounded-lg text-sm font-medium transition-all whitespace-nowrap inline-flex items-center gap-1.5';
          const TAB_PILL_IDLE_CLASS = 'bg-brand-blue/5 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/10 hover:text-brand-blue';
          const TAB_PILL_ICON_CLASS = 'w-3.5 h-3.5 sm:w-4 sm:h-4';

          const renderTabPill = (tab: (typeof TABS)[number]) => {
            const TabIcon = 'icon' in tab ? tab.icon : undefined;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                /* Same as the stat cards (and the AI Interviews tab pills):
                   switch tab AND scroll the list section to the top. A bare
                   setActiveTab left the page parked on the stat cards. */
                onClick={() => openAssessmentsList(tab.key)}
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
                {'count' in tab && (
                  /* Drawn while the stats load too (a pulsing placeholder the
                     size of a two-digit count), so the pills do not widen and
                     reflow the row when the numbers arrive. */
                  <span className={`px-1.5 py-0.5 rounded text-xs font-semibold tabular-nums ${
                    isActive ? 'bg-white/20 text-white' : 'bg-white text-brand-blue ring-1 ring-brand-blue/15 dark:bg-slate-800'
                  } ${isLoadingStats ? 'animate-pulse text-transparent' : ''}`}>
                    {isLoadingStats ? '00' : tab.count.toLocaleString()}
                  </span>
                )}
              </button>
            );
          };

          /* Sort by: every list tab. Results, invitations and the single-status
             tabs (Active / Draft / Archived) have no other status to float, so
             they get Newest / Oldest only. */
          const dateOnlySort = activeTab === 'completed-candidates' || activeTab === 'invitation-status'
            || activeTab === 'active' || activeTab === 'draft' || activeTab === 'archived';
          const showSortBy = activeTab === 'jobs' || showFlatAssessmentTable || dateOnlySort;

          const visibleTabs = TABS.filter((tab) => !('adminOnly' in tab && tab.adminOnly) || isTenantAdmin);

          return (
            <div className="flex items-center gap-1.5 flex-wrap">
              {visibleTabs.filter((tab) => !AFTER_DIVIDER.includes(tab.key) && !CANDIDATE_GROUP.includes(tab.key)).map(renderTabPill)}
              <div className="flex items-center gap-1.5 flex-wrap sm:ml-1 sm:border-l-2 sm:border-gray-400 dark:sm:border-slate-500 sm:pl-2">
                {visibleTabs.filter((tab) => CANDIDATE_GROUP.includes(tab.key)).map(renderTabPill)}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap sm:ml-1 sm:border-l-2 sm:border-gray-400 dark:sm:border-slate-500 sm:pl-2">
                {visibleTabs.filter((tab) => AFTER_DIVIDER.includes(tab.key)).map(renderTabPill)}
                {/* Clear Sort — All / Active / Draft / Archived, right after
                    Settings, in Settings' own pill styling. Shown only while
                    this tab's table is sorted off its default — the same
                    appear-when-there-is-something-to-undo rule as the
                    toolbar's Reset. Puts the sort back to its default and
                    nothing else: search and filters stay as they are. */}
                {showFlatAssessmentTable && sortedAssessmentTab === activeTab && (
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
              </div>
              {/* Sort by + Refresh are ONE unit pinned to the row's right
                  edge. As separate flex-wrap siblings, any extra width in the
                  pills (a longer count, a new tab) pushed Refresh down onto a
                  line of its own. Together they wrap as a pair or not at all,
                  and the "Sort by" word drops out below 2xl so the pair stays
                  narrow enough to share the pills' line. */}
              <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
              {showSortBy && (() => {
                const sortControl = (
                <div className="flex items-center gap-2">
                  <label htmlFor="assessment-sort" className="text-sm text-gray-700 dark:text-slate-300 font-medium whitespace-nowrap">Sort by</label>
                  <div className="inline-flex items-center bg-brand-blue/5 rounded-lg p-1 transition-all">
                    <Dropdown
                      id="assessment-sort"
                      ariaLabel="Sort by"
                      value={dateOnlySort ? (listSortBy === 'oldest' ? 'oldest' : 'newest') : listSortBy}
                      onChange={(v) => setListSortBy(v as typeof listSortBy)}
                      className="w-auto sm:w-auto data-[size=default]:h-7 sm:data-[size=default]:h-7 py-0 sm:py-0 pl-2.5 sm:pl-2.5 pr-2 sm:pr-2 bg-transparent dark:bg-transparent border-0 shadow-none rounded-md sm:rounded-md text-gray-700 dark:text-slate-300 font-medium"
                      options={[
                        { value: 'newest', label: 'Newest' },
                        { value: 'oldest', label: 'Oldest' },
                        ...(dateOnlySort ? [] : [
                          { value: 'active', label: 'Active first' },
                          { value: 'draft', label: 'Draft first' },
                        ]),
                      ]}
                    />
                  </div>
                </div>
                );
                return sortSlotEl ? createPortal(sortControl, sortSlotEl) : sortControl;
              })()}
              {/* Refresh — right corner of the pill row, on every tab, as on
                  the AI Interviews page. */}
              <Button
                variant="secondary"
                size="sm"
                onClick={handleRefreshCurrentTab}
                disabled={isRefreshingTab}
                title="Refresh"
                aria-label="Refresh"
                icon={<RefreshCw className={`w-3.5 h-3.5 ${isRefreshingTab ? 'animate-spin' : ''}`} />}
                className="flex-shrink-0 !h-9"
              >
                <span className="hidden 2xl:inline">{isRefreshingTab ? 'Refreshing...' : 'Refresh'}</span>
              </Button>
              </div>
            </div>
          );
        })()}
        {/* Actions (N) + Clear for ticked rows land on this third line. */}
        <div data-list-bulk-slot className="empty:hidden mt-3 flex flex-wrap items-center gap-2" />
        </div>

        {/* The list itself. Like the Job Descriptions page, the rows and
            tables sit straight on the page with their own borders — no outer
            box around them. Settings is a form, not a list, so it alone keeps
            the card. */}
        {/* min-height: keeps a short list (a few rows, an empty result) at
            least a screen tall. A tab click scrolls the toolbar card to the
            top; a list that loaded shorter than its skeleton shrank the page
            under that scroll and the browser snapped back to the stat cards. */}
        <div className={activeTab === 'settings' ? 'bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5' : 'min-h-[calc(100dvh-11rem)]'}>
          {/* Assessment List */}
          <div className={activeTab === 'settings' ? 'p-3 sm:p-6' : ''}>

            {/* The "Job List (25)" header stood here. Its treatment is what
                the tab pills now wear — label, then the figure in parentheses
                a shade lighter — and with the count in the pill this heading
                said the same number twice on the same screen, a few pixels
                apart: the lit pill reads "Total Jobs (25)" and this read "Job
                List (25)".

                So the pill keeps the count and the card starts at its rows,
                which is where All / Active / Draft already start since their
                own headings came off. */}

            {showFlatAssessmentTable && isFlatAssessmentTab(activeTab) ? (() => {
              const config = FLAT_ASSESSMENT_TABLE_CONFIG[activeTab];
              return (
                <AllAssessmentsTable
                  key={`assessment-list-${activeTab}`}
                  embedded
                  fixedStatus={config.fixedStatus}
                  clearSortSignal={clearAssessmentSortSignal}
                  sortPreset={activeTab === 'all' ? listSortBy : (listSortBy === 'oldest' ? 'oldest' : 'newest')}
                  onSortDefaultChange={(isDefault) => setSortedAssessmentTab(isDefault ? null : activeTab)}
                  /* Every flat tab: the same ⋮ items the row has on Total Jobs. */
                  extraRowActions={buildFlatTabExtraActions}
                  reloadSignal={flatTableReloadSignal}
                  displayMode={listDisplayMode}
                  onDisplayModeChange={setListDisplayMode}
                  /* The table's own Archive / Unarchive / Delete: re-read the
                     stat cards and the page's loaded set, which those actions
                     moved. Not `reloadAssessments` — the table has already
                     refetched its own rows. */
                  onMutated={() => {
                    void reloadStats();
                    void loadAssessmentsPage(assessmentCurrentPage);
                  }}
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

              const filteredResults = (listSortBy === 'oldest' ? [...completedCandidates].reverse() : completedCandidates).filter((row) => {
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

                      Drawn in every state — loading, error and empty included.
                      It used to be gated on having rows, so on a first visit
                      the slot sat empty while the rows loaded and the search
                      bar popped in afterwards. */}
                    <ListToolbarPortal>
                      <ListToolbar
                        searchValue={completedCandidatesSearch.query}
                        // The hook debounces (350ms) into `appliedQuery`, so the
                        // toolbar hands keystrokes straight through.
                        searchDebounceMs={0}
                        onSearchChange={completedCandidatesSearch.setQuery}
                        searchPlaceholder="Search by candidate, email, CID, job or job ID..."
                        onToggleFilters={() => setShowCompletedCandidateFilters(!showCompletedCandidateFilters)}
                        filtersOpen={showCompletedCandidateFilters}
                        activeFilterCount={completedCandidatesSearch.activeFilterCount}
                        filtersApplied={completedCandidatesSearch.filtersApplied}
                        onClearFilters={completedCandidatesSearch.reset}
                        className="mb-0"
                        /* The page-wide List / Card switch, pinned far right. */
                        trailing={<ListViewToggle value={listDisplayMode} onChange={setListDisplayMode} />}
                      >
                        {/* Actions — the Resume Scoring pill: appears once a
                            row (or card) is ticked, with Export and Download
                            PDF Reports. Clear unticks everything. */}
                        {selectedResultRows.length > 0 && (
                          <ListBulkActions>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  className="relative h-9 px-3 rounded-lg font-medium text-sm whitespace-nowrap inline-flex items-center justify-center gap-2 transition-all bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200 hover:border-gray-300 data-[state=open]:bg-gray-200 shadow-sm animate-in fade-in zoom-in-95 duration-300"
                                  aria-label={`Actions for ${selectedResultRows.length} selected`}
                                >
                                  <span aria-hidden className="absolute -top-1 -right-1 flex h-3 w-3">
                                    <span className="absolute inline-flex h-full w-full rounded-full bg-brand-orange opacity-75 animate-ping [animation-iteration-count:4]" />
                                    <span className="relative inline-flex h-3 w-3 rounded-full bg-brand-orange ring-2 ring-white" />
                                  </span>
                                  {downloadingResultPdfs ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                  Actions ({selectedResultRows.length})
                                  <ChevronDown className="w-4 h-4" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="w-64 overflow-hidden !rounded-lg !bg-white !pt-0 !pb-1 !px-0 !shadow-xl [&_[role=menuitem][data-highlighted]]:!bg-gray-100 [&_[role=menuitem]:hover]:!bg-gray-100">
                                <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-2xs font-semibold uppercase tracking-wide text-gray-500">
                                  {selectedResultRows.length.toLocaleString()} selected
                                </div>
                                <DropdownMenuItem
                                  className={`flex items-center gap-2.5 px-4 py-2.5 text-sm ${canExportAssessments ? 'cursor-pointer' : 'cursor-not-allowed opacity-60 text-gray-400'}`}
                                  aria-disabled={!canExportAssessments || undefined}
                                  title={canExportAssessments ? undefined : EXPORT_DENIED_REASON}
                                  onSelect={(e) => {
                                    if (!canExportAssessments) { e.preventDefault(); return; }
                                    setShowResultsExportModal(true);
                                  }}
                                >
                                  <FileDown className="w-4 h-4 text-menu-icon-download" />
                                  <span>Export</span>
                                </DropdownMenuItem>
                                {/* Same gate as the per-row Download Report
                                    (assessments:download_report): greyed with
                                    the reason, never hidden. */}
                                <DropdownMenuItem
                                  className={`flex items-center gap-2.5 px-4 py-2.5 text-sm ${canDownloadInviteReport ? 'cursor-pointer' : 'cursor-not-allowed opacity-60 text-gray-400'}`}
                                  disabled={downloadingResultPdfs}
                                  aria-disabled={!canDownloadInviteReport || undefined}
                                  title={canDownloadInviteReport ? undefined : 'You do not have permission to download assessment reports'}
                                  onSelect={(e) => {
                                    if (!canDownloadInviteReport) { e.preventDefault(); return; }
                                    void handleDownloadResultPdfs();
                                  }}
                                >
                                  <Download className="w-4 h-4 text-menu-icon-download" />
                                  <span>{downloadingResultPdfs ? 'Preparing…' : 'Download PDF Reports'}</span>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setSelectedResultKeys(new Set())}
                              icon={<X className="w-4 h-4" />}
                              className="whitespace-nowrap !h-9 !text-sm"
                            >
                              Clear
                            </Button>
                          </ListBulkActions>
                        )}
                      </ListToolbar>

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
                            <FilterSelect
                              id="result-outcome"
                              value={filterResultOutcome}
                              onChange={(v) => completedCandidatesSearch.setFilter('outcome', v as typeof filterResultOutcome)}
                              options={[
                                { value: 'all', label: 'All outcomes' },
                                { value: 'pass', label: 'Passed' },
                                { value: 'fail', label: 'Failed' },
                              ]}
                              className="w-full sm:w-full min-w-0 py-2 sm:py-2 pl-3 sm:pl-3 pr-3 sm:pr-3 rounded-lg sm:rounded-lg text-black dark:text-slate-100"
                            />
                          </div>

                          <div>
                            <label htmlFor="result-completed-from" className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                              Completed from
                            </label>
                            <DateField
                              id="result-completed-from"
                              value={filterResultFrom}
                              max={filterResultTo || undefined}
                              onChange={(v) => completedCandidatesSearch.setFilter('completedFrom', v)}
                              className="min-w-0"
                            />
                          </div>

                          <div>
                            <label htmlFor="result-completed-to" className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                              Completed to
                            </label>
                            <DateField
                              id="result-completed-to"
                              value={filterResultTo}
                              min={filterResultFrom || undefined}
                              onChange={(v) => completedCandidatesSearch.setFilter('completedTo', v)}
                              className="min-w-0"
                            />
                          </div>
                        </ListFilterPanel>
                      )}
                    </ListToolbarPortal>
                  {isLoadingCompletedCandidates && listDisplayMode === 'grid' ? (
                    /* Card view loads as card skeletons, not a table. */
                    <CardGridSkeleton count={8} className="xl:grid-cols-4" />
                  ) : isLoadingCompletedCandidates ? (
                    <>
                      {/* No skeleton line above the card any more: it stood in
                          for the "N results across all assessments" text, and
                          that count is now the toolbar's badge, which lives
                          outside this card. */}
                      {/* No title-strip skeleton either — the loaded card has
                          no title strip to stand in for. */}
                      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 overflow-hidden">
                        <div className="min-h-[320px] overflow-auto tf-table-shell">
                          {/* Same floor as the loaded table below, so the rows
                              do not shift sideways when the skeleton swaps
                              out. */}
                          <table className="w-full table-auto">
                            <thead className="[&_th]:bg-white dark:[&_th]:bg-slate-900 [&_th]:border-b [&_th]:border-gray-200 dark:[&_th]:border-slate-700">
                              <tr>
                                {['Select', 'Candidate', 'Email', 'Timeline', 'Completed', 'Result Status', 'Tech Score', 'Coding Score', 'Invite Source', 'Phone', 'CID', 'JD ID', 'JD Title', 'Job Version', 'Assessment Version', 'Resume Version', 'Actions'].map((c) => (
                                  <th key={c} className="px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-xs font-semibold text-gray-600 dark:text-slate-300"><Skeleton className="h-3 w-20" /></th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                              {Array.from({ length: 8 }).map((_, r) => (
                                <tr key={r}>
                                  <td className="pl-3 sm:pl-4 lg:pl-6 pr-0 py-2.5 sm:py-3 lg:py-4 w-10"><Skeleton className="h-4 w-4 rounded" /></td>
                                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4">
                                    <div className="flex items-center gap-3">
                                      <Skeleton className="h-9 w-9 rounded-full flex-shrink-0" />
                                      <Skeleton className="h-4 w-28" />
                                    </div>
                                  </td>
                                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4"><Skeleton className="h-4 w-40" /></td>
                                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4"><Skeleton className="h-4 w-40" /></td>
                                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4"><Skeleton className="h-4 w-24" /></td>
                                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4"><Skeleton className="h-6 w-20 rounded-full" /></td>
                                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4"><Skeleton className="h-5 w-20 rounded" /></td>
                                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4"><Skeleton className="h-6 w-12 mx-auto" /></td>
                                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4"><Skeleton className="h-6 w-12 mx-auto" /></td>
                                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4"><Skeleton className="h-4 w-28" /></td>
                                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4"><Skeleton className="h-5 w-16 rounded" /></td>
                                  {/* Job ID — badge-shaped, like the CID chip
                                      in the first column. */}
                                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4"><Skeleton className="h-5 w-16 rounded" /></td>
                                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4"><Skeleton className="h-4 w-36" /></td>
                                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4"><Skeleton className="h-4 w-10" /></td>
                                  {/* Assessment Version — same width as the Job
                                      Version cell above it, since both settle
                                      into the same short `v3`. */}
                                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4"><Skeleton className="h-4 w-10" /></td>
                                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4"><Skeleton className="h-5 w-10 rounded-full" /></td>
                                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4"><Skeleton className="h-8 w-8 rounded-md mx-auto" /></td>
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
                      {listDisplayMode === 'grid' ? (
                        /* Card view — the shared CandidateResultCard, which the
                           assessment Result page's Grid View draws too. */
                        /* Columns by the grid's own width, not the viewport's —
                           the app sidebar takes part of the screen. */
                        <div className="@container/result-cards">
                        <div className="grid grid-cols-1 @xl/result-cards:grid-cols-2 @4xl/result-cards:grid-cols-3 @7xl/result-cards:grid-cols-4 gap-4 sm:gap-5">
                          {pageItems.map((result) => (
                            <CandidateResultCard
                              key={`${result._assessment_id}-${result.invitation_id}`}
                              name={result.candidate_name}
                              email={result.candidate_email}
                              cid={result.candidate_display_id}
                              jobShortId={result._jd_short_id}
                              jobTitle={result.jd_title || result._assessment_title}
                              jobVersion={result._jd_version}
                              assessmentVersion={result._assessment_version}
                              resumeVersion={result._resume_version}
                              statusBadge={renderInviteBadgeForStatus(
                                result.status === 'completed' ? 'completed' : result.status === 'in_progress' ? 'started' : 'pending',
                                {},
                              )}
                              scores={[
                                { label: 'Tech Score', value: result.technical_score },
                                { label: 'Coding Score', value: result.coding_score },
                              ]}
                              passMark={RESULT_PASS_MARK}
                              formatScore={formatScore}
                              inviteSource={<InviteSourceValue inv={assessmentInviteSource(result)} iconClassName="w-3 h-3" />}
                              phone={result.candidate_phone}
                              duration={formatTimeSpent(result.time_spent_seconds)}
                              date={result.completed_at ? formatIST(result.completed_at) : result.started_at ? formatIST(result.started_at) : '—'}
                              onOpen={() => openCandidateResult(result, filteredResults)}
                              /* The same selection the table's checkboxes feed. */
                              selection={{
                                checked: selectedResultKeys.has(resultRowKey(result)),
                                onChange: () => toggleResultSelected(result),
                              }}
                            />
                          ))}
                        </div>
                        </div>
                      ) : (
                      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 overflow-hidden">
                        <div className="min-h-[320px] max-h-[calc(100dvh-24rem)] overflow-auto tf-table-shell">
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
                        <table className="w-full table-auto">
                          <thead className="sticky top-0 z-10 [&_th]:bg-white dark:[&_th]:bg-slate-900 [&_th]:border-b [&_th]:border-gray-200 dark:[&_th]:border-slate-700">
                            <tr>
                              {/* Select all — this page's rows. */}
                              <th className="pl-3 sm:pl-4 lg:pl-6 pr-0 py-3 sm:py-3.5 lg:py-4 w-10 align-middle text-xs font-semibold text-gray-600 dark:text-slate-300">
                                {(() => {
                                  const allOnPage = pageItems.length > 0 && pageItems.every((row) => selectedResultKeys.has(resultRowKey(row)));
                                  return (
                                    <button
                                      type="button"
                                      onClick={() => setSelectedResultKeys((prev) => {
                                        const next = new Set(prev);
                                        if (allOnPage) pageItems.forEach((row) => next.delete(resultRowKey(row)));
                                        else pageItems.forEach((row) => next.add(resultRowKey(row)));
                                        return next;
                                      })}
                                      className="p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-700"
                                      aria-label={allOnPage ? 'Deselect all on this page' : 'Select all on this page'}
                                      title={allOnPage ? 'Deselect all on this page' : 'Select all on this page'}
                                    >
                                      {allOnPage ? <CheckSquare className="w-4 h-4 text-brand-blue" /> : <Square className="w-4 h-4 text-gray-400" />}
                                    </button>
                                  );
                                })()}
                              </th>
                              <th className="text-left px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-xs font-semibold text-gray-600 dark:text-slate-300 whitespace-nowrap align-middle"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">Candidate</span></th>
                              <th className="text-left px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-xs font-semibold text-gray-600 dark:text-slate-300 whitespace-nowrap align-middle"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">Email</span></th>
                              <th className="text-left px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-xs font-semibold text-gray-600 dark:text-slate-300 whitespace-nowrap align-middle"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">Timeline</span></th>
                              <th className="text-left px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-xs font-semibold text-gray-600 dark:text-slate-300 whitespace-nowrap align-middle"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">Completed</span></th>
                              <th className="text-left px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-xs font-semibold text-gray-600 dark:text-slate-300 whitespace-nowrap align-middle"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">Result Status</span></th>
                              <th className="text-center px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-xs font-semibold text-gray-600 dark:text-slate-300 whitespace-nowrap align-middle"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">Tech Score</span></th>
                              <th className="text-center px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-xs font-semibold text-gray-600 dark:text-slate-300 whitespace-nowrap align-middle"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">Coding Score</span></th>
                              <th className="text-left px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-xs font-semibold text-gray-600 dark:text-slate-300 whitespace-nowrap align-middle"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">Invite Source</span></th>
                              <th className="text-left px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-xs font-semibold text-gray-600 dark:text-slate-300 whitespace-nowrap align-middle"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">Phone</span></th>
                              <th className="text-left px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-xs font-semibold text-gray-600 dark:text-slate-300 whitespace-nowrap align-middle"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">CID</span></th>
                              {/* Job ID leads the job group — the id first,
                                  then the name, then the versions — which is
                                  the order the Invitation Status rows and the
                                  All Assessments table both put them in. */}
                              <th className="text-left px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-xs font-semibold text-gray-600 dark:text-slate-300 whitespace-nowrap align-middle"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">JD ID</span></th>
                              <th className="text-left px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-xs font-semibold text-gray-600 dark:text-slate-300 whitespace-nowrap align-middle"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">JD Title</span></th>
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
                              <th className="text-left px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-xs font-semibold text-gray-600 dark:text-slate-300 whitespace-nowrap align-middle"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">Job Version</span></th>
                              <th className="text-left px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-xs font-semibold text-gray-600 dark:text-slate-300 whitespace-nowrap align-middle"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">Assessment Version</span></th>
                              <th className="text-left px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-xs font-semibold text-gray-600 dark:text-slate-300 whitespace-nowrap align-middle"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">Resume Version</span></th>
                              <th className="text-center px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-xs font-semibold text-gray-600 dark:text-slate-300 whitespace-nowrap align-middle tf-sticky-col"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">Actions</span></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                            {pageItems.map((result) => {
                              return (
                                <tr
                                  key={`${result._assessment_id}-${result.invitation_id}`}
                                  onClick={() => openCandidateResult(result, filteredResults)}
                                  className="transition-colors hover:bg-brand-blue/5 cursor-pointer"
                                  title={`View ${result.candidate_name || 'candidate'}'s result`}
                                >
                                  <td className="pl-3 sm:pl-4 lg:pl-6 pr-0 py-2.5 sm:py-3 lg:py-4 w-10 align-middle" onClick={(e) => e.stopPropagation()}>
                                    <button
                                      type="button"
                                      onClick={() => toggleResultSelected(result)}
                                      className="p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-700"
                                      aria-label={selectedResultKeys.has(resultRowKey(result)) ? 'Deselect candidate' : 'Select candidate'}
                                    >
                                      {selectedResultKeys.has(resultRowKey(result))
                                        ? <CheckSquare className="w-4 h-4 text-brand-blue" />
                                        : <Square className="w-4 h-4 text-gray-400" />}
                                    </button>
                                  </td>
                                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 align-middle">
                                    <div className="flex items-center gap-3">
                                      <NameAvatar name={result.candidate_name} fallback={result.candidate_email} size="md" />
                                      <p className="min-w-0 max-w-[240px] font-medium text-gray-900 dark:text-slate-50 text-sm truncate" title={result.candidate_name || 'Unknown'}>
                                        {result.candidate_name || 'Unknown'}
                                      </p>
                                    </div>
                                  </td>
                                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 align-middle text-sm text-gray-600 dark:text-slate-400 whitespace-nowrap">
                                    <span className="block max-w-[16rem] truncate" title={result.candidate_email || undefined}>{result.candidate_email || '-'}</span>
                                  </td>
                                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 align-middle text-xs text-gray-500 dark:text-slate-500">
                                    <div className="space-y-1">
                                      {result.started_at && (
                                        <div className="flex items-center gap-2 whitespace-nowrap">
                                          <Play className="w-3 h-3 flex-shrink-0 text-brand-orange-deep" />
                                          <span>Started: {formatIST(result.started_at)}</span>
                                        </div>
                                      )}
                                      {result.completed_at && (
                                        <div className="flex items-center gap-2 whitespace-nowrap">
                                          <CheckCircle className="w-3 h-3 flex-shrink-0 text-success" />
                                          <span>Completed: {formatIST(result.completed_at)}</span>
                                        </div>
                                      )}
                                      {!result.started_at && !result.completed_at && <span>-</span>}
                                      {/* Duration is the Timeline's last line, not a column of its own. */}
                                      {formatTimeSpent(result.time_spent_seconds) !== '-' && (
                                        <div className="flex items-center gap-2 whitespace-nowrap">
                                          <Timer className="w-3 h-3 flex-shrink-0 text-gray-400" />
                                          <span><span className="text-gray-400 dark:text-slate-500">Duration:</span> {formatTimeSpent(result.time_spent_seconds)}</span>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 align-middle whitespace-nowrap">
                                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400">
                                      <Calendar className="w-4 h-4" />
                                      {result.completed_at ? formatISTDate(result.completed_at) : '-'}
                                    </div>
                                  </td>
                                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 align-middle">
                                    {renderInviteBadgeForStatus(
                                      result.status === 'completed' ? 'completed' : result.status === 'in_progress' ? 'started' : 'pending',
                                      {},
                                    )}
                                  </td>
                                  {/* Tech / Coding Score — the Invitation Status
                                      tab's own cell (`renderInviteScoreCell`). */}
                                  {renderInviteScoreCell(result, 'technical')}
                                  {renderInviteScoreCell(result, 'coding')}
                                  {/* Invite Source — how this candidate was
                                      actually invited, from the invitation's
                                      own resume_id. */}
                                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 align-middle text-sm text-gray-700 dark:text-slate-300 whitespace-nowrap">
                                    <InviteSourceValue inv={assessmentInviteSource(result)} iconClassName="w-3.5 h-3.5" />
                                  </td>
                                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 align-middle text-sm text-gray-600 dark:text-slate-400 whitespace-nowrap">
                                    {result.candidate_phone || '-'}
                                  </td>
                                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 align-middle whitespace-nowrap">
                                    <span className="inline-block text-xs font-mono font-medium text-brand-blue bg-brand-blue/5 px-2 py-1 rounded ring-1 ring-brand-blue/20">
                                      {result.candidate_display_id || '-'}
                                    </span>
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
                                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 align-middle whitespace-nowrap">
                                    {result._jd_short_id ? (
                                      <JobIdBadge>{result._jd_short_id}</JobIdBadge>
                                    ) : (
                                      <span className="text-xs text-gray-400">—</span>
                                    )}
                                  </td>
                                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 align-middle">
                                    <span className="block max-w-[16rem] truncate text-sm font-medium text-gray-900 dark:text-slate-50" title={result.jd_title || result._assessment_title || undefined}>{result.jd_title || result._assessment_title || '—'}</span>
                                  </td>
                                  {/* Job Version / Assessment Version — the
                                      All Assessments table's blue / cyan
                                      VersionPill, as the Invitation Status
                                      rows draw the same two fields. A dash
                                      when the record carries no version,
                                      rather than an invented v1. */}
                                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 align-middle whitespace-nowrap">
                                    {result._jd_version ? (
                                      <VersionPill kind="job" version={result._jd_version} />
                                    ) : (
                                      <span className="text-xs text-gray-400">—</span>
                                    )}
                                  </td>
                                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 align-middle whitespace-nowrap">
                                    {result._assessment_version ? (
                                      <VersionPill kind="assessment" version={result._assessment_version} />
                                    ) : (
                                      <span className="text-xs text-gray-400">—</span>
                                    )}
                                  </td>
                                  {/* Resume Version — the blue pill that
                                      table uses for the same field. A dash
                                      when the candidate has no scoring record
                                      for this job version; see the join in
                                      loadAllCompletedCandidates. */}
                                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 align-middle whitespace-nowrap">
                                    {result._resume_version ? (
                                      <span className="inline-flex shrink-0 whitespace-nowrap items-center justify-center min-w-[2.25rem] px-1.5 py-0.5 rounded-md text-xs font-semibold tabular-nums ring-1 bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-400/30">
                                        V{result._resume_version}
                                      </span>
                                    ) : (
                                      <span className="text-xs text-gray-400">—</span>
                                    )}
                                  </td>
                                  {/* The Invitation Status kebab and its View
                                      Result item. The cell stops the click so
                                      the menu (portalled, but still inside this
                                      row in React's tree) never also fires the
                                      row's own open. */}
                                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 align-middle text-center tf-sticky-col" onClick={(e) => e.stopPropagation()}>
                                    <InvitationActionsMenu
                                      actions={[]}
                                      className="w-48"
                                      extraItems={
                                        <DropdownMenuItem
                                          className={assessmentDropdownMenuItemClass}
                                          onSelect={() => openCandidateResult(result, filteredResults)}
                                        >
                                          <Eye className="w-3.5 h-3.5 text-menu-icon-view" />
                                          <span className={MENU_ITEM_SCALE_CLASS}>View Result</span>
                                        </DropdownMenuItem>
                                      }
                                    />
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        </div>
                      </div>
                      )}
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
                  {/* Export — the Score Resume tab's popup: format, then the
                      columns to include (all ticked to start). */}
                  {showResultsExportModal && (
                    <ExportColumnsModal<'csv' | 'xls'>
                      title="Export Candidate Results"
                      recordCount={selectedResultRows.length}
                      formats={[
                        { key: 'csv', title: 'CSV Format', description: 'Compatible with Excel, Google Sheets, and most spreadsheet apps.', Icon: FileText, iconWrap: 'bg-success-subtle', iconColor: 'text-success' },
                        { key: 'xls', title: 'Excel Format (.xls)', description: 'Native Excel format with formatting and styling.', Icon: FileSpreadsheet, iconWrap: 'bg-blue-100', iconColor: 'text-blue-700' },
                      ]}
                      format={resultsExportFormat}
                      onFormatChange={setResultsExportFormat}
                      columns={RESULT_EXPORT_COLUMNS.map(({ id, label }) => ({ id, label }))}
                      initialColumnIds={RESULT_EXPORT_COLUMNS.map((col) => col.id)}
                      onExport={handleResultsExport}
                      onClose={() => setShowResultsExportModal(false)}
                    />
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
              /* The chip a row counts in: exactly one, so the chips add up to
                 Total. Not-yet-engaged statuses (pending, opened) sit with
                 Invited, abandoned with In Progress, and delivery failures
                 (failed, bounced) get their own Failed chip. The Status badge
                 keeps reading `statusOf` and so keeps its precise label. */
              const chipOf = (inv: InviteRow): string => {
                const s = statusOf(inv);
                if (s === 'pending' || s === 'opened') return 'sent';
                if (s === 'abandoned') return 'started';
                if (s === 'bounced') return 'failed';
                return s;
              };
              const bucketCount = (bucket: string) =>
                inviteStatusRows.filter((inv) => chipOf(inv) === bucket).length;
              /* The More Filters Status dropdown — the tabs below, as options. */
              const INVITATION_STATUS_TAB_OPTIONS = [
                { value: 'all', label: 'All Statuses' },
                { value: 'sent', label: 'Invited' },
                { value: 'revoked', label: 'Revoked' },
                { value: 'expired', label: 'Expired' },
                { value: 'started', label: 'In Progress' },
                { value: 'completed', label: 'Completed' },
                { value: 'failed', label: 'Failed' },
              ];
              const totalInvites = inviteStatusRows.length;
              const completedInvites = bucketCount('completed');

              const search = inviteStatusFilters.search.trim().toLowerCase();
              /* Date range is inclusive of the whole `to` day — a recruiter
                 picking today expects today's invites, not those sent at
                 exactly 00:00. */
              const fromTime = inviteStatusFilters.dateFrom ? new Date(`${inviteStatusFilters.dateFrom}T00:00:00`).getTime() : null;
              const toTime = inviteStatusFilters.dateTo ? new Date(`${inviteStatusFilters.dateTo}T23:59:59.999`).getTime() : null;
              const filtered = (listSortBy === 'oldest' ? [...inviteStatusRows].reverse() : inviteStatusRows).filter((inv) => {
                if (inviteStatusFilters.status !== 'all' && chipOf(inv) !== inviteStatusFilters.status) return false;
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
              /* Checkboxes on every row under every status bucket, as on the AI
                 Interviews Invitation Status tab. Only a row whose job version is
                 Disabled/Archived can't be ticked. The Actions menu then counts,
                 per item, how many ticked rows it can act on. */
              const showInviteSelection = true;
              const selectedInviteRows = filtered.filter((inv) => selectedInviteIds.has(inv.id) && !inviteJobLock(inv));
              const selectableIds = filtered.filter((inv) => !inviteJobLock(inv)).map((inv) => inv.id);
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

              /* Per-item eligibility — the same rules the row actions use, under
                 ANY bucket (they used to be offered on one bucket each). */
              const resendableSelectedRows = selectedInviteRows.filter(isInviteResendable);
              const revocableSelectedRows = selectedInviteRows.filter(isInviteRevocable);
              const reportableSelectedRows = selectedInviteRows.filter(inviteHasReport);
              const ofSelected = (n: number) =>
                (n === selectedInviteRows.length ? `${n}` : `${n} of ${selectedInviteRows.length}`);
              const inviteBulkItems = [
                {
                  key: 'resend',
                  label: isBulkResending ? 'Sending…' : `Resend invitation (${ofSelected(resendableSelectedRows.length)})`,
                  Icon: Mail, iconClass: 'text-menu-icon-score', destructive: false,
                  reason: !canInviteFromStatusTab
                    ? 'You do not have permission to invite candidates to assessments'
                    : resendableSelectedRows.length === 0
                      ? 'Only expired invitations that were never started can be resent'
                      : null,
                  busy: isBulkResending,
                  run: () => setShowInviteBulkResendConfirm(true),
                },
                {
                  key: 'revoke',
                  label: isBulkRevoking ? 'Revoking…' : `Revoke (${ofSelected(revocableSelectedRows.length)})`,
                  Icon: Ban, iconClass: '', destructive: true,
                  reason: !canInviteFromStatusTab
                    ? 'You do not have permission to revoke assessment invitations'
                    : revocableSelectedRows.length === 0
                      ? 'Only invitations that are still waiting (not started, not expired) can be revoked'
                      : null,
                  busy: isBulkRevoking,
                  run: () => setShowInviteBulkRevokeConfirm(true),
                },
                {
                  key: 'pdf',
                  label: downloadingInvitePdfs
                    ? 'Preparing…'
                    : `Download PDF Reports (${ofSelected(reportableSelectedRows.length)})`,
                  Icon: Download, iconClass: 'text-menu-icon-download', destructive: false,
                  reason: !canDownloadInviteReport
                    ? 'You do not have permission to download assessment reports'
                    : reportableSelectedRows.length === 0
                      ? 'Reports are available once an attempt is completed and scored'
                      : null,
                  busy: downloadingInvitePdfs,
                  run: () => void handleDownloadInviteReportPdfs(selectedInviteRows),
                },
              ];
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

              /* The row's kebab — the table's Action cell and each card. */
              const renderInviteRowActions = (inv: any) => {
                const hasResult = inviteHasResult(inv);
                const scored = inv.scoring_status !== 'pending' && inv.scoring_status !== 'processing';
                // Edit Email/Change Email (the pre-existing
                // failed/bounced "fix the address" flow)
                // isn't wired on this tab — it never had
                // that inline editor UI, only Resend. The
                // new Edit (revoked)/Revoke/Copy Link are
                // added here alongside it.
                const jdDisabled = isJdDisabled(jobVersionStatusById[inv._jd_id || '']);
                const actions = buildInvitationRowActions(inv, {
                  onResend: (target) => setResendTargetInvitation(target),
                  resendingId: isResending ? resendTargetInvitation?.id : null,
                  onEdit: (target) => setEditInviteTarget(target),
                  onRevoke: (target) => setRevokeInviteTarget(target),
                  revokingId: revokeInviteTarget?.id,
                  jdDisabled,
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
                        className={`${assessmentDropdownMenuItemClass} ${!canDownloadInviteReport ? 'text-gray-400 cursor-not-allowed opacity-60' : ''}`}
                        disabled={!scored || downloadingInviteReportId === inv.id}
                        aria-disabled={!canDownloadInviteReport}
                        title={!canDownloadInviteReport ? 'You do not have permission to download assessment reports' : undefined}
                        onSelect={(e) => {
                          if (!canDownloadInviteReport) {
                            e.preventDefault();
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
              };

              /* Actions (N) — the Resume Scoring pill in the toolbar, shown
                 whenever a row is ticked, under any bucket. */
              const hasInviteBulkAction = selectedInviteRows.length > 0;

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

                      Drawn in every state — loading, error and empty included.
                      It used to be gated on having invitations, so on a first
                      visit the slot sat empty while they loaded and the search
                      bar popped in afterwards. */}
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
                        /* Shown only while rows are ticked ("N selected"): the
                           tab pills already carry the totals. */
                        countBadge={selectedInviteRows.length > 0 ? (
                          <ListCountBadge
                            filtered={total}
                            total={totalInvites}
                            noun="invitation"
                            selected={selectedInviteRows.length}
                          />
                        ) : undefined}
                        /* The page-wide List / Card switch, pinned far right. */
                        trailing={<ListViewToggle value={listDisplayMode} onChange={setListDisplayMode} />}
                      >
                        <ListBulkActions>
                        {hasInviteBulkAction && (
                          <>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  className="relative h-9 px-3 rounded-lg font-medium text-sm whitespace-nowrap inline-flex items-center justify-center gap-2 transition-all bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200 hover:border-gray-300 data-[state=open]:bg-gray-200 shadow-sm animate-in fade-in zoom-in-95 duration-300"
                                  aria-label={`Actions for ${selectedInviteRows.length} selected`}
                                >
                                  <span aria-hidden className="absolute -top-1 -right-1 flex h-3 w-3">
                                    <span className="absolute inline-flex h-full w-full rounded-full bg-brand-orange opacity-75 animate-ping [animation-iteration-count:4]" />
                                    <span className="relative inline-flex h-3 w-3 rounded-full bg-brand-orange ring-2 ring-white" />
                                  </span>
                                  {isBulkResending || isBulkRevoking || downloadingInvitePdfs ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                  Actions ({selectedInviteRows.length})
                                  <ChevronDown className="w-4 h-4" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="w-64 overflow-hidden !rounded-lg !bg-white !pt-0 !pb-1 !px-0 !shadow-xl [&_[role=menuitem][data-highlighted]]:!bg-gray-100 [&_[role=menuitem]:hover]:!bg-gray-100">
                                <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-2xs font-semibold uppercase tracking-wide text-gray-500">
                                  {selectedInviteRows.length.toLocaleString()} selected
                                </div>
                                <DropdownMenuItem
                                  className={`flex items-center gap-2.5 px-4 py-2.5 text-sm ${canExportAssessments ? 'cursor-pointer' : 'cursor-not-allowed opacity-60 text-gray-400'}`}
                                  aria-disabled={!canExportAssessments || undefined}
                                  title={canExportAssessments ? undefined : EXPORT_DENIED_REASON}
                                  onSelect={(e) => {
                                    if (!canExportAssessments) { e.preventDefault(); return; }
                                    setShowInviteExportModal(true);
                                  }}
                                >
                                  <FileDown className="w-4 h-4 text-menu-icon-download" />
                                  <span>Export ({selectedInviteRows.length})</span>
                                </DropdownMenuItem>
                                {/* Each item counts the ticked rows it can act on; with none
                                    it stays listed, greyed, its reason on hover. */}
                                {inviteBulkItems.map(({ key, label, Icon, iconClass, destructive, reason, busy, run }) => (
                                  <DropdownMenuItem
                                    key={key}
                                    className={`flex items-center gap-2.5 px-4 py-2.5 text-sm ${
                                      reason ? 'cursor-not-allowed opacity-60 text-gray-400' : destructive ? 'cursor-pointer text-destructive' : 'cursor-pointer'
                                    }`}
                                    aria-disabled={!!reason || undefined}
                                    title={reason ?? undefined}
                                    disabled={busy}
                                    onSelect={(e) => {
                                      if (reason) { e.preventDefault(); return; }
                                      run();
                                    }}
                                  >
                                    <Icon className={`w-4 h-4 ${reason ? 'text-gray-300' : iconClass}`} />
                                    <span>{label}</span>
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </>
                        )}
                        {selectedInviteRows.length > 0 && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setSelectedInviteIds(new Set<string>())}
                            icon={<X className="w-4 h-4" />}
                            className="whitespace-nowrap !h-9 !text-sm"
                          >
                            Clear
                          </Button>
                        )}
                        </ListBulkActions>
                      </ListToolbar>

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
                            {/* One option per status tab, in tab order and
                                on the same keys, so a pick here can never
                                return rows the tabs cannot explain. */}
                            <FilterSelect
                              id="invite-status-filter"
                              value={inviteStatusFilters.status}
                              onChange={(v) => {
                                setInviteStatusFilters({ ...inviteStatusFilters, status: v });
                                setInviteStatusPage(1);
                              }}
                              options={INVITATION_STATUS_TAB_OPTIONS}
                              className="w-full sm:w-full min-w-0 py-2 sm:py-2 pl-3 sm:pl-3 pr-3 sm:pr-3 rounded-lg sm:rounded-lg text-black dark:text-slate-100"
                            />
                          </div>

                          <div>
                            <label htmlFor="invite-sent-from" className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                              Invited from
                            </label>
                            <DateField
                              id="invite-sent-from"
                              value={inviteStatusFilters.dateFrom}
                              max={inviteStatusFilters.dateTo || undefined}
                              onChange={(v) => {
                                setInviteStatusFilters({ ...inviteStatusFilters, dateFrom: v });
                                setInviteStatusPage(1);
                              }}
                              className="min-w-0"
                            />
                          </div>

                          <div>
                            <label htmlFor="invite-sent-to" className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                              Invited to
                            </label>
                            <DateField
                              id="invite-sent-to"
                              value={inviteStatusFilters.dateTo}
                              min={inviteStatusFilters.dateFrom || undefined}
                              onChange={(v) => {
                                setInviteStatusFilters({ ...inviteStatusFilters, dateTo: v });
                                setInviteStatusPage(1);
                              }}
                              className="min-w-0"
                            />
                          </div>
                        </ListFilterPanel>
                      )}
                    </ListToolbarPortal>
                  {isLoadingInviteStatus && listDisplayMode === 'grid' ? (
                    /* Card view loads as card skeletons, not a table. */
                    <CardGridSkeleton count={8} className="xl:grid-cols-4" />
                  ) : isLoadingInviteStatus ? (
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
                      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 overflow-hidden">
                        <div className="px-4 sm:px-6 py-3 border-b border-gray-100 dark:border-slate-700/60 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 sm:gap-3">
                            <Skeleton className="h-5 w-24" />
                            <Skeleton className="h-6 w-16 rounded-full" />
                          </div>
                          <Skeleton className="h-8 w-24 rounded-lg" />
                        </div>
                        <div className="min-h-[320px] overflow-auto tf-table-shell">
                          <table className="w-full table-auto">
                            <thead className="[&_th]:bg-white dark:[&_th]:bg-slate-900 [&_th]:border-b [&_th]:border-gray-200 dark:[&_th]:border-slate-700">
                              <tr>
                                <th className="px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 w-12"><Skeleton className="h-4 w-4 rounded" /></th>
                                {['Candidate', 'Timeline', 'Status', 'Tech Score', 'Coding Score', 'Invite Source', 'CID', 'Job & Assessment', 'Action'].map((c) => (
                                  <th key={c} className="px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-xs font-semibold text-gray-600 dark:text-slate-300"><Skeleton className="h-3 w-20" /></th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                              {Array.from({ length: 8 }).map((_, r) => (
                                <tr key={r}>
                                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4"><Skeleton className="h-4 w-4 rounded" /></td>
                                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4">
                                    <div className="flex items-center gap-3">
                                      <Skeleton className="h-9 w-9 rounded-full flex-shrink-0" />
                                      <div className="space-y-1.5">
                                        <Skeleton className="h-4 w-32" />
                                        <Skeleton className="h-3 w-40" />
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4"><Skeleton className="h-4 w-40" /></td>
                                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4"><Skeleton className="h-6 w-20 rounded-full" /></td>
                                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4"><Skeleton className="h-6 w-12 mx-auto" /></td>
                                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4"><Skeleton className="h-6 w-12 mx-auto" /></td>
                                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4"><Skeleton className="h-4 w-24" /></td>
                                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4"><Skeleton className="h-5 w-16 rounded" /></td>
                                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4">
                                    <div className="space-y-1.5">
                                      <Skeleton className="h-4 w-48" />
                                      <Skeleton className="h-3 w-32" />
                                    </div>
                                  </td>
                                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4"><Skeleton className="h-8 w-8 rounded-md mx-auto" /></td>
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
                      <Button variant="primary" size="md" onClick={() => loadAllInviteStatuses()}>
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
                            { key: 'failed', label: 'Failed', icon: AlertTriangle, value: bucketCount('failed'),
                              text: 'text-orange-700', hover: 'hover:text-orange-700', tint: 'bg-orange-50', ring: 'ring-orange-200' },
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
                                className={`inline-flex shrink-0 items-center gap-1.5 px-2.5 sm:px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-medium transition-all duration-200 whitespace-nowrap ${
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
                          <span className="text-sm text-gray-600 dark:text-slate-400 whitespace-nowrap">Completion rate</span>
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
                      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 overflow-hidden">
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
                        {/* The `InviteFilterBar` that sat here is gone: its
                            four fields are the page toolbar above the tab
                            pills now, so this tab's search is where every
                            other tab's is instead of inside the card. Nothing
                            it filtered by changed — same state, same fields,
                            same reset. */}

                        {listDisplayMode === 'grid' ? (
                          /* Card view — the same filtered, paged rows as the
                             table, the same selection and the same kebab. */
                          total === 0 ? (
                            <div className={`${TABLE_EMPTY_PANEL_CLASS} text-sm text-gray-500 dark:text-slate-500`}>
                              No invitations match the current filters.
                            </div>
                          ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
                            {pageItems.map((inv: any) => {
                              const isSelected = selectedInviteIds.has(inv.id);
                              const scored = inv.scoring_status !== 'pending' && inv.scoring_status !== 'processing';
                              const scoreText = (value: unknown) => (typeof value === 'number' && scored ? `${formatScore(value)}%` : '—');
                              return (
                                <div
                                  key={inv.id}
                                  className={`group relative bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 hover:shadow-md hover:border-brand-blue/20 transition-all p-4 flex flex-col gap-3 min-w-0 ${gridCardSelectedClass(isSelected)}`}
                                >
                                  {showInviteSelection && !inviteJobLock(inv) && (
                                    <GridCardSelect
                                      selected={isSelected}
                                      onToggle={() => toggleSelectInvite(inv.id)}
                                      label={inv.candidate_name || inv.candidate_email || 'candidate'}
                                      selectionActive={selectedInviteRows.length > 0}
                                    />
                                  )}
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-center gap-3 min-w-0">
                                      <NameAvatar name={inv.candidate_name} fallback={inv.candidate_email} size="md" />
                                      <div className="min-w-0">
                                        <p className="font-medium text-gray-900 dark:text-slate-50 text-sm truncate" title={inv.candidate_name}>{inv.candidate_name || '-'}</p>
                                        <p className="text-xs text-gray-500 dark:text-slate-500 truncate" title={inv.candidate_email}>{inv.candidate_email}</p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      {inv.candidate_display_id && (
                                        <span className="text-xs font-mono font-medium text-brand-blue bg-brand-blue/5 px-2 py-0.5 rounded ring-1 ring-brand-blue/20">
                                          {inv.candidate_display_id}
                                        </span>
                                      )}
                                      {renderInviteRowActions(inv)}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                                    {inv._jd_short_id && <JobIdBadge>{inv._jd_short_id}</JobIdBadge>}
                                    <span className="text-sm font-medium text-gray-900 dark:text-slate-50 truncate min-w-0" title={inv._jd_title}>{inv._jd_title || '—'}</span>
                                    {inv._jd_version ? <VersionPill kind="job" version={inv._jd_version} /> : null}
                                    {inv._assessment_version ? <VersionPill kind="assessment" version={inv._assessment_version} /> : null}
                                  </div>
                                  <div className="flex items-center justify-between gap-2 flex-wrap">
                                    {renderInviteBadgeForStatus(statusOf(inv), inv)}
                                    <span className="text-xs text-gray-700 dark:text-slate-300">
                                      <InviteSourceValue inv={assessmentInviteSource(inv)} iconClassName="w-3 h-3" />
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-slate-500">
                                    <span>Tech <span className={`${SCORE_CELL_TEXT} text-gray-900 dark:text-slate-100`}>{scoreText(inv.technical_score)}</span></span>
                                    <span>Coding <span className={`${SCORE_CELL_TEXT} text-gray-900 dark:text-slate-100`}>{scoreText(inv.coding_score)}</span></span>
                                  </div>
                                  <div className="pt-2 border-t border-gray-100 dark:border-slate-800 text-xs text-gray-500 dark:text-slate-500 space-y-1">
                                    {timelineEvents(inv).length === 0 ? (
                                      <div className="flex items-center gap-2">
                                        <Clock className="w-3 h-3 text-gray-400 flex-shrink-0" />
                                        <span>Created: {formatIST(inv.created_at)}</span>
                                      </div>
                                    ) : (
                                      timelineEvents(inv).map(({ label, at, Icon, tone }, i) => (
                                        <div key={`${label}-${i}`} className="flex items-center gap-2">
                                          <Icon className={`w-3 h-3 flex-shrink-0 ${tone}`} />
                                          <span className={tone}>{label}: {formatIST(at)}</span>
                                        </div>
                                      ))
                                    )}
                                    {hasMoreTimelineHistory(inv) && (
                                      <ViewFullHistoryLink onClick={() => setHistoryInviteTarget(inv)} />
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          )
                        ) : (
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
                          <table className="w-full table-auto">
                            {total > 0 && (
                            <thead className="sticky top-0 z-10 [&_th]:bg-white dark:[&_th]:bg-slate-900 [&_th]:border-b [&_th]:border-gray-200 dark:[&_th]:border-slate-700">
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
                                <th className="text-left px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 w-12 align-middle tf-sticky-col-left text-xs font-semibold text-gray-600 dark:text-slate-300">
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
                                <th className="text-left px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-xs font-semibold text-gray-600 dark:text-slate-300 whitespace-nowrap align-middle"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">Candidate</span></th>
                                <th className="text-left px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-xs font-semibold text-gray-600 dark:text-slate-300 whitespace-nowrap align-middle"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">Timeline</span></th>
                                <th className="text-left px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-xs font-semibold text-gray-600 dark:text-slate-300 whitespace-nowrap align-middle"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">Status</span></th>
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
                                <th className="text-center px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-xs font-semibold text-gray-600 dark:text-slate-300 whitespace-nowrap align-middle"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">Tech Score</span></th>
                                <th className="text-center px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-xs font-semibold text-gray-600 dark:text-slate-300 whitespace-nowrap align-middle"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">Coding Score</span></th>
                                <th className="text-left px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-xs font-semibold text-gray-600 dark:text-slate-300 whitespace-nowrap align-middle"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">Invite Source</span></th>
                                <th className="text-left px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-xs font-semibold text-gray-600 dark:text-slate-300 whitespace-nowrap align-middle"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">CID</span></th>
                                {/* Job ID / Job Role / Job Version / Assessment Version —
                                    the job group, after Invite Source: the same place the
                                    Track Invites popup and the Results page put it. */}
                                <th className="text-left px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-xs font-semibold text-gray-600 dark:text-slate-300 whitespace-nowrap align-middle"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">JD ID</span></th>
                                <th className="text-left px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-xs font-semibold text-gray-600 dark:text-slate-300 whitespace-nowrap align-middle"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">Job Role</span></th>
                                <th className="text-left px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-xs font-semibold text-gray-600 dark:text-slate-300 whitespace-nowrap align-middle"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">Job Version</span></th>
                                <th className="text-left px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-xs font-semibold text-gray-600 dark:text-slate-300 whitespace-nowrap align-middle"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">Assessment Version</span></th>
                                {/* Action — pinned to the right edge with
                                    `tf-sticky-col`, the mirror of the Select
                                    All column's `tf-sticky-col-left`, so on
                                    this wide table the checkbox and the kebab
                                    both stay reachable while the columns
                                    between them scroll. Same treatment as the
                                    Track Invites popup's own Actions column. */}
                                <th className="text-center px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-xs font-semibold text-gray-600 dark:text-slate-300 whitespace-nowrap align-middle tf-sticky-col"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">Action</span></th>
                              </tr>
                            </thead>
                            )}
                            <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                              {total === 0 ? (
                                <tr>
                                  <td colSpan={showInviteSelection ? 13 : 12} className="p-0">
                                    <div className={`${TABLE_EMPTY_PANEL_CLASS} text-sm text-gray-500 dark:text-slate-500`}>
                                      No invitations match the current filters.
                                    </div>
                                  </td>
                                </tr>
                              ) : pageItems.map((inv: any) => {
                                return (
                                  <tr key={inv.id} className="transition-colors hover:bg-brand-blue/5">
                                    {showInviteSelection && (
                                    <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 align-middle tf-sticky-col-left">
                                      <button
                                        onClick={() => { if (!inviteJobLock(inv)) toggleSelectInvite(inv.id); }}
                                        disabled={!!inviteJobLock(inv)}
                                        title={inviteJobLock(inv) ?? undefined}
                                        className="p-1 hover:bg-gray-200 dark:hover:bg-slate-700 rounded disabled:opacity-40 disabled:cursor-not-allowed"
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
                                    <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 align-middle">
                                      <div className="flex items-center gap-3">
                                        <NameAvatar name={inv.candidate_name} fallback={inv.candidate_email} size="md" />
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
                                    {/* Every audit-logged event on its own line, oldest
                                        first (timelineEvents/buildFullTimeline in
                                        AssessmentInviteActions) — not just the latest
                                        per milestone type, so a revoke followed by an
                                        edited resend shows both, not just the resend. */}
                                    <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 align-middle text-xs text-gray-500 dark:text-slate-500">
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
                                    {/* The Timeline's latest status, on every
                                        tab — the same value that decided
                                        which tab this row is under. */}
                                    <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 align-middle">
                                      {renderInviteBadgeForStatus(statusOf(inv), inv)}
                                    </td>
                                    {renderInviteScoreCell(inv, 'technical')}
                                    {renderInviteScoreCell(inv, 'coding')}
                                    {/* Invite Source — how this candidate was actually
                                        invited, from the invitation's own resume_id. */}
                                    <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 align-middle text-sm text-gray-700 dark:text-slate-300 whitespace-nowrap">
                                      <InviteSourceValue inv={assessmentInviteSource(inv)} iconClassName="w-3.5 h-3.5" />
                                    </td>
                                    <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 align-middle whitespace-nowrap">
                                      <span className="inline-block text-xs font-mono font-medium text-brand-blue bg-brand-blue/5 px-2 py-1 rounded ring-1 ring-brand-blue/20">
                                        {inv.candidate_display_id || '-'}
                                      </span>
                                    </td>
                                    {/* Job ID / Job Role / Job Version /
                                        Assessment Version — four columns, each
                                        drawn exactly as the All Assessments
                                        table draws it: the JobIdBadge, the job
                                        name alone (truncated, full name on
                                        hover), and that table's own blue / cyan
                                        VersionPill. A missing value is a dash,
                                        not an invented v1. */}
                                    <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 align-middle whitespace-nowrap">
                                      {inv._jd_short_id ? (
                                        <JobIdBadge>{inv._jd_short_id}</JobIdBadge>
                                      ) : (
                                        <span className="text-xs text-gray-400">—</span>
                                      )}
                                    </td>
                                    <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 align-middle">
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
                                    <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 align-middle">
                                      {inv._jd_version ? (
                                        <VersionPill kind="job" version={inv._jd_version} />
                                      ) : (
                                        <span className="text-xs text-gray-400">—</span>
                                      )}
                                    </td>
                                    <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 align-middle">
                                      {inv._assessment_version ? (
                                        <VersionPill kind="assessment" version={inv._assessment_version} />
                                      ) : (
                                        <span className="text-xs text-gray-400">—</span>
                                      )}
                                    </td>
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
                                    <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 align-middle text-center tf-sticky-col">
                                      {renderInviteRowActions(inv)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        )}
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
                        <ExportColumnsModal<'csv' | 'xls'>
                          title="Export Completed Invitations"
                          recordCount={selectedInviteRows.length}
                          formats={[
                            { key: 'csv', title: 'CSV Format', description: 'Compatible with Excel, Google Sheets, and most spreadsheet apps.', Icon: FileText, iconWrap: 'bg-success-subtle', iconColor: 'text-success' },
                            { key: 'xls', title: 'Excel Format (.xls)', description: 'Native Excel format with formatting and styling.', Icon: FileSpreadsheet, iconWrap: 'bg-blue-100', iconColor: 'text-blue-700' },
                          ]}
                          format={inviteExportFormat}
                          onFormatChange={setInviteExportFormat}
                          columns={INVITE_EXPORT_COLUMNS.map((col) => ({ id: col.label, label: col.label }))}
                          initialColumnIds={INVITE_EXPORT_COLUMNS.map((col) => col.label)}
                          onExport={(ids) => {
                            if (!canExportAssessments) return;
                            const cols = INVITE_EXPORT_COLUMNS.filter((col) => ids.includes(col.label));
                            if (inviteExportFormat === 'csv') exportInvitesToCSV(selectedInviteRows, cols);
                            else exportInvitesToXLS(selectedInviteRows, cols);
                            // Built in the browser, so the audit row comes from this call.
                            void assessmentService.logListExport({
                              format: inviteExportFormat,
                              record_count: selectedInviteRows.length,
                              export_type: 'assessment_invitation_status',
                              tab: `invitation-status:${inviteStatusFilters.status}`,
                              ids: selectedInviteRows.map((inv: any) => String(inv.id ?? '')).filter(Boolean),
                            });
                          }}
                          onClose={() => setShowInviteExportModal(false)}
                        />
                      )}
                    </>
                  )}
                </div>
              );
            })() : activeTab === 'audit' ? (
              <AssessmentAuditTrail
                toolbarSlot={toolbarSlot.node}
                refreshSignal={auditRefreshSignal}
                displayMode={listDisplayMode}
                onDisplayModeChange={setListDisplayMode}
              />
            ) : activeTab === 'settings' ? (
              /* Settings Tab with Sub-tabs */
              <div className="space-y-4 sm:space-y-6">
                {/* Settings Sub-tabs */}
                <div className="flex gap-2 sm:gap-4 border-b border-gray-200 dark:border-slate-700 overflow-x-auto scrollbar-hide">
                  {/* Proctoring & Security — staging-only testing menu; hidden in production. */}
                  {!IS_PRODUCTION_ENV && (
                  <button
                    onClick={() => setSettingsSubTab('proctoring')}
                    className={`pb-2.5 sm:pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 sm:gap-2 whitespace-nowrap shrink-0 ${
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
                    className={`pb-2.5 sm:pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 sm:gap-2 whitespace-nowrap shrink-0 ${
                      settingsSubTab === 'topics'
                        ? 'border-brand-blue text-brand-blue font-medium'
                        : 'border-transparent text-gray-500 dark:text-slate-500 hover:text-brand-blue'
                    }`}
                  >
                    <ClipboardList className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    Topics
                  </button>
                  {/* Consent Logs — admin-only. (Activity Logs is now its own
                      page tab, beside Settings.) */}
                  {isTenantAdmin && (
                  <button
                    onClick={() => setSettingsSubTab('consent')}
                    className={`pb-2.5 sm:pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 sm:gap-2 whitespace-nowrap shrink-0 ${
                      settingsSubTab === 'consent'
                        ? 'border-brand-blue text-brand-blue font-medium'
                        : 'border-transparent text-gray-500 dark:text-slate-500 hover:text-brand-blue'
                    }`}
                  >
                    <FileCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">Consent Logs</span>
                    <span className="sm:hidden">Consent</span>
                  </button>
                  )}
                </div>

                {/* Content: Activity / Consent Logs for admins; otherwise
                    Topics is shown normally and the Proctoring & Security
                    content is gated to non-production (staging-only testing menu). */}
                {settingsSubTab === 'consent' && isTenantAdmin ? (
                  <ConsentLogs defaultFeature="ASSESSMENT" />
                ) : settingsSubTab === 'topics' || IS_PRODUCTION_ENV ? (
                  <div className="space-y-4 sm:space-y-6">
                    {/* Header */}
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-50 flex items-center gap-1.5 sm:gap-2">
                        <ClipboardList className="w-4 h-4 sm:w-5 sm:h-5" />
                        Assessment Topics Settings
                      </h2>
                      <p className="text-sm text-gray-600 dark:text-slate-400 mt-0.5 sm:mt-1">
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
                            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                                <ClipboardList className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                              </div>
                              <div>
                                <h3 className="text-sm font-medium text-white">Topic Availability</h3>
                                <p className="text-xs text-white/80">
                                  Control which topics are available
                                </p>
                              </div>
                            </div>
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
                                <h4 className="text-sm font-medium text-gray-900 dark:text-slate-50">HR</h4>
                                <span className={`px-1.5 sm:px-2 py-0.5 rounded text-xs font-medium ${
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
                              <span className="text-xs text-gray-500 dark:text-slate-500 font-medium">
                                {topicSettings.hr_enabled ? 'ON' : 'OFF'}
                              </span>
                              <button
                                onClick={() => {
                                  if (!canUpdateAssessment) return;
                                  updateTopicSettings({ hr_enabled: !topicSettings.hr_enabled });
                                }}
                                disabled={savingTopicsKeys.has('hr_enabled')}
                                aria-disabled={savingTopicsKeys.has('hr_enabled') || !canUpdateAssessment}
                                title={!canUpdateAssessment ? 'You do not have permission to edit assessment settings' : ''}
                                className={`relative w-9 sm:w-14 h-5 sm:h-7 rounded-full transition-colors ${
                                  topicSettings.hr_enabled
                                    ? 'bg-brand-blue shadow-sm shadow-brand-blue/25'
                                    : 'bg-gray-300'
                                } ${(savingTopicsKeys.has('hr_enabled') || !canUpdateAssessment) ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                <div className={`absolute top-0.5 sm:top-1 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-white shadow-md transition-transform ${
                                  topicSettings.hr_enabled
                                    ? 'translate-x-4 sm:translate-x-8'
                                    : 'translate-x-0.5 sm:translate-x-1'
                                }`} />
                              </button>
                            </div>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-slate-400 pl-9 sm:pl-[52px]">
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
                                <h4 className="text-sm font-medium text-gray-900 dark:text-slate-50">Technical</h4>
                                <span className={`px-1.5 sm:px-2 py-0.5 rounded text-xs font-medium ${
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
                              <span className="text-xs text-gray-500 dark:text-slate-500 font-medium">
                                {topicSettings.technical_enabled ? 'ON' : 'OFF'}
                              </span>
                              <button
                                onClick={() => {
                                  if (!canUpdateAssessment) return;
                                  updateTopicSettings({ technical_enabled: !topicSettings.technical_enabled });
                                }}
                                disabled={savingTopicsKeys.has('technical_enabled')}
                                aria-disabled={savingTopicsKeys.has('technical_enabled') || !canUpdateAssessment}
                                title={!canUpdateAssessment ? 'You do not have permission to edit assessment settings' : ''}
                                className={`relative w-9 sm:w-14 h-5 sm:h-7 rounded-full transition-colors ${
                                  topicSettings.technical_enabled
                                    ? 'bg-brand-blue shadow-sm shadow-brand-blue/25'
                                    : 'bg-gray-300'
                                } ${(savingTopicsKeys.has('technical_enabled') || !canUpdateAssessment) ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                <div className={`absolute top-0.5 sm:top-1 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-white shadow-md transition-transform ${
                                  topicSettings.technical_enabled
                                    ? 'translate-x-4 sm:translate-x-8'
                                    : 'translate-x-0.5 sm:translate-x-1'
                                }`} />
                              </button>
                            </div>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-slate-400 pl-9 sm:pl-[52px]">
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
                                <h4 className="text-sm font-medium text-gray-900 dark:text-slate-50">Coding</h4>
                                <span className={`px-1.5 sm:px-2 py-0.5 rounded text-xs font-medium ${
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
                              <span className="text-xs text-gray-500 dark:text-slate-500 font-medium">
                                {topicSettings.coding_enabled ? 'ON' : 'OFF'}
                              </span>
                              <button
                                onClick={() => {
                                  if (!canUpdateAssessment) return;
                                  updateTopicSettings({ coding_enabled: !topicSettings.coding_enabled });
                                }}
                                disabled={savingTopicsKeys.has('coding_enabled')}
                                aria-disabled={savingTopicsKeys.has('coding_enabled') || !canUpdateAssessment}
                                title={!canUpdateAssessment ? 'You do not have permission to edit assessment settings' : ''}
                                className={`relative w-9 sm:w-14 h-5 sm:h-7 rounded-full transition-colors ${
                                  topicSettings.coding_enabled
                                    ? 'bg-brand-blue shadow-sm shadow-brand-blue/25'
                                    : 'bg-gray-300'
                                } ${(savingTopicsKeys.has('coding_enabled') || !canUpdateAssessment) ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                <div className={`absolute top-0.5 sm:top-1 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-white shadow-md transition-transform ${
                                  topicSettings.coding_enabled
                                    ? 'translate-x-4 sm:translate-x-8'
                                    : 'translate-x-0.5 sm:translate-x-1'
                                }`} />
                              </button>
                            </div>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-slate-400 pl-9 sm:pl-[52px]">
                            Algorithms, data structures, frameworks, and patterns.
                          </p>
                        </div>

                        {/* Important Notice */}
                        <div className="flex items-start gap-2 p-3 sm:p-4 bg-warning-subtle rounded-lg border border-warning-line">
                          <Info className="w-4 h-4 sm:w-5 sm:h-5 text-warning flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm text-warning-strong">
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
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                            <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                          </div>
                          <div>
                            <h3 className="text-sm font-medium text-white">Proctoring Settings</h3>
                            <p className="text-xs text-white/80">
                              Configure security features
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                          {flaggedCount > 0 && (
                            <span className="px-2 sm:px-3 py-0.5 sm:py-1 bg-destructive text-white rounded-full text-xs font-medium whitespace-nowrap">
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
                              <h4 className="text-sm font-medium text-gray-900 dark:text-slate-50">Proctoring Mode</h4>
                              <span className={`px-1.5 sm:px-2 py-0.5 rounded text-xs font-medium ${
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
                            <span className="text-xs text-gray-500 dark:text-slate-500 font-medium">
                              {proctoringSettings.proctoring_enabled ? 'ON' : 'OFF'}
                            </span>
                            <button
                              onClick={() => updateProctoringSettings({ proctoring_enabled: !proctoringSettings.proctoring_enabled })}
                              disabled={savingProctoringKeys.has('proctoring_enabled')}
                              className={`relative w-10 sm:w-14 h-5 sm:h-7 rounded-full transition-colors ${
                                proctoringSettings.proctoring_enabled
                                  ? 'bg-brand-blue shadow-sm shadow-brand-blue/25'
                                  : 'bg-gray-300'
                              } ${savingProctoringKeys.has('proctoring_enabled') ? 'opacity-50 cursor-not-allowed' : ''}`}
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
                        <p className="text-sm text-gray-600 dark:text-slate-400">
                          {proctoringSettings.proctoring_enabled
                            ? 'Advanced monitoring is active for test integrity.'
                            : 'Standard mode — no advanced monitoring. Enable for high-stakes assessments.'
                          }
                        </p>
                        {/* Privacy Notice */}
                        {proctoringSettings.proctoring_enabled && (
                          <div className="flex items-start gap-1.5 sm:gap-2 p-2 sm:p-3 bg-brand-blue/5 rounded-lg ring-1 ring-brand-blue/15">
                            <Info className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-blue flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-gray-700 dark:text-slate-300">
                              <span className="font-medium">Privacy:</span> Candidates are informed before starting. Recordings stored for {proctoringSettings.recording_retention_days} days.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Individual Security Features */}
                    <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-3 sm:p-6">
                      <h3 className="text-sm font-medium text-gray-900 dark:text-slate-50 mb-3 sm:mb-4">Security Features</h3>
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
                                  <div className="text-sm font-medium text-gray-900 dark:text-slate-50 leading-tight">{feature.name}</div>
                                  <div className="text-xs text-gray-500 dark:text-slate-500 line-clamp-1 sm:line-clamp-2 hidden sm:block">{feature.description}</div>
                                </div>
                              </div>
                              <button
                                onClick={() => updateProctoringSettings({ [feature.key]: !isEnabled })}
                                disabled={savingProctoringKeys.has(feature.key) || !proctoringSettings.proctoring_enabled}
                                className={`relative w-9 sm:w-11 h-5 sm:h-6 rounded-full transition-colors flex-shrink-0 ${
                                  isEnabled && proctoringSettings.proctoring_enabled
                                    ? 'bg-success'
                                    : 'bg-gray-300'
                                } ${savingProctoringKeys.has(feature.key) || !proctoringSettings.proctoring_enabled ? 'opacity-50 cursor-not-allowed' : ''}`}
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
                            disabled={savingProctoringKeys.has('email_masking_enabled')}
                            className={`relative w-14 h-7 rounded-full transition-colors ${
                              proctoringSettings.email_masking_enabled ? 'bg-success' : 'bg-gray-300'
                            } ${savingProctoringKeys.has('email_masking_enabled') ? 'opacity-50 cursor-not-allowed' : ''}`}
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
                          <label className="block text-xs text-gray-600 dark:text-slate-400 mb-1.5">Max Tab Switches Before Warning</label>
                          <input
                            type="number"
                            value={proctoringSettings.max_tab_switches}
                            onChange={(e) => updateProctoringSettings({ max_tab_switches: parseInt(e.target.value) || 3 })}
                            disabled={savingProctoringKeys.has('max_tab_switches') || !proctoringSettings.proctoring_enabled}
                            className="w-full min-w-0 px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue disabled:bg-slate-100 disabled:cursor-not-allowed text-black"
                            min="1"
                            max="10"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 dark:text-slate-400 mb-1.5">Max Violations Before Flag</label>
                          <input
                            type="number"
                            value={proctoringSettings.max_violations_before_flag}
                            onChange={(e) => updateProctoringSettings({ max_violations_before_flag: parseInt(e.target.value) || 5 })}
                            disabled={savingProctoringKeys.has('max_violations_before_flag') || !proctoringSettings.proctoring_enabled}
                            className="w-full min-w-0 px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue disabled:bg-slate-100 disabled:cursor-not-allowed text-black"
                            min="1"
                            max="20"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 dark:text-slate-400 mb-1.5">Recording Retention (Days)</label>
                          <input
                            type="number"
                            value={proctoringSettings.recording_retention_days}
                            onChange={(e) => updateProctoringSettings({ recording_retention_days: parseInt(e.target.value) || 90 })}
                            disabled={savingProctoringKeys.has('recording_retention_days') || !proctoringSettings.proctoring_enabled}
                            className="w-full min-w-0 px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue disabled:bg-slate-100 disabled:cursor-not-allowed text-black"
                            min="7"
                            max="365"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Recent Proctoring Events */}
                    <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-3 sm:p-6">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 sm:mb-4">
                        <h3 className="text-sm font-medium text-gray-900 dark:text-slate-50">Recent Proctoring Events</h3>
                        <span className="text-xs text-gray-500 dark:text-slate-500">{proctoringEventsTotal} total</span>
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
                                  <div className="text-sm font-medium text-gray-900 dark:text-slate-50 capitalize truncate">
                                    {event.event_type.replace(/_/g, ' ')}
                                  </div>
                                  <div className="text-xs text-gray-500 dark:text-slate-500 truncate">
                                    {event.candidate_name || 'Unknown'} • {event.assessment_title || 'Assessment'}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                                <span className={`px-1.5 sm:px-2 py-0.5 rounded text-xs font-medium ${
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
            ) : isLoading && listDisplayMode === 'grid' ? (
              /* Card view loads as card skeletons. */
              <CardGridSkeleton count={6} />
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
                        if (!canCreateAssessment) return;
                        handleOpenCreation();
                      }}
                      aria-disabled={!canCreateAssessment}
                      className={!canCreateAssessment ? 'opacity-50 cursor-not-allowed' : ''}
                      title={!canCreateAssessment ? 'You do not have permission to create assessments' : ''}
                      icon={<Sparkles className="w-4 h-4" />}
                    >
                      Create AI Assessment
                    </Button>
                  ) : undefined}
                />
              );
            })()
            : (
              /* List: one full-width card per job. Card: the same cards in a
                 grid — each reflows by its own width (@container/job-row). */
              <div className={listDisplayMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 items-start' : 'space-y-3'}>
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
                  onUncounted={setUncountedCompletedIds}
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

      {/* The Send Invite picker's preview — read-only Configure Assessment.
          Renders nothing while no row is being previewed. */}
      <AssessmentConfigureModal
        isOpen={!!configurePreviewAssessment}
        onClose={() => setConfigurePreviewAssessment(null)}
        assessment={configurePreviewAssessment}
        readOnly
      />

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
            /* Below sm the dialog itself scrolls: header, stat strip, note and
               filters already fill a 320×~860 screen, and with the panel
               clipping, the table — the only scroller — was squeezed to its
               header row. The table keeps a floor (below) and the rest scrolls
               past it. */
            className={`${TRACKER_DIALOG_PANEL_CLASS} max-sm:overflow-y-auto`}>
            {/* Modal Header */}
            <div className="px-3 sm:px-6 py-2.5 sm:py-4 border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 flex items-center justify-between gap-2 flex-shrink-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-brand-blue flex items-center justify-center shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 flex-shrink-0">
                    <Users className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-50 truncate tracking-tight">
                      <span className="hidden sm:inline">Assessments - Invite Status Tracking</span>
                      <span className="sm:hidden">Invite Status</span>
                    </h2>
                    {/* What the popup is scoped to. A job names itself and
                        says how many versions are in the table, so the reader
                        knows the rows below span more than one assessment; a
                        single assessment names itself, as before. */}
                    {trackingJob ? (
                      <p
                        className="text-sm text-gray-500 dark:text-slate-500 mt-0.5 truncate"
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
                      <p className="text-sm text-gray-500 dark:text-slate-500 mt-0.5 truncate">{selectedAssessmentForTracking.title}</p>
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
              </div>
            </div>

            {/* Stat row doubles as the status filter — same component, buckets
                and wording as the JD-level popup and the AI Interview trackers.
                Counts come from the API's unfiltered summary, so selecting a
                bucket narrows the table without collapsing the other cards. */}
            <InviteStatCards
              /* Phone: one swipeable row — three to a row cut every label to
                 "Total Inv…" / "Complet…" and stacked three rows of tiles. */
              gridClassName="flex gap-1.5 overflow-x-auto scrollbar-hide [&>*]:shrink-0 [&>*]:min-w-[6.75rem] sm:grid sm:grid-cols-4 lg:grid-cols-7 sm:gap-2 lg:gap-3 sm:overflow-visible sm:[&>*]:min-w-0"
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
                { key: 'all', label: 'Total', Icon: Users, value: invitationStats.total, ...INVITE_CARD_TONES.blue },
                { key: 'sent', label: 'Invited', Icon: Mail, value: invitationStats.invited, ...INVITE_CARD_TONES.slate },
                { key: 'started', label: 'In Progress', Icon: Play, value: invitationStats.started, ...INVITE_CARD_TONES.cyan },
                { key: 'completed', label: 'Completed', Icon: CheckCircle, value: invitationStats.completed, ...INVITE_CARD_TONES.green },
                { key: 'expired', label: 'Expired', Icon: Clock, value: invitationStats.expired, ...INVITE_CARD_TONES.orange },
                { key: 'terminated', label: 'Terminated', Icon: Ban, value: invitationStats.terminated, ...INVITE_CARD_TONES.red },
                { key: 'revoked', label: 'Revoked', Icon: Ban, value: invitationStats.revoked, ...INVITE_CARD_TONES.indigo },
              ]}
            />

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
                  className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400 hover:text-brand-blue transition-colors"
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
            <div className="relative px-2.5 sm:px-6 py-2.5 sm:py-4 overflow-hidden flex-1 min-h-0 max-sm:min-h-[22rem] flex flex-col">
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
                        {['Candidate', 'Timeline', 'Status', 'Invite Source', 'CID', 'Actions'].map((c) => (
                          <th key={c} className="px-3 sm:px-4 py-2.5 sm:py-3 text-left text-xs font-semibold text-gray-600 dark:text-slate-300"><Skeleton className="h-3 w-16" /></th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                      {Array.from({ length: 7 }).map((_, r) => (
                        <tr key={r}>
                          <td className="py-3 pl-4 pr-0"><Skeleton className="h-4 w-4 rounded-full" /></td>
                          <td className="px-3 sm:px-4 py-3">
                            <div className="flex items-center gap-3">
                              <Skeleton className="h-9 w-9 rounded-full flex-shrink-0" />
                              <div className="space-y-1.5">
                                <Skeleton className="h-4 w-28" />
                                <Skeleton className="h-3 w-36" />
                              </div>
                            </div>
                          </td>
                          <td className="px-3 sm:px-4 py-3"><Skeleton className="h-4 w-40" /></td>
                          <td className="px-3 sm:px-4 py-3"><Skeleton className="h-6 w-20 rounded-full" /></td>
                          <td className="px-3 sm:px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                          <td className="px-3 sm:px-4 py-3"><Skeleton className="h-5 w-16 rounded" /></td>
                          <td className="px-3 sm:px-4 py-3"><Skeleton className="h-8 w-8 rounded-md" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : trackingInvitations.length === 0 ? (
                <div className={`${TRACKER_DIALOG_PLACEHOLDER_CLASS} text-gray-500 dark:text-slate-500`}>
                  <Users className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 text-brand-blue/40" />
                  <p className="text-sm">
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
                        <th className="w-8 py-3 pl-4 pr-0 tf-sticky-col-left text-xs font-semibold text-gray-600 dark:text-slate-300" aria-label="Select" />
                        <th className="text-left px-3 sm:px-4 py-2.5 sm:py-3 text-xs font-semibold text-gray-600 dark:text-slate-300">Candidate</th>
                        {/* hidden md:table-cell mirrors this column's <td>. Without
                            it the header carried one more cell than the body between
                            sm and md, shifting every heading after Timeline off its
                            column. */}
                        <th className="text-left px-3 sm:px-4 py-2.5 sm:py-3 text-xs font-semibold text-gray-600 dark:text-slate-300 hidden md:table-cell"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">Timeline</span></th>
                        <th className="text-left px-3 sm:px-4 py-2.5 sm:py-3 text-xs font-semibold text-gray-600 dark:text-slate-300"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">Status</span></th>
                        {/* Tech / Coding Score columns are conditional on the
                            assessment having that round enabled — same rule as
                            the Results page. Showing a "Coding Score" column
                            for a JD without a coding round produced a
                            permanent "—" column that confused recruiters. */}
                        {trackingTechEnabled && (
                          <th className="text-center px-3 sm:px-4 py-2.5 sm:py-3 text-xs font-semibold text-gray-600 dark:text-slate-300"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">Tech Score</span></th>
                        )}
                        {trackingCodingEnabled && (
                          <th className="text-center px-3 sm:px-4 py-2.5 sm:py-3 text-xs font-semibold text-gray-600 dark:text-slate-300"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">Coding Score</span></th>
                        )}
                        <th className="text-left px-3 sm:px-4 py-2.5 sm:py-3 text-xs font-semibold text-gray-600 dark:text-slate-300 whitespace-nowrap"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">Invite Source</span></th>
                        <th className="text-left px-3 sm:px-4 py-2.5 sm:py-3 text-xs font-semibold text-gray-600 dark:text-slate-300"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">CID</span></th>
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
                          <th className="text-left px-3 sm:px-4 py-2.5 sm:py-3 text-xs font-semibold text-gray-600 dark:text-slate-300"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">Job Version</span></th>
                        )}
                        {trackingJob && (
                          <th className="text-left px-3 sm:px-4 py-2.5 sm:py-3 text-xs font-semibold text-gray-600 dark:text-slate-300"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">Assessment Version</span></th>
                        )}
                        <th className="text-left px-3 sm:px-4 py-2.5 sm:py-3 text-xs font-semibold text-gray-600 dark:text-slate-300 tf-sticky-col"><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                      {trackingInvitations.map((invitation: any) => {
  
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
                            <td className="py-3 pl-4 pr-0 align-middle tf-sticky-col-left" onClick={(e) => e.stopPropagation()}>
                              {isBulkActionable(invitation) && !trackingInviteArchived(invitation) ? (
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
                            <td className="px-3 sm:px-4 py-3 align-top">
                              <div className="flex items-center gap-3">
                                <NameAvatar name={invitation.candidate_name} fallback={invitation.candidate_email} size="lg" />
                                {/* Capped rather than free: under auto layout a
                                    single long email would otherwise set the
                                    column width for the whole table. */}
                                <div className="min-w-0 max-w-[240px]">
                                  <p className="font-medium text-gray-900 dark:text-slate-50 text-sm truncate" title={invitation.candidate_name}>{invitation.candidate_name}</p>
                                  <p className="text-xs text-gray-500 dark:text-slate-500 truncate" title={invitation.candidate_email}>{invitation.candidate_email}</p>
                                </div>
                              </div>
                            </td>
                                <td className="px-3 sm:px-4 py-3 align-top text-xs text-gray-500 dark:text-slate-500 hidden md:table-cell">
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
                            <td className="px-3 sm:px-4 py-3 align-top">
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
                                <td className="px-3 sm:px-4 py-3 align-top text-sm text-center">
                                  {techReady ? (
                                    <div className="flex flex-col items-center gap-0.5">
                                      <span className={`${SCORE_CELL_TEXT} ${invitation.technical_score >= 70 ? 'text-success' : 'text-destructive'}`}>
                                        {formatScore(invitation.technical_score)}%
                                      </span>
                                      <span className={`text-2xs font-medium px-1.5 py-0.5 rounded ring-1 ${invitation.technical_score >= 70 ? 'bg-success-subtle text-success ring-success-line' : 'bg-destructive-subtle text-destructive ring-destructive-line'}`}>
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
                                <td className="px-3 sm:px-4 py-3 align-top text-sm text-center">
                                  {codingReady ? (
                                    <div className="flex flex-col items-center gap-0.5">
                                      <span className={`${SCORE_CELL_TEXT} ${invitation.coding_score >= 70 ? 'text-success' : 'text-destructive'}`}>
                                        {formatScore(invitation.coding_score)}%
                                      </span>
                                      <span className={`text-2xs font-medium px-1.5 py-0.5 rounded ring-1 ${invitation.coding_score >= 70 ? 'bg-success-subtle text-success ring-success-line' : 'bg-destructive-subtle text-destructive ring-destructive-line'}`}>
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
                            <td className="px-3 sm:px-4 py-3 align-top text-sm text-gray-700 dark:text-slate-300 whitespace-nowrap">
                              <InviteSourceValue inv={assessmentInviteSource(invitation)} iconClassName="w-3.5 h-3.5" />
                            </td>
                            <td className="px-3 sm:px-4 py-3 align-top">
                              <span className="inline-block text-xs font-mono font-medium text-brand-blue bg-brand-blue/5 px-2 py-1 rounded ring-1 ring-brand-blue/20">
                                {invitation.candidate_display_id || '-'}
                              </span>
                            </td>
                            {/* The job version this invite's assessment was
                                built against - the version panel's own blue
                                chip, so V2 reads the same wherever a recruiter
                                meets it. */}
                            {trackingJob && (
                              <td className="px-3 sm:px-4 py-3 align-top">
                                <VersionChip kind="job" version={invitation._jd_version} />
                              </td>
                            )}
                            {/* The assessment version, in the panel's cyan -
                                the version and nothing else. The assessment's
                                own id sat under it and was noise in a column
                                asked for a version; the assessment is named in
                                the row's actions and on the page it opens. */}
                            {trackingJob && (
                              <td className="px-3 sm:px-4 py-3 align-top">
                                <VersionChip kind="assessment" version={invitation._assessment_version} />
                              </td>
                            )}
                            <td className="px-3 sm:px-4 py-3 align-top tf-sticky-col" onClick={(e) => e.stopPropagation()}>
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
                                    archived: trackingInviteArchived(invitation),
                                    jdDisabled: trackingInviteJdDisabled(invitation),
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
                  <span className="inline-flex items-center gap-2 rounded-full bg-white dark:bg-slate-900 px-3 py-1.5 text-sm text-gray-600 dark:text-slate-300 shadow-sm ring-1 ring-black/[0.06] dark:ring-white/10">
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
              <p className="text-sm text-gray-500 dark:text-slate-500 text-center sm:text-left order-2 sm:order-1">
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
                    the invite popup opens on the SAME assessment, and closing
                    the invite popup brings this popup back (see `openAssessmentInvite`).
                    Gated exactly as every other Share on this page is. */}
                <Button variant="secondary" size="sm" onClick={closeTrackInvitesModal}>
                  Cancel
                </Button>
                {(() => {
                  const target = selectedAssessmentForTracking;
                  const canShare = isTenantAdmin || hasPermissionCode('assessments:share');
                  const status = String(target?.status ?? '').toLowerCase();
                  const blockedReason = !target ? 'No assessment selected'
                    : !canShare ? 'You do not have permission to invite candidates'
                    : jobLockReason(target) ? jobLockReason(target)!
                    : status === 'draft' ? 'Publish assessment first to share'
                    : status === 'archived' ? 'Archived assessments cannot be shared'
                    : isAssessmentRevoked(target) ? 'Invites for this assessment have been revoked. Duplicate it to start fresh.'
                    : '';
                  return (
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={!!blockedReason && canShare}
                      aria-disabled={!!blockedReason}
                      title={blockedReason || 'Invite more candidates to this assessment'}
                      className={!canShare ? 'opacity-50 cursor-not-allowed' : ''}
                      onClick={() => {
                        if (blockedReason) return;
                        // Remember where we came from so closing the popup returns here.
                        const returnTo = { assessment: target, job: trackingJob };
                        closeTrackInvitesModal();
                        void openAssessmentInvite(target, returnTo);
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
      {archiveConfirmModal}
      {deleteConfirmModal}

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
                    <p className="text-sm text-gray-500 dark:text-slate-400">Current Job</p>
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
                      <span className="text-lg font-semibold text-gray-900 dark:text-slate-50 break-words">
                        {jobTitle}
                      </span>
                      <span aria-hidden="true" className="text-gray-300 dark:text-slate-600">|</span>
                      <span className="text-lg font-semibold text-gray-900 dark:text-slate-50">
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
                    <p className="text-sm text-gray-500 dark:text-slate-400">New Assessment Version</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <span className="text-lg font-semibold text-gray-900 dark:text-slate-50">
                        Assessment Version {nextVersion}
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-warning-subtle text-warning-strong text-sm font-semibold">
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
        // Same fields/fallbacks the clone-confirmation modal uses for its
        // "Current Job" card, so the JD name/version shown here always
        // agrees with what that modal (and the list row) would show.
        return (
          <DraftAssessmentExistsModal
            draft={draft}
            jdShortId={target?.jd_short_id}
            jobTitle={
              target?.jd_title
              || target?.job?.title
              || stripVersionFromTitle(target?.title || draft.title || '')
              || 'This job'
            }
            jobVersion={target?.jd_version ?? draft.jd_version ?? 1}
            onClose={closeConflict}
            onOpenDraft={() => {
              handleEditAssessment({
                id: draft.id,
                jd_id: target?.jd_id,
                status: 'Draft',
                invitations_count: 0,
              });
              closeConflict();
            }}
          />
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
