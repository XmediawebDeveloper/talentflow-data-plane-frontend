'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Users, Mail, Play, Check, CheckCircle, Clock, Ban, TrendingUp, Loader2, RefreshCw, Info, Send, Undo2, Download, FileText, FileSpreadsheet } from 'lucide-react';
import ExportColumnsModal, { type ExportFormatOption } from '@/components/ExportColumnsModal';
import { exportRows } from '@/lib/utils/exportUtils';
import { useAuth } from '@/lib/hooks/useAuth';
import type { InviteStatusKind } from '@/components/ui/invite-status-chip';
import { StatCardsHint, StatusLegend, UpdatedAgo } from '@/components/ui/guided-tracker';
import { TrackerSelectAll, TrackerStatusTabs, TrackerTabHint, trackerSelection, TRACKER_LOOK_PANEL_CLASS, TRACKER_LOOK_BODY_CLASS, TrackerBulkBar, type TrackerTab, type TrackerSelectGroup } from '@/components/ui/tracker-look';
import { toast } from 'sonner';
import ListPagination from '@/components/ListPagination';
import { showErrorToast } from '@/lib/utils/errorToast';
import { aiInterviewService, isJdDisabled, JD_DISABLED_ACTION_MESSAGE, JD_ARCHIVED_ACTION_MESSAGE, isInterviewConfigArchived } from '@/lib/services/aiInterviewService';
import { interviewVersionOrdinal } from '@/lib/utils/aiInterviewVersion';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { INVITE_SOURCE_FILTER_OPTIONS, RESULT_FILTER_OPTIONS } from '@/components/ai-interview/ColumnFilterFields';
import ResendLinkModal from '@/components/recruitment/ResendLinkModal';
import { interviewResendExpiry } from '@/lib/utils/resendExpiry';
import RevokeLinkModal from '@/components/recruitment/RevokeLinkModal';
import { Button } from '@/components/ui/button';
import InviteFilterBar, {
  EMPTY_INVITE_FILTERS,
  AI_INTERVIEW_INVITE_STATUS_OPTIONS,
  hasActiveInviteFilters,
  type InviteFilterState,
} from '@/components/InviteFilterBar';
import InviteStatCards, { INVITE_CARD_TONES } from '@/components/InviteStatCards';
import { TRACKER_DIALOG_PANEL_CLASS } from '@/lib/constants/trackerDialog';
import TabEmptyState from '@/components/ui/tab-empty-state';
import { useDialogHeightLock } from '@/lib/hooks/useDialogHeightLock';
import { useTrackerPoll } from '@/lib/hooks/useTrackerPoll';
import { isValidEmailFormat, EMAIL_FORMAT_ERROR } from '@/lib/utils/email';
import { isValidCandidateName, NAME_FORMAT_ERROR } from '@/lib/utils/name';
import { VersionPill } from '@/components/ai-interview/AllInterviewsTable';
import { JobLockBadge, JobLockBanner, JobVersionsLockBanner, splitJobVersions } from '@/components/jobs/JobLockNotice';
import { jdService, type JDLineageVersion } from '@/lib/services/jdService';
import { jobStatusBadgeKind } from '@/components/jobs/JobStatusBadge';
import { FolderIconIllustration } from '@/components/ui/illustrated-empty-state';
import AIInterviewInviteTable, {
  isExpiredForActions,
  isRevocableInvite,
  displayInviteScore,
  matchesInviteResultFilter,
  inviteResult,
  inviteSourceLabel,
  inviteStatusLabel,
} from '@/components/AIInterviewInviteTable';

const exportDate = (value: string | null | undefined): string => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
};

const exportVersion = (n: number | null | undefined): string => (n != null && n > 0 ? `V${n}` : '');

/* Export columns: one row per invite, in the table's own order and wording.
   The Export popup lets the user untick any of them. */
type InviteExportContext = { jdShortId?: string; jdTitle: string; jobVersion?: number; interviewVersion?: number };
type InviteExportRow = {
  candidate_cid?: string | null; candidate_name?: string | null; candidate_email?: string | null;
  invitation_sent_at?: string | null; created_at?: string | null; started_at?: string | null;
  completed_at?: string | null; expires_at?: string | null; _jd_version?: number; _interview_version?: number;
};
const INVITE_EXPORT_COLUMNS: { id: string; label: string; value: (inv: InviteExportRow, ctx: InviteExportContext) => string }[] = [
  { id: 'cid', label: 'CID', value: (inv) => inv.candidate_cid || '' },
  { id: 'name', label: 'Candidate Name', value: (inv) => inv.candidate_name || '' },
  { id: 'email', label: 'Email', value: (inv) => inv.candidate_email || '' },
  { id: 'status', label: 'Status', value: (inv) => inviteStatusLabel(inv) },
  { id: 'invited', label: 'Invited At', value: (inv) => exportDate(inv.invitation_sent_at || inv.created_at) },
  { id: 'started', label: 'Started At', value: (inv) => exportDate(inv.started_at) },
  { id: 'completed', label: 'Completed At', value: (inv) => exportDate(inv.completed_at) },
  { id: 'expires', label: 'Link Expires At', value: (inv) => exportDate(inv.expires_at) },
  { id: 'score', label: 'Score', value: (inv) => { const s = displayInviteScore(inv); return s != null ? String(Math.round(s)) : ''; } },
  { id: 'result', label: 'Result', value: (inv) => inviteResult(inv, displayInviteScore(inv)) ?? '' },
  { id: 'jobId', label: 'Job ID', value: (_inv, ctx) => ctx.jdShortId || '' },
  { id: 'jobTitle', label: 'Job Title', value: (_inv, ctx) => ctx.jdTitle },
  { id: 'jobVersion', label: 'Job Version', value: (inv, ctx) => exportVersion(inv._jd_version ?? ctx.jobVersion) },
  { id: 'interviewVersion', label: 'Interview Version', value: (inv, ctx) => exportVersion(inv._interview_version ?? ctx.interviewVersion) },
  { id: 'source', label: 'Invite Source', value: (inv) => inviteSourceLabel(inv)?.replace(/^Via /, '') ?? '' },
];

type InviteExportFormat = 'csv' | 'xlsx';
const INVITE_EXPORT_FORMATS: ExportFormatOption<InviteExportFormat>[] = [
  { key: 'csv', title: 'CSV Format', description: 'Compatible with Excel, Google Sheets, and most spreadsheet apps.', Icon: FileText, iconWrap: 'bg-success-subtle', iconColor: 'text-success' },
  { key: 'xlsx', title: 'Excel Format (.xlsx)', description: 'Native Excel format with formatting and styling.', Icon: FileSpreadsheet, iconWrap: 'bg-blue-100 dark:bg-blue-500/15', iconColor: 'text-blue-700 dark:text-blue-300' },
];

/* Bulk resend eligibility — Expired rows only, and never once the candidate
   has started or completed. A freshly-sent "invited" row has no manual resend
   (Revoke, then Edit's Save and Send on the AI Interviews page, is the only
   way to reissue a link) — matches the per-row Resend rule so the two popups
   behave the same. */
const isBulkResendable = (inv: any): boolean =>
  isExpiredForActions(inv) &&
  !inv.started_at &&
  !inv.completed_at;

/* Any row a bulk Revoke OR a bulk Resend can act on gets a checkbox — same
   rule as the Assessments tracker, independent of which stat card filter is
   currently active. */
const isBulkActionable = (inv: any): boolean => isRevocableInvite(inv) || isBulkResendable(inv);

interface AIInterviewTrackInvitesModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Published AI interview config whose invitations are being tracked. */
  configId: string;
  jdTitle: string;
  /** This job's short id (e.g. "JD-014"), shown before the job title in the
   *  header and offered as the JD ID filter. */
  jdShortId?: string;
  /** The tracked interview's job version and interview version, shown as a
   *  column each (every row here shares both). Leave either out and the
   *  tracker looks the config up itself. */
  jobVersion?: number;
  interviewVersion?: number;
  /** Tracking ONE version (a version's own details page): every row shares
   *  its job and interview version, so their columns and filters are left out. */
  hideVersionDetails?: boolean;
  /** Opened from a job's own page: the job version is fixed, so its filter is
   *  dropped and the version shows after the job name in the title instead. */
  hideJobVersionFilter?: boolean;
  /** Opens a completed candidate's result. When the host can render the result
   *  inline (Job Details does), pass this; the table only offers View Details
   *  on completed rows when it is present. */
  onViewResult?: (inv: any, rows: any[]) => void;
  /** Renders as a plain in-page panel instead of a fixed, backdropped dialog —
   *  the AI Interview Details page's Track tab, which is this same tracker
   *  living at a destination rather than a popup over one. Drops the backdrop,
   *  the dialog's width/height caps, and the header/footer Close controls
   *  (there is nothing to close back to); everything else — stats, filters,
   *  bulk resend, the table, pagination — is unchanged. */
  embedded?: boolean;
  /** The interview's job is disabled — invites stay viewable, but Invite More,
   *  Resend, Edit and Revoke are blocked. Omit it and the tracker looks the
   *  config's job status up itself. */
  jdDisabled?: boolean;
  /** The interview CONFIG itself is archived (its own status, independent of
   *  its job's) — same lock as `jdDisabled`. Omit it and the tracker looks the
   *  config's own status up itself. */
  configArchived?: boolean;
  /** Footer "Invite More" — the host closes this tracker and opens its own
   *  invite flow. Left out, the button is not shown. */
  onInviteMore?: () => void;
  /** Shown (greyed, as the tooltip) when Invite More is not allowed — the
   *  button stays visible (RBAC grey-out rule). */
  inviteMoreDeniedReason?: string;
  /** Called after a resend / revoke / edit changed invitations, once this
   *  tracker's own rows are reloaded — so the host's counts and lists (the
   *  Invitation Status tab, interview cards, activity) refresh at once rather
   *  than on their next poll. */
  onChanged?: () => void | Promise<void>;
  /** Bump to make the tracker reload its list at once — for a host whose own
   *  dialog (e.g. Share) adds invitations while this tracker stays mounted
   *  underneath, so they appear without waiting for the 15s poll. */
  refreshSignal?: number;
  /** Opens pre-filtered to one candidate (their email) — the bulk-send
   *  popup's per-row "Track status". */
  initialSearch?: string;
  /** Rows a page. Default 5 in the popup, 10 embedded. */
  pageSize?: number;
  /** Paging under the table (the house ListPagination) instead of in the
   *  footer; the footer keeps just Cancel / Invite More. Default: on in the
   *  popup, off embedded. */
  paginationBelowTable?: boolean;
  /** First-time-user aids, added on top of everything the tracker has: a
   *  card-filter hint, a status legend, each row's main action as a visible
   *  button, "Updated … ago" by Refresh, a clearer Select All, helpful empty
   *  states, a red Revoked card and swipeable cards on phones. Default: on in
   *  the popup, off embedded. */
  guided?: boolean;
  /** Track on a whole JOB: every interview of it (the AI Interviews page's job
   *  row), each with its job and interview version. The rows of all of them
   *  are merged newest first, each saying its own versions, and the cards add
   *  up across them. `configId` is then any one of them. */
  scope?: { configId: string; jobVersion: number; interviewVersion: number }[];
}

const PAGE_SIZE = 10;
/* The popup (not the embedded Track tab): five rows a page, paged under the table. */
const POPUP_PAGE_SIZE = 5;

/* Pagination under the table: the table shows its whole page (no scrollbar of
   its own); on a screen too short for it the popup scrolls as one instead. */
const NO_INNER_SCROLL_PANEL = '!overflow-y-auto [scrollbar-gutter:stable] [&>.tf-tracker-header]:sticky [&>.tf-tracker-header]:top-0 [&>.tf-tracker-header]:z-20 [&>.tf-tracker-footer]:sticky [&>.tf-tracker-footer]:bottom-0 [&>.tf-tracker-footer]:z-20 xl:!max-w-[80rem] 2xl:!max-w-[88rem] h-[min(54rem,calc(100dvh-1.5rem))] sm:h-[min(54rem,calc(100dvh-2rem))] md:h-[min(54rem,calc(100dvh-3rem))]';

/* guided: the count cards as one swipeable row on phones. */
const GUIDED_STATS_PHONE = 'max-sm:flex max-sm:overflow-x-auto max-sm:pb-1 max-sm:[&>*]:min-w-[6.5rem] max-sm:[&>*]:shrink-0';
/* guided: the active card's name in the "Showing only" chip. */
const STATUS_CARD_LABEL: Record<string, string> = {
  invited: 'Invited', in_progress: 'In Progress', completed: 'Completed', expired: 'Expired', terminated: 'Terminated', revoked: 'Revoked',
};
/* guided: every card in the Status dropdown, Revoked included. */
const AI_CARD_STATUS_OPTIONS = [...AI_INTERVIEW_INVITE_STATUS_OPTIONS, { value: 'revoked', label: 'Revoked' }, { value: 'failed', label: 'Invite Failed' }];
const INTERVIEW_LEGEND: InviteStatusKind[] = ['invited', 'in_progress', 'completed', 'terminated', 'cancelled', 'expired', 'revoked', 'invite_failed'];

/**
 * Invite tracking for a job's AI interview, opened from the Job Details page.
 *
 * Mirrors the AI Interviews page's own tracker element for element: Refresh,
 * the results note with the completion badge, the stat cards, filters, bulk
 * Revoke (Invited card) / Resend (Expired card), per-row Resend / Edit /
 * Revoke, the refresh veil and Invite More. The list is the same
 * <AIInterviewInviteTable>, so the per-status action rules are the table's.
 */
export default function AIInterviewTrackInvitesModal({
  isOpen,
  onClose,
  configId,
  jdTitle,
  jdShortId,
  jobVersion: jobVersionProp,
  interviewVersion: interviewVersionProp,
  hideVersionDetails = false,
  hideJobVersionFilter = false,
  onViewResult,
  embedded = false,
  jdDisabled: jdDisabledProp,
  configArchived: configArchivedProp,
  onInviteMore,
  inviteMoreDeniedReason,
  onChanged,
  refreshSignal,
  initialSearch,
  pageSize: initialPageSize = embedded ? PAGE_SIZE : POPUP_PAGE_SIZE,
  paginationBelowTable = !embedded,
  guided = !embedded,
  scope,
}: AIInterviewTrackInvitesModalProps) {
  // Export uses the module's export permission (`ai_interview:export`), greyed when missing.
  const { isTenantAdmin, hasPermissionCode } = useAuth();
  const canExport = isTenantAdmin || hasPermissionCode('ai_interview:export');
  const [showExportModal, setShowExportModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<InviteExportFormat>('xlsx');

  /* Keyed on its contents: the host builds the array on every render. */
  const scopeKey = (scope ?? []).map((entry) => `${entry.configId}:${entry.jobVersion}:${entry.interviewVersion}`).join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const jobScope = useMemo(() => (scope && scope.length > 0 ? scope : null), [scopeKey]);
  const [isLoading, setIsLoading] = useState(true);

  const [lookedUpJdDisabled, setLookedUpJdDisabled] = useState(false);
  const [lookedUpConfigArchived, setLookedUpConfigArchived] = useState(false);
  /* The job's own status: a Disabled / Archived job gets its badge beside the
     job name in the header (the lists' badge). Read from the config, so the
     config is read on every open now, not only when the lock props are left out. */
  const [jdStatus, setJdStatus] = useState<{ configId: string; status: string | null } | null>(null);
  const [lineage, setLineage] = useState<{ configId: string; versions: JDLineageVersion[] } | null>(null);
  useEffect(() => {
    if (!isOpen || !configId) return;
    let cancelled = false;
    aiInterviewService
      .get(configId)
      .then((cfg) => {
        if (cancelled) return;
        setJdStatus({ configId, status: cfg?.jd_status ?? null });
        /* Job-wide: every job version's own status (the job's lineage). */
        if (jobScope && cfg?.jd_id) {
          jdService.getLineageVersions(cfg.jd_id)
            .then((versions) => { if (!cancelled) setLineage({ configId, versions: versions || [] }); })
            .catch(() => { /* unknown — no banner, host's lock only */ });
        }
        if (jdDisabledProp === undefined) setLookedUpJdDisabled(isJdDisabled(cfg?.jd_status));
        if (configArchivedProp === undefined) setLookedUpConfigArchived(isInterviewConfigArchived(cfg?.status));
      })
      .catch(() => { /* Unknown — the server still refuses actions on a disabled/archived config. */ });
    return () => { cancelled = true; };
  }, [isOpen, jdDisabledProp, configArchivedProp, configId, jobScope]);
  const jobBadge = jdStatus?.configId === configId ? jobStatusBadgeKind(jdStatus.status) : null;
  /* Disabled / Archived: badge + banner, and the row actions and Invite More
     turned off here too — whatever the host passed — so the banner is true.
     Not on a job-wide tracker, where one version's status does not describe
     the rest; there the host's lock stands alone. */
  const jobLock = !jobScope && (jobBadge === 'disabled' || jobBadge === 'archived') ? jobBadge : null;
  const jdDisabled = (jdDisabledProp ?? lookedUpJdDisabled) || !!jobLock;
  const jobLockMessage = jobLock === 'archived' ? JD_ARCHIVED_ACTION_MESSAGE : JD_DISABLED_ACTION_MESSAGE;
  /* Job-wide tracker: a Disabled / Archived job version is named in a banner,
     and its rows carry that status so the table locks just those rows. */
  const scopeJobVersions = new Set((jobScope ?? []).map((entry) => entry.jobVersion));
  const scopeVersions = jobScope && lineage?.configId === configId
    ? lineage.versions.filter((v) => scopeJobVersions.has(v.version_number))
    : [];
  const versionLocks = splitJobVersions(scopeVersions);
  const lockedStatusByVersion = new Map(versionLocks.locked.map((v) => [v.version, v.status]));
  const rowJdLocked = (inv: { _jd_version?: number }): boolean => inv._jd_version != null && lockedStatusByVersion.has(inv._jd_version);
  const configArchived = configArchivedProp ?? lookedUpConfigArchived;

  /* Job / interview version for the two version columns. Taken from the host
     when it knows them; otherwise derived here from the config list — the
     interview version is this config's place among its job version's
     configs, which only the full list can say. */
  const [lookedUpVersions, setLookedUpVersions] = useState<{ job: number; interview: number } | null>(null);
  const needsVersionLookup = !jobScope && (!hideVersionDetails || hideJobVersionFilter) && (jobVersionProp == null || interviewVersionProp == null);
  useEffect(() => {
    if (!isOpen || !needsVersionLookup) return;
    let cancelled = false;
    aiInterviewService
      .listConfigs({ page: 1, page_size: 500, compact: true })
      .then((res) => {
        if (cancelled) return;
        const all = res.items ?? [];
        const self = all.find((c) => c.id === configId);
        if (!self) return;
        setLookedUpVersions({ job: self.jd_version ?? 1, interview: interviewVersionOrdinal(self, all) });
      })
      .catch(() => { /* The columns simply stay hidden. */ });
    return () => { cancelled = true; };
  }, [isOpen, needsVersionLookup, configId]);
  // A whole job: each row says its own versions instead.
  const jobVersion = hideVersionDetails || jobScope ? undefined : (jobVersionProp ?? lookedUpVersions?.job);
  const interviewVersion = hideVersionDetails || jobScope ? undefined : (interviewVersionProp ?? lookedUpVersions?.interview);
  // The header names the version when the table has no version columns to.
  const headerJobVersion = jobVersionProp ?? lookedUpVersions?.job;
  const headerInterviewVersion = interviewVersionProp ?? lookedUpVersions?.interview;
  const [invitations, setInvitations] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  // Rows a page: the host's size to start, then the pager's 5 / 10 / 20 / 40 / 100.
  const [pageSize, setPageSize] = useState(initialPageSize);
  // "Go to page" input for the footer — buffered locally so a partial edit
  // doesn't get clobbered by `page` until Enter/blur commits it.
  const [goToPage, setGoToPage] = useState('1');
  useEffect(() => {
    setGoToPage(String(page));
  }, [page]);
  const commitGoToPage = () => {
    const target = Math.round(Number(goToPage));
    if (Number.isFinite(target) && target >= 1 && target <= totalPages) {
      setPage(target);
    } else {
      setGoToPage(String(page));
    }
  };
  /* Same filter contract the AI Interviews page's tracker uses. The endpoint
     already accepted search/status/date — this tracker just never passed them,
     so it always showed the unfiltered first page. */
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [filters, setFilters] = useState<InviteFilterState>(() => (
    initialSearch ? { ...EMPTY_INVITE_FILTERS, search: initialSearch } : EMPTY_INVITE_FILTERS
  ));
  /* Job Version and Interview Version filters. Everything in a tracker
     belongs to one interview, so each offers that interview's single value
     and every row matches it — they mirror the table's columns rather than
     narrow it. Source does narrow: see loadInvitations. */
  const [jobVersionFilter, setJobVersionFilter] = useState('');
  const [versionFilter, setVersionFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [resultFilter, setResultFilter] = useState('');
  const fetchAllForClientFilters = !!(sourceFilter || resultFilter);
  const [totalPages, setTotalPages] = useState(1);
  const [filteredTotal, setFilteredTotal] = useState(0);
  /* Card counts are deliberately NOT taken from the filtered response: selecting
     a bucket would then zero every other card. This holds the unfiltered
     overview, refreshed alongside the list. */
  const [overview, setOverview] = useState({
    total: 0,
    invited: 0,
    completed: 0,
    inProgress: 0,
    terminated: 0,
    cancelled: 0,
    revoked: 0,
    expired: 0,
    failed: 0,
  });
  // Resend flow — confirm first (the old link stops working), then send.
  const [resendTarget, setResendTarget] = useState<any | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  // Revoke (single + bulk) and Edit — the same flows the AI Interviews page's
  // tracker runs, against the same endpoints.
  const [revokeTarget, setRevokeTarget] = useState<any | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [showBulkRevokeConfirm, setShowBulkRevokeConfirm] = useState(false);
  const [isBulkRevoking, setIsBulkRevoking] = useState(false);
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ candidate_name: '', candidate_email: '' });
  const [savingEdit, setSavingEdit] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const heightLock = useDialogHeightLock<HTMLDivElement>();

  /* Bulk selection — same control and semantics as the Assessments tracker's
     Select All bar: any row a bulk Revoke OR a bulk Resend can act on gets a
     checkbox, regardless of which stat card filter is currently active —
     Invited and Expired rows can be ticked together. Which bulk BUTTON
     appears depends on the ticked selection being uniformly one status-class
     or the other (see allRevocable/allResendable below); a mixed
     Invited+Expired selection shows neither — an action valid for one status
     must never be applied to the other. Scoped to the rows on the CURRENT page. */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkResendConfirm, setShowBulkResendConfirm] = useState(false);
  const [isBulkResending, setIsBulkResending] = useState(false);
  const tableInvitations = lockedStatusByVersion.size === 0
    ? invitations
    : invitations.map((inv: { _jd_version?: number }) => (rowJdLocked(inv) ? { ...inv, _jd_status: lockedStatusByVersion.get(inv._jd_version as number) } : inv));
  /* The Track popups' look (components/ui/tracker-look) — the guided popup;
     the embedded Track tab keeps its cards. */
  const look = guided && !embedded;
  /* look: "Select all pages" — this tracker loads one page at a time, so the
     matching rows of every page are read once, on that pick, with the same
     filters as the list (`allPagesKey`). Kept until the filters change. */
  const allPagesKey = JSON.stringify([filters, sourceFilter, resultFilter, jobVersionFilter, versionFilter, scopeKey]);
  const [allPages, setAllPages] = useState<{ key: string; rows: typeof invitations } | null>(null);
  const [allPagesLoading, setAllPagesLoading] = useState(false);
  const allPagesRows = allPages?.key === allPagesKey ? allPages.rows : null;
  /* The rows a selection can hold: this page, plus every page once read. */
  const selectionRows = look && allPagesRows
    ? [...invitations, ...allPagesRows.filter((row) => !invitations.some((inv) => inv.id === row.id))]
    : invitations;
  const selectableIds = (jdDisabled || configArchived) ? [] : invitations.filter((inv: any) => isBulkActionable(inv) && !rowJdLocked(inv)).map((inv: any) => inv.id);
  const selectedRows = selectionRows.filter((inv) => selectedIds.has(inv.id));
  /* look: each bulk button acts on its own kind of the selection. */
  const revocableSelected = selectedRows.filter(isRevocableInvite);
  const resendableSelected = selectedRows.filter(isBulkResendable);
  const allPagesIds = (jdDisabled || configArchived) || !allPagesRows ? [] : allPagesRows.filter((inv) => isBulkActionable(inv) && !rowJdLocked(inv)).map((inv) => inv.id as string);
  const allPagesChecked = allPagesIds.length > 0 && allPagesIds.every((id) => selectedIds.has(id));
  const allRevocable = selectedRows.length > 0 && selectedRows.every(isRevocableInvite);
  const allResendable = selectedRows.length > 0 && selectedRows.every(isBulkResendable);
  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id: string) => selectedIds.has(id));
  const toggleSelectAll = () =>
    setSelectedIds(() => (allSelected ? new Set<string>() : new Set<string>(selectableIds)));
  /* look: Select All picks one kind at a time — Invited (to revoke) or
     Expired (to resend) on this page — so a selection always has an action.
     The pill's checkbox and the header checkbox share the rule. */
  const selectGroups: TrackerSelectGroup[] = [
    { key: 'invited', label: 'Invited', action: 'revoke', ids: invitations.filter((inv) => selectableIds.includes(inv.id) && isRevocableInvite(inv)).map((inv) => inv.id) },
    { key: 'expired', label: 'Expired', action: 'resend', ids: invitations.filter((inv) => selectableIds.includes(inv.id) && isBulkResendable(inv)).map((inv) => inv.id) },
  ];
  const pageSelection = trackerSelection(selectGroups, selectedIds, setSelectedIds);
  const toggleSelectOne = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  /* Reloads (paging, filtering, the 15s refresh moving a candidate forward)
     can leave selected ids pointing at rows that are gone or no longer
     eligible — drop those so the bulk button's count always matches what an
     action would actually do. */
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const valid = new Set(selectionRows.filter(isBulkActionable).map((inv: any) => inv.id));
      const next = new Set([...prev].filter((id) => valid.has(id)));
      return next.size === prev.size ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invitations, allPagesRows, jdDisabled, configArchived]);

  // Bulk resend — same endpoint as the single-row Resend, called per
  // invitation. Sequential on purpose: a burst of parallel resends is exactly
  // the kind of thing mail rate-limiters punish.
  const handleBulkResend = async () => {
    const targets = selectionRows.filter(
      (inv: any) => selectedIds.has(inv.id) && isBulkResendable(inv)
    );
    if (targets.length === 0) {
      setShowBulkResendConfirm(false);
      return;
    }
    setIsBulkResending(true);
    let sent = 0;
    let failedCount = 0;
    let firstError: unknown = null;
    const failedIds = new Set<string>();
    for (const inv of targets) {
      try {
        await aiInterviewService.sendSessionEmail(inv.id, { base_url: window.location.origin });
        sent++;
      } catch (error) {
        console.error(`Failed to resend AI interview invitation ${inv.id}:`, error);
        if (failedCount === 0) firstError = error;
        failedCount++;
        failedIds.add(inv.id);
      }
    }
    if (sent > 0) {
      toast.success(`New invitation link${sent === 1 ? '' : 's'} sent to ${sent} candidate${sent === 1 ? '' : 's'}.`);
    }
    if (failedCount > 0) {
      showErrorToast(firstError, `Couldn't resend ${failedCount} invitation${failedCount === 1 ? '' : 's'}`);
    }
    // Keep only the ones that failed ticked, so a retry acts on them; once
    // anything changed, the cached "Select all pages" rows are stale — drop them.
    setSelectedIds(failedIds);
    if (sent > 0) setAllPages(null);
    setShowBulkResendConfirm(false);
    setIsBulkResending(false);
    await loadInvitations(true);
    await onChanged?.();
  };

  /* A job's matching rows across `targets` (its interviews), stamped with each
     row's job / interview version. `paging` = one server page (newest invited
     first) with the filtered total; null = every matching row (1000 an
     interview, the cap the per-interview reads had) for client-side Source /
     Result filtering and "Select all pages". One request (`also`); an older
     backend that ignores `also` (no `scoped_config_ids` echoed) falls back to
     one request per interview, merged and paged here as before. */
  const loadJobScopeRows = useCallback(async (
    targets: NonNullable<typeof jobScope>,
    paging: { page: number; pageSize: number } | null,
  ): Promise<{ rows: any[]; total: number; serverPaged: boolean }> => {
    if (targets.length === 0) return { rows: [], total: 0, serverPaged: paging !== null };
    const byConfig = new Map(targets.map((entry) => [entry.configId, entry]));
    const stamp = (inv: any, entry = byConfig.get(String(inv.config_id))) => ({
      ...inv,
      _config_id: entry?.configId ?? inv.config_id,
      _jd_version: entry?.jobVersion,
      _interview_version: entry?.interviewVersion,
    });
    const filterParams = {
      search: filters.search.trim() || undefined,
      status: filters.status !== 'all' ? filters.status : undefined,
      invite_date_from: filters.dateFrom || undefined,
      invite_date_to: filters.dateTo || undefined,
    };
    const tolerateFailed = (err: unknown) => {
      if (filters.status === 'failed') return { items: [], total: 0 } as unknown as Awaited<ReturnType<typeof aiInterviewService.getConfigInvitations>>;
      throw err;
    };
    const [first, ...rest] = targets;
    const res = await aiInterviewService.getConfigInvitations(first.configId, {
      ...filterParams,
      also: rest.map((entry) => entry.configId).join(','),
      order: 'invited',
      page: paging ? paging.page : 1,
      page_size: paging ? paging.pageSize : 1000 * targets.length,
    }).catch(tolerateFailed);
    if (rest.length === 0 || res.scoped_config_ids) {
      return { rows: (res.items || []).map((inv: any) => stamp(inv)), total: res.total || 0, serverPaged: paging !== null };
    }
    // Older backend: one request per interview, merged newest invited first.
    const lists = await Promise.all(targets.map((entry) =>
      aiInterviewService.getConfigInvitations(entry.configId, { ...filterParams, page: 1, page_size: 1000 })
        .catch(tolerateFailed)
        .then((r) => (r.items || []).map((inv: any) => stamp(inv, entry)))));
    const sentAt = (inv: any) => new Date(inv.invitation_sent_at || inv.created_at || 0).getTime();
    const merged = lists.flat().sort((a: any, b: any) => sentAt(b) - sentAt(a));
    if (!paging) return { rows: merged, total: merged.length, serverPaged: false };
    const start = (paging.page - 1) * paging.pageSize;
    return { rows: merged.slice(start, start + paging.pageSize), total: merged.length, serverPaged: true };
  }, [filters]);

  /* Bumped by every loadInvitations run (filter/page change, poll, Refresh),
     so an older response landing late can't overwrite a newer one's rows and
     cards. */
  const loadSeqRef = useRef(0);
  const loadInvitations = useCallback(async (silent = false): Promise<void> => {
    const seq = ++loadSeqRef.current;
    const isStale = () => seq !== loadSeqRef.current;
    if (!silent) setIsLoading(true);
    try {
      /* A whole job: every interview's matching rows (narrowed to the chosen
         job / interview version) in ONE request — the first interview's
         invitations endpoint with the rest as `also`, newest invited first —
         stamped with their versions. Paged on the server unless Source /
         Result is set (no server-side filter for those), as the single
         interview path does. It used to send one request PER interview
         (page_size 1000 each) and merge and page them here. The cards add up
         every interview in ONE request (GET /ai-interview/invitation-overview). */
      if (jobScope) {
        const targets = jobScope.filter((entry) =>
          (!jobVersionFilter || String(entry.jobVersion) === jobVersionFilter)
          && (!versionFilter || String(entry.interviewVersion) === versionFilter));
        const [batch, counts] = await Promise.all([
          loadJobScopeRows(targets, fetchAllForClientFilters ? null : { page, pageSize }),
          aiInterviewService.getInvitationOverview(jobScope.map((entry) => entry.configId)),
        ]);
        if (isStale()) return;
        if (batch.serverPaged) {
          setInvitations(batch.rows);
          setFilteredTotal(batch.total);
          setTotalPages(Math.max(1, Math.ceil(batch.total / pageSize)));
          if (batch.rows.length === 0 && batch.total > 0 && page > 1) {
            setPage((current) => Math.min(current - 1, Math.max(1, Math.ceil(batch.total / pageSize))));
          }
        } else {
          const matching = batch.rows.filter((inv: any) =>
            (!sourceFilter || inv.invite_source === sourceFilter) && matchesInviteResultFilter(inv, displayInviteScore(inv), resultFilter));
          const pages = Math.max(1, Math.ceil(matching.length / pageSize));
          const safePage = Math.min(page, pages);
          setInvitations(matching.slice((safePage - 1) * pageSize, safePage * pageSize));
          setFilteredTotal(matching.length);
          setTotalPages(pages);
          if (safePage !== page) setPage(safePage);
        }
        const rows = jobScope.map((entry) => counts[entry.configId]).filter(Boolean);
        const sum = (pick: (o: (typeof rows)[number]) => number | undefined) => rows.reduce((acc, o) => acc + (pick(o) || 0), 0);
        setOverview({
          total: sum((o) => o.total),
          invited: sum((o) => o.invited),
          completed: sum((o) => o.completed),
          inProgress: sum((o) => o.in_progress),
          terminated: sum((o) => o.terminated),
          cancelled: sum((o) => o.cancelled),
          revoked: sum((o) => o.revoked),
          expired: sum((o) => o.expired),
          // The overview endpoint has no failed-invite count.
          failed: 0,
        });
        setLoadedAt(Date.now());
        return;
      }
      /* Four page_size-1-or-N calls in parallel: the filtered page itself, the
         unfiltered overview, and the invited and revoked buckets. The list
         endpoint reports completed/in_progress/terminated/cancelled but not
         `invited` or `revoked`, and deriving either as "total minus the rest"
         would leave that card disagreeing with the rows it filters to — the
         remainder also holds expired and system_check sessions. */
      /* Invite Failed: the backend has no failed status for AI invites yet.
         Asked for anyway — once it reports one, the tab fills — and a refusal
         reads as none (an empty list, a 0 tab), never as a load error. */
      const noFailed = { items: [], total: 0, total_pages: 1 } as unknown as Awaited<ReturnType<typeof aiInterviewService.getConfigInvitations>>;
      const [result, summary, invitedOnly, revokedOnly, expiredOnly, failedOnly] = await Promise.all([
        aiInterviewService.getConfigInvitations(configId, {
          search: filters.search.trim() || undefined,
          status: filters.status !== 'all' ? filters.status : undefined,
          invite_date_from: filters.dateFrom || undefined,
          invite_date_to: filters.dateTo || undefined,
          /* Source (email / resume) and Result (the Score column's Pass /
             Fail) have no server-side filter, so with either set the whole
             matching list is fetched and paged here instead. */
          page: fetchAllForClientFilters ? 1 : page,
          page_size: fetchAllForClientFilters ? 1000 : pageSize,
        }).catch((err) => { if (filters.status === 'failed') return noFailed; throw err; }),
        aiInterviewService.getConfigInvitations(configId, { page: 1, page_size: 1 }),
        aiInterviewService.getConfigInvitations(configId, { page: 1, page_size: 1, status: 'invited' }),
        aiInterviewService.getConfigInvitations(configId, { page: 1, page_size: 1, status: 'revoked' }),
        aiInterviewService.getConfigInvitations(configId, { page: 1, page_size: 1, status: 'expired' }),
        aiInterviewService.getConfigInvitations(configId, { page: 1, page_size: 1, status: 'failed' }).catch(() => noFailed),
      ]);
      if (isStale()) return;

      if (fetchAllForClientFilters) {
        const matching = (result.items || []).filter((inv: any) =>
          (!sourceFilter || inv.invite_source === sourceFilter) && matchesInviteResultFilter(inv, displayInviteScore(inv), resultFilter));
        const pages = Math.max(1, Math.ceil(matching.length / pageSize));
        const safePage = Math.min(page, pages);
        setInvitations(matching.slice((safePage - 1) * pageSize, safePage * pageSize));
        setFilteredTotal(matching.length);
        setTotalPages(pages);
        if (safePage !== page) setPage(safePage);
      } else {
        setInvitations(result.items || []);
        setFilteredTotal(result.total || 0);
        setTotalPages(Math.max(1, result.total_pages || 1));
      }
      setOverview({
        total: summary.total || 0,
        invited: invitedOnly.total || 0,
        completed: summary.completed || 0,
        inProgress: summary.in_progress || 0,
        terminated: summary.terminated || 0,
        cancelled: summary.cancelled || 0,
        revoked: revokedOnly.total || 0,
        expired: expiredOnly.total || 0,
        failed: failedOnly.total || 0,
      });
      setLoadedAt(Date.now());

      /* Filtering can empty the page you were on — drop back rather than showing
         "no candidates" over a list that still has results. */
      if (!fetchAllForClientFilters && (result.items || []).length === 0 && (result.total || 0) > 0 && page > 1) {
        setPage(current => Math.min(current - 1, Math.max(1, result.total_pages || 1)));
      }
    } catch (error) {
      if (isStale()) return;
      console.error('Failed to load AI interview invitations:', error);
      if (!silent) showErrorToast(error, "Couldn't load invitations", { id: 'ai-interview-track-invites-load', retry: () => { void loadInvitations(); } });
    } finally {
      // A stale run leaves the spinner to the run that replaced it.
      if (!isStale()) setIsLoading(false);
    }
  }, [configId, page, pageSize, filters, sourceFilter, resultFilter, fetchAllForClientFilters, jobScope, jobVersionFilter, versionFilter, loadJobScopeRows]);

  /* look: every page's matching rows for "Select all pages" — the same
     requests and filters as loadInvitations, unpaged (1000 a config, as its
     own Source / Result path reads). */
  /* Every page's rows matching the current tab, search and filters, unpaged.
     Shared by "Select all pages" and Export. */
  const fetchAllMatchingRows = async (): Promise<typeof invitations> => {
    const params = {
      search: filters.search.trim() || undefined,
      status: filters.status !== 'all' ? filters.status : undefined,
      invite_date_from: filters.dateFrom || undefined,
      invite_date_to: filters.dateTo || undefined,
      page: 1,
      page_size: 1000,
    };
    const lists = jobScope
      ? await Promise.all(jobScope
        .filter((entry) => (!jobVersionFilter || String(entry.jobVersion) === jobVersionFilter) && (!versionFilter || String(entry.interviewVersion) === versionFilter))
        .map((entry) => aiInterviewService.getConfigInvitations(entry.configId, params).catch((err) => { if (filters.status === 'failed') return { items: [] }; throw err; }).then((res) => (res.items || []).map((inv) => ({
          ...inv, _config_id: entry.configId, _jd_version: entry.jobVersion, _interview_version: entry.interviewVersion,
        })))))
      : [((await aiInterviewService.getConfigInvitations(configId, params).catch((err) => { if (filters.status === 'failed') return { items: [] }; throw err; })).items || [])];
    return lists.flat().filter((inv) =>
      (!sourceFilter || inv.invite_source === sourceFilter) && matchesInviteResultFilter(inv, displayInviteScore(inv), resultFilter));
  };

  /* Export: the ticked rows when there are any, otherwise every row matching
     the current tab and filters (all pages). Built in the browser from the
     same data the table shows — no extra backend endpoint. */
  const handleExport = async (columnIds: string[]) => {
    if (!canExport || isExporting) return;
    const format = exportFormat;
    // Keep the table's order whatever order the columns were ticked in.
    const picked = INVITE_EXPORT_COLUMNS.filter((c) => columnIds.includes(c.id));
    if (picked.length === 0) {
      toast.warning('Pick at least one column to export');
      return;
    }
    setIsExporting(true);
    try {
      const rows = selectedIds.size > 0 ? selectedRows : await fetchAllMatchingRows();
      if (rows.length === 0) {
        toast.warning('No invites to export');
        return;
      }
      const ctx: InviteExportContext = { jdShortId, jdTitle: jdTitle || '', jobVersion: headerJobVersion, interviewVersion: headerInterviewVersion };
      const data = rows.map((inv) => picked.map((c) => c.value(inv, ctx)));
      const statusPart = filters.status !== 'all' ? `-${filters.status}` : '';
      const baseName = `${(jdShortId || 'ai-interview').replace(/\s+/g, '_')}-invites${statusPart}-${new Date().toISOString().slice(0, 10)}`;
      await exportRows(format, picked.map((c) => c.label), data, baseName, {
        sheetName: 'Invite Status',
        title: `AI Interview Invites — ${jdShortId ? `${jdShortId} - ` : ''}${jdTitle}`,
      });
      // Audit trail through the module's existing export-log endpoint.
      void aiInterviewService.logListExport({
        format: format === 'csv' ? 'csv' : 'excel',
        recordCount: rows.length,
        tab: filters.status,
        ids: rows.map((inv) => String(inv.id)),
        exportType: 'ai_interview_invites',
      });
      toast.success(`Exported ${rows.length} ${rows.length === 1 ? 'invite' : 'invites'} to ${format === 'csv' ? 'CSV' : 'Excel'}`);
      setShowExportModal(false);
    } catch (err) {
      showErrorToast(err, "Couldn't export invites");
    } finally {
      setIsExporting(false);
    }
  };

  const selectAllPages = async () => {
    setAllPagesLoading(true);
    try {
      const rows = await fetchAllMatchingRows();
      const lockedRow = (inv: (typeof invitations)[number]) => (rowJdLocked(inv) ? { ...inv, _jd_status: lockedStatusByVersion.get(inv._jd_version as number) } : inv);
      setAllPages({ key: allPagesKey, rows: rows.map(lockedRow) });
      setSelectedIds(new Set(rows.filter((inv) => isBulkActionable(inv) && !rowJdLocked(inv)).map((inv) => inv.id)));
    } catch (err) {
      showErrorToast(err, "Couldn't select invitations on every page", { retry: () => { void selectAllPages(); } });
    } finally {
      setAllPagesLoading(false);
    }
  };

  /* Header Refresh — re-reads in place: the rows stay put under a veil and the
     dialog's height is pinned until the new data lands, so nothing jumps. */
  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await heightLock.run(() => loadInvitations(true));
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleBulkRevoke = async () => {
    const targets = selectedRows.filter(isRevocableInvite);
    if (targets.length === 0) { setShowBulkRevokeConfirm(false); return; }
    setIsBulkRevoking(true);
    try {
      const results = await Promise.allSettled(targets.map((inv: any) => aiInterviewService.revokeInvitation(inv.id)));
      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.length - succeeded;
      if (succeeded > 0) toast.success(`Revoked ${succeeded} invitation${succeeded === 1 ? '' : 's'}.`);
      if (failed > 0) showErrorToast(results.find((r): r is PromiseRejectedResult => r.status === 'rejected')?.reason ?? null, `Couldn't revoke ${failed} invitation${failed === 1 ? '' : 's'}`);
      // Keep only the ones that failed ticked, so a retry acts on them; once
      // anything changed, the cached "Select all pages" rows are stale — drop them.
      setSelectedIds(new Set(targets.filter((_: any, i: number) => results[i].status === 'rejected').map((inv: any) => inv.id)));
      if (succeeded > 0) setAllPages(null);
      await loadInvitations(true);
      await onChanged?.();
    } finally {
      setIsBulkRevoking(false);
      setShowBulkRevokeConfirm(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !configId) return;
    loadInvitations();
  }, [isOpen, configId, loadInvitations]);
  // Same silent refresh the assessment tracker uses — candidates move through
  // an interview while the recruiter watches this list.
  useTrackerPoll(isOpen && !!configId, () => loadInvitations(true));

  useEffect(() => {
    if (!isOpen || !configId || !refreshSignal) return;
    loadInvitations(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  if (!isOpen) return null;

  /* No rows yet → the spinner is the body. Rows on screen and a re-read in
     flight → keep them and veil them, as the AI Interviews tracker does. */
  const initialLoading = isLoading && invitations.length === 0;
  const refreshVeil = (isLoading || isRefreshing) && invitations.length > 0;

  const filtersActive = hasActiveInviteFilters(filters);
  const completionRate = overview.total > 0 ? Math.round((overview.completed / overview.total) * 100) : 0;
  /* look: the count cards as status tabs — same keys and counts. */
  const statusTabs: TrackerTab[] = [
    { key: 'all', label: 'All', value: overview.total },
    { key: 'invited', label: 'Invited', value: overview.invited },
    { key: 'in_progress', label: 'In Progress', value: overview.inProgress },
    { key: 'completed', label: 'Completed', value: overview.completed },
    { key: 'expired', label: 'Expired', value: overview.expired },
    { key: 'terminated', label: 'Terminated', value: overview.terminated },
    { key: 'revoked', label: 'Revoked', value: overview.revoked },
    { key: 'failed', label: 'Invite Failed', value: overview.failed },
  ];
  const startIndex = filteredTotal === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIndex = Math.min(page * pageSize, filteredTotal);
  const resultsLabel = filtersActive
    ? `${filteredTotal} matching candidate${filteredTotal === 1 ? '' : 's'}`
    : `Showing ${startIndex} to ${endIndex} of ${filteredTotal} invites`;

  const pageBtn =
    'px-2 sm:px-3 py-1 sm:py-1.5 text-sm border border-gray-200 dark:border-slate-700 ' +
    'bg-white dark:bg-slate-900 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed ' +
    'hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors';

  /* Nobody invited yet (the unfiltered total is 0): like the Results tab, the
     shared empty state stands alone — no zeroed stat cards, filter bar,
     completion badge, empty table or pager. */
  const isUnstarted = !isLoading && overview.total === 0;

  const panel = (
      <div
        {...(embedded ? {} : heightLock.dialogProps)}
        className={embedded
          /* Embedded as the job page's Invitation Status tab: take the page
             sheet's own dark surface (not a slate-900 block on it), and have
             the table's sticky header / pinned columns paint that same surface. */
          ? 'bg-white dark:bg-[var(--surface)] [--tf-sticky-surface:var(--surface)] w-full flex flex-col'
          : `${TRACKER_DIALOG_PANEL_CLASS} ${look ? TRACKER_LOOK_PANEL_CLASS : paginationBelowTable ? NO_INNER_SCROLL_PANEL : ''}`}>
        {/* Header */}
        <div className={`${paginationBelowTable || look ? 'tf-tracker-header ' : ''}px-3 sm:px-6 py-2.5 sm:py-4 border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 flex items-center justify-between flex-shrink-0`}>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-brand-blue flex items-center justify-center shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 flex-shrink-0">
                <Users className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h2 className="tf-section-title truncate tracking-tight">
                  {embedded ? (
                    // Embedded as the details page's Invitation Status tab —
                    // headed with that tab's own name.
                    'Invitation Status'
                  ) : (
                    <>
                      <span className="hidden sm:inline">AI Interview - Invite Status Tracking</span>
                      <span className="sm:hidden">Invite Status</span>
                    </>
                  )}
                </h2>
                {/* JD ID · job title · job version */}
                <p className="flex items-center gap-2 tf-body-muted mt-0.5 min-w-0">
                  {jdShortId && <JobIdBadge className="flex-shrink-0">{jdShortId}</JobIdBadge>}
                  <span className="truncate">{jdTitle}</span>
                  {jobLock && <JobLockBadge kind={jobLock} title={jobLockMessage} />}
                  {jobScope && (
                    <span className="text-gray-400 dark:text-slate-400 whitespace-nowrap">
                      - all job versions ({jobScope.length} interview{jobScope.length === 1 ? '' : 's'})
                    </span>
                  )}
                  {/* "Job title - V1   Interview Version - V1", as the AI
                      Interviews tracker heads a single version. */}
                  {!jobScope && hideJobVersionFilter && headerJobVersion != null && headerJobVersion > 0 && (
                    <span className="-ml-0.5 flex items-center gap-3 flex-shrink-0 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        -
                        <VersionPill kind="job" version={headerJobVersion} />
                      </span>
                      {headerInterviewVersion != null && (
                        <span className="inline-flex items-center gap-1.5">
                          Interview Version -
                          <VersionPill kind="interview" version={headerInterviewVersion} />
                        </span>
                      )}
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            {guided && <span className="max-sm:hidden"><UpdatedAgo at={loadedAt} /></span>}
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing || isLoading}
              title="Fetch the latest invite statuses"
              aria-label="Refresh"
              icon={<RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isRefreshing ? 'animate-spin' : ''}`} />}
            >
              {/* Label hugs its text — no reserved width. */}
              <span className="hidden sm:inline">
                {isRefreshing ? 'Refreshing...' : 'Refresh'}
              </span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => { if (canExport) setShowExportModal(true); }}
              disabled={isLoading && invitations.length === 0}
              aria-disabled={!canExport || undefined}
              title={canExport
                ? (selectedIds.size > 0 ? `Export the ${selectedIds.size} selected invites` : 'Export every invite in this view (all pages)')
                : 'You do not have permission to export AI interviews'}
              aria-label="Export"
              className={canExport ? '' : 'opacity-50 cursor-not-allowed'}
              icon={<Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            >
              <span className="hidden sm:inline">Export</span>
            </Button>
            {/* No ✕: the footer's Cancel is the one close control. */}
          </div>
        </div>

        {jobLock && <JobLockBanner kind={jobLock} />}
        {versionLocks.locked.length > 0 && (
          <div className="mx-2.5 sm:mx-6 mt-2.5 sm:mt-3 flex-shrink-0">
            <JobVersionsLockBanner locked={versionLocks.locked} active={versionLocks.active} />
          </div>
        )}

        {isUnstarted ? (
          <div className="px-2.5 sm:px-6 py-2.5 sm:py-4">
            <TabEmptyState
              icon={Mail}
              illustration={<FolderIconIllustration icon={Mail} badge="send" />}
              title="No Invitations Sent Yet"
              description="Invite candidates to this interview and their status appears here."
            />
          </div>
        ) : (
        <>
        {/* Stat row doubles as the status filter — same buckets and wording as the
            AI Interviews page tracker. */}
        {look ? (
          <TrackerStatusTabs
            tabs={statusTabs}
            active={filters.status}
            onSelect={(status) => { setFilters({ ...filters, status }); setPage(1); }}
          />
        ) : (
        <InviteStatCards
          gridClassName={guided ? `tf-tracker-stats ${GUIDED_STATS_PHONE}` : 'tf-tracker-stats'}
          activeStatus={filters.status}
          onSelect={(status) => {
            setFilters({ ...filters, status });
            setPage(1);
          }}
          cards={[
            { key: 'all', label: 'Total', Icon: Users, value: overview.total, ...INVITE_CARD_TONES.slate },
            { key: 'invited', label: 'Invited', Icon: Mail, value: overview.invited, ...INVITE_CARD_TONES.blue },
            { key: 'in_progress', label: 'In Progress', Icon: Play, value: overview.inProgress, ...INVITE_CARD_TONES.orange },
            { key: 'completed', label: 'Completed', Icon: CheckCircle, value: overview.completed, ...INVITE_CARD_TONES.green },
            { key: 'expired', label: 'Expired', Icon: Clock, value: overview.expired, ...INVITE_CARD_TONES.orange },
            { key: 'terminated', label: 'Terminated', Icon: Ban, value: overview.terminated, ...INVITE_CARD_TONES.red },
            guided
              ? { key: 'revoked', label: 'Revoked', Icon: Undo2, value: overview.revoked, ...INVITE_CARD_TONES.red }
              : { key: 'revoked', label: 'Revoked', Icon: Ban, value: overview.revoked, ...INVITE_CARD_TONES.indigo },
          ]}
        />
        )}

        {/* look: everything from here to the footer is the one part that
            scrolls; the header, tabs and footer stay put. */}
        <div className={look ? TRACKER_LOOK_BODY_CLASS : 'contents'}>
        {look && (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-2.5 sm:px-6 pt-3 flex-shrink-0">
            <TrackerTabHint tabs={statusTabs} active={filters.status} />
            <StatusLegend kinds={INTERVIEW_LEGEND} />
          </div>
        )}
        {guided && !look && (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-2.5 sm:px-6 pt-2 flex-shrink-0">
            <StatCardsHint
              activeLabel={filters.status !== 'all' ? (STATUS_CARD_LABEL[filters.status] ?? filters.status) : null}
              onClear={() => { setFilters({ ...filters, status: 'all' }); setPage(1); }}
            />
            <StatusLegend kinds={INTERVIEW_LEGEND} />
          </div>
        )}

        <InviteFilterBar
          moreFilters={guided}
          compact={look}
          beforeSearch={look && !initialLoading && invitations.length > 0 && !(jdDisabled || configArchived) ? (
            <>
              <TrackerSelectAll
                selected={selectedIds} groups={selectGroups} onChange={setSelectedIds}
                allPages={{
                  count: allPagesRows ? allPagesIds.length : undefined,
                  checked: allPagesChecked,
                  loading: allPagesLoading,
                  onSelect: () => { if (allPagesRows) setSelectedIds(new Set(allPagesIds)); else void selectAllPages(); },
                }}
              />
              <TrackerBulkBar
                inline
                count={selectedIds.size}
                revokeCount={revocableSelected.length}
                resendCount={resendableSelected.length}
                onRevoke={() => setShowBulkRevokeConfirm(true)}
                onResend={() => setShowBulkResendConfirm(true)}
                revoking={isBulkRevoking}
                resending={isBulkResending}
                onClear={() => setSelectedIds(new Set())}
                revokeTitle="Revoke the selected candidates' interview links"
              />
            </>
          ) : undefined}
          filters={filters}
          onChange={(nextFilters) => {
            setFilters(nextFilters);
            // A narrowed list has its own page 1; staying on page 4 would look empty.
            setPage(1);
          }}
          statusOptions={guided ? AI_CARD_STATUS_OPTIONS : AI_INTERVIEW_INVITE_STATUS_OPTIONS}
          searchPlaceholder="Search by candidate name or email..."
          extraSelects={[
            ...(hideVersionDetails ? [] : [...(hideJobVersionFilter ? [] : [{
              key: 'job-version', ariaLabel: 'Job Version', anyLabel: 'All Job Versions', value: jobVersionFilter,
              options: jobScope
                ? [...new Set(jobScope.map((entry) => entry.jobVersion))].sort((a, b) => a - b).map((v) => ({ value: String(v), label: `Job V${v}` }))
                : jobVersion != null ? [{ value: String(jobVersion), label: `Job V${jobVersion}` }] : [],
              onChange: (value: string) => { setJobVersionFilter(value); setPage(1); },
            }]),
            {
              key: 'interview-version', ariaLabel: 'Interview Version', anyLabel: 'All Interview Versions', value: versionFilter,
              options: jobScope
                ? [...new Set(jobScope.map((entry) => entry.interviewVersion))].sort((a, b) => a - b).map((v) => ({ value: String(v), label: `Interview V${v}` }))
                : interviewVersion != null ? [{ value: String(interviewVersion), label: `Interview V${interviewVersion}` }] : [],
              onChange: (value: string) => { setVersionFilter(value); setPage(1); },
            }]),
            {
              key: 'source', ariaLabel: 'Source', anyLabel: 'All Sources', value: sourceFilter,
              options: INVITE_SOURCE_FILTER_OPTIONS,
              onChange: (value) => { setSourceFilter(value); setPage(1); },
            },
            {
              key: 'result', ariaLabel: 'Result', anyLabel: 'All Results', value: resultFilter,
              options: RESULT_FILTER_OPTIONS,
              onChange: (value) => { setResultFilter(value); setPage(1); },
            },
          ]}
          onClearExtras={() => { setJobVersionFilter(''); setVersionFilter(''); setSourceFilter(''); setResultFilter(''); }}
        />

        {/* Select All — same control, wording and placement as the Assessments
            tracker's bulk-select bar. Any Invited or Expired row counts,
            regardless of the active stat card. The completion-rate badge
            (previously its own card in the stat row above) sits on this same
            row, straight across from Select All. */}

        {!look && !initialLoading && (
          <div className="flex items-center justify-between gap-2 px-2.5 sm:px-6 pt-2.5 sm:pt-3 flex-shrink-0">
            {selectableIds.length > 0 ? (
              <button
                type="button"
                onClick={toggleSelectAll}
                className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400 hover:text-brand-blue transition-colors"
              >
                <span
                  role="checkbox"
                  aria-checked={allSelected}
                  className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors ${
                    allSelected
                      ? 'bg-brand-blue border-brand-blue'
                      : 'bg-white dark:bg-slate-900 border-gray-300 dark:border-slate-600'
                  }`}
                >
                  {allSelected && <Check className="w-3 h-3 text-white" />}
                </span>
                {guided
                  ? `Select all ${selectableIds.length} you can resend or revoke (Invited / Expired)`
                  : `Select All (${selectableIds.length})`}
              </button>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2">
              {/* Uniform selection's bulk action — never both at once. */}
              {allRevocable && (
                <Button
                  variant="destructive"
                  size="sm"
                  type="button"
                  onClick={() => setShowBulkRevokeConfirm(true)}
                  disabled={isBulkRevoking}
                  title="Revoke the selected candidates' interview links"
                  icon={isBulkRevoking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                >
                  {isBulkRevoking ? 'Revoking…' : `Revoke (${selectedRows.length})`}
                </Button>
              )}
              {allResendable && (
                <Button
                  variant="primary"
                  size="sm"
                  type="button"
                  onClick={() => setShowBulkResendConfirm(true)}
                  disabled={isBulkResending}
                  className="whitespace-nowrap"
                >
                  {isBulkResending
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Mail className="w-3.5 h-3.5" />}
                  {isBulkResending ? 'Sending…' : `Resend (${selectedIds.size})`}
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Candidate list. overflow-hidden, not overflow-auto: the table shell (or
            the mobile card stack) inside is the single vertical scroller. */}
        <div className={`relative px-2.5 sm:px-6 py-2.5 sm:py-4 flex flex-col ${paginationBelowTable ? 'flex-1' : 'overflow-hidden flex-1 min-h-0'}`}>
          {/* Same list and action rules as the AI Interviews tracker. */}
          <AIInterviewInviteTable
            invitations={tableInvitations}
            jdDisabled={jdDisabled}
            configArchived={configArchived}
            isLoading={initialLoading}
            hasActiveFilters={filtersActive}
            emptyHint="Use Send Invite to invite candidates to this job's AI interview."
            autoHeight={paginationBelowTable}
            emptyAction={guided ? (filtersActive ? (
              <Button variant="secondary" size="sm" onClick={() => { setFilters(EMPTY_INVITE_FILTERS); setJobVersionFilter(''); setVersionFilter(''); setSourceFilter(''); setResultFilter(''); setPage(1); }}>
                Clear filters
              </Button>
            ) : onInviteMore ? (
              <Button variant="primary" size="sm" onClick={onInviteMore} icon={<Send className="w-3.5 h-3.5" />}>
                Invite candidates
              </Button>
            ) : undefined) : undefined}
            jobVersion={jobVersion}
            interviewVersion={interviewVersion}
            showRowVersions={!!jobScope}
            onResend={(inv) => setResendTarget(inv)}
            resendingId={resendingId}
            onEdit={(inv) => {
              setEditForm({ candidate_name: inv.candidate_name || '', candidate_email: inv.candidate_email || '' });
              setEditTarget(inv);
            }}
            onRevoke={(inv) => setRevokeTarget(inv)}
            revokingId={revokingId}
            /* The rows on screen too, for the result page's Previous / Next. */
            onViewDetails={onViewResult ? (inv) => onViewResult(inv, invitations) : undefined}
            selectedIds={(jdDisabled || configArchived) ? undefined : selectedIds}
            onToggleSelect={(jdDisabled || configArchived) ? undefined : toggleSelectOne}
            isSelectable={isBulkActionable}
            trackerLook={look}
            allSelected={look ? pageSelection.full : undefined}
            onToggleSelectAll={look && !(jdDisabled || configArchived) && !pageSelection.empty ? () => pageSelection.toggle?.() : undefined}
            selectAllBlockedReason={look && !pageSelection.toggle ? 'Invited and Expired are mixed — pick one from Select All ▾' : undefined}
          />
          {!look && paginationBelowTable && !initialLoading && filteredTotal > 0 && (
            <div className="mt-auto pt-3 shrink-0">
              <ListPagination
                currentPage={page}
                itemsPerPage={pageSize}
                totalItems={filteredTotal}
                onPageChange={setPage}
                onItemsPerPageChange={(n) => { setPageSize(n); setPage(1); }}
                itemLabel="invites"
                minimalOnMobile
                compact
                alwaysShow
              />
            </div>
          )}
          {refreshVeil && (
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
        </div>
        </>
        )}

        {/* Export — the AI Interview module's export popup: CSV or Excel
            (.xlsx), then Customize Columns. Exports the ticked invites, else
            every invite in the current tab and filters across all pages. */}
        {showExportModal && (
          <ExportColumnsModal<InviteExportFormat>
            title="Export Invite Status"
            recordCount={selectedIds.size > 0 ? selectedIds.size : filteredTotal}
            recordNoun={['invite', 'invites']}
            formats={INVITE_EXPORT_FORMATS}
            format={exportFormat}
            onFormatChange={setExportFormat}
            columns={INVITE_EXPORT_COLUMNS.map(({ id, label }) => ({ id, label }))}
            initialColumnIds={INVITE_EXPORT_COLUMNS.map((c) => c.id)}
            exporting={isExporting}
            onExport={(ids) => void handleExport(ids)}
            onClose={() => { if (!isExporting) setShowExportModal(false); }}
          />
        )}

        {/* Resend confirmation — regenerates the interview token, so the old
            link stops working the moment the new email goes out. Mirrors the
            AI Interviews page tracker's dialog and endpoint. */}
        <ResendLinkModal
          isOpen={!!resendTarget}
          kind="interview"
          email={resendTarget?.candidate_email}
          expiry={resendTarget ? interviewResendExpiry(resendTarget) : null}
          onCancel={() => { if (resendingId !== resendTarget?.id) setResendTarget(null); }}
          onConfirm={async () => {
            const inv = resendTarget;
            if (!inv) return;
            setResendingId(inv.id);
            try {
              await aiInterviewService.sendSessionEmail(inv.id, { base_url: window.location.origin });
              toast.success(`New invitation link sent to ${inv.candidate_email}`);
              setSelectedIds(new Set());
              await loadInvitations(true);
              await onChanged?.();
            } catch (err: any) {
              showErrorToast(err, `Couldn't resend the invitation to ${inv.candidate_email}`);
            } finally {
              setResendingId(null);
              setResendTarget(null);
            }
          }}
          isLoading={!!(resendingId && resendingId === resendTarget?.id)}
        />

        {/* Revoke — the old link stops working immediately. */}
        <RevokeLinkModal
          isOpen={!!revokeTarget}
          kind="interview"
          email={revokeTarget?.candidate_email}
          isLoading={!!revokingId && revokingId === revokeTarget?.id}
          onCancel={() => { if (!revokingId) setRevokeTarget(null); }}
          onConfirm={async () => {
            const inv = revokeTarget;
            if (!inv) return;
            setRevokingId(inv.id);
            try {
              await aiInterviewService.revokeInvitation(inv.id);
              toast.success(`Invitation for ${inv.candidate_email} has been revoked`);
              setSelectedIds(new Set());
              await loadInvitations(true);
              await onChanged?.();
            } catch (err: any) {
              showErrorToast(err, `Couldn't revoke the invitation for ${inv.candidate_email}`);
            } finally {
              setRevokingId(null);
              setRevokeTarget(null);
            }
          }}
        />

        {/* Bulk revoke — selected Invited candidates only. */}
        <RevokeLinkModal
          isOpen={showBulkRevokeConfirm}
          kind="interview"
          bulk={{ scope: 'selected', count: look ? revocableSelected.length : selectedRows.length }}
          targets={selectedRows.filter(isRevocableInvite).map((inv) => ({ jobCode: jdShortId, jobTitle: jdTitle, version: inv._interview_version ?? interviewVersionProp ?? lookedUpVersions?.interview, email: inv.candidate_email }))}
          onCancel={() => { if (!isBulkRevoking) setShowBulkRevokeConfirm(false); }}
          onConfirm={handleBulkRevoke}
          isLoading={isBulkRevoking}
        />

        {/* Bulk resend confirmation — selected Expired candidates only. */}
        <ResendLinkModal
          isOpen={showBulkResendConfirm}
          kind="interview"
          bulk={{ count: look ? resendableSelected.length : selectedIds.size }}
          targets={selectionRows.filter((inv) => selectedIds.has(inv.id) && isBulkResendable(inv)).map((inv) => ({ jobCode: jdShortId, jobTitle: jdTitle, version: inv._interview_version ?? interviewVersionProp ?? lookedUpVersions?.interview, email: inv.candidate_email }))}
          onCancel={() => { if (!isBulkResending) setShowBulkResendConfirm(false); }}
          onConfirm={handleBulkResend}
          isLoading={isBulkResending}
        />

        {/* Footer — stacks on phones; First/Last drop out below sm. Nothing to
            count or page when nobody is invited, so embedded it goes too. */}
        {!(isUnstarted && embedded) && (
        <div className={`${paginationBelowTable || look ? 'tf-tracker-footer ' : ''}border-t bg-slate-50 shrink-0 ${look ? 'sm:flex sm:items-center border-gray-200 dark:border-slate-700 dark:bg-slate-800 shadow-[0_-4px_12px_-6px_rgba(15,23,42,0.12)]' : 'border-gray-100 dark:border-slate-700/60 dark:bg-slate-950'}`}>
        {/* look: one footer row from sm — the pager, then Cancel / Invite More
            right after its page buttons; with no pager, a spacer holds them
            right. Stacked on phones. */}
        {look && (!initialLoading && filteredTotal > 0 ? (
          <div className="px-3 pt-2 sm:flex-1 sm:min-w-0 sm:pl-6 sm:pr-0 sm:py-3">
            <ListPagination
              currentPage={page}
              itemsPerPage={pageSize}
              totalItems={filteredTotal}
              onPageChange={setPage}
              onItemsPerPageChange={(n) => { setPageSize(n); setPage(1); }}
              itemLabel="invites"
              minimalOnMobile
              compact
              alwaysShow
            />
          </div>
        ) : (
          /* No pager (loading, or an empty tab): an empty box in its place, so
             Cancel / Invite More stay right without leaning on ml-auto alone —
             they never jump from the left while the list loads. */
          <div className="hidden sm:block flex-1" aria-hidden="true" />
        ))}
        <div className={`flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-3 ${look ? `px-3 py-2.5 sm:py-2 sm:pl-4 sm:pr-6 sm:ml-auto shrink-0 ${!initialLoading && filteredTotal > 0 ? 'sm:border-l sm:border-gray-200 dark:sm:border-slate-700' : 'sm:py-3'}` : 'px-3 sm:px-6 py-2.5 sm:py-4'}`}>
          <p className={`tf-body-muted text-center sm:text-left order-2 sm:order-1 ${look ? 'hidden' : ''}`}>
            {/* Under the table instead when the paging is there. */}
            {!paginationBelowTable && resultsLabel}
          </p>
          <div className="flex items-center justify-center sm:justify-end flex-wrap gap-1.5 sm:gap-2 order-1 sm:order-2">
            {totalPages > 1 && !paginationBelowTable && (
              <>
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
                    className="tf-input w-12 sm:w-14 h-8 px-1.5 sm:px-2 text-center"
                  />
                </div>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className={pageBtn}>
                  Prev
                </button>
                <span className="px-1 sm:px-2 tf-body-secondary whitespace-nowrap">
                  Page {page} of {totalPages}
                </span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className={pageBtn}>
                  Next
                </button>
              </>
            )}
            {!embedded && (
              <Button variant="secondary" size="sm" onClick={onClose}>
                Cancel
              </Button>
            )}
            {(onInviteMore || inviteMoreDeniedReason) && !embedded && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => { if (onInviteMore) onInviteMore(); }}
                disabled={jdDisabled}
                aria-disabled={!onInviteMore || undefined}
                className={`${(!onInviteMore ? 'opacity-60 cursor-not-allowed' : undefined) ?? ''} disabled:opacity-50`}
                title={jdDisabled ? (jobLock ? jobLockMessage : JD_DISABLED_ACTION_MESSAGE) : !onInviteMore ? inviteMoreDeniedReason : undefined}
                icon={<Send className="w-3.5 h-3.5" />}
              >
                Invite More
              </Button>
            )}
          </div>
        </div>
        </div>
        )}
      </div>
  );

  const editEmailTrimmed = editForm.candidate_email.trim();
  const editEmailError =
    editEmailTrimmed.length > 0 && !isValidEmailFormat(editEmailTrimmed) ? EMAIL_FORMAT_ERROR : null;
  const editNameError =
    editForm.candidate_name.trim().length > 0 && !isValidCandidateName(editForm.candidate_name) ? NAME_FORMAT_ERROR : null;
  const handleSaveEdit = async () => {
    const inv = editTarget;
    if (!inv) return;
    const name = editForm.candidate_name.trim();
    const email = editForm.candidate_email.trim();
    if (!name || !email) { toast.error('Candidate name and email are required'); return; }
    if (!isValidCandidateName(name)) { toast.error(NAME_FORMAT_ERROR); return; }
    if (!isValidEmailFormat(email)) { toast.error(EMAIL_FORMAT_ERROR); return; }
    setSavingEdit(true);
    try {
      await aiInterviewService.updateInvitation(inv.id, { candidate_name: name, candidate_email: email });
      // Saving is the only way to reactivate a revoked invite, so it resends.
      try {
        await aiInterviewService.sendSessionEmail(inv.id, { base_url: window.location.origin });
        toast.success(`Invitation updated and sent to ${email}`);
      } catch (sendErr: any) {
        showErrorToast(sendErr, "Details saved, but couldn't send the invitation");
      }
      await loadInvitations(true);
      await onChanged?.();
      setEditTarget(null);
    } catch (err: any) {
      showErrorToast(err, "Couldn't update the invitation");
    } finally {
      setSavingEdit(false);
    }
  };

  /* Edit invitation — only offered on REVOKED rows by the table. Same modal
     as the AI Interviews page's tracker. */
  const editModal = editTarget && (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-4 sm:p-6">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] w-full max-w-[95vw] sm:max-w-md">
        <div className="px-5 sm:px-6 pt-5 sm:pt-6 pb-3 border-b border-gray-100 dark:border-slate-700/60 flex items-center justify-between">
          <h3 className="tf-section-title sm:text-lg tracking-tight">Edit Invitation</h3>
          <Button variant="secondary" size="sm" onClick={() => { if (!savingEdit) setEditTarget(null); }} aria-label="Close" className="">
            <X className="w-5 h-5" />
          </Button>
        </div>
        <div className="px-5 sm:px-6 py-4 space-y-4">
          <p className="tf-body-muted">
            Update the candidate&apos;s details below. Saving will send them a fresh invitation link automatically.
          </p>
          <div>
            <label className="block tf-caption mb-1">Candidate name</label>
            <input
              type="text"
              value={editForm.candidate_name}
              onChange={(e) => setEditForm((f) => ({ ...f, candidate_name: e.target.value }))}
              aria-invalid={editNameError ? 'true' : undefined}
              className={`w-full px-3 h-9 text-sm border bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 ${
                editNameError
                  ? 'border-destructive focus:ring-destructive/30 focus:border-destructive'
                  : 'border-gray-200 dark:border-slate-700 focus:ring-brand-blue/30 focus:border-brand-blue'
              }`}
            />
            {editNameError && <p className="mt-1 tf-error">{editNameError}</p>}
          </div>
          <div>
            <label className="block tf-caption mb-1">Candidate email</label>
            <input
              type="email"
              value={editForm.candidate_email}
              onChange={(e) => setEditForm((f) => ({ ...f, candidate_email: e.target.value }))}
              aria-invalid={editEmailError ? 'true' : undefined}
              className={`w-full px-3 h-9 text-sm border bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 ${
                editEmailError
                  ? 'border-destructive focus:ring-destructive/30 focus:border-destructive'
                  : 'border-gray-200 dark:border-slate-700 focus:ring-brand-blue/30 focus:border-brand-blue'
              }`}
            />
            {editEmailError && <p className="mt-1 tf-error">{editEmailError}</p>}
          </div>
        </div>
        <div className="px-5 sm:px-6 py-4 border-t border-gray-100 dark:border-slate-700/60 flex items-center justify-end gap-2">
          <Button variant="secondary" size="md" onClick={() => setEditTarget(null)} disabled={savingEdit}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleSaveEdit}
            disabled={savingEdit || !isValidCandidateName(editForm.candidate_name) || !isValidEmailFormat(editEmailTrimmed)}
            icon={savingEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : undefined}
          >
            Save & Send
          </Button>
        </div>
      </div>
    </div>
  );

  if (embedded) return <>{panel}{editModal}</>;

  return (
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4 md:p-6">
      {/* Height is content-driven with a viewport cap, not a fixed dvh: a
          three-invite list on a large monitor used to stretch the dialog the full
          screen with empty space under the rows. The list absorbs the overflow
          once the cap engages, so a long list still scrolls inside the dialog on
          a 320px phone. */}
      {panel}
      {editModal}
    </div>
  );
}
