'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import {
  ArrowLeft, ChevronLeft, Video, Clock, Users, Calendar, CheckCircle, Play, Mail,
  XCircle, Copy, Trash2, Archive, ArchiveRestore, GitBranch, Eye,
  Loader2, RefreshCw, Briefcase, Globe, ChevronRight, Brain, Sparkles,
  ExternalLink, Layers, Pencil, Zap, Timer, BarChart3, FileText, Settings, CheckCircle2, Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import type {
  AIInterviewResponse,
  AIInterviewVersionHistoryItem,
} from '@/lib/services/aiInterviewService';
import CandidateResultsView from './CandidateResultsView';
import { formatIST, formatISTDate } from '@/lib/utils/dateUtils';
import { getPriorityLabel } from '@/lib/constants/aiInterviewPriority';
import { modeFromConfig, modeFromDuration } from '@/lib/constants/aiInterviewMode';

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

function SectionCard({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-100 bg-gray-50">
        <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
          <Icon className="w-4 h-4 text-brand-blue" />
        </div>
        <h3 className="text-sm font-semibold text-gray-800 tracking-tight">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-2">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-right">{value}</span>
    </div>
  );
}

// Priority labels are imported from lib/constants/aiInterviewPriority (P1-P3 scale).

function PriorityBadge({ p }: { p: number }) {
  const { label, color } = getPriorityLabel(p);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full border ${color}`}>
      {label}
    </span>
  );
}

function getTimedModeAllocation(nthEnabled: boolean, hrEnabled: boolean) {
  if (!nthEnabled && !hrEnabled) {
    return { mthMinutes: 30, nthMinutes: 0, hrMinutes: 0, mthQuestions: 15, nthQuestions: 0, hrQuestions: 0 };
  }
  if (nthEnabled && !hrEnabled) {
    return { mthMinutes: 20, nthMinutes: 10, hrMinutes: 0, mthQuestions: 10, nthQuestions: 5, hrQuestions: 0 };
  }
  if (nthEnabled && hrEnabled) {
    return { mthMinutes: 16, nthMinutes: 8, hrMinutes: 6, mthQuestions: 8, nthQuestions: 4, hrQuestions: 3 };
  }
  return { mthMinutes: 20, nthMinutes: 0, hrMinutes: 10, mthQuestions: 10, nthQuestions: 0, hrQuestions: 5 };
}

function getTimedModePercentages(nthEnabled: boolean, hrEnabled: boolean) {
  const allocation = getTimedModeAllocation(nthEnabled, hrEnabled);
  const total = allocation.mthQuestions + allocation.nthQuestions + allocation.hrQuestions;

  if (total <= 0) {
    return { mth: 0, nth: 0, hr: 0 };
  }

  const mth = Math.round((allocation.mthQuestions / total) * 100);
  const nth = nthEnabled ? Math.round((allocation.nthQuestions / total) * 100) : 0;
  const hr = hrEnabled ? 100 - mth - nth : 0;

  return {
    mth,
    nth,
    hr,
  };
}

interface AIInterviewDetailsViewProps {
  config: AIInterviewResponse;
  onBack: () => void;
  onRefresh?: () => void;
  currentIndex?: number;
  totalCount?: number;
  onPrev?: () => void;
  onNext?: () => void;
}

export default function AIInterviewDetailsView({ config, onBack, onRefresh, currentIndex, totalCount, onPrev, onNext }: AIInterviewDetailsViewProps) {
  const router = useRouter();
  const { user, isTenantAdmin } = useAuth();
  const canCreateAIInterviews = isTenantAdmin || !!user?.permissions?.canCreateAIInterviews;
  const canUpdateAIInterviews = isTenantAdmin || !!user?.permissions?.canUpdateAIInterviews;
  const canArchiveAIInterviews = isTenantAdmin || !!user?.permissions?.canArchiveAIInterviews;
  const canDeleteAIInterviews = isTenantAdmin || !!user?.permissions?.canDeleteAIInterviews;
  const [activeTab, setActiveTab] = useState<'overview' | 'activity' | 'versions' | 'info'>('overview');
  const [actionLoading, setActionLoading] = useState(false);

  // Activity
  const [recentActivity, setRecentActivity] = useState<AIInterviewResponse[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  // Version History
  const [versionHistory, setVersionHistory] = useState<AIInterviewVersionHistoryItem[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);

  // Candidate detail
  const [candidateDetail, setCandidateDetail] = useState<AIInterviewResponse | null>(null);
  const [candidateLoading, setCandidateLoading] = useState(false);

  // Confirmation dialog
  const [confirmAction, setConfirmAction] = useState<{ type: string; title: string; message: string; onConfirm: () => void } | null>(null);

  const enabledRounds = useMemo(() => {
    return config.rounds_config?.filter((r) => r.enabled !== false) || [];
  }, [config.rounds_config]);

  // Parse clusters + interview mode from special_instructions
  const { mthClusters, nthClusters, interviewMode, perQuestionSeconds } = useMemo(() => {
    try {
      const si = JSON.parse(config.special_instructions || '{}');
      return {
        mthClusters: (si.mth_clusters || []) as { id: string; name: string; priority: number; skills: string[]; reason?: string }[],
        nthClusters: (si.nth_clusters || []) as { id: string; name: string; priority: number; skills: string[]; reason?: string }[],
        interviewMode: modeFromConfig(si, config.duration_minutes),
        perQuestionSeconds: si.per_question_seconds ? Number(si.per_question_seconds) : null,
      };
    } catch {
      return { mthClusters: [], nthClusters: [], interviewMode: modeFromDuration(config.duration_minutes), perQuestionSeconds: null };
    }
  }, [config.special_instructions, config.duration_minutes]);

  const formattedDuration = useMemo(() => {
    const mins = config.duration_minutes;
    if (mins >= 60) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
    return `${mins} min`;
  }, [config.duration_minutes]);

  const displayPercentage = useCallback((type: string, storedPercentage: number) => {
    if (interviewMode !== 'fixed') return storedPercentage;

    const nthEnabled = enabledRounds.some((round) => round.type === 'nice_to_have_skills' || round.type === 'nice_to_have');
    const hrEnabled = enabledRounds.some((round) => round.type === 'hr');
    const percentages = getTimedModePercentages(nthEnabled, hrEnabled);

    if (type === 'must_have_skills' || type === 'must_to_have' || type === 'technical') return percentages.mth;
    if (type === 'nice_to_have_skills' || type === 'nice_to_have') return percentages.nth;
    if (type === 'hr') return percentages.hr;
    return storedPercentage;
  }, [enabledRounds, interviewMode]);

  // Preview-style derived values
  const mode = interviewMode as 'fixed' | 'flexible';
  const duration = config.duration_minutes;
  const position = config.position ?? config.jd_title ?? 'Untitled Position';
  const experienceLevel = config.jd_experience_level ?? '—';
  const mthRound = enabledRounds.find(r => r.type === 'must_have_skills' || r.type === 'must_to_have' || r.type === 'technical');
  const nthRound = enabledRounds.find(r => r.type === 'nice_to_have_skills' || r.type === 'nice_to_have');
  const hrRound = enabledRounds.find(r => r.type === 'hr');
  const nthEnabled = !!nthRound;
  const hrEnabled = !!hrRound;
  const timedAllocation = getTimedModeAllocation(nthEnabled, hrEnabled);
  const timedPreviewDurations = useMemo<Record<string, number>>(() => {
    if (mode !== 'fixed') return {};
    const map: Record<string, number> = {};
    if (mthRound) map[mthRound.type] = timedAllocation.mthMinutes ?? mthRound.duration_minutes;
    if (nthRound) map[nthRound.type] = timedAllocation.nthMinutes ?? nthRound.duration_minutes;
    if (hrRound) map[hrRound.type] = timedAllocation.hrMinutes ?? hrRound.duration_minutes;
    return map;
  }, [mode, mthRound, nthRound, hrRound, timedAllocation]);
  const timedPreviewQuestions = useMemo<Record<string, number>>(() => {
    if (mode !== 'fixed') return {};
    const map: Record<string, number> = {};
    if (mthRound) map[mthRound.type] = timedAllocation.mthQuestions;
    if (nthRound) map[nthRound.type] = timedAllocation.nthQuestions;
    if (hrRound) map[hrRound.type] = timedAllocation.hrQuestions;
    return map;
  }, [mode, mthRound, nthRound, hrRound, timedAllocation]);
  const roundPercentage = useCallback((round: any) => displayPercentage(round.type, round.percentage), [displayPercentage]);
  const totalPercentage = enabledRounds.reduce((sum, r) => sum + roundPercentage(r), 0);
  const languages = config.available_languages ?? (config.ai_voice_language ? [config.ai_voice_language] : ['English']);

  const loadActivity = useCallback(async () => {
    setActivityLoading(true);
    try {
      const result = await aiInterviewService.getConfigInvitations(config.id, { page: 1, page_size: 100 });
      setRecentActivity(result.items);
    } catch (error) {
      console.error('Failed to load activity:', error);
    } finally {
      setActivityLoading(false);
    }
  }, [config.id]);

  const loadVersionHistory = useCallback(async () => {
    setVersionsLoading(true);
    try {
      const result = await aiInterviewService.getVersionHistory(config.id);
      setVersionHistory(result.items);
    } catch (error) {
      console.error('Failed to load version history:', error);
    } finally {
      setVersionsLoading(false);
    }
  }, [config.id]);

  // Always load activity on mount (needed for invite count in header)
  useEffect(() => {
    loadActivity();
  }, [loadActivity]);

  useEffect(() => {
    if (activeTab === 'versions') loadVersionHistory();
  }, [activeTab, loadVersionHistory]);

  // Quick actions
  const handleCopyLink = async () => {
    if (config.interview_link) {
      const fullLink = `${window.location.origin}${config.interview_link}`;
      await navigator.clipboard.writeText(fullLink);
      toast.success('Interview link copied to clipboard');
    }
  };

  const handleDuplicate = async () => {
    setActionLoading(true);
    try {
      const result = await aiInterviewService.clone(config.id);
      toast.success(`Config duplicated: ${result.cloned_title}`);
      onRefresh?.();
    } catch (error: any) {
      toast.error(error.message || 'Failed to duplicate config');
    } finally {
      setActionLoading(false);
    }
  };

  const handleArchive = async () => {
    setActionLoading(true);
    try {
      await aiInterviewService.archive(config.id);
      toast.success('Config archived');
      onRefresh?.();
    } catch (error: any) {
      toast.error(error.message || 'Failed to archive');
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  };

  const handleDelete = async () => {
    setActionLoading(true);
    try {
      await aiInterviewService.delete(config.id);
      toast.success('Config deleted');
      onBack();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete');
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  };

  const handleExportCSV = () => {
    const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows: string[] = [];

    const title = config.jd_title || config.position || 'AI Interview';
    const displayId = config.display_id || config.id;

    rows.push(`AI Interview Export`);
    rows.push(`${esc(displayId)} - ${esc(title)}`);
    rows.push(`Exported: ${new Date().toLocaleString()}`);
    rows.push('');

    const PRIORITY_LABEL: Record<number, string> = { 3: 'High', 2: 'Medium', 1: 'Low' };

    // Helper: write clusters with one skill per row (first skill row shows cluster info, rest blank)
    const writeClusters = (clusters: typeof mthClusters) => {
      clusters.forEach((c, i) => {
        const skills = c.skills?.length ? c.skills : ['(no skills)'];
        skills.forEach((skill, si) => {
          rows.push([
            si === 0 ? String(i + 1) : '',
            si === 0 ? c.name : '',
            si === 0 ? (PRIORITY_LABEL[c.priority] ?? String(c.priority)) : '',
            skill,
            si === 0 ? (c.reason ?? '') : '',
          ].map(esc).join(','));
        });
      });
    };

    // ── Must-Have Skill Clusters ──
    rows.push('MUST-HAVE SKILL CLUSTERS');
    rows.push(['#', 'Cluster Name', 'Priority', 'Skill', 'Description / Reason'].map(esc).join(','));
    if (mthClusters.length > 0) {
      writeClusters(mthClusters);
    } else {
      rows.push(['-', 'No clusters configured', '', '', ''].map(esc).join(','));
    }
    rows.push('');

    // ── Nice-to-Have Skill Clusters ──
    rows.push('NICE-TO-HAVE SKILL CLUSTERS');
    rows.push(['#', 'Cluster Name', 'Priority', 'Skill', 'Description / Reason'].map(esc).join(','));
    if (nthClusters.length > 0) {
      writeClusters(nthClusters);
    } else {
      rows.push(['-', 'No clusters configured or NTH disabled', '', '', ''].map(esc).join(','));
    }
    rows.push('');

    // ── HR Questions ──
    rows.push('HR ROUND QUESTIONS');
    const hrQuestions = (hrRound as any)?.hr_questions ?? [];
    if (hrQuestions.length > 0) {
      rows.push(['#', 'Question', 'Answer Type'].map(esc).join(','));
      hrQuestions.forEach((q: any, i: number) => {
        rows.push([
          String(i + 1),
          q.question_text ?? '',
          q.answer_type ?? 'text',
        ].map(esc).join(','));
      });
    } else {
      rows.push(['-', 'No HR questions configured or HR round disabled', ''].map(esc).join(','));
    }

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${displayId}-clusters-hr.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported to CSV');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'published': return 'bg-green-100 text-green-700 ring-1 ring-green-200';
      case 'draft': return 'bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20';
      case 'completed': return 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20';
      case 'cancelled': return 'bg-red-100 text-red-700 ring-1 ring-red-200';
      case 'archived': return 'bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20';
      case 'in_progress': return 'bg-yellow-100 text-yellow-700 ring-1 ring-yellow-200';
      case 'invited': return 'bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/20';
      default: return 'bg-gray-100 text-gray-600 ring-1 ring-gray-200';
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

  const handleCandidateClick = useCallback(async (activityId: string) => {
    setCandidateLoading(true);
    try {
      const detail = await aiInterviewService.get(activityId);
      setCandidateDetail(detail);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load candidate details');
    } finally {
      setCandidateLoading(false);
    }
  }, []);

  // Compute invitation stats from activity
  const invitationStats = useMemo(() => {
    const total = recentActivity.length;
    const completed = recentActivity.filter(a => a.status === 'completed').length;
    const inProgress = recentActivity.filter(a => a.status === 'in_progress').length;
    const scores = recentActivity.filter(a => a.score != null).map(a => Number(a.score));
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    return { total, completed, inProgress, avgScore };
  }, [recentActivity]);

  // Show candidate detail view
  if (candidateDetail) {
    return <CandidateResultsView interview={candidateDetail} onBack={() => setCandidateDetail(null)} />;
  }

  return (
    <div className="flex-1 bg-slate-50 overflow-y-auto">
      {/* Loading overlay for candidate fetch */}
      {candidateLoading && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-white/60">
          <Loader2 className="w-8 h-8 animate-spin text-brand-blue" />
        </div>
      )}
      {/* Header (sticky on lg+, scrolls on mobile to avoid covering content) */}
      <div className="bg-brand-blue lg:sticky lg:top-0 z-40 shadow-md shadow-brand-blue/20 ring-1 ring-white/10">
        <div className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-3.5">
          <div className="flex items-center justify-between gap-2 mb-2 sm:mb-2.5 flex-wrap">
            <button
              onClick={onBack}
              aria-label="Back"
              className="w-9 h-9 sm:w-10 sm:h-10 bg-white/15 backdrop-blur-sm hover:bg-white/25 ring-1 ring-white/25 rounded-lg flex items-center justify-center text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
            </button>
            {totalCount != null && totalCount > 0 && (
              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  onClick={onPrev}
                  disabled={!onPrev || currentIndex === 0}
                  className="inline-flex items-center justify-center gap-1 px-2 sm:px-3 py-1.5 min-h-[36px] text-xs sm:text-sm rounded-lg bg-white/15 backdrop-blur-sm hover:bg-white/25 ring-1 ring-white/25 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  aria-label="Previous"
                >
                  <ChevronLeft className="w-4 h-4 flex-shrink-0" />
                  <span className="hidden sm:inline">Previous</span>
                </button>
                <span className="text-xs sm:text-sm text-white/90 font-medium px-1 tabular-nums">
                  {(currentIndex ?? 0) + 1} / {totalCount}
                </span>
                <button
                  onClick={onNext}
                  disabled={!onNext || currentIndex === totalCount - 1}
                  className="inline-flex items-center justify-center gap-1 px-2 sm:px-3 py-1.5 min-h-[36px] text-xs sm:text-sm rounded-lg bg-white/15 backdrop-blur-sm hover:bg-white/25 ring-1 ring-white/25 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  aria-label="Next"
                >
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight className="w-4 h-4 flex-shrink-0" />
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2.5 sm:gap-3">
            <div className="flex items-start gap-2 sm:gap-2.5 lg:gap-3 min-w-0 flex-1">
              <div className="w-9 h-9 sm:w-10 sm:h-10 lg:w-11 lg:h-11 bg-white/15 backdrop-blur-sm ring-1 ring-white/25 rounded-lg flex items-center justify-center flex-shrink-0">
                <Video className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                {/* Line 1: AI-002  Title  v1  Status */}
                <div className="flex items-center gap-1.5 sm:gap-2 mb-1 sm:mb-1.5 flex-wrap">
                  {config.display_id && (
                    <span className="px-1.5 sm:px-2 py-0.5 bg-white/95 text-brand-blue rounded text-[10px] sm:text-xs font-bold ring-1 ring-white/40 shadow-sm">
                      {config.display_id}
                    </span>
                  )}
                  <h1 className="text-sm sm:text-base lg:text-lg text-white font-semibold break-words min-w-0 flex-1 sm:flex-initial tracking-tight">
                    {config.jd_title || config.position || 'Untitled'}
                  </h1>
                  {config.jd_version && (
                    <span className="px-1.5 py-0.5 text-[10px] bg-white/15 text-white rounded ring-1 ring-white/25">
                      v{config.jd_version}
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-medium bg-white/15 text-white ring-1 ring-white/25 backdrop-blur-sm">
                    {getStatusLabel(config.status)}
                  </span>
                </div>

                {/* Line 2: Linked to JD */}
                {config.jd_short_id && (
                  <div className="text-[11px] sm:text-xs text-white/85 mb-1.5">
                    <span className="font-medium">Linked to: {config.jd_short_id}</span>
                    {config.jd_title && (
                      <span> · {config.jd_title}</span>
                    )}
                    {config.jd_version && (
                      <span className="ml-1 text-white/70">v{config.jd_version}</span>
                    )}
                  </div>
                )}

                {/* Line 3: Stats */}
                <div className="text-[11px] sm:text-xs text-white/90 flex items-center gap-x-2 gap-y-1 sm:gap-x-3 flex-wrap">
                  {config.jd_experience_level && <span>{config.jd_experience_level}</span>}
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formattedDuration}
                  </span>
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] sm:text-[11px] font-medium rounded-full ring-1 ${
                    interviewMode === 'flexible'
                      ? 'bg-white/15 text-white ring-white/25 backdrop-blur-sm'
                      : 'bg-brand-orange/25 text-white ring-brand-orange/40 backdrop-blur-sm'
                  }`}>
                    {interviewMode === 'flexible' ? (
                      <><Zap className="w-2.5 h-2.5" /> Flexible</>
                    ) : (
                      <><Timer className="w-2.5 h-2.5" /> Fixed</>
                    )}
                  </span>
                  {enabledRounds.length > 0 && (
                    <span className="flex items-center gap-1 flex-wrap">
                      <Layers className="w-3 h-3 shrink-0" />
                      {enabledRounds.map((r, i) => (
                        <span key={i} className="px-1.5 py-0.5 text-[10px] sm:text-[11px] bg-white/15 text-white rounded-full ring-1 ring-white/25 backdrop-blur-sm">
                          {ROUND_LABELS[r.type] || r.type}
                        </span>
                      ))}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {invitationStats.total} invite{invitationStats.total !== 1 ? 's' : ''}
                  </span>
                  {config.created_at && (
                    <span className="hidden sm:inline">Created {formatIST(config.created_at)}</span>
                  )}
                  {config.updated_at && (
                    <span className="hidden md:inline">Updated {formatIST(config.updated_at)}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 self-start sm:self-auto flex-wrap">
              {config.status === 'draft' && config.jd_id && canUpdateAIInterviews && (
                <button
                  onClick={() => {
                    const url = `/recruitment/ai-interviews/jd-selection/ai-interview-config?jd_id=${config.jd_id}&config_id=${config.id}`;
                    router.push(url);
                  }}
                  className="inline-flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 min-h-[40px] text-xs sm:text-sm bg-white text-brand-blue hover:bg-white/90 rounded-lg transition-colors font-medium shadow-sm ring-1 ring-white/40"
                >
                  <Pencil className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="hidden sm:inline">Continue Editing</span>
                  <span className="sm:hidden">Edit</span>
                </button>
              )}
              <button
                onClick={handleExportCSV}
                title="Export clusters & HR questions to CSV"
                aria-label="Export to CSV"
                className="p-2 min-w-[40px] min-h-[40px] inline-flex items-center justify-center text-white bg-white/15 backdrop-blur-sm hover:bg-white/25 ring-1 ring-white/25 rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" />
              </button>
              {onRefresh && (
                <button
                  onClick={onRefresh}
                  aria-label="Refresh"
                  className="p-2 min-w-[40px] min-h-[40px] inline-flex items-center justify-center text-white bg-white/15 backdrop-blur-sm hover:bg-white/25 ring-1 ring-white/25 rounded-lg transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar (scrolls with content; horizontally scrollable on small screens) */}
      <div className="bg-white border-b border-gray-100 z-10">
        <div className="px-3 sm:px-5 lg:px-8">
          <div className="flex gap-1 sm:gap-4 lg:gap-6 overflow-x-auto scrollbar-hide -mb-px">
            {([
              { key: 'overview', label: 'Interview Details' },
              { key: 'activity', label: 'Recent Activity' },
              { key: 'versions', label: 'Version History' },
              { key: 'info', label: 'AI Interview Info' },
            ] as const).map((t) => {
              const isActive = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`py-3 sm:py-4 px-2 sm:px-0 min-h-[44px] text-xs sm:text-sm border-b-2 transition-colors whitespace-nowrap ${
                    isActive
                      ? 'border-brand-blue text-brand-blue font-semibold'
                      : 'border-transparent text-gray-600 hover:text-brand-blue font-medium'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content area */}
      <div className="px-3 sm:px-5 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">

          {/* JD staleness banner — shows when the linked JD was edited after
              this interview config was created. Computed by the single-config
              GET endpoint (see _compute_jd_staleness in the router). */}
          {config.jd_stale && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3"
            >
              <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-amber-500 text-white text-[11px] font-bold">
                !
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-900">
                  Linked JD has changed since this interview was configured
                </p>
                <p className="mt-0.5 text-xs text-amber-800">
                  {config.jd_stale_reason ?? 'The underlying Job Description was updated after this config was created.'}
                  {config.jd_current_version != null && config.jd_version != null && (
                    <> Snapshot: v{config.jd_version} &middot; Current: v{config.jd_current_version}.</>
                  )}
                  {' '}Candidates who take this interview will be evaluated against the snapshotted skills, not the current JD.
                </p>
                {config.status === 'draft' && config.jd_id && (
                  <button
                    type="button"
                    onClick={() => {
                      const url = `/recruitment/ai-interviews/jd-selection/ai-interview-config?jd_id=${config.jd_id}&config_id=${config.id}`;
                      router.push(url);
                    }}
                    className="mt-2 inline-flex items-center gap-1 rounded-md border border-amber-400 bg-white px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
                  >
                    Re-sync with latest JD
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-5">

              {/* JD Info Card */}
              <div className="rounded-xl overflow-hidden border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 bg-white">
                <div className="bg-brand-blue px-5 py-4 ring-1 ring-white/10">
                  <div className="flex items-center gap-2 mb-1">
                    <FileText className="w-4 h-4 text-white/90" />
                    <span className="text-xs font-medium text-white/90 uppercase tracking-wide">Job Description</span>
                  </div>
                  <h2 className="text-lg font-bold text-white tracking-tight">{position}</h2>
                </div>
                <div className="bg-white px-5 py-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">JD ID</p>
                      <p className="text-sm font-medium text-gray-900">{config.jd_short_id ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">JD Title</p>
                      <p className="text-sm font-medium text-gray-900">{config.jd_title ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Experience Level</p>
                      <p className="text-sm font-medium text-gray-900">{experienceLevel}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Industry</p>
                      <p className="text-sm font-medium text-gray-900">{(config as any).jd_industry_type ?? '—'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Interview Mode */}
              <SectionCard title="Interview Mode" icon={Zap}>
                <div className="flex items-center gap-3">
                  {mode === 'fixed' ? (
                    <>
                      <div className="w-10 h-10 rounded-lg bg-brand-orange/10 ring-1 ring-brand-orange/20 flex items-center justify-center">
                        <Timer className="w-5 h-5 text-brand-orange-deep" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">Fixed — {duration} min</p>
                        <p className="text-xs text-gray-500">Structured interview with timed rounds</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-10 h-10 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/20 flex items-center justify-center">
                        <Zap className="w-5 h-5 text-brand-blue" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">Flexible</p>
                        <p className="text-xs text-gray-500">Adaptive interview with dynamic pacing</p>
                      </div>
                    </>
                  )}
                </div>
              </SectionCard>

              {/* Scoring Distribution */}
              <SectionCard title="Scoring Distribution" icon={BarChart3}>
                <div className="space-y-4">
                  {mthRound && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm text-gray-700 font-medium">Must-To-Have</span>
                        <span className="text-sm font-semibold text-brand-blue">{roundPercentage(mthRound)}%</span>
                      </div>
                      <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-brand-blue rounded-full" style={{ width: `${totalPercentage > 0 ? (roundPercentage(mthRound) / totalPercentage) * 100 : 0}%` }} />
                      </div>
                    </div>
                  )}
                  {nthRound && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm text-gray-700 font-medium">Nice-To-Have</span>
                        <span className="text-sm font-semibold text-brand-cyan">{roundPercentage(nthRound)}%</span>
                      </div>
                      <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-brand-cyan rounded-full" style={{ width: `${totalPercentage > 0 ? (roundPercentage(nthRound) / totalPercentage) * 100 : 0}%` }} />
                      </div>
                    </div>
                  )}
                  {hrRound && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm text-gray-700 font-medium">HR Round</span>
                        <span className="text-sm font-semibold text-brand-orange-deep">{roundPercentage(hrRound)}%</span>
                      </div>
                      <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-brand-orange rounded-full" style={{ width: `${totalPercentage > 0 ? (roundPercentage(hrRound) / totalPercentage) * 100 : 0}%` }} />
                      </div>
                    </div>
                  )}
                  {enabledRounds.length === 0 && <p className="text-sm text-gray-400 italic">No rounds configured</p>}
                </div>
              </SectionCard>

              {/* Time Allocation Table (fixed mode only) */}
              {mode === 'fixed' && enabledRounds.length > 0 && (
                <SectionCard title="Time Allocation" icon={Clock}>
                  <div className="overflow-hidden rounded-lg border border-gray-100 ring-1 ring-black/[0.02]">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-left border-b border-gray-100">
                          <th className="px-4 py-2.5 font-medium text-gray-600">Round</th>
                          <th className="px-4 py-2.5 font-medium text-gray-600 text-right">Weight</th>
                          <th className="px-4 py-2.5 font-medium text-gray-600 text-right">Questions</th>
                          <th className="px-4 py-2.5 font-medium text-gray-600 text-right">Clusters</th>
                          <th className="px-4 py-2.5 font-medium text-gray-600 text-right">Time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {enabledRounds.map(r => {
                          const isMth = r.type === 'must_have_skills' || r.type === 'must_to_have' || r.type === 'technical';
                          const isNth = r.type === 'nice_to_have_skills' || r.type === 'nice_to_have';
                          const label = isMth ? 'Must-To-Have' : isNth ? 'Nice-To-Have' : r.type === 'hr' ? 'HR Round' : r.type;
                          const mins = timedPreviewDurations[r.type] ?? r.duration_minutes;
                          const questions = timedPreviewQuestions[r.type] ?? r.planned_questions ?? 0;
                          const clusterCount = isMth ? mthClusters.length : isNth ? nthClusters.length : null;
                          return (
                            <tr key={r.type} className="hover:bg-brand-blue/5 transition-colors">
                              <td className="px-4 py-2.5 text-gray-900">{label}</td>
                              <td className="px-4 py-2.5 text-gray-700 text-right">{roundPercentage(r)}%</td>
                              <td className="px-4 py-2.5 text-gray-700 text-right">{questions}</td>
                              <td className="px-4 py-2.5 text-gray-700 text-right">{clusterCount !== null ? clusterCount : '—'}</td>
                              <td className="px-4 py-2.5 text-gray-700 text-right">{mins} min</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-50 font-semibold border-t border-gray-100">
                          <td className="px-4 py-2.5 text-gray-900">Total</td>
                          <td className="px-4 py-2.5 text-brand-blue text-right">{totalPercentage}%</td>
                          <td className="px-4 py-2.5 text-gray-900 text-right">
                            {enabledRounds.reduce((s, r) => s + (timedPreviewQuestions[r.type] ?? r.planned_questions ?? 0), 0)}
                          </td>
                          <td className="px-4 py-2.5 text-gray-900 text-right">{mthClusters.length + nthClusters.length}</td>
                          <td className="px-4 py-2.5 text-gray-900 text-right">
                            {enabledRounds.reduce((s, r) => s + (timedPreviewDurations[r.type] ?? r.duration_minutes), 0)} min
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </SectionCard>
              )}

              {/* Skill Clusters */}
              {(mthClusters.length > 0 || nthClusters.length > 0) && (
                <SectionCard title="Skill Clusters" icon={Layers}>
                  <div className="space-y-6">
                    {mthClusters.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-brand-blue uppercase tracking-wide mb-3">Must-To-Have Clusters</h4>
                        <div className="space-y-3">
                          {mthClusters.map(cluster => (
                            <div key={cluster.id} className="border border-gray-100 ring-1 ring-black/[0.02] rounded-lg p-4 bg-white shadow-sm shadow-brand-blue/5 hover:ring-brand-blue/20 transition-shadow">
                              <div className="flex items-center gap-2 mb-2">
                                <PriorityBadge p={cluster.priority} />
                                <span className="text-sm font-semibold text-gray-900">{cluster.name}</span>
                                <span className="text-xs text-gray-400 ml-auto">{cluster.skills.length} skill{cluster.skills.length !== 1 ? 's' : ''}</span>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {cluster.skills.map(skill => (
                                  <span key={skill} className="inline-flex items-center px-2 py-0.5 rounded-md bg-brand-blue/5 text-xs text-brand-blue ring-1 ring-brand-blue/20">{skill}</span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {nthClusters.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-brand-cyan uppercase tracking-wide mb-3">Nice-To-Have Clusters</h4>
                        <div className="space-y-3">
                          {nthClusters.map(cluster => (
                            <div key={cluster.id} className="border border-gray-100 ring-1 ring-black/[0.02] rounded-lg p-4 bg-white shadow-sm shadow-brand-blue/5 hover:ring-brand-cyan/20 transition-shadow">
                              <div className="flex items-center gap-2 mb-2">
                                <PriorityBadge p={cluster.priority} />
                                <span className="text-sm font-semibold text-gray-900">{cluster.name}</span>
                                <span className="text-xs text-gray-400 ml-auto">{cluster.skills.length} skill{cluster.skills.length !== 1 ? 's' : ''}</span>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {cluster.skills.map(skill => (
                                  <span key={skill} className="inline-flex items-center px-2 py-0.5 rounded-md bg-brand-cyan/5 text-xs text-brand-cyan ring-1 ring-brand-cyan/20">{skill}</span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </SectionCard>
              )}

              {/* HR Round */}
              {hrRound && (
                <SectionCard title="HR Round" icon={Users}>
                  {mode === 'fixed' && (
                    <div className="space-y-0 divide-y divide-gray-100 mb-4">
                      <InfoRow label="Questions" value={`${timedAllocation.hrQuestions}`} />
                      <InfoRow label="Time" value={`${timedAllocation.hrMinutes} min`} />
                    </div>
                  )}
                  {(hrRound as any).hr_questions?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-brand-cyan uppercase tracking-wide mb-2">Selected HR Questions</p>
                      <ol className="space-y-2">
                        {((hrRound as any).hr_questions as { id: string; question_text: string; answer_type: string }[]).map((q, idx) => (
                          <li key={q.id} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-gradient-to-br from-brand-cyan/5 to-brand-teal/5 border border-gray-100 ring-1 ring-brand-cyan/10">
                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-brand-cyan text-white text-[10px] font-bold flex items-center justify-center mt-0.5 shadow-sm">{idx + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-800">{q.question_text}</p>
                              <span className="text-[10px] text-gray-500 mt-0.5 inline-block">{q.answer_type === 'yes_no' ? 'Yes / No' : 'Text answer'}</span>
                            </div>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </SectionCard>
              )}

              {/* Settings */}
              <SectionCard title="Settings" icon={Settings}>
                <div className="space-y-0 divide-y divide-gray-100">
                  <InfoRow
                    label="Recording"
                    value={
                      config.recording_enabled ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 ring-1 ring-green-200">
                          <Video className="w-3 h-3" /> Enabled
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">Disabled</span>
                      )
                    }
                  />
                  {config.introduction_video_url ? (
                    <div className="py-3">
                      <p className="text-sm text-gray-500 mb-2">Introduction Video</p>
                      <video src={config.introduction_video_url} controls className="w-full max-w-md rounded-lg border border-gray-100 ring-1 ring-black/[0.02] bg-black" style={{ maxHeight: '240px' }}>
                        Your browser does not support the video tag.
                      </video>
                    </div>
                  ) : (
                    <InfoRow label="Introduction Video" value={<span className="text-sm text-gray-400">None</span>} />
                  )}
                  <InfoRow
                    label="Languages"
                    value={
                      <div className="flex flex-wrap gap-1.5 justify-end">
                        {languages.map(lang => (
                          <span key={lang} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-blue/5 text-xs text-brand-blue ring-1 ring-brand-blue/20">
                            <Globe className="w-3 h-3 text-brand-blue" />{lang}
                          </span>
                        ))}
                      </div>
                    }
                  />
                </div>
              </SectionCard>

              {/* Invitation Stats */}
              <SectionCard title="Invitation Stats" icon={Users}>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-gradient-to-br from-brand-blue/5 to-brand-cyan/5 ring-1 ring-brand-blue/15 rounded-lg p-4 text-center">
                    <div className="text-2xl font-semibold text-brand-blue tracking-tight">{invitationStats.total}</div>
                    <div className="text-xs text-gray-500 mt-1">Total Invited</div>
                  </div>
                  <div className="bg-gradient-to-br from-green-50 to-green-50 ring-1 ring-green-200 rounded-lg p-4 text-center">
                    <div className="text-2xl font-semibold text-green-600 tracking-tight">{invitationStats.completed}</div>
                    <div className="text-xs text-gray-500 mt-1">Completed</div>
                  </div>
                  <div className="bg-gradient-to-br from-brand-orange/5 to-brand-orange-deep/5 ring-1 ring-brand-orange/20 rounded-lg p-4 text-center">
                    <div className="text-2xl font-semibold text-brand-orange-deep tracking-tight">{invitationStats.inProgress}</div>
                    <div className="text-xs text-gray-500 mt-1">In Progress</div>
                  </div>
                </div>
              </SectionCard>

            </div>
          )}


          {/* Recent Activity Tab */}
          {activeTab === 'activity' && (
            <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-6">
              {activityLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-brand-blue" />
                </div>
              ) : recentActivity.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-20 h-20 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center mx-auto mb-4">
                    <Users className="w-10 h-10 text-brand-blue" />
                  </div>
                  <p className="text-gray-700 font-medium mb-2">No candidate activity yet</p>
                  <p className="text-sm text-gray-500">Invite candidates to see their activity here</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentActivity.map((activity) => {
                    const statusIcon = () => {
                      switch (activity.status) {
                        case 'completed': return <CheckCircle className="w-5 h-5 text-green-500" />;
                        case 'in_progress': return <Play className="w-5 h-5 text-brand-orange-deep" />;
                        case 'invited': return <Mail className="w-5 h-5 text-brand-blue" />;
                        case 'cancelled': return <XCircle className="w-5 h-5 text-red-500" />;
                        default: return <Mail className="w-5 h-5 text-gray-400" />;
                      }
                    };

                    return (
                      <div
                        key={activity.id}
                        onClick={() => handleCandidateClick(activity.id)}
                        className="flex items-center gap-4 p-4 border border-gray-100 ring-1 ring-black/[0.02] rounded-lg cursor-pointer hover:bg-brand-blue/5 hover:ring-brand-blue/20 transition-colors"
                      >
                        <div className="flex-shrink-0">{statusIcon()}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 truncate">
                              {activity.candidate_name || 'Unknown'}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(activity.status)}`}>
                              {getStatusLabel(activity.status)}
                            </span>
                          </div>
                          <div className="text-sm text-gray-500 truncate">{activity.candidate_email}</div>
                        </div>
                        <div className="flex items-center gap-4 flex-shrink-0">
                          <div className="text-xs text-gray-400">
                            {formatISTDate(activity.completed_at || activity.started_at || activity.created_at)}
                          </div>
                          <ChevronRight className="w-4 h-4 text-brand-blue" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Version History Tab */}
          {activeTab === 'versions' && (
            <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
                <div className="flex items-center gap-2.5 mb-1">
                  <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                    <Clock className="w-4 h-4 text-brand-blue" />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 tracking-tight">Version History</h3>
                </div>
                <p className="text-sm text-gray-600">Complete timeline of all changes made to this interview</p>
              </div>
              {versionsLoading ? (
                <div className="px-6 py-12 text-center">
                  <Loader2 className="w-8 h-8 text-brand-blue animate-spin mx-auto mb-3" />
                  <p className="text-gray-600">Loading version history...</p>
                </div>
              ) : versionHistory.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <div className="w-20 h-20 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center mx-auto mb-4">
                    <Clock className="w-10 h-10 text-brand-blue" />
                  </div>
                  <p className="text-gray-700 font-medium mb-1 text-sm">No version history available</p>
                  <p className="text-sm text-gray-500">Version history will appear when the interview is edited</p>
                </div>
              ) : (
                <div className="p-6 space-y-6">
                  {(() => {
                    const minVersion = Math.min(...versionHistory.map(v => v.version));
                    return versionHistory.map((version, idx) => {
                    const isCurrentVersion = idx === 0;
                    const isFirstVersion = version.version === minVersion;
                    const versionDate = formatIST(version.created_at);
                    return (
                      <div key={version.id} className="space-y-4">
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 bg-brand-cyan rounded-full flex items-center justify-center flex-shrink-0 shadow-md shadow-brand-cyan/25 ring-1 ring-white/20">
                            <span className="text-white font-bold text-sm">V{version.version}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-1">
                              <h4 className="text-base font-semibold text-gray-900 tracking-tight">
                                Version {version.version} {isFirstVersion ? 'Published' : 'Updated'}
                              </h4>
                              {isCurrentVersion && (
                                <span className="px-2.5 py-1 bg-brand-blue text-white text-xs font-medium rounded shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 w-fit">
                                  Current Version
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-600 mb-3">
                              {isFirstVersion ? 'Initial interview configuration created' : (version.change_summary || 'Interview configuration updated')}
                            </p>
                            <div className="flex items-center gap-2 text-sm text-gray-700 mb-1">
                              <Users className="w-4 h-4 text-brand-blue flex-shrink-0" />
                              <span className="font-medium">{version.changed_by_name || 'Unknown User'}</span>
                              <span className="text-gray-400">•</span>
                              <span className="text-gray-600">Lead Recruiter</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
                              <Calendar className="w-4 h-4 text-brand-blue flex-shrink-0" />
                              <span>Published on {versionDate} IST (UTC+5:30)</span>
                            </div>
                            <div className="bg-gradient-to-br from-brand-blue/5 to-brand-cyan/5 border border-gray-100 ring-1 ring-brand-blue/10 rounded-lg p-4">
                              <div className="text-sm font-medium text-gray-900 mb-3">
                                {version.version === 1 ? 'Initial Configuration:' : 'Updated Configuration:'}
                              </div>
                              <ul className="space-y-2">
                                {version.rounds_config && version.rounds_config.filter((r: any) => r.enabled !== false).length > 0 && (
                                  <li className="text-sm text-gray-700 flex items-start gap-2">
                                    <span className="text-brand-blue mt-0.5">•</span>
                                    <span>Interview rounds: {version.rounds_config.filter((r: any) => r.enabled !== false).map((r: any) => ROUND_LABELS[r.type] || r.type).join(', ')}</span>
                                  </li>
                                )}
                                <li className="text-sm text-gray-700 flex items-start gap-2">
                                  <span className="text-brand-blue mt-0.5">•</span>
                                  <span>Duration set to {version.duration_minutes || config.duration_minutes || 30} min</span>
                                </li>
                                {version.jd_title && (
                                  <li className="text-sm text-gray-700 flex items-start gap-2">
                                    <span className="text-brand-blue mt-0.5">•</span>
                                    <span>Linked to job posting: {version.jd_title}</span>
                                  </li>
                                )}
                                {version.total_questions && (
                                  <li className="text-sm text-gray-700 flex items-start gap-2">
                                    <span className="text-brand-blue mt-0.5">•</span>
                                    <span>Total questions: {version.total_questions}</span>
                                  </li>
                                )}
                              </ul>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  });
                  })()}
                </div>
              )}
            </div>
          )}

          {/* AI Interview Info Tab */}
          {activeTab === 'info' && (() => {
            const expLabel = (val: string | null | undefined) => {
              const map: Record<string, string> = { junior: 'Junior', mid: 'Mid-Level', senior: 'Senior', lead: 'Lead', expert: 'Expert' };
              return val ? (map[val] || val) : null;
            };
            const expColor = (val: string | null | undefined) => {
              const map: Record<string, string> = {
                junior: 'bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/20',
                mid: 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20',
                senior: 'bg-brand-blue/10 text-brand-blue-2 ring-1 ring-brand-blue/20',
                lead: 'bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20',
                expert: 'bg-red-100 text-red-700 ring-1 ring-red-200',
              };
              return val ? (map[val] || 'bg-gray-100 text-gray-700 ring-1 ring-gray-200') : 'bg-gray-100 text-gray-700 ring-1 ring-gray-200';
            };
            const mthSkills: string[] = config.jd_must_have_skills || [];
            const nthSkills: string[] = config.jd_nice_to_have_skills || [];
            return (
              <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5">
                <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-b border-gray-100 bg-gray-50">
                  <div className="flex items-center gap-2.5 mb-1">
                    <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                      <Briefcase className="w-4 h-4 text-brand-blue" />
                    </div>
                    <h3 className="text-sm sm:text-base font-semibold text-gray-900 tracking-tight">AI Interview Info</h3>
                  </div>
                  <p className="text-xs sm:text-sm text-gray-600">Metadata from the job description used to configure this interview</p>
                </div>
                <div className="p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
                  {/* Key Metadata Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {/* Experience Level */}
                    <div className="rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-4 bg-white">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                          <Layers className="w-4 h-4 text-brand-blue" />
                        </div>
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Experience Level</span>
                      </div>
                      {config.jd_experience_level ? (
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${expColor(config.jd_experience_level)}`}>
                          {expLabel(config.jd_experience_level) || config.jd_experience_level}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">Not available</span>
                      )}
                    </div>

                    {/* Interview Mode */}
                    <div className="rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-4 bg-white">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-9 h-9 rounded-lg bg-brand-orange/10 ring-1 ring-brand-orange/20 flex items-center justify-center">
                          <Timer className="w-4 h-4 text-brand-orange-deep" />
                        </div>
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Interview Mode</span>
                      </div>
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ring-1 ${interviewMode === 'fixed' ? 'bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20' : 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20'}`}>
                        {interviewMode === 'fixed' ? `Fixed — ${config.duration_minutes} min` : 'Flexible'}
                      </span>
                    </div>

                    {/* Industry */}
                    <div className="rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-4 bg-white">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-9 h-9 rounded-lg bg-brand-cyan/10 ring-1 ring-brand-cyan/20 flex items-center justify-center">
                          <Globe className="w-4 h-4 text-brand-cyan" />
                        </div>
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Industry</span>
                      </div>
                      {(config as any).jd_industry_type ? (
                        <span className="text-sm font-medium text-gray-900">{(config as any).jd_industry_type}</span>
                      ) : (
                        <span className="text-sm text-gray-400">Not available</span>
                      )}
                    </div>

                    {/* Recording */}
                    <div className="rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-4 bg-white">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                          <Video className="w-4 h-4 text-brand-blue" />
                        </div>
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Recording</span>
                      </div>
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ring-1 ${config.recording_enabled ? 'bg-green-100 text-green-700 ring-green-200' : 'bg-gray-100 text-gray-600 ring-gray-200'}`}>
                        {config.recording_enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>

                    {/* AI Voice Language */}
                    <div className="rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-4 bg-white">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-9 h-9 rounded-lg bg-brand-cyan/10 ring-1 ring-brand-cyan/20 flex items-center justify-center">
                          <Globe className="w-4 h-4 text-brand-cyan" />
                        </div>
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">AI Voice Language</span>
                      </div>
                      <span className="text-sm font-medium text-gray-900">{config.ai_voice_language || 'English (US)'}</span>
                    </div>

                    {/* Candidate Languages */}
                    <div className="rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-4 bg-white">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                          <Globe className="w-4 h-4 text-brand-blue" />
                        </div>
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Candidate Languages</span>
                      </div>
                      {languages.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {languages.map((lang, i) => (
                            <span key={i} className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20">{lang}</span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">Not specified</span>
                      )}
                    </div>
                  </div>

                  {/* Must-Have Skills */}
                  {mthSkills.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Brain className="w-4 h-4 text-brand-blue" />
                        <h4 className="text-sm font-semibold text-gray-900 tracking-tight">Must-Have Skills</h4>
                        <span className="text-xs text-gray-500">({mthSkills.length})</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {mthSkills.map((skill: string) => (
                          <span key={skill} className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20">{skill}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Nice-to-Have Skills */}
                  {nthSkills.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Sparkles className="w-4 h-4 text-brand-cyan" />
                        <h4 className="text-sm font-semibold text-gray-900 tracking-tight">Nice-to-Have Skills</h4>
                        <span className="text-xs text-gray-500">({nthSkills.length})</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {nthSkills.map((skill: string) => (
                          <span key={skill} className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-brand-cyan/5 text-brand-cyan ring-1 ring-brand-cyan/20">{skill}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

      </div>

      {/* Confirmation Dialog */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-blue/30 backdrop-blur-sm p-4 sm:p-6">
          <div className="bg-white rounded-2xl shadow-2xl shadow-brand-blue/10 border border-gray-100 ring-1 ring-black/[0.02] w-full max-w-md p-5 sm:p-6 max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-2 tracking-tight">{confirmAction.title}</h3>
            <p className="text-sm text-gray-600 mb-6">{confirmAction.message}</p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 text-sm border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmAction.onConfirm}
                disabled={actionLoading}
                className={`px-4 py-2 text-sm text-white rounded-lg transition-colors disabled:opacity-50 ring-1 ring-white/10 ${
                  confirmAction.type === 'delete' ? 'bg-red-600 hover:bg-red-700 shadow-md shadow-red-600/25' : 'bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue shadow-md shadow-brand-blue/25'
                }`}
              >
                {actionLoading ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
