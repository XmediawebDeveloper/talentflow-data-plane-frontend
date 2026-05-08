'use client';

import { Plus, Clock, Users, CheckCircle, FileText, FileCheck, MoreVertical, Play, Sparkles, Eye, Edit2, BarChart, Mail, Trash2, Copy, Archive, Download, Link2, Share2, PauseCircle, LayoutGrid, List, Monitor, Brain, Code, ClipboardList, Globe, Pencil, Zap, Shield, Video, X, Info, CheckCircle2, MonitorOff, Clipboard, Lock, TrendingUp, Activity } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import AssessmentCreation from './AssessmentCreation';
import ListPagination from './ListPagination';
import AssessmentResults from './AssessmentResults';
import ShareAssessmentModal from './ShareAssessmentModal';
import AssessmentAuditTrail from './AssessmentAuditTrail';
import ConsentLogs from './compliance/ConsentLogs';
import AssessmentPreviewModal from './AssessmentPreviewModal';
import AssessmentEditModal from './AssessmentEditModal';
import AssessmentDetailsView from './AssessmentDetailsView';
import { Job } from '@/lib/types/types';
import { assessmentService } from '@/lib/services';
import { recordAssessment } from '@/lib/services/usageTrackingService';
import api from '@/lib/services/api';
import { proctoringService, ProctoringSettings, ProctoringEvent } from '@/lib/services/proctoringService';
import { AlertTriangle, RefreshCw, Send } from 'lucide-react';
import { stripVersionFromTitle } from '@/lib/utils/assessmentUtils';
import { formatIST, formatISTDate, formatISTTime } from '@/lib/utils/dateUtils';
import VersionBadge from './VersionBadge';
import { useGlobalDialog } from '@/components/providers/GlobalDialogProvider';
import { toast } from 'sonner';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';


const INVITATIONS_PAGE_SIZE = 10;

interface AssessmentsProps {
  jobs: Job[];
  onOpenCandidateView?: () => void;
  onNavigateToJDCreation?: () => void;
  autoOpenCreate?: boolean;
  preSelectedJdId?: string;
  preSelectedJdTitle?: string;
}

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

  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'draft' | 'completed' | 'audit' | 'consent' | 'archived' | 'settings'>('all');
  const [settingsSubTab, setSettingsSubTab] = useState<'proctoring' | 'topics'>('proctoring');
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
  const [isLoading, setIsLoading] = useState(false);
  const [apiAssessments, setApiAssessments] = useState<any[]>([]);
  const [assessmentCurrentPage, setAssessmentCurrentPage] = useState(1);
  const [assessmentItemsPerPage, setAssessmentItemsPerPage] = useState(10);
  const [assessmentTotalItems, setAssessmentTotalItems] = useState(0);
  const [assessmentTotalPages, setAssessmentTotalPages] = useState(1);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [availableUnits, setAvailableUnits] = useState<number | null>(null);
  const [totalUnits, setTotalUnits] = useState<number>(10); // Total subscription limit
  const [isUnlimited, setIsUnlimited] = useState<boolean>(false); // Track if quota is unlimited
  const [quotaPercentage, setQuotaPercentage] = useState<number>(0); // Percentage of quota used
  const [trackingCurrentPage, setTrackingCurrentPage] = useState(1);
  const [trackingTotalItems, setTrackingTotalItems] = useState(0);
  const [trackingTotalPages, setTrackingTotalPages] = useState(1);

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

  const loadTrackingInvitations = async (assessment: any, page: number) => {
    setIsLoadingInvitations(true);
    try {
      const response = await assessmentService.listInvitations(assessment.id, {
        page,
        page_size: INVITATIONS_PAGE_SIZE,
      });
      const invitations = response.items || [];
      setTrackingInvitations(invitations);
      setTrackingTotalItems(response.total || 0);
      const totalPages = Math.max(1, Math.ceil((response.total || 0) / INVITATIONS_PAGE_SIZE));
      setTrackingTotalPages(totalPages);

      // Single-bucket classifier so the five card stats stay mutually
      // exclusive (each invitation falls into exactly one of: completed,
      // failed, expired, in-progress, or sent/waiting). Earlier the same
      // invitation could be counted under both expired and failed because
      // 'expired' was inside the failed list; recruiters saw inflated
      // failure counts.
      const _now = new Date();
      const _bucket = (inv: any): 'completed' | 'failed' | 'expired' | 'started' | 'sent' => {
        const s = (inv.status || '').toLowerCase();
        if (s === 'completed' || inv.completed_at) return 'completed';
        if (['failed', 'bounced', 'abandoned'].includes(s)) return 'failed';
        if (s === 'expired') return 'expired';
        // Clock-based expiry: link expires_at past + candidate didn't start.
        if (!inv.started_at && !inv.unit_consumed && inv.expires_at && new Date(inv.expires_at) < _now) {
          return 'expired';
        }
        if (s === 'started' || (inv.started_at && !inv.completed_at)) return 'started';
        return 'sent';
      };
      const stats = {
        total: response.total || invitations.length,
        expired: invitations.filter((inv: any) => _bucket(inv) === 'expired').length,
        started: invitations.filter((inv: any) => _bucket(inv) === 'started').length,
        completed: invitations.filter((inv: any) => _bucket(inv) === 'completed').length,
        failed: invitations.filter((inv: any) => _bucket(inv) === 'failed').length,
      };
      setInvitationStats(stats);

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
  }, [activeTab, preSelectedJdId, assessmentCurrentPage, assessmentItemsPerPage]);

  useEffect(() => {
    setAssessmentCurrentPage(1);
  }, [activeTab, preSelectedJdId, assessmentItemsPerPage]);

  useEffect(() => {
    if (!showTrackInvitesModal || !selectedAssessmentForTracking) return;
    loadTrackingInvitations(selectedAssessmentForTracking, trackingCurrentPage);
  }, [showTrackInvitesModal, selectedAssessmentForTracking, trackingCurrentPage]);

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
    // Check if candidates have been invited - if so, block editing
    if (assessment.invitations_count > 0 || assessment.candidates > 0) {
      toast.warning(`Cannot edit this assessment - ${assessment.invitations_count || assessment.candidates} candidate(s) have already been invited. Please create a new assessment instead.`);
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

  // Mark assessment as completed (uses dedicated /close endpoint)
  const handleCompleteAssessment = async (assessmentId: string) => {
    if (!await dialog.confirm({ title: 'Complete Assessment', message: 'Mark this assessment as completed? This action cannot be undone.', variant: 'confirm', confirmText: 'Complete' })) return;

    try {
      await assessmentService.close(assessmentId);
      await reloadAssessments();
      setOpenMenuId(null);
    } catch (error: any) {
      console.error('Failed to complete assessment:', error);
      const errorMessage = error?.message || 'Unknown error';
      if (errorMessage.includes('403') || errorMessage.toLowerCase().includes('forbidden')) {
        toast.error('Permission denied: You do not have permission to complete this assessment. Please contact your administrator.');
      } else {
        toast.error(`Failed to complete assessment: ${errorMessage}`);
      }
      setOpenMenuId(null);
    }
  };

  // Track Invites - Load invitations for an assessment
  const handleTrackInvites = async (assessment: any) => {
    setSelectedAssessmentForTracking(assessment);
    setShowTrackInvitesModal(true);
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
      await loadTrackingInvitations(selectedAssessmentForTracking, trackingCurrentPage);
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
      await loadTrackingInvitations(selectedAssessmentForTracking, trackingCurrentPage);
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

  const filteredAssessments = assessments.filter((assessment) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'active') return assessment.status === 'Active';
    if (activeTab === 'draft') return assessment.status === 'Draft';
    if (activeTab === 'completed') return assessment.status === 'Completed';
    if (activeTab === 'archived') return assessment.status === 'Archived';
    return true;
  });
  const assessmentPaginationVisible = !['audit', 'consent', 'settings'].includes(activeTab) && assessmentTotalItems > 5;
  const assessmentStartIndex = assessmentTotalItems === 0 ? 0 : (assessmentCurrentPage - 1) * assessmentItemsPerPage + 1;
  const assessmentEndIndex = Math.min(assessmentCurrentPage * assessmentItemsPerPage, assessmentTotalItems);
  const trackingPaginationVisible = trackingTotalPages > 1;
  const trackingStartIndex = trackingTotalItems === 0 ? 0 : (trackingCurrentPage - 1) * INVITATIONS_PAGE_SIZE + 1;
  const trackingEndIndex = Math.min(trackingCurrentPage * INVITATIONS_PAGE_SIZE, trackingTotalItems);

  return (
    <div className="flex-1 p-4 md:p-8 overflow-y-auto bg-slate-50">
      <div className="w-full">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <div className="flex items-start gap-3">
            <div className="hidden sm:flex w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 items-center justify-center shrink-0">
              <ClipboardList className="w-4 h-4 text-brand-blue" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl text-gray-900 mb-0.5 tracking-tight font-semibold">Assessment Management</h1>
              <p className="text-xs sm:text-sm text-gray-600">
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
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ring-1 shadow-sm ${
                isUnlimited
                  ? 'bg-brand-blue/5 ring-brand-blue/20 shadow-brand-blue/5'
                  : (totalUnits - stats.units_consumed) <= 0
                  ? 'bg-red-50 ring-red-200 shadow-red-500/10'
                  : (totalUnits - stats.units_consumed) <= 2
                  ? 'bg-brand-orange/5 ring-brand-orange/20 shadow-brand-orange/5'
                  : 'bg-brand-blue/5 ring-brand-blue/20 shadow-brand-blue/5'
              }`}>
                <Zap className={`w-4 h-4 ${
                  isUnlimited
                    ? 'text-brand-blue'
                    : (totalUnits - stats.units_consumed) <= 0
                    ? 'text-red-600'
                    : (totalUnits - stats.units_consumed) <= 2
                    ? 'text-brand-orange'
                    : 'text-brand-blue'
                }`} />
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500 font-medium">Assessment Quota</span>
                  <div className="flex items-center gap-1">
                    {isUnlimited ? (
                      <span className="text-sm font-bold text-brand-blue">Unlimited</span>
                    ) : availableUnits !== null ? (
                      <>
                        {/* Use availableUnits from API (source of truth from Control Plane) */}
                        <span className={`text-sm font-bold ${
                          availableUnits === 0
                            ? 'text-red-700'
                            : availableUnits <= 2
                            ? 'text-brand-orange-deep'
                            : 'text-gray-900'
                        }`}>{availableUnits}</span>
                        <span className="text-xs text-gray-500">/ {totalUnits} available</span>
                      </>
                    ) : (
                      <span className="text-xs text-gray-400">Loading...</span>
                    )}
                  </div>
                </div>
              </div>
            )}
            {onOpenCandidateView && (
              <button
                onClick={onOpenCandidateView}
                className="flex items-center gap-1.5 border border-brand-blue/30 text-brand-blue bg-white px-3 py-2 rounded-lg hover:bg-brand-blue/5 transition-colors shadow-sm text-sm"
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
                    : 'bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white shadow-brand-blue/25 ring-1 ring-white/10'
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
              <h3 className="text-sm font-medium text-gray-900 mb-1 tracking-tight">AI-Powered Assessments</h3>
              <p className="text-sm text-gray-600">
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

          {/* Row 2: Current State Metrics (Total Assessments, Active, Candidates Tested) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-4 hover:shadow-md hover:shadow-brand-blue/10 transition-shadow">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                  <FileText className="w-3.5 h-3.5 text-brand-blue" />
                </div>
                <span className="text-xs text-gray-500">Total Assessments</span>
              </div>
              <div className="text-xl font-semibold text-gray-900 tracking-tight">
                {isLoadingStats ? '...' : stats.total_assessments.toLocaleString()}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-4 hover:shadow-md hover:shadow-brand-blue/10 transition-shadow">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-green-100 to-emerald-100 ring-1 ring-green-200 flex items-center justify-center">
                  <Play className="w-3.5 h-3.5 text-green-700" />
                </div>
                <span className="text-xs text-gray-500">Active</span>
              </div>
              <div className="text-xl font-semibold text-gray-900 tracking-tight">
                {isLoadingStats ? '...' : stats.active_assessments.toLocaleString()}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-4 hover:shadow-md hover:shadow-brand-blue/10 transition-shadow">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg bg-brand-cyan/10 ring-1 ring-brand-cyan/15 flex items-center justify-center">
                  <Users className="w-3.5 h-3.5 text-brand-cyan" />
                </div>
                <span className="text-xs text-gray-500">Candidates Assessed</span>
              </div>
              <div className="text-xl font-semibold text-gray-900 tracking-tight">
                {isLoadingStats ? '...' : stats.total_candidates_completed.toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5">
          <div className="border-b border-gray-100 px-3 sm:px-6">
            <div className="relative">
              <div className="flex gap-3 sm:gap-5 overflow-x-auto pr-16 sm:pr-20 scrollbar-hide">
                <button
                  onClick={() => setActiveTab('all')}
                  className={`py-2.5 sm:py-3 text-xs sm:text-sm border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === 'all'
                      ? 'border-brand-blue text-brand-blue font-medium'
                      : 'border-transparent text-gray-600 hover:text-brand-blue'
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
                      : 'border-transparent text-gray-600 hover:text-brand-blue'
                  }`}
                >
                  Active
                </button>
                <button
                  onClick={() => setActiveTab('draft')}
                  className={`py-2.5 sm:py-3 text-xs sm:text-sm border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === 'draft'
                      ? 'border-brand-blue text-brand-blue font-medium'
                      : 'border-transparent text-gray-600 hover:text-brand-blue'
                  }`}
                >
                  Draft
                </button>
                {/* <button
                  onClick={() => setActiveTab('completed')}
                  className={`py-2.5 sm:py-3 text-xs sm:text-sm border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === 'completed'
                      ? 'border-brand-blue text-brand-blue font-medium'
                      : 'border-transparent text-gray-600 hover:text-brand-blue'
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
                          : 'border-transparent text-gray-600 hover:text-brand-blue'
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
                          : 'border-transparent text-gray-600 hover:text-brand-blue'
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
                      : 'border-transparent text-gray-600 hover:text-brand-blue'
                  }`}
                >
                  Archived
                </button> */}
                <button
                  onClick={() => setActiveTab('settings')}
                  className={`py-3 sm:py-4 text-xs sm:text-sm border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                    activeTab === 'settings'
                      ? 'border-brand-blue text-brand-blue font-medium'
                      : 'border-transparent text-gray-600 hover:text-brand-blue'
                  }`}
                >
                  <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  Settings
                </button>
              </div>
              {/* Grid/List View Toggle - positioned absolute right so tabs get full scroll width */}
              <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-1 border border-gray-200 rounded-lg p-1 bg-white">
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
            {activeTab === 'audit' ? (
              /* Activity Logs Tab */
              <AssessmentAuditTrail />
            ) : activeTab === 'consent' ? (
              /* Consent Logs Tab */
              <ConsentLogs defaultFeature="ASSESSMENT" />
            ) : activeTab === 'settings' ? (
              /* Settings Tab with Sub-tabs */
              <div className="space-y-4 sm:space-y-6">
                {/* Settings Sub-tabs */}
                <div className="flex gap-2 sm:gap-4 border-b border-gray-200 overflow-x-auto scrollbar-hide">
                  <button
                    onClick={() => setSettingsSubTab('proctoring')}
                    className={`pb-2.5 sm:pb-3 text-xs sm:text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 sm:gap-2 whitespace-nowrap ${
                      settingsSubTab === 'proctoring'
                        ? 'border-brand-blue text-brand-blue font-medium'
                        : 'border-transparent text-gray-500 hover:text-brand-blue'
                    }`}
                  >
                    <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">Proctoring & Security</span>
                    <span className="sm:hidden">Proctoring</span>
                  </button>
                  <button
                    onClick={() => setSettingsSubTab('topics')}
                    className={`pb-2.5 sm:pb-3 text-xs sm:text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 sm:gap-2 whitespace-nowrap ${
                      settingsSubTab === 'topics'
                        ? 'border-brand-blue text-brand-blue font-medium'
                        : 'border-transparent text-gray-500 hover:text-brand-blue'
                    }`}
                  >
                    <ClipboardList className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    Topics
                  </button>
                </div>

                {/* Assessment Topics Settings Content */}
                {settingsSubTab === 'topics' ? (
                  <div className="space-y-4 sm:space-y-6">
                    {/* Header */}
                    <div>
                      <h2 className="text-sm sm:text-lg font-semibold text-gray-900 flex items-center gap-1.5 sm:gap-2">
                        <ClipboardList className="w-4 h-4 sm:w-5 sm:h-5" />
                        Assessment Topics Settings
                      </h2>
                      <p className="text-xs sm:text-sm text-gray-600 mt-0.5 sm:mt-1">
                        Enable or disable topics for all assessments. Disabled topics will not appear in the section distribution.
                      </p>
                    </div>

                    {/* Loading State */}
                    {isLoadingTopics ? (
                      <div className="flex items-center justify-center py-12">
                        <div className="text-center">
                          <div className="w-10 h-10 border-4 border-brand-blue/20 border-t-brand-blue rounded-full animate-spin mx-auto mb-3"></div>
                          <p className="text-gray-600">Loading topic settings...</p>
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
                        <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-3 sm:p-5">
                          <div className="flex items-center justify-between gap-2 mb-1.5 sm:mb-2">
                            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                              <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
                                <Users className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-brand-blue" />
                              </div>
                              <div className="flex flex-wrap items-center gap-1 sm:gap-2 min-w-0">
                                <h4 className="text-[11px] sm:text-sm font-medium text-gray-900">HR</h4>
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
                              <span className="text-[10px] sm:text-xs text-gray-500 font-medium">
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
                          <p className="text-[10px] sm:text-sm text-gray-600 pl-9 sm:pl-[52px]">
                            Behavioral questions, cultural fit, and soft skills evaluation.
                          </p>
                        </div>

                        {/* Technical Section */}
                        <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-3 sm:p-5">
                          <div className="flex items-center justify-between gap-2 mb-1.5 sm:mb-2">
                            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                              <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-xl bg-brand-cyan/10 ring-1 ring-brand-cyan/15 flex items-center justify-center flex-shrink-0">
                                <Brain className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-brand-cyan" />
                              </div>
                              <div className="flex flex-wrap items-center gap-1 sm:gap-2 min-w-0">
                                <h4 className="text-[11px] sm:text-sm font-medium text-gray-900">Technical</h4>
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
                              <span className="text-[10px] sm:text-xs text-gray-500 font-medium">
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
                          <p className="text-[10px] sm:text-sm text-gray-600 pl-9 sm:pl-[52px]">
                            Domain knowledge, tools, regulations, and workflows.
                          </p>
                        </div>

                        {/* Coding Section */}
                        <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-3 sm:p-5">
                          <div className="flex items-center justify-between gap-2 mb-1.5 sm:mb-2">
                            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                              <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-xl bg-brand-orange/10 ring-1 ring-brand-orange/15 flex items-center justify-center flex-shrink-0">
                                <Code className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-brand-orange" />
                              </div>
                              <div className="flex flex-wrap items-center gap-1 sm:gap-2 min-w-0">
                                <h4 className="text-[11px] sm:text-sm font-medium text-gray-900">Coding</h4>
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
                              <span className="text-[10px] sm:text-xs text-gray-500 font-medium">
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
                          <p className="text-[10px] sm:text-sm text-gray-600 pl-9 sm:pl-[52px]">
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
                      <div className="w-10 h-10 border-4 border-brand-blue/20 border-t-brand-blue rounded-full animate-spin mx-auto mb-3"></div>
                      <p className="text-sm text-gray-600">Loading proctoring settings...</p>
                    </div>
                  </div>
                ) : proctoringError && !proctoringSettings ? (
                  <div className="flex flex-col items-center justify-center py-8 sm:py-12">
                    <AlertTriangle className="w-10 h-10 sm:w-12 sm:h-12 text-red-400 mb-3 sm:mb-4" />
                    <p className="text-sm text-red-600 mb-3 sm:mb-4 text-center">{proctoringError}</p>
                    <button
                      onClick={loadProctoringData}
                      className="flex items-center gap-2 px-4 py-2 bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white rounded-lg text-sm transition-all shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
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
                    <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-3 sm:p-5">
                      <div className="flex flex-col gap-3">
                        {/* Top row: icon + title + toggle */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
                              <Video className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue" />
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
                              <h4 className="text-xs sm:text-sm font-medium text-gray-900">Proctoring Mode</h4>
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
                            <span className="text-[10px] sm:text-xs text-gray-500 font-medium">
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
                        <p className="text-[10px] sm:text-sm text-gray-600">
                          {proctoringSettings.proctoring_enabled
                            ? 'Advanced monitoring is active for test integrity.'
                            : 'Standard mode — no advanced monitoring. Enable for high-stakes assessments.'
                          }
                        </p>
                        {/* Privacy Notice */}
                        {proctoringSettings.proctoring_enabled && (
                          <div className="flex items-start gap-1.5 sm:gap-2 p-2 sm:p-3 bg-brand-blue/5 rounded-lg ring-1 ring-brand-blue/15">
                            <Info className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-blue flex-shrink-0 mt-0.5" />
                            <p className="text-[10px] sm:text-xs text-gray-700">
                              <span className="font-medium">Privacy:</span> Candidates are informed before starting. Recordings stored for {proctoringSettings.recording_retention_days} days.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Individual Security Features */}
                    <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-3 sm:p-6">
                      <h3 className="text-xs sm:text-sm font-medium text-gray-900 mb-3 sm:mb-4">Security Features</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-4">
                        {[
                          { key: 'webcam_monitoring', name: 'Webcam Monitoring', description: 'Record and analyze candidate video during assessment', icon: Video },
                          { key: 'screen_recording', name: 'Screen Recording', description: 'Capture screen activity throughout the test', icon: Monitor },
                          { key: 'tab_switch_detection', name: 'Tab Switch Detection', description: 'Detect when candidates switch browser tabs', icon: Eye },
                          { key: 'ai_cheating_prevention', name: 'AI Cheating Prevention', description: 'AI-powered detection of suspicious behavior', icon: Brain },
                          { key: 'copy_paste_blocking', name: 'Copy-Paste Blocking', description: 'Prevent copying questions or pasting answers', icon: Clipboard },
                          { key: 'browser_lockdown', name: 'Browser Lockdown', description: 'Restrict access to other applications', icon: Lock },
                        ].map((feature) => {
                          const IconComponent = feature.icon;
                          const isEnabled = proctoringSettings[feature.key as keyof ProctoringSettings] as boolean;
                          return (
                            <div key={feature.key} className="flex items-center justify-between gap-2 p-2.5 sm:p-4 bg-gray-50 rounded-lg">
                              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                                <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-white flex items-center justify-center flex-shrink-0 border border-gray-200">
                                  <IconComponent className="w-3 h-3 sm:w-4 sm:h-4 text-gray-600" />
                                </div>
                                <div className="min-w-0">
                                  <div className="text-[10px] sm:text-sm font-medium text-gray-900 leading-tight">{feature.name}</div>
                                  <div className="text-[10px] sm:text-xs text-gray-500 line-clamp-1 sm:line-clamp-2 hidden sm:block">{feature.description}</div>
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
                    <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-4 sm:p-6">
                      <h3 className="text-sm font-medium text-gray-900 mb-4 tracking-tight">Masking</h3>
                      <div className="flex items-start justify-between p-4 bg-slate-50 rounded-lg">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
                            <Mail className="w-4 h-4 text-brand-blue" />
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-900">Email Masking in PDF</div>
                            <div className="text-xs text-gray-500">
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
                          <span className="text-xs text-gray-500 font-medium">
                            {proctoringSettings.email_masking_enabled ? 'ON' : 'OFF'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Threshold Settings */}
                    <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-4 sm:p-6">
                      <h3 className="text-sm font-medium text-gray-900 mb-4 tracking-tight">Threshold Settings</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
                        <div>
                          <label className="block text-xs text-gray-600 mb-2">Max Tab Switches Before Warning</label>
                          <input
                            type="number"
                            value={proctoringSettings.max_tab_switches}
                            onChange={(e) => updateProctoringSettings({ max_tab_switches: parseInt(e.target.value) || 3 })}
                            disabled={isSavingProctoring || !proctoringSettings.proctoring_enabled}
                            className="w-full px-3 py-1.5 sm:py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue disabled:bg-slate-100 disabled:cursor-not-allowed text-black"
                            min="1"
                            max="10"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] sm:text-xs text-gray-600 mb-1.5 sm:mb-2">Max Violations Before Flag</label>
                          <input
                            type="number"
                            value={proctoringSettings.max_violations_before_flag}
                            onChange={(e) => updateProctoringSettings({ max_violations_before_flag: parseInt(e.target.value) || 5 })}
                            disabled={isSavingProctoring || !proctoringSettings.proctoring_enabled}
                            className="w-full px-3 py-1.5 sm:py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue disabled:bg-slate-100 disabled:cursor-not-allowed text-black"
                            min="1"
                            max="20"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] sm:text-xs text-gray-600 mb-1.5 sm:mb-2">Recording Retention (Days)</label>
                          <input
                            type="number"
                            value={proctoringSettings.recording_retention_days}
                            onChange={(e) => updateProctoringSettings({ recording_retention_days: parseInt(e.target.value) || 90 })}
                            disabled={isSavingProctoring || !proctoringSettings.proctoring_enabled}
                            className="w-full px-3 py-1.5 sm:py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue disabled:bg-slate-100 disabled:cursor-not-allowed text-black"
                            min="7"
                            max="365"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Recent Proctoring Events */}
                    <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-3 sm:p-6">
                      <div className="flex items-center justify-between mb-3 sm:mb-4">
                        <h3 className="text-xs sm:text-sm font-medium text-gray-900">Recent Proctoring Events</h3>
                        <span className="text-[10px] sm:text-xs text-gray-500">{proctoringEventsTotal} total</span>
                      </div>
                      {isLoadingProctoringEvents ? (
                        <div className="flex items-center justify-center py-8">
                          <div className="w-6 h-6 border-2 border-brand-blue/20 border-t-brand-blue rounded-full animate-spin mr-2" />
                          <span className="text-sm text-gray-500">Loading events...</span>
                        </div>
                      ) : proctoringEvents.length === 0 ? (
                        <div className="text-center py-8">
                          <Shield className="w-12 h-12 text-brand-blue/40 mx-auto mb-3" />
                          <p className="text-sm text-gray-500">No proctoring events recorded yet</p>
                          <p className="text-xs text-gray-400 mt-1">Events will appear here when candidates take proctored assessments</p>
                        </div>
                      ) : (
                        <div className="space-y-2 sm:space-y-3">
                          {proctoringEvents.slice(0, 5).map((event) => (
                            <div key={event.id} className="flex items-center justify-between gap-2 p-2.5 sm:p-3 bg-gray-50 rounded-lg">
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
                                  <div className="text-xs sm:text-sm font-medium text-gray-900 capitalize truncate">
                                    {event.event_type.replace(/_/g, ' ')}
                                  </div>
                                  <div className="text-[10px] sm:text-xs text-gray-500 truncate">
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
                  <div className="w-10 h-10 border-4 border-brand-blue/20 border-t-brand-blue rounded-full animate-spin mx-auto mb-3"></div>
                  <p className="text-gray-600">Loading assessments...</p>
                </div>
              </div>
            ) : filteredAssessments.length === 0 ? (
              /* Empty State */
              <div className="text-center py-12">
                <div className="w-20 h-20 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-10 h-10 text-brand-blue" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2 tracking-tight">No assessments yet</h3>
                <p className="text-gray-600 mb-4">Create your first AI-powered assessment to start evaluating candidates</p>
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
                      : 'bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white shadow-md shadow-brand-blue/25 ring-1 ring-white/10'
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
                    className="p-4 sm:p-5 border border-gray-100 ring-1 ring-black/[0.02] rounded-xl hover:border-brand-blue/30 hover:shadow-md hover:shadow-brand-blue/10 transition-all bg-white cursor-pointer"
                  >
                    {/* Grid Card Header */}
                    <div className="flex items-start mb-3">
                      <div className="w-10 h-10 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-5 h-5 text-brand-blue" />
                      </div>
                    </div>

                    {/* Grid Card Title */}
                    <div className="mb-3">
                      {/* Line 1: AS-022 SQL Developer - Assessment V1 [AI] [Active] */}
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="inline-flex items-center px-2.5 py-1 bg-brand-blue text-white rounded text-xs font-semibold shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
                          {assessment.short_id}
                        </span>
                        <h3 className="text-sm font-medium text-gray-900 line-clamp-1">
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
                        <div className="text-xs text-gray-700 font-medium mb-1.5">
                          <span>{assessment.jd_short_id}</span>
                          {assessment.job && (
                            <span className="ml-2">{assessment.job.title}</span>
                          )}
                          {(assessment.job?.version || assessment.jd_version) && (
                            <span className="ml-1 text-gray-500">v{assessment.job?.version || assessment.jd_version}</span>
                          )}
                        </div>
                      )}

                      {/* Line 3: created by + Created date + Last Updated */}
                      <div className="text-xs text-gray-600 mb-1.5 line-clamp-2">
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
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span>{assessment.duration}</span>
                        <span>{assessment.candidates} Invitations</span>
                      </div>
                    </div>

                    {/* Grid Card Actions */}
                    <div className="flex items-center gap-2 pt-3 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                      {(hasPermission('canUpdateAssessments') || isTenantAdmin) && (() => {
                        // Share is blocked for Draft (must publish first) AND
                        // Archived (assessment is out of circulation, can't
                        // invite candidates to it). The disabled visuals are
                        // shared across both states.
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
                            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg transition-all text-xs ${
                              isShareBlocked
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10'
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
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 border rounded-lg transition-colors text-xs ${
                          assessment.status === 'Draft'
                            ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                            : 'border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue'
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
                          {(hasPermission('canUpdateAssessments') || isTenantAdmin) && (
                            <button
                              onClick={() => {
                                if (!canUpdateAssessment) {
                                  toast.error('You do not have permission to edit assessments');
                                  setOpenMenuId(null);
                                  return;
                                }
                                handleEditAssessment(assessment);
                                setOpenMenuId(null);
                              }}
                              disabled={!canUpdateAssessment}
                              title={!canUpdateAssessment ? 'You do not have permission to edit assessments' : ''}
                              className={`w-full px-2.5 sm:px-3 py-2 text-left text-xs sm:text-sm flex items-center gap-2 sm:gap-2.5 ${
                                !canUpdateAssessment
                                  ? 'text-gray-400 cursor-not-allowed opacity-60'
                                  : 'text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue'
                              }`}
                            >
                              <Edit2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600 flex-shrink-0" />
                              Edit
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setSelectedAssessmentForPreview(assessment);
                              setShowPreviewModal(true);
                              setOpenMenuId(null);
                            }}
                            className="w-full px-2.5 sm:px-3 py-2 text-left text-xs sm:text-sm text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue flex items-center gap-2 sm:gap-2.5 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600 flex-shrink-0" />
                            Preview
                          </button>
                          {/* Archived assessments only expose Edit / Preview / Activate —
                              Copy Link, Completed, Archive, Delete are hidden so the menu
                              reflects what the recruiter can actually do on a row that's
                              been pulled out of circulation. */}
                          {assessment.status !== 'Archived' && canCreateAssessment && (
                          <button
                            onClick={async () => {
                              if (assessment.status === 'Draft') {
                                toast.warning('Please publish the assessment before sharing');
                                setOpenMenuId(null);
                                return;
                              }
                              try {
                                // Create a generic invitation to get a shareable link
                                const invitation = await assessmentService.invite(assessment.id, {
                                  candidate_name: 'Anonymous Candidate',
                                  candidate_email: `anonymous-${Date.now()}@example.com`,
                                });
                                const shareableLink = `${window.location.origin}/assessment/take/${invitation.token}`;

                                // Copy to clipboard with fallback
                                try {
                                  await navigator.clipboard.writeText(shareableLink);
                                } catch (clipboardError) {
                                  // Fallback for when document is not focused
                                  const textArea = document.createElement('textarea');
                                  textArea.value = shareableLink;
                                  textArea.style.position = 'fixed';
                                  textArea.style.left = '-9999px';
                                  document.body.appendChild(textArea);
                                  textArea.select();
                                  document.execCommand('copy');
                                  document.body.removeChild(textArea);
                                }
                                toast.success('Shareable link copied! This link can be used by one candidate.');
                              } catch (error) {
                                console.error('Failed to generate link:', error);
                                toast.error('Failed to generate shareable link. Please try Share via Email instead.');
                              }
                              setOpenMenuId(null);
                            }}
                            disabled={assessment.status === 'Draft'}
                            className={`w-full px-2.5 sm:px-3 py-2 text-left text-xs sm:text-sm flex items-center gap-2 sm:gap-2.5 ${
                              assessment.status === 'Draft'
                                ? 'text-gray-400 cursor-not-allowed'
                                : 'text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue'
                            }`}
                          >
                            <Link2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                            Copy Link
                          </button>
                          )}
                          <div className="border-t border-gray-100 my-1"></div>
                          {/* Draft assessments hide Activate/Archive — drafts go
                              through the configure-page Publish button, and an
                              unpublished row has nothing meaningful to archive. */}
                          {canUpdateAssessment && assessment.status !== 'Active' && assessment.status !== 'Draft' && (
                            <button
                              onClick={() => handleActivateAssessment(assessment.id)}
                              className="w-full px-2.5 sm:px-3 py-2 text-left text-xs sm:text-sm text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue flex items-center gap-2 sm:gap-2.5 transition-colors"
                            >
                              <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600 flex-shrink-0" />
                              Activate
                            </button>
                          )}
                          {canUpdateAssessment && assessment.status !== 'Completed' && assessment.status !== 'Archived' && assessment.status !== 'Draft' && (
                            <button
                              onClick={() => handleCompleteAssessment(assessment.id)}
                              className="w-full px-2.5 sm:px-3 py-2 text-left text-xs sm:text-sm text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue flex items-center gap-2 sm:gap-2.5 transition-colors"
                            >
                              <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600 flex-shrink-0" />
                              Completed
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
                            <Archive className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600 flex-shrink-0" />
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
                    className="p-4 sm:p-5 border border-gray-100 ring-1 ring-black/[0.02] rounded-xl hover:border-brand-blue/30 hover:shadow-md hover:shadow-brand-blue/10 transition-all bg-white cursor-pointer"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 lg:gap-4">
                      {/* Left Side - Icon + Info */}
                      <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
                          <FileText className="w-5 h-5 text-brand-blue" />
                        </div>
                        <div className="flex-1 min-w-0">
                          {/* Line 1: AS-022 SQL Developer - Assessment V1 */}
                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <span className="inline-flex items-center px-2.5 py-1 bg-brand-blue text-white rounded text-xs font-semibold shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
                              {assessment.short_id}
                            </span>
                            <h3 className="text-sm font-medium text-gray-900">
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
                            <div className="text-xs text-gray-700 font-medium mb-1.5">
                              <span>{assessment.jd_short_id}</span>
                              {assessment.job && (
                                <span className="ml-2">{assessment.job.title}</span>
                              )}
                              {(assessment.job?.version || assessment.jd_version) && (
                                <span className="ml-1 text-gray-500">v{assessment.job?.version || assessment.jd_version}</span>
                              )}
                            </div>
                          )}

                          {/* Line 3: created by: abishekd • Created: 9 Feb 2026 at 06:46 pm Last Updated: <date> */}
                          <div className="text-xs text-gray-600 mb-1.5">
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
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            <span>{assessment.duration}</span>
                            <span>{assessment.candidates} Invitations Sent</span>
                          </div>
                        </div>
                      </div>

                      {/* Right Side - Actions + Status + Menu */}
                      <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        {/* Action Buttons */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Share via Email Button — disabled for Draft (must
                              publish first) and Archived (out of circulation). */}
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
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all text-xs whitespace-nowrap ${
                                  isShareBlocked
                                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                    : 'bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10'
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
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all text-xs whitespace-nowrap bg-brand-cyan hover:from-brand-teal hover:to-brand-cyan text-white shadow-sm shadow-brand-cyan/25 ring-1 ring-white/10"
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
                            className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg transition-colors text-xs whitespace-nowrap ${
                              assessment.status === 'Draft'
                                ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                                : 'border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue'
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
                              className="p-1.5 text-gray-500 hover:bg-slate-100 hover:text-gray-700 rounded transition-colors"
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
                                {(hasPermission('canUpdateAssessments') || isTenantAdmin) && (
                                  <button
                                    onClick={() => {
                                      if (!canUpdateAssessment) {
                                        toast.error('You do not have permission to edit assessments');
                                        setOpenMenuId(null);
                                        return;
                                      }
                                      handleEditAssessment(assessment);
                                      setOpenMenuId(null);
                                    }}
                                    disabled={!canUpdateAssessment}
                                    title={!canUpdateAssessment ? 'You do not have permission to edit assessments' : ''}
                                    className={`w-full px-2.5 sm:px-3 py-2 text-left text-xs sm:text-sm flex items-center gap-2 sm:gap-2.5 ${
                                      !canUpdateAssessment
                                        ? 'text-gray-400 cursor-not-allowed opacity-60'
                                        : 'text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue'
                                    }`}
                                  >
                                    <Edit2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600 flex-shrink-0" />
                                    Edit Assessment
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    setSelectedAssessmentForPreview(assessment);
                                    setShowPreviewModal(true);
                                    setOpenMenuId(null);
                                  }}
                                  className="w-full px-2.5 sm:px-3 py-2 text-left text-xs sm:text-sm text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue flex items-center gap-2 sm:gap-2.5 transition-colors"
                                >
                                  <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600 flex-shrink-0" />
                                  Preview
                                </button>
                                {/* Archived assessments only expose Edit / Preview / Activate —
                                    Copy Link, Duplicate, Completed, Archive, Delete are hidden
                                    so the menu reflects what the recruiter can actually do
                                    on a row that's been pulled out of circulation. */}
                                {assessment.status !== 'Archived' && canCreateAssessment && (
                                <button
                                  onClick={async () => {
                                    if (assessment.status === 'Draft') {
                                      toast.warning('Please publish the assessment before sharing');
                                      setOpenMenuId(null);
                                      return;
                                    }
                                    try {
                                      // Create a generic invitation to get a shareable link
                                      const invitation = await assessmentService.invite(assessment.id, {
                                        candidate_name: 'Anonymous Candidate',
                                        candidate_email: `anonymous-${Date.now()}@example.com`,
                                      });
                                      const shareableLink = `${window.location.origin}/assessment/take/${invitation.token}`;

                                      // Copy to clipboard with fallback
                                      try {
                                        await navigator.clipboard.writeText(shareableLink);
                                      } catch (clipboardError) {
                                        // Fallback for when document is not focused
                                        const textArea = document.createElement('textarea');
                                        textArea.value = shareableLink;
                                        textArea.style.position = 'fixed';
                                        textArea.style.left = '-9999px';
                                        document.body.appendChild(textArea);
                                        textArea.select();
                                        document.execCommand('copy');
                                        document.body.removeChild(textArea);
                                      }
                                      toast.success('Shareable link copied! This link can be used by one candidate.');
                                    } catch (error) {
                                      console.error('Failed to generate link:', error);
                                      toast.error('Failed to generate shareable link. Please try Share via Email instead.');
                                    }
                                    setOpenMenuId(null);
                                  }}
                                  disabled={assessment.status === 'Draft'}
                                  className={`w-full px-2.5 sm:px-3 py-2 text-left text-xs sm:text-sm flex items-center gap-2 sm:gap-2.5 ${
                                    assessment.status === 'Draft'
                                      ? 'text-gray-400 cursor-not-allowed'
                                      : 'text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue'
                                  }`}
                                >
                                  <Link2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                                  Copy Link
                                </button>
                                )}
                                {assessment.status !== 'Archived' && canCreateAssessment && (
                                <button
                                  onClick={async () => {
                                    try {
                                      const response = await assessmentService.clone(assessment.id);
                                      // Reload assessments to show the new clone
                                      // Reload assessments after cloning
                                      await reloadAssessments();
                                      toast.success(`Assessment duplicated: "${response.cloned_title}"`);
                                    } catch (error) {
                                      console.error('Failed to duplicate assessment:', error);
                                      toast.error('Failed to duplicate assessment. Please try again.');
                                    }
                                    setOpenMenuId(null);
                                  }}
                                  className="w-full px-2.5 sm:px-3 py-2 text-left text-xs sm:text-sm text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue flex items-center gap-2 sm:gap-2.5 transition-colors"
                                >
                                  <Copy className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600 flex-shrink-0" />
                                  Duplicate
                                </button>
                                )}
                                <div className="border-t border-gray-100 my-1"></div>
                                {/* Draft assessments hide Activate/Archive — drafts
                                    go through the configure-page Publish button,
                                    and an unpublished row has nothing meaningful
                                    to archive. */}
                                {canUpdateAssessment && assessment.status !== 'Active' && assessment.status !== 'Draft' && (
                                  <button
                                    onClick={() => handleActivateAssessment(assessment.id)}
                                    className="w-full px-2.5 sm:px-3 py-2 text-left text-xs sm:text-sm text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue flex items-center gap-2 sm:gap-2.5 transition-colors"
                                  >
                                    <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600 flex-shrink-0" />
                                    Activate
                                  </button>
                                )}
                                {canUpdateAssessment && assessment.status === 'Active' && (
                                  <button
                                    onClick={() => handleCompleteAssessment(assessment.id)}
                                    className="w-full px-2.5 sm:px-3 py-2 text-left text-xs sm:text-sm text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue flex items-center gap-2 sm:gap-2.5 transition-colors"
                                  >
                                    <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600 flex-shrink-0" />
                                    Completed
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
                                  <Archive className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600 flex-shrink-0" />
                                  Archive
                                </button>
                                )}
                                {assessment.status !== 'Archived' && (
                                  <div className="border-t border-gray-100 my-1"></div>
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

      </div>

      {/* Share Assessment Modal */}
      {showShareModal && selectedAssessmentForShare && (
        <ShareAssessmentModal
          isOpen={showShareModal}
          onClose={() => {
            setShowShareModal(false);
            setSelectedAssessmentForShare(null);
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
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl shadow-brand-blue/10 sm:border sm:border-gray-100 sm:ring-1 sm:ring-black/[0.02] w-full sm:max-w-5xl max-h-[95dvh] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="px-3 sm:px-6 py-2.5 sm:py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-shrink-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-brand-blue flex items-center justify-center shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 flex-shrink-0">
                    <Users className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm sm:text-lg font-semibold text-gray-900 truncate tracking-tight">
                      <span className="hidden sm:inline">Invite Status Tracking</span>
                      <span className="sm:hidden">Invite Status</span>
                    </h2>
                    <p className="text-[10px] sm:text-sm text-gray-500 mt-0.5 truncate">{selectedAssessmentForTracking.title}</p>
                  </div>
                </div>
              </div>
              <button
                onClick={closeTrackInvitesModal}
                className="p-2 text-gray-400 hover:text-brand-blue hover:bg-brand-blue/5 rounded-lg transition-colors"
               aria-label="Close">
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>

            {/* Stats Cards */}
            <div className="px-2.5 sm:px-6 py-2.5 sm:py-4 bg-slate-50 border-b border-gray-100 flex-shrink-0">
              <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-6 gap-1 sm:gap-4">
                <div className="bg-white rounded-md sm:rounded-lg p-1.5 sm:p-3 border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 text-center sm:text-left">
                  <div className="flex items-center justify-center sm:justify-start gap-1 sm:gap-2 text-brand-blue text-[9px] sm:text-xs mb-0.5 sm:mb-1">
                    <Users className="w-3.5 h-3.5 hidden sm:block" />
                    <span>Total Invited</span>
                  </div>
                  <p className="text-sm sm:text-2xl font-bold text-brand-blue">{invitationStats.total}</p>
                </div>
                <div className="bg-white rounded-md sm:rounded-lg p-1.5 sm:p-3 border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 text-center sm:text-left">
                  <div className="flex items-center justify-center sm:justify-start gap-1 sm:gap-2 text-brand-orange text-[9px] sm:text-xs mb-0.5 sm:mb-1">
                    <Clock className="w-3.5 h-3.5 hidden sm:block" />
                    <span>Invite Expired</span>
                  </div>
                  <p className="text-sm sm:text-2xl font-bold text-brand-orange-deep">{invitationStats.expired}</p>
                </div>
                <div className="bg-white rounded-md sm:rounded-lg p-1.5 sm:p-3 border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 text-center sm:text-left">
                  <div className="flex items-center justify-center sm:justify-start gap-1 sm:gap-2 text-red-600 text-[9px] sm:text-xs mb-0.5 sm:mb-1">
                    <X className="w-3.5 h-3.5 hidden sm:block" />
                    <span>Invite Failed</span>
                  </div>
                  <p className="text-sm sm:text-2xl font-bold text-red-600">{invitationStats.failed}</p>
                </div>
                <div className="bg-white rounded-md sm:rounded-lg p-1.5 sm:p-3 border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 text-center sm:text-left">
                  <div className="flex items-center justify-center sm:justify-start gap-1 sm:gap-2 text-brand-cyan text-[9px] sm:text-xs mb-0.5 sm:mb-1">
                    <Play className="w-3.5 h-3.5 hidden sm:block" />
                    <span>In Progress</span>
                  </div>
                  <p className="text-sm sm:text-2xl font-bold text-brand-cyan">{invitationStats.started}</p>
                </div>
                <div className="bg-white rounded-md sm:rounded-lg p-1.5 sm:p-3 border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 text-center sm:text-left">
                  <div className="flex items-center justify-center sm:justify-start gap-1 sm:gap-2 text-green-700 text-[9px] sm:text-xs mb-0.5 sm:mb-1">
                    <CheckCircle className="w-3.5 h-3.5 hidden sm:block" />
                    <span>Completed</span>
                  </div>
                  <p className="text-sm sm:text-2xl font-bold text-green-700">{invitationStats.completed}</p>
                </div>
                <div className="bg-white rounded-md sm:rounded-lg p-1.5 sm:p-3 border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 text-center sm:text-left">
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

            {/* Invitations Table / Cards */}
            <div className="px-2.5 sm:px-6 py-2.5 sm:py-4 overflow-auto flex-1 min-h-0">
              {isLoadingInvitations ? (
                <div className="flex items-center justify-center py-8 sm:py-12">
                  <div className="animate-spin w-6 h-6 sm:w-8 sm:h-8 border-4 border-brand-blue/20 border-t-brand-blue rounded-full"></div>
                </div>
              ) : trackingInvitations.length === 0 ? (
                <div className="text-center py-8 sm:py-12 text-gray-500">
                  <Users className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 text-brand-blue/40" />
                  <p className="text-xs sm:text-sm">No invitations found for this assessment.</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
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
                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tech Score</th>
                      )}
                      {selectedAssessmentForTracking?.coding_enabled && (
                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Coding Score</th>
                      )}
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {trackingInvitations.map((invitation: any) => {
                      const getStatusBadge = (inv: any) => {
                        const s = inv.status;
                        if (s === 'completed' || inv.completed_at) {
                          const autoCompleted = inv.termination_code === 'TENANT_SESSION_TIMEOUT';
                          return (
                            <span
                              className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs flex items-center gap-1"
                              title={autoCompleted ? 'Auto-submitted when the assessment duration elapsed' : undefined}
                            >
                              <CheckCircle className="w-3 h-3" />
                              Completed
                              {autoCompleted && <span className="text-green-600/80">(Auto)</span>}
                            </span>
                          );
                        }
                        if (s === 'failed') {
                          return <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs flex items-center gap-1"><X className="w-3 h-3" /> Invite Failed</span>;
                        }
                        if (s === 'bounced' || inv.bounced_at) {
                          return <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Bounced</span>;
                        }
                        if (s === 'expired') {
                          return <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs flex items-center gap-1"><Clock className="w-3 h-3" /> Expired</span>;
                        }
                        if (s === 'abandoned') {
                          return <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs flex items-center gap-1"><X className="w-3 h-3" /> Abandoned</span>;
                        }
                        if (s === 'started' || inv.started_at) {
                          return <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs flex items-center gap-1"><Play className="w-3 h-3" /> Started</span>;
                        }
                        if (s === 'opened' || inv.opened_at) {
                          return <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs flex items-center gap-1"><Eye className="w-3 h-3" /> Link Opened</span>;
                        }
                        if (s === 'sent' || inv.sent_at) {
                          return <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs flex items-center gap-1"><Mail className="w-3 h-3" /> Invite Sent</span>;
                        }
                        return <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs flex items-center gap-1"><Clock className="w-3 h-3" /> Pending</span>;
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
                          <td className="py-3 px-4">
                            <span className="text-xs font-mono font-medium text-brand-blue bg-brand-blue/5 px-2 py-1 rounded ring-1 ring-brand-blue/20">
                              {invitation.candidate_display_id || '-'}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/20 flex items-center justify-center text-brand-blue font-medium text-sm">
                                {initials}
                              </div>
                              <div>
                                <p className="font-medium text-gray-900 text-sm">{invitation.candidate_name}</p>
                                <p className="text-xs text-gray-500">{invitation.candidate_email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {getStatusBadge(invitation)}
                                {isInvExpired(invitation) && (
                                  <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs flex items-center gap-1">
                                    <Clock className="w-3 h-3" /> Expired
                                  </span>
                                )}
                              </div>
                              {invitation.status === 'failed' && (
                                <p className="text-xs text-red-500 mt-1">Incorrect Email</p>
                              )}
                            </div>
                          </td>
                              <td className="py-3 px-3 lg:px-4 text-xs text-gray-500 hidden md:table-cell">
                                <div className="space-y-1">
                                  {invitation.sent_at && (
                                    <div className="flex items-center gap-2">
                                      <Mail className="w-3 h-3 text-gray-500 flex-shrink-0" />
                                      <span>Sent: {formatIST(invitation.sent_at)}</span>
                                </div>
                              )}
                              {invitation.bounced_at && (
                                <div className="flex items-center gap-2">
                                  <RefreshCw className="w-3 h-3 text-red-500" />
                                  <span className="text-red-600">Bounced: {formatIST(invitation.bounced_at)}</span>
                                </div>
                              )}
                              {invitation.started_at && (
                                <div className="flex items-center gap-2">
                                  <Play className="w-3 h-3 text-gray-500" />
                                  <span>Started: {formatIST(invitation.started_at)}</span>
                                </div>
                              )}
                              {invitation.completed_at && (
                                <div className="flex items-center gap-2">
                                  <CheckCircle className="w-3 h-3 text-gray-500" />
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
                                    <Clock className="w-3 h-3 text-amber-500" />
                                    <span className="text-amber-600">Expired at: {formatIST(invitation.expires_at)}</span>
                                  </div>
                                );
                              })()}
                              {!invitation.sent_at && !invitation.started_at && (
                                <div className="flex items-center gap-2">
                                  <Clock className="w-3 h-3 text-gray-400" />
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
                              <td className="py-3 px-4 text-sm">
                                {techReady ? (
                                  <div className="flex flex-col items-start gap-0.5">
                                    <span className={`font-medium ${invitation.technical_score >= 70 ? 'text-green-600' : 'text-red-600'}`}>
                                      {Math.round(invitation.technical_score)}%
                                    </span>
                                    <span className={`text-[10px] font-medium ${invitation.technical_score >= 70 ? 'text-green-600' : 'text-red-600'}`}>
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
                              <td className="py-3 px-4 text-sm">
                                {codingReady ? (
                                  <div className="flex flex-col items-start gap-0.5">
                                    <span className={`font-medium ${invitation.coding_score >= 70 ? 'text-green-600' : 'text-red-600'}`}>
                                      {Math.round(invitation.coding_score)}%
                                    </span>
                                    <span className={`text-[10px] font-medium ${invitation.coding_score >= 70 ? 'text-green-600' : 'text-red-600'}`}>
                                      {invitation.coding_score >= 70 ? 'Pass' : 'Fail'}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-gray-400">—</span>
                                )}
                              </td>
                            );
                          })()}
                          <td className="py-3 px-4">
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
                                    className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue w-full"
                                    autoFocus
                                  />
                                  <div className="flex gap-1">
                                    <button
                                      onClick={() => handleUpdateEmail(invitation)}
                                      disabled={!isValidInviteEmail(newEmailValue) || isSendingChangeEmail}
                                      className="flex items-center gap-1 px-2 py-1 text-xs bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-brand-blue/25 ring-1 ring-white/10"
                                    >
                                      <Send className="w-3 h-3" />
                                      {isSendingChangeEmail ? 'Sending…' : 'Send'}
                                    </button>
                                    <button
                                      onClick={() => { setEditingEmailId(null); setNewEmailValue(''); }}
                                      className="px-2 py-1 text-xs text-gray-600 hover:bg-slate-100 rounded transition-colors"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  onClick={() => { setEditingEmailId(invitation.id); setNewEmailValue(invitation.candidate_email); }}
                                  className="flex items-center gap-1 px-3 py-1.5 text-xs border border-brand-blue/30 text-brand-blue bg-white hover:bg-brand-blue/5 rounded-lg transition-colors whitespace-nowrap"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                  Change Email
                                </button>
                              )
                            ) : (['sent', 'opened', 'failed'].includes(invitation.status) && !invitation.started_at && !invitation.completed_at) ? (
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
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-slate-50">
              <p className="text-sm text-gray-500">
                Showing <strong>{trackingStartIndex}</strong> to <strong>{trackingEndIndex}</strong> of <strong>{trackingTotalItems}</strong> invites
              </p>
              <div className="flex items-center gap-2">
                {trackingPaginationVisible && (
                  <>
                    <button
                      onClick={() => setTrackingCurrentPage(1)}
                      disabled={trackingCurrentPage === 1}
                      className="px-3 py-1.5 text-sm border border-gray-200 bg-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors"
                    >
                      First
                    </button>
                    <button
                      onClick={() => setTrackingCurrentPage(trackingCurrentPage - 1)}
                      disabled={trackingCurrentPage === 1}
                      className="px-3 py-1.5 text-sm border border-gray-200 bg-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors"
                    >
                      Prev
                    </button>
                    <span className="px-2 text-sm text-gray-600">
                      Page {trackingCurrentPage} of {trackingTotalPages}
                    </span>
                    <button
                      onClick={() => setTrackingCurrentPage(trackingCurrentPage + 1)}
                      disabled={trackingCurrentPage === trackingTotalPages}
                      className="px-3 py-1.5 text-sm border border-gray-200 bg-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors"
                    >
                      Next
                    </button>
                    <button
                      onClick={() => setTrackingCurrentPage(trackingTotalPages)}
                      disabled={trackingCurrentPage === trackingTotalPages}
                      className="px-3 py-1.5 text-sm border border-gray-200 bg-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors"
                    >
                      Last
                    </button>
                  </>
                )}
                <button
                  onClick={closeTrackInvitesModal}
                  className="px-4 py-2 text-sm bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white rounded-lg transition-all shadow-sm shadow-brand-blue/25 ring-1 ring-white/10"
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
    </div>
  );
}
