'use client';

import { Plus, Clock, Users, CheckCircle, FileText, FileCheck, MoreVertical, Play, Sparkles, Eye, Edit2, BarChart, Mail, Trash2, Copy, Archive, Download, Link2, Share2, PauseCircle, LayoutGrid, List, Monitor, Brain, Code, ClipboardList, Globe, Pencil, Zap, Shield, Video, X, Info, CheckCircle2, MonitorOff, Clipboard, Lock, TrendingUp, Activity } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import AssessmentCreation from './AssessmentCreation';
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
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { stripVersionFromTitle } from '@/lib/utils/assessmentUtils';
import VersionBadge from './VersionBadge';
import { useGlobalDialog } from '@/components/providers/GlobalDialogProvider';
import { toast } from 'sonner';

// Helper function to format date/time in UTC timezone
const formatDateTimeIST = (dateStr: string | null | undefined, options?: { includeTime?: boolean }) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const dateOptions: Intl.DateTimeFormatOptions = {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  };
  if (options?.includeTime) {
    dateOptions.hour = '2-digit';
    dateOptions.minute = '2-digit';
    dateOptions.hour12 = true;
  }
  return date.toLocaleString('en-US', dateOptions);
};

const formatTimeIST = (dateStr: string | null | undefined) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', {
    timeZone: 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const formatDateOnlyIST = (dateStr: string | null | undefined) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

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
  const { user, isTenantAdmin } = useAuth();
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
    sent: 0,
    started: 0,
    completed: 0,
    failed: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [apiAssessments, setApiAssessments] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [availableUnits, setAvailableUnits] = useState<number | null>(null);
  const [totalUnits, setTotalUnits] = useState<number>(10); // Total subscription limit
  const [isUnlimited, setIsUnlimited] = useState<boolean>(false); // Track if quota is unlimited
  const [quotaPercentage, setQuotaPercentage] = useState<number>(0); // Percentage of quota used

  // Proctoring settings from API
  const [proctoringSettings, setProctoringSettings] = useState<ProctoringSettings | null>(null);
  const [isLoadingProctoring, setIsLoadingProctoring] = useState(false);
  const [isSavingProctoring, setIsSavingProctoring] = useState(false);
  const [proctoringError, setProctoringError] = useState<string | null>(null);
  const [proctoringEvents, setProctoringEvents] = useState<ProctoringEvent[]>([]);
  const [proctoringEventsTotal, setProctoringEventsTotal] = useState(0);
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
      setIsLoading(true);
      setIsLoadingStats(true);

      // Run all API calls in parallel for faster loading
      const [assessmentsResult, statsResult, quotaResult, topicsResult] = await Promise.allSettled([
        assessmentService.list({ page_size: 100 }),
        assessmentService.getStats(),
        api.get('/usage/quota-status'),
        api.get('/assessments/settings/topics'),
      ]);

      // Process assessments
      if (assessmentsResult.status === 'fulfilled' && assessmentsResult.value?.items?.length > 0) {
        const mapped = assessmentsResult.value.items.map((a: any, index: number) => {
          // Normalize status to lowercase for consistent comparison
          const rawStatus = (a.status || 'draft').toLowerCase();
          // Use short_id from backend (persistent) or generate fallback
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
          created_by_name: a.created_by_name || 'System',
          version: a.version || 1,
          jd_id: a.jd_id,
          jd_short_id: a.jd_short_id,
          job: { title: a.jd_title || 'General Assessment', department: 'Engineering' },
          // Section configuration for detail view
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
          // Analytics data
          average_time_seconds: a.average_time_seconds,
          hr_score: a.hr_score,
          technical_score: a.technical_score,
          coding_score: a.coding_score,
        };
        });
        setApiAssessments(mapped);
        console.log('[TalentFlow] Loaded', mapped.length, 'assessments from API');
      } else if (assessmentsResult.status === 'rejected') {
        console.log('[TalentFlow] Failed to load assessments:', assessmentsResult.reason);
      }

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
          const subLimit = quotas.AS.subscription?.limit;
          const addonRemaining = quotas.AS.addon?.remaining || 0;
          const used = quotas.AS.subscription?.used || 0;

          // Check if unlimited
          const unlimited = subLimit === -1 || subLimit === 'unlimited';
          setIsUnlimited(unlimited);

          if (unlimited) {
            setTotalUnits(-1);
            setAvailableUnits(-1);
            setQuotaPercentage(0);
          } else if (typeof subLimit === 'number' && subLimit > 0) {
            // Valid quota limit from API
            const totalLimit = subLimit + addonRemaining;
            setTotalUnits(totalLimit);

            const remaining = quotas.AS.total_remaining ?? (totalLimit - used);
            setAvailableUnits(remaining);

            const percentage = totalLimit > 0 ? (used / totalLimit) * 100 : 0;
            setQuotaPercentage(percentage);
          } else if (isActivePlan) {
            // Active plan but limit is 0/null — use fallback
            const totalLimit = 10 + addonRemaining;
            setTotalUnits(totalLimit);
            const remaining = quotas.AS.total_remaining ?? (totalLimit - used);
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

      setIsLoading(false);
      setIsLoadingStats(false);
    };

    loadAllData();
  }, []);

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

  // Load proctoring settings and events from API
  const loadProctoringData = async () => {
    setIsLoadingProctoring(true);
    setProctoringError(null);

    try {
      const [settingsResult, eventsResult] = await Promise.allSettled([
        proctoringService.getSettings(),
        proctoringService.getEvents({ page_size: 10 }),
      ]);

      if (settingsResult.status === 'fulfilled') {
        setProctoringSettings(settingsResult.value);
      } else {
        console.error('Failed to load proctoring settings:', settingsResult.reason);
        setProctoringError('Failed to load proctoring settings');
      }

      if (eventsResult.status === 'fulfilled') {
        setProctoringEvents(eventsResult.value.items);
        setProctoringEventsTotal(eventsResult.value.total);
        setFlaggedCount(eventsResult.value.flagged_attempts);
      }
    } catch (error) {
      console.error('Failed to load proctoring data:', error);
      setProctoringError('Failed to load proctoring data');
    } finally {
      setIsLoadingProctoring(false);
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
        const subLimit = quotas.AS.subscription?.limit;
        const addonRemaining = quotas.AS.addon?.remaining || 0;
        const used = quotas.AS.subscription?.used || 0;

        const unlimited = subLimit === -1 || subLimit === 'unlimited';
        setIsUnlimited(unlimited);

        if (unlimited) {
          setTotalUnits(-1);
          setAvailableUnits(-1);
          setQuotaPercentage(0);
        } else if (typeof subLimit === 'number' && subLimit > 0) {
          const totalLimit = subLimit + addonRemaining;
          setTotalUnits(totalLimit);
          const remaining = quotas.AS.total_remaining ?? (totalLimit - used);
          setAvailableUnits(remaining);
          const percentage = totalLimit > 0 ? (used / totalLimit) * 100 : 0;
          setQuotaPercentage(percentage);
        } else if (isActivePlan) {
          const totalLimit = 10 + addonRemaining;
          setTotalUnits(totalLimit);
          const remaining = quotas.AS.total_remaining ?? (totalLimit - used);
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
    setIsLoading(true);
    try {
      const response = await assessmentService.list({ page_size: 100 });
      if (response?.items?.length >= 0) {
        const mapped = response.items.map((a: any) => {
          // Normalize status to lowercase for consistent comparison
          const rawStatus = (a.status || 'draft').toLowerCase();
          return {
          id: a.id,
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
          job: { title: a.jd_title || 'General Assessment', department: 'Engineering' },
          // Section configuration for detail view
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
          // Analytics data
          average_time_seconds: a.average_time_seconds,
          hr_score: a.hr_score,
          technical_score: a.technical_score,
          coding_score: a.coding_score,
        };
        });
        setApiAssessments(mapped);
      } else {
        setApiAssessments([]);
      }
      // Also reload stats and quota
      await Promise.all([reloadStats(), reloadQuota()]);
    } catch (error) {
      console.log('[TalentFlow] Failed to reload assessments:', error);
    } finally {
      setIsLoading(false);
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
    setIsLoadingInvitations(true);

    try {
      const response = await assessmentService.listInvitations(assessment.id, { page_size: 100 });
      const invitations = response.items || [];
      setTrackingInvitations(invitations);

      // Calculate stats
      const stats = {
        total: invitations.length,
        sent: invitations.filter((inv: any) => inv.status === 'sent' || inv.status === 'pending').length,
        started: invitations.filter((inv: any) => inv.status === 'in_progress' || inv.started_at).length,
        completed: invitations.filter((inv: any) => inv.status === 'completed').length,
        failed: invitations.filter((inv: any) => inv.status === 'expired' || inv.status === 'failed').length,
      };
      setInvitationStats(stats);
    } catch (error) {
      console.error('Failed to load invitations:', error);
      setTrackingInvitations([]);
    } finally {
      setIsLoadingInvitations(false);
    }
  };

  // Resend invitation
  const handleResendInvitation = async (invitation: any) => {
    try {
      // Re-invite the candidate
      await assessmentService.invite(selectedAssessmentForTracking.id, {
        candidate_name: invitation.candidate_name,
        candidate_email: invitation.candidate_email,
      });
      toast.success('Invitation resent successfully!');
      // Reload invitations
      handleTrackInvites(selectedAssessmentForTracking);
    } catch (error) {
      console.error('Failed to resend invitation:', error);
      toast.error('Failed to resend invitation. Please try again.');
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
            // Keep details view open, modal will overlay on top
            handleEditAssessment(selectedAssessmentForDetails);
          }}
          onPreview={() => {
            // Keep details view open, modal will overlay on top
            setSelectedAssessmentForPreview(selectedAssessmentForDetails);
            setShowPreviewModal(true);
          }}
          onShare={() => {
            // Keep details view open, modal will overlay on top
            setSelectedAssessmentForShare(selectedAssessmentForDetails);
            setShowShareModal(true);
          }}
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
              const freshAssessments = await assessmentService.list({ page_size: 100 });
              const updated = freshAssessments.items.find((a: any) => a.id === selectedAssessmentForDetails.id);
              if (updated) {
                const rawStatus = (updated.status || 'draft').toLowerCase();
                setSelectedAssessmentForDetails({
                  ...updated,
                  status: rawStatus === 'published' ? 'Active' : rawStatus === 'closed' ? 'Completed' : rawStatus === 'archived' ? 'Archived' : 'Draft',
                });
              }
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

  return (
    <div className="flex-1 p-8 overflow-y-auto">
      <div className="w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-gray-900 mb-2">Assessment Management</h1>
            <p className="text-sm text-gray-600">
              Create and manage skill assessments for candidates
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Assessment Quota Badge with color coding - use stats.units_consumed for consistency */}
            {totalUnits > 0 && (
              <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 shadow-sm ${
                isUnlimited
                  ? 'bg-green-50 border-green-300'
                  : (totalUnits - stats.units_consumed) <= 0
                  ? 'bg-red-50 border-red-300'
                  : (totalUnits - stats.units_consumed) <= 2
                  ? 'bg-orange-50 border-orange-300'
                  : 'bg-gray-50 border-gray-200'
              }`}>
                <Zap className={`w-4 h-4 ${
                  isUnlimited
                    ? 'text-green-600'
                    : (totalUnits - stats.units_consumed) <= 0
                    ? 'text-red-600'
                    : (totalUnits - stats.units_consumed) <= 2
                    ? 'text-orange-600'
                    : 'text-gray-600'
                }`} />
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500 font-medium">Assessment Quota</span>
                  <div className="flex items-center gap-1">
                    {isUnlimited ? (
                      <span className="text-sm font-bold text-green-700">Unlimited</span>
                    ) : availableUnits !== null ? (
                      <>
                        {/* Use availableUnits from API (source of truth from Control Plane) */}
                        <span className={`text-sm font-bold ${
                          availableUnits === 0
                            ? 'text-red-700'
                            : availableUnits <= 2
                            ? 'text-orange-700'
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
                className="flex items-center gap-2 border border-gray-800 text-gray-800 px-6 py-2.5 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
              >
                <Eye className="w-5 h-5" />
                Preview Candidate View
              </button>
            )}
            {(user?.permissions?.canCreateAssessments || isTenantAdmin) && (
              <button
                onClick={handleOpenCreation}
                disabled={!isUnlimited && totalUnits > 0 && (totalUnits - stats.units_consumed) <= 0}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-lg transition-colors shadow-sm ${
                  !isUnlimited && totalUnits > 0 && (totalUnits - stats.units_consumed) <= 0
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-gray-800 text-white hover:bg-gray-900'
                }`}
              >
                <Sparkles className="w-5 h-5" />
                Create Assessment
              </button>
            )}
          </div>
        </div>

        {/* Low Quota Warning Banner */}
        {!isUnlimited && availableUnits !== null && availableUnits > 0 && availableUnits <= 3 && (
          <div className="mb-6 bg-orange-50 border-2 border-orange-300 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-200 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-orange-700" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-orange-900 mb-1">Low Assessment Quota</h3>
                <p className="text-sm text-orange-800">
                  You have only <span className="font-bold">{availableUnits}</span> assessment unit{availableUnits !== 1 ? 's' : ''} remaining out of {totalUnits}.
                  {' '}Consider purchasing add-on credits to avoid interruptions.
                </p>
              </div>
              <button
                onClick={() => window.location.href = '/subscription/usage-quotas'}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 transition-colors"
              >
                Add Credits
              </button>
            </div>
          </div>
        )}

        {/* Quota Exhausted Banner — only show when units were actually consumed */}
        {!isUnlimited && availableUnits !== null && availableUnits <= 0 && stats.units_consumed > 0 && (
          <div className="mb-6 bg-red-50 border-2 border-red-300 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-200 flex items-center justify-center flex-shrink-0">
                <Lock className="w-5 h-5 text-red-700" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-red-900 mb-1">Assessment Quota Exhausted</h3>
                <p className="text-sm text-red-800">
                  You have used all {totalUnits} assessment units in your current plan. Purchase add-on credits or upgrade your plan to create more assessments.
                </p>
              </div>
              <button
                onClick={() => window.location.href = '/subscription/usage-quotas'}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Credits
              </button>
            </div>
          </div>
        )}

        {/* AI-Powered Assessments Banner */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0">
              <Zap className="w-5 h-5 text-gray-700" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-1">AI-Powered Assessments</h3>
              <p className="text-sm text-gray-600">
                Create customized skill assessments linked to job descriptions. AI automatically generates relevant questions based on job requirements. Track candidate performance, completion rates, and pass/fail statistics.
              </p>
            </div>
          </div>
        </div>

        {/* Stats Cards - Two Rows */}
        <div className="space-y-4 mb-6">
          {/* Row 1: Historical Metrics (Total Created, Total Deleted, Units Used) - HIDDEN */}
          {/* <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-lg bg-indigo-100 flex items-center justify-center">
                  <Plus className="w-3.5 h-3.5 text-indigo-600" />
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
                <div className="w-6 h-6 rounded-lg bg-yellow-100 flex items-center justify-center">
                  <Zap className="w-3.5 h-3.5 text-yellow-600" />
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
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-lg bg-gray-100 flex items-center justify-center">
                  <FileText className="w-3.5 h-3.5 text-gray-700" />
                </div>
                <span className="text-xs text-gray-500">Total Assessments</span>
              </div>
              <div className="text-xl font-semibold text-gray-900">
                {isLoadingStats ? '...' : stats.total_assessments.toLocaleString()}
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-lg bg-green-100 flex items-center justify-center">
                  <Play className="w-3.5 h-3.5 text-green-600" />
                </div>
                <span className="text-xs text-gray-500">Active</span>
              </div>
              <div className="text-xl font-semibold text-gray-900">
                {isLoadingStats ? '...' : stats.active_assessments.toLocaleString()}
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Users className="w-3.5 h-3.5 text-blue-600" />
                </div>
                <span className="text-xs text-gray-500">Candidates Assessed</span>
              </div>
              <div className="text-xl font-semibold text-gray-900">
                {isLoadingStats ? '...' : stats.total_candidates_completed.toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="border-b border-gray-200 px-6">
            <div className="flex items-center justify-between">
              <div className="flex gap-6">
                <button
                  onClick={() => setActiveTab('all')}
                  className={`py-4 text-sm border-b-2 transition-colors ${
                    activeTab === 'all'
                      ? 'border-gray-800 text-gray-800'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  All Assessments
                </button>
                <button
                  onClick={() => setActiveTab('active')}
                  className={`py-4 text-sm border-b-2 transition-colors ${
                    activeTab === 'active'
                      ? 'border-gray-800 text-gray-800'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Active
                </button>
                <button
                  onClick={() => setActiveTab('draft')}
                  className={`py-4 text-sm border-b-2 transition-colors ${
                    activeTab === 'draft'
                      ? 'border-gray-800 text-gray-800'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Draft
                </button>
                <button
                  onClick={() => setActiveTab('completed')}
                  className={`py-4 text-sm border-b-2 transition-colors ${
                    activeTab === 'completed'
                      ? 'border-gray-800 text-gray-800'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Completed
                </button>
                {isTenantAdmin && (
                  <>
                    <button
                      onClick={() => setActiveTab('audit')}
                      className={`py-4 text-sm border-b-2 transition-colors flex items-center gap-1.5 ${
                        activeTab === 'audit'
                          ? 'border-gray-800 text-gray-800'
                          : 'border-transparent text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      <Activity className="w-4 h-4" />
                      Activity Logs
                    </button>
                    <button
                      onClick={() => setActiveTab('consent')}
                      className={`py-4 text-sm border-b-2 transition-colors flex items-center gap-1.5 ${
                        activeTab === 'consent'
                          ? 'border-gray-800 text-gray-800'
                          : 'border-transparent text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      <FileCheck className="w-4 h-4" />
                      Consent Logs
                    </button>
                  </>
                )}
                <button
                  onClick={() => setActiveTab('archived')}
                  className={`py-4 text-sm border-b-2 transition-colors ${
                    activeTab === 'archived'
                      ? 'border-gray-800 text-gray-800'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Archived
                </button>
                <button
                  onClick={() => setActiveTab('settings')}
                  className={`py-4 text-sm border-b-2 transition-colors flex items-center gap-1.5 ${
                    activeTab === 'settings'
                      ? 'border-gray-800 text-gray-800'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Shield className="w-4 h-4" />
                  Settings
                </button>
              </div>
              {/* Grid/List View Toggle */}
              <div className="flex items-center gap-1 border border-gray-200 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded ${
                    viewMode === 'grid'
                      ? 'bg-gray-100 text-gray-800'
                      : 'text-gray-400 hover:text-gray-600'
                  }`}
                  title="Grid View"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded ${
                    viewMode === 'list'
                      ? 'bg-gray-100 text-gray-800'
                      : 'text-gray-400 hover:text-gray-600'
                  }`}
                  title="List View"
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Assessment List */}
          <div className="p-6">
            {activeTab === 'audit' ? (
              /* Activity Logs Tab */
              <AssessmentAuditTrail />
            ) : activeTab === 'consent' ? (
              /* Consent Logs Tab */
              <ConsentLogs />
            ) : activeTab === 'settings' ? (
              /* Settings Tab with Sub-tabs */
              <div className="space-y-6">
                {/* Settings Sub-tabs */}
                <div className="flex gap-4 border-b border-gray-200">
                  <button
                    onClick={() => setSettingsSubTab('proctoring')}
                    className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                      settingsSubTab === 'proctoring'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Shield className="w-4 h-4" />
                    Proctoring & Security
                  </button>
                  <button
                    onClick={() => setSettingsSubTab('topics')}
                    className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                      settingsSubTab === 'topics'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <ClipboardList className="w-4 h-4" />
                    Assessment Topics
                  </button>
                </div>

                {/* Assessment Topics Settings Content */}
                {settingsSubTab === 'topics' ? (
                  <div className="space-y-6">
                    {/* Header */}
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <ClipboardList className="w-5 h-5" />
                        Assessment Topics Settings
                      </h2>
                      <p className="text-sm text-gray-600 mt-1">
                        Enable or disable topics for all assessments. Disabled topics will not appear in the section distribution during assessment configuration.
                      </p>
                    </div>

                    {/* Loading State */}
                    {isLoadingTopics ? (
                      <div className="flex items-center justify-center py-12">
                        <div className="text-center">
                          <div className="w-10 h-10 border-4 border-gray-300 border-t-gray-800 rounded-full animate-spin mx-auto mb-3"></div>
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
                        <div className="bg-gradient-to-r from-blue-600 to-cyan-500 rounded-lg p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                                <ClipboardList className="w-5 h-5 text-white" />
                              </div>
                              <div>
                                <h3 className="text-sm font-medium text-white">Topic Availability</h3>
                                <p className="text-xs text-white/80">
                                  Control which topics are available during assessment creation
                                </p>
                              </div>
                            </div>
                            {isSavingTopics && (
                              <span className="text-xs text-white/80 flex items-center gap-1">
                                <RefreshCw className="w-3 h-3 animate-spin" />
                                Saving...
                              </span>
                            )}
                          </div>
                        </div>

                        {/* HR Section */}
                        <div className="bg-white border border-gray-200 rounded-lg p-5">
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-4">
                              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                                <Users className="w-5 h-5 text-purple-600" />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <h4 className="text-sm font-medium text-gray-900">HR Section</h4>
                                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                    topicSettings.hr_enabled
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-gray-200 text-gray-600'
                                  }`}>
                                    {topicSettings.hr_enabled ? 'Enabled' : 'Disabled'}
                                  </span>
                                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">
                                    {topicSettings.hr_scoring_type === 'informational' ? 'Informational Only' : 'Scored (0-10)'}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-600">
                                  HR topics are available for assessments. Includes behavioral questions, cultural fit, and soft skills evaluation.
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-col items-center gap-1">
                              <button
                                onClick={() => updateTopicSettings({ hr_enabled: !topicSettings.hr_enabled })}
                                disabled={isSavingTopics}
                                className={`relative w-14 h-7 rounded-full transition-colors ${
                                  topicSettings.hr_enabled
                                    ? 'bg-purple-500'
                                    : 'bg-gray-300'
                                } ${isSavingTopics ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                <div className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${
                                  topicSettings.hr_enabled
                                    ? 'translate-x-8'
                                    : 'translate-x-1'
                                }`}>
                                  {topicSettings.hr_enabled ? (
                                    <CheckCircle2 className="w-5 h-5 text-purple-500" />
                                  ) : (
                                    <X className="w-5 h-5 text-gray-400" />
                                  )}
                                </div>
                              </button>
                              <span className="text-xs text-gray-500 font-medium">
                                {topicSettings.hr_enabled ? 'ON' : 'OFF'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Technical Section */}
                        <div className="bg-white border border-gray-200 rounded-lg p-5">
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-4">
                              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                                <Brain className="w-5 h-5 text-green-600" />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <h4 className="text-sm font-medium text-gray-900">Technical Section</h4>
                                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                    topicSettings.technical_enabled
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-gray-200 text-gray-600'
                                  }`}>
                                    {topicSettings.technical_enabled ? 'Enabled' : 'Disabled'}
                                  </span>
                                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                                    {topicSettings.technical_scoring_type === 'informational' ? 'Informational Only' : 'Scored (0-10)'}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-600">
                                  Technical topics are available for assessments. Includes domain knowledge, tools, regulations, and technical workflows.
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-col items-center gap-1">
                              <button
                                onClick={() => updateTopicSettings({ technical_enabled: !topicSettings.technical_enabled })}
                                disabled={isSavingTopics}
                                className={`relative w-14 h-7 rounded-full transition-colors ${
                                  topicSettings.technical_enabled
                                    ? 'bg-green-500'
                                    : 'bg-gray-300'
                                } ${isSavingTopics ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                <div className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${
                                  topicSettings.technical_enabled
                                    ? 'translate-x-8'
                                    : 'translate-x-1'
                                }`}>
                                  {topicSettings.technical_enabled ? (
                                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                                  ) : (
                                    <X className="w-5 h-5 text-gray-400" />
                                  )}
                                </div>
                              </button>
                              <span className="text-xs text-gray-500 font-medium">
                                {topicSettings.technical_enabled ? 'ON' : 'OFF'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Coding Section */}
                        <div className="bg-white border border-gray-200 rounded-lg p-5">
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-4">
                              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                                <Code className="w-5 h-5 text-blue-600" />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <h4 className="text-sm font-medium text-gray-900">Coding Section</h4>
                                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                    topicSettings.coding_enabled
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-gray-200 text-gray-600'
                                  }`}>
                                    {topicSettings.coding_enabled ? 'Enabled' : 'Disabled'}
                                  </span>
                                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                                    {topicSettings.coding_scoring_type === 'informational' ? 'Informational Only' : 'Scored (0-10)'}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-600">
                                  Coding topics are available for assessments. Includes algorithms, data structures, frameworks, and coding patterns.
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-col items-center gap-1">
                              <button
                                onClick={() => updateTopicSettings({ coding_enabled: !topicSettings.coding_enabled })}
                                disabled={isSavingTopics}
                                className={`relative w-14 h-7 rounded-full transition-colors ${
                                  topicSettings.coding_enabled
                                    ? 'bg-blue-500'
                                    : 'bg-gray-300'
                                } ${isSavingTopics ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                <div className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${
                                  topicSettings.coding_enabled
                                    ? 'translate-x-8'
                                    : 'translate-x-1'
                                }`}>
                                  {topicSettings.coding_enabled ? (
                                    <CheckCircle2 className="w-5 h-5 text-blue-500" />
                                  ) : (
                                    <X className="w-5 h-5 text-gray-400" />
                                  )}
                                </div>
                              </button>
                              <span className="text-xs text-gray-500 font-medium">
                                {topicSettings.coding_enabled ? 'ON' : 'OFF'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Important Notice */}
                        <div className="flex items-start gap-2 p-4 bg-amber-50 rounded-lg border border-amber-200">
                          <Info className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm text-amber-800">
                              <span className="font-medium">Important:</span> When a topic is disabled here, it will not be available in the section distribution when creating or configuring assessments. Existing assessments with disabled topics will remain unchanged but cannot be edited to add those topics.
                            </p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  /* Proctoring Settings Content */
                  <div className="space-y-6">
                {/* Loading State */}
                {isLoadingProctoring ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                      <div className="w-10 h-10 border-4 border-gray-300 border-t-gray-800 rounded-full animate-spin mx-auto mb-3"></div>
                      <p className="text-gray-600">Loading proctoring settings...</p>
                    </div>
                  </div>
                ) : proctoringError && !proctoringSettings ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <AlertTriangle className="w-12 h-12 text-red-400 mb-4" />
                    <p className="text-red-600 mb-4">{proctoringError}</p>
                    <button
                      onClick={loadProctoringData}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Retry
                    </button>
                  </div>
                ) : proctoringSettings && (
                  <>
                    {/* Settings Header with Status */}
                    <div className="bg-gradient-to-r from-violet-600 to-purple-500 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                            <Shield className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <h3 className="text-sm font-medium text-white">Proctoring Settings</h3>
                            <p className="text-xs text-white/80">
                              Configure security features for candidate assessments
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {isSavingProctoring && (
                            <span className="text-xs text-white/80 flex items-center gap-1">
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              Saving...
                            </span>
                          )}
                          {flaggedCount > 0 && (
                            <span className="px-3 py-1 bg-red-500 text-white rounded-full text-xs font-medium">
                              {flaggedCount} Flagged Attempts
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
                    <div className="bg-white border border-gray-200 rounded-lg p-5">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-4">
                          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                            <Video className="w-5 h-5 text-gray-600" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="text-sm font-medium text-gray-900">Proctoring Mode</h4>
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                proctoringSettings.proctoring_enabled
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-gray-200 text-gray-600'
                              }`}>
                                {proctoringSettings.proctoring_enabled ? 'Enabled' : 'Disabled'}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 mb-4">
                              {proctoringSettings.proctoring_enabled
                                ? 'Advanced monitoring is active. Assessments will include configured security features to ensure test integrity.'
                                : 'Standard mode active. Assessments will run without advanced monitoring features. Enable proctoring for high-stakes assessments.'
                              }
                            </p>

                            {/* Privacy Notice */}
                            {proctoringSettings.proctoring_enabled && (
                              <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
                                <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                                <p className="text-xs text-blue-700">
                                  <span className="font-medium">Privacy Notice:</span> Candidates will be informed about monitoring before starting. Recordings are encrypted and stored for {proctoringSettings.recording_retention_days} days.
                                </p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Main Toggle Switch */}
                        <div className="flex flex-col items-center gap-1">
                          <button
                            onClick={() => updateProctoringSettings({ proctoring_enabled: !proctoringSettings.proctoring_enabled })}
                            disabled={isSavingProctoring}
                            className={`relative w-14 h-7 rounded-full transition-colors ${
                              proctoringSettings.proctoring_enabled
                                ? 'bg-blue-500'
                                : 'bg-gray-300'
                            } ${isSavingProctoring ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            <div className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${
                              proctoringSettings.proctoring_enabled
                                ? 'translate-x-8'
                                : 'translate-x-1'
                            }`}>
                              {proctoringSettings.proctoring_enabled ? (
                                <CheckCircle2 className="w-5 h-5 text-blue-500" />
                              ) : (
                                <X className="w-5 h-5 text-gray-400" />
                              )}
                            </div>
                          </button>
                          <span className="text-xs text-gray-500 font-medium">
                            {proctoringSettings.proctoring_enabled ? 'ON' : 'OFF'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Individual Security Features */}
                    <div className="bg-white border border-gray-200 rounded-lg p-6">
                      <h3 className="text-sm font-medium text-gray-900 mb-4">Security Features</h3>
                      <div className="grid grid-cols-2 gap-4">
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
                            <div key={feature.key} className="flex items-start justify-between p-4 bg-gray-50 rounded-lg">
                              <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center flex-shrink-0 border border-gray-200">
                                  <IconComponent className="w-4 h-4 text-gray-600" />
                                </div>
                                <div>
                                  <div className="text-sm font-medium text-gray-900">{feature.name}</div>
                                  <div className="text-xs text-gray-500">{feature.description}</div>
                                </div>
                              </div>
                              <button
                                onClick={() => updateProctoringSettings({ [feature.key]: !isEnabled })}
                                disabled={isSavingProctoring || !proctoringSettings.proctoring_enabled}
                                className={`relative w-11 h-6 rounded-full transition-colors ${
                                  isEnabled && proctoringSettings.proctoring_enabled
                                    ? 'bg-green-500'
                                    : 'bg-gray-300'
                                } ${isSavingProctoring || !proctoringSettings.proctoring_enabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${
                                  isEnabled ? 'translate-x-5' : 'translate-x-0.5'
                                }`} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Threshold Settings */}
                    <div className="bg-white border border-gray-200 rounded-lg p-6">
                      <h3 className="text-sm font-medium text-gray-900 mb-4">Threshold Settings</h3>
                      <div className="grid grid-cols-3 gap-6">
                        <div>
                          <label className="block text-xs text-gray-600 mb-2">Max Tab Switches Before Warning</label>
                          <input
                            type="number"
                            value={proctoringSettings.max_tab_switches}
                            onChange={(e) => updateProctoringSettings({ max_tab_switches: parseInt(e.target.value) || 3 })}
                            disabled={isSavingProctoring || !proctoringSettings.proctoring_enabled}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                            min="1"
                            max="10"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 mb-2">Max Violations Before Flag</label>
                          <input
                            type="number"
                            value={proctoringSettings.max_violations_before_flag}
                            onChange={(e) => updateProctoringSettings({ max_violations_before_flag: parseInt(e.target.value) || 5 })}
                            disabled={isSavingProctoring || !proctoringSettings.proctoring_enabled}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                            min="1"
                            max="20"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 mb-2">Recording Retention (Days)</label>
                          <input
                            type="number"
                            value={proctoringSettings.recording_retention_days}
                            onChange={(e) => updateProctoringSettings({ recording_retention_days: parseInt(e.target.value) || 90 })}
                            disabled={isSavingProctoring || !proctoringSettings.proctoring_enabled}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                            min="7"
                            max="365"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Recent Proctoring Events */}
                    <div className="bg-white border border-gray-200 rounded-lg p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-gray-900">Recent Proctoring Events</h3>
                        <span className="text-xs text-gray-500">{proctoringEventsTotal} total events</span>
                      </div>
                      {proctoringEvents.length === 0 ? (
                        <div className="text-center py-8">
                          <Shield className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                          <p className="text-sm text-gray-500">No proctoring events recorded yet</p>
                          <p className="text-xs text-gray-400 mt-1">Events will appear here when candidates take proctored assessments</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {proctoringEvents.slice(0, 5).map((event) => (
                            <div key={event.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                  event.severity === 'high' ? 'bg-red-100' :
                                  event.severity === 'medium' ? 'bg-yellow-100' : 'bg-gray-100'
                                }`}>
                                  <AlertTriangle className={`w-4 h-4 ${
                                    event.severity === 'high' ? 'text-red-500' :
                                    event.severity === 'medium' ? 'text-yellow-500' : 'text-gray-400'
                                  }`} />
                                </div>
                                <div>
                                  <div className="text-sm font-medium text-gray-900 capitalize">
                                    {event.event_type.replace(/_/g, ' ')}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {event.candidate_name || 'Unknown'} • {event.assessment_title || 'Assessment'}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  event.severity === 'high' ? 'bg-red-100 text-red-700' :
                                  event.severity === 'medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'
                                }`}>
                                  {event.severity}
                                </span>
                                {event.reviewed ? (
                                  <CheckCircle2 className="w-4 h-4 text-green-500" />
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
                  <div className="w-10 h-10 border-4 border-gray-300 border-t-gray-800 rounded-full animate-spin mx-auto mb-3"></div>
                  <p className="text-gray-600">Loading assessments...</p>
                </div>
              </div>
            ) : filteredAssessments.length === 0 ? (
              /* Empty State */
              <div className="text-center py-12">
                <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No assessments yet</h3>
                <p className="text-gray-600 mb-4">Create your first AI-powered assessment to start evaluating candidates</p>
                <button
                  onClick={handleOpenCreation}
                  className="inline-flex items-center gap-2 bg-gray-800 text-white px-6 py-2.5 rounded-lg hover:bg-gray-900 transition-colors"
                >
                  <Sparkles className="w-5 h-5" />
                  Create Assessment
                </button>
              </div>
            ) : viewMode === 'grid' ? (
              /* Grid View */
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredAssessments.map((assessment) => (
                  <div
                    key={assessment.id}
                    onClick={() => {
                      if (assessment.status === 'Draft') {
                        // For drafts, open edit modal to continue editing
                        handleEditAssessment(assessment);
                      } else {
                        router.push(`/recruitment/assessments/${assessment.id}`);
                      }
                    }}
                    className="p-5 border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-md transition-all bg-white cursor-pointer"
                  >
                    {/* Grid Card Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-5 h-5 text-gray-700" />
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs ${
                          assessment.status === 'Active'
                            ? 'bg-green-100 text-green-700'
                            : assessment.status === 'Draft'
                            ? 'bg-yellow-100 text-yellow-700'
                            : assessment.status === 'Archived'
                            ? 'bg-purple-100 text-purple-700'
                            : assessment.status === 'Completed'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {assessment.status}
                      </span>
                    </div>

                    {/* Grid Card Title */}
                    <div className="mb-3">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="inline-flex items-center px-2.5 py-1 bg-gray-800 text-white rounded text-xs font-semibold">
                          {assessment.short_id}
                        </span>
                        <h3 className="text-sm font-medium text-gray-900 line-clamp-2">
                          {assessment.job ? `${assessment.job.title} - Assessment` : stripVersionFromTitle(assessment.title)}
                        </h3>
                        <VersionBadge title={assessment.title} size="sm" variant="secondary" />
                        {assessment.sections && (
                          <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs flex items-center gap-1 flex-shrink-0">
                            <Sparkles className="w-3 h-3" />
                            AI
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-600 mb-1">
                        {assessment.jd_short_id && (
                          <span className="font-medium">Job Description ID: {assessment.jd_short_id}</span>
                        )}
                        {assessment.job && assessment.job.department && (
                          <span className={assessment.jd_short_id ? "ml-2" : ""}>
                            {assessment.jd_short_id ? "• " : ""}{assessment.job.department}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Grid Card Meta */}
                    <div className="flex items-center gap-3 text-xs text-gray-500 mb-4">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {assessment.duration}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" />
                        {assessment.candidates}
                      </span>
                    </div>

                    {/* Grid Card Actions */}
                    <div className="flex items-center gap-2 pt-3 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => {
                          if (assessment.status === 'Draft') {
                            toast.warning('Please publish the assessment before sharing');
                            return;
                          }
                          setSelectedAssessmentForShare(assessment);
                          setShowShareModal(true);
                        }}
                        disabled={assessment.status === 'Draft'}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors text-xs ${
                          assessment.status === 'Draft'
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            : 'bg-gray-800 text-white hover:bg-gray-900'
                        }`}
                        title={assessment.status === 'Draft' ? 'Publish assessment first to share' : 'Share via email'}
                      >
                        <Mail className="w-3.5 h-3.5" />
                        Share
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/recruitment/assessments/${assessment.id}/results`);
                        }}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-xs"
                      >
                        <BarChart className="w-3.5 h-3.5" />
                        Results
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(openMenuId === assessment.id ? null : assessment.id);
                        }}
                        className="p-1.5 text-gray-500 hover:bg-gray-100 rounded transition-colors"
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
                        <div className="absolute right-4 mt-2 w-48 bg-white rounded-lg shadow-xl border border-gray-200 py-1.5 z-20">
                          {(user?.permissions?.canUpdateAssessments || isTenantAdmin) && (
                            <button
                              onClick={() => {
                                handleEditAssessment(assessment);
                                setOpenMenuId(null);
                              }}
                              className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
                            >
                              <Edit2 className="w-4 h-4 text-gray-600" />
                              Edit
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setSelectedAssessmentForPreview(assessment);
                              setShowPreviewModal(true);
                              setOpenMenuId(null);
                            }}
                            className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
                          >
                            <Eye className="w-4 h-4 text-gray-600" />
                            Preview
                          </button>
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
                            className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2.5 ${
                              assessment.status === 'Draft'
                                ? 'text-gray-400 cursor-not-allowed'
                                : 'text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            <Link2 className="w-4 h-4" />
                            Copy Link
                          </button>
                          <div className="border-t border-gray-100 my-1"></div>
                          {assessment.status !== 'Completed' && (
                            <button
                              onClick={() => handleCompleteAssessment(assessment.id)}
                              className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
                            >
                              <CheckCircle className="w-4 h-4 text-green-600" />
                              Completed
                            </button>
                          )}
                          <button
                            onClick={() => handleArchiveAssessment(assessment.id)}
                            className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
                          >
                            <Archive className="w-4 h-4 text-gray-600" />
                            Archive
                          </button>
                          {(user?.permissions?.canDeleteAssessments || isTenantAdmin) && (
                            <button
                              onClick={() => handleDeleteAssessment(assessment.id)}
                              className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2.5"
                            >
                              <Trash2 className="w-4 h-4" />
                              Delete
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              /* List View */
              <div className="space-y-4">
                {filteredAssessments.map((assessment) => (
                  <div
                    key={assessment.id}
                    onClick={() => {
                      if (assessment.status === 'Draft') {
                        // For drafts, open edit modal to continue editing
                        handleEditAssessment(assessment);
                      } else {
                        router.push(`/recruitment/assessments/${assessment.id}`);
                      }
                    }}
                    className="p-5 border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-md transition-all bg-white cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      {/* Left Side - Icon + Info */}
                      <div className="flex items-center gap-4 flex-1">
                        <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
                          <FileText className="w-5 h-5 text-gray-700" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <span className="inline-flex items-center px-2.5 py-1 bg-gray-800 text-white rounded text-xs font-semibold">
                              {assessment.short_id}
                            </span>
                            <h3 className="text-sm font-medium text-gray-900 truncate">
                              {assessment.job ? `${assessment.job.title} - Assessment` : stripVersionFromTitle(assessment.title)}
                            </h3>
                            <VersionBadge title={assessment.title} size="sm" variant="secondary" />
                            {assessment.sections && (
                              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs flex items-center gap-1 flex-shrink-0">
                                <Sparkles className="w-3 h-3" />
                                AI
                              </span>
                            )}
                          </div>

                          <div className="text-xs text-gray-600 mb-1.5">
                            {assessment.jd_short_id && (
                              <span className="font-medium">Job Description ID: {assessment.jd_short_id}</span>
                            )}
                            {assessment.created_by_name && (
                              <span className={assessment.jd_short_id ? "ml-2" : ""}>
                                {assessment.jd_short_id ? "• " : ""}Created by: {assessment.created_by_name}
                              </span>
                            )}
                            {assessment.created_at && (
                              <span className={(assessment.jd_short_id || assessment.created_by_name) ? "ml-2" : ""}>
                                {(assessment.jd_short_id || assessment.created_by_name) ? "• " : ""}{formatDateOnlyIST(assessment.created_at)} at {formatTimeIST(assessment.created_at)} UTC
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              {assessment.duration}
                            </span>
                            <span className="flex items-center gap-1">
                              <Users className="w-3.5 h-3.5" />
                              {assessment.candidates} Invitations Sent
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right Side - Actions + Status + Menu */}
                      <div className="flex items-center gap-3 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        {/* Share via Email Button */}
                        <button
                          onClick={() => {
                            if (assessment.status === 'Draft') {
                              toast.warning('Please publish the assessment before sharing');
                              return;
                            }
                            setSelectedAssessmentForShare(assessment);
                            setShowShareModal(true);
                          }}
                          disabled={assessment.status === 'Draft'}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors text-xs ${
                            assessment.status === 'Draft'
                              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                              : 'bg-green-600 text-white hover:bg-green-700'
                          }`}
                          title={assessment.status === 'Draft' ? 'Publish assessment first to share' : 'Share via email'}
                        >
                          <Mail className="w-3.5 h-3.5" />
                          Share via Email
                        </button>

                        {/* Track Invites Button */}
                        {assessment.candidates > 0 && (
                          <button
                            onClick={() => handleTrackInvites(assessment)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors text-xs bg-purple-600 text-white hover:bg-purple-700"
                            title="Track invitation status"
                          >
                            <Mail className="w-3.5 h-3.5" />
                            Track Invites ({assessment.candidates})
                          </button>
                        )}

                        {/* View Results Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/recruitment/assessments/${assessment.id}/results`);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-xs"
                        >
                          <BarChart className="w-3.5 h-3.5" />
                          View Results ({assessment.candidates})
                        </button>

                        {/* Status Badge */}
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs ${
                            assessment.status === 'Active'
                              ? 'bg-green-100 text-green-700'
                              : assessment.status === 'Draft'
                              ? 'bg-yellow-100 text-yellow-700'
                              : assessment.status === 'Archived'
                              ? 'bg-purple-100 text-purple-700'
                              : assessment.status === 'Completed'
                              ? 'bg-blue-100 text-blue-700'
                              : assessment.status === 'Paused'
                              ? 'bg-orange-100 text-orange-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {assessment.status}
                        </span>

                        {/* Three Dots Menu */}
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuId(openMenuId === assessment.id ? null : assessment.id);
                            }}
                            className="p-1.5 text-gray-500 hover:bg-gray-100 rounded transition-colors"
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
                              <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-lg shadow-xl border border-gray-200 py-1.5 z-20">
                                {(user?.permissions?.canUpdateAssessments || isTenantAdmin) && (
                                  <button
                                    onClick={() => {
                                      handleEditAssessment(assessment);
                                      setOpenMenuId(null);
                                    }}
                                    className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
                                  >
                                    <Edit2 className="w-4 h-4 text-gray-600" />
                                    Edit Assessment
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    setSelectedAssessmentForPreview(assessment);
                                    setShowPreviewModal(true);
                                    setOpenMenuId(null);
                                  }}
                                  className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
                                >
                                  <Eye className="w-4 h-4 text-gray-600" />
                                  Preview
                                </button>
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
                                  className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2.5 ${
                                    assessment.status === 'Draft'
                                      ? 'text-gray-400 cursor-not-allowed'
                                      : 'text-gray-700 hover:bg-gray-50'
                                  }`}
                                >
                                  <Link2 className="w-4 h-4" />
                                  Copy Link
                                </button>
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
                                  className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
                                >
                                  <Copy className="w-4 h-4 text-gray-600" />
                                  Duplicate
                                </button>
                                <div className="border-t border-gray-100 my-1"></div>
                                {assessment.status !== 'Active' && (
                                  <button
                                    onClick={() => handleActivateAssessment(assessment.id)}
                                    className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
                                  >
                                    <Play className="w-4 h-4 text-green-600" />
                                    Activate
                                  </button>
                                )}
                                {assessment.status === 'Active' && (
                                  <button
                                    onClick={() => handleCompleteAssessment(assessment.id)}
                                    className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
                                  >
                                    <CheckCircle className="w-4 h-4 text-green-600" />
                                    Completed
                                  </button>
                                )}
                                <button
                                  onClick={() => handleArchiveAssessment(assessment.id)}
                                  className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
                                >
                                  <Archive className="w-4 h-4 text-gray-600" />
                                  Archive
                                </button>
                                <div className="border-t border-gray-100 my-1"></div>
                                {(user?.permissions?.canDeleteAssessments || isTenantAdmin) && (
                                  <button
                                    onClick={() => handleDeleteAssessment(assessment.id)}
                                    className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2.5"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                    Delete
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
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
        <div className="fixed inset-0 bg-gray-900/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-purple-600" />
                  <h2 className="text-lg font-semibold text-gray-900">Invite Status Tracking</h2>
                </div>
                <p className="text-sm text-gray-500 mt-0.5">{selectedAssessmentForTracking.title}</p>
              </div>
              <button
                onClick={() => {
                  setShowTrackInvitesModal(false);
                  setSelectedAssessmentForTracking(null);
                  setTrackingInvitations([]);
                }}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Stats Cards */}
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
              <div className="grid grid-cols-6 gap-4">
                <div className="bg-white rounded-lg p-3 border border-gray-200">
                  <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                    <Users className="w-3.5 h-3.5" />
                    Total Invited
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{invitationStats.total}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-gray-200">
                  <div className="flex items-center gap-2 text-blue-600 text-xs mb-1">
                    <Mail className="w-3.5 h-3.5" />
                    Sent
                  </div>
                  <p className="text-2xl font-bold text-blue-600">{invitationStats.sent}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-gray-200">
                  <div className="flex items-center gap-2 text-red-600 text-xs mb-1">
                    <X className="w-3.5 h-3.5" />
                    Failed
                  </div>
                  <p className="text-2xl font-bold text-red-600">{invitationStats.failed}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-gray-200">
                  <div className="flex items-center gap-2 text-yellow-600 text-xs mb-1">
                    <Play className="w-3.5 h-3.5" />
                    In Progress
                  </div>
                  <p className="text-2xl font-bold text-yellow-600">{invitationStats.started}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-gray-200">
                  <div className="flex items-center gap-2 text-green-600 text-xs mb-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Completed
                  </div>
                  <p className="text-2xl font-bold text-green-600">{invitationStats.completed}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-gray-200">
                  <div className="flex items-center gap-2 text-purple-600 text-xs mb-1">
                    <TrendingUp className="w-3.5 h-3.5" />
                    Completion
                  </div>
                  <p className="text-2xl font-bold text-purple-600">
                    {invitationStats.total > 0 ? Math.round((invitationStats.completed / invitationStats.total) * 100) : 0}%
                  </p>
                </div>
              </div>
            </div>

            {/* Invitations Table */}
            <div className="px-6 py-4 overflow-auto max-h-[50vh]">
              {isLoadingInvitations ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full"></div>
                </div>
              ) : trackingInvitations.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>No invitations found for this assessment.</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Candidate</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Timeline</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Progress</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {trackingInvitations.map((invitation: any) => {
                      const getStatusBadge = (inv: any) => {
                        if (inv.status === 'completed') {
                          return <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Completed</span>;
                        }
                        if (inv.started_at && inv.status !== 'completed') {
                          return <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs flex items-center gap-1"><Play className="w-3 h-3" /> In Progress</span>;
                        }
                        if (inv.status === 'expired') {
                          return <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs flex items-center gap-1"><X className="w-3 h-3" /> Expired</span>;
                        }
                        return <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs flex items-center gap-1"><Mail className="w-3 h-3" /> Invite Sent</span>;
                      };

                      const formatDate = (dateStr: string | null) => {
                        if (!dateStr) return null;
                        return formatDateTimeIST(dateStr, { includeTime: true });
                      };

                      const initials = invitation.candidate_name
                        ?.split(' ')
                        .map((n: string) => n[0])
                        .join('')
                        .toUpperCase()
                        .slice(0, 2) || '??';

                      return (
                        <tr key={invitation.id} className="hover:bg-gray-50">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-medium text-sm">
                                {initials}
                              </div>
                              <div>
                                <p className="font-medium text-gray-900 text-sm">{invitation.candidate_name}</p>
                                <p className="text-xs text-gray-500">{invitation.candidate_email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            {getStatusBadge(invitation)}
                          </td>
                          <td className="py-3 px-4 text-xs text-gray-500">
                            <div className="space-y-1">
                              {invitation.sent_at && (
                                <div className="flex items-center gap-2">
                                  <Mail className="w-3 h-3 text-blue-500" />
                                  <span>Sent: {formatDate(invitation.sent_at)}</span>
                                </div>
                              )}
                              {invitation.started_at && (
                                <div className="flex items-center gap-2">
                                  <Play className="w-3 h-3 text-yellow-500" />
                                  <span>Started: {formatDate(invitation.started_at)}</span>
                                </div>
                              )}
                              {invitation.completed_at && (
                                <div className="flex items-center gap-2">
                                  <CheckCircle className="w-3 h-3 text-green-500" />
                                  <span>Completed: {formatDate(invitation.completed_at)}</span>
                                </div>
                              )}
                              {!invitation.sent_at && !invitation.started_at && (
                                <div className="flex items-center gap-2">
                                  <Clock className="w-3 h-3 text-gray-400" />
                                  <span>Created: {formatDate(invitation.created_at)}</span>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            {invitation.status === 'completed' ? (
                              <div>
                                <div className="flex items-center gap-2 text-sm">
                                  <span className="text-gray-600">Score</span>
                                  <span className={`font-medium ${invitation.passed ? 'text-green-600' : 'text-red-600'}`}>
                                    {invitation.overall_score != null ? `${invitation.overall_score.toFixed(1)}%` : '100%'}
                                  </span>
                                  {invitation.passed !== null && (
                                    <span className={`text-xs px-1.5 py-0.5 rounded ${invitation.passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                      {invitation.passed ? 'Passed' : 'Failed'}
                                    </span>
                                  )}
                                </div>
                                <div className="w-24 h-1.5 bg-gray-200 rounded-full mt-1">
                                  <div className="h-full bg-green-500 rounded-full" style={{ width: '100%' }} />
                                </div>
                                {invitation.time_spent_minutes != null && (
                                  <p className="text-xs text-gray-400 mt-1">
                                    Time: {invitation.time_spent_minutes} min
                                  </p>
                                )}
                              </div>
                            ) : invitation.started_at ? (
                              <div>
                                <div className="flex items-center gap-2 text-sm">
                                  <span className="text-gray-600">Progress</span>
                                  <span className="font-medium text-yellow-600">
                                    {invitation.progress_percent != null ? `${invitation.progress_percent}%` : 'In Progress'}
                                  </span>
                                </div>
                                <div className="w-24 h-1.5 bg-gray-200 rounded-full mt-1">
                                  <div
                                    className="h-full bg-yellow-500 rounded-full"
                                    style={{ width: `${invitation.progress_percent ?? 50}%` }}
                                  />
                                </div>
                                {invitation.current_question != null && invitation.total_questions != null && (
                                  <p className="text-xs text-gray-400 mt-1">
                                    Q{invitation.current_question}/{invitation.total_questions}
                                    {invitation.time_spent_minutes != null && ` • ${invitation.time_spent_minutes} min`}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {invitation.status === 'completed' ? (
                              <button
                                onClick={() => router.push(`/recruitment/assessments/${selectedAssessmentForTracking.id}/results`)}
                                className="flex items-center gap-1 px-3 py-1.5 text-xs text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                View Results
                              </button>
                            ) : !invitation.started_at ? (
                              <button
                                onClick={() => handleResendInvitation(invitation)}
                                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors"
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
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between bg-gray-50">
              <p className="text-sm text-gray-500">
                Showing <strong>{trackingInvitations.length}</strong> of <strong>{invitationStats.total}</strong> invites
              </p>
              <button
                onClick={() => {
                  setShowTrackInvitesModal(false);
                  setSelectedAssessmentForTracking(null);
                  setTrackingInvitations([]);
                }}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}