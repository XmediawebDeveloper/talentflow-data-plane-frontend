'use client';

import { Plus, Clock, Calendar, Users, CheckCircle, XCircle, FileText, FileCheck, MoreVertical, Play, Sparkles, Eye, Edit2, BarChart, Mail, Trash2, Copy, Archive, Download, Link2, Share2, PauseCircle, LayoutGrid, List, Monitor, Brain, Code, ClipboardList, Globe, Pencil, Zap, Shield, Video, X, Info, CheckCircle2, MonitorOff, Clipboard, Lock, TrendingUp, Activity, Loader2 } from 'lucide-react';
import { StatsCard, StatsCardGrid } from '@/components/ui/stats-card';
import { useState, useEffect, useRef } from 'react';
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
import AssessmentDetailsView from './AssessmentDetailsView';
import InviteFilterBar, { EMPTY_INVITE_FILTERS, type InviteFilterState } from './InviteFilterBar';
import ListToolbar from '@/components/ui/list-toolbar';
import type { AssessmentAttemptResponse } from '@/lib/services/assessmentService';

import { Job } from '@/lib/types/types';
import { assessmentService } from '@/lib/services';
import { recordAssessment } from '@/lib/services/usageTrackingService';
import api from '@/lib/services/api';
import { proctoringService, ProctoringSettings, ProctoringEvent } from '@/lib/services/proctoringService';
import { AlertTriangle, RefreshCw, Send, Ban } from 'lucide-react';
import { stripVersionFromTitle } from '@/lib/utils/assessmentUtils';
import { formatIST, formatISTDate, formatISTTime } from '@/lib/utils/dateUtils';
import VersionBadge from './VersionBadge';
import { useGlobalDialog } from '@/components/providers/GlobalDialogProvider';
import { toast } from 'sonner';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { IS_PRODUCTION_ENV } from '@/lib/utils/env';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import QuotaBadge from '@/components/ui/quota-badge';


const INVITATIONS_PAGE_SIZE = 10;
const ASSESSMENT_INVITE_STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'sent', label: 'Invite Sent' },
  { value: 'opened', label: 'Link Opened' },
  { value: 'started', label: 'Started' },
  { value: 'completed', label: 'Completed' },
  { value: 'expired', label: 'Expired' },
  { value: 'failed', label: 'Invite Failed' },
  { value: 'bounced', label: 'Bounced' },
  { value: 'abandoned', label: 'Abandoned' },
];

interface AssessmentsProps {
  jobs: Job[];
  onOpenCandidateView?: () => void;
  onNavigateToJDCreation?: () => void;
  autoOpenCreate?: boolean;
  preSelectedJdId?: string;
  preSelectedJdTitle?: string;
}

/** A completed attempt, tagged with the assessment it belongs to. */
type CandidateResultRow = AssessmentAttemptResponse & {
  _assessment_id: string;
  _assessment_short_id?: string;
  _assessment_title?: string;
};

export default function Assessments({ jobs, onOpenCandidateView, onNavigateToJDCreation, autoOpenCreate, preSelectedJdId, preSelectedJdTitle }: AssessmentsProps) {
  const router = useRouter();
  const dialog = useGlobalDialog();
  const { user, isTenantAdmin, hasPermission, hasPermissionCode } = useAuth();

  // Permission checks for CRUD operations (bypass for tenant admin)
  const canCreateAssessment = isTenantAdmin || (user?.permissions?.canCreateAssessments ?? false);
  const canUpdateAssessment = isTenantAdmin || (user?.permissions?.canUpdateAssessments ?? false);
  const canDeleteAssessment = isTenantAdmin || (user?.permissions?.canDeleteAssessments ?? false);
  const canDownloadAssessmentPDF = isTenantAdmin || (user?.permissions?.canDownloadAssessmentPDF ?? false);
  const canBatchDownloadAssessmentPDF = isTenantAdmin || hasPermissionCode('assessments:batch_download') || (user?.permissions?.canExport ?? false);
  // HR Question Bank is reached via a quick link here (moved out of the sidebar)
  const canAccessHRQuestionBank = isTenantAdmin || !!(user?.permissions?.canViewHRQuestionBank || user?.permissions?.canCreateHRQuestionBank || user?.permissions?.canUpdateHRQuestionBank || user?.permissions?.canDeleteHRQuestionBank);

  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'draft' | 'completed' | 'completed-candidates' | 'audit' | 'consent' | 'archived' | 'settings'>('all');
  // Two-step view: 'cards' shows only the 3 stat tiles; 'list' shows tabs + filters + assessments list.
  const [pageView, setPageView] = useState<'cards' | 'list'>('cards');
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
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [selectedAssessmentForPreview, setSelectedAssessmentForPreview] = useState<any>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedAssessmentForEdit, setSelectedAssessmentForEdit] = useState<any>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [showDetailsView, setShowDetailsView] = useState(false);
  const [selectedAssessmentForDetails, setSelectedAssessmentForDetails] = useState<any>(null);
  // Track Invites modal state
  const [showTrackInvitesModal, setShowTrackInvitesModal] = useState(false);
  const [selectedAssessmentForTracking, setSelectedAssessmentForTracking] = useState<any>(null);
  const [trackingInvitations, setTrackingInvitations] = useState<any[]>([]);
  const [isLoadingInvitations, setIsLoadingInvitations] = useState(false);
  const [invitationStats, setInvitationStats] = useState({
    total: 0,
    expired: 0,
    started: 0,
    completed: 0,
    failed: 0,
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
  const [assessmentTotalItems, setAssessmentTotalItems] = useState(0);
  const [assessmentTotalPages, setAssessmentTotalPages] = useState(1);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  // Assessment list search + filters. `assessmentSearch` is what the user types;
  // `assessmentSearchQuery` is the debounced value sent to the API, so the search
  // spans every page rather than only the one on screen. The rest narrow the
  // loaded page client-side — the list endpoint takes no filters beyond search.
  const [assessmentSearch, setAssessmentSearch] = useState('');
  const [assessmentSearchQuery, setAssessmentSearchQuery] = useState('');
  const [showAssessmentFilters, setShowAssessmentFilters] = useState(false);
  // True once the user confirms the More Filters panel with "Done" — mirrors
  // job-openings, so Clear appears only after filters are applied.
  const [assessmentFiltersConfirmed, setAssessmentFiltersConfirmed] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'Technical' | 'Behavioral' | 'Aptitude'>('all');
  const [filterCreatedBy, setFilterCreatedBy] = useState('all');
  const [filterCreatedFrom, setFilterCreatedFrom] = useState('');
  const [filterCreatedTo, setFilterCreatedTo] = useState('');
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

  const openAssessmentsList = (tab: 'all' | 'active' | 'draft' | 'completed' | 'completed-candidates' | 'archived' = 'all') => {
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

  const isOverviewCardActive = (tab: typeof activeTab) => pageView === 'list' && activeTab === tab;

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
      viewMode,
      assessmentCurrentPage,
      assessmentItemsPerPage,
      assessmentSearch,
      filterType,
      filterCreatedBy,
      filterCreatedFrom,
      filterCreatedTo,
    },
    (s) => {
      if (typeof s.activeTab === 'string') setActiveTab(s.activeTab as typeof activeTab);
      if (s.settingsSubTab === 'proctoring' || s.settingsSubTab === 'topics') setSettingsSubTab(s.settingsSubTab);
      if (s.viewMode === 'grid' || s.viewMode === 'list') setViewMode(s.viewMode);
      if (typeof s.assessmentCurrentPage === 'number') setAssessmentCurrentPage(s.assessmentCurrentPage);
      if (typeof s.assessmentItemsPerPage === 'number') setAssessmentItemsPerPage(s.assessmentItemsPerPage);
      if (typeof s.assessmentSearch === 'string') {
        setAssessmentSearch(s.assessmentSearch);
        setAssessmentSearchQuery(s.assessmentSearch);
      }
      if (s.filterType === 'Technical' || s.filterType === 'Behavioral' || s.filterType === 'Aptitude') {
        setFilterType(s.filterType);
      }
      if (typeof s.filterCreatedBy === 'string') setFilterCreatedBy(s.filterCreatedBy);
      if (typeof s.filterCreatedFrom === 'string') setFilterCreatedFrom(s.filterCreatedFrom);
      if (typeof s.filterCreatedTo === 'string') setFilterCreatedTo(s.filterCreatedTo);
    },
  );

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
      // Backend computes the 3-version cap and the "only version 1 can be
      // cloned" rule. We split it into two signals so the UI can express
      // both states distinctly:
      //   clone_button_disabled → Draft / clone (V2, V3) → greyed-out button
      //   clone_cap_reached → V1 at the 3-version cap → button stays
      //     clickable but click opens a "max reached" popup
      // can_clone is the legacy combined flag (kept for safety).
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

  const closeTrackInvitesModal = () => {
    setShowTrackInvitesModal(false);
    setSelectedAssessmentForTracking(null);
    setTrackingInvitations([]);
    setTrackingCurrentPage(1);
    setTrackingTotalItems(0);
    setTrackingTotalPages(1);
    setTrackingFilters(EMPTY_INVITE_FILTERS);
    setEditingEmailId(null);
    setNewEmailValue('');
  };

  const loadAssessmentsPage = async (page: number) => {
    setIsLoading(true);
    try {
      const filters: any = {
        page,
        page_size: assessmentItemsPerPage,
      };
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

      const response = await assessmentService.list(filters);
      const mapped = (response.items || []).map((a: any, index: number) =>
        mapAssessmentFromApi(a, (page - 1) * assessmentItemsPerPage + index)
      );

      setApiAssessments(mapped);
      setAssessmentTotalItems(response.total || 0);
      setAssessmentTotalPages(response.total_pages || 1);

      if ((response.items?.length || 0) === 0 && response.total > 0 && page > 1) {
        setAssessmentCurrentPage(Math.min(page - 1, response.total_pages || 1));
      }
    } catch (error) {
      console.log('[TalentFlow] Failed to load assessments:', error);
      setApiAssessments([]);
      setAssessmentTotalItems(0);
      setAssessmentTotalPages(1);
    } finally {
      setIsLoading(false);
    }
  };

  const loadTrackingInvitationSummary = async (assessment: any) => {
    try {
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
      });
    } catch (error) {
      console.error('Failed to load invitation summary:', error);
      setInvitationStats({
        total: 0,
        expired: 0,
        started: 0,
        completed: 0,
        failed: 0,
      });
    }
  };

  const loadTrackingInvitations = async (assessment: any, page: number, filters: InviteFilterState) => {
    setIsLoadingInvitations(true);
    try {
      const response = await assessmentService.listInvitations(assessment.id, {
        status: filters.status !== 'all' ? filters.status : undefined,
        search: filters.search.trim() || undefined,
        invite_date_from: filters.dateFrom || undefined,
        invite_date_to: filters.dateTo || undefined,
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
      });
    } finally {
      setIsLoadingInvitations(false);
    }
  };

  // Aggregate all "Completed" invitations across every assessment.
  // No backend endpoint for this yet — we list assessments, then fan out a
  // listInvitations(id, {status:'completed'}) call per assessment in parallel
  // and merge. Stamps each invitation with its assessment title/id so the
  // table can show which assessment each completion belongs to.
  // Rounds are optional per assessment, so a missing score is "not run" rather
  // than zero. Pass/fail colouring follows the assessment pass mark.
  const RESULT_PASS_MARK = 70;

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
    router.push(`/recruitment/assessments/${result._assessment_id}/results/details?candidate_id=${attemptId}${cid}`);
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
            }));
          } catch {
            return [];
          }
        })
      );
      const merged = results.flat();
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
    if (activeTab === 'audit' || activeTab === 'consent' || activeTab === 'settings') {
      return;
    }
    loadAssessmentsPage(assessmentCurrentPage);
  }, [activeTab, preSelectedJdId, assessmentCurrentPage, assessmentItemsPerPage, assessmentSearchQuery]);

  useEffect(() => {
    setAssessmentCurrentPage(1);
  }, [activeTab, preSelectedJdId, assessmentItemsPerPage, assessmentSearchQuery]);

  // Hold the search until typing settles, so a query is one request, not one per key.
  useEffect(() => {
    const timer = window.setTimeout(() => setAssessmentSearchQuery(assessmentSearch), 350);
    return () => window.clearTimeout(timer);
  }, [assessmentSearch]);

  useEffect(() => {
    if (!showTrackInvitesModal || !selectedAssessmentForTracking) return;
    loadTrackingInvitations(selectedAssessmentForTracking, trackingCurrentPage, trackingFilters);
  }, [showTrackInvitesModal, selectedAssessmentForTracking, trackingCurrentPage, trackingFilters]);

  useEffect(() => {
    if (!showTrackInvitesModal || !selectedAssessmentForTracking) return;
    loadTrackingInvitationSummary(selectedAssessmentForTracking);
  }, [showTrackInvitesModal, selectedAssessmentForTracking]);

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

    // Reload assessments from API to get the newly created one
    await reloadAssessments();

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

    if (!await dialog.confirm({ title: 'Delete Assessment', message: 'Delete this assessment permanently? This action cannot be undone.', variant: 'error', confirmText: 'Delete' })) return;

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
  // invites V2 candidates manually via the normal invite flow.
  // If the JD has already hit the 3-version cap, show a max-reached popup
  // instead of opening the duplicate confirmation.
  const handleOpenCloneModal = async (assessment: any) => {
    if (assessment.clone_cap_reached) {
      await dialog.alert({
        title: 'Maximum versions reached',
        message: 'This assessment already has 3 versions (the maximum allowed). Archive or delete a version before duplicating again.',
        variant: 'warning',
      });
      return;
    }
    setCloneTargetAssessment(assessment);
  };

  const handleConfirmClone = async () => {
    if (!cloneTargetAssessment || isCloning) return;
    setIsCloning(true);
    try {
      const response = await assessmentService.clone(cloneTargetAssessment.id);
      await reloadAssessments();
      toast.success(`Assessment duplicated: "${response.cloned_title}"`);
      setCloneTargetAssessment(null);
    } catch (error) {
      console.error('Failed to duplicate assessment:', error);
      toast.error('Failed to duplicate assessment. Please try again.');
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
    setSelectedAssessmentForTracking(assessment);
    setShowTrackInvitesModal(true);
    setTrackingFilters(EMPTY_INVITE_FILTERS);
    setTrackingCurrentPage(1);
  };

  const isValidInviteEmail = (email: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  // Preview the new expiry the backend will produce. Mirrors backend logic:
  // reuses the original invitation's configured duration (expires_at - created_at).
  const computeResendExpiryPreview = (invitation: any): { dateLabel: string; durationLabel: string } | null => {
    if (!invitation) return null;
    const createdMs = invitation.created_at ? new Date(invitation.created_at).getTime() : NaN;
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
  const handleResendInvitation = async (invitation: any) => {
    setIsResending(true);
    try {
      await api.post(
        `/assessments/${selectedAssessmentForTracking.id}/invitations/${invitation.id}/resend`
      );
      toast.success('New invitation link generated and emailed!');
      await Promise.all([
        loadTrackingInvitations(selectedAssessmentForTracking, trackingCurrentPage, trackingFilters),
        loadTrackingInvitationSummary(selectedAssessmentForTracking),
      ]);
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

  // Change email and resend for bounced invitations
  const handleUpdateEmail = async (invitation: any) => {
    if (!isValidInviteEmail(newEmailValue)) return;
    setIsSendingChangeEmail(true);
    try {
      await api.patch(
        `/assessments/${selectedAssessmentForTracking.id}/invitations/${invitation.id}/update-email`,
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

  // Everyone who has created one of the loaded assessments, for the filter list.
  const assessmentCreators = Array.from(
    new Set(assessments.map((a) => a.created_by_name).filter(Boolean))
  ).sort();

  const assessmentFilterCount =
    (filterType !== 'all' ? 1 : 0) +
    (filterCreatedBy !== 'all' ? 1 : 0) +
    (filterCreatedFrom ? 1 : 0) +
    (filterCreatedTo ? 1 : 0);
  // Gates the toolbar's solid button + Clear: selected AND confirmed via "Done".
  const assessmentFiltersActive = assessmentFiltersConfirmed && assessmentFilterCount > 0;
  // Whether the list is narrowed at all — drives the result count and the
  // "no matches" empty state, which must react to a search as well.
  const assessmentListNarrowed = assessmentFilterCount > 0 || assessmentSearch.trim() !== '';

  const clearAssessmentFilters = () => {
    setAssessmentFiltersConfirmed(false);
    setAssessmentSearch('');
    setFilterType('all');
    setFilterCreatedBy('all');
    setFilterCreatedFrom('');
    setFilterCreatedTo('');
  };

  const filteredAssessments = assessments.filter((assessment) => {
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
  const assessmentPaginationVisible = !['audit', 'consent', 'settings'].includes(activeTab) && assessmentTotalItems > 5;
  const assessmentStartIndex = assessmentTotalItems === 0 ? 0 : (assessmentCurrentPage - 1) * assessmentItemsPerPage + 1;
  const assessmentEndIndex = Math.min(assessmentCurrentPage * assessmentItemsPerPage, assessmentTotalItems);
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

  return (
    <main ref={rootRef} className="flex-1 overflow-x-hidden bg-slate-50">
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
                icon={Zap}
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

        {/* AI-Powered Assessments Banner */}
        <div className="bg-gradient-to-br from-brand-blue/5 via-white to-brand-cyan/5 border border-brand-blue/15 ring-1 ring-brand-blue/10 rounded-xl p-3 sm:p-4 mb-4 sm:mb-6 shadow-sm shadow-brand-blue/10">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-blue flex items-center justify-center flex-shrink-0 shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-900 dark:text-slate-50 mb-1 tracking-tight">AI-Powered Assessments</h3>
              <p className="text-sm text-gray-600 dark:text-slate-400">
                Create customized skill assessments linked to job descriptions. AI automatically generates relevant questions based on job requirements. Track candidate performance, completion rates, and pass/fail statistics.
              </p>
            </div>
          </div>
        </div>

        {/* Stats Cards - Two Rows */}
        <div className="space-y-3 sm:space-y-4 mb-4 sm:mb-6">
          {/* Row 1: Historical Metrics (Total Created, Total Deleted, Units Used) - HIDDEN */}
          {/* <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-lg bg-gray-100 flex items-center justify-center">
                  <Plus className="w-3.5 h-3.5 text-gray-700" />
                </div>
                <span className="text-xs text-gray-500">Total Created</span>
              </div>
              <div className="text-xl font-semibold text-gray-900">
                {isLoadingStats ? '...' : stats.total_ever_created.toLocaleString()}
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-lg bg-red-100 flex items-center justify-center">
                  <Trash2 className="w-3.5 h-3.5 text-red-600" />
                </div>
                <span className="text-xs text-gray-500">Total Deleted</span>
              </div>
              <div className="text-xl font-semibold text-gray-900">
                {isLoadingStats ? '...' : stats.total_deleted.toLocaleString()}
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-lg bg-gray-100 flex items-center justify-center">
                  <Zap className="w-3.5 h-3.5 text-gray-700" />
                </div>
                <span className="text-xs text-gray-500">Units Used</span>
              </div>
              <div className="text-xl font-semibold text-gray-900">
                {isLoadingStats ? '...' : `${stats.units_consumed}/${totalUnits}`}
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">{Math.max(0, totalUnits - stats.units_consumed)} remaining</div>
            </div>
          </div> */}

          {/* Row 2: Current State Metrics — click a card to drill into the matching list */}
          <StatsCardGrid>
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
              icon={Play}
              label="Active"
              value={isLoadingStats ? '...' : stats.active_assessments.toLocaleString()}
              sparkline={false}
              onClick={() => openAssessmentsList('active')}
            />
            <StatsCard
              tone="neutral"
              active={isOverviewCardActive('completed-candidates')}
              showClickArrow
              icon={Users}
              label="Candidates Assessed"
              value={isLoadingStats ? '...' : stats.total_candidates_completed.toLocaleString()}
              sparkline={false}
              onClick={() => openAssessmentsList('completed-candidates')}
            />
            <StatsCard
              tone="neutral"
              active={isOverviewCardActive('draft')}
              showClickArrow
              icon={Pencil}
              label="Drafts"
              value={isLoadingStats ? '...' : stats.draft_assessments.toLocaleString()}
              sparkline={false}
              onClick={() => openAssessmentsList('draft')}
            />
          </StatsCardGrid>
        </div>

        {pageView === 'list' && (
        <>
        <div ref={listSectionRef} className="scroll-mt-4" aria-hidden="true" />

        {/* Tabs */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5">
          <div className="border-b border-gray-100 dark:border-slate-700/60 px-3 sm:px-6">
            <div className="relative">
              <div className="flex gap-3 sm:gap-5 overflow-x-auto pr-16 sm:pr-20 scrollbar-hide">
                <button
                  onClick={() => setActiveTab('all')}
                  className={`py-2.5 sm:py-3 text-xs sm:text-sm border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === 'all'
                      ? 'border-brand-blue text-brand-blue font-medium'
                      : 'border-transparent text-gray-600 dark:text-slate-400 hover:text-brand-blue'
                  }`}
                >
                  <span className="hidden sm:inline">All Assessments</span>
                  <span className="sm:hidden">All</span>
                </button>
                <button
                  onClick={() => setActiveTab('active')}
                  className={`py-2.5 sm:py-3 text-xs sm:text-sm border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === 'active'
                      ? 'border-brand-blue text-brand-blue font-medium'
                      : 'border-transparent text-gray-600 dark:text-slate-400 hover:text-brand-blue'
                  }`}
                >
                  Active
                </button>
                <button
                  onClick={() => setActiveTab('draft')}
                  className={`py-2.5 sm:py-3 text-xs sm:text-sm border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === 'draft'
                      ? 'border-brand-blue text-brand-blue font-medium'
                      : 'border-transparent text-gray-600 dark:text-slate-400 hover:text-brand-blue'
                  }`}
                >
                  Draft
                </button>
                <button
                  onClick={() => setActiveTab('completed-candidates')}
                  className={`py-2.5 sm:py-3 text-xs sm:text-sm border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                    activeTab === 'completed-candidates'
                      ? 'border-brand-blue text-brand-blue font-medium'
                      : 'border-transparent text-gray-600 dark:text-slate-400 hover:text-brand-blue'
                  }`}
                >
                  <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Candidate Results</span>
                  <span className="sm:hidden">Results</span>
                </button>
                {/* <button
                  onClick={() => setActiveTab('completed')}
                  className={`py-2.5 sm:py-3 text-xs sm:text-sm border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === 'completed'
                      ? 'border-brand-blue text-brand-blue font-medium'
                      : 'border-transparent text-gray-600 dark:text-slate-400 hover:text-brand-blue'
                  }`}
                >
                  Completed
                </button> */}
                {isTenantAdmin && (
                  <>
                    <button
                      onClick={() => setActiveTab('audit')}
                      className={`py-3 sm:py-4 text-xs sm:text-sm border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                        activeTab === 'audit'
                          ? 'border-brand-blue text-brand-blue font-medium'
                          : 'border-transparent text-gray-600 dark:text-slate-400 hover:text-brand-blue'
                      }`}
                    >
                      <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span className="hidden sm:inline">Activity Logs</span>
                      <span className="sm:hidden">Activity</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('consent')}
                      className={`py-3 sm:py-4 text-xs sm:text-sm border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                        activeTab === 'consent'
                          ? 'border-brand-blue text-brand-blue font-medium'
                          : 'border-transparent text-gray-600 dark:text-slate-400 hover:text-brand-blue'
                      }`}
                    >
                      <FileCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span className="hidden sm:inline">Consent Logs</span>
                      <span className="sm:hidden">Consent</span>
                    </button>
                  </>
                )}
                {/* <button
                  onClick={() => setActiveTab('archived')}
                  className={`py-2.5 sm:py-3 text-xs sm:text-sm border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === 'archived'
                      ? 'border-brand-blue text-brand-blue font-medium'
                      : 'border-transparent text-gray-600 dark:text-slate-400 hover:text-brand-blue'
                  }`}
                >
                  Archived
                </button> */}
                <button
                  onClick={() => setActiveTab('settings')}
                  className={`py-3 sm:py-4 text-xs sm:text-sm border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                    activeTab === 'settings'
                      ? 'border-brand-blue text-brand-blue font-medium'
                      : 'border-transparent text-gray-600 dark:text-slate-400 hover:text-brand-blue'
                  }`}
                >
                  <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  Settings
                </button>
              </div>
              {/* Grid/List View Toggle - positioned absolute right so tabs get full scroll width */}
              <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-1 border border-gray-200 dark:border-slate-700 rounded-lg p-1 bg-white dark:bg-slate-900">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20'
                      : 'text-gray-400 hover:text-brand-blue'
                  }`}
                  aria-label="Grid View" title="Grid View"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded transition-colors ${
                    viewMode === 'list'
                      ? 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20'
                      : 'text-gray-400 hover:text-brand-blue'
                  }`}
                  aria-label="List View" title="List View"
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Assessment List */}
          <div className="p-3 sm:p-6">
            {/* Search + filters — only for the tabs that list assessments; the
                other tabs bring their own controls. */}
            {!['completed-candidates', 'audit', 'consent', 'settings'].includes(activeTab) && (
              <div className="mb-4">
                <ListToolbar
                  searchValue={assessmentSearch}
                  onSearchChange={setAssessmentSearch}
                  searchPlaceholder="Search by assessment name, ID or description..."
                  onToggleFilters={() => setShowAssessmentFilters(!showAssessmentFilters)}
                  filtersOpen={showAssessmentFilters}
                  activeFilterCount={assessmentFilterCount}
                  filtersApplied={assessmentFiltersActive}
                  onClearFilters={clearAssessmentFilters}
                  className="mb-0"
                />

                {showAssessmentFilters && (
                  <div className="mt-3 rounded-xl border border-gray-100 dark:border-slate-700/60 bg-slate-50/60 dark:bg-slate-800/30 p-3 sm:p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                      <div>
                        <label htmlFor="assessment-type" className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                          Type
                        </label>
                        <select
                          id="assessment-type"
                          value={filterType}
                          onChange={(e) => setFilterType(e.target.value as typeof filterType)}
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
                          onChange={(e) => setFilterCreatedBy(e.target.value)}
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
                          onChange={(e) => setFilterCreatedFrom(e.target.value)}
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
                          onChange={(e) => setFilterCreatedTo(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-black dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40"
                        />
                      </div>
                    </div>

                    {/* Panel footer: "Done" applies the selection and reveals the
                        toolbar Clear — same flow as job-openings. */}
                    <div className="mt-4 pt-3 border-t border-gray-200 dark:border-slate-700/60 flex items-center justify-end gap-2">
                      <button
                        onClick={() => { setShowAssessmentFilters(false); setAssessmentFiltersConfirmed(true); }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-brand-blue transition-colors hover:bg-brand-blue-2 shadow-sm shadow-brand-blue/25"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                )}

                {assessmentListNarrowed && !isLoading && (
                  <p className="mt-3 text-xs sm:text-sm text-gray-600 dark:text-slate-400">
                    <span className="font-semibold text-gray-900 dark:text-slate-50">{filteredAssessments.length}</span>
                    {' '}assessment{filteredAssessments.length === 1 ? '' : 's'} match
                    {assessmentSearch.trim() ? ` "${assessmentSearch.trim()}"` : ' your filters'}
                  </p>
                )}
              </div>
            )}

            {activeTab === 'completed-candidates' ? (() => {
              /* Candidate Results tab - every completed attempt across all assessments */
              const total = completedCandidates.length;
              const totalPages = Math.max(1, Math.ceil(total / COMPLETED_PAGE_SIZE));
              const safePage = Math.min(Math.max(1, completedCandidatesPage), totalPages);
              const pageItems = completedCandidates.slice((safePage - 1) * COMPLETED_PAGE_SIZE, safePage * COMPLETED_PAGE_SIZE);
              return (
                <div>
                  {isLoadingCompletedCandidates ? (
                    <div className="flex items-center justify-center py-16">
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
                    <div className="p-10 text-center">
                      <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                        <Users className="w-5 h-5 text-brand-blue" />
                      </div>
                      <h3 className="text-base font-semibold text-gray-900 dark:text-slate-50 mb-1">No Candidate Results Yet</h3>
                      <p className="text-sm text-gray-500 dark:text-slate-500">
                        Results appear here once candidates complete an assessment.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <span className="text-xs sm:text-sm text-gray-600 dark:text-slate-400">
                          <span className="font-semibold text-gray-900 dark:text-slate-50">{total.toLocaleString()}</span> result{total === 1 ? '' : 's'} across all assessments
                        </span>
                        <span className="flex items-center gap-3 text-xs sm:text-sm">
                          <span className="inline-flex items-center gap-1.5 text-green-700 dark:text-green-400">
                            <CheckCircle className="w-3.5 h-3.5" />
                            {completedCandidates.filter(r => r.passed).length} passed
                          </span>
                          <span className="inline-flex items-center gap-1.5 text-red-600 dark:text-red-400">
                            <XCircle className="w-3.5 h-3.5" />
                            {completedCandidates.filter(r => r.passed === false).length} failed
                          </span>
                        </span>
                      </div>
                      {/* Same card + title as the per-assessment results view. */}
                      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 overflow-hidden">
                        <div className="px-4 sm:px-6 py-3 border-b border-gray-100 dark:border-slate-700/60">
                          <h2 className="text-sm sm:text-base font-medium text-gray-900 dark:text-slate-50 tracking-tight">Candidate Results</h2>
                        </div>
                        <div className="min-h-[400px] max-h-[calc(100vh-24rem)] overflow-auto">
                        <table className="w-full min-w-[1500px] table-auto">
                          <thead className="sticky top-0 z-10 [&_th]:bg-slate-50 dark:[&_th]:bg-slate-800 [&_th]:border-b [&_th]:border-gray-200 dark:[&_th]:border-slate-700">
                            <tr>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">CID</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Candidate</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Email</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">JD Title</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Phone</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Invite Source</th>
                              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Tech Score</th>
                              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Coding Score</th>
                              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Result Status</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Timeline</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Completed</th>
                              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Duration</th>
                              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Actions</th>
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
                                  <td className="px-2 sm:px-4 py-4 align-middle" onClick={(e) => e.stopPropagation()}>
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
                            Page {safePage} of {totalPages} · {total.toLocaleString()} total
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setCompletedCandidatesPage(p => Math.max(1, p - 1))}
                              disabled={safePage === 1}
                              className="px-3 py-1.5 text-xs border border-gray-200 dark:border-slate-700 rounded-md hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed text-gray-700 dark:text-slate-300 transition-colors"
                            >
                              Previous
                            </button>
                            <button
                              onClick={() => setCompletedCandidatesPage(p => Math.min(totalPages, p + 1))}
                              disabled={safePage === totalPages}
                              className="px-3 py-1.5 text-xs border border-gray-200 dark:border-slate-700 rounded-md hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed text-gray-700 dark:text-slate-300 transition-colors"
                            >
                              Next
                            </button>
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
                      <div className="flex items-center justify-center py-12">
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

                        {/* Topic Availability Header */}
                        <div className="bg-gradient-to-r from-brand-blue to-brand-cyan rounded-xl p-3 sm:p-4 shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
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
                  <div className="flex items-center justify-center py-8 sm:py-12">
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
                        <div className="flex items-center justify-center py-8">
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
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <Loader2 className="w-10 h-10 text-brand-blue animate-spin mx-auto mb-3" />
                  <p className="text-gray-600 dark:text-slate-400">Loading assessments...</p>
                </div>
              </div>
            ) : filteredAssessments.length === 0 && assessmentListNarrowed ? (
              /* Nothing matched — say so, and offer the way back. */
              <div className="text-center py-12">
                <div className="w-20 h-20 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-10 h-10 text-brand-blue" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-slate-50 mb-2 tracking-tight">No assessments match</h3>
                <p className="text-gray-600 dark:text-slate-400 mb-4">
                  Try a different name, type, creator or date range.
                </p>
                <button
                  onClick={clearAssessmentFilters}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-brand-blue bg-brand-blue/5 ring-1 ring-brand-blue/20 hover:bg-brand-blue/10 transition-colors"
                >
                  <X className="w-4 h-4" />
                  Clear search and filters
                </button>
              </div>
            ) : filteredAssessments.length === 0 ? (
              /* Empty State */
              <div className="text-center py-12">
                <div className="w-20 h-20 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-10 h-10 text-brand-blue" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-slate-50 mb-2 tracking-tight">No assessments yet</h3>
                <p className="text-gray-600 dark:text-slate-400 mb-4">Create your first AI-powered assessment to start evaluating candidates</p>
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
                  className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-lg transition-all ${
                    !canCreateAssessment
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-60'
                      : 'bg-brand-blue hover:bg-brand-blue-2 text-white shadow-md shadow-brand-blue/25 ring-1 ring-white/10'
                  }`}
                >
                  <Sparkles className="w-5 h-5" />
                  Create Assessment
                </button>
              </div>
            ) : viewMode === 'grid' ? (
              /* Grid View */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {filteredAssessments.map((assessment) => (
                  <div
                    key={assessment.id}
                    onClick={() => {
                      if (assessment.status === 'Draft') {
                        if (!canUpdateAssessment) {
                          toast.error('You do not have permission to edit assessments');
                          return;
                        }
                        // For drafts, open edit modal to continue editing
                        handleEditAssessment(assessment);
                      } else {
                        router.push(`/recruitment/assessments/${assessment.id}`);
                      }
                    }}
                    className="p-4 sm:p-5 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] rounded-xl hover:border-brand-blue/30 hover:shadow-md hover:shadow-brand-blue/10 transition-all bg-white dark:bg-slate-900 cursor-pointer"
                  >
                    {/* Grid Card Header — icon on left, action buttons aligned in a straight line at the top right */}
                    <div className="flex items-start justify-between gap-2 mb-3" onClick={(e) => e.stopPropagation()}>
                      <div className="w-10 h-10 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-5 h-5 text-brand-blue" />
                      </div>
                      <div className="flex items-center gap-2 flex-nowrap">
                        {(hasPermission('canUpdateAssessments') || isTenantAdmin) && (() => {
                          const shareBlockedReason =
                            assessment.status === 'Draft' ? 'Publish assessment first to share' :
                            assessment.status === 'Archived' ? 'Archived assessments cannot be shared' :
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
                                setSelectedAssessmentForShare(assessment);
                                setShowShareModal(true);
                              }}
                              disabled={isShareBlocked}
                              className={`flex items-center gap-1.5 px-2.5 py-1.5 border rounded-lg transition-all text-xs whitespace-nowrap ${
                                isShareBlocked
                                  ? 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 text-gray-400 dark:text-slate-500 cursor-not-allowed'
                                  : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue'
                              }`}
                              title={shareBlockedReason || 'Share via email'}
                            >
                              <Mail className="w-3.5 h-3.5" />
                              Share
                            </button>
                          );
                        })()}
                        {assessment.candidates > 0 && (
                          <button
                            onClick={() => handleTrackInvites(assessment)}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg transition-all text-xs whitespace-nowrap"
                            aria-label="Track invitation status" title="Track invitation status"
                          >
                            <Mail className="w-3.5 h-3.5" />
                            Track ({assessment.candidates})
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (assessment.status === 'Draft') return;
                            router.push(`/recruitment/assessments/${assessment.id}/results`);
                          }}
                          disabled={assessment.status === 'Draft'}
                          title={assessment.status === 'Draft' ? 'Publish the assessment to view results' : ''}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all text-xs whitespace-nowrap ${
                            assessment.status === 'Draft'
                              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                              : 'bg-brand-blue hover:bg-brand-blue-2 text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10'
                          }`}
                        >
                          <BarChart className="w-3.5 h-3.5" />
                          Results
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(openMenuId === assessment.id ? null : assessment.id);
                          }}
                          className="p-1.5 text-gray-500 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-gray-700 dark:hover:text-slate-300 rounded transition-colors"
                          aria-label="More actions"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Grid Card Title */}
                    <div className="mb-3">
                      {/* Line 1: AS-022 SQL Developer - Assessment V1 [AI] [Active] */}
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="inline-flex items-center px-2.5 py-1 bg-brand-blue text-white rounded text-xs font-semibold shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
                          {assessment.short_id}
                        </span>
                        <h3 className="text-sm font-medium text-gray-900 dark:text-slate-50 line-clamp-1">
                          {assessment.job?.title || stripVersionFromTitle(assessment.title)} - Assessment
                        </h3>
                        <VersionBadge version={assessment.version} size="sm" variant="secondary" />
                        {assessment.sections && (
                          <span className="px-2 py-0.5 bg-brand-blue/5 text-brand-blue rounded text-xs flex items-center gap-1 flex-shrink-0 ring-1 ring-brand-blue/20">
                            <Sparkles className="w-3 h-3" />
                            AI
                          </span>
                        )}
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ring-1 ${
                            assessment.status === 'Active'
                              ? 'bg-green-100 text-green-700 ring-green-200'
                              : assessment.status === 'Draft'
                              ? 'bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20'
                              : assessment.status === 'Archived'
                              ? 'bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20'
                              : assessment.status === 'Completed'
                              ? 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20'
                              : 'bg-slate-100 text-gray-700 ring-gray-200'
                          }`}
                        >
                          {assessment.status}
                        </span>
                      </div>

                      {/* Line 2: JD-025 SQL Developer <jdversion> */}
                      {assessment.jd_short_id && (
                        <div className="text-xs text-gray-700 dark:text-slate-300 font-medium mb-1.5">
                          <span>{assessment.jd_short_id}</span>
                          {assessment.job && (
                            <span className="ml-2">{assessment.job.title}</span>
                          )}
                          {(assessment.job?.version || assessment.jd_version) && (
                            <span className="ml-1 text-gray-500 dark:text-slate-500">v{assessment.job?.version || assessment.jd_version}</span>
                          )}
                        </div>
                      )}

                      {/* Line 3: created by + Created date + Last Updated */}
                      <div className="text-xs text-gray-600 dark:text-slate-400 mb-1.5 line-clamp-2">
                        {assessment.created_by_name && (
                          <span>created by: {assessment.created_by_name}</span>
                        )}
                        {assessment.created_at && (
                          <span className={assessment.created_by_name ? " ml-1" : ""}>
                            {assessment.created_by_name ? "• " : ""}Created: {formatISTDate(assessment.created_at)}
                          </span>
                        )}
                        {assessment.updated_at && (
                          <span className="block">Last Updated: {formatISTDate(assessment.updated_at)}</span>
                        )}
                      </div>

                      {/* Line 4: 30 min 1 Invitations Sent */}
                      <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-slate-500">
                        <span>{assessment.duration}</span>
                        <span>{assessment.candidates} Invitations</span>
                      </div>
                    </div>

                    {/* Grid Card Actions */}
                    <div className="flex items-center gap-2 pt-3 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                      {(hasPermission('canUpdateAssessments') || isTenantAdmin) && (() => {
                        // Share is blocked for Draft (must publish first), Archived
                        // (out of circulation), and once invites have been revoked
                        // (assessment is sealed — recruiter should clone a new
                        // version to start a fresh invite round).
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
                            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 border rounded-lg transition-all text-xs ${
                              isShareBlocked
                                ? 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 text-gray-400 dark:text-slate-500 cursor-not-allowed'
                                : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue'
                            }`}
                            title={shareBlockedReason || 'Share via email'}
                          >
                            <Mail className="w-3.5 h-3.5" />
                            Share
                          </button>
                        );
                      })()}
                      {/* Results disabled for Draft — a draft has no candidates,
                          so the results page is empty. */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (assessment.status === 'Draft') return;
                          router.push(`/recruitment/assessments/${assessment.id}/results`);
                        }}
                        disabled={assessment.status === 'Draft'}
                        title={assessment.status === 'Draft' ? 'Publish the assessment to view results' : ''}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg transition-all text-xs ${
                          assessment.status === 'Draft'
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            : 'bg-brand-blue hover:bg-brand-blue-2 text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10'
                        }`}
                      >
                        <BarChart className="w-3.5 h-3.5" />
                        Results
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(openMenuId === assessment.id ? null : assessment.id);
                        }}
                        className="p-1.5 text-gray-500 hover:bg-slate-100 hover:text-gray-700 rounded transition-colors"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Grid Card Dropdown Menu */}
                    {openMenuId === assessment.id && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setOpenMenuId(null)}
                        />
                        <div className="absolute right-0 sm:right-4 mt-2 w-44 sm:w-48 bg-white rounded-lg shadow-xl shadow-brand-blue/10 border border-gray-100 ring-1 ring-black/[0.02] py-1 sm:py-1.5 z-20 max-h-[70vh] overflow-y-auto">
                          <button
                            onClick={() => {
                              setSelectedAssessmentForPreview(assessment);
                              setShowPreviewModal(true);
                              setOpenMenuId(null);
                            }}
                            className="w-full px-2.5 sm:px-3 py-2 text-left text-xs sm:text-sm text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:text-brand-blue flex items-center gap-2 sm:gap-2.5 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600 dark:text-slate-400 flex-shrink-0" />
                            Preview
                          </button>
                          <div className="border-t border-gray-100 my-1"></div>
                          {/* Draft assessments hide Activate/Archive — drafts go
                              through the configure-page Publish button, and an
                              unpublished row has nothing meaningful to archive. */}
                          {canUpdateAssessment && assessment.status !== 'Active' && assessment.status !== 'Draft' && (
                            <button
                              onClick={() => handleActivateAssessment(assessment.id)}
                              className="w-full px-2.5 sm:px-3 py-2 text-left text-xs sm:text-sm text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:text-brand-blue flex items-center gap-2 sm:gap-2.5 transition-colors"
                            >
                              <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600 dark:text-slate-400 flex-shrink-0" />
                              Activate
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
                            className={`w-full px-2.5 sm:px-3 py-2 text-left text-xs sm:text-sm flex items-center gap-2 sm:gap-2.5 ${
                              !canDeleteAssessment
                                ? 'text-gray-400 cursor-not-allowed opacity-60'
                                : 'text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue'
                            }`}
                          >
                            <Archive className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600 dark:text-slate-400 flex-shrink-0" />
                            Archive
                          </button>
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
                                className={`w-full px-2.5 sm:px-3 py-2 text-left text-xs sm:text-sm flex items-center gap-2 sm:gap-2.5 ${
                                  isDisabled
                                    ? 'text-gray-400 cursor-not-allowed opacity-60'
                                    : 'text-red-600 hover:bg-red-50'
                                }`}
                              >
                                <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                                Delete
                              </button>
                            );
                          })()}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              /* List View */
              <div className="space-y-3 sm:space-y-4">
                {filteredAssessments.map((assessment) => (
                  <div
                    key={assessment.id}
                    onClick={() => {
                      if (assessment.status === 'Draft') {
                        if (!canUpdateAssessment) {
                          toast.error('You do not have permission to edit assessments');
                          return;
                        }
                        // For drafts, open edit modal to continue editing
                        handleEditAssessment(assessment);
                      } else {
                        router.push(`/recruitment/assessments/${assessment.id}`);
                      }
                    }}
                    className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 transition-all duration-150 cursor-pointer hover:border-brand-blue/30 hover:shadow-md hover:shadow-brand-blue/10 hover:-translate-y-0.5"
                  >
                    <div className="flex flex-col md:flex-row md:items-start gap-3 md:gap-4">
                      {/* Icon */}
                      <div className="hidden md:flex items-center gap-2 flex-shrink-0">
                        <div className="h-9 w-9 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg flex items-center justify-center">
                          <FileText className="h-4 w-4 text-brand-blue" />
                        </div>
                      </div>

                      {/* Assessment Info */}
                      <div className="flex-1 min-w-0">
                          {/* Line 1: AS-022 SQL Developer - Assessment V1 */}
                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <span className="inline-flex items-center px-2.5 py-1 bg-brand-blue text-white rounded text-xs font-semibold shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
                              {assessment.short_id}
                            </span>
                            <h3 className="text-sm font-medium text-gray-900 dark:text-slate-50">
                              {assessment.job?.title || stripVersionFromTitle(assessment.title)} - Assessment
                            </h3>
                            <VersionBadge version={assessment.version} size="sm" variant="secondary" />
                            {assessment.sections && (
                              <span className="px-2 py-0.5 bg-brand-blue/5 text-brand-blue rounded text-xs flex items-center gap-1 flex-shrink-0 ring-1 ring-brand-blue/20">
                                <Sparkles className="w-3 h-3" />
                                AI
                              </span>
                            )}
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ring-1 ${
                                assessment.status === 'Active'
                                  ? 'bg-green-100 text-green-700 ring-green-200'
                                  : assessment.status === 'Draft'
                                  ? 'bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20'
                                  : assessment.status === 'Archived'
                                  ? 'bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20'
                                  : assessment.status === 'Completed'
                                  ? 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20'
                                  : assessment.status === 'Paused'
                                  ? 'bg-slate-200 text-gray-600 ring-gray-300'
                                  : 'bg-slate-100 text-gray-700 ring-gray-200'
                              }`}
                            >
                              {assessment.status}
                            </span>
                          </div>

                          {/* Line 2: JD-025 SQL Developer <jdversion> */}
                          {assessment.jd_short_id && (
                            <div className="text-xs text-gray-700 dark:text-slate-300 font-medium mb-1.5">
                              <span>{assessment.jd_short_id}</span>
                              {assessment.job && (
                                <span className="ml-2">{assessment.job.title}</span>
                              )}
                              {(assessment.job?.version || assessment.jd_version) && (
                                <span className="ml-1 text-gray-500 dark:text-slate-500">v{assessment.job?.version || assessment.jd_version}</span>
                              )}
                            </div>
                          )}

                          {/* Line 3: created by: abishekd • Created: 9 Feb 2026 at 06:46 pm Last Updated: <date> */}
                          <div className="text-xs text-gray-600 dark:text-slate-400 mb-1.5">
                            {assessment.created_by_name && (
                              <span>created by: {assessment.created_by_name}</span>
                            )}
                            {assessment.created_at && (
                              <span className={assessment.created_by_name ? " ml-1" : ""}>
                                {assessment.created_by_name ? "• " : ""}Created: {formatISTDate(assessment.created_at)} at {formatISTTime(assessment.created_at)}
                              </span>
                            )}
                            {assessment.updated_at && (
                              <span className="ml-2">Last Updated: {formatISTDate(assessment.updated_at)} at {formatISTTime(assessment.updated_at)}</span>
                            )}
                          </div>

                          {/* Line 4: 30 min 1 Invitations Sent */}
                          <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-slate-500">
                            <span>{assessment.duration}</span>
                            <span>{assessment.candidates} Invitations Sent</span>
                          </div>
                        </div>
                      {/* /Assessment Info */}

                      {/* Actions — Share, Track Invites, Results, Menu in a straight line at the top */}
                      <div className="flex flex-wrap gap-2 flex-shrink-0 items-start" onClick={(e) => e.stopPropagation()}>
                        {/* Action Buttons — straight line, no wrap, top-aligned */}
                        <div className="flex items-center gap-2 flex-nowrap">
                          {/* Share via Email Button — disabled for Draft (must
                              publish first), Archived (out of circulation), and
                              once invites have been revoked (assessment sealed). */}
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
                                className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg transition-all text-xs whitespace-nowrap ${
                                  isShareBlocked
                                    ? 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 text-gray-400 dark:text-slate-500 cursor-not-allowed'
                                    : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue'
                                }`}
                                title={shareBlockedReason || 'Share via email'}
                              >
                                <Mail className="w-3.5 h-3.5" />
                                Share
                              </button>
                            );
                          })()}

                          {/* Track Invites Button */}
                          {assessment.candidates > 0 && (
                            <button
                              onClick={() => handleTrackInvites(assessment)}
                              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg transition-all text-xs whitespace-nowrap"
                              aria-label="Track invitation status" title="Track invitation status"
                            >
                              <Mail className="w-3.5 h-3.5" />
                              <span className="hidden xl:inline">Track Invites ({assessment.candidates})</span>
                              <span className="xl:hidden">Track ({assessment.candidates})</span>
                            </button>
                          )}

                          {/* View Results Button — disabled for Draft (no candidates yet). */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (assessment.status === 'Draft') return;
                              router.push(`/recruitment/assessments/${assessment.id}/results`);
                            }}
                            disabled={assessment.status === 'Draft'}
                            title={assessment.status === 'Draft' ? 'Publish the assessment to view results' : ''}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all text-xs whitespace-nowrap ${
                              assessment.status === 'Draft'
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-brand-blue hover:bg-brand-blue-2 text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10'
                            }`}
                          >
                            <BarChart className="w-3.5 h-3.5" />
                            Results
                          </button>
                        </div>

                        {/* Three Dots Menu group */}
                        <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
                          {/* Three Dots Menu */}
                          <div className="relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuId(openMenuId === assessment.id ? null : assessment.id);
                              }}
                              className="p-1.5 text-gray-500 dark:text-slate-500 hover:bg-slate-100 hover:text-gray-700 rounded transition-colors"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>

                          {/* Dropdown Menu */}
                          {openMenuId === assessment.id && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setOpenMenuId(null)}
                              />
                              <div className="absolute right-0 top-full mt-2 w-44 sm:w-52 bg-white rounded-lg shadow-xl shadow-brand-blue/10 border border-gray-100 ring-1 ring-black/[0.02] py-1 sm:py-1.5 z-20 max-h-[70vh] overflow-y-auto">
                                <button
                                  onClick={() => {
                                    setSelectedAssessmentForPreview(assessment);
                                    setShowPreviewModal(true);
                                    setOpenMenuId(null);
                                  }}
                                  className="w-full px-2.5 sm:px-3 py-2 text-left text-xs sm:text-sm text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:text-brand-blue flex items-center gap-2 sm:gap-2.5 transition-colors"
                                >
                                  <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600 dark:text-slate-400 flex-shrink-0" />
                                  Preview
                                </button>
                                {assessment.status !== 'Archived' && canCreateAssessment && (() => {
                                  // Gating computed FRONT-END so it works regardless of
                                  // whether the backend has the new clone_button_disabled
                                  // flag deployed. Four reasons to disable:
                                  //   1. Draft → must publish first
                                  //   2. Clone (version > 1) → only V1 can be duplicated
                                  //   3. Cap reached (3 sibling versions exist for this JD)
                                  //      — counted from the currently-loaded list as a
                                  //      fallback so V1 greys out the moment V3 is created,
                                  //      even before the backend redeploy lands the
                                  //      clone_cap_reached flag.
                                  //   4. Backend flag (extra safety / future-proofing)
                                  const isDraft = assessment.status === 'Draft';
                                  const isClone = (assessment.version || 1) > 1;
                                  const isV1 = (assessment.version || 1) === 1;
                                  // Sibling count from the loaded list (live across renders).
                                  const siblingCountInList = assessment.jd_id
                                    ? apiAssessments.filter((x: any) =>
                                        x.jd_id === assessment.jd_id && x.status !== 'Archived'
                                      ).length
                                    : 0;
                                  const capReached =
                                    assessment.clone_cap_reached === true ||
                                    (assessment.jd_assessment_count !== undefined && assessment.jd_assessment_count >= 3) ||
                                    siblingCountInList >= 3;
                                  const backendDisabled = !!assessment.clone_button_disabled;
                                  const buttonDisabled = isDraft || isClone || (isV1 && capReached) || backendDisabled;
                                  const disabledReason = isDraft
                                    ? 'Publish the assessment before duplicating.'
                                    : isClone
                                    ? 'Only the original assessment (Version 1) can be duplicated.'
                                    : (isV1 && capReached)
                                    ? 'Maximum 3 versions reached. Archive a version to duplicate again.'
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
                                      className={`w-full px-2.5 sm:px-3 py-2 text-left text-xs sm:text-sm flex items-center gap-2 sm:gap-2.5 transition-colors ${
                                        buttonDisabled
                                          ? 'text-gray-400 cursor-not-allowed'
                                          : 'text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue'
                                      }`}
                                    >
                                      <Copy className={`w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 ${buttonDisabled ? 'text-gray-300' : 'text-gray-600'}`} />
                                      Duplicate
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
                                      className={`w-full px-2.5 sm:px-3 py-2 text-left text-xs sm:text-sm flex items-center gap-2 sm:gap-2.5 transition-colors ${
                                        revokeDisabled
                                          ? 'text-gray-400 cursor-not-allowed'
                                          : 'text-red-700 hover:bg-red-50'
                                      }`}
                                    >
                                      <Ban className={`w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 ${revokeDisabled ? 'text-gray-300' : ''}`} />
                                      Revoke pending invites
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
                                    className="w-full px-2.5 sm:px-3 py-2 text-left text-xs sm:text-sm text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:text-brand-blue flex items-center gap-2 sm:gap-2.5 transition-colors"
                                  >
                                    <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600 dark:text-slate-400 flex-shrink-0" />
                                    Activate
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
                                  className={`w-full px-2.5 sm:px-3 py-2 text-left text-xs sm:text-sm flex items-center gap-2 sm:gap-2.5 ${
                                    !canDeleteAssessment
                                      ? 'text-gray-400 cursor-not-allowed opacity-60'
                                      : 'text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue'
                                  }`}
                                >
                                  <Archive className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600 dark:text-slate-400 flex-shrink-0" />
                                  Archive
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
                                      className={`w-full px-2.5 sm:px-3 py-2 text-left text-xs sm:text-sm flex items-center gap-2 sm:gap-2.5 ${
                                        isDisabled
                                          ? 'text-gray-400 cursor-not-allowed opacity-60'
                                          : 'text-red-600 hover:bg-red-50'
                                      }`}
                                    >
                                      <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                                      Delete
                                    </button>
                                  );
                                })()}
                              </div>
                            </>
                          )}
                        </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {assessmentPaginationVisible && (
              <ListPagination
                currentPage={assessmentCurrentPage}
                itemsPerPage={assessmentItemsPerPage}
                totalItems={assessmentTotalItems}
                onPageChange={setAssessmentCurrentPage}
                onItemsPerPageChange={setAssessmentItemsPerPage}
                itemLabel="assessments"
              />
            )}
          </div>
        </div>
        </>
        )}

      </div>
      </div>

      {/* Share Assessment Modal */}
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
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-6">
          <div className="bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-2xl shadow-brand-blue/10 sm:border sm:border-gray-100 dark:sm:border-slate-700/60 sm:ring-1 sm:ring-black/[0.02] dark:sm:ring-white/[0.02] w-full sm:max-w-5xl h-[95dvh] sm:h-[calc(100dvh-3rem)] max-h-[95dvh] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="px-3 sm:px-6 py-2.5 sm:py-4 border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 flex items-center justify-between flex-shrink-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-brand-blue flex items-center justify-center shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 flex-shrink-0">
                    <Users className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm sm:text-lg font-semibold text-gray-900 dark:text-slate-50 truncate tracking-tight">
                      <span className="hidden sm:inline">Invite Status Tracking</span>
                      <span className="sm:hidden">Invite Status</span>
                    </h2>
                    <p className="text-[10px] sm:text-sm text-gray-500 dark:text-slate-500 mt-0.5 truncate">{selectedAssessmentForTracking.title}</p>
                  </div>
                </div>
              </div>
              <button
                onClick={closeTrackInvitesModal}
                className="p-2 text-gray-400 dark:text-slate-500 hover:text-brand-blue hover:bg-brand-blue/5 rounded-lg transition-colors"
               aria-label="Close">
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>

            {/* Stats Cards */}
            <div className="px-2.5 sm:px-6 py-2.5 sm:py-4 bg-slate-50 dark:bg-slate-950 border-b border-gray-100 dark:border-slate-700/60 flex-shrink-0">
              <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-6 gap-1 sm:gap-4">
                <div className="bg-white dark:bg-slate-900 rounded-md sm:rounded-lg p-1.5 sm:p-3 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 text-center sm:text-left">
                  <div className="flex items-center justify-center sm:justify-start gap-1 sm:gap-2 text-brand-blue text-[9px] sm:text-xs mb-0.5 sm:mb-1">
                    <Users className="w-3.5 h-3.5 hidden sm:block" />
                    <span>Total Invited</span>
                  </div>
                  <p className="text-sm sm:text-2xl font-bold text-brand-blue">{invitationStats.total}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-md sm:rounded-lg p-1.5 sm:p-3 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 text-center sm:text-left">
                  <div className="flex items-center justify-center sm:justify-start gap-1 sm:gap-2 text-brand-orange-deep text-[9px] sm:text-xs mb-0.5 sm:mb-1">
                    <Clock className="w-3.5 h-3.5 hidden sm:block" />
                    <span>Invite Expired</span>
                  </div>
                  <p className="text-sm sm:text-2xl font-bold text-brand-orange-deep">{invitationStats.expired}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-md sm:rounded-lg p-1.5 sm:p-3 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 text-center sm:text-left">
                  <div className="flex items-center justify-center sm:justify-start gap-1 sm:gap-2 text-red-600 text-[9px] sm:text-xs mb-0.5 sm:mb-1">
                    <X className="w-3.5 h-3.5 hidden sm:block" />
                    <span>Invite Failed</span>
                  </div>
                  <p className="text-sm sm:text-2xl font-bold text-red-600">{invitationStats.failed}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-md sm:rounded-lg p-1.5 sm:p-3 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 text-center sm:text-left">
                  <div className="flex items-center justify-center sm:justify-start gap-1 sm:gap-2 text-brand-cyan text-[9px] sm:text-xs mb-0.5 sm:mb-1">
                    <Play className="w-3.5 h-3.5 hidden sm:block" />
                    <span>In Progress</span>
                  </div>
                  <p className="text-sm sm:text-2xl font-bold text-brand-cyan">{invitationStats.started}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-md sm:rounded-lg p-1.5 sm:p-3 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 text-center sm:text-left">
                  <div className="flex items-center justify-center sm:justify-start gap-1 sm:gap-2 text-brand-blue text-[9px] sm:text-xs mb-0.5 sm:mb-1">
                    <CheckCircle className="w-3.5 h-3.5 hidden sm:block" />
                    <span>Completed</span>
                  </div>
                  <p className="text-sm sm:text-2xl font-bold text-brand-blue">{invitationStats.completed}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-md sm:rounded-lg p-1.5 sm:p-3 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 text-center sm:text-left">
                  <div className="flex items-center justify-center sm:justify-start gap-1 sm:gap-2 text-brand-blue text-[9px] sm:text-xs mb-0.5 sm:mb-1">
                    <TrendingUp className="w-3.5 h-3.5 hidden sm:block" />
                    <span>Completion Rate</span>
                  </div>
                  <p className="text-sm sm:text-2xl font-bold text-brand-blue">
                    {invitationStats.total > 0 ? Math.round((invitationStats.completed / invitationStats.total) * 100) : 0}%
                  </p>
                </div>
              </div>
            </div>

            <InviteFilterBar
              filters={trackingFilters}
              onChange={(nextFilters) => {
                setTrackingFilters(nextFilters);
                setTrackingCurrentPage(1);
              }}
              statusOptions={ASSESSMENT_INVITE_STATUS_OPTIONS}
              searchPlaceholder="Search by candidate name, email, or CID..."
            />

            {/* Invitations Table / Cards */}
            <div className="px-2.5 sm:px-6 py-2.5 sm:py-4 overflow-auto flex-1 min-h-0">
              {isLoadingInvitations ? (
                <div className="flex items-center justify-center py-8 sm:py-12">
                  <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 text-brand-blue animate-spin" />
                </div>
              ) : trackingInvitations.length === 0 ? (
                <div className="text-center py-8 sm:py-12 text-gray-500 dark:text-slate-500">
                  <Users className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 text-brand-blue/40" />
                  <p className="text-xs sm:text-sm">
                    {trackingHasActiveFilters
                      ? 'No invitations match the current filters.'
                      : 'No invitations found for this assessment.'}
                  </p>
                </div>
              ) : (
                <table className="w-full min-w-[900px] table-fixed">
                  <colgroup>
                    <col className="w-[80px]" />
                    <col className="w-[240px]" />
                    <col className="w-[140px]" />
                    <col className="w-[220px]" />
                    {(selectedAssessmentForTracking?.technical_enabled ?? true) && <col className="w-[100px]" />}
                    {selectedAssessmentForTracking?.coding_enabled && <col className="w-[100px]" />}
                    <col className="w-[170px]" />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-slate-700">
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">CID</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Candidate</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Timeline</th>
                      {/* Tech / Coding Score columns are conditional on the
                          assessment having that round enabled — same rule as
                          the Results page. Showing a "Coding Score" column
                          for a JD without a coding round produced a
                          permanent "—" column that confused recruiters. */}
                      {(selectedAssessmentForTracking?.technical_enabled ?? true) && (
                        <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tech Score</th>
                      )}
                      {selectedAssessmentForTracking?.coding_enabled && (
                        <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Coding Score</th>
                      )}
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                    {trackingInvitations.map((invitation: any) => {
                      const getStatusBadge = (inv: any) => {
                        const s = inv.status;
                        const base = "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ring-1";
                        if (s === 'completed' || inv.completed_at) {
                          const autoCompleted = inv.termination_code === 'TENANT_SESSION_TIMEOUT';
                          return (
                            <span
                              className={`${base} bg-brand-blue/10 text-brand-blue ring-brand-blue/20`}
                              title={autoCompleted ? 'Auto-submitted when the assessment duration elapsed' : undefined}
                            >
                              <CheckCircle className="w-3 h-3" />
                              Completed
                              {autoCompleted && <span className="text-brand-blue/80">(Auto)</span>}
                            </span>
                          );
                        }
                        if (s === 'failed') {
                          return <span className={`${base} bg-red-50 text-red-600 ring-red-200`}><X className="w-3 h-3" /> Invite Failed</span>;
                        }
                        if (s === 'bounced' || inv.bounced_at) {
                          return <span className={`${base} bg-red-50 text-red-600 ring-red-200`}><RefreshCw className="w-3 h-3" /> Bounced</span>;
                        }
                        if (s === 'expired') {
                          return <span className={`${base} bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20`}><Clock className="w-3 h-3" /> Expired</span>;
                        }
                        if (s === 'abandoned') {
                          return <span className={`${base} bg-gray-100 text-gray-700 ring-gray-200`}><X className="w-3 h-3" /> Abandoned</span>;
                        }
                        if (s === 'started' || inv.started_at) {
                          return <span className={`${base} bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20`}><Play className="w-3 h-3" /> Started</span>;
                        }
                        if (s === 'opened' || inv.opened_at) {
                          return <span className={`${base} bg-brand-cyan/10 text-brand-cyan ring-brand-cyan/20`}><Eye className="w-3 h-3" /> Link Opened</span>;
                        }
                        if (s === 'sent' || inv.sent_at) {
                          return <span className={`${base} bg-brand-blue/10 text-brand-blue ring-brand-blue/20`}><Mail className="w-3 h-3" /> Invite Sent</span>;
                        }
                        return <span className={`${base} bg-gray-100 text-gray-600 ring-gray-200`}><Clock className="w-3 h-3" /> Pending</span>;
                      };

                      // Show an additional "Expired" badge alongside the base status
                      // when the invitation has passed its expiry but hasn't reached a
                      // terminal state. Covers the case where a candidate started the
                      // system check but never started the assessment. Once a unit has
                      // been consumed (candidate actually started the assessment),
                      // expiry no longer applies.
                      const isInvExpired = (inv: any): boolean => {
                        const s = inv.status;
                        if (['completed', 'failed', 'bounced', 'abandoned', 'expired'].includes(s) || inv.completed_at || inv.bounced_at) return false;
                        if (inv.unit_consumed) return false;
                        return !!(inv.expires_at && new Date(inv.expires_at) < new Date());
                      };

                          const initials = invitation.candidate_name
                            ?.split(' ')
                            .map((n: string) => n[0])
                            .join('')
                            .toUpperCase()
                            .slice(0, 2) || '??';

                      return (
                        <tr key={invitation.id} className="hover:bg-brand-blue/5 transition-colors">
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
                              <div className="min-w-0">
                                <p className="font-medium text-gray-900 dark:text-slate-50 text-sm truncate">{invitation.candidate_name}</p>
                                <p className="text-xs text-gray-500 dark:text-slate-500 truncate">{invitation.candidate_email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 align-top">
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {getStatusBadge(invitation)}
                                {isInvExpired(invitation) && (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ring-1 bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20">
                                    <Clock className="w-3 h-3" /> Expired
                                  </span>
                                )}
                              </div>
                              {invitation.status === 'failed' && (
                                <p className="text-xs text-red-600 mt-1">Incorrect Email</p>
                              )}
                            </div>
                          </td>
                              <td className="py-3 px-3 lg:px-4 align-top text-xs text-gray-500 dark:text-slate-500 hidden md:table-cell">
                                <div className="space-y-1">
                                  {invitation.sent_at && (
                                    <div className="flex items-center gap-2">
                                      <Mail className="w-3 h-3 text-brand-blue flex-shrink-0" />
                                      <span>Sent: {formatIST(invitation.sent_at)}</span>
                                </div>
                              )}
                              {invitation.bounced_at && (
                                <div className="flex items-center gap-2">
                                  <RefreshCw className="w-3 h-3 text-red-600 flex-shrink-0" />
                                  <span className="text-red-600">Bounced: {formatIST(invitation.bounced_at)}</span>
                                </div>
                              )}
                              {invitation.started_at && (
                                <div className="flex items-center gap-2">
                                  <Play className="w-3 h-3 text-brand-orange-deep flex-shrink-0" />
                                  <span>Started: {formatIST(invitation.started_at)}</span>
                                </div>
                              )}
                              {invitation.completed_at && (
                                <div className="flex items-center gap-2">
                                  <CheckCircle className="w-3 h-3 text-brand-blue flex-shrink-0" />
                                  <span>Completed: {formatIST(invitation.completed_at)}</span>
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
                                    <Clock className="w-3 h-3 text-brand-orange-deep flex-shrink-0" />
                                    <span className="text-brand-orange-deep">Expired at: {formatIST(invitation.expires_at)}</span>
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
                          {(selectedAssessmentForTracking?.technical_enabled ?? true) && (() => {
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
                          {selectedAssessmentForTracking?.coding_enabled && (() => {
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
                          <td className="py-3 px-4 align-top">
                            {(invitation.status === 'completed' || invitation.completed_at) ? (
                              invitation.attempt_id ? (
                                <button
                                  onClick={() => router.push(
                                    `/recruitment/assessments/${selectedAssessmentForTracking.id}/results/details`
                                    + `?candidate_id=${invitation.attempt_id}`
                                    + `${invitation.candidate_display_id ? `&cid=${encodeURIComponent(invitation.candidate_display_id)}` : ''}`
                                  )}
                                  className="flex items-center gap-1 px-3 py-1.5 text-xs text-brand-blue hover:bg-brand-blue/10 rounded-lg transition-colors"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  View Results
                                </button>
                              ) : (
                                // Completed-but-no-attempt — extremely rare orphaned invitation. Render
                                // disabled so we don't silently dump the user on the aggregate page.
                                <button
                                  disabled
                                  title="Result detail unavailable for this invitation"
                                  className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-400 rounded-lg cursor-not-allowed"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  View Results
                                </button>
                              )
                            ) : invitation.status === 'bounced' ? (
                              editingEmailId === invitation.id ? (
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
                              ) : (
                                <button
                                  onClick={() => { setEditingEmailId(invitation.id); setNewEmailValue(invitation.candidate_email); }}
                                  className="flex items-center gap-1 px-3 py-1.5 text-xs border border-brand-blue/30 text-brand-blue bg-white dark:bg-slate-900 hover:bg-brand-blue/5 rounded-lg transition-colors whitespace-nowrap"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                  Change Email
                                </button>
                              )
                            ) : (['sent', 'opened', 'failed'].includes(invitation.status) && !invitation.started_at && !invitation.completed_at) ? (
                              // Resend retries the SAME address (good for a transient
                              // network failure); Edit Email lets the recruiter fix a
                              // mistyped address before resending (the common cause of
                              // a "failed"/"Incorrect Email" invite).
                              editingEmailId === invitation.id ? (
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
                              ) : (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => setResendTargetInvitation(invitation)}
                                    aria-label="Revoke old link and send a new invitation" title="Revoke old link and send a new invitation"
                                    className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg transition-all ${
                                      invitation.status === 'failed'
                                        ? 'bg-red-600 text-white hover:bg-red-700'
                                        : 'border border-brand-blue/30 text-brand-blue bg-white hover:bg-brand-blue/5'
                                    }`}
                                  >
                                    <Mail className="w-3.5 h-3.5" />
                                    Resend
                                  </button>
                                  <button
                                    onClick={() => { setEditingEmailId(invitation.id); setNewEmailValue(invitation.candidate_email); }}
                                    aria-label="Edit email address and resend" title="Edit email address and resend"
                                    className="flex items-center gap-1 px-3 py-1.5 text-xs border border-brand-blue/30 text-brand-blue bg-white dark:bg-slate-900 hover:bg-brand-blue/5 rounded-lg transition-colors whitespace-nowrap"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                    Edit Email
                                  </button>
                                </div>
                              )
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-100 dark:border-slate-700/60 flex items-center justify-between bg-slate-50 dark:bg-slate-950 shrink-0">
              <p className="text-sm text-gray-500 dark:text-slate-500">
                {trackingResultsLabel}
              </p>
              <div className="flex items-center gap-2">
                {trackingPaginationVisible && (
                  <>
                    <button
                      onClick={() => setTrackingCurrentPage(1)}
                      disabled={trackingCurrentPage === 1}
                      className="px-3 py-1.5 text-sm border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors"
                    >
                      First
                    </button>
                    <button
                      onClick={() => setTrackingCurrentPage(trackingCurrentPage - 1)}
                      disabled={trackingCurrentPage === 1}
                      className="px-3 py-1.5 text-sm border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors"
                    >
                      Prev
                    </button>
                    <span className="px-2 text-sm text-gray-600 dark:text-slate-400">
                      Page {trackingCurrentPage} of {trackingTotalPages}
                    </span>
                    <button
                      onClick={() => setTrackingCurrentPage(trackingCurrentPage + 1)}
                      disabled={trackingCurrentPage === trackingTotalPages}
                      className="px-3 py-1.5 text-sm border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors"
                    >
                      Next
                    </button>
                    <button
                      onClick={() => setTrackingCurrentPage(trackingTotalPages)}
                      disabled={trackingCurrentPage === trackingTotalPages}
                      className="px-3 py-1.5 text-sm border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors"
                    >
                      Last
                    </button>
                  </>
                )}
                <button
                  onClick={closeTrackInvitesModal}
                  className="px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-all shadow-sm shadow-brand-blue/25 ring-1 ring-white/10"
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

      {/* Clone confirmation — creates a draft copy. Recruiter publishes
          and invites V2 candidates manually via the normal invite flow. */}
      <ConfirmationDialog
        isOpen={!!cloneTargetAssessment}
        onClose={() => { if (!isCloning) setCloneTargetAssessment(null); }}
        onConfirm={handleConfirmClone}
        title="Duplicate assessment?"
        description={
          cloneTargetAssessment
            ? `A draft copy of "${stripVersionFromTitle(cloneTargetAssessment.title || '')}" will be created. You can edit it before publishing.`
            : ''
        }
        confirmText={isCloning ? 'Duplicating…' : 'Duplicate'}
        cancelText="Cancel"
        variant="info"
      />

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
