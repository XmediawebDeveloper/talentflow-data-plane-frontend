'use client';

import { Video, Calendar, Users, CheckCircle, MoreVertical, Settings, TrendingUp, Clock, FileText, Copy, X, Loader2, Send, Mail, Briefcase, Globe, Brain, MessageSquare, Shield, Lightbulb, Eye, Trash2, Play, Pause, Zap, Archive, ArchiveRestore, GitBranch, Activity, ScrollText, Camera, Monitor, AlertTriangle, Pencil, BarChart2, ChevronLeft, ChevronRight, Search, ArrowUpDown, Plus, Sparkles, ArrowUpRight } from 'lucide-react';
import { useState, useEffect, useRef, useCallback, type ComponentType } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { usePlanFeature } from '@/lib/hooks/usePlanFeature';
import { useQuota } from '@/contexts/QuotaContext';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import type { AIInterviewResponse, AIInterviewStatsResponse, AIInterviewSettingsResponse, AIInterviewAuditActivity, AIInterviewAuditTrailResponse } from '@/lib/services/aiInterviewService';
import api from '@/lib/services/api';
import { toast } from 'sonner';
import ShareAIInterviewModal from '@/components/ai-interview/ShareAIInterviewModal';
import CandidateResultsView from '@/components/ai-interview/CandidateResultsView';
import AIInterviewAuditTrail from '@/components/AIInterviewAuditTrail';
import { formatIST } from '@/lib/utils/dateUtils';
import { modeFromConfig } from '@/lib/constants/aiInterviewMode';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import ListPagination from '@/components/ListPagination';

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

type TabKey = 'all' | 'published' | 'draft' | 'completed' | 'archived' | 'processing' | 'audit' | 'consent' | 'settings';
const CONFIG_PAGE_SIZE = 10;
const PROCESSING_PAGE_SIZE = 10;
const INVITATION_PAGE_SIZE = 10;

export default function AIInterview() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isTenantAdmin } = useAuth();
  const canViewAIInterviews = isTenantAdmin || (user?.permissions?.canViewAIInterviews ?? user?.permissions?.canRunAiInterviews ?? false);
  const canCreateAIInterviews = isTenantAdmin || !!user?.permissions?.canCreateAIInterviews;
  const canUpdateAIInterviews = isTenantAdmin || !!user?.permissions?.canUpdateAIInterviews;
  const canShareAIInterviews = isTenantAdmin || !!user?.permissions?.canShareAIInterviews;
  const canInviteAIInterviews = isTenantAdmin || !!user?.permissions?.canInviteAIInterviews;
  const canPublishAIInterviews = isTenantAdmin || !!user?.permissions?.canPublishAIInterviews;
  const canArchiveAIInterviews = isTenantAdmin || !!user?.permissions?.canArchiveAIInterviews;
  const canDeleteAIInterviews = isTenantAdmin || !!user?.permissions?.canDeleteAIInterviews;
  const { available: aiInterviewAvailable } = usePlanFeature('ai_interview');
  const { quotaData } = useQuota();

  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [modeFilter, setModeFilter] = useState<'all' | 'timed' | 'conversational'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'active' | 'draft'>('newest');
  const [configs, setConfigs] = useState<AIInterviewResponse[]>([]);
  const [archivedConfigs, setArchivedConfigs] = useState<AIInterviewResponse[]>([]);
  const [stats, setStats] = useState<AIInterviewStatsResponse | null>(null);
  const [settings, setSettings] = useState<AIInterviewSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Share modal
  const [shareConfig, setShareConfig] = useState<AIInterviewResponse | null>(null);

  // View invitations
  const [viewInvitationsConfig, setViewInvitationsConfig] = useState<AIInterviewResponse | null>(null);
  const [invitations, setInvitations] = useState<AIInterviewResponse[]>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(false);
  const [resendingEmailFor, setResendingEmailFor] = useState<string | null>(null); // session id
  // Resend-with-new-link confirmation dialog target
  const [resendInviteTarget, setResendInviteTarget] = useState<any | null>(null);
  const [invitationTotal, setInvitationTotal] = useState(0);
  const [invitationTotalPages, setInvitationTotalPages] = useState(1);
  const [invitationSummary, setInvitationSummary] = useState({
    completed: 0,
    inProgress: 0,
  });
  const [configListPage, setConfigListPage] = useState(1);
  const [configListItemsPerPage, setConfigListItemsPerPage] = useState(10);
  const [processingPage, setProcessingPage] = useState(1);
  const [processingItemsPerPage, setProcessingItemsPerPage] = useState(10);
  const [invitationPage, setInvitationPage] = useState(1);

  // Candidate detail view (from Track Invites modal)
  const [candidateDetailFromModal, setCandidateDetailFromModal] = useState<AIInterviewResponse | null>(null);
  const [candidateDetailLoading, setCandidateDetailLoading] = useState(false);

  // 3-dot menu
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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

  // Confirmation dialog
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; onConfirm: () => void; destructive?: boolean } | null>(null);
  const [showPublishedModal, setShowPublishedModal] = useState(false);
  const [publishedTitle, setPublishedTitle] = useState('');

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
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [configsRes, statsRes] = await Promise.allSettled([
        aiInterviewService.listConfigs({ page_size: 1 }).then((probe) =>
          probe.total > probe.items.length
            ? aiInterviewService.listConfigs({ page_size: probe.total })
            : probe
        ),
        aiInterviewService.getConfigStats(),
      ]);

      if (configsRes.status === 'fulfilled') setConfigs(configsRes.value.items);
      if (statsRes.status === 'fulfilled') setStats(statsRes.value);
    } catch (error) {
      console.error('Failed to load AI interview data:', error);
      toast.error('Failed to load data. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, []);

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
      const probe = await aiInterviewService.listConfigs({ status: 'archived', page_size: 1 });
      const result = probe.total > probe.items.length
        ? await aiInterviewService.listConfigs({ status: 'archived', page_size: probe.total })
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

  const loadInvitations = useCallback(async (configId: string, page: number) => {
    setLoadingInvitations(true);
    try {
      const result = await aiInterviewService.getConfigInvitations(configId, {
        page,
        page_size: INVITATION_PAGE_SIZE,
      });
      setInvitations(result.items);
      setInvitationTotal(result.total);
      setInvitationTotalPages(Math.max(1, result.total_pages || 1));
      setInvitationSummary({
        completed: result.completed || 0,
        inProgress: result.in_progress || 0,
      });
    } catch (error) {
      console.error('Failed to load invitations:', error);
      toast.error('Failed to load invitations');
    } finally {
      setLoadingInvitations(false);
    }
  }, []);

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

  useEffect(() => {
    const wasPublished = searchParams.get('published') === '1';
    if (!wasPublished) return;

    setPublishedTitle(searchParams.get('title') || 'AI Interview');
    setShowPublishedModal(true);

    const timer = window.setTimeout(() => {
      setShowPublishedModal(false);
      router.replace('/recruitment/ai-interviews');
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [searchParams, router]);

  useEffect(() => {
    if (activeTab === 'settings') {
      loadSettings();
      if (settingsSubTab === 'proctoring') loadProctoringSettings();
    }
    if (activeTab === 'archived') loadArchivedConfigs();
    if (activeTab === 'audit') loadAuditTrail();
    if (activeTab === 'processing') loadProcessingSessions();
  }, [activeTab, loadSettings, loadArchivedConfigs, loadAuditTrail, loadProcessingSessions, settingsSubTab, loadProctoringSettings, auditCategory, auditPage]);

  useEffect(() => {
    if (!viewInvitationsConfig) return;
    loadInvitations(viewInvitationsConfig.id, invitationPage);
  }, [viewInvitationsConfig, invitationPage, loadInvitations]);

  // Click-outside handler for 3-dot menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    if (openMenuId) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openMenuId]);

  const handleDeleteConfig = async (config: AIInterviewResponse) => {
    // Prevent deletion if candidates have started
    if (config.invitations_count && config.invitations_count > 0) {
      toast.error('Cannot delete — candidates have already started this interview');
      setOpenMenuId(null);
      return;
    }
    setConfirmAction({
      title: 'Delete Configuration',
      message: 'Delete this AI interview configuration? This cannot be undone.',
      destructive: true,
      onConfirm: async () => {
        try {
          await aiInterviewService.delete(config.id);
          toast.success('Configuration deleted');
          loadData();
        } catch (error) {
          console.error('Failed to delete:', error);
          toast.error(error instanceof Error ? error.message : 'Failed to delete configuration');
        }
        setConfirmAction(null);
        setOpenMenuId(null);
      },
    });
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

  const handleViewInvitations = async (config: AIInterviewResponse) => {
    setViewInvitationsConfig(config);
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

  const handleArchiveConfig = async (config: AIInterviewResponse) => {
    setConfirmAction({
      title: 'Archive Configuration',
      message: 'Archive this configuration? It will be moved to the Archived tab.',
      onConfirm: async () => {
        try {
          await aiInterviewService.archive(config.id);
          toast.success('Configuration archived');
          loadData();
        } catch (error: any) {
          toast.error(error.message || 'Failed to archive');
        }
        setConfirmAction(null);
        setOpenMenuId(null);
      },
    });
  };

  const handleUnarchiveConfig = async (config: AIInterviewResponse) => {
    try {
      await aiInterviewService.unarchive(config.id);
      toast.success('Configuration restored to draft');
      loadData();
      loadArchivedConfigs();
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

  // Filter configs by tab + mode
  const filteredConfigs = (() => {
    const base = activeTab === 'archived' ? archivedConfigs : configs.filter((config) => {
      if (activeTab === 'all') return true;
      if (activeTab === 'published') return normalizeConfigStatus(config.status) === 'published';
      if (activeTab === 'draft') return config.status === 'draft';
      if (activeTab === 'completed') return config.status === 'completed' || config.status === 'cancelled';
      return true;
    });
    const byMode = modeFilter === 'all' ? base : base.filter((config) => {
      // Single source of truth for mode: special_instructions.interview_mode.
      const mode = modeFromConfig(config.special_instructions, config.duration_minutes);
      return modeFilter === 'timed' ? mode === 'fixed' : mode === 'flexible';
    });
    const q = searchQuery.trim().toLowerCase();
    const bySearch = q
      ? byMode.filter((c) => {
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
      : byMode;
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
  const configTotalPages = Math.max(1, Math.ceil(filteredConfigs.length / configListItemsPerPage));
  const paginatedConfigs = filteredConfigs.slice(
    (configListPage - 1) * configListItemsPerPage,
    configListPage * configListItemsPerPage,
  );
  const processingTotalPages = Math.max(1, Math.ceil(processingSessions.length / processingItemsPerPage));
  const paginatedProcessingSessions = processingSessions.slice(
    (processingPage - 1) * processingItemsPerPage,
    processingPage * processingItemsPerPage,
  );

  const getStatusBadge = (status: string) => {
    switch (normalizeConfigStatus(status)) {
      case 'published':
        return 'bg-emerald-100 text-emerald-700';
      case 'draft':
        return 'bg-amber-100 text-amber-700';
      case 'completed':
        return 'bg-blue-100 text-blue-700';
      case 'cancelled':
        return 'bg-red-100 text-red-700';
      case 'archived':
        return 'bg-orange-100 text-orange-700';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

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

  useEffect(() => {
    setConfigListPage(1);
  }, [activeTab, modeFilter, searchQuery, sortBy]);

  useEffect(() => {
    setProcessingPage(1);
  }, [processingSessions.length]);

  // Candidate detail view from Track Invites modal
  if (candidateDetailFromModal) {
    return <CandidateResultsView interview={candidateDetailFromModal} onBack={() => setCandidateDetailFromModal(null)} />;
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center overflow-y-auto bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-brand-blue animate-spin" />
          <p className="text-sm text-gray-500">Loading AI interviews...</p>
        </div>
      </div>
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
    <div className="flex-1 p-4 md:p-8 overflow-x-hidden overflow-y-auto bg-slate-50">
      <div className="w-full max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3 lg:gap-4 mb-5">
          <div className="flex items-start gap-3 min-w-0">
            <div className="hidden sm:flex w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 items-center justify-center shrink-0">
              <Video className="w-4 h-4 text-brand-blue" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-brand-blue text-white text-[10px] font-medium tracking-wide shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
                  <Sparkles className="w-3 h-3" />
                  AI Interview
                </span>
                <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Platform</span>
              </div>
              <h1 className="text-lg sm:text-xl font-semibold text-gray-900 tracking-tight break-words">
                AI Interview Platform
              </h1>
              <p className="text-xs sm:text-sm text-gray-500 mt-0.5 max-w-xl">
                Configure, launch, and analyze AI-powered interviews. Multi-round evaluations with real-time scoring and proctoring.
              </p>
            </div>
          </div>
          <div className="flex items-stretch gap-2 sm:gap-3 flex-wrap lg:flex-nowrap">
            {/* AI Interview Quota Card */}
            {totalUnits > 0 && (
              <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border bg-white shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] transition-all ${
                quotaTone === 'danger'
                  ? 'border-red-200 ring-red-100'
                  : quotaTone === 'warning'
                  ? 'border-brand-orange/30 ring-brand-orange/10'
                  : 'border-gray-100'
              }`}>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ring-1 ${
                  quotaTone === 'danger'
                    ? 'bg-red-50 text-red-600 ring-red-200'
                    : quotaTone === 'warning'
                    ? 'bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20'
                    : 'bg-brand-blue text-white ring-white/10 shadow-sm shadow-brand-blue/25'
                }`}>
                  <Zap className="w-3.5 h-3.5" />
                </div>
                <div className="flex flex-col min-w-[88px]">
                  <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold leading-none">Quota</span>
                  {isUnlimited ? (
                    <span className="text-xs font-semibold text-brand-blue mt-0.5">Unlimited</span>
                  ) : availableUnits !== null ? (
                    <>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className={`text-sm font-semibold tabular-nums leading-none tracking-tight ${
                          quotaTone === 'danger'
                            ? 'text-red-700'
                            : quotaTone === 'warning'
                            ? 'text-brand-orange-deep'
                            : 'text-brand-blue'
                        }`}>{availableUnits}</span>
                        <span className="text-[10px] text-gray-400">/ {totalUnits}</span>
                      </div>
                      <div className="mt-1 h-0.5 w-full rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            quotaTone === 'danger'
                              ? 'bg-red-500'
                              : quotaTone === 'warning'
                              ? 'bg-brand-orange'
                              : 'bg-gradient-to-r from-brand-blue to-brand-cyan'
                          }`}
                          style={{ width: `${quotaUsedPct}%` }}
                        />
                      </div>
                    </>
                  ) : (
                    <span className="text-xs text-gray-400 mt-0.5">Loading…</span>
                  )}
                </div>
              </div>
            )}
            {canCreateAIInterviews && (
              <button
                onClick={() => router.push('/recruitment/ai-interviews/jd-selection')}
                className="group inline-flex items-center gap-1.5 bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white px-3.5 py-2 rounded-lg hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 text-xs font-medium shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
              >
                <Plus className="w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200 group-hover:rotate-90" />
                <span>Create AI Interview</span>
              </button>
            )}
          </div>
        </div>

        {/* AI-Powered Interviews Banner */}
        <div className="relative overflow-hidden rounded-xl sm:rounded-2xl border border-brand-blue/15 ring-1 ring-brand-blue/10 bg-gradient-to-br from-brand-blue/5 via-white to-brand-cyan/5 p-3 sm:p-5 mb-5 sm:mb-8 shadow-sm shadow-brand-blue/10">
          <div className="absolute -right-12 -top-12 w-40 h-40 rounded-full bg-brand-blue/5 blur-2xl" aria-hidden />
          <div className="relative flex items-start gap-3 sm:gap-4">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-brand-blue flex items-center justify-center flex-shrink-0 shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
              <Brain className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h3 className="text-sm font-semibold text-gray-900">AI-Powered Interviews</h3>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-green-100 text-green-700 text-[10px] font-semibold ring-1 ring-green-200">
                  LIVE
                </span>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
                Create multi-round AI interview configurations linked to job descriptions. AI conducts HR, Technical, and Behavioral rounds with auto-suggested topics. Track candidate performance, round-wise scores, and weighted evaluations.
              </p>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 mb-5 sm:mb-8">
          {[
            {
              label: 'Total Configs',
              value: stats?.total_configs ?? 0,
              icon: FileText,
              tone: 'slate',
              hint: 'All interview templates',
            },
            {
              label: 'Active',
              value: stats?.published_configs ?? 0,
              icon: Globe,
              tone: 'emerald',
              hint: 'Published & live',
              trend: 'up' as const,
            },
            {
              label: 'Candidates Invited',
              value: stats?.candidates_invited ?? 0,
              icon: Users,
              tone: 'blue',
              hint: 'Across all interviews',
              trend: 'up' as const,
            },
            {
              label: 'Avg. Score',
              value: stats?.average_score != null ? `${stats.average_score}%` : '—',
              icon: TrendingUp,
              tone: 'amber',
              hint: 'Weighted across rounds',
            },
          ].map(({ label, value, icon: Icon, tone, hint, trend }) => {
            const toneStyles: Record<string, string> = {
              slate: 'bg-brand-blue/10 ring-1 ring-brand-blue/15 text-brand-blue',
              emerald: 'bg-gradient-to-br from-green-100 to-green-50 ring-1 ring-green-200 text-green-600',
              blue: 'bg-brand-cyan/10 ring-1 ring-brand-cyan/15 text-brand-cyan',
              amber: 'bg-gradient-to-br from-brand-orange/10 to-brand-orange/5 ring-1 ring-brand-orange/15 text-brand-orange-deep',
            };
            return (
              <div
                key={label}
                className="group relative bg-white rounded-xl sm:rounded-2xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-3 sm:p-5 hover:shadow-md hover:shadow-brand-blue/10 hover:-translate-y-0.5 hover:border-brand-blue/30 transition-all duration-200 cursor-default min-w-0"
              >
                <div className="flex items-start justify-between mb-2.5 sm:mb-4 gap-2">
                  <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0 ${toneStyles[tone]}`}>
                    <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  {trend === 'up' && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-green-100 text-green-700 text-[10px] font-semibold ring-1 ring-green-200 flex-shrink-0">
                      <ArrowUpRight className="w-3 h-3" />
                      Live
                    </span>
                  )}
                </div>
                <div className="text-xl sm:text-3xl font-semibold text-gray-900 tracking-tight tabular-nums truncate">
                  {value}
                </div>
                <div className="mt-1 flex items-center justify-between gap-1 min-w-0">
                  <span className="text-xs sm:text-sm text-gray-500 font-medium truncate">{label}</span>
                  <span className="hidden lg:inline text-[11px] text-gray-400 truncate">{hint}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Main Content */}
        <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 overflow-hidden">
          {/* Tabs */}
          <div className="border-b border-gray-100 px-3 sm:px-6 bg-gradient-to-b from-white to-slate-50/40">
            <div className="flex gap-1 sm:gap-2 overflow-x-auto scrollbar-hide -mb-px">
              {[
                { key: 'all', label: 'All AI Interviews', count: configs.length },
                { key: 'published', label: 'Active', count: configs.filter((c) => normalizeConfigStatus(c.status) === 'published').length },
                { key: 'draft', label: 'Draft', count: configs.filter((c) => c.status === 'draft').length },
                // { key: 'completed', label: 'Completed' },
                // { key: 'archived', label: 'Archived' },
                // { key: 'processing', label: 'Processing' },
                { key: 'audit', label: 'Activity Logs' },
                { key: 'consent', label: 'Consent Logs' },
                { key: 'settings', label: 'Settings' },
              ].map(tab => {
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key as TabKey)}
                    className={`relative inline-flex items-center gap-1.5 sm:gap-2 py-3 sm:py-3.5 px-2.5 sm:px-3 min-h-[44px] text-xs sm:text-sm border-b-2 transition-all duration-200 whitespace-nowrap ${
                      isActive
                        ? 'border-brand-blue text-brand-blue font-medium'
                        : 'border-transparent text-gray-600 hover:text-brand-blue font-medium'
                    }`}
                  >
                    {tab.label}
                    {typeof tab.count === 'number' && (
                      <span className={`inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full text-[10px] font-semibold tabular-nums transition-colors ${
                        isActive
                          ? 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20'
                          : 'bg-slate-100 text-gray-600 group-hover:bg-slate-200'
                      }`}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Config List (for config-listing tabs) */}
          {isConfigListTab && (
            <div className="p-3 sm:p-6">
              {/* Filters bar: mode pills + search + sort */}
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2.5 sm:gap-3 mb-4 sm:mb-5">
                <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 border border-gray-100 ring-1 ring-black/[0.02] self-start overflow-x-auto scrollbar-hide max-w-full">
                  {(['all', 'timed', 'conversational'] as const).map((m) => {
                    const isActive = modeFilter === m;
                    const Icon = m === 'timed' ? Clock : m === 'conversational' ? MessageSquare : Activity;
                    return (
                      <button
                        key={m}
                        onClick={() => setModeFilter(m)}
                        className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-medium transition-all duration-200 whitespace-nowrap ${
                          isActive
                            ? 'bg-white text-brand-blue shadow-sm shadow-brand-blue/10 ring-1 ring-brand-blue/20'
                            : 'text-gray-600 hover:text-brand-blue'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                        {m === 'all' ? 'All' : m === 'timed' ? 'Timed' : 'Conversational'}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2 flex-1 lg:justify-end min-w-0">
                  <div className="relative flex-1 lg:max-w-xs min-w-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search title, ID, skill…"
                      className="w-full pl-9 pr-9 py-2 min-h-[40px] text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue placeholder:text-gray-400 transition-colors"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-gray-400 hover:text-brand-blue hover:bg-brand-blue/5 transition-colors"
                        aria-label="Clear search"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="relative flex-shrink-0">
                    <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                      className="appearance-none pl-8 pr-7 py-2 min-h-[40px] text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue cursor-pointer text-gray-700 font-medium transition-colors"
                    >
                      <option value="newest">Newest</option>
                      <option value="oldest">Oldest</option>
                      <option value="active">Active first</option>
                      <option value="draft">Draft first</option>
                    </select>
                    <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 rotate-90 pointer-events-none" />
                  </div>
                </div>
              </div>
              {filteredConfigs.length === 0 ? (
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
                  <h3 className="text-base font-semibold text-gray-900 mb-1.5 tracking-tight">
                    {searchQuery
                      ? 'No matches found'
                      : activeTab === 'archived'
                      ? 'No archived configurations'
                      : 'No AI interviews yet'}
                  </h3>
                  <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">
                    {searchQuery
                      ? `We couldn't find anything matching "${searchQuery}". Try a different search.`
                      : activeTab === 'archived'
                      ? 'Configurations you archive will show up here.'
                      : 'Set up your first AI interview to start evaluating candidates with multi-round, AI-driven assessments.'}
                  </p>
                  {!searchQuery && activeTab !== 'archived' && canCreateAIInterviews && (
                    <button
                      onClick={() => router.push('/recruitment/ai-interviews/jd-selection')}
                      className="group inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white rounded-xl hover:shadow-lg hover:shadow-brand-blue/20 hover:-translate-y-0.5 transition-all duration-200 shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
                    >
                      <Plus className="w-4 h-4 transition-transform duration-200 group-hover:rotate-90" />
                      Create your first interview
                    </button>
                  )}
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-200 bg-white text-gray-700 rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors"
                    >
                      Clear search
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3 sm:space-y-4">
                  {paginatedConfigs.map((config) => {
                    const enabledRounds = config.rounds_config
                      ? config.rounds_config.filter((r: any) => r.enabled !== false)
                      : [];
                    const normalizedStatus = normalizeConfigStatus(config.status);
                    const statusStyles: Record<string, { dot: string; chip: string; label: string }> = {
                      published: { dot: 'bg-green-500', chip: 'bg-green-100 text-green-700 ring-1 ring-green-200', label: 'Active' },
                      draft: { dot: 'bg-brand-orange', chip: 'bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20', label: 'Draft' },
                      completed: { dot: 'bg-brand-blue', chip: 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20', label: 'Completed' },
                      cancelled: { dot: 'bg-red-500', chip: 'bg-red-100 text-red-700 ring-1 ring-red-200', label: 'Cancelled' },
                      archived: { dot: 'bg-brand-orange', chip: 'bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20', label: 'Archived' },
                    };
                    const statusStyle = statusStyles[normalizedStatus] || { dot: 'bg-gray-400', chip: 'bg-slate-100 text-gray-700 ring-1 ring-gray-200', label: getStatusLabel(config.status) };

                    return (
                      <div
                        key={config.id}
                        onClick={() => router.push(`/recruitment/ai-interviews/${config.id}`)}
                        className={`group relative flex flex-col lg:flex-row lg:items-center justify-between p-4 sm:p-5 border border-gray-100 ring-1 ring-black/[0.02] rounded-2xl bg-white hover:border-brand-blue/30 hover:shadow-md hover:shadow-brand-blue/10 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer gap-4 overflow-visible ${
                          openMenuId === config.id ? 'z-40' : 'z-0'
                        }`}
                      >
                        {normalizedStatus === 'published' && (
                          <span className="absolute left-0 top-4 bottom-4 w-1 rounded-r-full bg-gradient-to-b from-brand-blue to-brand-cyan" aria-hidden />
                        )}
                        <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
                          <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ring-1 ${
                            normalizedStatus === 'published'
                              ? 'bg-gradient-to-br from-green-100 to-green-50 text-green-600 ring-green-200 group-hover:from-green-200'
                              : 'bg-brand-blue/10 text-brand-blue ring-brand-blue/15 group-hover:from-brand-blue/15'
                          }`}>
                            <Video className="w-5 h-5 sm:w-6 sm:h-6" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1.5">
                              {config.display_id && (
                                <span className="px-2 py-0.5 text-[11px] font-mono font-semibold bg-brand-blue text-white rounded-md shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
                                  {config.display_id}
                                </span>
                              )}
                              <h3 className="font-semibold text-gray-900 text-[15px] truncate tracking-tight">
                                {config.jd_title || config.position || 'Untitled'}
                              </h3>
                              {config.jd_version && (
                                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-slate-100 text-gray-500 rounded ring-1 ring-gray-200">
                                  v{config.jd_version}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
                              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${statusStyle.chip}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
                                {statusStyle.label}
                              </span>
                              {(() => {
                                const mode = modeFromConfig(config.special_instructions, config.duration_minutes);
                                let hasBuffer = false;
                                try {
                                  const si = JSON.parse(config.special_instructions || '{}');
                                  hasBuffer = !!si.buffer_enabled;
                                } catch {}
                                if (mode === 'fixed') {
                                  return (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20">
                                      <Clock className="w-3 h-3" />
                                      Timed
                                    </span>
                                  );
                                }
                                return (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/20">
                                    <MessageSquare className="w-3 h-3" />
                                    {hasBuffer ? 'Conversational + Buffer' : 'Conversational'}
                                  </span>
                                );
                              })()}
                              {enabledRounds.length > 0 && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20">
                                  <GitBranch className="w-3 h-3" />
                                  {enabledRounds.length} rounds
                                </span>
                              )}
                            </div>
                            {config.jd_short_id && (
                              <div className="text-xs text-gray-500 mb-2">
                                <span className="font-mono">{config.jd_short_id}</span>
                                {(config.jd_title || config.position) && (
                                  <span className="ml-1.5 text-gray-400">· {config.jd_title || config.position}</span>
                                )}
                              </div>
                            )}
                            <div className="flex items-center gap-x-4 gap-y-1 text-xs text-gray-500 flex-wrap">
                              <span className="inline-flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-gray-400" />
                                {getInterviewDuration(config.duration_minutes, (config as any).special_instructions)}
                              </span>
                              {enabledRounds.length > 0 && (
                                <span className="hidden sm:inline-flex items-center gap-1.5 text-gray-400">
                                  <span className="w-1 h-1 rounded-full bg-gray-300" />
                                  {enabledRounds.map((r: any) => ROUND_LABELS[r.type] || r.type).join(' · ')}
                                </span>
                              )}
                              <span className="inline-flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5 text-gray-400" />
                                {formatIST(config.created_at)}
                              </span>
                              {config.created_by_name && (
                                <span className="inline-flex items-center gap-1 text-gray-400">
                                  by <span className="text-gray-500">{config.created_by_name}</span>
                                </span>
                              )}
                            </div>
                            {config.jd_must_have_skills && config.jd_must_have_skills.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-gray-100">
                                <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mr-0.5">Skills</span>
                                {config.jd_must_have_skills.slice(0, 4).map((skill: string) => (
                                  <span key={skill} className="px-2 py-0.5 bg-brand-blue/5 text-brand-blue text-[11px] font-medium rounded-md ring-1 ring-brand-blue/20">
                                    {skill}
                                  </span>
                                ))}
                                {config.jd_must_have_skills.length > 4 && (
                                  <span className="text-[11px] text-gray-400 font-medium">+{config.jd_must_have_skills.length - 4} more</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap lg:flex-nowrap lg:justify-end w-full lg:w-auto" onClick={(e) => e.stopPropagation()}>
                          {/* Edit — draft only (primary action) */}
                          {config.status === 'draft' && config.jd_id && canUpdateAIInterviews && (
                            <button
                              onClick={() => router.push(`/recruitment/ai-interviews/jd-selection/ai-interview-config?jd_id=${config.jd_id}&config_id=${config.id}`)}
                              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[40px] flex-1 sm:flex-none text-xs font-medium bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 hover:shadow-lg hover:shadow-brand-blue/30 transition-all duration-200 whitespace-nowrap"
                            >
                              <Pencil className="w-3.5 h-3.5 flex-shrink-0" />
                              <span className="hidden sm:inline">Continue Editing</span>
                              <span className="sm:hidden">Edit</span>
                            </button>
                          )}

                          {/* Results — primary for published */}
                          {normalizedStatus === 'published' && (
                            <button
                              onClick={() => router.push(`/recruitment/ai-interviews/${config.id}/results`)}
                              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[40px] flex-1 sm:flex-none text-xs font-medium bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 hover:shadow-lg hover:shadow-brand-blue/30 transition-all duration-200 whitespace-nowrap"
                              aria-label="View interview results" title="View interview results"
                            >
                              <BarChart2 className="w-3.5 h-3.5 flex-shrink-0" />
                              Results
                            </button>
                          )}

                          {/* Track Invites — secondary */}
                          {normalizedStatus === 'published' && canInviteAIInterviews && (
                            <button
                              onClick={() => handleViewInvitations(config)}
                              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[40px] flex-1 sm:flex-none text-xs font-medium border border-gray-200 bg-white text-gray-700 rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-all duration-200 whitespace-nowrap"
                              aria-label="Track invitation status" title="Track invitation status"
                            >
                              <Users className="w-3.5 h-3.5 flex-shrink-0" />
                              <span>Invites{config.invitations_count ? ` · ${config.invitations_count}` : ''}</span>
                            </button>
                          )}

                          {/* Share — secondary, hidden on smallest screens (available via 3-dot menu) */}
                          {normalizedStatus === 'published' && canShareAIInterviews && (
                            <button
                              onClick={() => setShareConfig(config)}
                              className="hidden sm:inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[40px] text-xs font-medium border border-gray-200 bg-white text-gray-700 rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-all duration-200 whitespace-nowrap"
                            >
                              <Send className="w-3.5 h-3.5 flex-shrink-0" />
                              Share
                            </button>
                          )}

                          {/* 3-dot menu */}
                          <div className="relative flex-shrink-0 z-50" ref={openMenuId === config.id ? menuRef : undefined}>
                            <button
                              onClick={() => setOpenMenuId(openMenuId === config.id ? null : config.id)}
                              className="p-2 min-w-[40px] min-h-[40px] inline-flex items-center justify-center text-gray-500 hover:bg-slate-100 hover:text-gray-700 rounded-lg transition-colors"
                              aria-label="More actions"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                            {openMenuId === config.id && (
                              <div className="absolute right-0 top-full mt-1.5 w-52 bg-white border border-gray-100 rounded-lg shadow-xl shadow-brand-blue/10 ring-1 ring-black/[0.02] z-50 max-h-[70vh] overflow-y-auto p-1">
                                <button
                                  onClick={() => { router.push(`/recruitment/ai-interviews/${config.id}`); setOpenMenuId(null); }}
                                  className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-medium text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue rounded-lg transition-colors"
                                >
                                  <Eye className="w-4 h-4 flex-shrink-0 text-gray-400" />
                                  View Details
                                </button>
                                {config.status === 'published' && canShareAIInterviews && (
                                  <button
                                    onClick={() => handleCopyLink(config)}
                                    className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-medium text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue rounded-lg transition-colors"
                                  >
                                    <Copy className="w-4 h-4 flex-shrink-0 text-gray-400" />
                                    Copy Link
                                  </button>
                                )}
                                {config.status === 'published' && canInviteAIInterviews && (
                                  <button
                                    onClick={() => { setShareConfig(config); setOpenMenuId(null); }}
                                    className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-medium text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue rounded-lg transition-colors"
                                  >
                                    <Send className="w-4 h-4 flex-shrink-0 text-gray-400" />
                                    Share / Invite
                                  </button>
                                )}
                                {config.status === 'published' && canInviteAIInterviews && (
                                  <button
                                    onClick={() => handleViewInvitations(config)}
                                    className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-medium text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue rounded-lg transition-colors"
                                  >
                                    <Users className="w-4 h-4 flex-shrink-0 text-gray-400" />
                                    View Invitations
                                  </button>
                                )}
                                {(canArchiveAIInterviews || canDeleteAIInterviews) && (
                                  <div className="my-1 h-px bg-gray-100" />
                                )}
                                {config.status !== 'archived' && canArchiveAIInterviews && (
                                  <button
                                    onClick={() => handleArchiveConfig(config)}
                                    className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-medium text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue rounded-lg transition-colors"
                                  >
                                    <Archive className="w-4 h-4 flex-shrink-0 text-gray-400" />
                                    Archive
                                  </button>
                                )}
                                {config.status === 'archived' && canArchiveAIInterviews && (
                                  <button
                                    onClick={() => handleUnarchiveConfig(config)}
                                    className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-medium text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue rounded-lg transition-colors"
                                  >
                                    <ArchiveRestore className="w-4 h-4 flex-shrink-0 text-gray-400" />
                                    Unarchive
                                  </button>
                                )}
                                {canDeleteAIInterviews && (
                                  <button
                                    onClick={() => handleDeleteConfig(config)}
                                    disabled={!!config.invitations_count && config.invitations_count > 0}
                                    title={config.invitations_count && config.invitations_count > 0 ? 'Cannot delete — candidates have already started this interview' : ''}
                                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-medium rounded-lg ${
                                      config.invitations_count && config.invitations_count > 0
                                        ? 'text-gray-400 cursor-not-allowed opacity-60'
                                        : 'text-red-600 hover:bg-red-50'
                                    } transition-colors`}
                                  >
                                    <Trash2 className="w-4 h-4 flex-shrink-0" />
                                    Delete
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <ListPagination
                currentPage={configListPage}
                itemsPerPage={configListItemsPerPage}
                totalItems={filteredConfigs.length}
                onPageChange={setConfigListPage}
                onItemsPerPageChange={setConfigListItemsPerPage}
                itemLabel="interviews"
              />
            </div>
          )}

          {/* Processing Tab */}
          {activeTab === 'processing' && (
            <div className="p-3 sm:p-6">
              {processingLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-brand-blue" />
                </div>
              ) : processingSessions.length === 0 ? (
                <div className="text-center py-12">
                  <Play className="w-10 h-10 mx-auto mb-3 text-brand-blue/30" />
                  <p className="text-gray-500 text-sm">No interviews currently in progress</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {paginatedProcessingSessions.map((session) => (
                    <div key={session.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 border border-gray-100 ring-1 ring-black/[0.02] rounded-xl bg-white gap-2 sm:gap-3 hover:border-brand-blue/30 hover:shadow-md hover:shadow-brand-blue/10 transition-all">
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-brand-orange/10 ring-1 ring-brand-orange/20 flex items-center justify-center flex-shrink-0">
                          <Play className="w-4 h-4 sm:w-5 sm:h-5 text-brand-orange-deep" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 text-sm sm:text-base truncate">{session.candidate_name || 'Unknown'}</div>
                          <div className="text-xs sm:text-sm text-gray-500 truncate">{session.jd_title || session.position}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 sm:gap-4 flex-wrap text-xs sm:text-sm pl-10 sm:pl-0">
                        <span className="text-gray-500">{getInterviewDuration(session.duration_minutes, (session as any).special_instructions)}</span>
                        {session.started_at && (
                          <span className="text-xs text-gray-400">
                            Started {formatIST(session.started_at)}
                          </span>
                        )}
                        <span className="px-2 sm:px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-medium bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20">
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

          {/* Activity Logs Tab */}
          {activeTab === 'audit' && (
            <div className="p-3 sm:p-6">
              <AIInterviewAuditTrail />
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
              <div className="flex gap-3 sm:gap-4 mb-4 sm:mb-6 border-b border-gray-100">
                {[
                  { key: 'general', label: 'General' },
                  { key: 'proctoring', label: 'Proctoring' },
                ].map(sub => (
                  <button
                    key={sub.key}
                    onClick={() => setSettingsSubTab(sub.key as 'general' | 'proctoring')}
                    className={`pb-2 sm:pb-3 text-xs sm:text-sm border-b-2 transition-colors ${
                      settingsSubTab === sub.key
                        ? 'border-brand-blue text-brand-blue font-medium'
                        : 'border-transparent text-gray-600 hover:text-brand-blue'
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
                    <h3 className="text-gray-900 font-medium mb-4">Interview Configuration</h3>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm text-gray-700 mb-2">
                          Default Interview Duration
                        </label>
                        <select
                          value={settingsDuration}
                          onChange={(e) => setSettingsDuration(parseInt(e.target.value))}
                          className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-gray-900 bg-white"
                        >
                          <option value="30">30 minutes</option>
                          <option value="45">45 minutes</option>
                          <option value="60">60 minutes</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm text-gray-700 mb-2">
                          AI Voice Language
                        </label>
                        <select
                          value={settingsLanguage}
                          onChange={(e) => setSettingsLanguage(e.target.value)}
                          className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-gray-900 bg-white"
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
                          className="rounded border-gray-300 text-brand-blue focus:ring-brand-blue/40"
                        />
                        <label htmlFor="auto-record" className="text-sm text-gray-700">
                          Automatically record all interviews
                        </label>
                      </div>

                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id="send-reminders"
                          checked={settingsReminders}
                          onChange={(e) => setSettingsReminders(e.target.checked)}
                          className="rounded border-gray-300 text-brand-blue focus:ring-brand-blue/40"
                        />
                        <label htmlFor="send-reminders" className="text-sm text-gray-700">
                          Send reminder emails to candidates
                        </label>
                      </div>

                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id="ai-analysis"
                          checked={settingsSentiment}
                          onChange={(e) => setSettingsSentiment(e.target.checked)}
                          className="rounded border-gray-300 text-brand-blue focus:ring-brand-blue/40"
                        />
                        <label htmlFor="ai-analysis" className="text-sm text-gray-700">
                          Enable AI-powered sentiment analysis
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-gray-100">
                    <button
                      onClick={handleSaveSettings}
                      className="px-6 py-2 bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors"
                    >
                      Save Settings
                    </button>
                  </div>
                </div>
              )}

              {/* Proctoring Settings */}
              {settingsSubTab === 'proctoring' && (
                <div className="max-w-3xl space-y-6">
                  {proctoringLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-6 h-6 animate-spin text-brand-blue" />
                    </div>
                  ) : (
                    <>
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <h3 className="text-gray-900 font-medium">Proctoring Settings</h3>
                            <p className="text-sm text-gray-500 mt-1">
                              Configure security monitoring for AI interview sessions
                            </p>
                          </div>
                          <label className="flex items-center gap-3 cursor-pointer">
                            <span className="text-sm text-gray-600">Master Toggle</span>
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
                            <h4 className="text-sm font-medium text-gray-700">Security Features</h4>
                            {[
                              { key: 'webcam_monitoring', label: 'Webcam Monitoring', icon: Camera, desc: 'Monitor candidate via webcam during interview' },
                              { key: 'screen_recording', label: 'Screen Recording', icon: Monitor, desc: 'Record candidate screen during interview' },
                              { key: 'tab_switch_detection', label: 'Tab Switch Detection', icon: AlertTriangle, desc: 'Detect when candidate switches browser tabs' },
                              { key: 'copy_paste_prevention', label: 'Copy-Paste Prevention', icon: Copy, desc: 'Prevent copying and pasting during interview' },
                              { key: 'browser_lockdown', label: 'Browser Lockdown', icon: Shield, desc: 'Lock browser to interview window only' },
                              { key: 'ai_cheating_prevention', label: 'AI Cheating Prevention', icon: Brain, desc: 'Detect AI-generated responses' },
                            ].map(({ key, label, icon: Icon, desc }) => (
                              <div key={key} className="flex items-center justify-between p-2.5 sm:p-3 border border-gray-100 ring-1 ring-black/[0.02] rounded-xl bg-white gap-2 hover:border-brand-blue/30 transition-colors">
                                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                                  <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue flex-shrink-0" />
                                  <div className="min-w-0">
                                    <div className="text-xs sm:text-sm font-medium text-gray-700">{label}</div>
                                    <div className="text-[10px] sm:text-xs text-gray-500 hidden sm:block">{desc}</div>
                                  </div>
                                </div>
                                <input
                                  type="checkbox"
                                  checked={(proctoringSettings as any)[key]}
                                  onChange={(e) => setProctoringSettings(prev => ({ ...prev, [key]: e.target.checked }))}
                                  className="rounded border-gray-300 text-brand-blue focus:ring-brand-blue/40"
                                />
                              </div>
                            ))}

                            <h4 className="text-xs sm:text-sm font-medium text-gray-700 mt-4 sm:mt-6">Thresholds</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">Max Tab Switches</label>
                                <input
                                  type="number"
                                  value={proctoringSettings.max_tab_switches}
                                  onChange={(e) => setProctoringSettings(prev => ({ ...prev, max_tab_switches: parseInt(e.target.value) || 3 }))}
                                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                                  min={1}
                                  max={20}
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">Max Violations</label>
                                <input
                                  type="number"
                                  value={proctoringSettings.max_violations}
                                  onChange={(e) => setProctoringSettings(prev => ({ ...prev, max_violations: parseInt(e.target.value) || 5 }))}
                                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                                  min={1}
                                  max={50}
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">Retention (days)</label>
                                <input
                                  type="number"
                                  value={proctoringSettings.retention_days}
                                  onChange={(e) => setProctoringSettings(prev => ({ ...prev, retention_days: parseInt(e.target.value) || 90 }))}
                                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                                  min={7}
                                  max={365}
                                />
                              </div>
                            </div>

                            <h4 className="text-xs sm:text-sm font-medium text-gray-700 mt-4 sm:mt-6">Violation Risk Score Thresholds</h4>
                            <p className="text-[11px] text-gray-500 mb-2">Set the score boundaries for Low / Medium / High risk in the Violations tab. Each violation scores 1 pt (Low), 2 pts (Medium), or 3 pts (High).</p>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">
                                  Low Risk ≤ <span className="font-semibold text-green-600">{proctoringSettings.violation_low_threshold} pts</span>
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
                                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                                  min={1}
                                  max={proctoringSettings.violation_medium_threshold - 1}
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">
                                  Medium Risk ≤ <span className="font-semibold text-yellow-600">{proctoringSettings.violation_medium_threshold} pts</span>
                                </label>
                                <input
                                  type="number"
                                  value={proctoringSettings.violation_medium_threshold}
                                  onChange={(e) => {
                                    const val = Math.max(proctoringSettings.violation_low_threshold + 1, parseInt(e.target.value) || proctoringSettings.violation_low_threshold + 1);
                                    setProctoringSettings(prev => ({ ...prev, violation_medium_threshold: val }));
                                  }}
                                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                                  min={proctoringSettings.violation_low_threshold + 1}
                                />
                              </div>
                              <div className="flex flex-col justify-end pb-1">
                                <p className="text-xs text-red-600 font-medium">High Risk &gt; {proctoringSettings.violation_medium_threshold} pts</p>
                                <p className="text-[10px] text-gray-400 mt-1">Automatically calculated from Medium threshold</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="pt-6 border-t border-gray-100">
                        <button
                          onClick={handleSaveProctoringSettings}
                          className="px-6 py-2 bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors"
                        >
                          Save Proctoring Settings
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Share Modal */}
      {shareConfig && (
        <ShareAIInterviewModal
          isOpen={!!shareConfig}
          onClose={() => setShareConfig(null)}
          config={shareConfig}
          onInviteSent={() => {
            loadData();
          }}
        />
      )}

      {/* Candidate Detail Loading Overlay */}
      {candidateDetailLoading && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-white/60">
          <Loader2 className="w-8 h-8 animate-spin text-brand-blue" />
        </div>
      )}

      {/* Track Invites Modal */}
      {viewInvitationsConfig && (() => {
        // Resolve effective status — client-side expiry check in case DB hasn't been updated yet
        const resolveStatus = (inv: any): string => {
          if (['invited', 'scheduled', 'draft'].includes(inv.status) && inv.expires_at && new Date(inv.expires_at) < new Date()) {
            return 'expired';
          }
          return inv.status;
        };

        // Expired indicator — shown alongside the base status badge when the invitation
        // has passed its expiry but hasn't reached a terminal state. Covers the case
        // where a candidate started the system check but never started the interview.
        // Once a unit has been consumed (candidate actually started the interview),
        // expiry no longer applies.
        const isInvExpired = (inv: any): boolean => {
          if (['completed', 'cancelled', 'expired'].includes(inv.status)) return false;
          if (inv.unit_consumed) return false;
          return !!(inv.expires_at && new Date(inv.expires_at) < new Date());
        };

        const invTotal = invitationTotal;
        const invInvited = Math.max(0, invitationTotal - invitationSummary.completed - invitationSummary.inProgress);
        const invInProgress = invitationSummary.inProgress;
        const invCompleted = invitationSummary.completed;
        const invCancelled = Math.max(0, invitationTotal - invInvited - invInProgress - invCompleted);
        const invCompletionRate = invTotal > 0 ? Math.round((invCompleted / invTotal) * 100) : 0;
        const paginatedInvitations = invitations;

        const getInvStatusBadge = (status: string) => {
          switch (status) {
            case 'completed': return <span className="px-2 py-0.5 bg-green-100 text-green-700 ring-1 ring-green-200 rounded-full text-xs flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Completed</span>;
            case 'in_progress': return <span className="px-2 py-0.5 bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20 rounded-full text-xs flex items-center gap-1"><Play className="w-3 h-3" /> In Progress</span>;
            case 'invited': return <span className="px-2 py-0.5 bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20 rounded-full text-xs flex items-center gap-1"><Mail className="w-3 h-3" /> Invited</span>;
            case 'cancelled': return <span className="px-2 py-0.5 bg-red-100 text-red-700 ring-1 ring-red-200 rounded-full text-xs flex items-center gap-1"><X className="w-3 h-3" /> Cancelled</span>;
            case 'expired': return <span className="px-2 py-0.5 bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20 rounded-full text-xs flex items-center gap-1"><Clock className="w-3 h-3" /> Expired</span>;
            default: return <span className="px-2 py-0.5 bg-slate-100 text-gray-700 ring-1 ring-gray-200 rounded-full text-xs flex items-center gap-1"><Clock className="w-3 h-3" /> {status}</span>;
          }
        };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-3 sm:p-6">
            <div className="bg-white rounded-2xl shadow-2xl shadow-brand-blue/10 border border-gray-100 ring-1 ring-black/[0.02] w-full max-w-[95vw] lg:max-w-5xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col">
              {/* Header */}
              <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-shrink-0">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-brand-blue flex items-center justify-center flex-shrink-0 shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
                    <Users className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base sm:text-lg font-semibold text-gray-900 truncate tracking-tight">Candidate Invitations</h2>
                    <p className="text-xs sm:text-sm text-gray-500 mt-0.5 truncate">{viewInvitationsConfig.jd_title || viewInvitationsConfig.position}</p>
                  </div>
                </div>
                <button onClick={() => setViewInvitationsConfig(null)} className="p-1.5 sm:p-2 text-gray-500 hover:bg-slate-100 hover:text-gray-700 rounded-lg transition-colors flex-shrink-0" aria-label="Close">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Stats Cards */}
              <div className="px-3 sm:px-6 py-3 sm:py-4 bg-slate-50 border-b border-gray-100 flex-shrink-0">
                <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-4">
                  <div className="bg-white rounded-xl p-2 sm:p-3 border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5">
                    <div className="flex items-center gap-1.5 text-gray-500 text-[10px] sm:text-xs mb-1">
                      <Users className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
                      <span className="truncate">Total</span>
                    </div>
                    <p className="text-lg sm:text-2xl font-bold text-gray-900 tracking-tight">{invTotal}</p>
                  </div>
                  <div className="bg-white rounded-xl p-2 sm:p-3 border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5">
                    <div className="flex items-center gap-1.5 text-brand-blue text-[10px] sm:text-xs mb-1">
                      <Mail className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
                      <span className="truncate">Invited</span>
                    </div>
                    <p className="text-lg sm:text-2xl font-bold text-brand-blue tracking-tight">{invInvited}</p>
                  </div>
                  <div className="bg-white rounded-xl p-2 sm:p-3 border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5">
                    <div className="flex items-center gap-1.5 text-brand-orange-deep text-[10px] sm:text-xs mb-1">
                      <Play className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
                      <span className="truncate">In Progress</span>
                    </div>
                    <p className="text-lg sm:text-2xl font-bold text-brand-orange-deep tracking-tight">{invInProgress}</p>
                  </div>
                  <div className="bg-white rounded-xl p-2 sm:p-3 border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5">
                    <div className="flex items-center gap-1.5 text-green-600 text-[10px] sm:text-xs mb-1">
                      <CheckCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
                      <span className="truncate">Completed</span>
                    </div>
                    <p className="text-lg sm:text-2xl font-bold text-green-600 tracking-tight">{invCompleted}</p>
                  </div>
                  <div className="bg-white rounded-xl p-2 sm:p-3 border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5">
                    <div className="flex items-center gap-1.5 text-red-600 text-[10px] sm:text-xs mb-1">
                      <X className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
                      <span className="truncate">Cancelled</span>
                    </div>
                    <p className="text-lg sm:text-2xl font-bold text-red-600 tracking-tight">{invCancelled}</p>
                  </div>
                  <div className="bg-white rounded-xl p-2 sm:p-3 border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5">
                    <div className="flex items-center gap-1.5 text-brand-cyan text-[10px] sm:text-xs mb-1">
                      <TrendingUp className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
                      <span className="truncate">Completion</span>
                    </div>
                    <p className="text-lg sm:text-2xl font-bold text-brand-cyan tracking-tight">{invCompletionRate}%</p>
                  </div>
                </div>
              </div>

              {/* Candidate List */}
              <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-3 sm:py-4 min-h-0">
                {loadingInvitations ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-brand-blue" />
                  </div>
                ) : invitations.length === 0 ? (
                  <div className="text-center py-12">
                    <Users className="w-10 h-10 mx-auto mb-3 text-brand-blue/30" />
                    <p className="text-gray-500 mb-2 text-sm">No candidates invited yet</p>
                    <p className="text-xs sm:text-sm text-gray-400">Use the &quot;Send via Email&quot; button to invite candidates</p>
                  </div>
                ) : (
                  <div className="space-y-2 sm:space-y-3">
                    {paginatedInvitations.map((inv) => (
                      <div key={inv.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 border border-gray-100 ring-1 ring-black/[0.02] rounded-xl bg-white hover:border-brand-blue/30 hover:shadow-md hover:shadow-brand-blue/10 transition-all gap-2 sm:gap-3">
                        {/* Candidate info */}
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs sm:text-sm font-medium text-brand-blue">
                              {(inv.candidate_name || '?').split(' ').map(n => n[0]).join('').slice(0, 2)}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-gray-900 text-sm truncate">{inv.candidate_name || 'Unknown'}</div>
                            <div className="text-xs text-gray-500 truncate">{inv.candidate_email}</div>
                          </div>
                        </div>

                        {/* Status + Score + Timeline */}
                        <div className="flex items-center gap-3 sm:gap-4 flex-wrap pl-10 sm:pl-0">
                          {/* Status badge */}
                          {getInvStatusBadge(inv.status)}
                          {isInvExpired(inv) && (
                            <span className="px-2 py-0.5 bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20 rounded-full text-xs flex items-center gap-1">
                              <Clock className="w-3 h-3" /> Expired
                            </span>
                          )}

                          {/* Score — prefer ai_evaluation.capability_score (matches evaluation page) */}
                          {(() => {
                            const capScore = inv.ai_evaluation?.capability_score;
                            const displayScore = capScore != null ? capScore : inv.score;
                            if (displayScore == null) return null;
                            return (
                              <div className="text-right">
                                <div className="text-[10px] text-gray-500">Score</div>
                                <div className="text-sm font-semibold text-green-600">{Number(displayScore)}%</div>
                              </div>
                            );
                          })()}

                          {/* Timeline */}
                          <div className="hidden sm:flex items-center gap-3 text-[10px] text-gray-400">
                            {inv.created_at && (
                              <span className="flex items-center gap-1" title="Invited">
                                <Mail className="w-3 h-3 text-brand-blue" />
                                {formatIST(inv.created_at)}
                              </span>
                            )}
                            {inv.started_at && (
                              <span className="flex items-center gap-1" title="Started">
                                <Play className="w-3 h-3 text-brand-orange" />
                                {formatIST(inv.started_at)}
                              </span>
                            )}
                            {inv.completed_at && (
                              <span className="flex items-center gap-1" title="Completed">
                                <CheckCircle className="w-3 h-3 text-green-500" />
                                {formatIST(inv.completed_at)}
                              </span>
                            )}
                          </div>

                          {/* Copy Link — available while session is still active */}
                          {inv.interview_token && !['completed', 'cancelled', 'expired'].includes(resolveStatus(inv)) && !isInvExpired(inv) && (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                const link = `${window.location.origin}/ai-interview/${inv.interview_token}`;
                                await navigator.clipboard.writeText(link);
                                toast.success('Interview link copied!');
                              }}
                              title="Copy interview link"
                              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-gray-200 bg-white text-gray-700 rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors"
                            >
                              <Copy className="w-3 h-3" />
                              Copy Link
                            </button>
                          )}

                          {/* Resend Email — only for invited AND not yet started/completed. Regenerates token. */}
                          {resolveStatus(inv) === 'invited' && !inv.started_at && !inv.completed_at && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setResendInviteTarget(inv);
                              }}
                              disabled={resendingEmailFor === inv.id}
                              aria-label="Revoke old link and send a new invitation" title="Revoke old link and send a new invitation"
                              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-brand-blue bg-brand-blue/5 ring-1 ring-brand-blue/20 rounded-lg hover:bg-brand-blue/10 transition-colors disabled:opacity-50"
                            >
                              {resendingEmailFor === inv.id
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : <Mail className="w-3 h-3" />
                              }
                              Resend Email
                            </button>
                          )}

                          {/* View Details button */}
                          {(inv.status === 'completed' || inv.status === 'in_progress') && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleViewCandidateDetail(inv.id); }}
                              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-gray-200 bg-white text-gray-700 rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors"
                            >
                              <Eye className="w-3 h-3" />
                              View Details
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {invitationTotalPages > 1 && (
                      <div className="flex items-center justify-between pt-2">
                        <div className="text-sm text-gray-500">
                          Showing {((invitationPage - 1) * INVITATION_PAGE_SIZE) + 1}–{Math.min(invitationPage * INVITATION_PAGE_SIZE, invitationTotal)} of {invitationTotal}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setInvitationPage((p) => Math.max(1, p - 1))}
                            disabled={invitationPage === 1}
                            className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <span className="text-sm text-brand-blue font-semibold px-2">
                            {invitationPage} / {invitationTotalPages}
                          </span>
                          <button
                            onClick={() => setInvitationPage((p) => Math.min(invitationTotalPages, p + 1))}
                            disabled={invitationPage === invitationTotalPages}
                            className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="border-t border-gray-100 bg-slate-50/60 px-3 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3 flex-shrink-0">
                <span className="text-xs sm:text-sm text-gray-500">
                  {invitationTotal} candidate{invitationTotal !== 1 ? 's' : ''} invited
                </span>
                <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
                  <button
                    onClick={() => {
                      setViewInvitationsConfig(null);
                      setShareConfig(viewInvitationsConfig);
                    }}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors"
                  >
                    <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                    Invite More
                  </button>
                  <button
                    onClick={() => setViewInvitationsConfig(null)}
                    className="flex-1 sm:flex-none px-3 sm:px-4 py-2 text-xs sm:text-sm border border-gray-200 bg-white text-gray-700 rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Confirmation Dialog */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-4 sm:p-6">
          <div className="bg-white rounded-2xl shadow-2xl shadow-brand-blue/10 border border-gray-100 ring-1 ring-black/[0.02] w-full max-w-[95vw] sm:max-w-md p-5 sm:p-6 max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2 tracking-tight">{confirmAction.title}</h3>
            <p className="text-xs sm:text-sm text-gray-600 mb-4 sm:mb-6">{confirmAction.message}</p>
            <div className="flex items-center justify-end gap-2 sm:gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="px-3 sm:px-4 py-2 text-xs sm:text-sm border border-gray-200 bg-white text-gray-700 rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmAction.onConfirm}
                className={`px-3 sm:px-4 py-2 text-xs sm:text-sm text-white rounded-lg transition-colors shadow-md ring-1 ring-white/10 ${
                  confirmAction.destructive
                    ? 'bg-red-600 hover:bg-red-700 shadow-red-600/25'
                    : 'bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue shadow-brand-blue/25'
                }`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {showPublishedModal && (
        <div className="fixed inset-0 z-[60] bg-gray-900/50 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl shadow-brand-blue/10 border border-gray-100 ring-1 ring-black/[0.02] p-6 text-center max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <div className="relative inline-flex items-center justify-center mb-4">
              <span className="absolute w-2 h-2 rounded-full bg-green-400 animate-ping" style={{ top: -4, left: 10 }} />
              <span className="absolute w-1.5 h-1.5 rounded-full bg-brand-blue/60 animate-ping" style={{ top: 8, right: -2, animationDelay: '0.2s' }} />
              <span className="absolute w-2 h-2 rounded-full bg-brand-cyan/60 animate-ping" style={{ bottom: 0, left: -2, animationDelay: '0.4s' }} />
              <div className="w-16 h-16 bg-green-100 ring-1 ring-green-200 rounded-full flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2 tracking-tight">AI Interview Published</h2>
            <p className="text-sm text-gray-500 mb-4">
              Redirected successfully. This message will close in 3 seconds.
            </p>
            <div className="bg-gradient-to-br from-brand-blue/5 via-white to-brand-cyan/5 rounded-xl border border-brand-blue/15 ring-1 ring-brand-blue/10 px-4 py-3 text-left">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-gray-500">Position</span>
                <span className="text-sm font-medium text-brand-blue text-right">{publishedTitle}</span>
              </div>
            </div>
          </div>
        </div>
      )}

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
            // refresh invitations list so the new expires_at is reflected
            if (viewInvitationsConfig) {
              await loadInvitations(viewInvitationsConfig.id, invitationPage);
            }
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
        variant="warning"
      >
        {resendInviteTarget && (() => {
          const createdMs = resendInviteTarget.created_at ? new Date(resendInviteTarget.created_at).getTime() : NaN;
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
    </div>
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
        <p className="text-gray-500">Consent logs module not available</p>
      </div>
    );
  }

  if (!ConsentLogs) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-brand-blue" />
      </div>
    );
  }

  return <ConsentLogs compact defaultFeature="AI Interview" />;
}
