'use client';

import { Video, Users, CheckCircle, MoreVertical, Settings, TrendingUp, Clock, FileText, Copy, X, Loader2, Send, Mail, Briefcase, Globe, Brain, Shield, Lightbulb, Eye, Trash2, Play, Pause, Archive, ArchiveRestore, ScrollText, Camera, Monitor, AlertTriangle, Pencil, BarChart2, ChevronDown, Search, Plus, ClipboardList, Ban, Square, CheckSquare, Info, RefreshCw, Layers, Radar } from 'lucide-react';
import { MENU_ITEM_SCALE_CLASS } from '@/lib/constants/menuAnimation';
import { collapseAIInterviewLineages } from '@/lib/utils/aiInterviewJobOrder';
import { rememberAIInterviewPagerOrder, type AIInterviewPagerList } from '@/lib/utils/aiInterviewPagerList';
import { useState, useEffect, useRef, useCallback, useMemo, type ComponentType } from 'react';
import { createPortal } from 'react-dom';
import { useDialogHeightLock } from '@/lib/hooks/useDialogHeightLock';
import { TRACKER_DIALOG_PANEL_CLASS } from '@/lib/constants/trackerDialog';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import AIInterviewFlowLoader from '@/components/ai-interview/AIInterviewFlowLoader';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { DateField } from '@/components/ui/date-field';
import { usePlanFeature } from '@/lib/hooks/usePlanFeature';
import { useQuota } from '@/contexts/QuotaContext';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import type { AIInterviewResponse, AIInterviewStatsResponse, AIInterviewSettingsResponse, AIInterviewAuditActivity, AIInterviewAuditTrailResponse } from '@/lib/services/aiInterviewService';
import api from '@/lib/services/api';
import { toast } from 'sonner';
import { isValidEmailFormat, EMAIL_FORMAT_ERROR } from '@/lib/utils/email';
import ShareAIInterviewModal from '@/components/ai-interview/ShareAIInterviewModal';
import ArchiveAIInterviewModal from '@/components/ai-interview/ArchiveAIInterviewModal';
import DeleteAIInterviewModal from '@/components/ai-interview/DeleteAIInterviewModal';
import AIInterviewReviewPreviewModal from '@/components/ai-interview/AIInterviewReviewPreviewModal';
import CandidateResultsView from '@/components/ai-interview/CandidateResultsView';
import AIInterviewAuditTrail from '@/components/AIInterviewAuditTrail';
import AIInterviewPicker from '@/components/ai-interview/AIInterviewPicker';
import AIInterviewCandidateResults from '@/components/ai-interview/AIInterviewCandidateResults';
import InviteFilterBar, { EMPTY_INVITE_FILTERS, AI_INTERVIEW_INVITE_STATUS_OPTIONS, hasActiveInviteFilters, type InviteFilterState, type InviteStatusOption } from '@/components/InviteFilterBar';
import InviteStatCards, { INVITE_CARD_TONES } from '@/components/InviteStatCards';
import AIInterviewInviteTable, { isRevocableInvite, isExpiredForActions, resolveInviteStatus, displayInviteScore, matchesInviteResultFilter } from '@/components/AIInterviewInviteTable';
import SearchableSelect from '@/components/ui/searchable-select';
import { interviewVersionOrdinal } from '@/lib/utils/aiInterviewVersion';
import {
  FilterSelect,
  jobFilterOptions,
  versionFilterOptions,
  INVITE_SOURCE_FILTER_OPTIONS,
  RESULT_FILTER_OPTIONS,
} from '@/components/ai-interview/ColumnFilterFields';
import { formatIST } from '@/lib/utils/dateUtils';
import { modeFromConfig } from '@/lib/constants/aiInterviewMode';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import ListPagination from '@/components/ListPagination';
import ListToolbar from '@/components/ui/list-toolbar';
import ListCountBadge from '@/components/ui/list-count-badge';
import { IS_PRODUCTION_ENV } from '@/lib/utils/env';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import { StatsCard, StatsCardGrid } from '@/components/ui/stats-card';
import QuotaBadge from '@/components/ui/quota-badge';
import AssessmentVersionHistoryPanel, {
  ASSESSMENT_VOCABULARY,
  type AssessmentVersionRow,
  type VersionHistoryVocabulary,
  jobVersionDisplayStatus,
} from '@/components/assessments/AssessmentVersionHistoryPanel';
import { useJobVersionLineage } from '@/lib/hooks/useJobVersionLineage';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import AllInterviewsTable, { VersionPill } from '@/components/ai-interview/AllInterviewsTable';

/* The version panel's 3-dot menu trigger — the 28px bordered square matched to
   the Assessment page's `QUICK_ACTION_BASE` in Assessments.tsx. */
const QUICK_ACTION_BASE =
  'h-7 w-7 flex items-center justify-center bg-white dark:bg-slate-900 border rounded-md transition-all';
/* One dropdown item's row, shared by every entry in the compact menu so they
   line up exactly as the Assessment page's do. */
const VERSION_MENU_ITEM_CLASS =
  'group w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors';
/* Same row, greyed out — the look the menu's disabled Delete already uses. */
const VERSION_MENU_ITEM_DISABLED_CLASS =
  'group w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-400 dark:text-slate-500 cursor-not-allowed opacity-60';

// Returns the effective interview duration string.
// New configs store the real 30 / 35 / N value in duration_minutes.
// Legacy configs used duration_minutes=0 as a sentinel for flexible mode —
// those still need the buffer-aware fallback so older records render
// correctly in the list.
function getInterviewDuration(durationMinutes: number | undefined | null, specialInstructions?: string | null): string {
  if ((durationMinutes ?? 0) === 0) {
    let bufferEnabled = false;
    try { const si = JSON.parse(specialInstructions || '{}'); bufferEnabled = !!si.buffer_enabled; } catch {}
    return bufferEnabled ? '35 min' : '30 min';
  }
  return `${durationMinutes} min`;
}

const ROUND_LABELS: Record<string, string> = {
  hr: 'HR',
  technical: 'Technical',
  behavioral: 'Behavioral',
  culture_fit: 'Culture Fit',
  leadership: 'Leadership',
  problem_solving: 'Problem Solving',
  must_have_skills: 'Must-Have Skills',
  nice_to_have_skills: 'Nice-to-Have Skills',
};

/* Short forms for the version panel's Mode cell pills. */
const ROUND_SHORT_LABELS: Record<string, string> = {
  hr: 'HR',
  technical: 'TECH',
  behavioral: 'BEH',
  culture_fit: 'CF',
  leadership: 'LEAD',
  problem_solving: 'PS',
  must_have_skills: 'MHS',
  nice_to_have_skills: 'NHS',
};

type TabKey = 'all' | 'all-interviews' | 'published' | 'draft' | 'completed' | 'archived' | 'candidate-results' | 'invitation-status' | 'processing' | 'audit' | 'consent' | 'settings';
type OverviewCardKey = 'jobs' | 'interviews' | 'active' | 'draft' | 'interviewed';
const CONFIG_PAGE_SIZE = 10;
const AI_FILTER_FIELD_CLASS = 'w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-black dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40';
const PROCESSING_PAGE_SIZE = 10;
const INVITATION_PAGE_SIZE = 10;
/* The Invitation Status tab's filter-bar dropdown needs 'expired' as its own
 * option — the segmented pills above it use resolveInviteStatus(), which can
 * bucket a still-'invited' row as expired, so the dropdown must offer the
 * same value or picking a pill would leave it showing nothing selected. */
/* Invitation Status's per-column filters — one per table column with a fixed
   set of values. '' means any. */
const EMPTY_INVITE_COLUMN_FILTERS = {
  job: '',
  jobVersion: '',
  interviewVersion: '',
  inviteSource: '',
  result: '',
};

const INVITATION_STATUS_TAB_OPTIONS: InviteStatusOption[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'invited', label: 'Invited' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'expired', label: 'Expired' },
  { value: 'revoked', label: 'Revoked' },
  { value: 'terminated', label: 'Terminated' },
];
const AI_INTERVIEWS_LIST_VIEW_REDIRECT_KEY = 'ai_interviews_open_list_view';
const CONFIG_FETCH_PAGE_SIZE = 20;

/** One string for the list filters the page-reset effect watches. */
const listFilterKey = (v: Record<string, unknown>) =>
  JSON.stringify([v.activeTab, v.invitedOnly, v.modeFilter, v.searchQuery, v.sortBy, v.creatorFilter, v.dateFilter, v.customDateFrom, v.customDateTo]);

export default function AIInterview() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isTenantAdmin } = useAuth();
  const canViewAIInterviews = isTenantAdmin || (user?.permissions?.canViewAIInterviews ?? user?.permissions?.canRunAiInterviews ?? false);
  const canCreateAIInterviews = isTenantAdmin || !!user?.permissions?.canCreateAIInterviews;
  const canUpdateAIInterviews = isTenantAdmin || !!user?.permissions?.canUpdateAIInterviews;
  const canInviteAIInterviews = isTenantAdmin || !!user?.permissions?.canInviteAIInterviews;
  // Share and Invite are the same action (both open ShareAIInterviewModal to
  // send a candidate their interview link) — kept as one alias rather than a
  // second independent check so both entry points agree on one permission.
  const canShareAIInterviews = canInviteAIInterviews;
  const canPublishAIInterviews = isTenantAdmin || !!user?.permissions?.canPublishAIInterviews;
  const canArchiveAIInterviews = isTenantAdmin || !!user?.permissions?.canArchiveAIInterviews;
  const canDeleteAIInterviews = isTenantAdmin || !!user?.permissions?.canDeleteAIInterviews;
  // HR Question Bank is reached via a quick link here (moved out of the sidebar)
  const canAccessHRQuestionBank = isTenantAdmin || !!(user?.permissions?.canViewHRQuestionBank || user?.permissions?.canCreateHRQuestionBank || user?.permissions?.canUpdateHRQuestionBank || user?.permissions?.canDeleteHRQuestionBank);
  const { available: aiInterviewAvailable } = usePlanFeature('ai_interview');
  const { quotaData } = useQuota();

  const [activeTab, setActiveTab] = useState<TabKey>('all');
  /* Active/Draft/Archived list view — 'ungrouped' (default) is a flat table,
     one row per version, in the same shape as the All Interviews tab;
     'grouped' is the one-card-per-job view with each job's other versions
     behind its own View Versions button. Total Jobs and Completed have no
     toggle and always render grouped. */
  const [configListViewMode, setConfigListViewMode] = useState<'grouped' | 'ungrouped'>('ungrouped');
  // "AI Interview Published" success modal (was referenced in JSX but never
  // declared — pre-existing build error). Defaults hidden; no behavior change.
  const [showPublishedModal, setShowPublishedModal] = useState(false);
  const [publishedTitle, setPublishedTitle] = useState('');
  // Two-step view: 'cards' shows only the stat tiles; 'list' shows the tabs + filters + list.
  // Mirrors the Job Openings page pattern — fresh visit lands on the cards overview.
  const [pageView, setPageView] = useState<'cards' | 'list'>('cards');
  const listSectionRef = useRef<HTMLDivElement | null>(null);
  const [listScrollRequest, setListScrollRequest] = useState(0);
  const consumedListViewRedirectRef = useRef(false);
  const handledQuickActionRef = useRef<string | null>(null);
  const [activeOverviewCard, setActiveOverviewCard] = useState<OverviewCardKey | null>(null);
  // Extra filter applied on top of the active tab — used by the "Invite Shared
  // Configs" stats card to scope the list to only configs that have actually
  // had invitations shared.
  const [invitedOnly, setInvitedOnly] = useState(false);
  const openListView = (tab: TabKey, opts?: { invitedOnly?: boolean; cardKey?: OverviewCardKey }) => {
    setActiveTab(tab);
    setInvitedOnly(!!opts?.invitedOnly);
    setActiveOverviewCard(opts?.cardKey ?? null);
    setConfigListPage(1);
    setProcessingPage(1);
    setPageView('list');
    setListScrollRequest((request) => request + 1);
  };

  /* The card that matches the open tab is the selected one — read from the
     tab itself, so picking a "Show:" pill selects its card just as clicking
     the card selects its pill. Tabs with no card (Archived, Activity Logs, …)
     select none. */
  const TAB_OVERVIEW_CARD: Partial<Record<TabKey, OverviewCardKey>> = {
    all: 'jobs',
    'all-interviews': 'interviews',
    published: 'active',
    draft: 'draft',
    'candidate-results': 'interviewed',
  };
  const isOverviewCardActive = (cardKey: OverviewCardKey) =>
    pageView === 'list' && (TAB_OVERVIEW_CARD[activeTab] ?? activeOverviewCard) === cardKey;
  const [modeFilter, setModeFilter] = useState<'all' | 'timed' | 'conversational'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'active' | 'draft'>('newest');
  // Filter by who created the config (created_by_name) — 'all' shows everything
  const [creatorFilter, setCreatorFilter] = useState<string>('all');
  // Filter by created_at date range. 'custom' reveals the date-range inputs.
  type DateFilterKey = 'all' | 'today' | 'yesterday' | 'last_week' | 'last_month' | 'custom';
  const [dateFilter, setDateFilter] = useState<DateFilterKey>('all');

  // This page filters through always-visible inline selects rather than a
  // collapsible panel, so there is no "Done" step — but it had no way to reset
  // either. Mirrors job-openings' clearAllFilters()/filtersActive pair.
  const aiFiltersActive =
    searchQuery !== '' || modeFilter !== 'all' || creatorFilter !== 'all' ||
    dateFilter !== 'all' || invitedOnly;

  const [showAIFilters, setShowAIFilters] = useState(false);
  const aiFilterCount =
    (modeFilter !== 'all' ? 1 : 0) + (creatorFilter !== 'all' ? 1 : 0) + (dateFilter !== 'all' ? 1 : 0);

  const clearAIInterviewFilters = () => {
    setSearchQuery('');
    setModeFilter('all');
    setCreatorFilter('all');
    setDateFilter('all');
    setInvitedOnly(false);
    setCustomDateFrom('');
    setCustomDateTo('');
  };
  const [customDateFrom, setCustomDateFrom] = useState<string>(''); // YYYY-MM-DD
  const [customDateTo, setCustomDateTo] = useState<string>('');     // YYYY-MM-DD
  const [configs, setConfigs] = useState<AIInterviewResponse[]>([]);
  const [archivedConfigs, setArchivedConfigs] = useState<AIInterviewResponse[]>([]);
  const [stats, setStats] = useState<AIInterviewStatsResponse | null>(null);
  /* Completed + Terminated sessions — the same rows Candidate Results lists
     (a terminated interview still has its partial report). `stats.completed`
     alone left the card short of that list's count. */
  const [interviewedCount, setInterviewedCount] = useState<number | null>(null);
  const [settings, setSettings] = useState<AIInterviewSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Share modal
  const [shareConfig, setShareConfig] = useState<AIInterviewResponse | null>(null);
  // "Send Invite" picker — lists published/active configs to pick one, then
  // opens the existing Share (invite) modal for the chosen config.
  const [showInvitePicker, setShowInvitePicker] = useState(false);
  /* The list itself (search, Grouped/Ungrouped, paging, preview) is the shared
     <AIInterviewPicker>; this page keeps only the pick and the dialog's
     scroller, which the picker's pagination scrolls back to the top. */
  const invitePickerScrollRef = useRef<HTMLDivElement | null>(null);
  const [invitePickerSelection, setInvitePickerSelection] = useState<
    { jobKey: string; jdId?: string; interviewId: string } | null
  >(null);
  // When the Share modal is opened from the Candidate Invitations modal
  // ("Invite More"), remember the config so closing Share returns to that
  // invitations popup instead of dropping the user back on the list.
  const [shareReturnToInvites, setShareReturnToInvites] = useState<AIInterviewResponse | null>(null);

  // View invitations
  const [viewInvitationsConfig, setViewInvitationsConfig] = useState<AIInterviewResponse | null>(null);
  const [invitations, setInvitations] = useState<AIInterviewResponse[]>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(false);
  const [isRefreshingInvites, setIsRefreshingInvites] = useState(false);
  /* Holds the tracking dialog's height while a manual Refresh runs, so the
     content-driven box cannot move under the pointer. Shared with every other
     popup that carries a Refresh button - see the hook for why. */
  const invitesHeightLock = useDialogHeightLock<HTMLDivElement>();
  const [resendingEmailFor, setResendingEmailFor] = useState<string | null>(null); // session id
  // Resend-with-new-link confirmation dialog target
  const [resendInviteTarget, setResendInviteTarget] = useState<any | null>(null);
  // Revoke confirmation dialog target
  const [revokeInviteTarget, setRevokeInviteTarget] = useState<any | null>(null);
  const [revokingInviteFor, setRevokingInviteFor] = useState<string | null>(null); // session id
  // Bulk revoke — checkbox selection (current invitations page) + confirm dialog state
  const [selectedInviteIds, setSelectedInviteIds] = useState<Set<string>>(new Set());
  const [bulkRevokeConfirmOpen, setBulkRevokeConfirmOpen] = useState(false);
  // The Track popup's bulk Resend (Expired card).
  const [trackerBulkResendOpen, setTrackerBulkResendOpen] = useState(false);
  const [isTrackerBulkResending, setIsTrackerBulkResending] = useState(false);
  const [isBulkRevoking, setIsBulkRevoking] = useState(false);
  // Edit invitation modal target — only ever set for a REVOKED invitation
  const [editInviteTarget, setEditInviteTarget] = useState<any | null>(null);
  const [editInviteForm, setEditInviteForm] = useState({ candidate_name: '', candidate_email: '' });
  const [savingEditInvite, setSavingEditInvite] = useState(false);
  const [inviteFilters, setInviteFilters] = useState<InviteFilterState>(EMPTY_INVITE_FILTERS);
  /* Job Version and Interview Version filters. Everything in a tracker
     belongs to one interview, so each offers that interview's single value
     and every row matches it — they mirror the table's columns rather than
     narrow it. Source does narrow: see loadInvitations. */
  const [trackerJobVersionFilter, setTrackerJobVersionFilter] = useState('');
  const [trackerVersionFilter, setTrackerVersionFilter] = useState('');
  /* A job row's Track covers EVERY interview of that job, so its cards add up
     to the row's Invitations Sent / Completed. Null for a single interview's
     tracker (a version row). Each entry carries its versions, worked out when
     the popup opens. Mirrored into refs because the loaders below are stable
     callbacks that read them at call time. */
  type TrackerScopeEntry = { config: AIInterviewResponse; jobVersion: number; interviewVersion: number };
  const [trackerJobScope, setTrackerJobScope] = useState<TrackerScopeEntry[] | null>(null);
  const trackerJobScopeRef = useRef<TrackerScopeEntry[] | null>(null);
  const trackerVersionFiltersRef = useRef({ job: '', interview: '' });
  // Declared ahead of the loader effects, so the refs are current when they run.
  useEffect(() => {
    trackerJobScopeRef.current = trackerJobScope;
    trackerVersionFiltersRef.current = { job: trackerJobVersionFilter, interview: trackerVersionFilter };
  }, [trackerJobScope, trackerJobVersionFilter, trackerVersionFilter]);
  /** The job-wide scope `configId` belongs to, or null for a one-interview tracker. */
  const trackerScopeFor = (configId: string) => {
    const scope = trackerJobScopeRef.current;
    return scope && scope.some((entry) => entry.config.id === configId) ? scope : null;
  };
  const [trackerSourceFilter, setTrackerSourceFilter] = useState('');
  const [trackerResultFilter, setTrackerResultFilter] = useState('');
  // See handleViewInvitations.
  const [trackerShowVersions, setTrackerShowVersions] = useState(false);
  const [invitationTotal, setInvitationTotal] = useState(0);
  const [invitationTotalPages, setInvitationTotalPages] = useState(1);
  const [invitationOverview, setInvitationOverview] = useState({
    total: 0,
    invited: 0,
    completed: 0,
    inProgress: 0,
    terminated: 0,
    cancelled: 0,
    revoked: 0,
    expired: 0,
  });
  const [configListPage, setConfigListPage] = useState(1);
  const [configListItemsPerPage, setConfigListItemsPerPage] = useState(10);
  const [processingPage, setProcessingPage] = useState(1);
  const [processingItemsPerPage, setProcessingItemsPerPage] = useState(10);
  /** Filter values a list-state restore applied — see the page-reset effect. */
  const restoredListKeyRef = useRef<string | null>(null);
  const [invitationPage, setInvitationPage] = useState(1);
  // "Go to page" input for the Invite Status Tracking footer — buffered locally
  // so a partial edit doesn't get clobbered by invitationPage until Enter/blur commits it.
  const [goToInvitationPage, setGoToInvitationPage] = useState('1');
  useEffect(() => {
    setGoToInvitationPage(String(invitationPage));
  }, [invitationPage]);
  const commitGoToInvitationPage = () => {
    const page = Math.round(Number(goToInvitationPage));
    if (Number.isFinite(page) && page >= 1 && page <= invitationTotalPages) {
      setInvitationPage(page);
    } else {
      setGoToInvitationPage(String(invitationPage));
    }
  };

  // Candidate detail view (from Track Invites modal)
  const [candidateDetailFromModal, setCandidateDetailFromModal] = useState<AIInterviewResponse | null>(null);
  const [candidateDetailLoading, setCandidateDetailLoading] = useState(false);

  /* Invitation Status tab — every invitation across every AI interview, the
     Assessments page's Invitation Status tab applied to interviews. Loaded by
     fanning out one getConfigInvitations() per config (below), not a single
     cross-config endpoint — the backend has none — the same approach the
     Assessments page's own cross-assessment tab uses. */
  const [inviteStatusRows, setInviteStatusRows] = useState<any[]>([]);
  const [isLoadingInviteStatus, setIsLoadingInviteStatus] = useState(false);
  const [inviteStatusError, setInviteStatusError] = useState<string | null>(null);
  const [inviteStatusFilters, setInviteStatusFilters] = useState<InviteFilterState>(EMPTY_INVITE_FILTERS);
  /* The tab's per-column filters — kept beside InviteFilterState (shared
     with the Track dialogs, which don't have these columns) rather than in
     it. '' means any. */
  const [inviteStatusColumnFilters, setInviteStatusColumnFilters] = useState(EMPTY_INVITE_COLUMN_FILTERS);
  const [inviteStatusPage, setInviteStatusPage] = useState(1);
  const [inviteStatusItemsPerPage, setInviteStatusItemsPerPage] = useState(10);
  /* The tab's filter panel (behind More Filters in the toolbar above the
     pills), its row selection, and the bulk revoke that acts on it. */
  const [showInviteStatusFilters, setShowInviteStatusFilters] = useState(false);
  const [selectedStatusInviteIds, setSelectedStatusInviteIds] = useState<Set<string>>(new Set());
  const [statusBulkRevokeOpen, setStatusBulkRevokeOpen] = useState(false);
  const [statusBulkResendOpen, setStatusBulkResendOpen] = useState(false);
  const [isStatusBulkResending, setIsStatusBulkResending] = useState(false);

  // 3-dot menu
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  /* Which row has its JD version history open — one at a time, keyed by config
     id, exactly as the Assessments Job List holds its own. Persisted with the
     rest of the list state below so coming back from an interview page finds
     the panel as it was left, which is what that list does. */
  const [openVersionsFor, setOpenVersionsFor] = useState<string | null>(null);
  /** Completed-session count per interview config — filled when its job's
   *  versions are opened (see the effect beside `interviewVersionRows`). */
  const [completedCounts, setCompletedCounts] = useState<Record<string, number>>({});
  /* Invitation totals per interview, from the same unfiltered invitations
     summary the Track popup reads — the list's `invitations_count` can drift
     from it, so the job row and version rows prefer this once it lands. */
  const [invitationTotals, setInvitationTotals] = useState<Record<string, number>>({});
  const completedCountsRequested = useRef<Set<string>>(new Set());
  /* The chosen interview version, one per job, exactly as the Assessments Job
     List holds its own pick (`selectedAssessmentVersionByJob`): the panel's
     radio group already enforces "one at a time" in the markup, and keying the
     answer by `jd_id` here makes it a property of the state too, so a pick under
     one job never bleeds into another. Keyed by the config's own JD row id, the
     same id the version rows are joined on. */
  /* Which job versions have their Interview Versions table open (View
     Interview), per job — held here, not in the panel, so it survives a trip
     to an interview's page and back (same as the Assessments Job List). */
  const [expandedJobVersionsByJob, setExpandedJobVersionsByJob] = useState<Record<string, number[]>>({});
  const [selectedInterviewVersionByJob, setSelectedInterviewVersionByJob] =
    useState<Record<string, string>>({});
  /* The job lineage behind that panel — the shared hook the Assessments list,
     Job Openings and Resume Scoring all read, so the version rows here are the
     same rows those pages show, fetched once per job and cached per mount. */
  const jdLineage = useJobVersionLineage();
  // Whether the action menu should open UPWARD (flip) — set when there isn't
  // enough room below the trigger (last cards / near the viewport bottom) so the
  // menu isn't clipped off-screen.
  const [menuDropUp, setMenuDropUp] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  /* The version-history Actions column carries the SAME compact 3-dot menu the
     Assessment page's version panel uses, and for the same reason it is
     portalled to <body>: that menu's cell sits inside the panel table's
     `overflow-x-auto` box, and overflow clipping is not something z-index can
     escape — an in-flow dropdown would be sliced off at the column edge. The
     menu is placed from the trigger's own viewport rect (`menuAnchor`), and its
     own ref (`versionMenuRef`) keeps the shared click-outside handler from
     treating a click inside the portalled menu as a click outside it. */
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; bottom: number; right: number } | null>(null);
  const versionMenuRef = useRef<HTMLDivElement>(null);

  // Quota
  const [availableUnits, setAvailableUnits] = useState<number | null>(null);
  const [totalUnits, setTotalUnits] = useState<number>(0);
  const [isUnlimited, setIsUnlimited] = useState(false);

  // Settings form
  const [settingsDuration, setSettingsDuration] = useState(30);
  const [settingsLanguage, setSettingsLanguage] = useState('English (US)');
  const [settingsAutoRecord, setSettingsAutoRecord] = useState(true);
  const [settingsReminders, setSettingsReminders] = useState(true);
  const [settingsSentiment, setSettingsSentiment] = useState(true);
  const [settingsSubTab, setSettingsSubTab] = useState<'general' | 'proctoring'>('general');

  // Proctoring
  const [proctoringEnabled, setProctoringEnabled] = useState(false);
  const [proctoringSettings, setProctoringSettings] = useState({
    webcam_monitoring: false,
    screen_recording: false,
    tab_switch_detection: true,
    copy_paste_prevention: true,
    browser_lockdown: false,
    ai_cheating_prevention: false,
    max_tab_switches: 3,
    max_violations: 5,
    violation_low_threshold: 3,
    violation_medium_threshold: 8,
    retention_days: 90,
  });
  const [proctoringLoading, setProctoringLoading] = useState(false);

  // Audit trail
  const [auditActivities, setAuditActivities] = useState<AIInterviewAuditActivity[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [auditCategory, setAuditCategory] = useState<string>('all');

  // Processing (in-progress sessions)
  const [processingSessions, setProcessingSessions] = useState<AIInterviewResponse[]>([]);
  const [processingLoading, setProcessingLoading] = useState(false);

  // Archive / delete confirms — each its own dedicated dialog so the
  // warning gets the richer, purpose-built treatment rather than a generic
  // title+message box.
  const [archiveTarget, setArchiveTarget] = useState<AIInterviewResponse | null>(null);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AIInterviewResponse | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  /* Version History's eye icon — a read-only "Review & Publish" peek at that
     one version, not a navigation away from the list. `version` is display-
     only, carried along since the panel already derived it for the row. */
  const [reviewPreviewTarget, setReviewPreviewTarget] = useState<{ id: string; version?: number } | null>(null);

  /* Shared search/filter toolbar slot, above the tab pills. All-Interviews,
     Candidate Results and Activity Logs each own their own search fields, but
     portal their toolbar into this one DOM node instead of rendering it
     inline in their own body — so every tab's toolbar sits in the exact same
     spot (title → search/filter → tab pills), matching the Resume Scoring
     page's layout, rather than drifting per tab. State, not a plain ref: a
     portal needs the node to already be mounted to target it, and a ref alone
     doesn't re-render this component when it first attaches. */
  const [toolbarSlotEl, setToolbarSlotEl] = useState<HTMLDivElement | null>(null);
  // Beside Refresh in the pill row: the All Interviews table portals its
  // Clear Sort button here.
  const [sortActionSlotEl, setSortActionSlotEl] = useState<HTMLSpanElement | null>(null);

  /* Refresh button in the tab-pills row. Bumped on every click; the three
     tabs that manage their own data (AllInterviewsTable, AIInterviewCandidateResults,
     AIInterviewAuditTrail) each watch it via their own `refreshSignal` prop,
     while the tabs this component itself owns are refetched directly below. */
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [isRefreshingTab, setIsRefreshingTab] = useState(false);
  const handleRefreshCurrentTab = async () => {
    if (isRefreshingTab) return;
    setIsRefreshingTab(true);
    try {
      if (isConfigListTab) {
        await Promise.all([loadData(), loadArchivedConfigs()]);
      } else if (activeTab === 'processing') {
        await loadProcessingSessions();
      } else if (activeTab === 'invitation-status') {
        await loadAllInviteStatuses();
      } else if (activeTab === 'settings') {
        await loadSettings();
        if (settingsSubTab === 'proctoring') await loadProctoringSettings();
      }
      // All Interviews / Candidate Results / Activity Logs own their own
      // data — this is their cue to refetch.
      setRefreshSignal((n) => n + 1);
    } finally {
      setIsRefreshingTab(false);
    }
  };

  // Sync quota from shared QuotaContext (AIU = AI Interview Units)
  useEffect(() => {
    const quotas = quotaData?.quotas;
    if (!quotas?.AIU) return;
    const sub = quotas.AIU.subscription;
    const addon = quotas.AIU.addon;
    const subLimit = sub?.limit;
    const used = sub?.used ?? 0;
    const addonPurchased = typeof addon?.total_purchased === 'number' ? addon.total_purchased : 0;
    const addonConsumed = typeof addon?.total_consumed === 'number' ? addon.total_consumed : 0;
    const addonRemaining = Math.max(0, addonPurchased - addonConsumed);

    const unlimited = subLimit === -1 || subLimit === 'unlimited';
    setIsUnlimited(unlimited);
    if (unlimited) {
      setTotalUnits(-1);
      setAvailableUnits(-1);
    } else if (typeof subLimit === 'number' && subLimit > 0) {
      const totalLimit = subLimit + addonPurchased;
      setTotalUnits(totalLimit);
      const subRemaining = Math.max(0, subLimit - used);
      const remaining = typeof quotas.AIU.total_remaining === 'number'
        ? Math.max(0, quotas.AIU.total_remaining)
        : Math.max(0, subRemaining + addonRemaining);
      setAvailableUnits(remaining);
    }
  }, [quotaData]);

  // Load configs and stats
  const loadAllConfigs = useCallback(async (): Promise<AIInterviewResponse[]> => {
    const firstPage = await aiInterviewService.listConfigs({
      page: 1,
      page_size: CONFIG_FETCH_PAGE_SIZE,
      compact: true,
    });
    if (firstPage.total <= firstPage.items.length) {
      return firstPage.items;
    }

    const totalPages = Math.max(
      1,
      firstPage.total_pages || Math.ceil(firstPage.total / CONFIG_FETCH_PAGE_SIZE),
    );

    const remainingPages = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, index) =>
        aiInterviewService.listConfigs({
          page: index + 2,
          page_size: CONFIG_FETCH_PAGE_SIZE,
          compact: true,
        })
      )
    );

    return [
      ...firstPage.items,
      ...remainingPages.flatMap((page) => page.items),
    ];
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      let configItems: AIInterviewResponse[] = [];
      try {
        configItems = await loadAllConfigs();
      } catch (firstError) {
        // Retry once: this avoids a rare auth-refresh race where one concurrent
        // request refreshes the token and the sibling request needs one more hit.
        await new Promise((resolve) => window.setTimeout(resolve, 300));
        configItems = await loadAllConfigs();
      }
      setConfigs(configItems);

      try {
        const statsRes = await aiInterviewService.getConfigStats();
        setStats(statsRes);
      } catch (statsError) {
        console.error('Failed to load AI interview stats:', statsError);
      }

      try {
        // Same query Candidate Results loads; only the total is needed, so one row will do.
        const interviewedRes = await aiInterviewService.list({ status: 'completed,terminated', page: 1, page_size: 1 });
        setInterviewedCount(typeof interviewedRes.total === 'number' ? interviewedRes.total : null);
      } catch (countError) {
        console.error('Failed to load interviewed count:', countError);
        setInterviewedCount(null);
      }
    } catch (error) {
      setConfigs([]);
      if (error instanceof Error) {
        console.error('Failed to load AI interview configs:', error);
        toast.error(error.message || 'AI interview configurations failed to load.');
      } else {
        console.error('Failed to load AI interview data:', error);
        toast.error('Failed to load data. Please refresh.');
      }
    } finally {
      setLoading(false);
    }
  }, [loadAllConfigs]);

  const loadSettings = useCallback(async () => {
    try {
      const settingsRes = await aiInterviewService.getSettings();
      setSettings(settingsRes);
      setSettingsDuration(settingsRes.default_duration);
      setSettingsLanguage(settingsRes.ai_voice_language);
      setSettingsAutoRecord(settingsRes.auto_record);
      setSettingsReminders(settingsRes.send_reminders);
      setSettingsSentiment(settingsRes.ai_sentiment_analysis);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }, []);

  const loadArchivedConfigs = useCallback(async () => {
    try {
      const probe = await aiInterviewService.listConfigs({ status: 'archived', page_size: 1, compact: true });
      const result = probe.total > probe.items.length
        ? await aiInterviewService.listConfigs({ status: 'archived', page_size: probe.total, compact: true })
        : probe;
      setArchivedConfigs(result.items);
    } catch (error) {
      console.error('Failed to load archived configs:', error);
    }
  }, []);

  const loadAuditTrail = useCallback(async () => {
    setAuditLoading(true);
    try {
      const result = await aiInterviewService.getAuditTrail({
        category: auditCategory === 'all' ? undefined : auditCategory,
        page: auditPage,
        page_size: 50,
      });
      setAuditActivities(result.items);
      setAuditTotal(result.total);
    } catch (error) {
      console.error('Failed to load audit trail:', error);
    } finally {
      setAuditLoading(false);
    }
  }, [auditCategory, auditPage]);

  const loadProcessingSessions = useCallback(async () => {
    setProcessingLoading(true);
    try {
      const probe = await aiInterviewService.list({ status: 'in_progress', page_size: 1 });
      const result = probe.total > probe.items.length
        ? await aiInterviewService.list({ status: 'in_progress', page_size: probe.total })
        : probe;
      setProcessingSessions(result.items);
    } catch (error) {
      console.error('Failed to load processing sessions:', error);
    } finally {
      setProcessingLoading(false);
    }
  }, []);

  const loadInvitationOverview = useCallback(async (configId: string) => {
    try {
      /* Three calls, all page_size 1 — the list endpoint returns aggregate counts
         for completed/in_progress/terminated/cancelled but not for `invited` or
         `revoked`. Deriving either as "total minus the rest" would have made that
         card disagree with the rows it filters to: the remainder also holds
         expired and system_check sessions. Asking the endpoint for each bucket
         directly keeps the numbers and the filtered table in step. */
      // A job-wide tracker sums the same four calls over each of its interviews.
      const ids = trackerScopeFor(configId)?.map((entry) => entry.config.id) ?? [configId];
      const perConfig = await Promise.all(ids.map((id) => Promise.all([
        aiInterviewService.getConfigInvitations(id, { page: 1, page_size: 1, compact: true }),
        aiInterviewService.getConfigInvitations(id, { page: 1, page_size: 1, compact: true, status: 'invited' }),
        aiInterviewService.getConfigInvitations(id, { page: 1, page_size: 1, compact: true, status: 'revoked' }),
        aiInterviewService.getConfigInvitations(id, { page: 1, page_size: 1, compact: true, status: 'expired' }),
      ])));
      const sum = (pick: (calls: (typeof perConfig)[number]) => number | undefined) =>
        perConfig.reduce((acc, calls) => acc + (pick(calls) || 0), 0);
      setInvitationOverview({
        total: sum(([result]) => result.total),
        invited: sum(([, invitedOnly]) => invitedOnly.total),
        completed: sum(([result]) => result.completed),
        inProgress: sum(([result]) => result.in_progress),
        terminated: sum(([result]) => result.terminated),
        cancelled: sum(([result]) => result.cancelled),
        revoked: sum(([, , revokedOnly]) => revokedOnly.total),
        expired: sum(([, , , expiredOnly]) => expiredOnly.total),
      });
    } catch (error) {
      console.error('Failed to load invitation overview:', error);
      setInvitationOverview({
        total: 0,
        invited: 0,
        completed: 0,
        inProgress: 0,
        terminated: 0,
        cancelled: 0,
        revoked: 0,
        expired: 0,
      });
    }
  }, []);

  const loadInvitations = useCallback(async (configId: string, page: number, filters: InviteFilterState, source = '', resultFilter = '') => {
    setLoadingInvitations(true);
    try {
      /* Source (email / resume) and Result (the Score column's Pass / Fail)
         have no server-side filter, so with either set the whole matching
         list is fetched and filtered and paged here —
         filtering only the current server page would leave the page count
         and "Showing X of Y" describing rows that are not there. */
      /* Job-wide tracker: each interview's matching rows (narrowed to the
         chosen job / interview version), stamped with their versions, merged
         newest-sent first, then filtered and paged here — the same client-side
         path as Source / Result below, across several configs. */
      const scope = trackerScopeFor(configId);
      if (scope) {
        const { job, interview } = trackerVersionFiltersRef.current;
        const targets = scope.filter((entry) =>
          (!job || String(entry.jobVersion) === job) && (!interview || String(entry.interviewVersion) === interview));
        const lists = await Promise.all(targets.map((entry) =>
          aiInterviewService.getConfigInvitations(entry.config.id, {
            search: filters.search.trim() || undefined,
            status: filters.status !== 'all' ? filters.status : undefined,
            invite_date_from: filters.dateFrom || undefined,
            invite_date_to: filters.dateTo || undefined,
            page: 1,
            page_size: 1000,
          }).then((res) => (res.items || []).map((inv: any) => ({
            ...inv,
            _jd_version: entry.jobVersion,
            _interview_version: entry.interviewVersion,
          })))));
        const sentAt = (inv: any) => new Date(inv.invitation_sent_at || inv.created_at || 0).getTime();
        const matching = lists.flat()
          .filter((inv: any) =>
            (!source || inv.invite_source === source) && matchesInviteResultFilter(inv, displayInviteScore(inv), resultFilter))
          .sort((a: any, b: any) => sentAt(b) - sentAt(a));
        const totalPages = Math.max(1, Math.ceil(matching.length / INVITATION_PAGE_SIZE));
        const safePage = Math.min(page, totalPages);
        setInvitations(matching.slice((safePage - 1) * INVITATION_PAGE_SIZE, safePage * INVITATION_PAGE_SIZE));
        setInvitationTotal(matching.length);
        setInvitationTotalPages(totalPages);
        if (safePage !== page) setInvitationPage(safePage);
        return;
      }
      if (source || resultFilter) {
        const all = await aiInterviewService.getConfigInvitations(configId, {
          search: filters.search.trim() || undefined,
          status: filters.status !== 'all' ? filters.status : undefined,
          invite_date_from: filters.dateFrom || undefined,
          invite_date_to: filters.dateTo || undefined,
          page: 1,
          page_size: 1000,
        });
        const matching = (all.items || []).filter((inv: any) =>
          (!source || inv.invite_source === source) && matchesInviteResultFilter(inv, displayInviteScore(inv), resultFilter));
        const totalPages = Math.max(1, Math.ceil(matching.length / INVITATION_PAGE_SIZE));
        const safePage = Math.min(page, totalPages);
        setInvitations(matching.slice((safePage - 1) * INVITATION_PAGE_SIZE, safePage * INVITATION_PAGE_SIZE));
        setInvitationTotal(matching.length);
        setInvitationTotalPages(totalPages);
        if (safePage !== page) setInvitationPage(safePage);
        return;
      }
      const result = await aiInterviewService.getConfigInvitations(configId, {
        search: filters.search.trim() || undefined,
        status: filters.status !== 'all' ? filters.status : undefined,
        invite_date_from: filters.dateFrom || undefined,
        invite_date_to: filters.dateTo || undefined,
        page,
        page_size: INVITATION_PAGE_SIZE,
        /* Deliberately NOT compact. The compact payload drops `ai_evaluation`,
           and the Score column reads the Match Score out of it — without the
           evaluation every row fell through to a different field and showed a
           number that disagreed with the candidate's Evaluation Report. The
           two count-only calls in loadInvitationOverview stay compact: they
           ask for page_size 1 and use nothing but the totals.
           The Job Details tracker has always fetched these rows non-compact,
           which is why its Score column was already right. */
      });
      setInvitations(result.items);
      setInvitationTotal(result.total);
      setInvitationTotalPages(Math.max(1, result.total_pages || 1));
      if (result.items.length === 0 && result.total > 0 && page > 1) {
        setInvitationPage((current) => Math.min(current - 1, Math.max(1, result.total_pages || 1)));
      }
    } catch (error) {
      console.error('Failed to load invitations:', error);
      toast.error('Failed to load invitations');
    } finally {
      setLoadingInvitations(false);
    }
  }, []);

  // Shared refetch used after Resend/Revoke/Edit so the list + stat cards
  // reflect the new status immediately.
  const refreshInvitationsView = useCallback(async (configId: string) => {
    await Promise.all([
      loadInvitations(configId, invitationPage, inviteFilters, trackerSourceFilter, trackerResultFilter),
      loadInvitationOverview(configId),
    ]);
  }, [loadInvitations, loadInvitationOverview, invitationPage, inviteFilters, trackerSourceFilter, trackerResultFilter]);

  /* Invitation Status tab — one getConfigInvitations() per config (draft,
     published and archived alike, so nothing invited from an archived
     interview silently drops out), fanned out in parallel and merged with
     each row stamped with the config it came from. Unfiltered on the
     request: the stat cards must keep counting the whole set while the
     table is narrowed, so narrowing happens client-side over these rows —
     same rule the Assessments page's own cross-assessment tab follows. */
  const loadAllInviteStatuses = useCallback(async () => {
    setIsLoadingInviteStatus(true);
    setInviteStatusError(null);
    try {
      const allConfigs = [...configs, ...archivedConfigs];
      if (allConfigs.length === 0) {
        setInviteStatusRows([]);
        return;
      }
      /* Interview version — a config stores no number of its own, so it is
         the Nth config created against its job version (`jd_id`), oldest
         first: the same derivation the All Interviews table uses, so a V2
         here is the V2 there. Computed over every config, whatever its
         status, so the number can't shift with what is loaded. */
      const interviewVersionById = new Map<string, number>();
      const byJobVersion = new Map<string, typeof allConfigs>();
      allConfigs.forEach((config) => {
        if (!config.jd_id) return;
        const bucket = byJobVersion.get(config.jd_id);
        if (bucket) bucket.push(config);
        else byJobVersion.set(config.jd_id, [config]);
      });
      byJobVersion.forEach((bucket) => {
        bucket
          .slice()
          .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime())
          .forEach((config, index) => interviewVersionById.set(config.id, index + 1));
      });

      const perConfig = await Promise.all(
        allConfigs.map(async (config) => {
          try {
            const probe = await aiInterviewService.getConfigInvitations(config.id, { page: 1, page_size: 1 });
            if (!probe.total) return [];
            const full = probe.total > probe.items.length
              ? await aiInterviewService.getConfigInvitations(config.id, { page: 1, page_size: probe.total })
              : probe;
            return full.items.map((inv) => ({
              ...inv,
              _config_id: config.id,
              _config_title: config.jd_title || config.position || 'Untitled',
              _jd_id: config.jd_id,
              _jd_short_id: config.jd_short_id,
              _jd_version: config.jd_version ?? 1,
              _interview_version: interviewVersionById.get(config.id) ?? 1,
            }));
          } catch {
            // One config's invitations being unavailable must not empty the tab.
            return [];
          }
        }),
      );
      const merged = perConfig.flat();
      // Newest invite first: invitation_sent_at is the moment a recruiter cares
      // about; created_at covers a row that never made it out of the queue.
      merged.sort((a, b) =>
        new Date(b.invitation_sent_at || b.created_at || 0).getTime() -
        new Date(a.invitation_sent_at || a.created_at || 0).getTime(),
      );
      setInviteStatusRows(merged);
      // Page is NOT reset here: it's restored from the persisted snapshot when
      // coming back from a candidate / job page, and the render clamps it
      // (safePage) if the reload left fewer pages.
    } catch (err: any) {
      console.error('Failed to load invitation statuses:', err);
      setInviteStatusError(err?.message || 'Failed to load invitation statuses');
      setInviteStatusRows([]);
    } finally {
      setIsLoadingInviteStatus(false);
    }
  }, [configs, archivedConfigs]);

  useEffect(() => {
    // Also re-fires as `configs`/`archivedConfigs` finish loading (both
    // change `loadAllInviteStatuses`'s identity) — archived configs load on
    // their own delayed fetch, so without this an invite from an archived
    // interview could be missing until the tab was left and reopened.
    if (activeTab === 'invitation-status') loadAllInviteStatuses();
  }, [activeTab, loadAllInviteStatuses]);

  /* Shared by the Resend/Revoke/Edit confirms below: both the single-config
     popup (viewInvitationsConfig) and this tab can be the thing on screen
     when one of those actions completes, and each refreshes its own view. */
  const refreshAfterInviteAction = useCallback(async (configId?: string) => {
    if (viewInvitationsConfig && configId) await refreshInvitationsView(configId);
    if (activeTab === 'invitation-status') await loadAllInviteStatuses();
  }, [viewInvitationsConfig, refreshInvitationsView, activeTab, loadAllInviteStatuses]);

  /* Manual Refresh in the tracking popup — same refetch the row actions use,
     in place with no page reload. Guarded so rapid clicks (or a click while
     the popup's own load is still in flight) can't stack duplicate API calls. */
  const handleRefreshInvitations = async () => {
    if (!viewInvitationsConfig || isRefreshingInvites || loadingInvitations) return;
    setIsRefreshingInvites(true);
    try {
      /* The dialog holds the height it had for the whole request - see
         `useDialogHeightLock`. The rows staying mounted underneath (the veil
         in the body, below) is the other half of it; the pin alone would have
         nothing to hold up once released. */
      await invitesHeightLock.run(() => refreshInvitationsView(viewInvitationsConfig.id));
    } finally {
      setIsRefreshingInvites(false);
    }
  };

  const loadProctoringSettings = useCallback(async () => {
    setProctoringLoading(true);
    try {
      const { proctoringService } = await import('@/lib/services/proctoringService');
      const settings = await proctoringService.getSettings();
      setProctoringEnabled(settings.proctoring_enabled ?? false);
      setProctoringSettings({
        webcam_monitoring: settings.webcam_monitoring ?? false,
        screen_recording: settings.screen_recording ?? false,
        tab_switch_detection: settings.tab_switch_detection ?? true,
        copy_paste_prevention: settings.copy_paste_blocking ?? true,
        browser_lockdown: settings.browser_lockdown ?? false,
        ai_cheating_prevention: settings.ai_cheating_prevention ?? false,
        max_tab_switches: settings.max_tab_switches ?? 3,
        max_violations: settings.max_violations_before_flag ?? 5,
        violation_low_threshold: settings.violation_low_threshold ?? 3,
        violation_medium_threshold: settings.violation_medium_threshold ?? 8,
        retention_days: settings.recording_retention_days ?? 90,
      });
    } catch (error) {
      console.error('Failed to load proctoring settings:', error);
    } finally {
      setProctoringLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Restore/persist the list's view state + scroll position so returning from
  // an Interview Details page lands the user exactly where they left off.
  // Re-detect the scroll container when the two-step view flips (its height
  // changes drastically between the cards overview and the list).
  const rootRef = useScrollRestoration('ai-interviews', !loading, [pageView]);
  useListStatePersistence(
    'ai-interviews',
    { activeTab, invitedOnly, modeFilter, searchQuery, sortBy,
      creatorFilter, dateFilter, customDateFrom, customDateTo,
      configListPage, configListItemsPerPage, processingPage, processingItemsPerPage,
      openVersionsFor, configListViewMode, expandedJobVersionsByJob,
      // Invitation Status tab — its page, page size and filters, so coming
      // back from a candidate or job lands on the same page, not page 1.
      inviteStatusPage, inviteStatusItemsPerPage, inviteStatusFilters, inviteStatusColumnFilters,
      // The cards<->list drill-in. Without it the tab, filters and page were
      // all restored but pageView fell back to 'cards', so returning from an
      // interview page showed only the stat tiles — the list looked gone.
      pageView },
    (s) => {
      /* The values this restore is about to apply to the page-reset effect's
         dependencies — that effect skips the one change they cause, so the
         restored page survives (it used to be reset to 1 straight away). */
      const restoredKey = listFilterKey({
        activeTab: typeof s.activeTab === 'string' && s.activeTab !== 'consent' ? s.activeTab : activeTab,
        invitedOnly: typeof s.invitedOnly === 'boolean' ? s.invitedOnly : invitedOnly,
        modeFilter: typeof s.modeFilter === 'string' ? s.modeFilter : modeFilter,
        searchQuery: typeof s.searchQuery === 'string' ? s.searchQuery : searchQuery,
        sortBy: typeof s.sortBy === 'string' ? s.sortBy : sortBy,
        creatorFilter: typeof s.creatorFilter === 'string' ? s.creatorFilter : creatorFilter,
        dateFilter: typeof s.dateFilter === 'string' ? s.dateFilter : dateFilter,
        customDateFrom: typeof s.customDateFrom === 'string' ? s.customDateFrom : customDateFrom,
        customDateTo: typeof s.customDateTo === 'string' ? s.customDateTo : customDateTo,
      });
      // Only when the restore changes one of them — otherwise no render
      // follows to consume the skip, and it would swallow a real change.
      const currentKey = listFilterKey({ activeTab, invitedOnly, modeFilter, searchQuery, sortBy, creatorFilter, dateFilter, customDateFrom, customDateTo });
      restoredListKeyRef.current = restoredKey !== currentKey ? restoredKey : null;
      if (s.pageView === 'cards' || s.pageView === 'list') setPageView(s.pageView);
      // 'consent' tab was removed — never restore onto it.
      if (typeof s.activeTab === 'string' && s.activeTab !== 'consent') setActiveTab(s.activeTab as TabKey);
      if (typeof s.invitedOnly === 'boolean') setInvitedOnly(s.invitedOnly);
      if (typeof s.openVersionsFor === 'string') setOpenVersionsFor(s.openVersionsFor);
      if (s.expandedJobVersionsByJob && typeof s.expandedJobVersionsByJob === 'object') {
        const restored: Record<string, number[]> = {};
        for (const [jdId, versions] of Object.entries(s.expandedJobVersionsByJob as Record<string, unknown>)) {
          if (Array.isArray(versions)) restored[jdId] = versions.filter((v): v is number => typeof v === 'number');
        }
        setExpandedJobVersionsByJob(restored);
      }
      if (typeof s.modeFilter === 'string') setModeFilter(s.modeFilter as typeof modeFilter);
      if (typeof s.searchQuery === 'string') setSearchQuery(s.searchQuery);
      if (typeof s.sortBy === 'string') setSortBy(s.sortBy as typeof sortBy);
      if (typeof s.creatorFilter === 'string') setCreatorFilter(s.creatorFilter);
      if (typeof s.dateFilter === 'string') setDateFilter(s.dateFilter as DateFilterKey);
      if (typeof s.customDateFrom === 'string') setCustomDateFrom(s.customDateFrom);
      if (typeof s.customDateTo === 'string') setCustomDateTo(s.customDateTo);
      if (typeof s.configListPage === 'number') setConfigListPage(s.configListPage);
      if (typeof s.configListItemsPerPage === 'number') setConfigListItemsPerPage(s.configListItemsPerPage);
      if (typeof s.processingPage === 'number') setProcessingPage(s.processingPage);
      if (typeof s.processingItemsPerPage === 'number') setProcessingItemsPerPage(s.processingItemsPerPage);
      if (s.configListViewMode === 'grouped' || s.configListViewMode === 'ungrouped') setConfigListViewMode(s.configListViewMode);
      if (s.inviteStatusFilters && typeof s.inviteStatusFilters === 'object') setInviteStatusFilters({ ...EMPTY_INVITE_FILTERS, ...s.inviteStatusFilters });
      if (s.inviteStatusColumnFilters && typeof s.inviteStatusColumnFilters === 'object') setInviteStatusColumnFilters({ ...EMPTY_INVITE_COLUMN_FILTERS, ...s.inviteStatusColumnFilters });
      if (typeof s.inviteStatusItemsPerPage === 'number') setInviteStatusItemsPerPage(s.inviteStatusItemsPerPage);
      if (typeof s.inviteStatusPage === 'number') setInviteStatusPage(s.inviteStatusPage);
    },
  );

  useEffect(() => {
    if (listScrollRequest === 0 || pageView !== 'list') return;

    const frame = window.requestAnimationFrame(() => {
      listSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [listScrollRequest, pageView, activeTab, invitedOnly]);

  useEffect(() => {
    if (consumedListViewRedirectRef.current || typeof window === 'undefined') return;
    const redirectState = sessionStorage.getItem(AI_INTERVIEWS_LIST_VIEW_REDIRECT_KEY);
    if (redirectState !== 'pending' && redirectState !== 'consumed') return;

    consumedListViewRedirectRef.current = true;
    sessionStorage.setItem(AI_INTERVIEWS_LIST_VIEW_REDIRECT_KEY, 'consumed');
    setActiveTab('all');
    setInvitedOnly(false);
    setActiveOverviewCard(null);
    setConfigListPage(1);
    setProcessingPage(1);
    setPageView('list');
    setListScrollRequest((request) => request + 1);

    const clearRedirectTimer = window.setTimeout(() => {
      if (sessionStorage.getItem(AI_INTERVIEWS_LIST_VIEW_REDIRECT_KEY) === 'consumed') {
        sessionStorage.removeItem(AI_INTERVIEWS_LIST_VIEW_REDIRECT_KEY);
      }
    }, 1000);

    return () => window.clearTimeout(clearRedirectTimer);
  }, []);

  useEffect(() => {
    if (activeTab === 'settings') {
      loadSettings();
      if (settingsSubTab === 'proctoring') loadProctoringSettings();
    }
    // 'all' now includes archived configs too, so load them for that tab as well.
    // Invitation Status spans every config too — an invite sent before its
    // interview was archived must not silently drop out of the aggregate.
    if (activeTab === 'archived' || activeTab === 'all' || activeTab === 'invitation-status') loadArchivedConfigs();
    if (activeTab === 'audit') loadAuditTrail();
    if (activeTab === 'processing') loadProcessingSessions();
  }, [activeTab, loadSettings, loadArchivedConfigs, loadAuditTrail, loadProcessingSessions, settingsSubTab, loadProctoringSettings, auditCategory, auditPage]);

  useEffect(() => {
    if (!viewInvitationsConfig) return;
    loadInvitations(viewInvitationsConfig.id, invitationPage, inviteFilters, trackerSourceFilter, trackerResultFilter);
  }, [viewInvitationsConfig, trackerJobScope, trackerJobVersionFilter, trackerVersionFilter, invitationPage, inviteFilters, trackerSourceFilter, trackerResultFilter, loadInvitations]);

  // Bulk-revoke selection is scoped to the current invitations page — clear it
  // whenever the page, filters, or the open config changes so a stale selection
  // from a different page/filter set can't be carried into a revoke action.
  useEffect(() => {
    setSelectedInviteIds(new Set());
  }, [viewInvitationsConfig, invitationPage, inviteFilters, trackerSourceFilter, trackerResultFilter]);

  // Same rule for the Invitation Status tab: a new filter or a reload is a new
  // list, so a selection made on the old one is dropped.
  useEffect(() => {
    setSelectedStatusInviteIds(new Set());
  }, [inviteStatusFilters, inviteStatusColumnFilters, inviteStatusRows]);

  useEffect(() => {
    if (!viewInvitationsConfig) return;
    loadInvitationOverview(viewInvitationsConfig.id);
  }, [viewInvitationsConfig, trackerJobScope, loadInvitationOverview]);

  /* Dismiss the 3-dot menu — the card's own in-flow menu (`menuRef`) and the
     version panel's portalled compact menu (`versionMenuRef`) share one open id,
     so one handler closes whichever is up. A click inside either menu, or on a
     version-menu trigger (which toggles itself — closing here first would let its
     own click reopen it), is left alone; anything else closes it. The portalled
     menu is `fixed` and placed from a one-off rect, so a scroll or resize would
     leave it floating away from its row — both close it, the scroll listener in
     the capture phase so it catches scrolling inside the panel's own container,
     not just the page. */
  useEffect(() => {
    if (!openMenuId) return;
    const close = () => setOpenMenuId(null);
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (menuRef.current?.contains(target as Node)) return;
      if (versionMenuRef.current?.contains(target as Node)) return;
      if (target instanceof Element && target.closest('[data-ai-version-menu-trigger]')) return;
      close();
    };
    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [openMenuId]);

  const handleDeleteConfig = (config: AIInterviewResponse) => {
    // Prevent deletion if candidates have started
    if (config.invitations_count && config.invitations_count > 0) {
      toast.error('Cannot delete — candidates have already started this interview');
      setOpenMenuId(null);
      return;
    }
    // Close the 3-dot menu the instant the confirm opens — otherwise both sit
    // on screen at once until the delete call resolves.
    setOpenMenuId(null);
    if (config.jd_id) jdLineage.ensureLoaded(config.jd_id, config.jd_id);
    setDeleteTarget(config);
  };

  const confirmDeleteConfig = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await aiInterviewService.delete(deleteTarget.id);
      toast.success('Configuration deleted');
      loadData();
      setRefreshSignal((n) => n + 1);
      setDeleteTarget(null);
    } catch (error) {
      console.error('Failed to delete:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete configuration');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handlePublishConfig = async (config: AIInterviewResponse) => {
    try {
      await aiInterviewService.publishConfig(config.id);
      toast.success('Configuration published!');
      loadData();
    } catch (error) {
      console.error('Failed to publish:', error);
      toast.error('Failed to publish configuration');
    }
    setOpenMenuId(null);
  };

  /* The Job Version / Interview Version columns and filters describe which
     version a tracker is for. They show when the tracker is opened from a
     job's own row on Total Jobs; opened from a version row they are hidden,
     since the row that was clicked already names the version. */
  const handleViewInvitations = async (
    config: AIInterviewResponse,
    showVersionDetails = false,
    jobScope: TrackerScopeEntry[] | null = null,
  ) => {
    setTrackerShowVersions(showVersionDetails);
    /* Set on every open (null for one interview). Not cleared on close: the
       Send Invite round trip reopens this same tracker directly and must keep it. */
    setTrackerJobScope(jobScope && jobScope.length > 0 ? jobScope : null);
    /* Loading from the very first paint. The effect that fetches the rows runs
       AFTER the popup's first render, so without this the body showed "No
       candidates invited yet" for one frame - wrong, and a third height for
       the dialog to pass through on the way in: empty state, then spinner,
       then table. Declaring the load here collapses that to one. */
    setLoadingInvitations(true);
    /* And start from no rows. They are deliberately NOT cleared on close - the
       candidate detail view steps Prev/Next through this same list after the
       popup has gone - so without this, opening the tracker for a DIFFERENT
       config rendered the previous one's candidates until the fetch returned,
       at the previous one's height. */
    setInvitations([]);
    setViewInvitationsConfig(config);
    setInviteFilters(EMPTY_INVITE_FILTERS);
    setTrackerJobVersionFilter('');
    setTrackerVersionFilter('');
    setTrackerSourceFilter('');
    setTrackerResultFilter('');
    setInvitationPage(1);
    setOpenMenuId(null);
  };

  const handleViewCandidateDetail = async (candidateId: string) => {
    setCandidateDetailLoading(true);
    setViewInvitationsConfig(null);
    try {
      const detail = await aiInterviewService.get(candidateId);
      setCandidateDetailFromModal(detail);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load candidate details');
    } finally {
      setCandidateDetailLoading(false);
    }
  };

  const handleArchiveConfig = (config: AIInterviewResponse) => {
    // Close the 3-dot menu the instant the confirm opens — otherwise both sit
    // on screen at once until the archive call resolves.
    setOpenMenuId(null);
    setArchiveTarget(config);
  };

  const confirmArchiveConfig = async () => {
    if (!archiveTarget) return;
    setArchiveLoading(true);
    try {
      await aiInterviewService.archive(archiveTarget.id);
      toast.success('Configuration archived');
      await Promise.all([loadData(), loadArchivedConfigs()]);
      setRefreshSignal((n) => n + 1);
      setArchiveTarget(null);
    } catch (error: any) {
      toast.error(error.message || 'Failed to archive');
    } finally {
      setArchiveLoading(false);
    }
  };

  const handleUnarchiveConfig = async (config: AIInterviewResponse) => {
    try {
      const restored = await aiInterviewService.unarchive(config.id);
      toast.success(
        restored.status === 'draft'
          ? 'Configuration restored to Draft'
          : 'Configuration restored to Active'
      );
      loadData();
      loadArchivedConfigs();
      setRefreshSignal((n) => n + 1);
    } catch (error: any) {
      toast.error(error.message || 'Failed to unarchive');
    }
    setOpenMenuId(null);
  };

  const handleCloneConfig = async (config: AIInterviewResponse) => {
    try {
      const result = await aiInterviewService.clone(config.id);
      toast.success(`Configuration duplicated: ${result.cloned_title}`);
      loadData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to duplicate');
    }
    setOpenMenuId(null);
  };

  const handleCopyLink = async (config: AIInterviewResponse) => {
    if (config.interview_link) {
      const fullLink = `${window.location.origin}${config.interview_link}`;
      await navigator.clipboard.writeText(fullLink);
      toast.success('Interview link copied to clipboard');
    }
    setOpenMenuId(null);
  };

  const handleSaveSettings = async () => {
    try {
      const result = await aiInterviewService.saveSettings({
        default_duration: settingsDuration,
        ai_voice_language: settingsLanguage,
        auto_record: settingsAutoRecord,
        send_reminders: settingsReminders,
        ai_sentiment_analysis: settingsSentiment,
      });
      setSettings(result);
      toast.success('Settings saved!');
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error('Failed to save settings');
    }
  };

  const handleSaveProctoringSettings = async () => {
    try {
      const { proctoringService } = await import('@/lib/services/proctoringService');
      await proctoringService.updateSettings({
        proctoring_enabled: proctoringEnabled,
        webcam_monitoring: proctoringSettings.webcam_monitoring,
        screen_recording: proctoringSettings.screen_recording,
        tab_switch_detection: proctoringSettings.tab_switch_detection,
        copy_paste_blocking: proctoringSettings.copy_paste_prevention,
        browser_lockdown: proctoringSettings.browser_lockdown,
        ai_cheating_prevention: proctoringSettings.ai_cheating_prevention,
        max_tab_switches: proctoringSettings.max_tab_switches,
        max_violations_before_flag: proctoringSettings.max_violations,
        violation_low_threshold: proctoringSettings.violation_low_threshold,
        violation_medium_threshold: proctoringSettings.violation_medium_threshold,
        recording_retention_days: proctoringSettings.retention_days,
      });
      toast.success('Proctoring settings saved!');
    } catch (error) {
      console.error('Failed to save proctoring settings:', error);
      toast.error('Failed to save proctoring settings');
    }
  };

  // Candidate-flow statuses should never appear on config cards; treat them as 'published'
  const normalizeConfigStatus = (status: string) => {
    const candidateFlowStatuses = ['invited', 'consent_pending', 'system_check', 'in_progress', 'scheduled'];
    return candidateFlowStatuses.includes(status) ? 'published' : status;
  };

  // Job Details Quick Actions deep-link here so they can reuse the existing
  // create, share, and invitation status flows for the selected JD.
  useEffect(() => {
    const action = searchParams.get('action');
    if (
      action !== 'create-ai-interview' &&
      action !== 'invite-ai-interview' &&
      action !== 'ai-interview-status'
    ) {
      return;
    }

    const jdId = searchParams.get('jd_id') || searchParams.get('jdId') || searchParams.get('jobId');
    const actionKey = `${action}:${jdId || ''}`;

    if (handledQuickActionRef.current === actionKey) return;

    if (!jdId) {
      handledQuickActionRef.current = actionKey;
      toast.error('Job description is missing for this AI interview action.');
      router.replace('/recruitment/ai-interviews', { scroll: false });
      return;
    }

    if (loading) return;

    handledQuickActionRef.current = actionKey;

    const clearQuickActionUrl = () => {
      router.replace('/recruitment/ai-interviews', { scroll: false });
    };

    if (!aiInterviewAvailable) {
      toast.error('AI Interviews module is not enabled for your organization.');
      clearQuickActionUrl();
      return;
    }

    const activeConfigs = configs.filter((config) => config.jd_id === jdId);
    const archivedMatches = archivedConfigs.filter(
      (config) => config.jd_id === jdId && !activeConfigs.some((active) => active.id === config.id),
    );
    const jdConfigs = [...activeConfigs, ...archivedMatches];
    const publishedConfig = jdConfigs.find(
      (config) => normalizeConfigStatus(config.status) === 'published' && config.status !== 'archived',
    );
    const draftConfig = jdConfigs.find((config) => config.status === 'draft');
    const fallbackConfig = publishedConfig || draftConfig || jdConfigs.find((config) => config.status !== 'archived') || jdConfigs[0] || null;

    if (action === 'create-ai-interview') {
      if (!canCreateAIInterviews) {
        toast.error('You do not have permission to create AI interviews.');
        clearQuickActionUrl();
        return;
      }

      if (publishedConfig) {
        toast.info('An AI interview already exists for this job.');
        router.push(`/recruitment/ai-interviews/${publishedConfig.id}`);
        return;
      }

      // Preserve where the quick action was launched from (e.g. from=job-details)
      // so the config flow can keep its breadcrumb anchored to the JD.
      const originParam = searchParams.get('from') === 'job-details' ? '&from=job-details' : '';

      if (draftConfig && canUpdateAIInterviews) {
        router.push(`/recruitment/ai-interviews/jd-selection/ai-interview-config?jd_id=${encodeURIComponent(jdId)}&config_id=${encodeURIComponent(draftConfig.id)}${originParam}`);
        return;
      }

      router.push(`/recruitment/ai-interviews/jd-selection/ai-interview-config?jd_id=${encodeURIComponent(jdId)}${originParam}`);
      return;
    }

    setActiveTab('published');
    setInvitedOnly(false);
    setActiveOverviewCard(null);
    setSearchQuery('');
    setConfigListPage(1);
    setProcessingPage(1);
    setPageView('list');
    setListScrollRequest((request) => request + 1);

    if (!fallbackConfig || !publishedConfig) {
      toast.error('Create and publish an AI interview for this job before inviting candidates or tracking status.');
      clearQuickActionUrl();
      return;
    }

    if (action === 'invite-ai-interview') {
      if (!canShareAIInterviews && !canInviteAIInterviews) {
        toast.error('You do not have permission to invite candidates to AI interviews.');
        clearQuickActionUrl();
        return;
      }

      setShareConfig(publishedConfig);
      clearQuickActionUrl();
      return;
    }

    if (!canViewAIInterviews && !canInviteAIInterviews) {
      toast.error('You do not have permission to view AI interview status.');
      clearQuickActionUrl();
      return;
    }

    // A deep link names a job, not a version — the job row's view.
    handleViewInvitations(publishedConfig, true);
    clearQuickActionUrl();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    searchParams,
    loading,
    configs,
    archivedConfigs,
    aiInterviewAvailable,
    canCreateAIInterviews,
    canUpdateAIInterviews,
    canShareAIInterviews,
    canInviteAIInterviews,
    canViewAIInterviews,
    router,
  ]);

  // Deep-link from the "AI Interview Published" screen (and its Back-button
  // redirect): `?tab=all-interviews` lands directly on the flat interview
  // list instead of whatever tab/view was last persisted, so the
  // `?highlight=<id>` AllInterviewsTable reads next actually has a table
  // visible to scroll within.
  // `?tab=candidate-results` likewise — the candidate result page's crumb and
  // Back return there when the result was opened from that tab.
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab !== 'all-interviews' && tab !== 'candidate-results') return;
    setPageView('list');
    setActiveTab(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // List of unique creators across configs + archivedConfigs — drives the creator dropdown.
  const creatorOptions = (() => {
    const set = new Set<string>();
    for (const c of [...configs, ...archivedConfigs]) {
      const name = (c.created_by_name || '').trim();
      if (name) set.add(name);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  })();

  // Compute the [start, end) date window for the active date filter.
  // Returns `null` when no date filter is active (or 'custom' has no valid input).
  const dateWindow = (() => {
    if (dateFilter === 'all') return null;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (dateFilter === 'today') {
      const end = new Date(startOfToday); end.setDate(end.getDate() + 1);
      return { from: startOfToday, to: end };
    }
    if (dateFilter === 'yesterday') {
      const start = new Date(startOfToday); start.setDate(start.getDate() - 1);
      return { from: start, to: startOfToday };
    }
    if (dateFilter === 'last_week') {
      const start = new Date(startOfToday); start.setDate(start.getDate() - 7);
      const end = new Date(startOfToday); end.setDate(end.getDate() + 1);
      return { from: start, to: end };
    }
    if (dateFilter === 'last_month') {
      const start = new Date(startOfToday); start.setDate(start.getDate() - 30);
      const end = new Date(startOfToday); end.setDate(end.getDate() + 1);
      return { from: start, to: end };
    }
    // custom: both ends required; treat 'to' as inclusive end-of-day
    if (!customDateFrom || !customDateTo) return null;
    const from = new Date(customDateFrom + 'T00:00:00');
    const to = new Date(customDateTo + 'T00:00:00');
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
    to.setDate(to.getDate() + 1); // inclusive end-of-day → strict-less-than tomorrow
    return { from, to };
  })();

  // Filter configs by tab + mode + creator + date + search
  const filteredConfigs = (() => {
    const base = activeTab === 'archived'
      ? archivedConfigs
      : activeTab === 'all'
        // "All" means all — non-archived + archived, deduped by id so a config
        // can't appear twice if the two lists ever overlap.
        ? (() => {
            const seen = new Set(configs.map((c) => c.id));
            return [...configs, ...archivedConfigs.filter((a) => !seen.has(a.id))];
          })()
        : configs.filter((config) => {
            if (activeTab === 'published') return normalizeConfigStatus(config.status) === 'published';
            if (activeTab === 'draft') return config.status === 'draft';
            if (activeTab === 'completed') return config.status === 'completed' || config.status === 'cancelled';
            return true;
          });
    const byInvited = invitedOnly
      ? base.filter((config) => (config.invitations_count ?? 0) > 0)
      : base;
    const byMode = modeFilter === 'all' ? byInvited : byInvited.filter((config) => {
      // Single source of truth for mode: special_instructions.interview_mode.
      const mode = modeFromConfig(config.special_instructions, config.duration_minutes);
      return modeFilter === 'timed' ? mode === 'fixed' : mode === 'flexible';
    });
    const byCreator = creatorFilter === 'all'
      ? byMode
      : byMode.filter((c) => (c.created_by_name || '').trim() === creatorFilter);
    const byDate = dateWindow
      ? byCreator.filter((c) => {
          if (!c.created_at) return false;
          const t = new Date(c.created_at).getTime();
          if (Number.isNaN(t)) return false;
          return t >= dateWindow.from.getTime() && t < dateWindow.to.getTime();
        })
      : byCreator;
    const q = searchQuery.trim().toLowerCase();
    const bySearch = q
      ? byDate.filter((c) => {
          const haystack = [
            c.jd_title,
            c.position,
            c.display_id,
            c.jd_short_id,
            c.created_by_name,
            ...(Array.isArray(c.jd_must_have_skills) ? c.jd_must_have_skills : []),
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return haystack.includes(q);
        })
      : byDate;
    const sorted = [...bySearch].sort((a, b) => {
      if (sortBy === 'active') {
        const aw = normalizeConfigStatus(a.status) === 'published' ? 0 : 1;
        const bw = normalizeConfigStatus(b.status) === 'published' ? 0 : 1;
        if (aw !== bw) return aw - bw;
      } else if (sortBy === 'draft') {
        const aw = a.status === 'draft' ? 0 : 1;
        const bw = b.status === 'draft' ? 0 : 1;
        if (aw !== bw) return aw - bw;
      }
      const at = new Date(a.created_at || 0).getTime();
      const bt = new Date(b.created_at || 0).getTime();
      return sortBy === 'oldest' ? at - bt : bt - at;
    });
    return sorted;
  })();

  /**
   * One card per INTERVIEW, not one per version — the Assessments Job List's
   * `collapseByLineage`, applied to interview configs.
   *
   * An interview duplicated or re-authored across a job's republishes used to
   * put several cards on this list, each repeating the same Job ID and title.
   * Only the currently ACTIVE version is listed now; the rest live behind that
   * card's View Versions button, which reads the lineage unfiltered and so still
   * shows every version whatever its status.
   *
   * The lineage is the JOB, keyed on `jd_short_id` ("JD-014") — the one field
   * every version of a job shares (`jd_id` identifies a single job VERSION, which
   * is the thing a job's versions differ by, so it would put one card per version
   * back on the page). A config with neither id is its own lineage, so unrelated
   * interviews with a missing field do not pile into one bucket.
   *
   * The representative is chosen exactly as the Assessment list chooses it: a
   * DRAFT never represents a lineage that has a non-draft version (this is what
   * keeps the main list still when a version is duplicated into a new draft),
   * then the newest JOB version, then — since a config carries no stored version
   * number of its own — the most recently created config within that job version.
   *
   * Map insertion order is first-appearance in the already-sorted
   * `filteredConfigs`, so collapsing narrows the list without reshuffling it.
   */
  // Shared with the details page's Prev / Next (lib/utils/aiInterviewJobOrder).
  const collapsedConfigs = collapseAIInterviewLineages(filteredConfigs);

  /* Which list the details page's Prev / Next walk — the list on screen:
       Grouped (Total Jobs, and Active / Draft / Archived Grouped): its jobs,
         one stop per job, so the counter reads the job count shown here;
       Ungrouped (All Interviews, and Active / Draft / Archived Ungrouped): its
         interviews, every version a stop, so it reads that table's row count.
     The ungrouped tables hand over their own row order (AllInterviewsTable);
     the grouped list hands over its jobs below. Any other tab keeps the plain
     URL — every interview, as before. */
  const GROUPED_PAGER_LIST: Partial<Record<TabKey, AIInterviewPagerList>> = {
    all: 'total-jobs',
    published: 'active-jobs',
    draft: 'draft-jobs',
    archived: 'archived-jobs',
  };
  const UNGROUPED_PAGER_LIST: Partial<Record<TabKey, AIInterviewPagerList>> = {
    'all-interviews': 'all-interviews',
    published: 'active',
    draft: 'draft',
    archived: 'archived',
  };
  const currentPagerList = (): AIInterviewPagerList | undefined =>
    activeTab === 'all-interviews' || showUngroupedList
      ? UNGROUPED_PAGER_LIST[activeTab]
      : GROUPED_PAGER_LIST[activeTab];
  const interviewDetailsHref = (id: string, tab?: string) => {
    const params = new URLSearchParams();
    if (tab) params.set('tab', tab);
    const pagerList = currentPagerList();
    if (pagerList) params.set('list', pagerList);
    const query = params.toString();
    return `/recruitment/ai-interviews/${id}${query ? `?${query}` : ''}`;
  };

  /* ── Job List row figures (the Assessments Total Jobs row, for interviews) ──
     Bucketed by the same lineage key the list collapses by, and summed over
     `filteredConfigs` so a row's figures describe what the tab and filters
     currently select. */
  const configLineageKeyOf = (c: AIInterviewResponse) =>
    c.jd_short_id || c.jd_id || `__unlinked__:${c.id}`;
  const jobRowTotals = new Map<string, { interviews: number; active: number; invitations: number; completed: number; completedKnown: boolean }>();
  for (const config of filteredConfigs) {
    const key = configLineageKeyOf(config);
    const entry = jobRowTotals.get(key) ?? { interviews: 0, active: 0, invitations: 0, completed: 0, completedKnown: true };
    entry.interviews += 1;
    if (normalizeConfigStatus(config.status) === 'published') entry.active += 1;
    entry.invitations += invitationTotals[config.id] ?? config.invitations_count ?? 0;
    // Completed candidates — known only once every interview's count landed.
    if (typeof completedCounts[config.id] === 'number') entry.completed += completedCounts[config.id];
    else entry.completedKnown = false;
    jobRowTotals.set(key, entry);
  }

  /** Fetch each given interview's invitation summary, once — the same
   *  unfiltered page_size-1 call the Track popup uses for its cards, so
   *  Invitations Sent (`total`) and Completed (`completed`) read the same
   *  numbers there and here. */
  const requestCompletedCounts = (list: AIInterviewResponse[]) => {
    list.forEach((c) => {
      if (completedCountsRequested.current.has(c.id)) return;
      completedCountsRequested.current.add(c.id);
      aiInterviewService.getConfigInvitations(c.id, { page: 1, page_size: 1 })
        .then((res) => {
          setCompletedCounts((prev) => ({ ...prev, [c.id]: res.completed || 0 }));
          setInvitationTotals((prev) => ({ ...prev, [c.id]: res.total || 0 }));
        })
        .catch(() => { completedCountsRequested.current.delete(c.id); });
    });
  };
  /**
   * How many versions this job has — the figure beside Layers on the row, and
   * it must equal the "Job Versions (N)" heading of the panel that opens under
   * it.
   *
   * It used to fall back to `max(jd_version)` across the loaded configs, which
   * is the highest version NUMBER rather than a count: a job whose V1 was
   * deleted, or whose interviews were all authored against V3, reported 3 while
   * the panel listed fewer. And the lineage it preferred was only there once a
   * panel had been opened, so the same row could answer differently before and
   * after a click.
   *
   * /jd/version-counts answers it for every job on the page in one request.
   * `active` excludes Draft versions — the panel is given
   * `hideDraftJobVersions` below, so the two agree. The loaded lineage,
   * filtered the same way, covers the moment before that lands.
   */
  const getJobVersionCount = (config: AIInterviewResponse) => {
    const counts = config.jd_id ? jdLineage.versionCounts[config.jd_id] : undefined;
    if (counts) return counts.active;

    const fetched = config.jd_id ? jdLineage.lineages[config.jd_id] : undefined;
    if (fetched?.length) {
      const visible = fetched.filter(
        (row) => jobVersionDisplayStatus(row.status, row.current_version) !== 'Draft',
      );
      return visible.length || fetched.length;
    }
    /* Nothing authoritative yet: one version is the only honest floor — a
       version NUMBER is not a count, which is what the old fallback got wrong. */
    return 1;
  };
  /** The job's most-invited interview — what the row's Track opens. */
  const getJobTrackTarget = (config: AIInterviewResponse) => {
    const key = configLineageKeyOf(config);
    let best: AIInterviewResponse | null = null;
    for (const c of [...configs, ...archivedConfigs]) {
      if (configLineageKeyOf(c) !== key) continue;
      if (!best || (c.invitations_count ?? 0) > (best.invitations_count ?? 0)) best = c;
    }
    return best;
  };

  /** Every job this tenant has an interview for, before tab and filters. */
  const allJobsCount = new Set(
    [...configs, ...archivedConfigs].map((c) => c.jd_short_id || c.jd_id || `__unlinked__:${c.id}`),
  ).size;

  const configTotalPages = Math.max(1, Math.ceil(collapsedConfigs.length / configListItemsPerPage));
  const paginatedConfigs = collapsedConfigs.slice(
    (configListPage - 1) * configListItemsPerPage,
    configListPage * configListItemsPerPage,
  );

  /* The job cards' Completed figure: completed-session counts for every
     interview in the lineage of each job ON THIS PAGE — fetched as the page
     comes into view, each interview once, so paging never re-asks. */
  const visibleLineageKeys = [...new Set(paginatedConfigs.map(configLineageKeyOf))].join('|');
  useEffect(() => {
    if (!visibleLineageKeys) return;
    const keys = new Set(visibleLineageKeys.split('|'));
    requestCompletedCounts([...configs, ...archivedConfigs].filter((c) => keys.has(configLineageKeyOf(c))));
    /* The authoritative "Job Versions" figure for the jobs on this page, in ONE
       request — so the row prints the same number whether or not its version
       panel has ever been opened. See getJobVersionCount. */
    jdLineage.ensureVersionCounts(
      paginatedConfigs.map((c) => c.jd_id).filter((id): id is string => !!id),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleLineageKeys, configs, archivedConfigs]);
  /* ── View Versions: interview configs as the version panel's child rows ──
     The panel joins a child to a job version on `jd_id` — every job version is
     a JD row of its own, so that id names one version exactly. Configs are
     bucketed by it here once per render rather than scanned per version. Both
     lists, because archiving an interview does not unmake the version it was
     authored against. */
  const configsByJobVersionId = useMemo(() => {
    const byJobVersion = new Map<string, AIInterviewResponse[]>();
    for (const config of [...configs, ...archivedConfigs]) {
      if (!config.jd_id) continue;
      const bucket = byJobVersion.get(config.jd_id);
      if (bucket) bucket.push(config);
      else byJobVersion.set(config.jd_id, [config]);
    }
    return byJobVersion;
  }, [configs, archivedConfigs]);

  /**
   * One interview config in the shape the version panel reads.
   *
   * `version` is the ORDINAL within its job version, oldest first — the second
   * interview authored against job V3 is v2 there. Derived rather than read,
   * because an interview config carries no version number of its own; it is the
   * same rule the panel documents for assessments, whose numbers likewise
   * restart per job version, applied to the one fact this data does have.
   *
   * `completed_count` comes from `completedCounts`, fetched per interview when
   * its job's versions are opened — the list endpoint returns no
   * finished-session figure. It stays unset until then, because a zero would
   * read as "nobody finished" rather than "not counted".
   */
  const toInterviewVersionRow = (config: AIInterviewResponse, ordinal: number): AssessmentVersionRow => ({
    id: config.id,
    short_id: config.display_id,
    title: config.jd_title || config.position,
    version: ordinal,
    status: normalizeConfigStatus(config.status),
    created_at: config.created_at,
    created_by_name: config.created_by_name,
    invitations_count: invitationTotals[config.id] ?? config.invitations_count,
    // Undefined until fetched — the cell shows a dash rather than a false 0.
    completed_count: completedCounts[config.id],
    jd_id: config.jd_id,
    jd_version: config.jd_version,
  });

  /**
   * Every interview in one job's lineage, numbered per job version.
   *
   * `statusFilter`, when given, drops every row NOT in that status — applied
   * AFTER the ordinal is assigned, so a version's number still reflects its
   * true position in the full lineage rather than shifting once other
   * versions are hidden. Used by the Active/Draft/Archived tabs' "View
   * Versions" panel so it shows only that tab's own status, not every
   * version whatever its state.
   */
  const interviewVersionRows = (jdId?: string, statusFilter?: 'published' | 'draft' | 'archived'): AssessmentVersionRow[] => {
    if (!jdId) return [];
    const lineage = jdLineage.lineages[jdId];
    if (!lineage) return [];
    const rows = lineage.flatMap((jobVersion) =>
      (configsByJobVersionId.get(jobVersion.id) ?? [])
        .slice()
        .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime())
        .map((config, index) => toInterviewVersionRow(config, index + 1)),
    );
    return statusFilter ? rows.filter((row) => row.status === statusFilter) : rows;
  };

  /* A row restored open by list-state persistence was never clicked, so the
     toggle's fetch never ran and its panel would sit on a spinner forever. This
     fills the lineage once the configs themselves have landed. The loader
     no-ops on a cache hit, so re-running is free. The same effect, for the same
     reason, as the one on the Assessments list. */
  useEffect(() => {
    if (!openVersionsFor) return;
    const row = [...configs, ...archivedConfigs].find((config) => config.id === openVersionsFor);
    if (!row?.jd_id) return;
    jdLineage.ensureLoaded(row.jd_id, row.jd_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openVersionsFor, configs, archivedConfigs]);

  /* The Interview Versions table's Completed column. The list endpoint carries
     no finished-session figure, so when a job's versions are opened, each of
     its interviews asks for a page_size-1 page of completed sessions and keeps
     the total — a handful of requests, once per interview, only for the job
     being looked at. Until one lands its cell shows a dash, not a false 0. */
  useEffect(() => {
    if (!openVersionsFor) return;
    const all = [...configs, ...archivedConfigs];
    const row = all.find((config) => config.id === openVersionsFor);
    if (!row) return;
    const key = configLineageKeyOf(row);
    requestCompletedCounts(all.filter((c) => configLineageKeyOf(c) === key));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openVersionsFor, configs, archivedConfigs]);

  /* The panel's wording for this page. Everything else about it — columns,
     spacing, chips, date format, the nesting — is the Assessments page's and is
     not restated here. */
  const INTERVIEW_VOCABULARY: VersionHistoryVocabulary = {
    ...ASSESSMENT_VOCABULARY,
    childSingular: 'Interview',
    childPlural: 'Interviews',
    childVersionsHeading: 'Interview Versions',
    childNone: 'No interview',
    detailColumn: { label: 'Mode', minW: 'min-w-[130px]' },
    extraDetailColumn: { label: 'Rounds', minW: 'min-w-[170px]' },
    childCompletedColumn: true,
    statusLabel: (status?: string) => getStatusLabel(String(status ?? '')),
  };

  /**
   * One interview version's Actions cell, built to the Assessment page's own
   * template (`renderAssessmentQuickActions` + the compact `renderAssessmentMenu`):
   * the Share / Track / Result icon trio, then a portalled 3-dot menu, every
   * control the 28px bordered square so the cell reads as one cluster. The
   * ACTIONS themselves are the interview's — the same handlers the card row
   * carries — because that is what this row can actually do, exactly as the
   * child table's Rounds column swaps in for the assessment page's Round
   * Weightage.
   *
   * The menu is keyed `version:<id>`, never the bare config id: the card at the
   * top of the panel is one of these same interviews, and a shared key would
   * open both dropdowns at once.
   */
  const renderInterviewVersionActions = (config: AIInterviewResponse) => {
    const normalizedStatus = normalizeConfigStatus(config.status);
    const isPublished = normalizedStatus === 'published';
    const invitations = config.invitations_count ?? 0;
    const hasBeenShared = invitations > 0;
    const menuKey = `version:${config.id}`;

    // Every action lives in the 3-dot menu — the row carries no quick-action
    // buttons of its own.
    return (
      <div className="flex items-center">
        {/* Compact 3-dot menu, portalled to <body> so the panel table's
            overflow box cannot clip it (see `menuAnchor`). */}
        <div className="relative">
          <button
            type="button"
            data-ai-version-menu-trigger
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
            className={`${QUICK_ACTION_BASE} text-gray-600 dark:text-slate-300 border-gray-300 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 hover:border-gray-400`}
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>

          {openMenuId === menuKey && menuAnchor && typeof document !== 'undefined' && createPortal(
            <div
              ref={versionMenuRef}
              className="fixed w-52 bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-gray-200 dark:border-slate-700/60 py-1 z-[9999] max-h-[70dvh] overflow-y-auto"
              style={{
                top: menuDropUp ? undefined : menuAnchor.bottom + 4,
                bottom: menuDropUp ? Math.max(8, window.innerHeight - menuAnchor.top + 4) : undefined,
                left: Math.max(8, menuAnchor.right - 208),
              }}
            >
              <button
                onClick={() => { router.push(interviewDetailsHref(config.id)); setOpenMenuId(null); }}
                className={VERSION_MENU_ITEM_CLASS}
              >
                <Eye className="w-4 h-4 flex-shrink-0 text-menu-icon-view" />
                <span className={MENU_ITEM_SCALE_CLASS}>View Details</span>
              </button>
              {/* Continue Editing — moved here from the job row, which now
                  reports the job as a whole, as the Assessments Job List does. */}
              {config.status === 'draft' && config.jd_id && (
                <button
                  onClick={() => {
                    if (!canUpdateAIInterviews) {
                      toast.error('You do not have permission to edit AI interviews');
                      return;
                    }
                    setOpenMenuId(null);
                    router.push(`/recruitment/ai-interviews/jd-selection/ai-interview-config?jd_id=${config.jd_id}&config_id=${config.id}`);
                  }}
                  aria-disabled={!canUpdateAIInterviews}
                  title={!canUpdateAIInterviews ? 'You do not have permission to edit AI interviews' : ''}
                  className={canUpdateAIInterviews ? VERSION_MENU_ITEM_CLASS : VERSION_MENU_ITEM_DISABLED_CLASS}
                >
                  <Pencil className="w-4 h-4 flex-shrink-0 text-menu-icon-edit" />
                  <span className={MENU_ITEM_SCALE_CLASS}>Continue Editing</span>
                </button>
              )}
              {isPublished && (
                <button
                  onClick={() => {
                    if (!canInviteAIInterviews) {
                      toast.error('You do not have permission to invite candidates');
                      return;
                    }
                    setShareConfig(config); setOpenMenuId(null);
                  }}
                  aria-disabled={!canInviteAIInterviews}
                  title={!canInviteAIInterviews ? 'You do not have permission to invite candidates' : ''}
                  className={canInviteAIInterviews ? VERSION_MENU_ITEM_CLASS : VERSION_MENU_ITEM_DISABLED_CLASS}
                >
                  <Send className="w-4 h-4 flex-shrink-0 text-menu-icon-share" />
                  <span className={MENU_ITEM_SCALE_CLASS}>Invite</span>
                </button>
              )}
              {/* Track / View Results — always listed, but disabled (reason in
                  the tooltip) until at least one invite exists: before that
                  there is nothing to track and no session to score. */}
              <button
                onClick={() => { if (!hasBeenShared) return; handleViewInvitations(config); setOpenMenuId(null); }}
                disabled={!hasBeenShared}
                title={hasBeenShared ? `Track invitation status (${invitations})` : 'Share the interview to track invitations'}
                className={hasBeenShared ? VERSION_MENU_ITEM_CLASS : VERSION_MENU_ITEM_DISABLED_CLASS}
              >
                <Radar className={`w-4 h-4 flex-shrink-0 ${hasBeenShared ? 'text-brand-cyan' : ''}`} />
                <span className={MENU_ITEM_SCALE_CLASS}>Track{hasBeenShared ? ` (${invitations})` : ''}</span>
              </button>
              <button
                onClick={() => { if (!hasBeenShared) return; router.push(interviewDetailsHref(config.id, 'results')); setOpenMenuId(null); }}
                disabled={!hasBeenShared}
                title={
                  hasBeenShared
                    ? 'View interview results'
                    : isPublished
                      ? 'Share the interview to view results'
                      : 'Publish the interview to view results'
                }
                className={hasBeenShared ? VERSION_MENU_ITEM_CLASS : VERSION_MENU_ITEM_DISABLED_CLASS}
              >
                <BarChart2 className={`w-4 h-4 flex-shrink-0 ${hasBeenShared ? 'text-menu-icon-view' : ''}`} />
                <span className={MENU_ITEM_SCALE_CLASS}>View Results</span>
              </button>
              <div className="my-1 h-px bg-gray-100 dark:bg-slate-800" />
              {normalizedStatus !== 'archived' && (
                <button
                  onClick={() => {
                    if (!canArchiveAIInterviews) {
                      toast.error('You do not have permission to archive AI interviews');
                      return;
                    }
                    handleArchiveConfig(config);
                  }}
                  aria-disabled={!canArchiveAIInterviews}
                  title={!canArchiveAIInterviews ? 'You do not have permission to archive AI interviews' : ''}
                  className={canArchiveAIInterviews ? VERSION_MENU_ITEM_CLASS : VERSION_MENU_ITEM_DISABLED_CLASS}
                >
                  <Archive className="w-4 h-4 flex-shrink-0 text-menu-icon-archive" />
                  <span className={MENU_ITEM_SCALE_CLASS}>Archive</span>
                </button>
              )}
              {normalizedStatus === 'archived' && (
                <button
                  onClick={() => {
                    if (!canArchiveAIInterviews) {
                      toast.error('You do not have permission to unarchive AI interviews');
                      return;
                    }
                    handleUnarchiveConfig(config);
                  }}
                  aria-disabled={!canArchiveAIInterviews}
                  title={!canArchiveAIInterviews ? 'You do not have permission to unarchive AI interviews' : ''}
                  className={canArchiveAIInterviews ? VERSION_MENU_ITEM_CLASS : VERSION_MENU_ITEM_DISABLED_CLASS}
                >
                  <ArchiveRestore className="w-4 h-4 flex-shrink-0 text-menu-icon-archive" />
                  <span className={MENU_ITEM_SCALE_CLASS}>Unarchive</span>
                </button>
              )}
              <button
                onClick={() => {
                  if (!canDeleteAIInterviews) {
                    toast.error('You do not have permission to delete AI interviews');
                    return;
                  }
                  handleDeleteConfig(config);
                }}
                disabled={hasBeenShared}
                aria-disabled={!canDeleteAIInterviews || hasBeenShared}
                title={
                  !canDeleteAIInterviews
                    ? 'You do not have permission to delete AI interviews'
                    : hasBeenShared
                      ? 'Cannot delete — candidates have already started this interview'
                      : ''
                }
                className={`group w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
                  !canDeleteAIInterviews || hasBeenShared
                    ? 'text-gray-400 dark:text-slate-500 cursor-not-allowed opacity-60'
                    : 'text-destructive hover:bg-gray-100 dark:hover:bg-slate-800'
                }`}
              >
                <Trash2 className="w-4 h-4 flex-shrink-0" />
                <span className={MENU_ITEM_SCALE_CLASS}>Delete</span>
              </button>
            </div>,
            document.body,
          )}
        </div>
      </div>
    );
  };

  const processingTotalPages = Math.max(1, Math.ceil(processingSessions.length / processingItemsPerPage));
  const paginatedProcessingSessions = processingSessions.slice(
    (processingPage - 1) * processingItemsPerPage,
    processingPage * processingItemsPerPage,
  );

  const getStatusLabel = (status: string) => {
    switch (normalizeConfigStatus(status)) {
      case 'published': return 'Active';
      case 'draft': return 'Draft';
      case 'completed': return 'Completed';
      case 'cancelled': return 'Cancelled';
      case 'archived': return 'Archived';
      default: return status;
    }
  };

  const isConfigListTab = ['all', 'published', 'draft', 'completed', 'archived'].includes(activeTab);

  /* Ticked Invitation Status rows that can still be revoked — drives the
     Revoke (N) button beside Refresh. The selection is cleared whenever the
     filters change, so every ticked row is one on screen. */
  const statusRevocableSelectedCount = selectedStatusInviteIds.size === 0
    ? 0
    : inviteStatusRows.filter((inv) => selectedStatusInviteIds.has(inv.id) && isRevocableInvite(inv)).length;

  /* Ticked rows a fresh link can be sent to — the Track Invites popup's bulk
     resend rule: Expired, and never once the candidate started or finished.
     Offered only under the Expired filter, as on the Assessments page: a
     resend means nothing for a link that has not lapsed. */
  const statusResendableSelectedRows = inviteStatusFilters.status !== 'expired' || selectedStatusInviteIds.size === 0
    ? []
    : inviteStatusRows.filter((inv) =>
        selectedStatusInviteIds.has(inv.id) && isExpiredForActions(inv) && !inv.started_at && !inv.completed_at);

  /* A fresh link to each invitation, one at a time — each send emails a
     candidate, and a failure on one must not stop the rest. Shared by the
     Invitation Status tab's and the Track popup's bulk Resend. */
  const resendInvitesInBulk = async (targets: any[]) => {
    let sent = 0;
    let failedCount = 0;
    for (const inv of targets) {
      try {
        await aiInterviewService.sendSessionEmail(inv.id, { base_url: window.location.origin });
        sent++;
      } catch (error) {
        console.error(`Failed to resend AI interview invitation ${inv.id}:`, error);
        failedCount++;
      }
    }
    if (sent > 0) toast.success(`New invitation link${sent === 1 ? '' : 's'} sent to ${sent} candidate${sent === 1 ? '' : 's'}.`);
    if (failedCount > 0) toast.error(`${failedCount} invitation${failedCount === 1 ? '' : 's'} could not be resent.`);
  };

  const handleStatusBulkResend = async () => {
    const targets = statusResendableSelectedRows;
    if (targets.length === 0) { setStatusBulkResendOpen(false); return; }
    setIsStatusBulkResending(true);
    await resendInvitesInBulk(targets);
    setSelectedStatusInviteIds(new Set());
    setStatusBulkResendOpen(false);
    setIsStatusBulkResending(false);
    await loadAllInviteStatuses();
  };

  /** The heading shown above the search/filter bar for each config-list tab —
   *  same spot and treatment as Resume Scoring's "All Resumes (299)". */
  const CONFIG_LIST_TAB_TITLES: Record<string, string> = {
    all: 'Total Jobs',
    published: 'Active Interviews',
    draft: 'Draft Interviews',
    archived: 'Archived Interviews',
    completed: 'Completed Interviews',
  };

  /** The three tabs the Grouped/Ungrouped toggle applies to — each a single,
   *  unambiguous status, unlike Total Jobs (every status) or Completed. */
  const isStatusTab = activeTab === 'published' || activeTab === 'draft' || activeTab === 'archived';
  /** Ungrouped renders the flat, one-row-per-version table instead of this
   *  component's own card list below. */
  const showUngroupedList = isStatusTab && configListViewMode === 'ungrouped';

  /* The grouped job list hands its jobs, in the order shown (sort, search and
     filters applied), to the details page's Prev / Next. */
  const groupedPagerList = isConfigListTab && !showUngroupedList ? GROUPED_PAGER_LIST[activeTab] : undefined;
  const groupedPagerIds = collapsedConfigs.map((c) => c.id).join(',');
  useEffect(() => {
    if (!groupedPagerList || loading) return;
    rememberAIInterviewPagerOrder(groupedPagerList, groupedPagerIds ? groupedPagerIds.split(',') : []);
  }, [groupedPagerList, groupedPagerIds, loading]);
  /** Status a version must match to appear under this tab's "View Versions"
   *  panel (Grouped mode) — undefined on Total Jobs/Completed, which show
   *  every version's status as before. */
  const versionStatusFilterForTab = isStatusTab ? (activeTab as 'published' | 'draft' | 'archived') : undefined;

  /* Back to page 1 when the user changes the tab, search, sort or a filter —
     but NOT for the change a list-state restore makes on return from a
     detail page (restoredListKeyRef), which would throw the restored page
     away. Until that restored render arrives nothing is reset. */
  const pageResetMountedRef = useRef(false);
  useEffect(() => {
    // Mount: nothing to reset (page 1 already, or about to be restored).
    if (!pageResetMountedRef.current) { pageResetMountedRef.current = true; return; }
    // The render the restore caused (a ?tab= deep link may ride along in it):
    // keep the restored page, and stop skipping.
    if (restoredListKeyRef.current !== null) { restoredListKeyRef.current = null; return; }
    setConfigListPage(1);
  }, [activeTab, invitedOnly, modeFilter, searchQuery, sortBy, creatorFilter, dateFilter, customDateFrom, customDateTo]);

  /* The Processing list: keep the (restored) page as the rows load, and only
     pull it back if the list got shorter than it — it used to snap to 1 on
     every load. */
  useEffect(() => {
    if (processingSessions.length === 0) return;
    const lastPage = Math.max(1, Math.ceil(processingSessions.length / processingItemsPerPage));
    setProcessingPage((p) => Math.min(p, lastPage));
  }, [processingSessions.length, processingItemsPerPage]);

  // Candidate detail view from Track Invites modal
  if (candidateDetailFromModal) {
    // Prev/Next steps through the loaded invitations list for this config.
    const invIdx = invitations.findIndex((i) => i.id === candidateDetailFromModal.id);
    const invCount = invitations.length;
    return (
      <CandidateResultsView
        interview={candidateDetailFromModal}
        onBack={() => setCandidateDetailFromModal(null)}
        onNavigateToList={() => setCandidateDetailFromModal(null)}
        currentIndex={invIdx >= 0 ? invIdx : undefined}
        totalCount={invCount || undefined}
        onPrev={invIdx > 0 ? () => handleViewCandidateDetail(invitations[invIdx - 1].id) : undefined}
        onNext={invIdx >= 0 && invIdx < invCount - 1 ? () => handleViewCandidateDetail(invitations[invIdx + 1].id) : undefined}
      />
    );
  }

  // A create quick-action (Job Details → "AI Interview → Create") always leaves
  // this page for the config flow. Hold the loader while it's pending, or the
  // list — breadcrumb included — paints for a frame before the effect above
  // redirects, which reads as a flash of the wrong page. This can't get stuck:
  // that effect either navigates away or strips the param via clearQuickActionUrl.
  const redirectingToConfig = searchParams.get('action') === 'create-ai-interview';

  // Loading state. While redirecting, use the SAME message the config page
  // shows so the chained loaders read as one continuous screen rather than a
  // spinner that restarts with different text.
  // The config redirect keeps the flow spinner (a transient hand-off, not a
  // page load). The initial list load shows a skeleton mirroring the header +
  // interview-config rows instead of a spinner.
  if (redirectingToConfig) {
    return <AIInterviewFlowLoader message="Loading configuration…" />;
  }
  if (loading) {
    return (
      <main className="flex-1 overflow-x-clip bg-slate-50 dark:bg-slate-950">
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="p-4 md:p-8 w-full bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl dark:shadow-black/40 dark:border dark:border-slate-700/60">
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
                <Skeleton className="h-9 w-44 rounded-lg" />
              </div>
            </div>
            {/* Stats cards */}
            <div className="grid gap-2.5 sm:gap-3 mb-5 sm:mb-8 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-brand-blue/15 dark:border-brand-blue/25 bg-white dark:bg-slate-900 px-3.5 py-3.5 sm:px-4 sm:py-4">
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
            {/* Config rows — one per job, matching the loaded list's row shape */}
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="p-3 sm:p-4 bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 shadow-sm shadow-brand-blue/5">
                  <div className="flex flex-col gap-3 @4xl/ai-row:flex-row @4xl/ai-row:items-center @4xl/ai-row:gap-4">
                    <div className="flex items-center gap-2.5 min-w-0 @4xl/ai-row:w-[360px] @4xl/ai-row:flex-shrink-0">
                      <Skeleton className="h-9 w-9 rounded-lg shrink-0" />
                      <Skeleton className="h-4 w-16 rounded-md shrink-0" />
                      <Skeleton className="h-4 w-40" />
                    </div>
                    <div className="flex-shrink-0 @4xl/ai-row:w-[104px]">
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </div>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-3 sm:grid-cols-4 sm:gap-x-0 sm:gap-y-0 @4xl/ai-row:flex-1 @4xl/ai-row:min-w-0">
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

  // Quota usage for the header progress bar
  const quotaUsedPct = (() => {
    if (isUnlimited || totalUnits <= 0 || availableUnits === null) return 0;
    const used = Math.max(0, totalUnits - availableUnits);
    return Math.min(100, Math.round((used / totalUnits) * 100));
  })();
  const quotaTone = isUnlimited
    ? 'neutral'
    : availableUnits !== null && availableUnits <= 0
    ? 'danger'
    : availableUnits !== null && availableUnits <= 2
    ? 'warning'
    : 'neutral';

  return (
    <main ref={rootRef} className="flex-1 overflow-x-clip bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-[1400px]">
      {/* The page shell and this panel had no dark variants at all, so every
          card inside was painting a dark surface onto a white page. */}
      <div className="p-4 md:p-8 w-full bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl dark:shadow-black/40 dark:border dark:border-slate-700/60">
        <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'AI Interviews' }]} />
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3 lg:gap-4 mb-5">
          <div className="flex items-start gap-3 min-w-0">
            <div className="hidden sm:flex w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 items-center justify-center shrink-0">
              <Video className="w-4 h-4 text-brand-blue" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-slate-50 tracking-tight break-words">
                AI Interview Management
              </h1>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-500 mt-0.5 max-w-xl">
                Run live AI-powered interviews where candidates answer in real time
              </p>
            </div>
          </div>
          <div className="flex items-stretch gap-2 sm:gap-3 flex-wrap lg:flex-nowrap">
            {/* AI Interview Quota Card */}
            {totalUnits > 0 && (
              <QuotaBadge
                label="AI Interview Quota"
                availableUnits={availableUnits}
                totalUnits={totalUnits}
                isUnlimited={isUnlimited}
              />
            )}
            <button
              onClick={() => {
                if (!canAccessHRQuestionBank) {
                  toast.error('You do not have permission to access the HR Question Bank');
                  return;
                }
                // Tells the question bank which module to name in its breadcrumb.
                try { sessionStorage.setItem('questionBankSource', 'ai-interviews'); } catch { /* ignore */ }
                router.push('/recruitment/hr-question-bank');
              }}
              aria-disabled={!canAccessHRQuestionBank}
              title={!canAccessHRQuestionBank ? 'You do not have permission to access the HR Question Bank' : ''}
              className={`inline-flex items-center gap-1.5 border px-3.5 py-2 rounded-lg transition-all duration-200 text-xs font-medium shadow-sm ${
                canAccessHRQuestionBank
                  ? 'border-brand-blue/30 bg-white dark:bg-slate-900 text-brand-blue hover:bg-brand-blue/5'
                  : 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-400 dark:text-slate-500 cursor-not-allowed opacity-60'
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5 flex-shrink-0" />
              <span>HR Question Bank</span>
            </button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                if (!canShareAIInterviews) {
                  toast.error('You do not have permission to invite candidates');
                  return;
                }
                setShowInvitePicker(true);
              }}
              aria-disabled={!canShareAIInterviews}
              className={!canShareAIInterviews ? 'opacity-50 cursor-not-allowed' : ''}
              title={!canShareAIInterviews ? 'You do not have permission to invite candidates' : ''}
              icon={<Send className="w-3.5 h-3.5" />}
            >
              Send Invite
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                if (!canCreateAIInterviews) {
                  toast.error('You do not have permission to create AI interviews');
                  return;
                }
                router.push('/recruitment/ai-interviews/jd-selection');
              }}
              aria-disabled={!canCreateAIInterviews}
              className={!canCreateAIInterviews ? 'opacity-50 cursor-not-allowed' : ''}
              title={!canCreateAIInterviews ? 'You do not have permission to create AI interviews' : ''}
              icon={<Plus className="w-3.5 h-3.5" />}
            >
              Create AI Interview
            </Button>
          </div>
        </div>

        {/* Stats Cards — clicking a card drills into the list with the matching tab applied */}
        {(() => {
          // Every config, active + archived, deduped by id — the same set the
          // Total Jobs tab and the All Interviews table are built from.
          const allConfigs = (() => {
            const seen = new Set(configs.map((c) => c.id));
            return [...configs, ...archivedConfigs.filter((a) => !seen.has(a.id))];
          })();
          // A job is a lineage (`jd_short_id`), exactly as the Total Jobs tab
          // collapses its cards, so the card and the tab never disagree.
          const totalJobs = new Set(
            allConfigs.map((c) => c.jd_short_id || c.jd_id || `__unlinked__:${c.id}`),
          ).size;
          const cards = [
            {
              label: 'Total Jobs',
              value: allConfigs.length ? totalJobs : (stats?.total_configs ?? 0),
              icon: Briefcase,
              tab: 'all' as TabKey,
              cardKey: 'jobs' as OverviewCardKey,
            },
            {
              label: 'Total Interviews',
              value: allConfigs.length || (stats?.total_configs ?? 0),
              icon: FileText,
              tab: 'all-interviews' as TabKey,
              cardKey: 'interviews' as OverviewCardKey,
            },
            {
              label: 'Active Interviews',
              // Count Active the SAME way the Active tab does — candidate-flow
              // statuses (in_progress/scheduled/…) are still published configs
              // (see normalizeConfigStatus). Fall back to the backend stat only
              // before the config list has loaded.
              value: configs.length
                ? configs.filter((c) => normalizeConfigStatus(c.status) === 'published').length
                : (stats?.published_configs ?? 0),
              icon: Globe,
              tab: 'published' as TabKey,
              cardKey: 'active' as OverviewCardKey,
            },
            {
              label: 'Draft Interviews',
              value: configs.length
                ? configs.filter((c) => c.status === 'draft').length
                : (stats?.draft_configs ?? 0),
              icon: Pencil,
              tab: 'draft' as TabKey,
              cardKey: 'draft' as OverviewCardKey,
            },
            {
              label: 'Candidates Interviewed',
              value: interviewedCount ?? stats?.completed ?? 0,
              icon: Users,
              tab: 'candidate-results' as TabKey,
              cardKey: 'interviewed' as OverviewCardKey,
            },
          ];
          return (
            <StatsCardGrid className="mb-5 sm:mb-8" columns={5}>
              {cards.map(({ label, value, icon: Icon, tab, cardKey }) => (
                <StatsCard
                  key={label}
                  tone="neutral"
                  active={isOverviewCardActive(cardKey)}
                  showClickArrow
                  icon={Icon}
                  label={label}
                  value={value}
                  sparkline={false}
                  onClick={() => openListView(tab, { cardKey })}
                />
              ))}
            </StatsCardGrid>
          );
        })()}

        {pageView === 'list' && (
        <>
        <div ref={listSectionRef} className="scroll-mt-4" aria-hidden="true" />
        {invitedOnly && (
        <div className="mb-4 flex items-center justify-end gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/20">
            <Users className="w-3 h-3" />
            Showing only configs with invitations
            <button
              onClick={() => setInvitedOnly(false)}
              className="ml-1 hover:text-brand-cyan/80"
              aria-label="Clear invited filter"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        </div>
        )}

        {/* Search + filters, ABOVE the tabs — the Assessments page's order.
            Only on the tabs that list interview configs; the others bring
            their own controls. The Ungrouped view is one of those "own
            controls" tabs too — AllInterviewsTable portals its own toolbar
            into the same slot, so this one steps aside rather than the two
            fighting over one spot. */}
        {isConfigListTab && !showUngroupedList && (
          <div className="mb-4">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50 tracking-tight mb-3">
              {CONFIG_LIST_TAB_TITLES[activeTab] ?? 'Jobs'} ({collapsedConfigs.length})
            </h2>
            <ListToolbar
              searchValue={searchQuery}
              searchDebounceMs={0}
              onSearchChange={setSearchQuery}
              searchPlaceholder="Search by job title, ID or skill..."
              onToggleFilters={() => setShowAIFilters((open) => !open)}
              filtersOpen={showAIFilters}
              activeFilterCount={aiFilterCount}
              filtersApplied={aiFiltersActive}
              onClearFilters={clearAIInterviewFilters}
              className="mb-0"
              countBadge={
                <ListCountBadge
                  filtered={collapsedConfigs.length}
                  total={allJobsCount}
                  noun="job"
                />
              }
              filterPanel={
                <div className="rounded-xl border border-gray-100 dark:border-slate-700/60 bg-slate-50/60 dark:bg-slate-800/30 p-3 sm:p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    <div>
                      <label htmlFor="ai-interview-mode" className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                        Mode
                      </label>
                      <select
                        id="ai-interview-mode"
                        value={modeFilter}
                        onChange={(e) => setModeFilter(e.target.value as typeof modeFilter)}
                        className={AI_FILTER_FIELD_CLASS}
                      >
                        <option value="all">All modes</option>
                        <option value="timed">Timed</option>
                        <option value="conversational">Conversational</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="ai-interview-creator" className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                        Created by
                      </label>
                      <select
                        id="ai-interview-creator"
                        value={creatorFilter}
                        onChange={(e) => setCreatorFilter(e.target.value)}
                        className={AI_FILTER_FIELD_CLASS}
                      >
                        <option value="all">Anyone</option>
                        {creatorOptions.map((name) => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="ai-interview-date" className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                        Created
                      </label>
                      <select
                        id="ai-interview-date"
                        value={dateFilter}
                        onChange={(e) => setDateFilter(e.target.value as DateFilterKey)}
                        className={AI_FILTER_FIELD_CLASS}
                      >
                        <option value="all">Any date</option>
                        <option value="today">Today</option>
                        <option value="yesterday">Yesterday</option>
                        <option value="last_week">Last week</option>
                        <option value="last_month">Last month</option>
                        <option value="custom">Custom range…</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="ai-interview-sort" className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                        Sort by
                      </label>
                      <select
                        id="ai-interview-sort"
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                        className={AI_FILTER_FIELD_CLASS}
                      >
                        <option value="newest">Newest</option>
                        <option value="oldest">Oldest</option>
                        <option value="active">Active first</option>
                        <option value="draft">Draft first</option>
                      </select>
                    </div>
                    {dateFilter === 'custom' && (
                      <>
                        <div>
                          <label htmlFor="ai-interview-created-from" className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                            Created from
                          </label>
                          <DateField
                            id="ai-interview-created-from"
                            value={customDateFrom}
                            max={customDateTo || undefined}
                            onChange={setCustomDateFrom}
                          />
                        </div>
                        <div>
                          <label htmlFor="ai-interview-created-to" className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                            Created to
                          </label>
                          <DateField
                            id="ai-interview-created-to"
                            value={customDateTo}
                            min={customDateFrom || undefined}
                            onChange={setCustomDateTo}
                          />
                        </div>
                      </>
                    )}
                  </div>
                  <div className="mt-4 pt-3 border-t border-gray-200 dark:border-slate-700/60 flex items-center justify-end gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setShowAIFilters(false)}>
                      Done
                    </Button>
                  </div>
                </div>
              }
            />
          </div>
        )}

        {/* Shared toolbar slot — All Interviews / Candidate Results / Activity
            Logs each portal their own search/filter bar in here (see their
            `toolbarSlot` prop below), so it renders in this one spot above
            the tab pills no matter which tab is active. Empty (and so
            collapsed) on the tabs whose toolbar renders inline above instead. */}
        <div ref={setToolbarSlotEl} className="empty:hidden mb-4" />

        {/* Tabs — outside the list card, in the Assessments page's pill row. */}
        <div className="flex items-start justify-between gap-2 flex-wrap mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-600 dark:text-slate-400">Show:</span>
          {([
            { key: 'all', label: 'Total Jobs' },
            { key: 'all-interviews', label: 'All Interviews' },
            { key: 'published', label: 'Active' },
            { key: 'draft', label: 'Draft' },
            { key: 'archived', label: 'Archived' },
            // Candidate sessions across every interview — the Assessments
            // page's tab of the same name, for AI interviews.
            { key: 'candidate-results', label: 'Candidate Results' },
            // Every invitation across every interview — the Assessments
            // page's Invitation Status tab, for AI interviews.
            { key: 'invitation-status', label: 'Invitation Status' },
          ] as const).map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => openListView(tab.key as TabKey)}
                aria-current={isActive ? 'page' : undefined}
                className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25'
                    : 'bg-brand-blue/5 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/10 hover:text-brand-blue'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
          <div className="flex items-center gap-2 flex-wrap sm:ml-2 sm:border-l sm:border-gray-200 dark:sm:border-slate-700/60 sm:pl-3">
            {([
              { key: 'audit', label: 'Activity Logs' },
              { key: 'settings', label: 'Settings' },
            ] as const).map(tab => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => openListView(tab.key as TabKey)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25'
                      : 'bg-brand-blue/5 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/10 hover:text-brand-blue'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

          <div className="flex items-center gap-2 flex-shrink-0">
          <span ref={setSortActionSlotEl} className="flex items-center empty:hidden" />
          {/* Bulk Revoke — Invitation Status only, beside Refresh, and only
              once a ticked row can still be revoked (Invited / In Progress):
              the Assessments page's Revoke (N) button. */}
          {/* Bulk Resend — the Expired filter's action, same place and shape. */}
          {activeTab === 'invitation-status' && statusResendableSelectedRows.length > 0 && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setStatusBulkResendOpen(true)}
              disabled={isStatusBulkResending}
              title="Resend a fresh link to the selected expired invitations"
              icon={isStatusBulkResending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
            >
              {isStatusBulkResending ? 'Sending…' : `Resend (${statusResendableSelectedRows.length})`}
            </Button>
          )}
          <ConfirmationDialog
            isOpen={statusBulkResendOpen}
            onClose={() => { if (!isStatusBulkResending) setStatusBulkResendOpen(false); }}
            onConfirm={handleStatusBulkResend}
            title="Resend invitations to selected candidates?"
            description={`A fresh interview link will be emailed to ${statusResendableSelectedRows.length} selected candidate${statusResendableSelectedRows.length === 1 ? '' : 's'}. Each candidate's previous link will stop working immediately.`}
            confirmText={isStatusBulkResending ? 'Sending…' : `Yes, resend to ${statusResendableSelectedRows.length}`}
            cancelText="Cancel"
            variant="info"
          />
          {activeTab === 'invitation-status' && statusRevocableSelectedCount > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setStatusBulkRevokeOpen(true)}
              disabled={isBulkRevoking}
              title="Revoke the selected candidates' interview links"
              icon={isBulkRevoking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
            >
              {isBulkRevoking ? 'Revoking…' : `Revoke (${statusRevocableSelectedCount})`}
            </Button>
          )}

          {/* Refresh — right corner of the pill row. Refetches whichever tab
              is on screen: the config-list/processing/invitation-status/
              settings tabs this component owns directly, plus a bump of
              `refreshSignal` for the three that manage their own data. */}
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefreshCurrentTab}
            disabled={isRefreshingTab}
            title="Refresh"
            aria-label="Refresh"
            icon={<RefreshCw className={`w-3.5 h-3.5 ${isRefreshingTab ? 'animate-spin' : ''}`} />}
            className="flex-shrink-0"
          >
            <span className="hidden sm:inline">{isRefreshingTab ? 'Refreshing...' : 'Refresh'}</span>
          </Button>
          </div>
        </div>

        {/* Grouped/Ungrouped — Active/Draft/Archived only. Ungrouped (the
            default) is a flat table, one row per version; Grouped is the
            one-card-per-job view below, each job's other versions behind its
            own View Versions button, same as before this toggle existed. */}
        {isStatusTab && (() => {
          /* Each mode names how many it lists for this tab, unfiltered:
             Ungrouped one row per interview (version), Grouped one card per job. */
          const tabInterviews = activeTab === 'archived'
            ? archivedConfigs
            : configs.filter((c) => activeTab === 'published'
              ? normalizeConfigStatus(c.status) === 'published'
              : c.status === 'draft');
          const modeCounts = {
            ungrouped: tabInterviews.length,
            grouped: collapseAIInterviewLineages(tabInterviews).length,
          };
          return (
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm text-gray-600 dark:text-slate-400">View:</span>
            <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
              {([
                { key: 'ungrouped', label: 'Ungrouped' },
                { key: 'grouped', label: 'Grouped' },
              ] as const).map((mode) => {
                const isActive = configListViewMode === mode.key;
                return (
                  <button
                    key={mode.key}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => setConfigListViewMode(mode.key)}
                    className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 min-h-[32px] rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                      isActive
                        ? 'bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/10 ring-1 ring-brand-blue/20 text-brand-blue'
                        : 'text-gray-600 dark:text-slate-400 hover:text-brand-blue'
                    }`}
                  >
                    {mode.label}
                    <span className={`min-w-[1.25rem] px-1.5 py-0.5 rounded-full text-2xs font-semibold tabular-nums text-center ${
                      isActive
                        ? 'bg-brand-blue/10 text-brand-blue'
                        : 'bg-gray-200/70 dark:bg-slate-700 text-gray-600 dark:text-slate-300'
                    }`}>
                      {modeCounts[mode.key]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          );
        })()}

        {/* Main Content */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5">
          {/* All Interviews — flat, one row per interview config/version,
              the same shape as the Assessments page's "All Assessments"
              table, as opposed to the Total Jobs tab's one-card-per-job
              (collapsed lineage) list below. */}
          {activeTab === 'all-interviews' && <AllInterviewsTable toolbarSlot={toolbarSlotEl} sortActionSlot={sortActionSlotEl} refreshSignal={refreshSignal} renderRowActions={renderInterviewVersionActions} />}

          {/* Active/Draft/Archived, Ungrouped — the same flat table as All
              Interviews, locked to this tab's own status so no other status's
              jobs or versions show up in it. */}
          {showUngroupedList && (
            <AllInterviewsTable
              key={activeTab}
              toolbarSlot={toolbarSlotEl}
              sortActionSlot={sortActionSlotEl}
              refreshSignal={refreshSignal}
              fixedStatus={activeTab as 'published' | 'draft' | 'archived'}
              titleLabel={CONFIG_LIST_TAB_TITLES[activeTab]}
              renderRowActions={renderInterviewVersionActions}
            />
          )}

          {/* Config List (for config-listing tabs) */}
          {isConfigListTab && !showUngroupedList && (
            <div className="p-3 sm:p-6">
              {collapsedConfigs.length === 0 ? (
                <div className="text-center py-16 sm:py-20">
                  <div className="relative inline-flex items-center justify-center mb-5">
                    <div className="absolute inset-0 rounded-full bg-brand-blue/10 blur-xl scale-150" aria-hidden />
                    <div className="relative w-20 h-20 rounded-2xl bg-brand-blue/10 ring-1 ring-brand-blue/15 shadow-sm shadow-brand-blue/10 flex items-center justify-center">
                      {searchQuery ? (
                        <Search className="w-9 h-9 text-brand-blue" strokeWidth={1.5} />
                      ) : (
                        <Video className="w-9 h-9 text-brand-blue" strokeWidth={1.5} />
                      )}
                    </div>
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-slate-50 mb-1.5 tracking-tight">
                    {searchQuery
                      ? 'No matches found'
                      : activeTab === 'archived'
                      ? 'No archived configurations'
                      : 'No AI interviews yet'}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-slate-500 mb-6 max-w-sm mx-auto">
                    {searchQuery
                      ? `We couldn't find anything matching "${searchQuery}". Try a different search.`
                      : activeTab === 'archived'
                      ? 'Configurations you archive will show up here.'
                      : 'Set up your first AI interview to start evaluating candidates with multi-round, AI-driven assessments.'}
                  </p>
                  {!searchQuery && activeTab !== 'archived' && (
                    <Button
                      variant="primary"
                      size="md"
                      onClick={() => {
                        if (!canCreateAIInterviews) {
                          toast.error('You do not have permission to create AI interviews');
                          return;
                        }
                        router.push('/recruitment/ai-interviews/jd-selection');
                      }}
                      aria-disabled={!canCreateAIInterviews}
                      className={!canCreateAIInterviews ? 'opacity-50 cursor-not-allowed' : ''}
                      title={!canCreateAIInterviews ? 'You do not have permission to create AI interviews' : ''}
                      icon={<Plus className="w-4 h-4" />}
                    >
                      Create your first interview
                    </Button>
                  )}
                  {searchQuery && (
                    <Button variant="secondary" size="md" onClick={() => setSearchQuery('')}>
                      Clear search
                    </Button>
                  )}
                </div>
              ) : (
                <>
                <div className="space-y-3">
                  {paginatedConfigs.map((config) => {
                    const normalizedStatus = normalizeConfigStatus(config.status);
                    const statusPillStyles: Record<string, string> = {
                      published: 'bg-success-subtle text-success ring-success-line',
                      draft: 'bg-brand-orange/10 text-brand-orange-deep dark:text-brand-orange ring-brand-orange/20',
                      completed: 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20',
                      cancelled: 'bg-destructive-subtle text-destructive ring-destructive-line',
                      archived: 'bg-brand-orange/10 text-brand-orange-deep dark:text-brand-orange ring-brand-orange/20',
                    };
                    const statusPillLabels: Record<string, string> = {
                      published: 'Active',
                      draft: 'Draft',
                      completed: 'Completed',
                      cancelled: 'Cancelled',
                      archived: 'Archived',
                    };
                    const statusPill = statusPillStyles[normalizedStatus]
                      || 'bg-slate-100 text-gray-700 ring-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700';
                    const statusPillLabel = statusPillLabels[normalizedStatus] || getStatusLabel(config.status);
                    const totals = jobRowTotals.get(configLineageKeyOf(config))
                      ?? { interviews: 0, active: 0, invitations: 0, completed: 0, completedKnown: false };
                    /* The Assessments Job List's four figures, in its order and
                       colours, for interviews. The fourth is Active Interviews
                       where that row has Completed: an interview config carries
                       no finished-sessions count on the list response. */
                    const rowMetrics = [
                      { key: 'job-versions', icon: Layers, iconClass: 'text-brand-blue', value: getJobVersionCount(config), label: 'Job Versions' },
                      { key: 'interviews', icon: Video, iconClass: 'text-brand-cyan', value: totals.interviews, label: 'Interviews' },
                      { key: 'invitations', icon: Send, iconClass: 'text-brand-orange', value: totals.invitations, label: 'Invitations Sent' },
                      /* Candidates who COMPLETED an interview for this job —
                         summed from each interview's completed-session count
                         (requestCompletedCounts). It once showed the published-
                         interview count under this label, which contradicted a
                         0 under Invitations Sent. A dash until every count lands. */
                      { key: 'completed', icon: CheckCircle, iconClass: 'text-menu-icon-activate', value: totals.completedKnown ? totals.completed : '—', label: 'Completed' },
                    ];
                    const hasVersionHistory = !!config.jd_id;
                    const toggleVersions = () => {
                      if (!config.jd_id) return;
                      const opening = openVersionsFor !== config.id;
                      setOpenVersionsFor(opening ? config.id : null);
                      /* Fetched on the way open, never on render — the loader
                         no-ops on a cache hit. */
                      if (opening) jdLineage.ensureLoaded(config.jd_id, config.jd_id);
                    };
                    /* Track reads the job's invitations. The tracker is per
                       interview, so it opens on the job's most-invited one. */
                    const trackTarget = getJobTrackTarget(config);
                    const jobInvitations = trackTarget?.invitations_count ?? 0;
                    const canTrack = jobInvitations > 0 && canInviteAIInterviews;
                    const trackReason = !canInviteAIInterviews
                      ? 'You do not have permission to track invitations'
                      : jobInvitations > 0
                        ? `Track invitations for this job (${totals.invitations} invitation${totals.invitations === 1 ? '' : 's'} sent)`
                        : 'No invitations have been sent for this job yet';
                    const hasBeenShared = (config.invitations_count ?? 0) > 0;
                    const resultReason = hasBeenShared
                      ? 'View results'
                      : normalizedStatus === 'draft'
                        ? 'Publish the interview to view results'
                        : 'Share the interview to view results';

                    return (
                      <div
                        key={config.id}
                        /* One row = one JOB, as on the Assessments Job List:
                           clicking it opens the job's version history in place,
                           the same thing View Versions does. The interviews
                           themselves, with their own actions, are listed inside. */
                        onClick={() => hasVersionHistory && toggleVersions()}
                        className={`@container/ai-row relative p-3 sm:p-4 bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 transition-all duration-150 ${
                          hasVersionHistory
                            ? 'cursor-pointer hover:border-brand-blue/30 hover:shadow-md hover:shadow-brand-blue/10 hover:-translate-y-0.5'
                            : 'cursor-default'
                        }`}
                      >
                        <div className="flex flex-col gap-3 @4xl/ai-row:flex-row @4xl/ai-row:items-center @4xl/ai-row:gap-4">
                          {/* Identity — icon, Job ID, title */}
                          <div className="flex items-center gap-2.5 min-w-0 @4xl/ai-row:w-[360px] @4xl/ai-row:flex-shrink-0">
                            <div className="h-9 w-9 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg flex items-center justify-center flex-shrink-0">
                              <Briefcase className="h-4 w-4 text-brand-blue" />
                            </div>
                            {config.jd_short_id && (
                              <JobIdBadge className="flex-shrink-0">{config.jd_short_id}</JobIdBadge>
                            )}
                            <h3
                              className="text-sm font-medium text-gray-900 dark:text-slate-50 truncate min-w-0"
                              title={config.jd_title || config.position || 'Untitled'}
                            >
                              {config.jd_title || config.position || 'Untitled'}
                            </h3>
                          </div>

                          {/* Status of the job's representative interview —
                              boxed to a fixed width so the metric columns line up. */}
                          <div className="flex-shrink-0 @4xl/ai-row:w-[104px]">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ring-1 ${statusPill}`}>
                              <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
                              {statusPillLabel}
                            </span>
                          </div>

                          {/* Totals for the job. Two columns on a phone, four in a
                              divided row once there is width for them. */}
                          <div className="grid grid-cols-2 gap-x-2 gap-y-3 sm:grid-cols-4 sm:gap-x-0 sm:gap-y-0 @4xl/ai-row:flex-1 @4xl/ai-row:min-w-0">
                            {rowMetrics.map(({ key, icon: MetricIcon, iconClass, value, label }) => (
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

                          {/* Actions — View Versions, Track, Result. flex-wrap so
                              three buttons never overflow a narrow phone card;
                              their own labels also collapse to icon-only below
                              sm: for the same reason. */}
                          <div
                            className="flex items-center flex-wrap gap-2 flex-shrink-0 self-start @4xl/ai-row:self-auto @4xl/ai-row:ml-auto"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {hasVersionHistory && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); toggleVersions(); }}
                                aria-expanded={openVersionsFor === config.id}
                                title={openVersionsFor === config.id ? 'Hide version history' : 'View version history'}
                                className={`h-8 px-3 inline-flex items-center gap-1.5 whitespace-nowrap border rounded-lg text-xs font-medium transition-all ${
                                  openVersionsFor === config.id
                                    ? 'bg-brand-blue/10 text-brand-blue border-brand-blue/30'
                                    : 'bg-white dark:bg-slate-900 text-brand-blue border-brand-blue/30 hover:bg-brand-blue/5'
                                }`}
                              >
                                <span className="hidden sm:inline">{openVersionsFor === config.id ? 'Hide' : 'View'} Versions</span>
                                <ChevronDown
                                  className={`w-3.5 h-3.5 transition-transform ${
                                    openVersionsFor === config.id ? 'rotate-180' : ''
                                  }`}
                                />
                              </button>
                            )}

                            {hasVersionHistory && (
                              <button
                                type="button"
                                disabled={jobInvitations === 0}
                                aria-disabled={!canTrack}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!canInviteAIInterviews) {
                                    toast.error('You do not have permission to track invitations');
                                    return;
                                  }
                                  if (!canTrack || !trackTarget) return;
                                  // Every interview of this job, so the popup totals match this row.
                                  const lineage = [...configs, ...archivedConfigs].filter(
                                    (c) => configLineageKeyOf(c) === configLineageKeyOf(config));
                                  void handleViewInvitations(trackTarget, true, lineage.map((c) => ({
                                    config: c,
                                    jobVersion: c.jd_version ?? 1,
                                    interviewVersion: interviewVersionOrdinal(c, [...configs, ...archivedConfigs]),
                                  })));
                                }}
                                className={`h-8 px-3 inline-flex items-center gap-1.5 whitespace-nowrap border rounded-lg text-xs font-medium transition-all ${
                                  canTrack
                                    ? 'bg-white dark:bg-slate-900 text-brand-cyan border-brand-cyan/30 hover:bg-brand-cyan/5'
                                    : 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 text-gray-400 dark:text-slate-500 cursor-not-allowed'
                                }`}
                                aria-label={trackReason}
                                title={trackReason}
                              >
                                <Radar className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Track</span>
                              </button>
                            )}

                            <button
                              type="button"
                              disabled={!hasBeenShared}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!hasBeenShared) return;
                                router.push(`/recruitment/ai-interviews/${config.id}/results`);
                              }}
                              className={`h-8 px-3 inline-flex items-center gap-1.5 whitespace-nowrap border rounded-lg text-xs font-medium transition-all ${
                                hasBeenShared
                                  ? 'bg-white dark:bg-slate-900 text-brand-blue border-brand-blue/30 hover:bg-brand-blue/5'
                                  : 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 text-gray-400 dark:text-slate-500 cursor-not-allowed'
                              }`}
                              aria-label={resultReason}
                              title={resultReason}
                            >
                              <BarChart2 className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Result</span>
                            </button>
                          </div>
                        </div>

                        {openVersionsFor === config.id && config.jd_id && (
                          <div
                            className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-700/60"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <AssessmentVersionHistoryPanel
                              /* Same rule the Assessments Job List panel uses:
                                 a Draft is not yet a version of the job, and
                                 the row's count beside Layers reads `active`
                                 for exactly this reason. Without it the two
                                 modules answered "how many versions" with
                                 different numbers for the same job. */
                              hideDraftJobVersions
                              jobVersions={jdLineage.lineages[config.jd_id]}
                              jobVersionDetails={jdLineage.versionDetails}
                              assessments={interviewVersionRows(config.jd_id, versionStatusFilterForTab)}
                              loading={jdLineage.isLoading(config.jd_id)}
                              currentAssessmentId={config.id}
                              vocabulary={INTERVIEW_VOCABULARY}
                              expandedJobVersions={expandedJobVersionsByJob[config.jd_id] ?? []}
                              onToggleJobVersion={(jobVersion) =>
                                setExpandedJobVersionsByJob((current) => {
                                  const open = current[config.jd_id] ?? [];
                                  return {
                                    ...current,
                                    [config.jd_id]: open.includes(jobVersion)
                                      ? open.filter((v) => v !== jobVersion)
                                      : [...open, jobVersion],
                                  };
                                })}
                              /* The radio column, same as the Assessments Job
                                 List: passing `onSelectAssessment` is what makes
                                 the panel render the Select column at all, and a
                                 distinct `selectionGroupName` keeps this page's
                                 "one at a time" to itself. The chosen version is
                                 read back per job from `selectedInterviewVersionByJob`
                                 and highlighted by the panel. */
                              selectionGroupName="ai-interview-version-selection"
                              selectedAssessmentId={
                                config.jd_id
                                  ? selectedInterviewVersionByJob[config.jd_id]
                                  : undefined
                              }
                              onSelectAssessment={(interviewId) =>
                                setSelectedInterviewVersionByJob((current) => ({
                                  ...current,
                                  [config.jd_id ?? '']: interviewId,
                                }))
                              }
                              /* Mode (Timed / Conversational) and Rounds, in place
                                 of the assessment panel's Round Weightage. */
                              renderChildDetail={(child) => {
                                const source = configsByJobVersionId.get(child.jd_id || '')
                                  ?.find((candidate) => candidate.id === child.id);
                                if (!source) {
                                  return <span className="text-sm text-gray-500 dark:text-slate-400">&mdash;</span>;
                                }
                                const mode = modeFromConfig(source.special_instructions, source.duration_minutes);
                                return (
                                  <span className="text-sm font-medium text-gray-900 dark:text-slate-100">
                                    {mode === 'fixed' ? 'Timed' : 'Conversational'}
                                  </span>
                                );
                              }}
                              renderChildExtraDetail={(child) => {
                                const source = configsByJobVersionId.get(child.jd_id || '')
                                  ?.find((candidate) => candidate.id === child.id);
                                const rounds = (source?.rounds_config || [])
                                  .filter((round) => round.enabled !== false);
                                if (rounds.length === 0) {
                                  return <span className="text-sm text-gray-500 dark:text-slate-400">&mdash;</span>;
                                }
                                return (
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {rounds.map((round, index) => (
                                      <span
                                        key={`${round.type}-${index}`}
                                        title={ROUND_LABELS[round.type] || round.type}
                                        className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-semibold whitespace-nowrap bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20 dark:bg-brand-blue/20 dark:text-blue-300 dark:ring-brand-blue/30"
                                      >
                                        {ROUND_SHORT_LABELS[round.type] || ROUND_LABELS[round.type] || round.type}
                                      </span>
                                    ))}
                                  </div>
                                );
                              }}
                              /* Actions column: just the 3-dot menu, sized as
                                 such so the table fills the panel unscrolled. */
                              menuOnlyActions
                              renderAction={(child) => {
                                const source = configsByJobVersionId.get(child.jd_id || '')
                                  ?.find((candidate) => candidate.id === child.id);
                                if (!source) return null;
                                return renderInterviewVersionActions(source);
                              }}
                              /* Opens the interview the row names, the same thing
                                 clicking the card does. */
                              onRowClick={(interviewId) => router.push(interviewDetailsHref(interviewId))}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                </>
              )}

              <ListPagination
                currentPage={configListPage}
                itemsPerPage={configListItemsPerPage}
                totalItems={collapsedConfigs.length}
                onPageChange={setConfigListPage}
                onItemsPerPageChange={setConfigListItemsPerPage}
                /* The list is one card per job, but the stat cards and tab badges
                   count every config. Say where the difference went so the footer
                   reconciles with them instead of looking like a miscount. */
                itemLabel="jobs"
              />
            </div>
          )}

          {/* Processing Tab */}
          {activeTab === 'processing' && (
            <div className="p-3 sm:p-6">
              {processingLoading ? (
                <div className="flex items-center justify-center py-12 tf-loader-center">
                  <Loader2 className="w-6 h-6 animate-spin text-brand-blue" />
                </div>
              ) : processingSessions.length === 0 ? (
                <div className="text-center py-12">
                  <Play className="w-10 h-10 mx-auto mb-3 text-brand-blue/30" />
                  <p className="text-gray-500 dark:text-slate-500 text-sm">No interviews currently in progress</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {paginatedProcessingSessions.map((session) => (
                    <div key={session.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] rounded-xl bg-white dark:bg-slate-900 gap-2 sm:gap-3 hover:border-brand-blue/30 hover:shadow-md hover:shadow-brand-blue/10 transition-all">
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-brand-orange/10 ring-1 ring-brand-orange/20 flex items-center justify-center flex-shrink-0">
                          <Play className="w-4 h-4 sm:w-5 sm:h-5 text-brand-orange-deep" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 dark:text-slate-50 text-sm sm:text-base truncate">{session.candidate_name || 'Unknown'}</div>
                          <div className="text-xs sm:text-sm text-gray-500 dark:text-slate-500 truncate">{session.jd_title || session.position}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 sm:gap-4 flex-wrap text-xs sm:text-sm pl-10 sm:pl-0">
                        <span className="text-gray-500 dark:text-slate-500">{getInterviewDuration(session.duration_minutes, (session as any).special_instructions)}</span>
                        {session.started_at && (
                          <span className="text-xs text-gray-400 dark:text-slate-500">
                            Started {formatIST(session.started_at)}
                          </span>
                        )}
                        <span className="px-2 sm:px-2.5 py-0.5 rounded-full text-2xs sm:text-xs font-medium bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20">
                          In Progress
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <ListPagination
                currentPage={processingPage}
                itemsPerPage={processingItemsPerPage}
                totalItems={processingSessions.length}
                onPageChange={setProcessingPage}
                onItemsPerPageChange={setProcessingItemsPerPage}
                itemLabel="interviews"
              />
            </div>
          )}

          {/* Candidate Results Tab — every candidate session across every
              interview, the same table the per-interview results view shows. */}
          {activeTab === 'candidate-results' && (
            <div className="p-3 sm:p-6">
              <AIInterviewCandidateResults toolbarSlot={toolbarSlotEl} refreshSignal={refreshSignal} />
            </div>
          )}

          {/* Invitation Status Tab — every invitation across every AI
              interview (draft, published and archived alike). The search and
              filters portal into the shared toolbar slot above the tab pills;
              the segmented status filter and the list live in this card —
              the Assessments page's own Invitation Status layout. */}
          {activeTab === 'invitation-status' && (
            <div className="p-3 sm:p-6">
              {isLoadingInviteStatus ? (
                /* Skeleton — the Assessments page's Invitation Status tab
                   skeleton, shaped to this tab: seven status segments plus the
                   completion-rate meter, the filter bar, then the invite
                   table's own columns (CID, Candidate, Job / Interview,
                   Status, Score, Timeline, Actions). */
                <>
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-4 sm:mb-5">
                    <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] self-start overflow-hidden max-w-full">
                      {Array.from({ length: 7 }).map((_, i) => (
                        <div key={i} className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 min-h-[36px]">
                          <Skeleton className="h-3.5 w-3.5 rounded" />
                          <Skeleton className="h-3.5 w-14" />
                          <Skeleton className="h-[18px] w-6 rounded-full" />
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-col gap-1 lg:items-end flex-shrink-0">
                      <div className="flex items-center gap-2.5 sm:gap-3">
                        <Skeleton className="h-3.5 w-24" />
                        <Skeleton className="h-1.5 w-20 sm:w-28 rounded-full" />
                        <Skeleton className="h-4 w-8" />
                      </div>
                      <Skeleton className="h-3 w-28" />
                    </div>
                  </div>

                  {/* Invitations table */}
                  <div className="border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden">
                    <div className="min-h-[320px] overflow-auto">
                      <table className="w-full min-w-[1000px] table-auto">
                        <thead className="[&_th]:bg-slate-50 dark:[&_th]:bg-slate-800 [&_th]:border-b [&_th]:border-gray-200 dark:[&_th]:border-slate-700">
                          <tr>
                            {['Select', 'CID', 'Candidate', 'Job ID', 'Job Title', 'Job Version', 'Interview Version', 'Invite Source', 'Status', 'Score', 'Timeline', 'Actions'].map((c) => (
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
                              <td className="px-4 py-4"><Skeleton className="h-5 w-16 rounded" /></td>
                              <td className="px-4 py-4"><Skeleton className="h-4 w-36" /></td>
                              <td className="px-4 py-4"><Skeleton className="h-5 w-9 rounded-md" /></td>
                              <td className="px-4 py-4"><Skeleton className="h-5 w-9 rounded-md" /></td>
                              <td className="px-4 py-4"><Skeleton className="h-4 w-24" /></td>
                              <td className="px-4 py-4"><Skeleton className="h-6 w-20 rounded-full" /></td>
                              <td className="px-4 py-4"><Skeleton className="h-5 w-20 mx-auto rounded-full" /></td>
                              <td className="px-4 py-4">
                                <div className="space-y-1.5">
                                  <Skeleton className="h-3 w-36" />
                                  <Skeleton className="h-3 w-28" />
                                </div>
                              </td>
                              <td className="px-4 py-4"><Skeleton className="h-8 w-8 rounded-md" /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : inviteStatusError ? (
                <div className="text-center py-12">
                  <p className="text-sm text-destructive mb-3">{inviteStatusError}</p>
                  <Button variant="primary" size="sm" onClick={loadAllInviteStatuses}>
                    Retry
                  </Button>
                </div>
              ) : inviteStatusRows.length === 0 ? (
                <div className="text-center py-16 sm:py-20">
                  <div className="w-14 h-14 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center mx-auto mb-4">
                    <Mail className="w-7 h-7 text-brand-blue" />
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-slate-50 mb-1">No invitations sent yet</h3>
                  <p className="text-sm text-gray-500 dark:text-slate-500 max-w-md mx-auto">
                    Invite candidates to an AI interview and their status appears here.
                  </p>
                </div>
              ) : (() => {
                const totalInvites = inviteStatusRows.length;
                const bucketCount = (predicate: (inv: any) => boolean) => inviteStatusRows.filter(predicate).length;
                const invitedCount = bucketCount((inv) => inv.status === 'invited');
                const expiredCount = bucketCount((inv) => resolveInviteStatus(inv) === 'expired');
                const inProgressCount = bucketCount((inv) => inv.status === 'in_progress');
                const completedCount = bucketCount((inv) => inv.status === 'completed');
                const terminatedCount = bucketCount((inv) => inv.status === 'terminated');
                const revokedCount = bucketCount((inv) => inv.status === 'revoked');
                const completionRate = totalInvites > 0 ? Math.round((completedCount / totalInvites) * 100) : 0;

                const search = inviteStatusFilters.search.trim().toLowerCase();
                /* Date range is inclusive of the whole `to` day — a recruiter
                   picking today expects today's invites, not those sent at
                   exactly 00:00. */
                const fromTime = inviteStatusFilters.dateFrom ? new Date(`${inviteStatusFilters.dateFrom}T00:00:00`).getTime() : null;
                const toTime = inviteStatusFilters.dateTo ? new Date(`${inviteStatusFilters.dateTo}T23:59:59.999`).getTime() : null;
                const filtered = inviteStatusRows.filter((inv) => {
                  if (inviteStatusFilters.status !== 'all' && resolveInviteStatus(inv) !== inviteStatusFilters.status) return false;
                  if (search) {
                    const haystack = [inv.candidate_name, inv.candidate_email, inv.candidate_cid, inv._config_title, inv._jd_short_id]
                      .filter(Boolean).join(' ').toLowerCase();
                    if (!haystack.includes(search)) return false;
                  }
                  if (fromTime !== null || toTime !== null) {
                    const sentAt = new Date(inv.invitation_sent_at || inv.created_at || 0).getTime();
                    if (!sentAt) return false;
                    if (fromTime !== null && sentAt < fromTime) return false;
                    if (toTime !== null && sentAt > toTime) return false;
                  }
                  const col = inviteStatusColumnFilters;
                  if (col.job && inv._jd_short_id !== col.job) return false;
                  if (col.jobVersion && String(inv._jd_version) !== col.jobVersion) return false;
                  if (col.interviewVersion && String(inv._interview_version) !== col.interviewVersion) return false;
                  if (col.inviteSource && inv.invite_source !== col.inviteSource) return false;
                  if (!matchesInviteResultFilter(inv, displayInviteScore(inv), col.result)) return false;
                  return true;
                });
                const total = filtered.length;
                const totalPages = Math.max(1, Math.ceil(total / inviteStatusItemsPerPage));
                const safePage = Math.min(Math.max(1, inviteStatusPage), totalPages);
                const pageItems = filtered.slice((safePage - 1) * inviteStatusItemsPerPage, safePage * inviteStatusItemsPerPage);
                const columnFilterCount = Object.values(inviteStatusColumnFilters).filter(Boolean).length;
                const filtersActive = hasActiveInviteFilters(inviteStatusFilters) || columnFilterCount > 0;

                /* Filter options come from the loaded invitations, so every
                   choice matches at least one row. */
                const jobOptions = jobFilterOptions(inviteStatusRows, (inv) => inv._jd_short_id, (inv) => inv._config_title);
                const jobVersionOptions = versionFilterOptions(inviteStatusRows, (inv) => inv._jd_version);
                const interviewVersionOptions = versionFilterOptions(inviteStatusRows, (inv) => inv._interview_version);
                const updateColumnFilter = (key: keyof typeof EMPTY_INVITE_COLUMN_FILTERS, value: string) => {
                  setInviteStatusColumnFilters((prev) => ({ ...prev, [key]: value }));
                  setInviteStatusPage(1);
                };

                /* Row selection — every row can be ticked, like the other
                   tabs; Select All covers this page. Revoke acts only on the
                   ticked rows that can still be revoked (Invited / In
                   Progress), and says how many that is. */
                const pageIds = pageItems.map((inv) => inv.id);
                const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedStatusInviteIds.has(id));
                const toggleSelectAllOnPage = () =>
                  setSelectedStatusInviteIds((prev) => {
                    const next = new Set(prev);
                    if (allPageSelected) pageIds.forEach((id) => next.delete(id));
                    else pageIds.forEach((id) => next.add(id));
                    return next;
                  });
                const toggleSelectOneInvite = (id: string) =>
                  setSelectedStatusInviteIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  });
                const selectedStatusRows = filtered.filter((inv) => selectedStatusInviteIds.has(inv.id));
                const revocableSelectedRows = selectedStatusRows.filter(isRevocableInvite);

                /* What More Filters reports: status off 'all' is one, and the
                   date range is one filter however many ends are set. */
                const inviteStatusFilterCount =
                  (inviteStatusFilters.status !== 'all' ? 1 : 0)
                  + (inviteStatusFilters.dateFrom || inviteStatusFilters.dateTo ? 1 : 0)
                  + columnFilterCount;
                const updateInviteStatusFilters = (patch: Partial<InviteFilterState>) => {
                  setInviteStatusFilters({ ...inviteStatusFilters, ...patch });
                  setInviteStatusPage(1);
                };

                /* This tab's search/filter row, in the shared slot ABOVE the
                   tab pills where every other tab's sits — the Assessments
                   page's Invitation Status layout. It used to be an
                   InviteFilterBar inside the card, the one tab whose search
                   sat below the pills. */
                const inviteStatusToolbar = (
                  <>
                    <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50 tracking-tight mb-3">
                      Invitation Status ({totalInvites})
                    </h2>
                    <ListToolbar
                      searchValue={inviteStatusFilters.search}
                      onSearchChange={(value) => updateInviteStatusFilters({ search: value })}
                      searchPlaceholder="Search by candidate name, email, or job..."
                      onToggleFilters={() => setShowInviteStatusFilters((open) => !open)}
                      filtersOpen={showInviteStatusFilters}
                      activeFilterCount={inviteStatusFilterCount}
                      filtersApplied={inviteStatusFilterCount > 0}
                      onClearFilters={() => {
                        setInviteStatusFilters(EMPTY_INVITE_FILTERS);
                        setInviteStatusColumnFilters(EMPTY_INVITE_COLUMN_FILTERS);
                        setInviteStatusPage(1);
                      }}
                      className="mb-0"
                      countBadge={
                        <ListCountBadge
                          filtered={total}
                          total={totalInvites}
                          noun="invitation"
                          selected={selectedStatusRows.length}
                        />
                      }
                      filterPanel={
                        /* One filter per column with a fixed set of values —
                           candidate and CID are what the search box is for,
                           and Timeline is covered by the Invited date range. */
                        <div className="rounded-xl border border-gray-100 dark:border-slate-700/60 bg-slate-50/60 dark:bg-slate-800/30 p-3 sm:p-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                            <SearchableSelect
                              label="Job"
                              value={inviteStatusColumnFilters.job}
                              onChange={(v) => updateColumnFilter('job', v)}
                              options={jobOptions}
                              placeholder="All jobs"
                              searchPlaceholder="Search job ID or title..."
                              allLabel="All jobs"
                              emptyMessage="No jobs match"
                            />
                            <FilterSelect id="ai-invite-job-version" label="Job Version" anyLabel="All versions"
                              value={inviteStatusColumnFilters.jobVersion} onChange={(v) => updateColumnFilter('jobVersion', v)}
                              options={jobVersionOptions} />
                            <FilterSelect id="ai-invite-interview-version" label="Interview Version" anyLabel="All versions"
                              value={inviteStatusColumnFilters.interviewVersion} onChange={(v) => updateColumnFilter('interviewVersion', v)}
                              options={interviewVersionOptions} />
                            <FilterSelect id="ai-invite-source" label="Invite Source" anyLabel="All sources"
                              value={inviteStatusColumnFilters.inviteSource} onChange={(v) => updateColumnFilter('inviteSource', v)}
                              options={INVITE_SOURCE_FILTER_OPTIONS} />
                            <FilterSelect id="ai-invite-result" label="Result" anyLabel="Any result"
                              value={inviteStatusColumnFilters.result} onChange={(v) => updateColumnFilter('result', v)}
                              options={RESULT_FILTER_OPTIONS} />
                            <div>
                              <label htmlFor="ai-invite-status-filter" className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                                Status
                              </label>
                              <select
                                id="ai-invite-status-filter"
                                value={inviteStatusFilters.status}
                                onChange={(e) => updateInviteStatusFilters({ status: e.target.value })}
                                className={AI_FILTER_FIELD_CLASS}
                              >
                                {INVITATION_STATUS_TAB_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label htmlFor="ai-invite-sent-from" className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                                Invited from
                              </label>
                              <DateField
                                id="ai-invite-sent-from"
                                value={inviteStatusFilters.dateFrom}
                                max={inviteStatusFilters.dateTo || undefined}
                                onChange={(v) => updateInviteStatusFilters({ dateFrom: v })}
                              />
                            </div>
                            <div>
                              <label htmlFor="ai-invite-sent-to" className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                                Invited to
                              </label>
                              <DateField
                                id="ai-invite-sent-to"
                                value={inviteStatusFilters.dateTo}
                                min={inviteStatusFilters.dateFrom || undefined}
                                onChange={(v) => updateInviteStatusFilters({ dateTo: v })}
                              />
                            </div>
                          </div>
                          <div className="mt-4 pt-3 border-t border-gray-200 dark:border-slate-700/60 flex items-center justify-end gap-2">
                            <Button variant="secondary" size="sm" onClick={() => setShowInviteStatusFilters(false)}>
                              Done
                            </Button>
                          </div>
                        </div>
                      }
                    />
                  </>
                );

                /* Segmented status filter — same shape as the Assessments
                   page's Invitation Status tab: a raised-white selected pill
                   in its status colour, a count badge tinted the same way,
                   and a completion-rate meter beside it rather than a fifth
                   segment (nothing to filter to). */
                const segments = ([
                  { key: 'all', label: 'Total', Icon: Users, value: totalInvites,
                    text: 'text-gray-700 dark:text-slate-300', hover: 'hover:text-gray-900 dark:hover:text-slate-100', tint: 'bg-gray-100 dark:bg-slate-700/50', ring: 'ring-gray-300 dark:ring-slate-600' },
                  { key: 'invited', label: 'Invited', Icon: Mail, value: invitedCount,
                    text: 'text-status-invited', hover: 'hover:text-status-invited', tint: 'bg-status-invited/10', ring: 'ring-status-invited/20' },
                  { key: 'in_progress', label: 'In Progress', Icon: Play, value: inProgressCount,
                    text: 'text-status-progress', hover: 'hover:text-status-progress', tint: 'bg-status-progress/10', ring: 'ring-status-progress/20' },
                  { key: 'completed', label: 'Completed', Icon: CheckCircle, value: completedCount,
                    text: 'text-status-completed', hover: 'hover:text-status-completed', tint: 'bg-status-completed/10', ring: 'ring-status-completed/20' },
                  { key: 'expired', label: 'Expired', Icon: Clock, value: expiredCount,
                    text: 'text-status-expired', hover: 'hover:text-status-expired', tint: 'bg-status-expired/10', ring: 'ring-status-expired/20' },
                  { key: 'terminated', label: 'Terminated', Icon: Ban, value: terminatedCount,
                    text: 'text-destructive', hover: 'hover:text-destructive', tint: 'bg-destructive-subtle', ring: 'ring-destructive-line' },
                  { key: 'revoked', label: 'Revoked', Icon: Ban, value: revokedCount,
                    text: 'text-indigo-700', hover: 'hover:text-indigo-700', tint: 'bg-indigo-50', ring: 'ring-indigo-200' },
                ] as const);

                return (
                  <>
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-4 sm:mb-5">
                      <div
                        role="group"
                        aria-label="Filter invitations by status"
                        className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] self-start overflow-x-auto scrollbar-hide max-w-full"
                      >
                        {segments.map((segment) => {
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
                              onClick={() => {
                                setInviteStatusFilters({
                                  ...inviteStatusFilters,
                                  status: isActive && segment.key !== 'all' ? 'all' : segment.key,
                                });
                                setInviteStatusPage(1);
                              }}
                              className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-medium transition-all duration-200 whitespace-nowrap ${
                                isActive
                                  ? `bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/10 ring-1 ${segment.text} ${segment.ring}`
                                  : `text-gray-600 dark:text-slate-400 ${segment.hover}`
                              }`}
                            >
                              <segment.Icon className={`w-3.5 h-3.5 flex-shrink-0 ${segment.text}`} />
                              {segment.label}
                              <span className={`inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full text-2xs font-semibold tabular-nums ring-1 transition-colors ${segment.text} ${segment.tint} ${segment.ring}`}>
                                {segment.value.toLocaleString()}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      <div className="flex flex-col gap-1 lg:items-end flex-shrink-0">
                        <div className="flex items-center gap-2.5 sm:gap-3">
                          <span className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 whitespace-nowrap">Completion rate</span>
                          <div className="h-1.5 w-20 sm:w-28 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden flex-shrink-0">
                            <div className="h-full rounded-full bg-brand-blue transition-all" style={{ width: `${completionRate}%` }} />
                          </div>
                          <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-slate-50">{completionRate}%</span>
                        </div>
                        <span className="text-xs text-gray-500 dark:text-slate-500 whitespace-nowrap">
                          {completedCount.toLocaleString()} of {totalInvites.toLocaleString()} completed
                        </span>
                      </div>
                    </div>

                    {toolbarSlotEl ? createPortal(inviteStatusToolbar, toolbarSlotEl) : inviteStatusToolbar}

                    <div className="mt-4">
                      <AIInterviewInviteTable
                        invitations={pageItems}
                        isLoading={false}
                        hasActiveFilters={filtersActive}
                        showJobColumn
                        selectedIds={selectedStatusInviteIds}
                        onToggleSelect={toggleSelectOneInvite}
                        isSelectable={() => true}
                        allSelected={allPageSelected}
                        onToggleSelectAll={toggleSelectAllOnPage}
                        onResend={(inv) => setResendInviteTarget(inv)}
                        onEdit={(inv) => {
                          setEditInviteForm({
                            candidate_name: inv.candidate_name || '',
                            candidate_email: inv.candidate_email || '',
                          });
                          setEditInviteTarget(inv);
                        }}
                        onRevoke={(inv) => setRevokeInviteTarget(inv)}
                        onViewDetails={(inv) => handleViewCandidateDetail(inv.id)}
                        resendingId={resendingEmailFor}
                        revokingId={revokingInviteFor}
                      />
                      <ListPagination
                        currentPage={safePage}
                        itemsPerPage={inviteStatusItemsPerPage}
                        totalItems={total}
                        onPageChange={setInviteStatusPage}
                        onItemsPerPageChange={(size) => { setInviteStatusItemsPerPage(size); setInviteStatusPage(1); }}
                        itemLabel="invitations"
                      />
                    </div>

                    {/* Bulk revoke — the Track dialog's bulk revoke, over this
                        tab's ticked rows that can still be revoked. Each is
                        revoked on its own, so one link that already changed
                        state doesn't block the rest. */}
                    <ConfirmationDialog
                      isOpen={statusBulkRevokeOpen}
                      onClose={() => { if (!isBulkRevoking) setStatusBulkRevokeOpen(false); }}
                      onConfirm={async () => {
                        const targets = revocableSelectedRows;
                        if (targets.length === 0) { setStatusBulkRevokeOpen(false); return; }
                        setIsBulkRevoking(true);
                        try {
                          const results = await Promise.allSettled(
                            targets.map((inv) => aiInterviewService.revokeInvitation(inv.id))
                          );
                          const succeeded = results.filter((r) => r.status === 'fulfilled').length;
                          const failed = results.length - succeeded;
                          if (succeeded > 0) toast.success(`Revoked ${succeeded} invitation${succeeded === 1 ? '' : 's'}.`);
                          if (failed > 0) toast.error(`Failed to revoke ${failed} invitation${failed === 1 ? '' : 's'}.`);
                          setSelectedStatusInviteIds(new Set());
                          await loadAllInviteStatuses();
                        } finally {
                          setIsBulkRevoking(false);
                          setStatusBulkRevokeOpen(false);
                        }
                      }}
                      /* Same shape as the bulk Resend confirmation: a question,
                         one sentence saying what happens, and the count on the
                         confirm button — no per-candidate list. */
                      title="Revoke invitations for selected candidates?"
                      description={`The interview link for ${revocableSelectedRows.length} selected candidate${revocableSelectedRows.length === 1 ? '' : 's'} will stop working immediately.${
                        revocableSelectedRows.length < selectedStatusRows.length
                          ? ` ${selectedStatusRows.length - revocableSelectedRows.length} selected invitation${selectedStatusRows.length - revocableSelectedRows.length === 1 ? ' is' : 's are'} not Invited or In Progress and will be left as ${selectedStatusRows.length - revocableSelectedRows.length === 1 ? 'it is' : 'they are'}.`
                          : ''
                      }`}
                      confirmText={isBulkRevoking ? 'Revoking…' : `Yes, revoke ${revocableSelectedRows.length}`}
                      cancelText="Cancel"
                      variant="danger"
                    />
                  </>
                );
              })()}
            </div>
          )}

          {/* Activity Logs Tab */}
          {activeTab === 'audit' && (
            <div className="p-3 sm:p-6">
              <AIInterviewAuditTrail toolbarSlot={toolbarSlotEl} refreshSignal={refreshSignal} />
            </div>
          )}

          {/* Consent Logs Tab */}
          {activeTab === 'consent' && (
            <div className="p-3 sm:p-6">
              <ConsentLogsWrapper />
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="p-3 sm:p-6">
              {/* Settings Sub-tabs */}
              <div className="flex gap-3 sm:gap-4 mb-4 sm:mb-6 border-b border-gray-100 dark:border-slate-700/60">
                {[
                  { key: 'general', label: 'General' },
                  // Proctoring settings are a staging-only testing menu — hidden in
                  // production, where proctoring runs on enforced defaults.
                  ...(IS_PRODUCTION_ENV ? [] : [{ key: 'proctoring', label: 'Proctoring' }]),
                ].map(sub => (
                  <button
                    key={sub.key}
                    onClick={() => setSettingsSubTab(sub.key as 'general' | 'proctoring')}
                    className={`pb-2 sm:pb-3 text-xs sm:text-sm border-b-2 transition-colors ${
                      settingsSubTab === sub.key
                        ? 'border-brand-blue text-brand-blue font-medium'
                        : 'border-transparent text-gray-600 dark:text-slate-400 hover:text-brand-blue'
                    }`}
                  >
                    {sub.label}
                  </button>
                ))}
              </div>

              {/* General Settings */}
              {settingsSubTab === 'general' && (
                <div className="max-w-3xl space-y-6">
                  <div>
                    <h3 className="text-gray-900 dark:text-slate-50 font-medium mb-4">Interview Configuration</h3>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm text-gray-700 dark:text-slate-300 mb-2">
                          Default Interview Duration
                        </label>
                        <select
                          value={settingsDuration}
                          onChange={(e) => setSettingsDuration(parseInt(e.target.value))}
                          className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-gray-900 dark:text-slate-50 bg-white dark:bg-slate-900"
                        >
                          <option value="30">30 minutes</option>
                          <option value="45">45 minutes</option>
                          <option value="60">60 minutes</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm text-gray-700 dark:text-slate-300 mb-2">
                          AI Voice Language
                        </label>
                        <select
                          value={settingsLanguage}
                          onChange={(e) => setSettingsLanguage(e.target.value)}
                          className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-gray-900 dark:text-slate-50 bg-white dark:bg-slate-900"
                        >
                          <option>English (US)</option>
                          <option>English (UK)</option>
                          <option>Spanish</option>
                          <option>French</option>
                        </select>
                      </div>

                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id="auto-record"
                          checked={settingsAutoRecord}
                          onChange={(e) => setSettingsAutoRecord(e.target.checked)}
                          className="rounded border-gray-300 dark:border-slate-700 text-brand-blue focus:ring-brand-blue/40"
                        />
                        <label htmlFor="auto-record" className="text-sm text-gray-700 dark:text-slate-300">
                          Automatically record all interviews
                        </label>
                      </div>

                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id="send-reminders"
                          checked={settingsReminders}
                          onChange={(e) => setSettingsReminders(e.target.checked)}
                          className="rounded border-gray-300 dark:border-slate-700 text-brand-blue focus:ring-brand-blue/40"
                        />
                        <label htmlFor="send-reminders" className="text-sm text-gray-700 dark:text-slate-300">
                          Send reminder emails to candidates
                        </label>
                      </div>

                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id="ai-analysis"
                          checked={settingsSentiment}
                          onChange={(e) => setSettingsSentiment(e.target.checked)}
                          className="rounded border-gray-300 dark:border-slate-700 text-brand-blue focus:ring-brand-blue/40"
                        />
                        <label htmlFor="ai-analysis" className="text-sm text-gray-700 dark:text-slate-300">
                          Enable AI-powered sentiment analysis
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-gray-100 dark:border-slate-700/60">
                    <Button variant="primary" size="md" onClick={handleSaveSettings}>
                      Save Settings
                    </Button>
                  </div>
                </div>
              )}

              {/* Proctoring Settings — staging-only testing menu; hidden in production. */}
              {settingsSubTab === 'proctoring' && !IS_PRODUCTION_ENV && (
                <div className="max-w-3xl space-y-6">
                  {proctoringLoading ? (
                    <div className="flex items-center justify-center py-12 tf-loader-center">
                      <Loader2 className="w-6 h-6 animate-spin text-brand-blue" />
                    </div>
                  ) : (
                    <>
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <h3 className="text-gray-900 dark:text-slate-50 font-medium">Proctoring Settings</h3>
                            <p className="text-sm text-gray-500 dark:text-slate-500 mt-1">
                              Configure security monitoring for AI interview sessions
                            </p>
                          </div>
                          <label className="flex items-center gap-3 cursor-pointer">
                            <span className="text-sm text-gray-600 dark:text-slate-400">Master Toggle</span>
                            <div className="relative">
                              <input
                                type="checkbox"
                                checked={proctoringEnabled}
                                onChange={(e) => setProctoringEnabled(e.target.checked)}
                                className="sr-only"
                              />
                              <div className={`w-11 h-6 rounded-full transition-colors ${proctoringEnabled ? 'bg-brand-blue shadow-sm shadow-brand-blue/25' : 'bg-gray-300'}`}>
                                <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform ${proctoringEnabled ? 'translate-x-5' : 'translate-x-0.5'} mt-0.5`} />
                              </div>
                            </div>
                          </label>
                        </div>

                        {proctoringEnabled && (
                          <div className="space-y-4">
                            <h4 className="text-sm font-medium text-gray-700 dark:text-slate-300">Security Features</h4>
                            {[
                              { key: 'webcam_monitoring', label: 'Webcam Monitoring', icon: Camera, desc: 'Monitor candidate via webcam during interview' },
                              { key: 'screen_recording', label: 'Screen Recording', icon: Monitor, desc: 'Record candidate screen during interview' },
                              { key: 'tab_switch_detection', label: 'Tab Switch Detection', icon: AlertTriangle, desc: 'Detect when candidate switches browser tabs' },
                              { key: 'copy_paste_prevention', label: 'Copy-Paste Prevention', icon: Copy, desc: 'Prevent copying and pasting during interview' },
                              { key: 'browser_lockdown', label: 'Browser Lockdown', icon: Shield, desc: 'Lock browser to interview window only' },
                              { key: 'ai_cheating_prevention', label: 'AI Cheating Prevention', icon: Brain, desc: 'Detect AI-generated responses' },
                            ].map(({ key, label, icon: Icon, desc }) => (
                              <div key={key} className="flex items-center justify-between p-2.5 sm:p-3 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] rounded-xl bg-white dark:bg-slate-900 gap-2 hover:border-brand-blue/30 transition-colors">
                                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                                  <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue flex-shrink-0" />
                                  <div className="min-w-0">
                                    <div className="text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-300">{label}</div>
                                    <div className="text-2xs sm:text-xs text-gray-500 dark:text-slate-500 hidden sm:block">{desc}</div>
                                  </div>
                                </div>
                                <input
                                  type="checkbox"
                                  checked={(proctoringSettings as any)[key]}
                                  onChange={(e) => setProctoringSettings(prev => ({ ...prev, [key]: e.target.checked }))}
                                  className="rounded border-gray-300 dark:border-slate-700 text-brand-blue focus:ring-brand-blue/40"
                                />
                              </div>
                            ))}

                            <h4 className="text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-300 mt-4 sm:mt-6">Thresholds</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                              <div>
                                <label className="block text-xs text-gray-600 dark:text-slate-400 mb-1">Max Tab Switches</label>
                                <input
                                  type="number"
                                  value={proctoringSettings.max_tab_switches}
                                  onChange={(e) => setProctoringSettings(prev => ({ ...prev, max_tab_switches: parseInt(e.target.value) || 3 }))}
                                  className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm text-gray-900 dark:text-slate-50 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                                  min={1}
                                  max={20}
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-600 dark:text-slate-400 mb-1">Max Violations</label>
                                <input
                                  type="number"
                                  value={proctoringSettings.max_violations}
                                  onChange={(e) => setProctoringSettings(prev => ({ ...prev, max_violations: parseInt(e.target.value) || 5 }))}
                                  className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm text-gray-900 dark:text-slate-50 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                                  min={1}
                                  max={50}
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-600 dark:text-slate-400 mb-1">Retention (days)</label>
                                <input
                                  type="number"
                                  value={proctoringSettings.retention_days}
                                  onChange={(e) => setProctoringSettings(prev => ({ ...prev, retention_days: parseInt(e.target.value) || 90 }))}
                                  className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm text-gray-900 dark:text-slate-50 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                                  min={7}
                                  max={365}
                                />
                              </div>
                            </div>

                            <h4 className="text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-300 mt-4 sm:mt-6">Violation Risk Score Thresholds</h4>
                            <p className="text-2xs text-gray-500 dark:text-slate-500 mb-2">Set the score boundaries for Low / Medium / High risk in the Violations tab. Each violation scores 1 pt (Low), 2 pts (Medium), or 3 pts (High).</p>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                              <div>
                                <label className="block text-xs text-gray-600 dark:text-slate-400 mb-1">
                                  Low Risk ≤ <span className="font-semibold text-success">{proctoringSettings.violation_low_threshold} pts</span>
                                </label>
                                <input
                                  type="number"
                                  value={proctoringSettings.violation_low_threshold}
                                  onChange={(e) => {
                                    const val = Math.max(1, parseInt(e.target.value) || 1);
                                    setProctoringSettings(prev => ({
                                      ...prev,
                                      violation_low_threshold: val,
                                      violation_medium_threshold: Math.max(prev.violation_medium_threshold, val + 1),
                                    }));
                                  }}
                                  className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm text-gray-900 dark:text-slate-50 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                                  min={1}
                                  max={proctoringSettings.violation_medium_threshold - 1}
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-600 dark:text-slate-400 mb-1">
                                  Medium Risk ≤ <span className="font-semibold text-warning">{proctoringSettings.violation_medium_threshold} pts</span>
                                </label>
                                <input
                                  type="number"
                                  value={proctoringSettings.violation_medium_threshold}
                                  onChange={(e) => {
                                    const val = Math.max(proctoringSettings.violation_low_threshold + 1, parseInt(e.target.value) || proctoringSettings.violation_low_threshold + 1);
                                    setProctoringSettings(prev => ({ ...prev, violation_medium_threshold: val }));
                                  }}
                                  className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm text-gray-900 dark:text-slate-50 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                                  min={proctoringSettings.violation_low_threshold + 1}
                                />
                              </div>
                              <div className="flex flex-col justify-end pb-1">
                                <p className="text-xs text-destructive font-medium">High Risk &gt; {proctoringSettings.violation_medium_threshold} pts</p>
                                <p className="text-2xs text-gray-400 dark:text-slate-500 mt-1">Automatically calculated from Medium threshold</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="pt-6 border-t border-gray-100 dark:border-slate-700/60">
                        <Button variant="primary" size="md" onClick={handleSaveProctoringSettings}>
                          Save Proctoring Settings
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        </>
        )}
      </div>
      </div>

      {/* Send Invite — a flat table of every active interview version (the
          Active tab's list view), a single radio pick across the dialog, an
          eye per row for the Configure Details preview, and Continue hands the
          chosen interview to the existing Share modal. */}
      {showInvitePicker && (() => {
        const closePicker = () => {
          setShowInvitePicker(false);
          setInvitePickerSelection(null);
        };

        /* Resolve the picked interview off live data, and say why it cannot be
           sent if so — the version table offers every version of a job, Drafts
           and Archived among them, so "picked" and "sendable" are two different
           questions and the footer answers the second. */
        const chosen = invitePickerSelection
          ? [...configs, ...archivedConfigs].find((c) => c.id === invitePickerSelection.interviewId) ?? null
          : null;
        const chosenStatus = chosen ? normalizeConfigStatus(chosen.status) : null;
        const blockedReason = !invitePickerSelection
          ? null
          : !chosen
            ? 'Select an interview version'
            : chosenStatus === 'draft'
              ? 'Publish this interview version before inviting'
              : chosenStatus === 'archived'
                ? 'Archived interview versions cannot be invited'
                : chosenStatus !== 'published'
                  ? 'Only active interview versions can be invited'
                  : null;

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm p-3 sm:p-6"
            onClick={(e) => { if (e.target === e.currentTarget) closePicker(); }}
            role="dialog"
            aria-modal="true"
          >
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] w-full max-w-[95vw] sm:max-w-lg md:max-w-2xl lg:max-w-6xl xl:max-w-7xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col overflow-hidden">
              {/* Header */}
              <div className="flex-shrink-0 flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-slate-700/60">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex-shrink-0">
                    <Mail className="w-4 h-4 text-brand-blue" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50 tracking-tight">Send Invite</h2>
                    <p className="text-xs text-gray-500 dark:text-slate-500 mt-0.5">Pick the active interview to send</p>
                  </div>
                </div>
                <Button variant="secondary" size="sm" onClick={closePicker} aria-label="Close" className="px-2 flex-shrink-0">
                  <X className="w-5 h-5" />
                </Button>
              </div>

              {/* Content */}
              <div ref={invitePickerScrollRef} className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
                <AIInterviewPicker
                  configs={[...configs, ...archivedConfigs]}
                  selection={invitePickerSelection}
                  onSelectionChange={setInvitePickerSelection}
                  scrollContainerRef={invitePickerScrollRef}
                />
              </div>

              {/* Footer */}
              <div className="shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 sm:p-6 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-200 dark:border-slate-700">
                <div className="min-w-0 truncate whitespace-nowrap text-xs sm:text-sm text-gray-700 dark:text-slate-300">
                  {!invitePickerSelection ? (
                    'Select an interview to continue'
                  ) : blockedReason ? (
                    <span className="inline-flex items-center gap-1.5 align-middle text-brand-orange-deep">
                      <Info className="w-4 h-4 flex-shrink-0" />
                      {blockedReason}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 align-middle">
                      <CheckCircle className="w-4 h-4 text-brand-blue flex-shrink-0" />
                      Ready to invite candidates to {chosen?.jd_title || chosen?.position || 'this interview'}
                    </span>
                  )}
                </div>
                <div className="flex gap-2 sm:gap-3 w-full sm:w-auto">
                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => {
                      if (!chosen || blockedReason) {
                        toast.error(blockedReason ?? 'Please select an interview version');
                        return;
                      }
                      setShareConfig(chosen);
                      closePicker();
                    }}
                    disabled={!chosen || !!blockedReason}
                    icon={<Mail className="w-4 h-4" />}
                    className="flex-1 sm:flex-none whitespace-nowrap"
                  >
                    Continue
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Share Modal */}
      {shareConfig && (
        <ShareAIInterviewModal
          isOpen={!!shareConfig}
          onClose={() => {
            setShareConfig(null);
            // Return to the Candidate Invitations popup if we opened Share
            // from there (via "Invite More").
            if (shareReturnToInvites) {
              setViewInvitationsConfig(shareReturnToInvites);
              setShareReturnToInvites(null);
            }
          }}
          config={shareConfig}
          onInviteSent={() => {
            loadData();
            // loadData() only refreshes the config list's own counters — the
            // Candidate Invitations popup (if it's the one Share was opened
            // from) reads a separate list + stat-card fetch that this never
            // touched, so a newly-sent invite's row sat on stale/no data
            // until some OTHER action (Resend/Revoke/Edit) happened to
            // trigger refreshInvitationsView. Refresh it here too, whichever
            // config is currently open in that popup.
            if (viewInvitationsConfig) {
              refreshInvitationsView(viewInvitationsConfig.id);
            }
          }}
        />
      )}

      {/* Candidate Detail Loading Overlay */}
      {candidateDetailLoading && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-white/60 dark:bg-slate-950/60">
          <Loader2 className="w-8 h-8 animate-spin text-brand-blue" />
        </div>
      )}

      {/* Invite Status Tracking — same dialog the Assessments page uses, down to
          the clickable stat row, the table shell and the footer pagination. The
          list itself is <AIInterviewInviteTable>, shared with the Job Details
          tracker so both entry points show identical columns and action rules. */}
      {viewInvitationsConfig && (() => {
        /* Selection follows the selected card, as on the Assessments page:
           the Invited card ticks the rows that can be revoked and offers
           Revoke; the Expired card ticks the rows a fresh link can go to and
           offers Resend. Every other card has no bulk action, so no checkbox
           column either. "Select All" only ever targets the CURRENT page — the
           list is server-paginated. The row rules are the table's own, so a
           checkbox can never disagree with the action it feeds. */
        const trackerBulkMode: 'revoke' | 'resend' | null =
          inviteFilters.status === 'invited' ? 'revoke'
            : inviteFilters.status === 'expired' ? 'resend'
              : null;
        const isTrackerResendable = (inv: any) => isExpiredForActions(inv) && !inv.started_at && !inv.completed_at;
        const trackerRowSelectable = trackerBulkMode === 'resend' ? isTrackerResendable : isRevocableInvite;
        const selectableIds = trackerBulkMode ? invitations.filter(trackerRowSelectable).map((inv) => inv.id) : [];
        const trackerSelectedRows = invitations.filter((inv) => selectedInviteIds.has(inv.id) && trackerRowSelectable(inv));
        const allSelectableOnPageSelected =
          selectableIds.length > 0 && selectableIds.every((id) => selectedInviteIds.has(id));
        const toggleSelectAll = () =>
          setSelectedInviteIds(() => (allSelectableOnPageSelected ? new Set<string>() : new Set(selectableIds)));
        const toggleSelectOne = (id: string) =>
          setSelectedInviteIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          });

        /* Two different loading states, because they have to look different.
           With no rows yet (first open, or a filter that emptied the list) the
           spinner is the whole body, which is right - there is nothing for it
           to sit over. With rows already on screen and a re-read in flight
           (Refresh, a page turn, a filter change) the rows stay put and the
           spinner rides over them: swapping a full list for a `py-12` spinner
           collapsed the body to a fraction of its height, and the
           content-driven, vertically-centred dialog jumped with it. */
        const invitesInitialLoading = loadingInvitations && invitations.length === 0;
        const invitesRefreshVeil = loadingInvitations && invitations.length > 0;

        const filtersActive = hasActiveInviteFilters(inviteFilters);
        const startIndex = invitationTotal === 0 ? 0 : (invitationPage - 1) * INVITATION_PAGE_SIZE + 1;
        const endIndex = Math.min(invitationPage * INVITATION_PAGE_SIZE, invitationTotal);
        const invitationResultsLabel = filtersActive
          ? `${invitationTotal} matching candidate${invitationTotal === 1 ? '' : 's'}`
          : `Showing ${startIndex} to ${endIndex} of ${invitationTotal} invites`;

        const completionRate = invitationOverview.total > 0
          ? Math.round((invitationOverview.completed / invitationOverview.total) * 100)
          : 0;

        const pageBtn =
          'px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm border border-gray-200 dark:border-slate-700 ' +
          'bg-white dark:bg-slate-900 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed ' +
          'hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors';

        return (
          <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4 md:p-6">
            {/* Height is content-driven with a viewport cap, not a fixed dvh: a
                three-invite list on a large monitor used to stretch the dialog the
                full screen with empty space under the rows. The list absorbs the
                overflow once the cap engages, so a long list still scrolls inside
                the dialog on a 320px phone. */}
            <div
              /* Width is fixed by the breakpoint ladder and no state touches
                 it; height is what moved, so only height is pinned, and only
                 while a refresh is in flight. */
              {...invitesHeightLock.dialogProps}
              className={TRACKER_DIALOG_PANEL_CLASS}>
              {/* Header */}
              <div className="px-3 sm:px-6 py-2.5 sm:py-4 border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 flex items-center justify-between flex-shrink-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-brand-blue flex items-center justify-center shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 flex-shrink-0">
                      <Users className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-sm sm:text-lg font-semibold text-gray-900 dark:text-slate-50 truncate tracking-tight">
                        <span className="hidden sm:inline">AI Interview - Invite Status Tracking</span>
                        <span className="sm:hidden">Invite Status</span>
                      </h2>
                      {/* JD ID, then the job title. */}
                      <p className="flex items-center gap-2 text-2xs sm:text-sm text-gray-500 dark:text-slate-500 mt-0.5 min-w-0">
                        {viewInvitationsConfig.jd_short_id && (
                          <JobIdBadge className="flex-shrink-0">{viewInvitationsConfig.jd_short_id}</JobIdBadge>
                        )}
                        <span className="truncate">{viewInvitationsConfig.jd_title || viewInvitationsConfig.position}</span>
                        {/* Opened from a version row, the table has no version
                            columns — the header names the version instead. */}
                        {!trackerShowVersions && (
                          <span className="-ml-0.5 flex items-center gap-3 flex-shrink-0 whitespace-nowrap">
                            {/* The job version reads as part of the title: "App development - V1". */}
                            <span className="inline-flex items-center gap-1.5">
                              -
                              <VersionPill kind="job" version={viewInvitationsConfig.jd_version ?? 1} />
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                              Interview Version -
                              <VersionPill
                                kind="interview"
                                version={interviewVersionOrdinal(viewInvitationsConfig, [...configs, ...archivedConfigs])}
                              />
                            </span>
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                  {/* Refetches the live statuses in place — the popup stays
                      open, the icon spins while the request runs, and the
                      handler's guard drops repeat clicks until it settles. */}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleRefreshInvitations}
                    disabled={isRefreshingInvites || loadingInvitations}
                    title="Fetch the latest invite statuses"
                    aria-label="Refresh"
                    icon={<RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isRefreshingInvites ? 'animate-spin' : ''}`} />}
                  >
                    {/* The label swaps to "Refreshing..." mid-request, and the
                        longer word used to widen the button and shove the
                        close X sideways. The span reserves the wider word's
                        width in both states, so the header never moves. */}
                    <span className="hidden sm:inline-block min-w-[5.5rem] text-left">
                      {isRefreshingInvites ? 'Refreshing...' : 'Refresh'}
                    </span>
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setViewInvitationsConfig(null)} aria-label="Close" className="px-2">
                    <X className="w-4 h-4 sm:w-5 sm:h-5" />
                  </Button>
                </div>
              </div>

              {/* Stat row doubles as the status filter. Counts come from
                  loadInvitationOverview, which queries unfiltered — selecting a
                  bucket narrows the table without collapsing the other cards. */}
              <InviteStatCards
                gridClassName="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-1 sm:gap-2 lg:gap-3"
                activeStatus={inviteFilters.status}
                onSelect={(status) => {
                  setInviteFilters({ ...inviteFilters, status });
                  setInvitationPage(1);
                }}
                cards={[
                  { key: 'all', label: 'Total', Icon: Users, value: invitationOverview.total, ...INVITE_CARD_TONES.slate },
                  { key: 'invited', label: 'Invited', Icon: Mail, value: invitationOverview.invited, ...INVITE_CARD_TONES.blue },
                  { key: 'in_progress', label: 'In Progress', Icon: Play, value: invitationOverview.inProgress, ...INVITE_CARD_TONES.orange },
                  { key: 'completed', label: 'Completed', Icon: CheckCircle, value: invitationOverview.completed, ...INVITE_CARD_TONES.green },
                  { key: 'expired', label: 'Expired', Icon: Clock, value: invitationOverview.expired, ...INVITE_CARD_TONES.orange },
                  { key: 'terminated', label: 'Terminated', Icon: Ban, value: invitationOverview.terminated, ...INVITE_CARD_TONES.red },
                  { key: 'revoked', label: 'Revoked', Icon: Ban, value: invitationOverview.revoked, ...INVITE_CARD_TONES.indigo },
                ]}
              />

              {/* Row clicks and View Details open the candidate result only for
                  Completed / Auto Completed invites — same note and banner
                  treatment as the assessment tracker, so the recruiter knows
                  why other rows don't navigate anywhere. */}
              <div className="px-2.5 sm:px-6 pt-2 sm:pt-3 flex-shrink-0">
                <div className="flex items-center gap-2.5 rounded-xl bg-brand-blue/[0.08] border border-brand-blue/20 px-3 py-2.5">
                  <Info className="w-4 h-4 text-brand-blue flex-shrink-0" />
                  <p className="flex-1 min-w-0 text-xs sm:text-sm text-gray-700 dark:text-slate-300">
                    <span className="font-semibold">Note:</span> Results are available only for candidates with Completed and Terminated status. Other candidates&rsquo; results are not available.
                  </p>
                  {/* Completion rate — moved here from the selection bar, where
                      it sat apart from the note that explains which results
                      exist. Solid and bold so it reads at a glance. */}
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs sm:text-sm font-bold whitespace-nowrap flex-shrink-0 bg-brand-blue text-white shadow-sm shadow-brand-blue/25">
                    <TrendingUp className="w-4 h-4" strokeWidth={2.5} />
                    {completionRate}% Completion
                  </span>
                </div>
              </div>

              <InviteFilterBar
                filters={inviteFilters}
                onChange={(nextFilters) => {
                  setInviteFilters(nextFilters);
                  setInvitationPage(1);
                }}
                statusOptions={AI_INTERVIEW_INVITE_STATUS_OPTIONS}
                searchPlaceholder="Search by candidate name or email..."
                extraSelects={[
                  /* Same Source / Result pair as every other Track popup, so the bar
                     keeps their one-row layout. Versions read per row in the table. */
                  {
                    key: 'source', ariaLabel: 'Source', anyLabel: 'All Sources', value: trackerSourceFilter,
                    options: INVITE_SOURCE_FILTER_OPTIONS,
                    onChange: (value) => { setTrackerSourceFilter(value); setInvitationPage(1); },
                  },
                  {
                    key: 'result', ariaLabel: 'Result', anyLabel: 'All Results', value: trackerResultFilter,
                    options: RESULT_FILTER_OPTIONS,
                    onChange: (value) => { setTrackerResultFilter(value); setInvitationPage(1); },
                  },
                ]}
                onClearExtras={() => { setTrackerJobVersionFilter(''); setTrackerVersionFilter(''); setTrackerSourceFilter(''); setTrackerResultFilter(''); }}
              />

              {/* Bulk selection bar, and — on the same row, straight across
                  from Select All — the completion-rate badge that used to be
                  its own card in the stat row above. Gated on the FIRST load,
                  not on every load: this bar disappearing and reappearing
                  during a Refresh was one more height change in the stack of
                  them, and its contents come from `invitations`, which a
                  refresh keeps. */}
              {!invitesInitialLoading && (
                <div className="flex items-center justify-between gap-2 px-2.5 sm:px-6 pt-2.5 sm:pt-3 flex-shrink-0">
                  {selectableIds.length > 0 ? (
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="flex items-center gap-2 text-xs sm:text-sm text-gray-600 dark:text-slate-400 hover:text-brand-blue transition-colors"
                    >
                      <span role="checkbox" aria-checked={allSelectableOnPageSelected} className="p-1 flex-shrink-0">
                        {allSelectableOnPageSelected ? (
                          <CheckSquare className="w-4 h-4 text-brand-blue" />
                        ) : (
                          <Square className="w-4 h-4 text-gray-400" />
                        )}
                      </span>
                      Select All ({selectableIds.length})
                    </button>
                  ) : (
                    <span />
                  )}

                  <div className="flex items-center gap-2">
                    {/* The selected card's bulk action — never both. */}
                    {trackerBulkMode === 'revoke' && trackerSelectedRows.length > 0 && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setBulkRevokeConfirmOpen(true)}
                        disabled={isBulkRevoking}
                        title="Revoke the selected candidates' interview links"
                        icon={isBulkRevoking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                      >
                        {isBulkRevoking ? 'Revoking…' : `Revoke (${trackerSelectedRows.length})`}
                      </Button>
                    )}
                    {trackerBulkMode === 'resend' && trackerSelectedRows.length > 0 && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => setTrackerBulkResendOpen(true)}
                        disabled={isTrackerBulkResending}
                        title="Resend a fresh link to the selected expired invitations"
                        icon={isTrackerBulkResending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                      >
                        {isTrackerBulkResending ? 'Sending…' : `Resend (${trackerSelectedRows.length})`}
                      </Button>
                    )}
                  </div>
                  <ConfirmationDialog
                    isOpen={trackerBulkResendOpen}
                    onClose={() => { if (!isTrackerBulkResending) setTrackerBulkResendOpen(false); }}
                    onConfirm={async () => {
                      const targets = trackerSelectedRows;
                      if (targets.length === 0) { setTrackerBulkResendOpen(false); return; }
                      setIsTrackerBulkResending(true);
                      try {
                        await resendInvitesInBulk(targets);
                        setSelectedInviteIds(new Set());
                        await refreshInvitationsView(viewInvitationsConfig.id);
                      } finally {
                        setIsTrackerBulkResending(false);
                        setTrackerBulkResendOpen(false);
                      }
                    }}
                    title="Resend invitations to selected candidates?"
                    description={`A fresh interview link will be emailed to ${trackerSelectedRows.length} selected candidate${trackerSelectedRows.length === 1 ? '' : 's'}. Each candidate's previous link will stop working immediately.`}
                    confirmText={isTrackerBulkResending ? 'Sending…' : `Yes, resend to ${trackerSelectedRows.length}`}
                    cancelText="Cancel"
                    variant="info"
                  />
                </div>
              )}

              {/* Candidate list. overflow-hidden, not overflow-auto: the table
                  shell (or the mobile card stack) inside is the single vertical
                  scroller. Two nested scrollers meant this one won, scrolling the
                  sticky header and pinned Actions column away with the rows. */}
              {/* `relative` so the refresh veil below covers exactly this body
                  without joining its flow - an overlay adds no height, which is
                  the whole point of it. */}
              <div className="relative px-2.5 sm:px-6 py-2.5 sm:py-4 overflow-hidden flex-1 min-h-0 flex flex-col">
                <AIInterviewInviteTable
                  invitations={invitations}
                  /* Only the FIRST load may swap the rows for a spinner, when
                     there are no rows to swap. Re-reading rows that are already
                     on screen leaves them exactly where they are - the table
                     collapsing to a `py-12` spinner and back is what made this
                     dialog jump on Refresh. */
                  isLoading={invitesInitialLoading}
                  hasActiveFilters={filtersActive}
                  emptyHint={'Use the "Send via Email" button to invite candidates'}
                  jobVersion={trackerShowVersions && !trackerJobScope ? (viewInvitationsConfig.jd_version ?? 1) : undefined}
                  interviewVersion={trackerShowVersions && !trackerJobScope ? interviewVersionOrdinal(viewInvitationsConfig, [...configs, ...archivedConfigs]) : undefined}
                  showRowVersions={!!trackerJobScope}
                  selectedIds={trackerBulkMode ? selectedInviteIds : undefined}
                  onToggleSelect={trackerBulkMode ? toggleSelectOne : undefined}
                  isSelectable={trackerRowSelectable}
                  onResend={(inv) => setResendInviteTarget(inv)}
                  onEdit={(inv) => {
                    setEditInviteForm({
                      candidate_name: inv.candidate_name || '',
                      candidate_email: inv.candidate_email || '',
                    });
                    setEditInviteTarget(inv);
                  }}
                  onRevoke={(inv) => setRevokeInviteTarget(inv)}
                  onViewDetails={(inv) => handleViewCandidateDetail(inv.id)}
                  resendingId={resendingEmailFor}
                  revokingId={revokingInviteFor}
                />

                {/* Re-reading rows that are already on screen. The list keeps
                    its exact size and place; this only tints it and says why,
                    and it takes the clicks so nobody acts on a row that is
                    about to be replaced. */}
                {invitesRefreshVeil && (
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

              {/* Footer. Stacks on phones: the count line plus four page buttons,
                  Invite More and Close overflowed a 320px row. First/Last drop out
                  below sm — Prev/Next and the indicator are enough there. */}
              <div className="px-3 sm:px-6 py-2.5 sm:py-4 border-t border-gray-100 dark:border-slate-700/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-3 bg-slate-50 dark:bg-slate-950 shrink-0">
                <p className="text-2xs sm:text-sm text-gray-500 dark:text-slate-500 text-center sm:text-left order-2 sm:order-1">
                  {invitationResultsLabel}
                </p>
                <div className="flex items-center justify-center sm:justify-end flex-wrap gap-1.5 sm:gap-2 order-1 sm:order-2">
                  {invitationTotalPages > 1 && (
                    <>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 whitespace-nowrap">Go to</span>
                        <input
                          type="number"
                          min={1}
                          max={invitationTotalPages}
                          value={goToInvitationPage}
                          onChange={(e) => setGoToInvitationPage(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.currentTarget.blur();
                              commitGoToInvitationPage();
                            }
                          }}
                          onBlur={commitGoToInvitationPage}
                          aria-label="Go to page"
                          className="w-12 sm:w-14 h-8 px-1.5 sm:px-2 text-xs sm:text-sm text-center border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                        />
                      </div>
                      <button onClick={() => setInvitationPage((p) => Math.max(1, p - 1))} disabled={invitationPage === 1} className={pageBtn}>
                        Prev
                      </button>
                      <span className="px-1 sm:px-2 text-xs sm:text-sm text-gray-600 dark:text-slate-400 whitespace-nowrap">
                        Page {invitationPage} of {invitationTotalPages}
                      </span>
                      <button onClick={() => setInvitationPage((p) => Math.min(invitationTotalPages, p + 1))} disabled={invitationPage === invitationTotalPages} className={pageBtn}>
                        Next
                      </button>
                    </>
                  )}
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      // Remember where we came from so closing Share returns here.
                      setShareReturnToInvites(viewInvitationsConfig);
                      setViewInvitationsConfig(null);
                      setShareConfig(viewInvitationsConfig);
                    }}
                    icon={<Send className="w-3.5 h-3.5" />}
                  >
                    Invite More
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Archive confirm — same dedicated component for the card list and the
          per-version rows, so the warning cannot drift between the two. */}
      <ArchiveAIInterviewModal
        isOpen={!!archiveTarget}
        title={archiveTarget ? `${archiveTarget.jd_title || archiveTarget.position || 'Untitled'} - AI Interview` : ''}
        version={archiveTarget?.jd_id ? interviewVersionRows(archiveTarget.jd_id).find((r) => r.id === archiveTarget.id)?.version : undefined}
        createdAt={archiveTarget?.created_at}
        totalQuestions={archiveTarget?.total_questions}
        durationMinutes={archiveTarget?.duration_minutes}
        isLoading={archiveLoading}
        onConfirm={confirmArchiveConfig}
        onCancel={() => setArchiveTarget(null)}
      />

      {/* Delete confirm — same dedicated component for the card list and the
          per-version rows, so the warning cannot drift between the two. */}
      <DeleteAIInterviewModal
        isOpen={!!deleteTarget}
        title={deleteTarget ? `${deleteTarget.jd_title || deleteTarget.position || 'Untitled'} - AI Interview` : ''}
        version={deleteTarget?.jd_id ? interviewVersionRows(deleteTarget.jd_id).find((r) => r.id === deleteTarget.id)?.version : undefined}
        createdAt={deleteTarget?.created_at}
        totalQuestions={deleteTarget?.total_questions}
        durationMinutes={deleteTarget?.duration_minutes}
        isLoading={deleteLoading}
        onConfirm={confirmDeleteConfig}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Version History's eye icon — read-only Review & Publish peek. */}
      <AIInterviewReviewPreviewModal
        configId={reviewPreviewTarget?.id}
        versionNumber={reviewPreviewTarget?.version}
        onClose={() => setReviewPreviewTarget(null)}
      />

      {/* Resend confirmation — regenerates interview_token, invalidates old link */}
      <ConfirmationDialog
        isOpen={!!resendInviteTarget}
        onClose={() => { if (resendingEmailFor !== resendInviteTarget?.id) setResendInviteTarget(null); }}
        onConfirm={async () => {
          const inv = resendInviteTarget;
          if (!inv) return;
          setResendingEmailFor(inv.id);
          try {
            await aiInterviewService.sendSessionEmail(inv.id, { base_url: window.location.origin });
            toast.success(`New invitation link sent to ${inv.candidate_email}`);
            // refresh invitations list so the new expires_at/status is reflected
            await refreshAfterInviteAction(viewInvitationsConfig?.id);
          } catch (err: any) {
            const detail = err?.response?.data?.detail;
            const msg =
              (typeof detail === 'object' && detail?.message) ||
              (typeof detail === 'string' && detail) ||
              err?.message ||
              'Failed to resend email';
            toast.error(msg);
          } finally {
            setResendingEmailFor(null);
            setResendInviteTarget(null);
          }
        }}
        title="Invalidate old link & send new invitation?"
        description={
          resendInviteTarget
            ? `A fresh interview link will be emailed to ${resendInviteTarget.candidate_email}. The previous link will stop working immediately.`
            : ''
        }
        confirmText={resendingEmailFor && resendingEmailFor === resendInviteTarget?.id ? 'Sending…' : 'Yes, send new link'}
        cancelText="Cancel"
        variant="info"
      >
        {resendInviteTarget && (() => {
          /* Anchor on the last send, mirroring the backend: on a second resend
             created_at would make the window "expiry minus creation" and the
             preview would promise a longer validity than the server grants. */
          const sentAnchor = resendInviteTarget.invitation_sent_at || resendInviteTarget.created_at;
          const createdMs = sentAnchor ? new Date(sentAnchor).getTime() : NaN;
          const expiresMs = resendInviteTarget.expires_at ? new Date(resendInviteTarget.expires_at).getTime() : NaN;
          let durationMs = 24 * 60 * 60 * 1000;
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
          return (
            <div className="bg-brand-orange/10 border border-brand-orange/20 ring-1 ring-brand-orange/10 rounded-xl p-3 text-sm">
              <p className="text-brand-orange-deep font-medium mb-1">New link expiry</p>
              <p className="text-brand-orange-deep">
                Valid for <strong>{durationLabel}</strong> from now — expires on{' '}
                <strong>{formatIST(newExpiry.toISOString())}</strong>.
              </p>
              <p className="text-brand-orange-deep/80 text-xs mt-2">
                Same duration as the original invitation.
              </p>
            </div>
          );
        })()}
      </ConfirmationDialog>

      {/* Revoke confirmation — flips status to REVOKED; old link stops working immediately */}
      <ConfirmationDialog
        isOpen={!!revokeInviteTarget}
        onClose={() => { if (!revokingInviteFor) setRevokeInviteTarget(null); }}
        onConfirm={async () => {
          const inv = revokeInviteTarget;
          if (!inv) return;
          setRevokingInviteFor(inv.id);
          try {
            await aiInterviewService.revokeInvitation(inv.id);
            toast.success(`Invitation for ${inv.candidate_email} has been revoked`);
            await refreshAfterInviteAction(viewInvitationsConfig?.id);
          } catch (err: any) {
            toast.error(err?.message || 'Failed to revoke invitation');
          } finally {
            setRevokingInviteFor(null);
            setRevokeInviteTarget(null);
          }
        }}
        title="Revoke Interview Link?"
        description={
          revokeInviteTarget
            ? `This will immediately expire the interview link sent to ${revokeInviteTarget.candidate_email}. The candidate will no longer be able to access the interview using this link. You'll be able to edit the candidate's details and send a new invitation afterwards.`
            : ''
        }
        confirmText={revokingInviteFor && revokingInviteFor === revokeInviteTarget?.id ? 'Revoking…' : 'Confirm'}
        cancelText="Cancel"
        variant="danger"
      />

      {/* Bulk revoke confirmation — revokes every checked invitation. Each one is
          revoked independently via the same single-revoke endpoint, so one
          candidate's link having already changed state doesn't block the rest. */}
      <ConfirmationDialog
        isOpen={bulkRevokeConfirmOpen}
        onClose={() => { if (!isBulkRevoking) setBulkRevokeConfirmOpen(false); }}
        onConfirm={async () => {
          const targets = invitations.filter((inv) => selectedInviteIds.has(inv.id));
          if (targets.length === 0) { setBulkRevokeConfirmOpen(false); return; }
          setIsBulkRevoking(true);
          try {
            const results = await Promise.allSettled(
              targets.map((inv) => aiInterviewService.revokeInvitation(inv.id))
            );
            const succeeded = results.filter((r) => r.status === 'fulfilled').length;
            const failed = results.length - succeeded;
            if (succeeded > 0) {
              toast.success(`Revoked ${succeeded} invitation${succeeded === 1 ? '' : 's'}.`);
            }
            if (failed > 0) {
              toast.error(`Failed to revoke ${failed} invitation${failed === 1 ? '' : 's'}.`);
            }
            setSelectedInviteIds(new Set());
            if (viewInvitationsConfig) {
              await refreshInvitationsView(viewInvitationsConfig.id);
            }
          } finally {
            setIsBulkRevoking(false);
            setBulkRevokeConfirmOpen(false);
          }
        }}
        /* Same shape as the bulk Resend confirmation — no per-candidate list. */
        title="Revoke invitations for selected candidates?"
        description={`The interview link for ${selectedInviteIds.size} selected candidate${selectedInviteIds.size === 1 ? '' : 's'} will stop working immediately.`}
        confirmText={isBulkRevoking ? 'Revoking…' : `Yes, revoke ${selectedInviteIds.size}`}
        cancelText="Cancel"
        variant="danger"
      />

      {/* Edit invitation modal — only reachable while the invitation is REVOKED */}
      {editInviteTarget && (() => {
        const editInviteEmailTrimmed = editInviteForm.candidate_email.trim();
        const editInviteEmailError =
          editInviteEmailTrimmed.length > 0 && !isValidEmailFormat(editInviteEmailTrimmed)
            ? EMAIL_FORMAT_ERROR
            : null;
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-4 sm:p-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] w-full max-w-[95vw] sm:max-w-md max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] overflow-y-auto flex flex-col">
            <div className="px-5 sm:px-6 pt-5 sm:pt-6 pb-3 border-b border-gray-100 dark:border-slate-700/60 flex items-center justify-between shrink-0">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50 tracking-tight">Edit Invitation</h3>
              <Button variant="secondary" size="sm" onClick={() => { if (!savingEditInvite) setEditInviteTarget(null); }} aria-label="Close" className="px-2">
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="px-5 sm:px-6 py-4 space-y-4">
              <p className="text-sm text-gray-500 dark:text-slate-500">
                Update the candidate's details below. Saving will send them a fresh invitation link automatically.
              </p>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Candidate name</label>
                <input
                  type="text"
                  value={editInviteForm.candidate_name}
                  onChange={(e) => setEditInviteForm((f) => ({ ...f, candidate_name: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Candidate email</label>
                <input
                  type="email"
                  value={editInviteForm.candidate_email}
                  onChange={(e) => setEditInviteForm((f) => ({ ...f, candidate_email: e.target.value }))}
                  aria-invalid={editInviteEmailError ? 'true' : undefined}
                  className={`w-full px-3 py-2 text-sm border bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 ${
                    editInviteEmailError
                      ? 'border-destructive focus:ring-destructive/30 focus:border-destructive'
                      : 'border-gray-200 dark:border-slate-700 focus:ring-brand-blue/30 focus:border-brand-blue'
                  }`}
                />
                {editInviteEmailError && (
                  <p className="mt-1 text-xs text-destructive">{editInviteEmailError}</p>
                )}
              </div>
            </div>
            <div className="px-5 sm:px-6 py-4 border-t border-gray-100 dark:border-slate-700/60 flex items-center justify-end gap-2 shrink-0">
              <Button
                variant="primary"
                size="md"
                onClick={async () => {
                  const inv = editInviteTarget;
                  if (!inv) return;
                  const name = editInviteForm.candidate_name.trim();
                  const email = editInviteForm.candidate_email.trim();
                  if (!name || !email) {
                    toast.error('Candidate name and email are required');
                    return;
                  }
                  if (!isValidEmailFormat(email)) {
                    toast.error(EMAIL_FORMAT_ERROR);
                    return;
                  }
                  setSavingEditInvite(true);
                  try {
                    await aiInterviewService.updateInvitation(inv.id, { candidate_name: name, candidate_email: email });
                    // Saving is the only path to reactivating a revoked invite now —
                    // there's no separate Send Again button once it's revoked — so
                    // the resend happens right here, automatically.
                    try {
                      await aiInterviewService.sendSessionEmail(inv.id, { base_url: window.location.origin });
                      toast.success(`Invitation updated and sent to ${email}`);
                    } catch (sendErr: any) {
                      const detail = sendErr?.response?.data?.detail;
                      const msg =
                        (typeof detail === 'object' && detail?.message) ||
                        (typeof detail === 'string' && detail) ||
                        sendErr?.message ||
                        'Details saved, but the invitation could not be sent — try Edit again.';
                      toast.error(msg);
                    }
                    await refreshAfterInviteAction(viewInvitationsConfig?.id);
                    setEditInviteTarget(null);
                  } catch (err: any) {
                    toast.error(err?.message || 'Failed to update invitation');
                  } finally {
                    setSavingEditInvite(false);
                  }
                }}
                disabled={savingEditInvite || !!editInviteEmailError}
                icon={savingEditInvite ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : undefined}
              >
                Save & Send
              </Button>
            </div>
          </div>
        </div>
        );
      })()}
    </main>
  );
}

/**
 * Wrapper component that lazy-loads ConsentLogs
 */
function ConsentLogsWrapper() {
  const [ConsentLogs, setConsentLogs] = useState<ComponentType<{ compact?: boolean; defaultFeature?: string }> | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    import('@/components/compliance/ConsentLogs')
      .then((mod) => setConsentLogs(() => mod.default))
      .catch(() => setLoadError(true));
  }, []);

  if (loadError) {
    return (
      <div className="text-center py-12">
        <ScrollText className="w-10 h-10 mx-auto mb-3 text-brand-blue/30" />
        <p className="text-gray-500 dark:text-slate-500">Consent logs module not available</p>
      </div>
    );
  }

  if (!ConsentLogs) {
    return (
      <div className="flex items-center justify-center py-12 tf-loader-center">
        <Loader2 className="w-6 h-6 animate-spin text-brand-blue" />
      </div>
    );
  }

  return <ConsentLogs compact defaultFeature="AI Interview" />;
}
