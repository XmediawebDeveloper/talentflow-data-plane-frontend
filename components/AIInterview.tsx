'use client';

import { Video, Calendar, Users, CheckCircle, MoreVertical, Settings, TrendingUp, Clock, FileText, Copy, X, Loader2, Send, Mail, Briefcase, Globe, Brain, MessageSquare, Shield, Lightbulb, Eye, Trash2, Play, Pause, Zap, Archive, ArchiveRestore, GitBranch, Activity, ScrollText, Camera, Monitor, AlertTriangle, Pencil } from 'lucide-react';
import { useState, useEffect, useRef, useCallback, type ComponentType } from 'react';
import { useRouter } from 'next/navigation';
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

export default function AIInterview() {
  const router = useRouter();
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

  // Sync quota from shared QuotaContext (AIU = AI Interview Units)
  useEffect(() => {
    const quotas = quotaData?.quotas;
    if (!quotas?.AIU) return;
    const sub = quotas.AIU.subscription || {};
    const addon = quotas.AIU.addon || {};
    const subLimit = sub.limit;
    const used = sub.used || 0;
    const addonPurchased = typeof addon.total_purchased === 'number' ? addon.total_purchased : 0;
    const addonConsumed = typeof addon.total_consumed === 'number' ? addon.total_consumed : 0;
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
        aiInterviewService.listConfigs({ page_size: 100 }),
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
      const result = await aiInterviewService.listConfigs({ status: 'archived', page_size: 100 });
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
      const result = await aiInterviewService.list({ status: 'in_progress', page_size: 100 });
      setProcessingSessions(result.items);
    } catch (error) {
      console.error('Failed to load processing sessions:', error);
    } finally {
      setProcessingLoading(false);
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
    if (activeTab === 'settings') {
      loadSettings();
      if (settingsSubTab === 'proctoring') loadProctoringSettings();
    }
    if (activeTab === 'archived') loadArchivedConfigs();
    if (activeTab === 'audit') loadAuditTrail();
    if (activeTab === 'processing') loadProcessingSessions();
  }, [activeTab, loadSettings, loadArchivedConfigs, loadAuditTrail, loadProcessingSessions, settingsSubTab, loadProctoringSettings, auditCategory, auditPage]);

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
          toast.error('Failed to delete configuration');
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
    setLoadingInvitations(true);
    try {
      const result = await aiInterviewService.getConfigInvitations(config.id);
      setInvitations(result.items);
    } catch (error) {
      console.error('Failed to load invitations:', error);
      toast.error('Failed to load invitations');
    } finally {
      setLoadingInvitations(false);
    }
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
        recording_retention_days: proctoringSettings.retention_days,
      });
      toast.success('Proctoring settings saved!');
    } catch (error) {
      console.error('Failed to save proctoring settings:', error);
      toast.error('Failed to save proctoring settings');
    }
  };

  // Filter configs by tab
  const filteredConfigs = (() => {
    if (activeTab === 'archived') return archivedConfigs;
    return configs.filter((config) => {
      if (activeTab === 'all') return true;
      if (activeTab === 'published') return config.status === 'published';
      if (activeTab === 'draft') return config.status === 'draft';
      if (activeTab === 'completed') return config.status === 'completed' || config.status === 'cancelled';
      return true;
    });
  })();

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'published':
        return 'bg-green-100 text-green-700';
      case 'draft':
        return 'bg-gray-100 text-gray-600';
      case 'completed':
        return 'bg-blue-100 text-blue-700';
      case 'cancelled':
        return 'bg-red-100 text-red-700';
      case 'archived':
        return 'bg-orange-100 text-orange-700';
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-700';
      case 'invited':
        return 'bg-purple-100 text-purple-700';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'published': return 'Active';
      case 'draft': return 'Draft';
      case 'completed': return 'Completed';
      case 'cancelled': return 'Cancelled';
      case 'archived': return 'Archived';
      case 'in_progress': return 'In Progress';
      case 'invited': return 'Invited';
      default: return status;
    }
  };

  const isConfigListTab = ['all', 'published', 'draft', 'completed', 'archived'].includes(activeTab);

  // Candidate detail view from Track Invites modal
  if (candidateDetailFromModal) {
    return <CandidateResultsView interview={candidateDetailFromModal} onBack={() => setCandidateDetailFromModal(null)} />;
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center overflow-y-auto">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
          <p className="text-sm text-gray-500">Loading AI interviews...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
      <div className="w-full">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
          <div>
            <h1 className="text-lg sm:text-xl lg:text-2xl font-semibold text-gray-900 mb-1 sm:mb-2">AI Interview Platform</h1>
            <p className="text-xs sm:text-sm text-gray-600">
              Configure and manage AI-powered interview sessions
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            {/* AI Interview Quota Badge */}
            {totalUnits > 0 && (
              <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 shadow-sm ${
                isUnlimited
                  ? 'bg-gray-100 border-gray-300'
                  : availableUnits !== null && availableUnits <= 0
                  ? 'bg-red-50 border-red-300'
                  : availableUnits !== null && availableUnits <= 2
                  ? 'bg-gray-100 border-gray-300'
                  : 'bg-gray-50 border-gray-200'
              }`}>
                <Zap className={`w-4 h-4 ${
                  isUnlimited
                    ? 'text-gray-700'
                    : availableUnits !== null && availableUnits <= 0
                    ? 'text-red-600'
                    : availableUnits !== null && availableUnits <= 2
                    ? 'text-gray-700'
                    : 'text-gray-600'
                }`} />
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500 font-medium">Interview Quota</span>
                  <div className="flex items-center gap-1">
                    {isUnlimited ? (
                      <span className="text-sm font-bold text-gray-800">Unlimited</span>
                    ) : availableUnits !== null ? (
                      <>
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
            {canCreateAIInterviews && (
              <button
                onClick={() => router.push('/recruitment/ai-interviews/jd-selection')}
                className="flex items-center gap-2 bg-gray-800 text-white px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg hover:bg-gray-900 transition-colors text-xs sm:text-sm"
              >
                <Settings className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                <span className="hidden sm:inline">Create AI Interview</span>
                <span className="sm:hidden">Create AI Interview</span>
              </button>
            )}
          </div>
        </div>

        {/* AI-Powered Interviews Banner */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6">
          <div className="flex items-start gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0">
              <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-gray-700" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs sm:text-sm font-medium text-gray-900 mb-1">AI-Powered Interviews</h3>
              <p className="text-xs sm:text-sm text-gray-600">
                Create multi-round AI interview configurations linked to job descriptions. AI conducts HR, Technical, and Behavioral rounds with auto-suggested topics. Track candidate performance, round-wise scores, and weighted evaluations.
              </p>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 lg:gap-6 mb-4 sm:mb-6">
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 sm:p-6">
            <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-gray-800" />
              </div>
              <span className="text-xs sm:text-sm text-gray-500">Total Configs</span>
            </div>
            <div className="text-xl sm:text-3xl text-gray-900">{stats?.total_configs ?? 0}</div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 sm:p-6">
            <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                <Globe className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
              </div>
              <span className="text-xs sm:text-sm text-gray-500">Published</span>
            </div>
            <div className="text-xl sm:text-3xl text-gray-900">{stats?.published_configs ?? 0}</div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 sm:p-6">
            <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                <Users className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
              </div>
              <span className="text-xs sm:text-sm text-gray-500">Invited</span>
            </div>
            <div className="text-xl sm:text-3xl text-gray-900">{stats?.candidates_invited ?? 0}</div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 sm:p-6">
            <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-yellow-100 flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-600" />
              </div>
              <span className="text-xs sm:text-sm text-gray-500">Avg. Score</span>
            </div>
            <div className="text-xl sm:text-3xl text-gray-900">{stats?.average_score != null ? `${stats.average_score}%` : '-'}</div>
          </div>
        </div>

        {/* Main Content */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          {/* Tabs */}
          <div className="border-b border-gray-200 px-3 sm:px-6">
            <div className="flex gap-2 sm:gap-4 overflow-x-auto scrollbar-hide">
              {[
                { key: 'all', label: 'All Configurations' },
                { key: 'published', label: 'Published' },
                { key: 'draft', label: 'Draft' },
                // { key: 'completed', label: 'Completed' },
                // { key: 'archived', label: 'Archived' },
                // { key: 'processing', label: 'Processing' },
                { key: 'audit', label: 'Activity Logs' },
                { key: 'consent', label: 'Consent Logs' },
                // { key: 'settings', label: 'Settings' },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as TabKey)}
                  className={`py-3 sm:py-4 text-xs sm:text-sm border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === tab.key
                      ? 'border-gray-800 text-gray-800 font-medium'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Config List (for config-listing tabs) */}
          {isConfigListTab && (
            <div className="p-3 sm:p-6">
              {filteredConfigs.length === 0 ? (
                <div className="text-center py-16">
                  <Briefcase className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p className="text-gray-500 mb-2">
                    {activeTab === 'archived' ? 'No archived configurations' : 'No AI interview configurations found'}
                  </p>
                  {activeTab !== 'archived' && (
                    <>
                      <p className="text-sm text-gray-400 mb-4">Create your first configuration to get started</p>
                      {canCreateAIInterviews && (
                        <button
                          onClick={() => router.push('/recruitment/ai-interviews/jd-selection')}
                          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors"
                        >
                          <Settings className="w-4 h-4" />
                          Create AI Interview
                        </button>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredConfigs.map((config) => {
                    const enabledRounds = config.rounds_config
                      ? config.rounds_config.filter((r: any) => r.enabled !== false)
                      : [];

                    return (
                      <div
                        key={config.id}
                        onClick={() => router.push(`/recruitment/ai-interviews/${config.id}`)}
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-5 border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-md transition-all cursor-pointer gap-3"
                      >
                        <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
                          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                            <Video className="w-5 h-5 sm:w-6 sm:h-6 text-gray-600" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              {config.display_id && (
                                <span className="px-2 py-0.5 text-xs font-mono font-semibold bg-gray-900 text-white rounded">
                                  {config.display_id}
                                </span>
                              )}
                              <h3 className="font-medium text-gray-900">
                                {config.jd_title || config.position || 'Untitled'}
                              </h3>
                              {config.jd_version && (
                                <span className="px-1.5 py-0.5 text-[10px] bg-gray-100 text-gray-500 rounded">
                                  v{config.jd_version}
                                </span>
                              )}
                              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(config.status)}`}>
                                {getStatusLabel(config.status)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm text-gray-500 flex-wrap">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
                                {config.duration_minutes} min
                              </span>
                              {enabledRounds.length > 0 && (
                                <>
                                  <span>{enabledRounds.length} rounds</span>
                                  <span className="text-[10px] sm:text-xs text-gray-400 hidden sm:inline">
                                    {enabledRounds.map((r: any) => ROUND_LABELS[r.type] || r.type).join(', ')}
                                  </span>
                                </>
                              )}
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5" />
                                {formatIST(config.created_at)}
                              </span>
                              {config.created_by_name && (
                                <span className="text-xs text-gray-400">
                                  by {config.created_by_name}
                                </span>
                              )}
                            </div>
                            {config.jd_must_have_skills && config.jd_must_have_skills.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {config.jd_must_have_skills.slice(0, 4).map((skill: string) => (
                                  <span key={skill} className="px-2 py-0.5 bg-gray-50 text-gray-500 text-xs rounded-full border border-gray-200">
                                    {skill}
                                  </span>
                                ))}
                                {config.jd_must_have_skills.length > 4 && (
                                  <span className="text-xs text-gray-400">+{config.jd_must_have_skills.length - 4} more</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 sm:gap-3 flex-wrap sm:flex-nowrap" onClick={(e) => e.stopPropagation()}>
                          {/* Share Link button for published configs */}
                          {config.status === 'published' && canShareAIInterviews && (
                            <button
                              onClick={() => setShareConfig(config)}
                              className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm bg-gray-800 text-white rounded-md hover:bg-gray-900 transition-colors"
                            >
                              <Mail className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                              <span className="hidden sm:inline">Send via Email</span>
                              <span className="sm:hidden">Email</span>
                            </button>
                          )}

                          {/* Edit / Continue Editing button — draft only */}
                          {config.status === 'draft' && config.jd_id && canUpdateAIInterviews && (
                            <button
                              onClick={() => router.push(`/recruitment/ai-interviews/jd-selection/ai-interview-config?jd_id=${config.jd_id}&config_id=${config.id}`)}
                              className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm bg-gray-800 text-white rounded-md hover:bg-gray-900 transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                              {config.status === 'draft' ? 'Edit' : 'Edit'}
                            </button>
                          )}

                          {/* Publish button for draft configs */}
                          {config.status === 'draft' && canPublishAIInterviews && (
                            <button
                              onClick={() => handlePublishConfig(config)}
                              className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                            >
                              <Globe className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                              Publish
                            </button>
                          )}

                          {/* Track Invites for published */}
                          {config.status === 'published' && canInviteAIInterviews && (
                            <button
                              onClick={() => handleViewInvitations(config)}
                              className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm bg-gray-700 text-white rounded-md hover:bg-gray-800 transition-colors"
                              title="Track invitation status"
                            >
                              <Mail className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                              <span className="hidden xl:inline">Track Invites</span>
                              <span className="xl:hidden">Track</span>
                            </button>
                          )}

                          {/* 3-dot menu */}
                          <div className="relative" ref={openMenuId === config.id ? menuRef : undefined}>
                            <button
                              onClick={() => setOpenMenuId(openMenuId === config.id ? null : config.id)}
                              className="p-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                            >
                              <MoreVertical className="w-5 h-5" />
                            </button>
                            {openMenuId === config.id && (
                              <div className="absolute right-0 top-full mt-1 w-44 sm:w-52 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-[70vh] overflow-y-auto">
                                <button
                                  onClick={() => { router.push(`/recruitment/ai-interviews/${config.id}`); setOpenMenuId(null); }}
                                  className="w-full flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                >
                                  <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                                  View Details
                                </button>
                                {config.status === 'draft' && config.jd_id && canUpdateAIInterviews && (
                                  <button
                                    onClick={() => { router.push(`/recruitment/ai-interviews/jd-selection/ai-interview-config?jd_id=${config.jd_id}&config_id=${config.id}`); setOpenMenuId(null); }}
                                    className="w-full flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                  >
                                    <Pencil className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                                    Continue Editing
                                  </button>
                                )}
                                {config.status === 'published' && canShareAIInterviews && (
                                  <button
                                    onClick={() => handleCopyLink(config)}
                                    className="w-full flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                  >
                                    <Copy className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                                    Copy Link
                                  </button>
                                )}
                                {config.status === 'published' && canInviteAIInterviews && (
                                  <button
                                    onClick={() => { setShareConfig(config); setOpenMenuId(null); }}
                                    className="w-full flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                  >
                                    <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                                    Share / Invite
                                  </button>
                                )}
                                {config.status === 'published' && canInviteAIInterviews && (
                                  <button
                                    onClick={() => handleViewInvitations(config)}
                                    className="w-full flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                  >
                                    <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                                    View Invitations
                                  </button>
                                )}
                                {config.status === 'draft' && canPublishAIInterviews && (
                                  <button
                                    onClick={() => handlePublishConfig(config)}
                                    className="w-full flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                  >
                                    <Globe className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                                    Publish
                                  </button>
                                )}
                                {canCreateAIInterviews && (
                                  <button
                                    onClick={() => handleCloneConfig(config)}
                                    className="w-full flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                  >
                                    <GitBranch className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                                    Duplicate
                                  </button>
                                )}
                                {config.status !== 'archived' && canArchiveAIInterviews && (
                                  <button
                                    onClick={() => handleArchiveConfig(config)}
                                    className="w-full flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                  >
                                    <Archive className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                                    Archive
                                  </button>
                                )}
                                {config.status === 'archived' && canArchiveAIInterviews && (
                                  <button
                                    onClick={() => handleUnarchiveConfig(config)}
                                    className="w-full flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                  >
                                    <ArchiveRestore className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                                    Unarchive
                                  </button>
                                )}
                                {canDeleteAIInterviews && (
                                  <button
                                    onClick={() => handleDeleteConfig(config)}
                                    className="w-full flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm text-red-600 hover:bg-red-50 transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
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
            </div>
          )}

          {/* Processing Tab */}
          {activeTab === 'processing' && (
            <div className="p-3 sm:p-6">
              {processingLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : processingSessions.length === 0 ? (
                <div className="text-center py-12">
                  <Play className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                  <p className="text-gray-500 text-sm">No interviews currently in progress</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {processingSessions.map((session) => (
                    <div key={session.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 border border-gray-200 rounded-lg gap-2 sm:gap-3">
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0">
                          <Play className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-600" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 text-sm sm:text-base truncate">{session.candidate_name || 'Unknown'}</div>
                          <div className="text-xs sm:text-sm text-gray-500 truncate">{session.jd_title || session.position}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 sm:gap-4 flex-wrap text-xs sm:text-sm pl-10 sm:pl-0">
                        <span className="text-gray-500">{session.duration_minutes} min</span>
                        {session.started_at && (
                          <span className="text-xs text-gray-400">
                            Started {formatIST(session.started_at)}
                          </span>
                        )}
                        <span className="px-2 sm:px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-medium bg-yellow-100 text-yellow-700">
                          In Progress
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
              <div className="flex gap-3 sm:gap-4 mb-4 sm:mb-6 border-b border-gray-200">
                {[
                  { key: 'general', label: 'General' },
                  { key: 'proctoring', label: 'Proctoring' },
                ].map(sub => (
                  <button
                    key={sub.key}
                    onClick={() => setSettingsSubTab(sub.key as 'general' | 'proctoring')}
                    className={`pb-2 sm:pb-3 text-xs sm:text-sm border-b-2 transition-colors ${
                      settingsSubTab === sub.key
                        ? 'border-gray-800 text-gray-800 font-medium'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
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
                          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 text-black"
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
                          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 text-black"
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
                          className="rounded border-gray-300 text-gray-800 focus:ring-gray-600"
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
                          className="rounded border-gray-300 text-gray-800 focus:ring-gray-600"
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
                          className="rounded border-gray-300 text-gray-800 focus:ring-gray-600"
                        />
                        <label htmlFor="ai-analysis" className="text-sm text-gray-700">
                          Enable AI-powered sentiment analysis
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-gray-200">
                    <button
                      onClick={handleSaveSettings}
                      className="px-6 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-900 transition-colors"
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
                      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
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
                              <div className={`w-11 h-6 rounded-full transition-colors ${proctoringEnabled ? 'bg-gray-800' : 'bg-gray-300'}`}>
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
                              <div key={key} className="flex items-center justify-between p-2.5 sm:p-3 border border-gray-200 rounded-lg gap-2">
                                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                                  <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500 flex-shrink-0" />
                                  <div className="min-w-0">
                                    <div className="text-xs sm:text-sm font-medium text-gray-700">{label}</div>
                                    <div className="text-[10px] sm:text-xs text-gray-500 hidden sm:block">{desc}</div>
                                  </div>
                                </div>
                                <input
                                  type="checkbox"
                                  checked={(proctoringSettings as any)[key]}
                                  onChange={(e) => setProctoringSettings(prev => ({ ...prev, [key]: e.target.checked }))}
                                  className="rounded border-gray-300 text-gray-800 focus:ring-gray-600"
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
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-black"
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
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-black"
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
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-black"
                                  min={7}
                                  max={365}
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="pt-6 border-t border-gray-200">
                        <button
                          onClick={handleSaveProctoringSettings}
                          className="px-6 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-900 transition-colors"
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
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      )}

      {/* Track Invites Modal */}
      {viewInvitationsConfig && (() => {
        const invTotal = invitations.length;
        const invInvited = invitations.filter(i => i.status === 'invited').length;
        const invInProgress = invitations.filter(i => i.status === 'in_progress').length;
        const invCompleted = invitations.filter(i => i.status === 'completed').length;
        const invCancelled = invitations.filter(i => ['cancelled', 'expired'].includes(i.status)).length;
        const invCompletionRate = invTotal > 0 ? Math.round((invCompleted / invTotal) * 100) : 0;

        const getInvStatusBadge = (status: string) => {
          switch (status) {
            case 'completed': return <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Completed</span>;
            case 'in_progress': return <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs flex items-center gap-1"><Play className="w-3 h-3" /> In Progress</span>;
            case 'invited': return <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs flex items-center gap-1"><Mail className="w-3 h-3" /> Invited</span>;
            case 'cancelled': return <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs flex items-center gap-1"><X className="w-3 h-3" /> Cancelled</span>;
            case 'expired': return <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs flex items-center gap-1"><Clock className="w-3 h-3" /> Expired</span>;
            default: return <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs flex items-center gap-1"><Clock className="w-3 h-3" /> {status}</span>;
          }
        };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-[95vw] lg:max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
              {/* Header */}
              <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 flex-shrink-0" />
                    <h2 className="text-base sm:text-lg font-semibold text-gray-900 truncate">Candidate Invitations</h2>
                  </div>
                  <p className="text-xs sm:text-sm text-gray-500 mt-0.5 truncate">{viewInvitationsConfig.jd_title || viewInvitationsConfig.position}</p>
                </div>
                <button onClick={() => setViewInvitationsConfig(null)} className="p-1.5 sm:p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Stats Cards */}
              <div className="px-3 sm:px-6 py-3 sm:py-4 bg-gray-50 border-b border-gray-200 flex-shrink-0">
                <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-4">
                  <div className="bg-white rounded-lg p-2 sm:p-3 border border-gray-200">
                    <div className="flex items-center gap-1.5 text-gray-500 text-[10px] sm:text-xs mb-1">
                      <Users className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
                      <span className="truncate">Total</span>
                    </div>
                    <p className="text-lg sm:text-2xl font-bold text-gray-900">{invTotal}</p>
                  </div>
                  <div className="bg-white rounded-lg p-2 sm:p-3 border border-gray-200">
                    <div className="flex items-center gap-1.5 text-blue-600 text-[10px] sm:text-xs mb-1">
                      <Mail className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
                      <span className="truncate">Invited</span>
                    </div>
                    <p className="text-lg sm:text-2xl font-bold text-blue-600">{invInvited}</p>
                  </div>
                  <div className="bg-white rounded-lg p-2 sm:p-3 border border-gray-200">
                    <div className="flex items-center gap-1.5 text-yellow-600 text-[10px] sm:text-xs mb-1">
                      <Play className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
                      <span className="truncate">In Progress</span>
                    </div>
                    <p className="text-lg sm:text-2xl font-bold text-yellow-600">{invInProgress}</p>
                  </div>
                  <div className="bg-white rounded-lg p-2 sm:p-3 border border-gray-200">
                    <div className="flex items-center gap-1.5 text-green-600 text-[10px] sm:text-xs mb-1">
                      <CheckCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
                      <span className="truncate">Completed</span>
                    </div>
                    <p className="text-lg sm:text-2xl font-bold text-green-600">{invCompleted}</p>
                  </div>
                  <div className="bg-white rounded-lg p-2 sm:p-3 border border-gray-200">
                    <div className="flex items-center gap-1.5 text-red-600 text-[10px] sm:text-xs mb-1">
                      <X className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
                      <span className="truncate">Cancelled</span>
                    </div>
                    <p className="text-lg sm:text-2xl font-bold text-red-600">{invCancelled}</p>
                  </div>
                  <div className="bg-white rounded-lg p-2 sm:p-3 border border-gray-200">
                    <div className="flex items-center gap-1.5 text-gray-600 text-[10px] sm:text-xs mb-1">
                      <TrendingUp className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
                      <span className="truncate">Completion</span>
                    </div>
                    <p className="text-lg sm:text-2xl font-bold text-gray-700">{invCompletionRate}%</p>
                  </div>
                </div>
              </div>

              {/* Candidate List */}
              <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-3 sm:py-4 min-h-0">
                {loadingInvitations ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                  </div>
                ) : invitations.length === 0 ? (
                  <div className="text-center py-12">
                    <Users className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                    <p className="text-gray-500 mb-2 text-sm">No candidates invited yet</p>
                    <p className="text-xs sm:text-sm text-gray-400">Use the &quot;Send via Email&quot; button to invite candidates</p>
                  </div>
                ) : (
                  <div className="space-y-2 sm:space-y-3">
                    {invitations.map((inv) => (
                      <div key={inv.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors gap-2 sm:gap-3">
                        {/* Candidate info */}
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs sm:text-sm font-medium text-gray-700">
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

                          {/* Score */}
                          {inv.score != null && (
                            <div className="text-right">
                              <div className="text-[10px] text-gray-500">Score</div>
                              <div className="text-sm font-semibold text-green-600">{Number(inv.score)}%</div>
                            </div>
                          )}

                          {/* Timeline */}
                          <div className="hidden sm:flex items-center gap-3 text-[10px] text-gray-400">
                            {inv.created_at && (
                              <span className="flex items-center gap-1" title="Invited">
                                <Mail className="w-3 h-3 text-blue-400" />
                                {formatIST(inv.created_at)}
                              </span>
                            )}
                            {inv.started_at && (
                              <span className="flex items-center gap-1" title="Started">
                                <Play className="w-3 h-3 text-yellow-500" />
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

                          {/* View Details button */}
                          {(inv.status === 'completed' || inv.status === 'in_progress') && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleViewCandidateDetail(inv.id); }}
                              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                            >
                              <Eye className="w-3 h-3" />
                              View Details
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="border-t border-gray-200 px-3 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3 flex-shrink-0">
                <span className="text-xs sm:text-sm text-gray-500">
                  {invitations.length} candidate{invitations.length !== 1 ? 's' : ''} invited
                </span>
                <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
                  <button
                    onClick={() => {
                      setViewInvitationsConfig(null);
                      setShareConfig(viewInvitationsConfig);
                    }}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm bg-gray-800 text-white rounded-md hover:bg-gray-900 transition-colors"
                  >
                    <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                    Invite More
                  </button>
                  <button
                    onClick={() => setViewInvitationsConfig(null)}
                    className="flex-1 sm:flex-none px-3 sm:px-4 py-2 text-xs sm:text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-[95vw] sm:max-w-md p-4 sm:p-6">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">{confirmAction.title}</h3>
            <p className="text-xs sm:text-sm text-gray-600 mb-4 sm:mb-6">{confirmAction.message}</p>
            <div className="flex items-center justify-end gap-2 sm:gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="px-3 sm:px-4 py-2 text-xs sm:text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmAction.onConfirm}
                className={`px-3 sm:px-4 py-2 text-xs sm:text-sm text-white rounded-md transition-colors ${
                  confirmAction.destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-800 hover:bg-gray-900'
                }`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Wrapper component that lazy-loads ConsentLogs
 */
function ConsentLogsWrapper() {
  const [ConsentLogs, setConsentLogs] = useState<ComponentType<{ compact?: boolean }> | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    import('@/components/compliance/ConsentLogs')
      .then((mod) => setConsentLogs(() => mod.default))
      .catch(() => setLoadError(true));
  }, []);

  if (loadError) {
    return (
      <div className="text-center py-12">
        <ScrollText className="w-10 h-10 mx-auto mb-3 text-gray-300" />
        <p className="text-gray-500">Consent logs module not available</p>
      </div>
    );
  }

  if (!ConsentLogs) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return <ConsentLogs compact defaultFeature="AI Interview" />;
}
