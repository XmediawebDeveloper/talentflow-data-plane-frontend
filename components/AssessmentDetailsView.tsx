import { RefreshCw, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, Users, FileText, Award, Calendar, TrendingUp, Edit2, Eye, Mail, BarChart, Share2, Download, Copy, Archive, ArchiveRestore, Trash2, Play, PauseCircle, CheckCircle, XCircle, AlertCircle, Briefcase, Link2, Code, Cpu, User, ExternalLink, Info, Layers, Loader2, Monitor, Ban, Sliders, Globe, Zap, Star, Shield } from 'lucide-react';
import { Fragment, useState, useMemo, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useBackgroundWorkRefresh } from '@/lib/backgroundWorkEvents';
import { useRouter, useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { useAuth } from '@/components/providers/AuthProvider';
import { assessmentService, jdService } from '@/lib/services';
import type { JDLineageVersion } from '@/lib/services/jdService';
import type { AssessmentResponse, JDResponse } from '@/lib/services';
import type { CombinedAuditActivity } from '@/lib/services/assessmentService';
import { isAssessmentArchived } from '@/lib/services/assessmentService';
import { isJdDisabled, assessmentJobLockMessage } from '@/lib/utils/assessmentJobLock';
import { JobVersionsLockBanner, splitJobVersions } from '@/components/jobs/JobLockNotice';
import { stripVersionFromTitle, isAssessmentRevoked } from '@/lib/utils/assessmentUtils';
import { toast } from 'sonner';
import { showErrorToast } from '@/lib/utils/errorToast';
import { formatIST } from '@/lib/utils/dateUtils';
import PageBreadcrumb, { type BreadcrumbCrumb } from '@/components/PageBreadcrumb';
import RecordPager from '@/components/RecordPager';
import { useArchiveAssessmentConfirm } from '@/components/assessments/ArchiveAssessmentModal';
import AssessmentConfigureModal from '@/components/AssessmentConfigureModal';
import AssessmentResults from '@/components/AssessmentResults';
import JDOverviewSections from '@/components/jobs/JDOverviewSections';
import JDIdentityHeader from '@/components/jobs/JDIdentityHeader';
import { currentResultReturnTo, isResultRestoreArrival, rememberResultReturn, resultReturnQuery } from '@/lib/utils/resultReturnContext';
import AssessmentInfoPanel from '@/components/assessments/AssessmentInfoPanel';
import api from '@/lib/services/api';
import ResendLinkModal from '@/components/recruitment/ResendLinkModal';
import RevokeLinkModal from '@/components/recruitment/RevokeLinkModal';
import InviteStatCards, { INVITE_CARD_TONES } from '@/components/InviteStatCards';
import InviteFilterBar, {
  EMPTY_INVITE_FILTERS,
  type InviteFilterState,
} from '@/components/InviteFilterBar';
import { RevokeInvitationDialog, EditInvitationModal } from '@/components/AssessmentInviteActions';
import AssessmentInviteTable, {
  isBulkActionable,
  isBulkRevocable,
  isBulkResendable,
  isTrackedInviteCompleted,
  opensTrackedInviteDetails,
} from '@/components/assessments/AssessmentInviteTable';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { tabPill } from '@/components/ui/filter-pills';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import LanguageLogo, { logoLabelForId } from '@/components/assessments/LanguageLogo';
import { formatScore } from '@/lib/utils/score';

interface AssessmentDetailsViewProps {
  assessment: any;
  onBack: () => void;
  onEdit: () => void;
  onPreview: () => void;
  onShare?: () => void;
  /** False when the viewer lacks the share/invite permission — Share stays
   *  visible but greyed out with a tooltip (RBAC: never hidden). */
  canShare?: boolean;
  /** False when the viewer lacks the edit permission — Edit stays visible but
   *  greyed out with a tooltip. */
  canEdit?: boolean;
  onViewResults: () => void;
  onRefresh?: () => void | Promise<void>;
  /**
   * A DIFFERENT record is being fetched while this one stays on screen.
   *
   * The host keeps the view mounted through a version switch rather than
   * replacing the page with a loader, so nothing here unmounts and nothing
   * jumps. This is how the view knows the content it is showing is about to
   * be replaced: it marks the region `aria-busy` for assistive tech, while
   * the visible reporting stays local to the control that started it.
   */
  isReloading?: boolean;
  currentIndex?: number;
  totalCount?: number;
  /** Called with the vertical tab open now, so the host can land the
   *  neighbouring record on that same tab (`?tab=`). */
  onPrev?: (tab: string) => void;
  onNext?: (tab: string) => void;
  /**
   * Overrides the default Assessments trail. Set when this page is reached from
   * a JD (Job Details → Assessment → Create on a job that already has one), so
   * the breadcrumb stays anchored to that job instead of resetting.
   */
  breadcrumbItems?: BreadcrumbCrumb[];
  /** Where this page was opened from (`?from=…`), kept when switching to
   *  another version so its breadcrumb keeps the origin. */
  originQuery?: string;
  /**
   * A DRAFT assessment: everything on the page is shown greyed out and
   * non-interactive except the Edit pencil, which stays live and highlighted
   * as the one way on. The breadcrumb row (with Prev / Next) is left usable
   * so a reader paging through assessments is not stranded on a draft.
   */
  draftLocked?: boolean;
  /**
   * Whether the vertical nav offers Version History.
   *
   * Off on the standalone assessment route
   * (`/recruitment/assessments/[id]`), which no longer carries that tab. The
   * flag lives here rather than the tab being deleted outright because this
   * same view also renders inside the Assessments list
   * (`components/Assessments.tsx`), where Version History stays — so the two
   * hosts differ by this prop instead of by a second copy of the view.
   *
   * Defaults to showing it, so every existing caller is unchanged.
   */
  showVersionHistory?: boolean;
}

/** The canonical "Go to [input] · Previous · page/total · Next" control from
 *  components/Pagination.tsx, reused inline for the Recent Activity tab's
 *  in-memory list, which doesn't otherwise fit that component's
 *  items-per-page/"Showing X-Y" shape. */
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
    <div className="flex flex-wrap items-center max-sm:justify-center gap-2 sm:gap-3">
      <div className="flex items-center gap-1.5">
        <span className="tf-body-secondary whitespace-nowrap">Go to</span>
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
          className="tf-input w-14 h-8 sm:h-9 px-2 text-center"
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

      <span className="tf-label px-1 whitespace-nowrap">
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

/* A tab's page heading — icon-tile + title, the same shape the AI Interview
   Details page's View JD tab opens with (`TabHeading` in
   AIInterviewDetailsView.tsx), so the two View JD tabs read as one screen. */
function TabHeading({ icon: Icon, title }: { icon: React.ComponentType<{ className?: string }>; title: string }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-brand-blue" />
        </div>
        <h2 className="tf-section-title tracking-tight">{title}</h2>
      </div>
    </div>
  );
}

interface Section {
  name: string;
  type: 'hr' | 'technical' | 'coding';
  enabled: boolean;
  percentage: number;
  topics: string[];
  languages?: string[];
  icon: any;
}

// IST timezone constant
const INDIA_TIMEZONE = 'Asia/Kolkata';

/* One option per stat card below (Total Invited, Invited, In Progress,
   Completed, Expired, Terminated, Revoked), in the cards' own keys — so
   picking any card's bucket from the dropdown always shows that card's name
   there. ASSESSMENT_INVITE_STATUS_OPTIONS used 'abandoned'/no 'sent' or
   'revoked' at all, which is why Invited/Terminated/Revoked were missing
   here. */
const ASSESSMENT_DETAILS_STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'sent', label: 'Invited' },
  { value: 'started', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'expired', label: 'Invite Expired' },
  { value: 'terminated', label: 'Terminated' },
  { value: 'revoked', label: 'Revoked' },
];

/**
 * THE ASSESSMENTS AUTHORED AGAINST ONE JOB VERSION, deduped by assessment id.
 *
 * A job version IS a JD row, and an assessment's `jd_id` names the row it was
 * built against — so that id, and nothing else, is what maps a job version to
 * its assessments. Never the version NUMBER: assessment versions restart per
 * job version, so Job V4's "Assessment V2" and Job V3's "Assessment V2" are
 * two different records that happen to share a number, and matching on the
 * number would show one under the other.
 *
 * FILTERED AS WELL AS ASKED. The list endpoint is allowed to WIDEN a `jd_id`
 * filter to the JD's whole lineage; where it does, the reply carries other job
 * versions' assessments, and those are exactly what must not appear here. The
 * row's own `jd_id` is the final word, so the reply can never be broader than
 * the question.
 *
 * This used to fan out across every version in the JD lineage and merge the
 * replies, which is what put a different job version's assessments in the
 * selected one's list — two cards both reading "V1", belonging to different
 * jobs. One version, one question, one answer.
 *
 * Whatever the backend holds for that job version is what comes back: no cap
 * beyond the page size, nothing synthesised for a version that has none.
 *
 * Returned unsorted — callers order it themselves, and they want opposite
 * orders: the Version History tab reads oldest-first, the header's version
 * menu newest-first, the way both version menus on this page do.
 */
const fetchJobVersionAssessments = async (jdId: string): Promise<AssessmentResponse[]> => {
  const response = await assessmentService.list({ jd_id: jdId, page_size: 50 });
  const items: AssessmentResponse[] = response?.items ?? [];
  const byAssessmentId = new Map<string, AssessmentResponse>();
  for (const row of items) {
    if (row?.id && row?.jd_id === jdId) byAssessmentId.set(row.id, row);
  }
  return [...byAssessmentId.values()];
};


/**
 * The assessment's own lifecycle moments for the Recent Activity tab, off the
 * lifecycle audit trail (`getCombinedAuditTrail`, category
 * `assessment_lifecycle` - the Activity Logs tab's source):
 *
 *   assessment_published  the FIRST one is "published"; every later one is
 *                         the assessment edited and published again
 *   assessment_archived   archived
 *   assessment_activated  unarchived (restored to Active) - the event the
 *                         Activity Logs tab already names for it; an
 *                         `assessment_updated` whose own text says it was
 *                         unarchived / restored counts too, since Unarchive is
 *                         a status write through the update endpoint
 *
 * Anything else in the trail (drafts, plain edits, deletes) is not one of the
 * four and stays out. Rows for another assessment are dropped as well, should
 * the endpoint return any.
 */
function toLifecycleEvents(items: CombinedAuditActivity[], assessmentId: string): any[] {
  const ownItems = items
    .filter((item) => !item.assessment_id || item.assessment_id === assessmentId)
    .filter((item) => item.timestamp)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  let publishedSeen = false;
  const events: any[] = [];
  for (const item of ownItems) {
    const type = item.activity_type as string;
    let eventType: string | null = null;
    if (type === 'assessment_published') {
      eventType = publishedSeen ? 'lc_republished' : 'lc_first_published';
      publishedSeen = true;
    } else if (type === 'assessment_archived') {
      eventType = 'lc_archived';
    } else if (
      type === 'assessment_activated'
      || (type === 'assessment_updated' && /unarchiv|restor/i.test(`${item.title || ''} ${item.description || ''}`))
    ) {
      eventType = 'lc_unarchived';
    }
    if (!eventType) continue;
    events.push({
      id: `lifecycle-${item.id}`,
      _lifecycle: true,
      _eventType: eventType,
      _eventAt: item.timestamp,
      actor_name: item.actor_name,
      actor_email: item.actor_email,
    });
  }
  return events;
}

export default function AssessmentDetailsView({
  assessment,
  onBack,
  onEdit,
  onPreview,
  onShare,
  canShare = true,
  canEdit = true,
  onViewResults,
  onRefresh,
  isReloading = false,
  currentIndex,
  totalCount,
  onPrev,
  onNext,
  breadcrumbItems,
  showVersionHistory = true,
  draftLocked = false,
  originQuery = '',
}: AssessmentDetailsViewProps) {
  /* Greyed and out of reach - `inert` takes pointer, keyboard and assistive
     tech; the classes are the visual state. Applied per region rather than
     once on the page so the Edit pencil, nested among them, can stay live. */
  const draftLockProps = draftLocked
    ? { inert: true as const, 'aria-disabled': true, className: 'opacity-50 grayscale select-none' }
    : { className: '' };
  const router = useRouter();
  /** Job Details for this assessment's JD — Go to JD and View JD's "Open
   *  full JD page" alike — carrying this assessment so the JD page's trail
   *  reads AI Assessments › <assessment> › job, and this page's own query
   *  (list / tab / origin) so that crumb comes back to the same view. */
  const jobDetailsHref = (jdId: string) => {
    const params = new URLSearchParams({
      id: jdId,
      from: 'assessment-details',
      assessment_id: assessment.id,
      assessment_title: assessment.title || '',
    });
    const here = typeof window !== 'undefined' ? window.location.search.replace(/^\?/, '') : '';
    if (here) params.set('assessment_query', here);
    return `/recruitment/job-details?${params.toString()}`;
  };
  const searchParams = useSearchParams();
  const { confirmArchive, archiveConfirmModal } = useArchiveAssessmentConfirm();
  const { isTenantAdmin, user, hasPermissionCode } = useAuth();
  const canCreateAssessments = isTenantAdmin || (user?.permissions?.canCreateAssessments ?? false);
  /* Edit / Continue Editing: the view's own create gate plus the host's edit
     permission (`canEdit`). Locked = greyed with a tooltip, never hidden. */
  // Editing is Assessments "Edit" (assessments:update), not "Create" (2026-11-10).
  const canEditAssessment = (isTenantAdmin || hasPermissionCode('assessments:update')) && canEdit;
  /* The All Assessments table's Unarchive gate (`canDeleteAssessments`), so the
     action is offered here to exactly who it is offered to there. */
  const canUnarchiveAssessments = isTenantAdmin || (user?.permissions?.canDeleteAssessments ?? false);
  const isArchivedAssessment = assessment.status === 'Archived';
  const [isUnarchiving, setIsUnarchiving] = useState(false);
  /* The All Assessments table's Unarchive, as is: the dedicated
     /{id}/unarchive endpoint, which restores the status the assessment held
     right before it was archived. The route refetches, so the header and
     every tab redraw off the record the API now returns rather than a local
     patch. */
  const [isArchiving, setIsArchiving] = useState(false);
  /* The All Assessments table's / Assessments page's Archive, as is: same
     confirm, same dedicated /{id}/archive call, same permission and toast,
     then the route refetches - so the header swaps to Unarchive off the
     record the API returns. */
  const handleArchive = async () => {
    if (!canUnarchiveAssessments) {
      toast.error('You do not have permission to archive assessments');
      return;
    }
    if (!await confirmArchive({
      title: `${assessment.jd_title || stripVersionFromTitle(assessment.title) || 'Untitled'} - Assessment`,
      version: assessment.version,
      createdAt: assessment.created_at,
      durationMinutes: assessment.duration_minutes,
    })) return;
    setIsArchiving(true);
    try {
      await assessmentService.archive(assessment.id);
      toast.success('Assessment archived');
      await onRefresh?.();
    } catch (err) {
      console.error('Failed to archive assessment:', err);
      showErrorToast(err, "Couldn't archive assessment");
    } finally {
      setIsArchiving(false);
    }
  };
  const handleUnarchive = async () => {
    if (!canUnarchiveAssessments) {
      toast.error('You do not have permission to unarchive assessments');
      return;
    }
    setIsUnarchiving(true);
    try {
      await assessmentService.unarchive(assessment.id);
      toast.success('Assessment restored to Active');
      await onRefresh?.();
    } catch (err) {
      console.error('Failed to unarchive assessment:', err);
      showErrorToast(err, "Couldn't unarchive assessment");
    } finally {
      setIsUnarchiving(false);
    }
  };
  const [isDuplicating, setIsDuplicating] = useState(false);
  /* Duplicate — the AI Interview Details header's own action, mirrored here:
     assessmentService.clone() (already used by the Assessments list's row
     menu) mints a new Draft version of this assessment and leaves the
     original untouched. The recruiter lands on that new draft's own details
     page — same pattern `handleJobVersionSelect`/version-switching already
     uses to move between assessment records on this route. */
  const handleDuplicate = async () => {
    if (!canCreateAssessments) {
      toast.error('You do not have permission to duplicate assessments');
      return;
    }
    setIsDuplicating(true);
    try {
      const response = await assessmentService.clone(assessment.id);
      toast.success(`Assessment duplicated: "${response.cloned_title}"`);
      router.push(`/recruitment/assessments/${response.cloned_id}${originQuery}`, { scroll: false });
    } catch (err: any) {
      showErrorToast(err, "Couldn't duplicate assessment");
    } finally {
      setIsDuplicating(false);
    }
  };
  /* Read the same way the results ROUTE reads them, so a recruiter who can
     download a report from that page can download it from this tab — the tab
     renders that page's own component, and a permission that disagreed between
     the two would put the same button on one and not the other. */
  const canDownloadResultPDF = isTenantAdmin || hasPermissionCode('assessments:download_report');
  const canBatchDownloadResults = isTenantAdmin || hasPermissionCode('assessments:batch_download');
  /* 'info' is gone from this union: Assessment Info is a horizontal view
     inside Assessment Details now (`DetailsSubTab`), not a destination the
     vertical nav can select. */
  type DetailsTab = 'overview' | 'sections' | 'analytics' | 'invitations' | 'results' | 'activity' | 'versions' | 'newversions' | 'viewjd';
  /* `?tab=` lets another screen deep-link to one of these tabs — the All
     Assessments table's "View History" action lands on `versions` directly,
     rather than dropping the reader on Overview to hunt for it. Read once as
     the INITIAL value, not synced: the tab strip is the owner from then on, so
     clicking a tab does not have to write to the URL to survive a re-render.
     An unrecognised value falls through to 'overview'. */
  const requestedTab = searchParams.get('tab');
  /* 'info' is deliberately absent from this list now. Assessment Info is no
     longer a vertical tab — it is one of the two horizontal views inside
     Assessment Details — so `?tab=info` falls through to 'overview' here and
     is picked up by `detailsSubTab` below. An existing deep link or bookmark
     still lands on that content, just by its new route through the page.

     'versions' is only selectable where the Version History tab is offered;
     where it is not, `?tab=versions` falls through to 'overview' the same way,
     so a deep link to a tab this host does not render cannot strand the reader
     on an empty content column. */
  const deepLinkableTabs: DetailsTab[] = [
    'overview', 'sections', 'analytics', 'invitations', 'results', 'activity', 'newversions', 'viewjd',
    ...(showVersionHistory ? (['versions'] as DetailsTab[]) : []),
  ];
  const initialTab: DetailsTab = deepLinkableTabs.includes(requestedTab as DetailsTab)
    ? (requestedTab as DetailsTab)
    : 'overview';
  const [activeTab, setActiveTab] = useState<DetailsTab>(initialTab);
  /* The route keeps this view mounted when it moves to another assessment
     (Version History's eye icon opens a version on `?tab=results` from
     inside this page), so a newly requested tab is applied on that move. */
  useEffect(() => {
    if (requestedTab && deepLinkableTabs.includes(requestedTab as DetailsTab)) {
      setActiveTab(requestedTab as DetailsTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedTab, assessment.id]);
  /* WHICH of Assessment Details' two horizontal views is open. Configure
     Details — the rounds, Technical / Coding / HR — unless the reader asked
     for `?tab=info`, which is what keeps the old deep link working. */
  type DetailsSubTab = 'configure' | 'info';
  const [detailsSubTab, setDetailsSubTab] = useState<DetailsSubTab>(
    requestedTab === 'info' ? 'info' : 'configure',
  );
  /* ── Job version selector ────────────────────────────────────────────────
   *
   * The Job Details page's control, in the Job Details grammar: a solid purple
   * badge showing the version you are on, opening a menu of every version of
   * the job. Selecting one navigates, exactly as it does there - which is what
   * makes "show only V2's data" true without a second code path. The route
   * refetches for the assessment it lands on, so nothing from V1 can survive
   * into a V2 view.
   *
   * The job's versions only. It does NOT list the assessment's own versions;
   * those are the New Versions tab's job, and conflating the two is the
   * ambiguity this page labels its way out of everywhere else.
   *
   * One request on mount for the lineage (the list is needed to draw the
   * menu). The assessment for a chosen version is looked up only when that
   * version is actually clicked, rather than fanning out a request per version
   * up front - a job with six versions would otherwise cost seven requests on
   * every page load to populate a menu most readers never open.
   */
  const [jobVersions, setJobVersions] = useState<JDLineageVersion[]>([]);
  const [showVersionMenu, setShowVersionMenu] = useState(false);
  /* A switch in flight: the job version being opened, and the assessment it
     was started FROM. The second half is what ends it — see
     `jobVersionSwitchingTo`. */
  const [versionSwitching, setVersionSwitching] = useState<{ toJdId: string; fromAssessmentId: string } | null>(null);
  const versionMenuRef = useRef<HTMLDivElement | null>(null);
  /* The trigger and the rows, for keyboard use: Escape hands focus back to the
     button that opened the menu, and Arrow/Home/End walk the rows. */
  const versionTriggerRef = useRef<HTMLButtonElement | null>(null);
  const versionItemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  /* From `sm` up, each version popover hangs off its own pill at `left-0`. On a
     tablet the pills wrap to the right end of the facts row, where a
     left-anchored menu ran off the screen (768px: 536→856). Measured on open:
     when the room right of the pill is shorter than the menu, it opens
     leftward from the pill's right edge instead. Below `sm` the menus anchor to
     the full-width row and this has no effect. */
  const [versionMenuOpensLeft, setVersionMenuOpensLeft] = useState(false);
  const [assessmentVersionMenuOpensLeft, setAssessmentVersionMenuOpensLeft] = useState(false);
  const menuOverflowsRight = (anchor: HTMLElement | null, menuWidthPx: number) =>
    !!anchor && anchor.getBoundingClientRect().left + menuWidthPx > window.innerWidth - 12;

  /* WHO AUTHORED EACH JOB VERSION, by version id.
   *
   * The lineage endpoint does not carry it - it returns id, title, version
   * number, status and dates and nothing else (see `useJobVersionLineage`,
   * whose version table has the same gap) - so the name comes from each
   * version's own JD record, exactly as the Job Openings version history
   * gets it.
   *
   * ONE REQUEST PER VERSION, and that is why it runs on the first OPEN of the
   * menu rather than on mount: a reader who never opens it pays nothing, and
   * a page with a six-version job does not spend six requests on a name
   * nobody asked to see. Results land one at a time, so the rows fill in as
   * they arrive instead of the menu waiting on the slowest. A version whose
   * fetch fails simply shows no author line; nothing is invented here. */
  const [jobVersionAuthors, setJobVersionAuthors] = useState<Record<string, string>>({});
  const jobVersionAuthorsRequested = useRef<Set<string>>(new Set());

  const ensureJobVersionAuthors = (versions: JDLineageVersion[]) => {
    versions.forEach((version) => {
      if (!version?.id || jobVersionAuthorsRequested.current.has(version.id)) return;
      jobVersionAuthorsRequested.current.add(version.id);
      jdService
        .getById(version.id)
        .then((full) => {
          const name = full?.created_by_name;
          if (!name) return;
          setJobVersionAuthors((prev) => (prev[version.id] ? prev : { ...prev, [version.id]: name }));
        })
        .catch(() => { /* the row drops its author line rather than guessing */ });
    });
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!assessment?.jd_id) return;
      try {
        const lineage = await jdService.getLineageVersions(assessment.jd_id);
        if (!cancelled) setJobVersions(Array.isArray(lineage) ? lineage : []);
      } catch (error) {
        console.error('[TalentFlow] Failed to load job versions:', error);
        if (!cancelled) setJobVersions([]);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [assessment?.jd_id]);

  /* Close on an outside click, the way the Job Details menu does. */
  useEffect(() => {
    if (!showVersionMenu) return;
    const onDown = (e: MouseEvent) => {
      if (versionMenuRef.current && !versionMenuRef.current.contains(e.target as Node)) {
        setShowVersionMenu(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showVersionMenu]);

  /* Newest first, on the version number the lineage reports. */
  const sortedJobVersions = useMemo(
    () => [...jobVersions].sort((a, b) => (b?.version_number ?? 0) - (a?.version_number ?? 0)),
    [jobVersions],
  );

  /* WHICH JOB VERSION THIS PAGE IS ON — the number every badge, menu header
     and panel on this page states.

     RESOLVED FROM THE JD ROW, not read off the assessment. `jd_id` names the
     JD row the assessment was authored against, and that row's own
     `version_number` is what the lineage endpoint is authoritative about. The
     assessment's `jd_version` is a SNAPSHOT the backend stamps at creation
     ("Version of the JD at the time of assessment creation"), so it describes
     the job as it was then, not the row the page is reading now — which is
     why opening Job V2's assessment left the badge saying V1 while every
     other surface had moved on.

     The snapshot is still the fallback, and only that: it is all there is
     before the lineage request lands, and all there is if it fails or no
     longer returns the row this assessment points at. Same precedence the
     assessments list's version panel uses to place an assessment under a job
     version (`AssessmentVersionHistoryPanel.jobVersionOf`) — id first, number
     second — so both screens name the same version for the same record.

     Nothing is held in state: it is derived from the record on screen and the
     lineage already loaded for it, so it cannot go stale behind a switch. */
  const selectedJobVersionNumber = (() => {
    const fromLineage = jobVersions.find((v) => v.id === assessment?.jd_id)?.version_number;
    if (fromLineage != null) return fromLineage;
    return typeof assessment?.jd_version === 'number' ? assessment.jd_version : undefined;
  })();

  /* THE SWITCH STILL IN FLIGHT, or null — the row that spins and the reason
     the rest of the menu is held.

     DERIVED from the record on screen, not cleared by hand. The page keeps
     the current version rendered while the next one loads, so "switching" has
     to end when the new record ARRIVES — not when `router.push` returns,
     which is immediately and long before the data.

     Ended by the record it STARTED FROM leaving the screen, rather than by
     the target arriving. Both mean the switch is over, but only this one also
     covers landing somewhere else entirely — a Prev/Next step taken while the
     switch was in flight — which a test against the target would leave spinning
     on a menu disabled for the rest of the visit. No effect, nothing to clear,
     and nothing to strand if the navigation never completes. */
  const jobVersionSwitchingTo =
    versionSwitching && versionSwitching.fromAssessmentId === assessment?.id
      ? versionSwitching.toJdId
      : null;

  /* Opening the menu puts focus on the version you are ON, so a keyboard user
     starts where a reader's eye starts and Arrow keys move out from there. The
     rows carry `focus-visible` rings rather than `focus`, so a mouse click
     does not leave one behind. */
  useEffect(() => {
    if (!showVersionMenu) return;
    /* Drop any entry left by a longer previous lineage before reading the
       array — a stale node would otherwise take a turn in the Arrow order. */
    versionItemRefs.current.length = sortedJobVersions.length;
    const currentIndex = sortedJobVersions.findIndex((v) => v.id === assessment?.jd_id);
    const rows = versionItemRefs.current;
    (rows[currentIndex >= 0 ? currentIndex : 0] ?? rows.find(Boolean))?.focus();
  }, [showVersionMenu, sortedJobVersions, assessment?.jd_id]);

  /* Menu keyboard model, the one a `role="menu"` is expected to have: the
     arrows wrap top-to-bottom, Home/End jump the ends, Escape closes and
     returns focus to the trigger, and Tab closes rather than leaving an open
     menu behind the rest of the page. Enter/Space are the button's own. */
  const handleVersionMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const rows = versionItemRefs.current.filter(Boolean) as HTMLButtonElement[];
    if (!rows.length) return;
    const at = rows.indexOf(document.activeElement as HTMLButtonElement);
    const focusAt = (index: number) => rows[(index + rows.length) % rows.length]?.focus();

    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); focusAt(at + 1); break;
      case 'ArrowUp': e.preventDefault(); focusAt(at - 1); break;
      case 'Home': e.preventDefault(); rows[0]?.focus(); break;
      case 'End': e.preventDefault(); rows[rows.length - 1]?.focus(); break;
      case 'Escape':
        e.preventDefault();
        setShowVersionMenu(false);
        versionTriggerRef.current?.focus();
        break;
      case 'Tab':
        setShowVersionMenu(false);
        break;
      default:
        break;
    }
  };

  /** The house JD status palette (`JobDetailView.getStatusBadgeClass`), on the
   *  lowercase status the lineage endpoint returns. */
  // Canonical JD-version status → Badge variant (shared mapping, no drift).
  const jobVersionStatusVariant = (status?: string): 'success' | 'info' | 'warning' | 'destructive' | 'muted' => {
    switch ((status || '').toLowerCase()) {
      case 'published': return 'success';
      case 'republished': return 'info';
      case 'draft': return 'warning';
      case 'disabled': return 'destructive';
      case 'archived': return 'muted';
      default: return 'muted';
    }
  };

  /**
   * Open the assessment authored against THIS job version.
   *
   * The assessment is looked up by the version's own JD row id, which is the
   * join every other surface on this page uses - a job version IS a JD row,
   * and `jd_id` on an assessment names the row it was built against. Newest
   * assessment wins where a version carries more than one.
   *
   * Navigates rather than swapping state in place, so the header, every tab
   * and every fetch keyed on the assessment id reloads for the new version.
   *
   * The route no longer tears the view down to do it — that unmount was the
   * page-wide shake — so what keeps V1's data out of a V2 view is no longer
   * the remount. Every cache this file holds is stored with the record or job
   * version it was fetched for and read only while the two agree, so the
   * moment the new record lands the old JD, sibling list and activity
   * timeline stop being readable and their panels show their own loading
   * state until the matching data arrives.
   */
  const handleJobVersionSelect = async (version: JDLineageVersion) => {
    setShowVersionMenu(false);
    if (!version?.id || version.id === assessment?.jd_id) return;
    setVersionSwitching({ toJdId: version.id, fromAssessmentId: assessment?.id });
    try {
      const res = await assessmentService.list({ jd_id: version.id, page_size: 50 });
      /* Scoped by the ROW's own `jd_id`, not just by the filter sent: the
         endpoint may widen a `jd_id` to the JD's whole lineage (see
         `fetchJobVersionAssessments`), and the newest assessment in a widened
         reply can belong to a different job version — which would land the
         recruiter on a version other than the one they clicked. */
      const items: AssessmentResponse[] = (res?.items ?? [])
        .filter((row) => row?.jd_id === version.id);
      if (!items.length) {
        /* The page STAYS on the assessment it is showing. Falling back to
           another job version's assessment would put the reader on a record
           the badge they just clicked does not describe. */
        toast.error(
          `No assessment version is currently associated with Job V${version.version_number ?? 1}.`,
        );
        setVersionSwitching(null);
        return;
      }
      const newest = [...items].sort((a, b) => (b?.version ?? 0) - (a?.version ?? 0))[0];
      /* LEFT SET through the navigation, and `scroll: false` with it.
         `router.push` resolves at once, so clearing here would kill the row's
         spinner while the fetch it stands for is still running —
         `jobVersionSwitchingTo` ends it when the new record lands instead.
         The scroll option is what keeps the reader where they were: this is a
         version swapped in place, not a new page arrived at, and jumping to
         the top is the jump there is no reason for. */
      router.push(`/recruitment/assessments/${newest.id}${originQuery}`, { scroll: false });
    } catch (error) {
      console.error('[TalentFlow] Failed to open the assessment for that job version:', error);
      showErrorToast(error, "Couldn't open that job version");
      setVersionSwitching(null);
    }
  };

  /* ── Assessment version selector ─────────────────────────────────────────
   *
   * The Job version badge's twin, for the OTHER version this page carries.
   * Same control, same grammar: the badge states the version you are on,
   * opens a menu of every version of this assessment, and selecting one
   * navigates to it — so "show only V2's data" is true here for exactly the
   * reason it is true there, without a second code path.
   *
   * SCOPED TO THE SELECTED JOB VERSION. The job version on the Manage Jobs
   * badge is the source of truth: this menu lists the assessments authored
   * against THAT JD row and no other. It used to read the whole JD lineage —
   * every job version's assessments merged into one list — so a page on Job
   * v1 offered assessments belonging to v2 and v3, and picking one silently
   * moved the reader to a different job version than the badge beside it
   * claimed. Switching job version through Manage Jobs therefore re-scopes
   * this menu on its own: a new record means a new `jd_id`, and the rows are
   * fetched for that id.
   *
   * It still does NOT list the JOB's versions; conflating the two is the
   * ambiguity this page labels its way out of everywhere else, and the badge
   * beside it is where they live. The New Versions tab is the other reading —
   * the whole lineage, across job versions — and stays that way.
   *
   * FETCHED ON FIRST OPEN, not on mount. One request, for this job version's
   * assessments, when the menu is actually opened, then kept for the rest of
   * the visit. The menu says it is loading in the meantime; the badge itself
   * is never dead.
   */
  /* Held WITH the assessment id it was fetched for, rather than reset by an
     effect when that id changes: a different record is a different lineage,
     and a cache that has to be cleared by a render pass is a cache that is
     briefly wrong. A stale entry simply stops matching and is refetched. */
  const [assessmentVersions, setAssessmentVersions] = useState<{ assessmentId: string; rows: any[] } | null>(null);
  const [assessmentVersionsLoading, setAssessmentVersionsLoading] = useState(false);
  const [showAssessmentVersionMenu, setShowAssessmentVersionMenu] = useState(false);
  const [assessmentSwitching, setAssessmentSwitching] = useState<{ toId: string; fromId: string } | null>(null);
  const assessmentVersionMenuRef = useRef<HTMLDivElement | null>(null);

  /* Close on an outside click, exactly as the job menu does. */
  useEffect(() => {
    if (!showAssessmentVersionMenu) return;
    const onDown = (e: MouseEvent) => {
      if (
        assessmentVersionMenuRef.current &&
        !assessmentVersionMenuRef.current.contains(e.target as Node)
      ) {
        setShowAssessmentVersionMenu(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showAssessmentVersionMenu]);

  /* The cached rows, but only if they belong to the assessment on screen. */
  const assessmentVersionRows =
    assessmentVersions && assessmentVersions.assessmentId === assessment?.id
      ? assessmentVersions.rows
      : null;

  const toggleAssessmentVersionMenu = () => {
    const opening = !showAssessmentVersionMenu;
    if (opening) setAssessmentVersionMenuOpensLeft(menuOverflowsRight(assessmentVersionMenuRef.current, 256));
    setShowAssessmentVersionMenu(opening);
    if (!opening || assessmentVersionRows || assessmentVersionsLoading) return;
    /* No `jd_id`, no lineage to ask about: an assessment with no job behind it
       is its own only version, so the menu says so rather than fetching. */
    if (!assessment?.jd_id) {
      setAssessmentVersions({ assessmentId: assessment?.id, rows: [] });
      return;
    }
    const requestedFor = assessment.id;
    const scopedToJdId = assessment.jd_id;
    setAssessmentVersionsLoading(true);
    /* The same fetch the sibling-versions tab runs — one helper, so the menu
       and the tab cannot drift into listing different versions of the same
       job version. It filters the reply on the row's own `jd_id` as well as
       asking for it; see `fetchJobVersionAssessments`. */
    fetchJobVersionAssessments(scopedToJdId)
      .then((rows) => {
        setAssessmentVersions({ assessmentId: requestedFor, rows });
      })
      .catch((error) => {
        console.error('[TalentFlow] Failed to load assessment versions:', error);
        setAssessmentVersions({ assessmentId: requestedFor, rows: [] });
      })
      .finally(() => setAssessmentVersionsLoading(false));
  };

  /* Newest first, on the version the record reports — the order the job menu
     lists its versions in. */
  const sortedAssessmentVersions = useMemo(
    () => [...(assessmentVersionRows ?? [])].sort((a, b) => (b?.version ?? 0) - (a?.version ?? 0)),
    [assessmentVersionRows],
  );
  /* The highest assessment version ON THIS JOB VERSION, for the "Latest" chip
     — the job menu reads a flag the lineage endpoint sets; assessments carry
     no such flag, so it is derived from the list the menu is drawing. */
  const latestAssessmentVersion = useMemo(
    () => sortedAssessmentVersions.reduce((max, row) => Math.max(max, row?.version ?? 0), 0),
    [sortedAssessmentVersions],
  );

  /* The job menu's twin — see `jobVersionSwitchingTo`. This one matters more
     than a spinner: `handleAssessmentVersionSelect` has no completion to
     clear on, and the view no longer unmounts to reset it, so a value held in
     state would leave the whole menu disabled for the rest of the visit. */
  const assessmentSwitchingTo =
    assessmentSwitching && assessmentSwitching.fromId === assessment?.id
      ? assessmentSwitching.toId
      : null;

  /**
   * Open THIS version of the assessment.
   *
   * Navigates rather than swapping state in place, for the same reason the job
   * menu does: the header, every tab and every fetch keyed on the assessment
   * id reloads for the version selected, and the per-record caches described
   * on `handleJobVersionSelect` are what stop anything from V1 being read in a
   * V2 view. A Draft lands on the route's own draft rule, which
   * sends it to the configure page the Edit action opens; the version menu
   * does not carry a second copy of that decision.
   */
  const handleAssessmentVersionSelect = (version: any) => {
    setShowAssessmentVersionMenu(false);
    if (!version?.id || version.id === assessment?.id) return;
    setAssessmentSwitching({ toId: version.id, fromId: assessment?.id });
    /* In place, like the job menu: the reader is swapping a version, not
       opening a new page, so the scroll position is theirs to keep. */
    router.push(`/recruitment/assessments/${version.id}${originQuery}`, { scroll: false });
  };

  /* The tabs, as data.
   *
   * Six near-identical buttons used to be written out longhand, which is why
   * one of them (New Versions) had quietly lost the `min-w`/`text-center` the
   * other five carried. One list, one renderer, and they cannot drift again.
   *
   * The ids, the labels and their order are exactly as they were - this is a
   * change of layout, not of what the page offers. `?tab=` still deep-links to
   * any of them, because `activeTab` is untouched.
   *
   * Icons come from the set this file already imports, matching the Result
   * Details nav, which is icon-led. `Layers` is the version-history glyph the
   * assessments list already uses for Job Versions; `Copy` for New Versions,
   * because duplicating is what mints one.
   */
  /* WHAT THE SIBLING-VERSIONS TAB IS CALLED.
   *
   * "Version History" wherever this page does not also carry the edit-history
   * tab of that name - which is the standalone assessment route, the one host
   * that passes `showVersionHistory={false}`. The tab lists every version of
   * this assessment, so that is what it is; "New Versions" only ever read as
   * "the ones minted since", which is not what it shows.
   *
   * It stays "New Versions" on the host that still renders the edit-history
   * tab (the Assessments list's inline detail view), because two entries in
   * one nav both labelled "Version History" is worse than the old name. The
   * icon moves with the label, and `Layers` is the one the tab's own panel
   * header already uses. */
  const siblingVersionsTabLabel = showVersionHistory ? 'New Versions' : 'Version History';
  const siblingVersionsTabIcon = showVersionHistory ? Copy : Layers;

  const detailTabs: { id: DetailsTab; label: string; icon: typeof FileText }[] = [
    { id: 'overview', label: 'Assessment Details', icon: FileText },
    /* Directly after Assessment Details, which is the entry whose content ends
       with the HR / Behavioral round — and directly before Recent Activity, the
       per-candidate list its "View Full Tracking" button opens. `Mail` is the
       glyph the card itself already carried. */
    { id: 'invitations', label: 'Invitation Status', icon: Mail },
    /* Results, directly after the invitations they come from — invite, then
       what came back. It is the results page itself, embedded, opening on this
       assessment's job version and revision; see the panel below. `BarChart` is
       the glyph Results carries everywhere else in the app. */
    { id: 'results', label: 'Results', icon: BarChart },
    { id: 'activity', label: 'Recent Activity', icon: Clock },
    /* Version History is dropped entirely on hosts that pass
       `showVersionHistory={false}` — filtered out of the list rather than
       rendered disabled, so the nav closes up with no gap and the entries
       below it keep their spacing. */
    ...(showVersionHistory
      ? [{ id: 'versions' as DetailsTab, label: 'Version History', icon: Layers }]
      : []),
    /* Assessment Info is NOT here any more — it is the second of Assessment
       Details' two horizontal views (`detailsSubTabs`), because it describes
       this assessment rather than being a place of its own. */
    { id: 'viewjd', label: 'View JD', icon: Briefcase },
    { id: 'newversions', label: siblingVersionsTabLabel, icon: siblingVersionsTabIcon },
  ];

  /** The horizontal pair inside the Assessment Details card, in order. */
  const detailsSubTabs: { id: DetailsSubTab; label: string; icon: typeof FileText }[] = [
    { id: 'configure', label: 'Configure Details', icon: Sliders },
    { id: 'info', label: 'Assessment Info', icon: Info },
  ];
  /* The invitation timeline, held WITH the assessment it was built from —
     the shape the JD and the sibling list use, for the same reason. The view
     stays mounted through a version switch, so a bare array kept V1's
     candidates on screen under V2's header until the refetch landed, and a
     bare array emptied on the way would have claimed there were none.

     `recentActivity` reads as the empty list so the dozen call sites below
     are unchanged, and `activityPending` is what the panels branch on: not
     loaded FOR THIS RECORD is a load in progress, not a result. */
  const [activityCache, setActivityCache] = useState<{ assessmentId: string; events: any[] } | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityPage, setActivityPage] = useState(1);
  const activityRows =
    activityCache && activityCache.assessmentId === assessment?.id ? activityCache.events : null;
  const recentActivity = activityRows ?? [];
  /* The ASSESSMENT's own lifecycle - first published, edited & published,
     archived, unarchived - from the lifecycle audit trail (Settings > Activity
     Logs' source), held apart from `recentActivity` because the invite stat
     cards bucket that list as candidates. Merged with it only for the Recent
     Activity tab's feed, newest first. */
  const [lifecycleCache, setLifecycleCache] = useState<{ assessmentId: string; events: any[] } | null>(null);
  const lifecycleEvents =
    lifecycleCache && lifecycleCache.assessmentId === assessment?.id ? lifecycleCache.events : [];
  const activityFeed = lifecycleEvents.length
    ? [...recentActivity, ...lifecycleEvents].sort(
        (a, b) => new Date(b._eventAt).getTime() - new Date(a._eventAt).getTime(),
      )
    : recentActivity;
  const activityPending = activityLoading || activityRows === null;

  /* ── INVITATION STATUS ───────────────────────────────────────────────
   *
   * The Assessments page's "Assessments - Invite Status Tracking" popup, as
   * this page's own tab: same stat cards, same filter bar, same table (see
   * `AssessmentInviteTable`), same placeholders and the same pager. The tab
   * used to be a five-row summary built out of the Recent Activity timeline,
   * which is a different list answering a different question — one row per
   * lifecycle EVENT, deduped down to five, with no filters, no paging and no
   * actions. A recruiter comparing the two saw different statuses for the same
   * candidate.
   *
   * Scoped to THIS assessment, so there are no Job Version / Assessment
   * Version columns: every row belongs to the record on screen and there is
   * nothing to disambiguate. The popup carries them because it can be opened
   * on a whole job.
   *
   * Server-side throughout — status, search and the date range go to
   * `listInvitations` as query parameters and paging is the endpoint's, the
   * same call the popup makes. Nothing is filtered or counted in the browser,
   * so the numbers on the cards describe the whole assessment rather than the
   * page that happens to be loaded.
   */
  const INVITATIONS_PAGE_SIZE = 10;
  const [inviteRows, setInviteRows] = useState<any[]>([]);
  const [inviteTotal, setInviteTotal] = useState(0);
  const [inviteTotalPages, setInviteTotalPages] = useState(1);
  const [invitePage, setInvitePage] = useState(1);
  const [inviteFilters, setInviteFilters] = useState<InviteFilterState>(EMPTY_INVITE_FILTERS);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteRefreshing, setInviteRefreshing] = useState(false);
  /* The unfiltered summary the cards read. Held apart from the rows on
     purpose: selecting a bucket narrows the table without collapsing the
     other cards to zero, which is what makes them navigable. */
  const [inviteStats, setInviteStats] = useState({
    total: 0, expired: 0, started: 0, completed: 0, failed: 0, terminated: 0,
    invited: 0, revoked: 0,
  });
  const [inviteSelectedIds, setInviteSelectedIds] = useState<Set<string>>(new Set());
  const [editingEmailId, setEditingEmailId] = useState<string | null>(null);
  const [newEmailValue, setNewEmailValue] = useState('');
  const [isSendingChangeEmail, setIsSendingChangeEmail] = useState(false);
  const [resendTarget, setResendTarget] = useState<any | null>(null);
  const [revokeInviteTarget, setRevokeInviteTarget] = useState<any | null>(null);
  const [editInviteTarget, setEditInviteTarget] = useState<any | null>(null);
  const [isResending, setIsResending] = useState(false);

  const inviteHasActiveFilters =
    inviteFilters.search.trim() !== '' ||
    inviteFilters.status !== 'all' ||
    inviteFilters.dateFrom !== '' ||
    inviteFilters.dateTo !== '';
  const inviteStartIndex = inviteTotal === 0 ? 0 : (invitePage - 1) * INVITATIONS_PAGE_SIZE + 1;
  const inviteEndIndex = Math.min(invitePage * INVITATIONS_PAGE_SIZE, inviteTotal);
  const inviteResultsLabel = inviteHasActiveFilters
    ? `${inviteTotal} matching invite${inviteTotal === 1 ? '' : 's'}`
    : `Showing ${inviteStartIndex} to ${inviteEndIndex} of ${inviteTotal} invites`;
  /* The popup's two loading states, which have to look different. Nothing on
     screen yet: the spinner is the whole body. Rows already there and being
     re-read: they stay put under a veil, so a page turn or a filter change
     cannot resize the panel. */
  const inviteInitialLoading = inviteLoading && inviteRows.length === 0;
  const inviteRefreshVeil = (inviteLoading || inviteRefreshing) && inviteRows.length > 0;

  /* This assessment's job version: Disabled OR Archived locks its invite
     actions (was Disabled only), and names it in the banner. */
  const thisJobVersion = jobVersions.find((v) => v.id === assessment?.jd_id);
  const thisVersionLock = splitJobVersions(thisJobVersion ? [thisJobVersion] : []).locked[0] ?? null;
  const thisVersionLocked = isJdDisabled(thisJobVersion?.status) || !!thisVersionLock;
  const inviteSelectableIds = (isAssessmentArchived(assessment?.status) || thisVersionLocked)
    ? []
    : inviteRows.filter(isBulkActionable).map((inv: any) => inv.id);
  const allInvitesSelected =
    inviteSelectableIds.length > 0 && inviteSelectableIds.every((id: string) => inviteSelectedIds.has(id));
  /* The bulk bar offers Resend/Revoke only when EVERY selected row is
     uniformly that action-eligible — same rule as the Invite Tracking popup
     (Assessments.tsx's allTrackingResendable/allTrackingRevocable): a mixed
     selection (one Invited, one Expired) gets neither button, since there is
     no single action that would apply to both rows at once. */
  const inviteSelectedRows = inviteRows.filter((inv: any) => inviteSelectedIds.has(inv.id));
  const allInviteSelectedResendable = inviteSelectedRows.length > 0 && inviteSelectedRows.every(isBulkResendable);
  const allInviteSelectedRevocable = inviteSelectedRows.length > 0 && inviteSelectedRows.every(isBulkRevocable);
  const toggleInviteSelectAll = () =>
    setInviteSelectedIds(() => (allInvitesSelected ? new Set<string>() : new Set<string>(inviteSelectableIds)));
  const toggleInviteSelectOne = (id: string) =>
    setInviteSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const loadInviteRows = async (assessmentId: string, page: number, filters: InviteFilterState) => {
    setInviteLoading(true);
    try {
      const response = await assessmentService.listInvitations(assessmentId, {
        status: filters.status !== 'all' ? filters.status : undefined,
        search: filters.search.trim() || undefined,
        invite_date_from: filters.dateFrom || undefined,
        invite_date_to: filters.dateTo || undefined,
        page,
        page_size: INVITATIONS_PAGE_SIZE,
      });
      const items = response.items || [];
      setInviteRows(items);
      setInviteTotal(response.total || 0);
      const totalPages = Math.max(1, response.total_pages || Math.ceil((response.total || 0) / INVITATIONS_PAGE_SIZE));
      setInviteTotalPages(totalPages);
      /* A filter that empties the last page pulls the tab back onto one that
         exists, rather than leaving it on a page with nothing on it. */
      if (items.length === 0 && (response.total || 0) > 0 && page > 1) {
        setInvitePage(Math.min(page - 1, totalPages));
      }
    } catch (error) {
      console.error('Failed to load invitations:', error);
      showErrorToast(error, "Couldn't load invitations", {
        id: 'assessment-details-invitations-load',
        retry: () => loadInviteRows(assessmentId, page, filters),
      });
      setInviteRows([]);
      setInviteTotal(0);
      setInviteTotalPages(1);
    } finally {
      setInviteLoading(false);
    }
  };

  /* The card numbers, from an UNFILTERED call — the summary fields the list
     endpoint returns beside the page of rows. Asked for with page_size 1
     because only the totals are wanted. */
  const loadInviteSummary = async (assessmentId: string) => {
    try {
      const response = await assessmentService.listInvitations(assessmentId, { page: 1, page_size: 1 });
      setInviteStats({
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
    }
  };

  useEffect(() => {
    if (!assessment?.id || activeTab !== 'invitations') return;
    /* The fetch flips its own loading flag before its first await, which is
       the shape every loader on this screen and in the tracking popup has. */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadInviteRows(assessment.id, invitePage, inviteFilters);
  }, [assessment?.id, activeTab, invitePage, inviteFilters]);

  useEffect(() => {
    if (!assessment?.id || activeTab !== 'invitations') return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadInviteSummary(assessment.id);
  }, [assessment?.id, activeTab]);

  /* A tick left on a row that a filter or a page turn has taken away is a
     selection the reader can no longer see, and Resend (n) would count it. */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInviteSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const valid = new Set(inviteRows.filter(isBulkActionable).map((inv: any) => inv.id));
      const next = new Set([...prev].filter((id) => valid.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [inviteRows]);

  const refreshInvites = async () => {
    if (!assessment?.id || inviteRefreshing || inviteLoading) return;
    setInviteRefreshing(true);
    try {
      await Promise.all([
        loadInviteRows(assessment.id, invitePage, inviteFilters),
        loadInviteSummary(assessment.id),
      ]);
    } finally {
      setInviteRefreshing(false);
    }
  };

  const reloadInvites = async () => {
    if (!assessment?.id) return;
    await Promise.all([
      loadInviteRows(assessment.id, invitePage, inviteFilters),
      loadInviteSummary(assessment.id),
      // The header counts and Overview/Analytics read the `assessment` prop,
      // so the parent must refetch it too or they stay on pre-action numbers.
      onRefresh?.(),
    ]);
  };
  /* Invites go out in the background after they are queued: re-read the
     invite table, its summary and the header counts as they actually go out. */
  useBackgroundWorkRefresh(() => { void reloadInvites(); }, ['invite']);

  /* Opens the candidate's Result Details — the same route and the same
     Prev/Next list the Recent Activity tab hands it, so paging between
     candidates works identically whichever tab opened one. */
  const openInviteResult = (invitation: any) => {
    if (!opensTrackedInviteDetails(invitation)) return;
    try {
      const navList = inviteRows
        .filter(opensTrackedInviteDetails)
        .map((inv: any) => ({ id: inv.attempt_id, cid: inv.candidate_display_id || '' }));
      sessionStorage.setItem('assessmentResultNavList', JSON.stringify(navList));
    } catch { /* ignore quota errors */ }
    /* Back to this assessment's Invite Status tab — breadcrumb and browser
       Back alike. See resultReturnContext. */
    const returnTo = currentResultReturnTo('invitations');
    rememberResultReturn(returnTo);
    router.push(
      `/recruitment/assessments/${assessment.id}/results/details`
      + `?candidate_id=${invitation.attempt_id}`
      + `${invitation.candidate_display_id ? `&cid=${encodeURIComponent(invitation.candidate_display_id)}` : ''}`
      + resultReturnQuery(returnTo, stripVersionFromTitle(assessment.title))
    );
  };

  const handleResendInvite = async (invitation: any) => {
    setIsResending(true);
    try {
      await api.post(`/assessments/${assessment.id}/invitations/${invitation.id}/resend`);
      toast.success('New invitation link generated and emailed!');
      await reloadInvites();
    } catch (error: any) {
      console.error('Failed to resend invitation:', error);
      showErrorToast(error, "Couldn't resend invitation");
    } finally {
      setIsResending(false);
      setResendTarget(null);
    }
  };

  /* Bulk Resend — the popup's flow: a confirmation naming the count, then the
     sends run SEQUENTIALLY. A burst of parallel resends is exactly what mail
     rate-limiters punish, and a partial failure has to be reportable, so each
     row is awaited and counted rather than fired off together. */
  const [showInviteBulkResend, setShowInviteBulkResend] = useState(false);
  const [isBulkResendingInvites, setIsBulkResendingInvites] = useState(false);

  const handleInviteBulkResend = async () => {
    const targets = inviteRows.filter(
      (inv: any) => inviteSelectedIds.has(inv.id) && isBulkResendable(inv)
    );
    if (targets.length === 0) {
      setShowInviteBulkResend(false);
      return;
    }
    setIsBulkResendingInvites(true);
    let sent = 0;
    let failedCount = 0;
    const failedIds = new Set<string>();
    for (const invitation of targets) {
      try {
        await api.post(`/assessments/${assessment.id}/invitations/${invitation.id}/resend`);
        sent += 1;
      } catch (error) {
        console.error('Failed to resend invitation:', invitation.id, error);
        failedCount += 1;
        failedIds.add(invitation.id);
      }
    }
    if (sent > 0) toast.success(`New invitation link sent to ${sent} candidate${sent === 1 ? '' : 's'}.`);
    if (failedCount > 0) showErrorToast(null, `Couldn't resend ${failedCount} invitation${failedCount === 1 ? '' : 's'}`);
    setIsBulkResendingInvites(false);
    setShowInviteBulkResend(false);
    /* Any success: keep only the failed rows ticked (retry) and reload.
       All failed: nothing changed — keep the selection as is. */
    if (sent > 0) {
      setInviteSelectedIds(failedIds);
      await reloadInvites();
    }
  };

  /* Bulk Revoke — mirrors Bulk Resend above (and the Track Invites popup's
     handleTrackingBulkRevoke): sequential, re-derives eligibility at send
     time since a row's status can have moved since it was ticked. */
  const [showInviteBulkRevoke, setShowInviteBulkRevoke] = useState(false);
  const [isBulkRevokingInvites, setIsBulkRevokingInvites] = useState(false);

  const handleInviteBulkRevoke = async () => {
    const targets = inviteRows.filter(
      (inv: any) => inviteSelectedIds.has(inv.id) && isBulkRevocable(inv)
    );
    if (targets.length === 0) {
      setShowInviteBulkRevoke(false);
      return;
    }
    setIsBulkRevokingInvites(true);
    let revoked = 0;
    let failedCount = 0;
    const failedIds = new Set<string>();
    for (const invitation of targets) {
      try {
        await assessmentService.revokeInvitation(assessment.id, invitation.id);
        revoked += 1;
      } catch (error) {
        console.error('Failed to revoke invitation:', invitation.id, error);
        failedCount += 1;
        failedIds.add(invitation.id);
      }
    }
    if (revoked > 0) toast.success(`Revoked ${revoked} invitation${revoked === 1 ? '' : 's'}.`);
    if (failedCount > 0) showErrorToast(null, `Couldn't revoke ${failedCount} invitation${failedCount === 1 ? '' : 's'}`);
    setIsBulkRevokingInvites(false);
    setShowInviteBulkRevoke(false);
    /* Any success: keep only the failed rows ticked (retry) and reload.
       All failed: keep the selection as is. */
    if (revoked > 0) {
      setInviteSelectedIds(failedIds);
      await reloadInvites();
    }
  };

  const handleUpdateInviteEmail = async (invitation: any) => {
    setIsSendingChangeEmail(true);
    try {
      await api.patch(
        `/assessments/${assessment.id}/invitations/${invitation.id}/update-email`,
        { new_email: newEmailValue.trim() },
      );
      setEditingEmailId(null);
      setNewEmailValue('');
      toast.success('Email updated and invitation resent!');
      await reloadInvites();
    } catch (error: any) {
      console.error('Failed to update email:', error);
      showErrorToast(error, "Couldn't update email");
    } finally {
      setIsSendingChangeEmail(false);
    }
  };
  const ACTIVITY_PAGE_SIZE = 10;
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  // Original per-row edit history (assessment_version_history table).
  // Powers the "Versions" tab.
  const [versionHistory, setVersionHistory] = useState<any[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  // Sibling versions = every assessment sharing this assessment's jd_id
  // (V1 + any clones). Powers the "New Versions" tab.
  /* Held WITH the job version it was fetched for, and read only when the two
     still agree — the shape `assessmentVersions` uses below, for the same
     reason. A bare array went on rendering the job version being LEFT for the
     whole of the next one's fetch, so the panel listed V1's assessments under
     a header that already said V2. Keyed, it reads as not-loaded-yet instead,
     which is the truth and is what the tab already knows how to show. */
  const [siblingVersions, setSiblingVersions] = useState<{ jdId: string; rows: any[] } | null>(null);
  const [siblingsLoading, setSiblingsLoading] = useState(false);
  const siblingRows =
    siblingVersions && siblingVersions.jdId === assessment?.jd_id ? siblingVersions.rows : null;
  /* The sibling row whose configuration the New Versions tab is previewing, or
     null. Holds the ROW because the preview needs both its `id` and its
     `jd_id`: the Configure step is scoped to a job, and it fetches the
     assessment itself from that id — the same pair the Edit action hands the
     dialog. */
  const [previewVersion, setPreviewVersion] = useState<AssessmentResponse | null>(null);
  /* The last JD fetched, WHICHEVER version it belongs to, and the JD this
     page may actually read.

     They are two different things across a version switch. The page now keeps
     the previous assessment rendered while the next one loads, so the JD in
     hand goes on belonging to the version being left for as long as that
     takes — and rendering it would put Job V1's description, skills and
     guidance under a header that has already moved to V2.

     So the cache is held (dropping it would cost a refetch on the way back)
     and the read is narrowed to the row the page is on. Every existing
     `jdData` site is a read, so all of them are version-correct by
     construction rather than by remembering to check. */
  const [jdCache, setJdCache] = useState<JDResponse | null>(null);
  const [jdLoading, setJdLoading] = useState(false);
  const [jdError, setJdError] = useState<string | null>(null);
  const jdData = jdCache && jdCache.id === assessment?.jd_id ? jdCache : null;

  // Fetch recent activity when assessment changes.
  // Each invitation is expanded into MULTIPLE timeline events (Invited,
  // Email Sent, System Check, Assessment Started, Completed, Terminated,
  // Bounced, Expired) so the recruiter sees the full lifecycle, not just the
  // latest state. Wording follows the AI Interview module. The list is then
  // sorted newest-first and paginated client-side (10 per page).
  useEffect(() => {
    const fetchActivity = async () => {
      if (!assessment?.id) return;
      /* Keyed to the record ASKED ABOUT, not to whatever is on screen when the
         reply lands: a slow answer for the version just left then writes a
         cache nothing reads, rather than overwriting the newer one. */
      const requestedFor = assessment.id;
      setActivityLoading(true);
      /* Lifecycle rows alongside, never in the way: a failed or missing audit
         trail leaves the candidate timeline exactly as it was. */
      const lifecycleRequest = assessmentService
        .getCombinedAuditTrail({ category: 'assessment_lifecycle', assessment_id: requestedFor, page_size: 200 })
        .then((res) => res?.items ?? [])
        .catch(() => [] as CombinedAuditActivity[]);
      try {
        const [response, lifecycleItems] = await Promise.all([
          assessmentService.listInvitations(requestedFor, { page_size: 200 }),
          lifecycleRequest,
        ]);
        setLifecycleCache({ assessmentId: requestedFor, events: toLifecycleEvents(lifecycleItems, requestedFor) });
        const invitations = response?.items || [];
        const events: any[] = [];
        const _now = Date.now();
        for (const inv of invitations) {
          if (inv.created_at) events.push({ ...inv, _eventType: 'invited', _eventAt: inv.created_at });
          if (inv.sent_at && inv.sent_at !== inv.created_at) {
            events.push({ ...inv, _eventType: 'sent', _eventAt: inv.sent_at });
          }
          if (inv.opened_at) events.push({ ...inv, _eventType: 'opened', _eventAt: inv.opened_at });
          if (inv.started_at) events.push({ ...inv, _eventType: 'started', _eventAt: inv.started_at });
          if (inv.completed_at) events.push({ ...inv, _eventType: 'completed', _eventAt: inv.completed_at });
          // Candidate walked out mid-assessment (attempt.exited_at). Never set
          // on a completed attempt, so this can't double up with 'completed'.
          if (inv.terminated_at && !inv.completed_at) {
            events.push({ ...inv, _eventType: 'terminated', _eventAt: inv.terminated_at });
          }
          if (inv.bounced_at) events.push({ ...inv, _eventType: 'bounced', _eventAt: inv.bounced_at });
          // Expired event — clock-based when the link passed its deadline
          // without the candidate starting (and no unit was consumed).
          const clockExpired = inv.expires_at
            && new Date(inv.expires_at).getTime() < _now
            && !inv.started_at
            && !inv.completed_at
            && !inv.unit_consumed;
          if (clockExpired || (inv.status || '').toLowerCase() === 'expired') {
            events.push({ ...inv, _eventType: 'expired', _eventAt: inv.expires_at || inv.created_at });
          }
        }
        events.sort((a, b) => new Date(b._eventAt).getTime() - new Date(a._eventAt).getTime());
        setActivityCache({ assessmentId: requestedFor, events });
        setActivityPage(1);
      } catch (error) {
        console.error('Failed to fetch activity:', error);
      } finally {
        setActivityLoading(false);
      }
    };
    fetchActivity();
  }, [assessment?.id]);

  // Original per-row version_history fetch — powers the "Versions" tab.
  useEffect(() => {
    const fetchVersions = async () => {
      if (!assessment?.id || activeTab !== 'versions') return;
      setVersionsLoading(true);
      try {
        const response = await assessmentService.getVersionHistory(assessment.id);
        setVersionHistory(response.items || []);
      } catch (error) {
        console.error('Failed to fetch version history:', error);
        showErrorToast(error, "Couldn't load version history", {
          id: 'assessment-version-history-load',
          retry: fetchVersions,
        });
      } finally {
        setVersionsLoading(false);
      }
    };
    fetchVersions();
  }, [assessment?.id, activeTab]);

  /* The assessment versions authored against the SELECTED JOB VERSION — the
     list the sibling-versions tab renders.

     Scoped to `assessment.jd_id`, which is the job version the Manage Jobs
     badge beside the title states: the tab shows Job V4's assessment versions
     when the page is on Job V4, and V3's when it is on V3. Switching job
     version through that badge navigates to that version's assessment, so
     `jd_id` changes and this effect refetches — the list cannot be left
     showing the version the reader moved away from.

     The same fetch the header's Assessment version menu runs, so the tab and
     the badge can never disagree about which versions exist. */
  useEffect(() => {
    const fetchSiblings = async () => {
      if (!assessment?.id || !assessment?.jd_id || activeTab !== 'newversions') return;
      setSiblingsLoading(true);
      try {
        const scopedToJdId = assessment.jd_id;
        const items = (await fetchJobVersionAssessments(scopedToJdId)).sort(
          (a: any, b: any) => (a.version || 0) - (b.version || 0)
        );
        setSiblingVersions({ jdId: scopedToJdId, rows: items });
      } catch (error) {
        console.error('Failed to fetch sibling versions:', error);
        setSiblingVersions({ jdId: assessment.jd_id, rows: [] });
      } finally {
        setSiblingsLoading(false);
      }
    };
    fetchSiblings();
  }, [assessment?.id, assessment?.jd_id, activeTab]);

  // Lazy-fetch the linked JD when the View JD OR Assessment Details (overview)
  // tab is opened — the overview tab now also shows the JD's Assessment
  // Guidance. Cached per assessment.jd_id so switching tabs doesn't re-fetch.
  useEffect(() => {
    const fetchJd = async () => {
      if ((activeTab !== 'viewjd' && activeTab !== 'overview') || !assessment?.jd_id) return;
      /* `jdData` is already narrowed to this version, so a non-null value IS
         the cache hit the old id comparison spelled out. */
      if (jdData) return;
      setJdLoading(true);
      setJdError(null);
      try {
        const response = await jdService.get(assessment.jd_id);
        setJdCache(response);
      } catch (error: any) {
        console.error('Failed to fetch JD:', error);
        setJdError(error?.message || 'Failed to load job description');
      } finally {
        setJdLoading(false);
      }
    };
    fetchJd();
  }, [assessment?.jd_id, activeTab, jdData]);

  /* Construct sections array from individual assessment fields.
   *
   * THE PUSH ORDER IS THE DISPLAY ORDER — Technical, then Coding, then
   * HR / Behavioral. This array is the only thing that orders the Section
   * Details list, so the order is a property of the assessment record rather
   * than of anything the reader did: it is identical on every render, after a
   * refresh, and on a return to the page.
   *
   * Each block stays conditional on its own `*_enabled` flag, so a disabled
   * round is absent rather than empty and the remaining ones simply close up
   * in the same relative order.
   */
  const sections = useMemo<Section[]>(() => {
    const result: Section[] = [];

    if (assessment.technical_enabled) {
      result.push({
        name: 'Technical',
        type: 'technical',
        enabled: true,
        percentage: assessment.technical_percentage || 0,
        topics: assessment.technical_topics || [],
        icon: Cpu
      });
    }

    // ==================== COMPILER AVAILABILITY CHECK ====================
    // Only show coding section if coding_enabled AND at least one language has a compiler
    if (assessment.coding_enabled) {
      // Languages with compilers (Piston API)
      const compilerLanguages = [
        'python', 'python3', 'javascript', 'js', 'java',
        'typescript', 'ts', 'cpp', 'c++', 'c', 'csharp', 'cs',
        'go', 'rust', 'ruby', 'php', 'kotlin', 'swift', 'sql'
      ];

      const codingLanguages = assessment.coding_languages || [];
      const hasCompiler = codingLanguages.some((lang: string) =>
        compilerLanguages.includes(lang.toLowerCase())
      );

      if (hasCompiler) {
        result.push({
          name: 'Coding',
          type: 'coding',
          enabled: true,
          percentage: assessment.coding_percentage || 0,
          topics: assessment.coding_topics || [],
          languages: codingLanguages,
          icon: Code
        });
      } else {
        console.log('[COMPILER-CHECK] ❌ Coding round hidden - no compilers for languages:', codingLanguages);
      }
    }

    /* Last, after the two timed rounds. HR draws on the Question Bank and is
       untimed, so it reads as the round that follows them rather than the one
       that opens the assessment. */
    if (assessment.hr_enabled) {
      result.push({
        name: 'HR / Behavioral',
        type: 'hr',
        enabled: true,
        percentage: assessment.hr_percentage || 0,
        topics: assessment.hr_topics || [],
        icon: Users
      });
    }

    return result;
  }, [assessment]);

  // Format duration from minutes
  const formattedDuration = useMemo(() => {
    const minutes = assessment.duration_minutes || 30;
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
    }
    return `${minutes} min`;
  }, [assessment.duration_minutes]);

  // Outer/inner chrome matches job-details: scrolling <main>, centred
  // max-w-[1400px] column, then one padded white card that owns ALL horizontal
  // padding. Sections below therefore carry no px-* of their own.
  return (
    <main aria-busy={isReloading} className="tf-page">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="tf-page-sheet">
      {/* Breadcrumb — must be a DIRECT child of the card so `sticky` has the
          card's full height to travel within. Nested inside a padding wrapper it
          was boxed to its own height and could never actually stick. */}
      {/* Previous / Next rides inside the breadcrumb bar, as on job-details, so
          it stays reachable while the sticky crumb is pinned. Passed as
          undefined when there is no list to page through, which leaves the bar
          exactly as it was. */}
      <PageBreadcrumb
        className="mb-4 md:mb-6"
        items={breadcrumbItems ?? [
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'AI Assessments', href: '/recruitment/assessments' },
          { label: stripVersionFromTitle(assessment.title) || assessment.short_id || 'Assessment Details' },
        ]}
        actions={totalCount != null && totalCount > 0 ? (
          <RecordPager
            currentIndex={currentIndex}
            totalCount={totalCount}
            onPrev={onPrev ? () => onPrev(activeTab) : undefined}
            onNext={onNext ? () => onNext(activeTab) : undefined}
          />
        ) : undefined}
      />

      {/* Assessment summary — the Job Details page's first card, in the slot
          the original header occupied: under the breadcrumb, above the
          nav/content grid. One card, and its grammar is JobDetailView's own
          rather than a third design:

            wrapper  brand-blue/30 border, brand-blue/10 ring, p-4 sm:p-5,
                     inside an mb-5 block
            row 1    solid blue mono ID pill, a plain `font-normal` title,
                     then the status pill
            row 2    `text-xs text-gray-600`, icon+text facts and chips
                     separated by a `text-gray-300` bullet, ending on the
                     version badge
            right    the actions column

          Two version badges where a job has one, because this page carries
          both and they genuinely diverge: an assessment is only re-versioned
          when someone duplicates it, so a job on v5 can hold assessment V3.
          Job version keeps JobDetailView's solid purple badge exactly; the
          assessment's sits beside it in the assessment blue this page uses
          everywhere else, and both are labelled - two bare numbers side by
          side is the ambiguity the Send Invite rows already spell their way
          out of ("Job V3 → Assessment V2").

          Values are unchanged: the assessment the route already fetched, plus
          `sections`/`formattedDuration` this file derives. No new request, no
          new field, nothing hardcoded. A value the API did not return drops
          its item and its bullet rather than printing a blank. */}
      {/* This assessment's job version is Disabled / Archived: say so, and
          which versions invitation actions still work on. */}
      {thisVersionLock && (
        <div className="mb-4">
          <JobVersionsLockBanner locked={[thisVersionLock]} active={splitJobVersions(jobVersions).active} />
        </div>
      )}
      <div className="mb-5">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-brand-blue/30 dark:border-brand-blue/40 ring-1 ring-brand-blue/10 dark:ring-brand-blue/20 shadow-sm shadow-brand-blue/10 p-4 sm:p-5">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
            <div {...draftLockProps} className={`flex-1 min-w-0 ${draftLockProps.className}`}>
              {/* Row 1: Job ID + Assessment title + Status */}
              <div className="flex flex-wrap items-center gap-2 mb-2">
                {assessment.jd_short_id && (
                  <JobIdBadge className="inline-flex items-center shrink-0">
                    {assessment.jd_short_id}
                  </JobIdBadge>
                )}
                {/* The JOB's own name, and nothing appended to it. The
                    literal " - Assessment" that used to follow was written
                    here in the markup, not stored anywhere - the page it sits
                    on already says what this is. `stripVersionFromTitle` is
                    the fallback for rows with no `jd_title`, and only removes
                    a "Version N" suffix baked into an old stored title; it
                    does not touch the API value. */}
                {/* Same size/weight as the Job Details title (and the app's
                    page-title standard, 18px phone / 20px tablet+). */}
                <h1 className="tf-page-title min-w-0 max-w-full truncate">
                  {assessment.jd_title || stripVersionFromTitle(assessment.title)}
                </h1>
                {assessment.status && (
                  <span className={`inline-flex shrink-0 items-center px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap ${
                    assessment.status === 'Active'
                      ? 'bg-success-subtle text-success border-success-line'
                      : assessment.status === 'Draft'
                        ? 'bg-brand-orange/10 text-brand-orange-deep border-brand-orange/20'
                        : 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700'
                  }`}>
                    {assessment.status}
                  </span>
                )}
              </div>

              {/* Row 2: Duration + Created Date + Created By + Last Updated */}
              <div className="flex flex-wrap items-center gap-1.5 tf-meta-strong">
                {/* No per-icon colour. The four icons inherit the row's own
                    `text-gray-600 dark:text-slate-400` through currentColor, so
                    they read as one quiet line of facts instead of four tinted
                    ones competing with the pills above and beside them. */}
                {([
                  { key: 'duration', icon: Clock, label: formattedDuration },
                  { key: 'created-at', icon: Calendar, label: assessment.created_at ? `Created ${formatIST(assessment.created_at)}` : null },
                  { key: 'created-by', icon: User, label: assessment.created_by_name ? `By ${assessment.created_by_name}` : null },
                  { key: 'updated-at', icon: Calendar, label: assessment.updated_at ? `Last Updated ${formatIST(assessment.updated_at)}` : null },
                ] as { key: string; icon: typeof Clock; label: string | null | undefined }[])
                  .filter((fact) => !!fact.label)
                  .map((fact, i) => (
                    <Fragment key={fact.key}>
                      {/* Between items only. After the filter, so a dropped
                          fact takes its bullet with it. */}
                      {i > 0 && <span aria-hidden className="text-gray-300">&bull;</span>}
                      <div className="flex items-center gap-1.5 min-w-0">
                        <fact.icon className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate" title={fact.label ?? undefined}>{fact.label}</span>
                      </div>
                    </Fragment>
                  ))}
              </div>

              {/* Row 3: round pills + Job Version + Assessment Version, on
                  their own line below the facts — the AI Interview Details
                  header's own row 3 (mode/round/version chips). `relative`
                  here, and only `sm:relative` on the two version switchers
                  below: under 640px their popovers anchor to this full-width
                  row instead of to their pill, so a pill that wrapped to the
                  right edge cannot push its menu off-screen. */}
              <div className="relative flex flex-wrap items-center gap-1.5 mt-2">
                {sections.map((section) => (
                  <span key={section.type} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-brand-blue/10 text-brand-blue rounded-full ring-1 ring-brand-blue/20">
                    <Layers className="w-3 h-3" /> {section.name}
                  </span>
                ))}
                {selectedJobVersionNumber != null && (
                  /* MANAGE JOBS - the job-version switcher.
                   *
                   * One control, in the slot the job's version badge already
                   * held: the badge WAS the switcher, so a second "Manage
                   * Jobs" beside it would have been two buttons doing one
                   * thing. It keeps JobDetailView's solid purple pill, which
                   * is what pairs it with the assessment's blue one next to
                   * it, and states the version it is on - so the label tracks
                   * the page without anything having to update it.
                   *
                   * Selecting a version navigates WITHIN Assessment Details,
                   * to the assessment authored against that job version - see
                   * `handleJobVersionSelect`. It never returns to the list. */
                  <div className="sm:relative shrink-0" ref={versionMenuRef}>
                    <button
                      type="button"
                      ref={versionTriggerRef}
                      onClick={() => {
                        const opening = !showVersionMenu;
                        if (opening) setVersionMenuOpensLeft(menuOverflowsRight(versionMenuRef.current, 320));
                        setShowVersionMenu(opening);
                        if (opening) ensureJobVersionAuthors(sortedJobVersions);
                      }}
                      disabled={sortedJobVersions.length === 0}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-600 text-white rounded-full text-xs font-medium hover:bg-purple-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-1"
                      aria-label={`Manage jobs, currently job version ${selectedJobVersionNumber}`}
                      aria-haspopup="menu"
                      aria-expanded={showVersionMenu}
                      title={sortedJobVersions.length === 0 ? 'Loading job versions…' : 'Switch job version'}
                    >
                      Manage Jobs
                      <span aria-hidden className="text-white/50">&middot;</span>
                      V{selectedJobVersionNumber}
                      <ChevronDown className={`w-3 h-3 transition-transform ${showVersionMenu ? 'rotate-180' : ''}`} />
                    </button>

                    {showVersionMenu && (
                      /* Fixed width, capped height: a lineage of ten scrolls
                         inside the popover rather than growing it down the
                         page, and a long author name truncates rather than
                         widening it. `max-w-[calc(100vw-2rem)]` is the phone
                         case, where 20rem would otherwise overhang. */
                      <div
                        role="menu"
                        aria-label="Job versions"
                        onKeyDown={handleVersionMenuKeyDown}
                        className={`absolute left-0 ${versionMenuOpensLeft ? 'sm:left-auto sm:right-0' : ''} top-full mt-2 w-80 max-w-full sm:max-w-[calc(100vw-1.5rem)] bg-white dark:bg-slate-900 rounded-xl shadow-lg shadow-brand-blue/10 border border-gray-200 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] z-50 overflow-hidden`}
                      >
                        {/* Header - what the list is, and how long it is. */}
                        <div className="flex items-baseline justify-between gap-2 px-3 py-2">
                          <span className="tf-caption tracking-tight">
                            Job Versions
                          </span>
                          <span className="tf-micro-hint">
                            {sortedJobVersions.length} version{sortedJobVersions.length === 1 ? '' : 's'}
                          </span>
                        </div>
                        {/* The divider the header sits on, as its own rule so
                            it spans the popover's full width rather than the
                            padded header box. */}
                        <div className="border-t border-gray-100 dark:border-slate-700/60" />

                        <div className="max-h-72 overflow-y-auto py-1">
                          {sortedJobVersions.length === 0 ? (
                            <div className="px-3 py-3 tf-meta">
                              No versions available
                            </div>
                          ) : (
                            sortedJobVersions.map((version, index) => {
                              /* SELECTED - the JD ROW this assessment was built
                                 against, which is the version the page is
                                 reading. Matched on the row id, not a version
                                 number: two rows can report the same number,
                                 and the id is what the assessment points at.
                                 Not to be confused with the "Current" badge
                                 below, which marks the job's NEWEST version. */
                              const isSelectedVersion = version.id === assessment.jd_id;
                              const isSwitching = jobVersionSwitchingTo === version.id;
                              const versionDate = version.published_at || version.created_at;
                              const author = jobVersionAuthors[version.id];
                              return (
                                <button
                                  key={version.id}
                                  type="button"
                                  role="menuitem"
                                  ref={(el) => { versionItemRefs.current[index] = el; }}
                                  aria-current={isSelectedVersion ? 'true' : undefined}
                                  /* The selected row stays live and undimmed -
                                     it is where you ARE, not an unavailable
                                     option, and its View is never taken away.
                                     Clicking it closes the menu
                                     (`handleJobVersionSelect` returns early on
                                     the row it is already showing). Only a
                                     switch already in flight disables the
                                     list, so two versions cannot be opened at
                                     once. */
                                  disabled={!!jobVersionSwitchingTo}
                                  onClick={() => handleJobVersionSelect(version)}
                                  aria-label={[
                                    `View job version ${version.version_number ?? 1}`,
                                    author ? `created by ${author}` : null,
                                    isSelectedVersion ? '(currently viewing)' : null,
                                  ].filter(Boolean).join(', ')}
                                  className={`group w-full px-3 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue/40 ${
                                    isSelectedVersion
                                      ? 'bg-brand-blue/5 hover:bg-brand-blue/10'
                                      : 'hover:bg-brand-blue/5'
                                  } ${jobVersionSwitchingTo && !isSwitching ? 'opacity-60' : ''}`}
                                >
                                  <div className="flex items-center gap-2">
                                    {/* Fixed-width mark column, so every row's
                                        version number starts on the same x
                                        whether or not it carries the tick. */}
                                    <span className="w-4 flex-shrink-0 flex items-center justify-center">
                                      {isSwitching ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-blue" />
                                      ) : isSelectedVersion ? (
                                        <Check className="w-3.5 h-3.5 text-brand-blue" />
                                      ) : null}
                                    </span>
                                    {/* The version number carries the row. */}
                                    <span className="tf-row-title tabular-nums flex-shrink-0">
                                      V{version.version_number ?? 1}
                                    </span>
                                    {/* CURRENT = the newest version of the job,
                                        which is the lineage's own flag - not
                                        the same thing as the tick, which marks
                                        the version you are READING. They land
                                        on one row whenever you are on the
                                        newest, and separate the moment you are
                                        not. */}
                                    {version.is_latest_version && (
                                      <span className="tf-badge flex-shrink-0 text-2xs bg-brand-blue/10 text-brand-blue">
                                        Current
                                      </span>
                                    )}
                                    {version.status && (
                                      <Badge variant={jobVersionStatusVariant(version.status)} className="flex-shrink-0 text-2xs px-1.5 py-0.5 capitalize">
                                        {version.status}
                                      </Badge>
                                    )}
                                    {/* VIEW, right-aligned, on every row -
                                        including the one you are on. It is a
                                        span, not a button: the whole row is
                                        already the control, and a button
                                        inside a button is invalid markup that
                                        no browser handles the same way. It is
                                        always rendered, never hover-only and
                                        never dropped for the selected row, so
                                        the action cannot disappear under the
                                        reader. */}
                                    <span
                                      aria-hidden
                                      className="ml-auto flex-shrink-0 text-2xs font-medium text-brand-blue group-hover:text-brand-blue-2 group-hover:underline"
                                    >
                                      View
                                    </span>
                                  </div>
                                  {/* Second line: who made this version, and
                                      when. Indented past the mark column so it
                                      hangs under the version number rather
                                      than under the tick. Each half drops out
                                      on its own when the record does not carry
                                      it, and the line goes entirely when
                                      neither is known. */}
                                  {(author || versionDate) && (
                                    <div className="pl-6 mt-0.5 flex items-center gap-1.5 tf-micro-hint">
                                      {author && (
                                        <span className="truncate" title={author}>Created by {author}</span>
                                      )}
                                      {author && versionDate && (
                                        <span aria-hidden className="text-gray-300">&bull;</span>
                                      )}
                                      {versionDate && <span className="flex-shrink-0">{formatIST(versionDate)}</span>}
                                    </div>
                                  )}
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {assessment.version != null && (
                  /* The assessment's own version control, beside the job's and
                     built the same way — see the "Assessment version selector"
                     block above. Keeps the badge it replaced exactly: the
                     assessment blue this page uses everywhere else, labelled,
                     because two bare numbers side by side is the ambiguity the
                     Send Invite rows already spell their way out of. */
                  <div className="sm:relative shrink-0" ref={assessmentVersionMenuRef}>
                    <button
                      type="button"
                      onClick={toggleAssessmentVersionMenu}
                      className="tf-btn tf-btn-primary gap-1 px-2.5 py-1 bg-brand-blue rounded-full text-xs hover:bg-brand-blue-2 transition-colors shadow-none justify-start"
                      aria-label={`Select assessment version, currently V${assessment.version}`}
                      aria-haspopup="menu"
                      aria-expanded={showAssessmentVersionMenu}
                      title="Switch assessment version"
                    >
                      Assessment V{assessment.version}
                      <ChevronDown className={`w-3 h-3 transition-transform ${showAssessmentVersionMenu ? 'rotate-180' : ''}`} />
                    </button>

                    {showAssessmentVersionMenu && (
                      /* The Manage Jobs popover's twin, deliberately: same
                         width grammar, same header-over-divider, same capped
                         scroll region, so the page's two version menus read as
                         one control used twice. */
                      <div
                        role="menu"
                        aria-label="Assessment versions"
                        className={`absolute left-0 ${assessmentVersionMenuOpensLeft ? 'sm:left-auto sm:right-0' : ''} top-full mt-2 w-64 max-w-full sm:max-w-[calc(100vw-1.5rem)] bg-white dark:bg-slate-900 rounded-xl shadow-lg shadow-brand-blue/10 border border-gray-200 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] z-50 overflow-hidden`}
                      >
                        {/* Names the job version these belong to, because that
                            is the whole rule this menu now follows: the list is
                            the selected job version's assessments and nothing
                            else. */}
                        <div className="flex items-baseline justify-between gap-2 px-3 py-2">
                          <span className="tf-caption tracking-tight">
                            Assessment Versions
                          </span>
                          {selectedJobVersionNumber != null && (
                            <span className="tf-micro-hint">
                              Job V{selectedJobVersionNumber}
                            </span>
                          )}
                        </div>
                        <div className="border-t border-gray-100 dark:border-slate-700/60" />

                        <div className="max-h-72 overflow-y-auto py-1">
                        {assessmentVersionsLoading ? (
                          <div className="px-3 py-3 flex items-center gap-2 tf-meta">
                            <Loader2 className="w-3 h-3 animate-spin text-brand-blue" />
                            Loading assessment versions…
                          </div>
                        ) : sortedAssessmentVersions.length === 0 ? (
                          /* Says which job version is empty, and offers
                             nothing in its place - another job version's
                             assessments are exactly what must not appear
                             here. */
                          <div className="px-3 py-3">
                            <div className="tf-caption">
                              No Assessment Version Available
                            </div>
                            <div className="mt-0.5 tf-micro-hint">
                              {selectedJobVersionNumber != null
                                ? `No assessment version is currently associated with Job V${selectedJobVersionNumber}.`
                                : 'This assessment is not linked to a job version.'}
                            </div>
                          </div>
                        ) : (
                          sortedAssessmentVersions.map((version) => {
                            /* "Current" is the ASSESSMENT RECORD on screen, not
                               a version number - two records can report the
                               same number (one per job version), and the row id
                               is what the page is actually showing. */
                            const isCurrentVersion = version.id === assessment.id;
                            const isSwitching = assessmentSwitchingTo === version.id;
                            return (
                              <button
                                key={version.id}
                                type="button"
                                role="menuitem"
                                aria-current={isCurrentVersion ? 'true' : undefined}
                                /* Live and undimmed on the row you are on, as
                                   in the job menu - clicking it just closes the
                                   menu. Only a switch in flight disables the
                                   list. */
                                disabled={!!assessmentSwitchingTo}
                                onClick={() => handleAssessmentVersionSelect(version)}
                                className={`w-full px-3 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue/40 ${
                                  isCurrentVersion ? 'bg-brand-blue/5 hover:bg-brand-blue/10' : 'hover:bg-brand-blue/5'
                                } ${assessmentSwitchingTo && !isSwitching ? 'opacity-60' : ''}`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="tf-caption">
                                    V{version.version ?? 1}
                                  </span>
                                  <div className="flex items-center gap-1">
                                    {version.status && (
                                      <span className="tf-badge tf-micro-hint bg-gray-100 dark:bg-slate-800 capitalize">
                                        {version.status}
                                      </span>
                                    )}
                                    {isSwitching ? (
                                      <Loader2 className="w-3 h-3 animate-spin text-brand-blue" />
                                    ) : isCurrentVersion ? (
                                      <span className="tf-badge text-2xs bg-brand-blue/10 text-brand-blue">
                                        Selected
                                      </span>
                                    ) : (version.version ?? 0) === latestAssessmentVersion ? (
                                      <span className="tf-badge text-2xs bg-success-subtle text-success">
                                        Latest
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                                {/* WHEN, not which. The AS-xxx code that stood
                                    here is gone, and the "Job vN" beside it
                                    went with it: every row in this menu now
                                    belongs to the one job version the Manage
                                    Jobs badge names, so repeating that number
                                    on each row said nothing. The date is what
                                    is left to tell two rows apart when a job
                                    version holds more than one assessment at
                                    the same version number. */}
                                {(version.published_at || version.created_at) && (
                                  <div className="tf-micro-hint truncate">
                                    {formatIST(version.published_at || version.created_at)}
                                  </div>
                                )}
                              </button>
                            );
                          })
                        )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Actions. Share keeps every one of its own rules; Edit is the
                pencil from the reference, on the `onEdit` the route has always
                passed. */}
            <div className="flex flex-wrap items-center gap-2 flex-shrink-0 self-start">
              {/* On a draft the one live control on the page, placed ahead of
                  Share: a labelled primary "Continue Editing", the AI Interview
                  details page's draft button (`AIInterviewDetailsView`), in
                  place of the pencil. */}
              {onEdit && draftLocked && (() => {
                // A disabled/archived JD locks edits the same way it locks
                // Share below — a draft left pointing at a dead job version
                // should not be editable just because it never sent an invite.
                const editJdLockMessage = assessmentJobLockMessage(jobVersions.find((v) => v.id === assessment?.jd_id)?.status);
                const editBlocked = !canEditAssessment || !!editJdLockMessage;
                return (
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={editBlocked ? undefined : onEdit}
                    aria-disabled={editBlocked}
                    aria-label="Continue editing this draft assessment"
                    title={editJdLockMessage ? editJdLockMessage : !canEditAssessment ? 'You do not have permission to edit assessments' : 'Continue editing this draft assessment'}
                    icon={<Edit2 className="w-3.5 h-3.5 flex-shrink-0" />}
                    className={` px-3 sm:px-4 min-h-[40px] flex-shrink-0 whitespace-nowrap ${editBlocked ? 'opacity-50 cursor-not-allowed' : 'ring-2 ring-brand-blue/40 shadow-md shadow-brand-blue/20'}`}
                  >
                    <span className="hidden sm:inline">Continue Editing</span>
                    <span className="sm:hidden">Edit</span>
                  </Button>
                );
              })()}
              {onShare && (() => {
        // Share is blocked for Archived (out of circulation) AND
        // once invites have been revoked (assessment is sealed —
        // recruiter should clone a new version for a fresh round).
        // We use the shared isAssessmentRevoked helper so this
        // check honours BOTH the backend has_revoked_invites flag
        // AND the tab-local sessionStorage seal — without the
        // local fallback, opening the details view of an assessment
        // you just revoked left Share enabled (because the
        // assessment prop comes straight from the list response
        // and may not carry the backend flag yet).
        const isArchived = assessment.status === 'Archived';
        const hasRevoked = isAssessmentRevoked(assessment as any);
        const jdStatus = jobVersions.find((v) => v.id === assessment?.jd_id)?.status;
        const jdLockMessage = assessmentJobLockMessage(jdStatus);
        const blockedReason = isArchived
          ? 'Archived assessments cannot be shared'
          : jdLockMessage
          ? jdLockMessage
          : hasRevoked
          ? 'Invites for this assessment have been revoked. Duplicate it to start fresh.'
          : '';
        const disabled = !!blockedReason;
        /* RBAC: no share permission keeps Share visible, greyed, tooltip only. */
        const shareDenied = !canCreateAssessments || !canShare;
        return (
          <div {...draftLockProps} className={draftLockProps.className || 'contents'}>
          <Button
            variant="primary"
            size="sm"
            onClick={disabled || shareDenied ? undefined : onShare}
            disabled={disabled}
            aria-disabled={disabled || shareDenied}
            title={shareDenied ? 'You do not have permission to share assessments' : blockedReason}
            className={`${(shareDenied && !disabled ? 'opacity-50 cursor-not-allowed' : '')} disabled:opacity-50`}
            icon={<Mail className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
          >
            Invite
          </Button>
          </div>
        );
              })()}
              {/* Archive / Unarchive, icon-only, directly beside Share - the
                  Edit pencil's own button shape, and the glyphs the All
                  Assessments table's menu uses for the same two actions.
                  Active offers Archive; Archived offers Unarchive (and has no
                  pencil - an archived assessment is restored, not edited). */}
              {assessment.status === 'Active' && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={canUnarchiveAssessments ? handleArchive : undefined}
                  disabled={isArchiving}
                  aria-disabled={!canUnarchiveAssessments}
                  aria-label="Archive assessment"
                  title={canUnarchiveAssessments ? 'Archive assessment' : 'You do not have permission to archive assessments'}
                  className={`h-8 w-8 flex-shrink-0 ${canUnarchiveAssessments ? '' : 'opacity-50 cursor-not-allowed'}`}
                >
                  {isArchiving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4 text-menu-icon-archive" />}
                </Button>
              )}
              {isArchivedAssessment && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={canUnarchiveAssessments ? handleUnarchive : undefined}
                  disabled={isUnarchiving}
                  aria-disabled={!canUnarchiveAssessments}
                  aria-label="Unarchive assessment"
                  title={canUnarchiveAssessments ? 'Unarchive assessment' : 'You do not have permission to unarchive assessments'}
                  className={`h-8 w-8 flex-shrink-0 ${canUnarchiveAssessments ? '' : 'opacity-50 cursor-not-allowed'}`}
                >
                  {isUnarchiving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArchiveRestore className="w-4 h-4 text-menu-icon-archive" />}
                </Button>
              )}
              {/* Duplicate, icon-only — the AI Interview Details header's own
                  action (there a labelled button; here the icon-only shape
                  every other action on this header already uses). Active only:
                  a draft has nothing published yet to duplicate, and an
                  archived record is restored, not duplicated. Also mirrors the
                  All Assessments table's own gate: nobody invited yet means
                  this version is still editable, so it's edited, not duplicated. */}
              {assessment.status === 'Active' && (() => {
                const notInvited = (assessment.invitations_count ?? 0) === 0;
                const jdStatus = jobVersions.find((v) => v.id === assessment?.jd_id)?.status;
                const jdLockMessage = assessmentJobLockMessage(jdStatus);
                const duplicateDisabled = !canCreateAssessments || notInvited || !!jdLockMessage;
                return (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={duplicateDisabled ? undefined : handleDuplicate}
                  disabled={isDuplicating || duplicateDisabled}
                  aria-disabled={duplicateDisabled}
                  aria-label="Duplicate assessment"
                  title={
                    !canCreateAssessments
                      ? 'You do not have permission to duplicate assessments'
                      : jdLockMessage
                      ? jdLockMessage
                      : notInvited
                      ? 'No candidates invited yet — edit this version instead.'
                      : 'Duplicate as a new version'
                  }
                  className={`h-8 w-8 flex-shrink-0 ${duplicateDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isDuplicating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4 text-menu-icon-download" />}
                </Button>
                );
              })()}
              {onEdit && !isArchivedAssessment && (() => {
                /* The Assessments page's own edit rule (`handleEditAssessment`):
                   an Active assessment that has gone out to even one candidate
                   is locked, so every candidate sits the same questions. Read
                   off THIS version's `invitations_count` from the API - the
                   route is one assessment version, not the job - with the All
                   Assessments table's reason. */
                const editLocked =
                  assessment.status === 'Active' && (assessment.invitations_count ?? 0) > 0;
                /* A draft gets "Continue Editing" ahead of Share instead. */
                if (draftLocked) return null;
                return (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={editLocked || !canEditAssessment ? undefined : onEdit}
                  disabled={editLocked}
                  aria-disabled={editLocked || !canEditAssessment}
                  aria-label="Edit assessment"
                  title={!canEditAssessment
                    ? 'You do not have permission to edit assessments'
                    : editLocked
                    ? 'Cannot edit — this assessment has already been sent to candidates'
                    : 'Edit assessment'}
                  className={`h-8 w-8 flex-shrink-0 ${!canEditAssessment && !editLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <Edit2 className="w-4 h-4 text-menu-icon-edit" />
                </Button>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Unified detail layout: vertical navigation on the left, the selected
          tab's content on the right.

          The grid, the aside's chrome and the button states are the Result
          Details page's (`CandidateResultDetails`), copied rather than
          reinvented so the two detail pages read as one screen. Same column
          ladder - 180px, 220px at sm, 280px at lg - so the nav grows with the
          viewport instead of squeezing the content at every width.

          `items-start` keeps the aside its own height rather than stretching
          it down the full content column, and `sticky top-20 self-start` keeps
          it in view while a long tab scrolls beside it.

          The strip that used to live here was horizontal and scrolled sideways
          (`overflow-x-auto scrollbar-hide`), so with six tabs the last of them
          was off-screen and undiscoverable at anything under a wide desktop.
          Stacked vertically they are all visible at once. */}
      <div {...draftLockProps} className={`space-y-3 sm:space-y-4 lg:space-y-0 lg:grid lg:grid-cols-[210px_minmax(0,1fr)] lg:items-start lg:gap-6 ${draftLockProps.className}`}>
        {/* Desktop (lg+): a sticky vertical rail on the left, content on the
            right — the AI Interview / AI Assessment candidate result pages'
            layout. Tablet/mobile: the wrapping horizontal `tabPill` bar. */}
        <div className="lg:sticky lg:top-12 lg:self-start tf-card-soft">
          {/* Phones / tablets (globals.css, `.tf-detail-nav`): the Job Details page's
              underlined tab strip, scrolling sideways. From lg the vertical rail. */}
          <nav className="tf-detail-nav p-2 sm:p-3" aria-label="Assessment details sections">
            <div className="flex flex-wrap items-center gap-2 lg:flex-col lg:flex-nowrap lg:items-stretch lg:gap-1.5">
              {detailTabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab.id);
                      /* Prev / Next land here with `?tab=`. Once the URL names
                         a tab, keep it naming the one actually open, so a
                         refresh or Back / Forward onto this entry does not
                         reopen the tab the reader has since left. Not a
                         navigation: Next.js integrates `replaceState`. */
                      if (requestedTab && requestedTab !== tab.id && typeof window !== 'undefined') {
                        const params = new URLSearchParams(window.location.search);
                        params.set('tab', tab.id);
                        window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
                      }
                    }}
                    aria-current={isActive ? 'page' : undefined}
                    className={`${tabPill(isActive)} whitespace-nowrap lg:flex lg:w-full lg:gap-2 lg:px-3 lg:py-2.5 lg:text-left lg:whitespace-normal lg:shadow-none ${
                      isActive
                        ? 'lg:bg-brand-blue/5 lg:text-brand-blue lg:font-medium lg:ring-1 lg:ring-brand-blue/20'
                        : 'lg:bg-transparent lg:text-gray-600 lg:dark:text-slate-400 lg:hover:bg-brand-blue/5 lg:hover:text-brand-blue'
                    }`}
                  >
                    <tab.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                    <span className="leading-snug">{tab.label}</span>
                  </button>
                );
              })}
              {/* Go to JD — leaves the page rather than switching a section, so
                  it sits after a divider at the end of the pill row. */}
              {assessment.jd_id && (
                <div className="flex items-center border-l border-gray-200 dark:border-slate-700/60 pl-2 ml-1 lg:border-l-0 lg:border-t lg:pl-0 lg:ml-0 lg:pt-1.5 lg:mt-0.5">
                  <button
                    type="button"
                    onClick={() => router.push(jobDetailsHref(assessment.jd_id))}
                    className={`${tabPill(false)} whitespace-nowrap lg:flex lg:w-full lg:gap-2 lg:px-3 lg:py-2.5 lg:text-left lg:shadow-none lg:bg-transparent lg:text-gray-600 lg:dark:text-slate-400 lg:hover:bg-brand-blue/5 lg:hover:text-brand-blue`}
                  >
                    <Briefcase className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                    <span className="leading-snug">Go to JD</span>
                    {/* The "leaves this page" glyph the View JD tab's own
                        "Open full JD page" link carries. */}
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          </nav>
        </div>

        {/* Content — `min-w-0` so a wide table inside a tab scrolls in its own
            box instead of stretching the grid column and pushing the nav off
            the page. */}
        <div className="min-w-0 overflow-x-auto scroll-mt-24 py-3 sm:py-4 lg:pt-0 lg:pb-6 w-full bg-white dark:bg-slate-900">

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Assessment Details Section */}
            <div className="tf-card-soft min-w-0">
              <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-b border-gray-200">
                <h3 className="tf-row-name sm:text-base flex flex-wrap items-center gap-2 tracking-tight">
                  <div className="w-9 h-9 flex-shrink-0 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                    <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue" />
                  </div>
                  <span className="min-w-0">Assessment Details</span>
                  {/* Proctoring on or off, from the record's own
                      `proctoring_enabled` - the read-only Configure view's
                      chip, so the setting reads the same in both places.
                      Omitted when the record does not say. */}
                  {typeof assessment.proctoring_enabled === 'boolean' && (
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-normal flex items-center gap-1 flex-shrink-0 whitespace-nowrap ring-1 ${
                        assessment.proctoring_enabled
                          ? 'bg-success-subtle text-success ring-success-line'
                          : 'bg-slate-100 text-gray-600 ring-gray-200'
                      }`}
                    >
                      <Shield className="w-3 h-3" />
                      Proctoring {assessment.proctoring_enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  )}
                </h3>
              </div>

              <div className="p-3 sm:p-4 lg:p-6">
                {/* CONFIGURE DETAILS / ASSESSMENT INFO — the card's own two
                    views, as a horizontal pair under its header.

                    Assessment Info used to be a seventh entry in the vertical
                    nav beside it. It reads as a property OF this assessment
                    rather than a destination of its own, so it belongs next to
                    the configuration it describes — and the vertical nav is
                    shorter for it. Same content, same IIFE, same data; only its
                    parent changed.

                    Active and hover states are the vertical nav's own tokens,
                    laid out in a row, so the two navs on this screen read as one
                    system rather than two. */}
                <div
                  role="tablist"
                  aria-label="Assessment details views"
                  className="flex flex-wrap items-center gap-2 mb-4 sm:mb-6"
                >
                  {detailsSubTabs.map((sub) => {
                    const isActive = detailsSubTab === sub.id;
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => setDetailsSubTab(sub.id)}
                        className={`rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition-colors inline-flex items-center gap-1.5 ${
                          isActive
                            ? 'bg-brand-blue/5 text-brand-blue font-medium ring-1 ring-brand-blue/20'
                            : 'text-gray-600 dark:text-slate-400 hover:bg-brand-blue/5 hover:text-brand-blue'
                        }`}
                      >
                        <sub.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                        <span className="leading-snug">{sub.label}</span>
                      </button>
                    );
                  })}
                </div>

                {detailsSubTab === 'configure' && (
                  <>
                    {/* Total Duration Card */}
                    <div className="bg-gradient-to-r from-brand-blue/5 to-brand-cyan/5 border border-brand-blue/15 rounded-xl p-3 sm:p-4 mb-6 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 flex-shrink-0 rounded-xl bg-brand-blue shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 flex items-center justify-center">
                          <Clock className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <div className="tf-meta mb-1">Total Duration</div>
                          <div className="text-xl font-semibold text-gray-900 tracking-tight">{formattedDuration}</div>
                        </div>
                      </div>
                      <span className="shrink-0 px-3 sm:px-4 py-2 bg-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 text-sm font-medium rounded-lg">
                        100%
                      </span>
                    </div>

                    {/* Sections Details - Moved from Sections tab */}
                    <div className="mt-8 pt-6 border-t border-gray-200">
                      <h4 className="tf-label mb-4">Section Details</h4>
                      <div className="space-y-3">
                        {sections.length > 0 ? (
                          sections.map((section, index) => {
                            const SectionIcon = section.icon;
                            return (
                              /* COMPACT BY DEFAULT. Three of these stack in one
                                 panel, so every millimetre of chrome is paid for
                                 three times: `p-3` rather than `p-4`, a 32px icon
                                 tile rather than 40px, half-height chips, and the
                                 two facts riding the title's own row instead of
                                 taking a band of their own at the foot of the
                                 card. Nothing was dropped — same title,
                                 description, topics, languages and facts.

                                 Every token is the page's own: the slate card on
                                 a white panel, `brand-blue` for the mark and the
                                 topic chips, `brand-cyan` for languages, and the
                                 text-sm / text-xs pairing the rest of this file
                                 uses for a heading over its supporting line. */
                              <div key={section.type} className="bg-slate-50 rounded-xl border border-gray-200 ring-1 ring-black/[0.02] p-3">
                                {/* ONE ROW: the round's name on the left, its two
                                    facts on the right.

                                    `flex-wrap` is the whole of the responsive
                                    behaviour. There is no breakpoint here — the
                                    facts drop to a line of their own exactly when
                                    the title stops fitting beside them, which
                                    depends on the panel's width and on how long
                                    the round's name is, not on the viewport. When
                                    they do drop they move as ONE group, so the
                                    pair is never split one above the other.

                                    `min-w-0` + `truncate` on the title is what
                                    lets that happen gracefully: without it the
                                    name would refuse to shrink and push the facts
                                    out early. */}
                                <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="w-8 h-8 rounded-lg bg-brand-blue shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 flex items-center justify-center text-white flex-shrink-0">
                                      <SectionIcon className="w-4 h-4" />
                                    </div>
                                    {/* The round's NAME, and nothing else. The
                                        weight it used to carry — a "N% of total
                                        score" sub-line and an "N points" pill — is
                                        deliberately absent; the split is reported
                                        by the Weightage card to the right. */}
                                    <h5 className="tf-row-name tracking-tight truncate">{section.name}</h5>
                                  </div>

                                  {/* Two tiles, always side by side — a plain
                                      `flex`, never a stacking grid, so no width
                                      ever puts one under the other.

                                      NOT ON HR. HR draws its questions from the
                                      Question Bank and is untimed, so it carries
                                      no percentage — the tile only ever read
                                      "Weightage 0%", which is not a fact about
                                      the round so much as an artefact of asking a
                                      question that does not apply to it. Its
                                      Question Type tile goes with it: "Mixed
                                      Format" is the fallback the other rounds
                                      fall back TO, and left alone on an HR card
                                      it describes nothing. The row then holds the
                                      title by itself. */}
                                  {section.type !== 'hr' && (
                                    <div className="flex items-stretch gap-1.5 sm:gap-2 flex-shrink-0">
                                      <div className="tf-panel px-2.5 py-1.5">
                                        <div className="tf-micro-hint leading-none mb-1">Question Type</div>
                                        <div className="tf-caption leading-none whitespace-nowrap">
                                          {section.type === 'coding' ? 'Code Challenge' : 'Mixed Format'}
                                        </div>
                                      </div>
                                      <div className="tf-panel px-2.5 py-1.5">
                                        <div className="tf-micro-hint leading-none mb-1">Weightage</div>
                                        <div className="tf-caption leading-none whitespace-nowrap">{section.percentage}%</div>
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* Everything under the header, spaced by the
                                    parent rather than by a margin on each child:
                                    Topics and Programming Languages are both
                                    conditional, and a trailing `mb-` on whichever
                                    one happened to render last left a gap at the
                                    foot of the card that varied by round. */}
                                <div className="space-y-2.5">
                                  {/* One step down from the title in both size and
                                      ink, so the card has a hierarchy rather than
                                      two lines of equal weight. */}
                                  <p className="tf-meta leading-relaxed">
                                    {section.type === 'hr' && 'Evaluates communication skills, cultural fit, and behavioral competencies.'}
                                    {section.type === 'technical' && 'Tests domain knowledge, technical concepts, and problem-solving abilities.'}
                                    {section.type === 'coding' && 'Assesses programming skills through hands-on coding challenges.'}
                                  </p>

                                  {/* HR: the selected questions as a numbered list,
                                      as the AI interview's details page shows its
                                      HR round — question first, its answer type
                                      under it — rather than as topic pills. */}
                                  {section.type === 'hr' && section.topics.length > 0 && (
                                    <div>
                                      <p className="text-xs font-semibold text-brand-cyan uppercase tracking-wide mb-2">Selected HR Questions</p>
                                      <ol className="space-y-2">
                                        {section.topics.map((topic: string | { text?: string; question_text?: string; type?: string; answer_type?: string }, i: number) => {
                                          const text = typeof topic === 'string' ? topic : topic?.text || topic?.question_text || '';
                                          const kind = typeof topic === 'string' ? null : (topic?.type || topic?.answer_type || null);
                                          const isYesNo = typeof kind === 'string' && /yes/i.test(kind);
                                          return (
                                            <li key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-gradient-to-br from-brand-cyan/5 to-brand-teal/5 border border-gray-100 ring-1 ring-brand-cyan/10">
                                              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-brand-cyan text-white text-2xs font-bold flex items-center justify-center mt-0.5 shadow-sm">{i + 1}</span>
                                              <div className="flex-1 min-w-0">
                                                <p className="tf-body [overflow-wrap:anywhere]">{text}</p>
                                                {kind && (
                                                  <p className="mt-1 tf-micro-hint">{isYesNo ? 'Yes / No' : 'Text answer'}</p>
                                                )}
                                              </div>
                                            </li>
                                          );
                                        })}
                                      </ol>
                                    </div>
                                  )}

                                  {/* Topics */}
                                  {section.type !== 'hr' && section.topics.length > 0 && (
                                    <div>
                                      <div className="tf-caption mb-1.5">Topics Covered</div>
                                      <div className="flex flex-wrap gap-1.5">
                                        {section.topics.map((topic: any, i: number) => (
                                          <span key={i} className="max-w-full [overflow-wrap:anywhere] px-2 py-0.5 bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20 rounded text-xs">
                                            {typeof topic === 'string' ? topic : topic?.text || JSON.stringify(topic)}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Coding Languages */}
                                  {section.type === 'coding' && section.languages && section.languages.length > 0 && (
                                    <div>
                                      <div className="tf-caption mb-1.5">Programming Languages</div>
                                      <div className="flex flex-wrap gap-1.5">
                                        {section.languages.map((lang, i) => (
                                          /* Each language's own mark, as on the
                                             Assessment Info view's chips and the
                                             Configure page's Coding card. */
                                          <span key={i} className="inline-flex max-w-full min-w-0 items-center gap-1.5 [overflow-wrap:anywhere] px-2 py-0.5 bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/20 rounded text-xs font-mono">
                                            <span className="shrink-0 inline-flex">
                                              <LanguageLogo language={logoLabelForId(lang, lang)} size="sm" />
                                            </span>
                                            <span className="min-w-0">{lang}</span>
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="bg-slate-50 rounded-xl border-2 border-dashed border-brand-blue/20 p-6 text-center">
                            <FileText className="w-10 h-10 text-brand-blue/40 mx-auto mb-2" />
                            <p className="tf-body-secondary">No sections configured</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {detailsSubTab === 'info' && (() => {
                  const complexityLabel = (val: string | null | undefined) => {
                    const map: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High', expert: 'Expert' };
                    return val ? (map[val] || val) : null;
                  };
                  const complexityColor = (val: string | null | undefined) => {
                    const map: Record<string, string> = {
                      low: 'bg-success-subtle text-success ring-1 ring-success-line',
                      medium: 'bg-warning-subtle text-warning ring-1 ring-warning-line',
                      high: 'bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20',
                      expert: 'bg-destructive-subtle text-destructive ring-1 ring-destructive-line',
                    };
                    return val ? (map[val] || 'bg-slate-100 text-gray-700 ring-1 ring-gray-200') : 'bg-slate-100 text-gray-700 ring-1 ring-gray-200';
                  };
                  const expLabel = (val: string | null | undefined) => {
                    const map: Record<string, string> = {
                      junior: 'Junior', mid: 'Mid-Level', senior: 'Senior', lead: 'Lead', expert: 'Expert',
                    };
                    return val ? (map[val] || val) : null;
                  };
                  const expColor = (val: string | null | undefined) => {
                    const map: Record<string, string> = {
                      junior: 'bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/20',
                      mid: 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20',
                      senior: 'bg-brand-blue-2/15 text-brand-blue-2 ring-1 ring-brand-blue-2/25',
                      lead: 'bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20',
                      expert: 'bg-destructive-subtle text-destructive ring-1 ring-destructive-line',
                    };
                    return val ? (map[val] || 'bg-slate-100 text-gray-700 ring-1 ring-gray-200') : 'bg-slate-100 text-gray-700 ring-1 ring-gray-200';
                  };

                  const skillDepth: any[] = assessment.jd_skill_depth || [];
                  const niceToHaveSkills: any[] = (assessment as any).jd_nice_to_have_skills || [];
                  const codingLanguages: string[] = assessment.coding_languages || [];
                  // NHS section is always rendered (with an empty-state placeholder)
                  // so its presence shouldn't gate the whole panel — fall back to the
                  // other JD-snapshot signals to decide whether there's anything
                  // worth showing at all.
                  const hasData = assessment.jd_complexity || assessment.jd_experience_level || assessment.jd_primary_domain || skillDepth.length > 0 || codingLanguages.length > 0;

                  return (
                    <div className="tf-card-soft">
                      <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-b border-gray-200">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-9 h-9 flex-shrink-0 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                            <Info className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue" />
                          </div>
                          <h3 className="tf-row-name sm:text-base tracking-tight">Assessment Info</h3>
                        </div>
                        <p className="tf-body-secondary">Metadata extracted from the job description used to generate this assessment</p>
                      </div>

                      {!hasData ? (
                        <div className="px-3 sm:px-4 lg:px-6 py-8 sm:py-12 text-center">
                          <Info className="w-8 h-8 sm:w-12 sm:h-12 text-gray-300 mx-auto mb-2 sm:mb-3" />
                          <p className="text-gray-600 mb-1">No metadata available</p>
                          <p className="tf-body-muted">Assessment info will appear once the JD analysis is complete</p>
                        </div>
                      ) : (
                        <div className="@container p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
                          {/* Key Metadata Cards — stepped on the panel's own
                              width (it sits beside the side nav), not the
                              viewport's. */}
                          <div className="grid grid-cols-1 @xl:grid-cols-2 @4xl:grid-cols-3 gap-4 sm:gap-5">
                            {/* Job Complexity Level */}
                            <div className="tf-card-soft min-w-0 p-4 sm:p-5">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-9 h-9 flex-shrink-0 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                                  <Layers className="w-4 h-4 text-brand-blue" />
                                </div>
                                <span className="min-w-0 tf-eyebrow tracking-wide">Job Complexity</span>
                              </div>
                              {assessment.jd_complexity ? (
                                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${complexityColor(assessment.jd_complexity)}`}>
                                  {complexityLabel(assessment.jd_complexity)}
                                </span>
                              ) : (
                                <span className="tf-body-muted">Not available</span>
                              )}
                            </div>

                            {/* Experience Level */}
                            <div className="tf-card-soft min-w-0 p-4 sm:p-5">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-9 h-9 flex-shrink-0 rounded-xl bg-brand-cyan/10 ring-1 ring-brand-cyan/15 flex items-center justify-center">
                                  <TrendingUp className="w-4 h-4 text-brand-cyan" />
                                </div>
                                <span className="min-w-0 tf-eyebrow tracking-wide">Experience Level</span>
                              </div>
                              {assessment.jd_experience_level ? (
                                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${expColor(assessment.jd_experience_level)}`}>
                                  {expLabel(assessment.jd_experience_level)}
                                </span>
                              ) : (
                                <span className="tf-body-muted">Not available</span>
                              )}
                            </div>

                            {/* Primary Domain */}
                            <div className="tf-card-soft min-w-0 p-4 sm:p-5">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-9 h-9 flex-shrink-0 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                                  <Globe className="w-4 h-4 text-brand-blue" />
                                </div>
                                <span className="min-w-0 tf-eyebrow tracking-wide">Primary Domain</span>
                              </div>
                              {assessment.jd_primary_domain ? (
                                <span className="tf-row-name [overflow-wrap:anywhere]">{assessment.jd_primary_domain}</span>
                              ) : (
                                <span className="tf-body-muted">Not available</span>
                              )}
                            </div>

                            {/* Coding Requirement */}
                            <div className="tf-card-soft min-w-0 p-4 sm:p-5">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-9 h-9 flex-shrink-0 rounded-xl bg-brand-cyan/10 ring-1 ring-brand-cyan/15 flex items-center justify-center">
                                  <Code className="w-4 h-4 text-brand-cyan" />
                                </div>
                                <span className="min-w-0 tf-eyebrow tracking-wide">Coding Requirement</span>
                              </div>
                              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${assessment.coding_enabled ? 'bg-success-subtle text-success ring-1 ring-success-line' : 'bg-slate-100 text-gray-600 ring-1 ring-gray-200'}`}>
                                {assessment.coding_enabled ? 'Required' : 'Not Required'}
                              </span>
                            </div>

                            {/* Eligible Programming Languages */}
                            <div className="tf-card-soft min-w-0 p-4 sm:p-5 @xl:col-span-2">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-9 h-9 flex-shrink-0 rounded-xl bg-brand-orange/10 ring-1 ring-brand-orange/20 flex items-center justify-center">
                                  <Zap className="w-4 h-4 text-brand-orange-deep" />
                                </div>
                                <span className="min-w-0 tf-eyebrow tracking-wide">Eligible Programming Languages</span>
                              </div>
                              {codingLanguages.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                  {codingLanguages.map((lang, idx) => (
                                    <span
                                      key={idx}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20"
                                    >
                                      <LanguageLogo language={logoLabelForId(lang, lang)} size="sm" />
                                      {lang}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="tf-body-muted">{assessment.coding_enabled ? 'No languages specified' : 'N/A — coding not required'}</span>
                              )}
                            </div>
                          </div>

                          {/* Must-Have Skills (MHS) — labelled symmetrically with the
                              NHS section so a recruiter scanning the page sees a
                              matching pair instead of "Skill Depth" + "Nice-to-Have". */}
                          {skillDepth.length > 0 && (
                            <div>
                              <div className="flex flex-wrap items-center gap-2 mb-3">
                                <Star className="w-4 h-4 text-brand-blue" />
                                <h4 className="tf-row-name tracking-tight">Must-Have Skills</h4>
                                <span className="tf-meta">(Required skills extracted from JD)</span>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {skillDepth.map((skill: any, idx: number) => {
                                  const skillName = typeof skill === 'string' ? skill : skill?.name || skill?.skill || JSON.stringify(skill);
                                  const level = typeof skill === 'object' ? (skill?.level || skill?.depth) : null;
                                  return (
                                    <span
                                      key={idx}
                                      className="inline-flex max-w-full [overflow-wrap:anywhere] items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20"
                                    >
                                      {skillName}
                                      {level && (
                                        <span className="text-xs text-brand-blue/70 font-normal">· {level}</span>
                                      )}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Nice-to-Have Skills (NHS) — always rendered alongside
                              MHS so the section's presence is consistent. When the
                              JD has none configured we show a muted placeholder
                              instead of hiding the heading entirely (which made
                              recruiters think NHS support was missing). */}
                          <div>
                            <div className="flex flex-wrap items-center gap-2 mb-3">
                              <Star className="w-4 h-4 text-brand-cyan" />
                              <h4 className="tf-row-name tracking-tight">Nice-to-Have Skills</h4>
                              <span className="tf-meta">(Preferred skills extracted from JD)</span>
                            </div>
                            {niceToHaveSkills.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {niceToHaveSkills.map((skill: any, idx: number) => {
                                  const skillName = typeof skill === 'string' ? skill : skill?.name || skill?.skill || JSON.stringify(skill);
                                  const level = typeof skill === 'object' ? (skill?.level || skill?.depth) : null;
                                  return (
                                    <span
                                      key={idx}
                                      className="inline-flex max-w-full [overflow-wrap:anywhere] items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/25"
                                    >
                                      {skillName}
                                      {level && (
                                        <span className="text-xs text-brand-cyan/80 font-normal">· {level}</span>
                                      )}
                                    </span>
                                  );
                                })}
                              </div>
                            ) : (
                              <span className="inline-flex items-center px-3 py-1.5 rounded-lg tf-body-muted bg-gray-50 border border-gray-200">
                                None configured for this JD
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

              </div>
            </div>

            {/* Assessment Guidance — mirrors the JD view's guidance section so
                recruiters see it without switching to the View JD tab. */}
            {jdData?.assessment_guidance && (
              <div className="tf-card-soft">
                <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-b border-gray-200">
                  <h3 className="tf-row-name sm:text-base flex items-center gap-2 tracking-tight">
                    <div className="w-9 h-9 flex-shrink-0 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                      <Info className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue" />
                    </div>
                    Assessment Guidance
                  </h3>
                </div>
                <div className="p-3 sm:p-4 lg:p-6">
                  <div className="px-3 sm:px-4 py-3 sm:py-4 bg-brand-blue/5 rounded-lg ring-1 ring-brand-blue/15 tf-body">
                    <div className="markdown-content leading-relaxed">
                      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                        {jdData.assessment_guidance}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Invitation Status — the Assessments page's "Assessments - Invite
            Status Tracking" popup, rendered as this page's own tab. The parts
            are that popup's own: `InviteStatCards` for the stat row that
            doubles as the status filter, the Note banner that explains why
            only Completed rows navigate, `InviteFilterBar` for search / status
            / date range, the Select All + Bulk Resend bar, and
            `AssessmentInviteTable` for the candidate list itself. Nothing here
            is a second design of any of them.

            What the popup's dialog owns and a tab does not: the modal chrome,
            and the Close button in its footer. The results count and the pager
            stay, in the popup's footer treatment. */}
        {activeTab === 'invitations' && (
          <div className="tf-card-soft flex flex-col">
            {/* Header — this page's card header, carrying the popup's Refresh
                control. The popup's title block is its dialog's; the tab is
                already labelled by the nav entry that opened it. */}
            <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
              <h3 className="min-w-0 tf-row-name sm:text-base flex items-center gap-2 tracking-tight">
                <div className="w-9 h-9 flex-shrink-0 rounded-xl bg-brand-cyan/10 ring-1 ring-brand-cyan/15 flex items-center justify-center">
                  <Mail className="w-4 h-4 sm:w-5 sm:h-5 text-brand-cyan" />
                </div>
                Invitation Status
              </h3>
              {/* The popup's Refresh, down to the spinning icon and the
                  reserved label width that stops the button resizing
                  mid-request. */}
              <Button
                variant="secondary"
                size="sm"
                onClick={refreshInvites}
                disabled={inviteRefreshing || inviteLoading}
                title="Fetch the latest invite statuses"
                aria-label="Refresh"
                className="w-fit shrink-0"
                icon={<RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 ${inviteRefreshing ? 'animate-spin' : ''}`} />}
              >
                <span className="hidden sm:inline">
                  {inviteRefreshing ? 'Refreshing...' : 'Refresh'}
                </span>
              </Button>
            </div>

            {/* Stat row doubles as the status filter — same component, buckets
                and wording as the popup. Counts come from the unfiltered
                summary, so selecting a bucket narrows the table without
                collapsing the other cards. */}
            <InviteStatCards
              /* The Job Openings module's Track Invites stat grid (globals.css,
                 `.tf-tracker-stats`): 2 per row on phones, so every label shows in
                 full without a sideways-scrolling strip; 3 / 4 / 7 as it widens. */
              gridClassName="tf-tracker-stats"
              activeStatus={inviteFilters.status}
              onSelect={(status) => {
                setInviteFilters({ ...inviteFilters, status });
                setInvitePage(1);
              }}
              cards={[
                { key: 'all', label: 'Total Invited', Icon: Users, value: inviteStats.total, ...INVITE_CARD_TONES.blue },
                { key: 'sent', label: 'Invited', Icon: Mail, value: inviteStats.invited, ...INVITE_CARD_TONES.slate },
                { key: 'started', label: 'In Progress', Icon: Play, value: inviteStats.started, ...INVITE_CARD_TONES.cyan },
                { key: 'completed', label: 'Completed', Icon: CheckCircle, value: inviteStats.completed, ...INVITE_CARD_TONES.green },
                { key: 'expired', label: 'Expired', Icon: Clock, value: inviteStats.expired, ...INVITE_CARD_TONES.orange },
                { key: 'terminated', label: 'Terminated', Icon: Ban, value: inviteStats.terminated, ...INVITE_CARD_TONES.red },
                { key: 'revoked', label: 'Revoked', Icon: Ban, value: inviteStats.revoked, ...INVITE_CARD_TONES.indigo },
              ]}
            />

            <InviteFilterBar
              filters={inviteFilters}
              onChange={(nextFilters) => {
                setInviteFilters(nextFilters);
                setInvitePage(1);
              }}
              /* One option per stat card above, so picking one can never
                 return rows the cards cannot explain. */
              statusOptions={ASSESSMENT_DETAILS_STATUS_OPTIONS}
              searchPlaceholder="Search by candidate name, email, or CID..."
            />

            {/* Select All + Bulk Resend — the popup's bar, on
                `inviteInitialLoading` rather than the plain loading flag so it
                does not disappear and come back during a refresh. */}
            {!inviteInitialLoading && inviteSelectableIds.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 sm:px-6 pt-2.5 sm:pt-3 flex-shrink-0">
                <button
                  type="button"
                  onClick={toggleInviteSelectAll}
                  className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400 hover:text-brand-blue transition-colors"
                >
                  <span
                    role="checkbox"
                    aria-checked={allInvitesSelected}
                    className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors ${
                      allInvitesSelected
                        ? 'bg-brand-blue border-brand-blue'
                        : 'bg-white dark:bg-slate-900 border-gray-300 dark:border-slate-600'
                    }`}
                  >
                    {allInvitesSelected && <Check className="w-3 h-3 text-white" />}
                  </span>
                  Select All ({inviteSelectableIds.length})
                </button>
                {/* Resend / Revoke — mutually exclusive, and only when EVERY
                    selected row is uniformly that action's status (a mixed
                    selection shows neither), matching the Track Invites
                    popup's allTrackingResendable/allTrackingRevocable. */}
                {allInviteSelectedResendable && (
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => setShowInviteBulkResend(true)}
                    disabled={isBulkResendingInvites}
                    className="whitespace-nowrap"
                    icon={isBulkResendingInvites
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Mail className="w-3.5 h-3.5" />}
                  >
                    {isBulkResendingInvites ? 'Sending…' : `Resend (${inviteSelectedIds.size})`}
                  </Button>
                )}
                {allInviteSelectedRevocable && (
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => setShowInviteBulkRevoke(true)}
                    disabled={isBulkRevokingInvites}
                    className="whitespace-nowrap"
                    icon={isBulkRevokingInvites
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Ban className="w-3.5 h-3.5" />}
                  >
                    {isBulkRevokingInvites ? 'Revoking…' : `Revoke (${inviteSelectedIds.size})`}
                  </Button>
                )}
              </div>
            )}

            {/* The table body. `relative` so the refresh veil covers exactly
                it without being part of its flow — an overlay adds no height,
                which is the whole point of it. */}
            <div className="relative px-2.5 sm:px-6 py-2.5 sm:py-4 overflow-hidden flex flex-col">
              <AssessmentInviteTable
                invitations={inviteRows}
                isInitialLoading={inviteInitialLoading}
                hasActiveFilters={inviteHasActiveFilters}
                emptyMessage="No invitations found for this assessment."
                techEnabled={!!assessment.technical_enabled}
                codingEnabled={!!assessment.coding_enabled}
                selectedIds={inviteSelectedIds}
                onToggleSelect={toggleInviteSelectOne}
                archived={isAssessmentArchived(assessment?.status)}
                jdDisabled={thisVersionLocked}
                canOpenResult={opensTrackedInviteDetails}
                onOpenResult={openInviteResult}
                onResend={setResendTarget}
                onRevoke={setRevokeInviteTarget}
                onEdit={setEditInviteTarget}
                revokingId={revokeInviteTarget?.id}
                editingEmailId={editingEmailId}
                newEmailValue={newEmailValue}
                onNewEmailChange={setNewEmailValue}
                onStartEditEmail={(inv) => {
                  setEditingEmailId(inv.id);
                  setNewEmailValue(inv.candidate_email);
                }}
                onCancelEditEmail={() => {
                  setEditingEmailId(null);
                  setNewEmailValue('');
                }}
                onSubmitEmail={handleUpdateInviteEmail}
                isSendingChangeEmail={isSendingChangeEmail}
              />

              {inviteRefreshVeil && (
                <div
                  className="absolute inset-0 z-10 flex items-start justify-center pt-10 sm:pt-14 bg-white/60 dark:bg-slate-900/60 rounded-lg"
                  aria-live="polite"
                >
                  <span className="inline-flex items-center gap-2 rounded-full bg-white dark:bg-slate-900 px-3 py-1.5 tf-body-secondary shadow-sm ring-1 ring-black/[0.06] dark:ring-white/10">
                    <Loader2 className="w-3.5 h-3.5 text-brand-blue animate-spin" />
                    Refreshing invite statuses...
                  </span>
                </div>
              )}
            </div>

            {/* The popup's footer, less its Close button — a tab has nothing
                to close. */}
            <div className="px-3 sm:px-6 py-2.5 sm:py-4 border-t border-gray-100 dark:border-slate-700/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-3 bg-slate-50 dark:bg-slate-950 shrink-0 rounded-b-xl">
              <p className="tf-body-muted text-center sm:text-left order-2 sm:order-1">
                {inviteResultsLabel}
              </p>
              <div className="flex items-center justify-center sm:justify-end flex-wrap gap-1.5 sm:gap-2 order-1 sm:order-2">
                {inviteTotalPages > 1 && (
                  <InlinePageNav
                    page={invitePage}
                    totalPages={inviteTotalPages}
                    onPageChange={setInvitePage}
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {/* RESULTS TAB — the results PAGE, in this page's card.
         *
         * `AssessmentResults` itself, with `embedded` so it drops the frame this
         * card has already drawn (its own breadcrumb, record pager and white
         * panel) and keeps everything that is the results: the four stat cards,
         * the two version scopes, the filters, the candidate table and the
         * exports. Not a summary written for the tab — the tab and
         * `/recruitment/assessments/<id>/results` are one component, so a change
         * to how results read lands on both.
         *
         * It opens on THIS record's coordinates, which is what the tab is for:
         * `jobVersionScope` is the JD row this assessment was authored against
         * (that row IS its job version) and `assessmentVersionScope` is its own
         * revision, the number the header badge prints — the same pair the
         * Assessment Versions table's Results icon names. Both selectors are
         * still there, so the job-wide reading is one widening away.
         *
         * `onBack` is a no-op: nothing embedded renders it, and the host's own
         * Back is on the header above.
         *
         * Mounted only while the tab is open, so its fan-out over the job's
         * versions costs nothing on a page opened to read the configuration —
         * the same rule the invitations and version tabs are loaded under. */}
        {activeTab === 'results' && (
          <AssessmentResults
            embedded
            onBack={() => {}}
            assessmentId={assessment.id}
            /* The same title the breadcrumb above prints — the stored "Version
               N" suffix stripped, since the version is a badge of its own. */
            assessmentTitle={stripVersionFromTitle(assessment.title) || ''}
            assessmentVersion={assessment.version ?? null}
            jdTitle={assessment.jd_title || assessment.job?.title}
            jdId={assessment.jd_id}
            jdShortId={assessment.jd_short_id}
            jdVersion={assessment.jd_version ?? null}
            /* Back from a candidate's result (`results_restore`), name no
               scope: the list restores the versions the recruiter left it on
               instead of snapping back to this record's own pair. */
            jobVersionScope={isResultRestoreArrival(searchParams) ? null : assessment.jd_id ?? null}
            assessmentVersionScope={
              isResultRestoreArrival(searchParams)
                ? null
                : typeof assessment.version === 'number' ? String(assessment.version) : null
            }
            canDownloadPDF={canDownloadResultPDF}
            canBatchDownload={canBatchDownloadResults}
            /* Opening or revisiting the tab lands on Total Candidates with its
               list showing. Back from a candidate's result instead restores the
               view the recruiter left, as the scopes above do. */
            openOnTotalCandidates={!isResultRestoreArrival(searchParams)}
          />
        )}

        {/* Activity Tab */}
        {activeTab === 'activity' && (
          <div className="tf-card-soft">
            <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-b border-gray-200">
              <h3 className="tf-body sm:text-base lg:text-lg tracking-tight flex items-center gap-2">
                <div className="w-9 h-9 flex-shrink-0 rounded-xl bg-brand-cyan/10 ring-1 ring-brand-cyan/15 flex items-center justify-center">
                  <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-brand-cyan" />
                </div>
                Recent Activity
              </h3>
            </div>

            {activityPending ? (
              <div className="divide-y divide-gray-100">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4">
                    <div className="flex items-start sm:items-center gap-2 sm:gap-3 lg:gap-4">
                      <Skeleton className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 sm:gap-0">
                          <Skeleton className="h-4 w-56 max-w-full" />
                          <Skeleton className="h-3.5 w-24" />
                        </div>
                        <Skeleton className="h-3.5 w-48 max-w-full mt-1" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : activityFeed.length === 0 ? (
              <div className="px-3 sm:px-4 lg:px-6 py-8 sm:py-12 text-center">
                <Calendar className="w-8 h-8 sm:w-12 sm:h-12 text-brand-blue/30 mx-auto mb-2 sm:mb-3" />
                <p className="tf-body-secondary mb-1">No activity recorded yet</p>
                <p className="tf-body-muted">Activity will appear here as candidates take the assessment</p>
              </div>
            ) : (() => {
              const totalPages = Math.max(1, Math.ceil(activityFeed.length / ACTIVITY_PAGE_SIZE));
              const startIdx = (activityPage - 1) * ACTIVITY_PAGE_SIZE;
              const pageItems = activityFeed.slice(startIdx, startIdx + ACTIVITY_PAGE_SIZE);
              // Open a completed candidate's result details. Stores the ordered
              // list of completed candidates (with a resolvable attempt_id) so
              // the details view offers Prev/Next between them — mirrors the
              // Results page + Track-Invites flow.
              const openCompletedResult = (activity: any) => {
                if (!activity.attempt_id) return;
                try {
                  const navList = recentActivity
                    .filter((e: any) => e._eventType === 'completed' && e.attempt_id)
                    .map((e: any) => ({ id: e.attempt_id, cid: e.candidate_display_id || '' }));
                  sessionStorage.setItem('assessmentResultNavList', JSON.stringify(navList));
                } catch { /* ignore quota errors */ }
                /* Back to this assessment's Recent Activity tab. */
                const returnTo = currentResultReturnTo('activity');
                rememberResultReturn(returnTo);
                router.push(
                  `/recruitment/assessments/${assessment.id}/results/details`
                  + `?candidate_id=${activity.attempt_id}`
                  + `${activity.candidate_display_id ? `&cid=${encodeURIComponent(activity.candidate_display_id)}` : ''}`
                  + resultReturnQuery(returnTo, stripVersionFromTitle(assessment.title))
                );
              };
              return (
                <>
                  <div className="divide-y divide-gray-100">
                    {pageItems.map((activity: any, idx: number) => {
                      // Per-event icon + label, derived from _eventType so each
                      // lifecycle moment (invited, sent, opened, started,
                      // completed, terminated, bounced, expired) renders as its
                      // own row. Wording matches the AI Interview lifecycle:
                      // Invited -> System Check -> In Progress -> Completed /
                      // Terminated.
                      const getActivityInfo = () => {
                        switch (activity._eventType) {
                          case 'lc_first_published':
                            return { icon: Globe, color: 'text-success bg-success-subtle ring-1 ring-success-line', label: 'Assessment published' };
                          case 'lc_republished':
                            return { icon: Edit2, color: 'text-brand-cyan bg-brand-cyan/10 ring-1 ring-brand-cyan/20', label: 'Assessment edited & published' };
                          case 'lc_archived':
                            return { icon: Archive, color: 'text-brand-orange-deep bg-brand-orange/10 ring-1 ring-brand-orange/20', label: 'Assessment archived' };
                          case 'lc_unarchived':
                            return { icon: ArchiveRestore, color: 'text-success bg-success-subtle ring-1 ring-success-line', label: 'Assessment unarchived' };
                          case 'completed':
                            return { icon: CheckCircle, color: 'text-success bg-success-subtle ring-1 ring-success-line', label: 'Completed assessment' };
                          case 'terminated':
                            return { icon: Ban, color: 'text-destructive bg-destructive-subtle ring-1 ring-destructive-line', label: 'Terminated before completion' };
                          case 'started':
                            return { icon: Play, color: 'text-brand-cyan bg-brand-cyan/10 ring-1 ring-brand-cyan/20', label: 'Started the assessment (In Progress)' };
                          case 'opened':
                            return { icon: Monitor, color: 'text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20', label: 'Reached system check' };
                          case 'sent':
                            return { icon: Mail, color: 'text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20', label: 'Invitation email sent' };
                          case 'bounced':
                            return { icon: XCircle, color: 'text-destructive bg-destructive-subtle ring-1 ring-destructive-line', label: 'Email bounced' };
                          case 'expired':
                            return { icon: XCircle, color: 'text-brand-orange-deep bg-brand-orange/10 ring-1 ring-brand-orange/20', label: 'Invitation expired' };
                          case 'invited':
                          default:
                            return { icon: Mail, color: 'text-gray-600 bg-slate-100 ring-1 ring-gray-200', label: 'Invited to assessment' };
                        }
                      };

                      const info = getActivityInfo();
                      const ActivityIcon = info.icon;
                      const formattedDate = activity._eventAt ? formatIST(activity._eventAt) : 'N/A';
                      const showScores = activity._eventType === 'completed';
                      // Only completed rows with a resolvable attempt open the
                      // candidate's result details; other lifecycle events stay
                      // as a read-only log.
                      const isClickable = showScores && !!activity.attempt_id;

                      return (
                        <div
                          key={`${activity.id}-${activity._eventType}-${idx}`}
                          onClick={isClickable ? () => openCompletedResult(activity) : undefined}
                          title={isClickable ? 'View candidate results' : undefined}
                          className={`px-3 sm:px-4 lg:px-6 py-3 sm:py-4 transition-colors ${isClickable ? 'cursor-pointer hover:bg-brand-blue/5' : ''}`}
                        >
                          <div className="flex items-start sm:items-center gap-2 sm:gap-3 lg:gap-4">
                            <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${info.color}`}>
                              <ActivityIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 sm:gap-0">
                                <div className="min-w-0">
                                  {activity._lifecycle ? (
                                    /* A lifecycle row is about the assessment,
                                       not a candidate: the event leads, then
                                       who did it. */
                                    <>
                                      <span className="tf-row-name">{info.label}</span>
                                      {activity.actor_name && (
                                        <span className="tf-body-muted ml-1 sm:ml-2 [overflow-wrap:anywhere]">by {activity.actor_name}</span>
                                      )}
                                    </>
                                  ) : (
                                    <>
                                      <span className="tf-row-name [overflow-wrap:anywhere]">{activity.candidate_name || 'Unknown'}</span>
                                      <span className="tf-body-muted ml-1 sm:ml-2">{info.label}</span>
                                    </>
                                  )}
                                </div>
                                <span className="tf-body-muted sm:shrink-0">{formattedDate}</span>
                              </div>
                              {activity._lifecycle ? (
                                activity.actor_email && (
                                  <p className="tf-body-secondary mt-0.5 truncate" title={activity.actor_email}>{activity.actor_email}</p>
                                )
                              ) : (
                                <p className="tf-body-secondary mt-0.5 truncate" title={activity.candidate_email}>{activity.candidate_email}</p>
                              )}
                              {showScores && (
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2">
                                  {assessment.technical_enabled && activity.technical_score != null && (
                                    <div className="flex items-center gap-1.5">
                                      <span className="tf-meta">Tech:</span>
                                      <span className="tf-row-title">{formatScore(activity.technical_score)}%</span>
                                    </div>
                                  )}
                                  {assessment.coding_enabled && activity.coding_score != null && (
                                    <div className="flex items-center gap-1.5">
                                      <span className="tf-meta">Coding:</span>
                                      <span className="tf-row-title">{formatScore(activity.coding_score)}%</span>
                                    </div>
                                  )}
                                  {activity.passed != null && (
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${activity.passed ? 'bg-success-subtle text-success ring-1 ring-success-line' : 'bg-destructive-subtle text-destructive ring-1 ring-destructive-line'}`}>
                                      {activity.passed ? 'Passed' : 'Failed'}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Pagination — 10 events per page. */}
                  {activityFeed.length > ACTIVITY_PAGE_SIZE && (
                    <div className="px-3 sm:px-4 lg:px-6 py-3 border-t border-gray-200 flex flex-col sm:flex-row items-start max-sm:items-center max-sm:text-center sm:items-center justify-between gap-2 tf-body-secondary">
                      <span>
                        Showing {startIdx + 1}–{Math.min(startIdx + ACTIVITY_PAGE_SIZE, activityFeed.length)} of {activityFeed.length}
                      </span>
                      <InlinePageNav
                        page={activityPage}
                        totalPages={totalPages}
                        onPageChange={setActivityPage}
                      />
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* Version History Tab */}
        {activeTab === 'versions' && (
          <div className="tf-card-soft">
            <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-b border-gray-200">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-9 h-9 flex-shrink-0 rounded-xl bg-brand-cyan/10 ring-1 ring-brand-cyan/15 flex items-center justify-center">
                  <Layers className="w-4 h-4 sm:w-5 sm:h-5 text-brand-cyan" />
                </div>
                <h3 className="tf-row-name sm:text-base tracking-tight">Version History</h3>
              </div>
              <p className="tf-body-secondary">Complete timeline of all changes made to this assessment</p>
            </div>

            {versionsLoading ? (
              <div className="p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-2 sm:gap-3 lg:gap-4">
                    <Skeleton className="w-9 h-9 sm:w-10 sm:h-10 lg:w-12 lg:h-12 rounded-full flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Skeleton className="h-5 w-44" />
                        <Skeleton className="h-5 w-24 rounded" />
                      </div>
                      <Skeleton className="h-3.5 w-3/4 mb-3" />
                      <Skeleton className="h-3.5 w-40 mb-1" />
                      <Skeleton className="h-3.5 w-56 mb-3 sm:mb-4" />
                      {/* Configuration box */}
                      <div className="bg-slate-50 border border-gray-200 ring-1 ring-black/[0.02] rounded-xl p-2.5 sm:p-3 lg:p-4">
                        <Skeleton className="h-4 w-32 mb-2 sm:mb-3" />
                        <div className="space-y-1.5 sm:space-y-2">
                          <Skeleton className="h-3.5 w-2/3" />
                          <Skeleton className="h-3.5 w-1/2" />
                          <Skeleton className="h-3.5 w-3/5" />
                          <Skeleton className="h-3.5 w-1/2" />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : versionHistory.length === 0 ? (
              <div className="px-3 sm:px-4 lg:px-6 py-8 sm:py-12 text-center">
                <Clock className="w-8 h-8 sm:w-12 sm:h-12 text-brand-blue/30 mx-auto mb-2 sm:mb-3" />
                <p className="tf-body-secondary mb-1">No version history available</p>
                <p className="tf-body-muted">Version history will appear when the assessment is edited</p>
              </div>
            ) : (
              <div className="p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
                {versionHistory.map((version: any, idx: number) => {
                  const isCurrentVersion = idx === 0;
                  const versionDate = formatIST(version.created_at);

                  return (
                    <div key={version.id} className="space-y-4">
                      {/* Version Header */}
                      <div className="flex items-start gap-2 sm:gap-3 lg:gap-4">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 lg:w-12 lg:h-12 rounded-full bg-brand-cyan shadow-sm shadow-brand-cyan/25 ring-1 ring-white/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-white font-bold text-sm">V{version.version}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-1">
                            <h4 className="min-w-0 tf-row-title sm:text-base tracking-tight">
                              Version {version.version} {version.version === 1 ? 'Published' : 'Updated'}
                            </h4>
                            {isCurrentVersion && (
                              <span className="inline-flex items-center w-fit shrink-0 px-2 py-0.5 bg-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 text-xs font-medium rounded-full whitespace-nowrap">
                                Current Version
                              </span>
                            )}
                          </div>
                          <p className="tf-body-secondary mb-2 sm:mb-3">
                            {version.version === 1 ? 'Initial assessment created and published' : (version.change_summary || 'Assessment configuration updated')}
                          </p>

                          {/* User & Date Info */}
                          <div className="flex items-center gap-1.5 sm:gap-2 tf-body mb-1 flex-wrap">
                            <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 flex-shrink-0" />
                            <span className="font-medium min-w-0 [overflow-wrap:anywhere]">{version.changed_by_name || 'Unknown User'}</span>
                            <span className="text-gray-400">•</span>
                            <span className="text-gray-600">Lead Recruiter</span>
                          </div>

                          <div className="flex items-center gap-1.5 sm:gap-2 tf-body-secondary mb-3 sm:mb-4 flex-wrap">
                            <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 flex-shrink-0" />
                            <span>Published on {versionDate} IST (UTC+5:30)</span>
                          </div>

                          {/* Configuration Details */}
                          <div className="bg-slate-50 border border-gray-200 ring-1 ring-black/[0.02] rounded-xl p-2.5 sm:p-3 lg:p-4">
                            <div className="tf-row-name mb-2 sm:mb-3 tracking-tight">
                              {version.version === 1 ? 'Initial Configuration:' : 'Updated Configuration:'}
                            </div>
                            <ul className="space-y-1.5 sm:space-y-2">
                              <li className="tf-body flex items-start gap-1.5 sm:gap-2">
                                <span className="text-brand-blue mt-0.5">•</span>
                                <span>Assessment type: {[
                                  version.hr_enabled && 'HR',
                                  version.technical_enabled && 'Technical',
                                  version.coding_enabled && 'Coding'
                                ].filter(Boolean).join(', ')}</span>
                              </li>
                              <li className="tf-body flex items-start gap-1.5 sm:gap-2">
                                <span className="text-brand-blue mt-0.5">•</span>
                                <span>Duration set to {assessment.duration_minutes || 60} min</span>
                              </li>
                              {assessment.title && (
                                <li className="tf-body flex items-start gap-1.5 sm:gap-2">
                                  <span className="text-brand-blue mt-0.5">•</span>
                                  <span className="min-w-0 [overflow-wrap:anywhere]">Linked to job posting: {stripVersionFromTitle(assessment.title)}</span>
                                </li>
                              )}
                              <li className="tf-body flex items-start gap-1.5 sm:gap-2">
                                <span className="text-brand-blue mt-0.5">•</span>
                                <span>Proctoring {assessment.proctoring_enabled ? 'enabled' : 'disabled'} with AI monitoring</span>
                              </li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Sibling-versions tab — the assessment versions authored against
            the SELECTED JOB VERSION (this assessment's `jd_id`), which is the
            version the Manage Jobs badge states. Separate from the per-row
            edit history rendered by the Versions tab above. */}
        {activeTab === 'newversions' && (
          <div className="tf-card-soft">
            <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-b border-gray-100">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <div className="w-9 h-9 flex-shrink-0 rounded-xl bg-brand-cyan/10 ring-1 ring-brand-cyan/15 flex items-center justify-center">
                  <Layers className="w-4 h-4 sm:w-5 sm:h-5 text-brand-cyan" />
                </div>
                {/* The nav entry's own label, so the panel cannot be
                    headed one thing while the tab that opens it says
                    another. */}
                <h3 className="min-w-0 truncate tf-row-name sm:text-base tracking-tight">{siblingVersionsTabLabel}</h3>
                {/* Which job version these belong to, in the marker the
                    header's Assessment Versions popover already uses — the
                    list is that job version's assessments and nothing else,
                    so the panel says so rather than leaving the reader to
                    infer it. */}
                {selectedJobVersionNumber != null && (
                  <span className="tf-micro-hint">
                    Job V{selectedJobVersionNumber}
                  </span>
                )}
              </div>
              <p className="tf-body-secondary">
                {selectedJobVersionNumber != null
                  ? `Every assessment version created for Job V${selectedJobVersionNumber} (V1 is the original; V2 onwards are duplicates, up to 5).`
                  : 'All versions of this assessment (V1 is the original; V2 onwards are duplicates, up to 5).'}
              </p>
            </div>

            {siblingsLoading || siblingRows === null ? (
              <div className="p-3 sm:p-4 lg:p-6 space-y-3 sm:space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="tf-panel p-3 sm:p-4">
                    <div className="flex items-start gap-3 sm:gap-4">
                      <Skeleton className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5">
                          <Skeleton className="h-5 w-48 sm:w-64" />
                          <Skeleton className="h-5 w-16 rounded" />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Skeleton className="h-3.5 w-24" />
                          <Skeleton className="h-3.5 w-28" />
                          <Skeleton className="h-3.5 w-20" />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : siblingRows.length === 0 ? (
              <div className="px-3 sm:px-4 lg:px-6 py-8 sm:py-12 text-center">
                <Layers className="w-8 h-8 sm:w-12 sm:h-12 text-brand-blue/30 mx-auto mb-2 sm:mb-3" />
                <p className="tf-body-secondary mb-1">No additional versions yet</p>
                <p className="tf-body-muted">Duplicate this assessment to create additional versions</p>
              </div>
            ) : (
              <div className="p-3 sm:p-4 lg:p-6 space-y-3 sm:space-y-4">
                {siblingRows.map((sibling: any) => {
                  const isThis = sibling.id === assessment.id;
                  const enabledSections = [
                    sibling.hr_enabled && 'HR',
                    sibling.technical_enabled && 'Technical',
                    sibling.coding_enabled && 'Coding',
                  ].filter(Boolean).join(', ') || '—';
                  const statusRaw = String(sibling.status || '').toLowerCase();
                  const statusLabel = statusRaw === 'published' ? 'Active'
                    : statusRaw === 'closed' ? 'Completed'
                    : statusRaw === 'archived' ? 'Archived'
                    : 'Draft';
                  const statusChipClass = statusRaw === 'published'
                    ? 'bg-success-subtle text-success-strong ring-1 ring-success-line'
                    : statusRaw === 'archived'
                    ? 'bg-gray-100 text-gray-700 ring-1 ring-gray-200'
                    : statusRaw === 'closed'
                    ? 'bg-blue-100 text-blue-800 ring-1 ring-blue-200'
                    : 'bg-warning-subtle text-warning-strong ring-1 ring-warning-line';

                  return (
                    <div
                      key={sibling.id}
                      className={`rounded-xl border p-3 sm:p-4 ring-1 ring-black/[0.02] ${
                        isThis ? 'border-brand-blue/40 bg-brand-blue/5' : 'border-gray-100 bg-white'
                      }`}
                    >
                      <div className="flex items-start gap-3 sm:gap-4">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-brand-cyan shadow-sm shadow-brand-cyan/25 ring-1 ring-white/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-white font-bold text-sm">V{sibling.version || 1}</span>
                        </div>
                        <div className="@container flex-1 min-w-0">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 mb-1.5">
                            <h4 className="min-w-0 tf-row-title sm:text-base tracking-tight truncate">
                              {stripVersionFromTitle(sibling.title || '') || sibling.short_id || 'Untitled assessment'}
                              {sibling.version ? ` - Version ${sibling.version}` : ''}
                            </h4>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${statusChipClass}`}>
                                {statusLabel}
                              </span>
                              {isThis && (
                                <span className="tf-badge bg-brand-blue text-white shadow-sm shadow-brand-blue/25">
                                  Viewing
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 @md:grid-cols-2 gap-x-4 gap-y-1 tf-body mt-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Users className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                              <span className="shrink-0">Created by</span>
                              <span className="font-medium truncate">{sibling.created_by_name || 'Unknown'}</span>
                            </div>
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Calendar className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                              <span className="truncate">{formatIST(sibling.created_at)}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                              <span>{sibling.duration_minutes || assessment.duration_minutes || 30} min</span>
                            </div>
                            <div className="flex items-center gap-1.5 min-w-0">
                              <FileText className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                              <span className="truncate">{enabledSections}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Users className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                              <span>{sibling.invitations_count || 0} invited</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <CheckCircle className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                              <span>{sibling.completed_count || 0} completed</span>
                            </div>
                          </div>
                        </div>

                        {/* Preview this version's configure settings.

                            Opens the SAME dialog the Edit action opens
                            (`AssessmentConfigureModal`, which renders the
                            Configure step itself) in read-only mode, pointed
                            at this card's own row rather than the assessment
                            being viewed — so each version is read in the form
                            that configures it. No second preview flow.

                            A flex item in the card's top row, not an absolutely
                            positioned corner: it reserves its own column, so
                            the title's `truncate` and the badges — which wrap
                            under the title below `sm` — lay out around it
                            instead of running beneath it. */}
                        {/* Gated on `jd_id` for the same reason the Edit action
                            is: the Configure step is scoped to a job, so a
                            version without one has no configuration form to
                            open and the icon would be a dead click. Every row
                            in this list is found BY a job, so this is a guard,
                            not a case the tab shows. */}
                        {sibling.jd_id && (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => setPreviewVersion(sibling)}
                            title="Preview configure settings"
                            aria-label={`Preview configure settings for Version ${sibling.version || 1}`}
                            className="h-8 w-8 flex-shrink-0"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      {/* VIEW JD — the Job Details page's own reading of a JD.

          Its identity card, then its Overview column, as SIBLINGS rather than
          sections of one card. That nesting is what made this tab look like a
          different screen: everything sat inside a "Job Description" card
          whose header then repeated the description card's own heading, and
          the page's card-per-section rhythm flattened into one box.

          The tab's own title/status/department row and its Employment / Work
          Mode / Experience tile grid are gone with it — `JDIdentityHeader` is
          those same facts in the page's chips, and the Requirements grid
          inside the Extracted Data Summary is where the page states them a
          second time.

          Read-only throughout: neither component takes an action callback.

          `jdData` is narrowed to the selected job version, so every card here
          describes the version the page header names and nothing else. */}
      {activeTab === 'viewjd' && (
        <div className="space-y-4 sm:space-y-5">
          <TabHeading icon={Briefcase} title="View JD" />
          {/* "No linked job description" is a property of the ASSESSMENT — it
              has no job behind it — so it is asked first, off `jd_id`. Asking
              it off `jdData` instead meant the empty state also covered the
              gap between a version switch and the refetch it triggers, where
              the new version's JD is simply not loaded yet: for that frame the
              panel announced the job had no description at all. That gap now
              reads as loading, which is what it is. */}
          {!assessment.jd_id ? (
            <div className="tf-card-soft px-3 sm:px-4 lg:px-6 py-8 text-center">
              <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="tf-body-muted">No linked job description found</p>
            </div>
          ) : jdError ? (
            <div className="tf-card-soft px-3 sm:px-4 lg:px-6 py-8 text-center">
              <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
              <p className="text-sm text-destructive">{jdError}</p>
            </div>
          ) : jdLoading || !jdData ? (
            <div className="bg-white rounded-xl border border-gray-200 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 px-3 sm:px-4 lg:px-6 py-12 flex items-center justify-center tf-loader-center">
              <Loader2 className="w-6 h-6 text-brand-blue animate-spin" />
            </div>
          ) : (
            <>
              {/* The version stated here is the page's own resolved number,
                  not the JD record's — see `selectedJobVersionNumber`. Both
                  describe the same row, and taking the page's keeps this pill
                  and the Manage Jobs badge above it from ever disagreeing. */}
              <JDIdentityHeader jd={jdData} versionNumber={selectedJobVersionNumber} />

              <JDOverviewSections jd={jdData} />

              {/* The way through to the JD's own page, where everything here
                  is editable. */}
              <div className="flex justify-end">
                <button
                  onClick={() => router.push(jobDetailsHref(jdData.id))}
                  className="inline-flex items-center gap-1.5 text-sm text-brand-blue hover:text-brand-blue-2 transition-colors"
                >
                  Open full JD page
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          )}
        </div>
      )}
      </div>
      </div>
      </div>
      </div>

      {archiveConfirmModal}

      <RevokeInvitationDialog
        target={revokeInviteTarget}
        onClose={() => setRevokeInviteTarget(null)}
        getAssessmentId={() => assessment.id}
        onRevoked={reloadInvites}
      />
      <EditInvitationModal
        target={editInviteTarget}
        onClose={() => setEditInviteTarget(null)}
        getAssessmentId={() => assessment.id}
        onSaved={reloadInvites}
      />

      {/* Resend confirmation — regenerates the token and invalidates the old
          link. Same wording, tone and variant as the Track Invites popup's. */}
      <ResendLinkModal
        isOpen={!!resendTarget}
        kind="assessment"
        email={resendTarget?.candidate_email}
        onCancel={() => { if (!isResending) setResendTarget(null); }}
        onConfirm={() => resendTarget && handleResendInvite(resendTarget)}
        isLoading={isResending}
      />

      <ResendLinkModal
        isOpen={showInviteBulkResend}
        kind="assessment"
        bulk={{ count: inviteSelectedIds.size }}
        targets={inviteRows.filter((inv) => inviteSelectedIds.has(inv.id) && isBulkResendable(inv)).map((inv) => ({ jobCode: assessment.jd_short_id, jobTitle: assessment.jd_title || stripVersionFromTitle(assessment.title), version: assessment.version, email: inv.candidate_email }))}
        onCancel={() => { if (!isBulkResendingInvites) setShowInviteBulkResend(false); }}
        onConfirm={handleInviteBulkResend}
        isLoading={isBulkResendingInvites}
      />

      {/* Bulk revoke confirmation — selected Invited candidates only. Same
          wording as the Track Invites popup's bulk revoke. */}
      <RevokeLinkModal
        isOpen={showInviteBulkRevoke}
        kind="assessment"
        bulk={{ scope: 'selected', count: inviteSelectedIds.size }}
        targets={inviteRows.filter((inv) => inviteSelectedIds.has(inv.id) && isBulkRevocable(inv)).map((inv) => ({ jobCode: assessment.jd_short_id, jobTitle: assessment.jd_title || stripVersionFromTitle(assessment.title), version: assessment.version, email: inv.candidate_email }))}
        onCancel={() => { if (!isBulkRevokingInvites) setShowInviteBulkRevoke(false); }}
        onConfirm={handleInviteBulkRevoke}
        isLoading={isBulkRevokingInvites}
      />

      {/* Configure-settings preview for a New Versions card.

          The SAME dialog the Edit action opens — `AssessmentConfigureModal`,
          which renders the Configure step itself — in `readOnly` mode: same
          layout, header, cards, fields, labels and type, every control
          non-operable, and no Save as Draft / Publish. A preview of the
          configure settings is the configure form, not a second screen
          describing it.

          Renders nothing while `previewVersion` is null. */}
      <AssessmentConfigureModal
        isOpen={!!previewVersion}
        onClose={() => setPreviewVersion(null)}
        assessment={previewVersion}
        readOnly
      />
    </main>
  );
}
