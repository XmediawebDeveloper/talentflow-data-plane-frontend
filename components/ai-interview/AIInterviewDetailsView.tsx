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
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100 bg-gray-50/50">
        <Icon className="w-4 h-4 text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
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

const PRIORITY_LABELS: Record<number, { label: string; color: string }> = {
  3: { label: 'P3 – High',   color: 'bg-orange-100 text-orange-700 border-orange-200' },
  2: { label: 'P2 – Medium', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  1: { label: 'P1 – Low',    color: 'bg-blue-100 text-blue-700 border-blue-200' },
};

function PriorityBadge({ p }: { p: number }) {
  const { label, color } = PRIORITY_LABELS[p] ?? PRIORITY_LABELS[2];
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
        interviewMode: (si.interview_mode as string) || (config.duration_minutes === 0 ? 'flexible' : 'fixed'),
        perQuestionSeconds: si.per_question_seconds ? Number(si.per_question_seconds) : null,
      };
    } catch {
      return { mthClusters: [], nthClusters: [], interviewMode: config.duration_minutes === 0 ? 'flexible' : 'fixed', perQuestionSeconds: null };
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
      case 'published': return 'bg-green-100 text-green-700';
      case 'draft': return 'bg-gray-100 text-gray-600';
      case 'completed': return 'bg-blue-100 text-blue-700';
      case 'cancelled': return 'bg-red-100 text-red-700';
      case 'archived': return 'bg-orange-100 text-orange-700';
      case 'in_progress': return 'bg-yellow-100 text-yellow-700';
      case 'invited': return 'bg-purple-100 text-purple-700';
      default: return 'bg-gray-100 text-gray-600';
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
    <div className="flex-1 bg-gray-50 overflow-y-auto">
      {/* Loading overlay for candidate fetch */}
      {candidateLoading && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-white/60">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      )}
      {/* Sticky dark header */}
      <div className="bg-gradient-to-r from-gray-800 to-gray-800 border-b-2 border-gray-600 sticky top-0 z-20 shadow-lg">
        <div className="px-5 lg:px-8 py-4 lg:py-5">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 sm:gap-2 text-white/90 hover:text-white transition-colors text-sm sm:text-base"
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              Back to AI Interviews
            </button>
            {totalCount != null && totalCount > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={onPrev}
                  disabled={!onPrev || currentIndex === 0}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-white/30 bg-white/10 text-white hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </button>
                <span className="text-sm text-white/80 font-medium px-1">
                  {(currentIndex ?? 0) + 1} / {totalCount}
                </span>
                <button
                  onClick={onNext}
                  disabled={!onNext || currentIndex === totalCount - 1}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-white/30 bg-white/10 text-white hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
            <div className="flex items-start gap-2 sm:gap-3 lg:gap-4 min-w-0">
              <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 bg-white/20 backdrop-blur-sm rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0">
                <Video className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8 text-white" />
              </div>
              <div className="min-w-0">
                {/* Line 1: AI-002  Title  v1  Status */}
                <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-3 mb-1.5 sm:mb-2 flex-wrap">
                  {config.display_id && (
                    <span className="px-1.5 sm:px-2 lg:px-2.5 py-0.5 sm:py-1 bg-white/90 text-gray-900 rounded text-xs sm:text-sm font-bold">
                      {config.display_id}
                    </span>
                  )}
                  <h1 className="text-sm sm:text-lg lg:text-2xl text-white font-semibold truncate">
                    {config.jd_title || config.position || 'Untitled'}
                  </h1>
                  {config.jd_version && (
                    <span className="px-1.5 py-0.5 text-[10px] bg-white/20 text-white rounded border border-white/30">
                      v{config.jd_version}
                    </span>
                  )}
                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-200/30 text-gray-100 border border-gray-300/30">
                    {getStatusLabel(config.status)}
                  </span>
                </div>

                {/* Line 2: Linked to JD */}
                {config.jd_short_id && (
                  <div className="text-sm text-gray-100 mb-2">
                    <span className="font-medium">Linked to: {config.jd_short_id}</span>
                    {config.jd_title && (
                      <span> - {config.jd_title}</span>
                    )}
                    {config.jd_version && (
                      <span className="ml-1 text-gray-300">v{config.jd_version}</span>
                    )}
                  </div>
                )}

                {/* Line 3: Stats */}
                <div className="text-xs sm:text-sm text-gray-100 flex items-center gap-2 sm:gap-3 lg:gap-4 flex-wrap">
                  {config.jd_experience_level && <span>{config.jd_experience_level}</span>}
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {formattedDuration}
                  </span>
                  <span className={`flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border ${
                    interviewMode === 'flexible'
                      ? 'bg-blue-400/20 text-blue-100 border-blue-300/30'
                      : 'bg-orange-400/20 text-orange-100 border-orange-300/30'
                  }`}>
                    {interviewMode === 'flexible' ? (
                      <><Zap className="w-3 h-3" /> Flexible</>
                    ) : (
                      <><Timer className="w-3 h-3" /> Fixed</>
                    )}
                  </span>
                  {enabledRounds.length > 0 && (
                    <span className="flex items-center gap-1.5 flex-wrap">
                      <Layers className="w-3.5 h-3.5 shrink-0" />
                      {enabledRounds.map((r, i) => (
                        <span key={i} className="px-2 py-0.5 text-xs bg-white/10 text-white rounded-full border border-white/20">
                          {ROUND_LABELS[r.type] || r.type}
                        </span>
                      ))}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    {invitationStats.total} invite{invitationStats.total !== 1 ? 's' : ''}
                  </span>
                  {config.created_at && (
                    <span>Created {formatIST(config.created_at)}</span>
                  )}
                  {config.updated_at && (
                    <span>Last Updated {formatIST(config.updated_at)}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              {config.status === 'draft' && config.jd_id && canUpdateAIInterviews && (
                <button
                  onClick={() => {
                    const url = `/recruitment/ai-interviews/jd-selection/ai-interview-config?jd_id=${config.jd_id}&config_id=${config.id}`;
                    router.push(url);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 text-sm bg-white text-gray-800 hover:bg-gray-50 rounded-lg transition-colors font-medium"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Continue Editing
                </button>
              )}
              <button
                onClick={handleExportCSV}
                title="Export clusters & HR questions to CSV"
                className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-md transition-colors"
              >
                <Download className="w-4 h-4" />
              </button>
              {onRefresh && (
                <button
                  onClick={onRefresh}
                  className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-md transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sticky tab bar */}
      <div className="bg-white border-b border-gray-200 sticky top-[148px] z-10">
        <div className="px-5 lg:px-8">
          <div className="flex gap-4 lg:gap-6 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-3 sm:py-4 text-sm border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'overview' ? 'border-gray-800 text-gray-800 font-medium' : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Interview Details
            </button>
            <button
              onClick={() => setActiveTab('activity')}
              className={`py-3 sm:py-4 text-sm border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'activity' ? 'border-gray-800 text-gray-800 font-medium' : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Recent Activity
            </button>
            <button
              onClick={() => setActiveTab('versions')}
              className={`py-3 sm:py-4 text-sm border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'versions' ? 'border-gray-800 text-gray-800 font-medium' : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Version History
            </button>
            <button
              onClick={() => setActiveTab('info')}
              className={`py-3 sm:py-4 text-sm border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'info' ? 'border-gray-800 text-gray-800 font-medium' : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              AI Interview Info
            </button>
          </div>
        </div>
      </div>

      {/* Content area */}
      <div className="px-3 sm:px-5 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-5">

              {/* JD Info Card */}
              <div className="rounded-xl overflow-hidden border border-gray-200">
                <div className="bg-gray-800 px-5 py-4">
                  <div className="flex items-center gap-2 mb-1">
                    <FileText className="w-4 h-4 text-white/80" />
                    <span className="text-xs font-medium text-white/80 uppercase tracking-wide">Job Description</span>
                  </div>
                  <h2 className="text-lg font-bold text-white">{position}</h2>
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
                      <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                        <Timer className="w-5 h-5 text-gray-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">Fixed — {duration} min</p>
                        <p className="text-xs text-gray-500">Structured interview with timed rounds</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                        <Zap className="w-5 h-5 text-blue-600" />
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
                        <span className="text-sm font-semibold text-gray-900">{roundPercentage(mthRound)}%</span>
                      </div>
                      <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gray-700 rounded-full" style={{ width: `${totalPercentage > 0 ? (roundPercentage(mthRound) / totalPercentage) * 100 : 0}%` }} />
                      </div>
                    </div>
                  )}
                  {nthRound && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm text-gray-700 font-medium">Nice-To-Have</span>
                        <span className="text-sm font-semibold text-gray-900">{roundPercentage(nthRound)}%</span>
                      </div>
                      <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${totalPercentage > 0 ? (roundPercentage(nthRound) / totalPercentage) * 100 : 0}%` }} />
                      </div>
                    </div>
                  )}
                  {hrRound && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm text-gray-700 font-medium">HR Round</span>
                        <span className="text-sm font-semibold text-gray-900">{roundPercentage(hrRound)}%</span>
                      </div>
                      <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${totalPercentage > 0 ? (roundPercentage(hrRound) / totalPercentage) * 100 : 0}%` }} />
                      </div>
                    </div>
                  )}
                  {enabledRounds.length === 0 && <p className="text-sm text-gray-400 italic">No rounds configured</p>}
                </div>
              </SectionCard>

              {/* Time Allocation Table (fixed mode only) */}
              {mode === 'fixed' && enabledRounds.length > 0 && (
                <SectionCard title="Time Allocation" icon={Clock}>
                  <div className="overflow-hidden rounded-lg border border-gray-200">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-left">
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
                            <tr key={r.type}>
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
                        <tr className="bg-gray-50 font-semibold">
                          <td className="px-4 py-2.5 text-gray-900">Total</td>
                          <td className="px-4 py-2.5 text-gray-900 text-right">{totalPercentage}%</td>
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
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Must-To-Have Clusters</h4>
                        <div className="space-y-3">
                          {mthClusters.map(cluster => (
                            <div key={cluster.id} className="border border-gray-200 rounded-lg p-4">
                              <div className="flex items-center gap-2 mb-2">
                                <PriorityBadge p={cluster.priority} />
                                <span className="text-sm font-semibold text-gray-900">{cluster.name}</span>
                                <span className="text-xs text-gray-400 ml-auto">{cluster.skills.length} skill{cluster.skills.length !== 1 ? 's' : ''}</span>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {cluster.skills.map(skill => (
                                  <span key={skill} className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 text-xs text-gray-700">{skill}</span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {nthClusters.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Nice-To-Have Clusters</h4>
                        <div className="space-y-3">
                          {nthClusters.map(cluster => (
                            <div key={cluster.id} className="border border-gray-200 rounded-lg p-4">
                              <div className="flex items-center gap-2 mb-2">
                                <PriorityBadge p={cluster.priority} />
                                <span className="text-sm font-semibold text-gray-900">{cluster.name}</span>
                                <span className="text-xs text-gray-400 ml-auto">{cluster.skills.length} skill{cluster.skills.length !== 1 ? 's' : ''}</span>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {cluster.skills.map(skill => (
                                  <span key={skill} className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 text-xs text-gray-700">{skill}</span>
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
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Selected HR Questions</p>
                      <ol className="space-y-2">
                        {((hrRound as any).hr_questions as { id: string; question_text: string; answer_type: string }[]).map((q, idx) => (
                          <li key={q.id} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-200 text-gray-600 text-[10px] font-bold flex items-center justify-center mt-0.5">{idx + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-800">{q.question_text}</p>
                              <span className="text-[10px] text-gray-400 mt-0.5 inline-block">{q.answer_type === 'yes_no' ? 'Yes / No' : 'Text answer'}</span>
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
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
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
                      <video src={config.introduction_video_url} controls className="w-full max-w-md rounded-lg border border-gray-200 bg-black" style={{ maxHeight: '240px' }}>
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
                          <span key={lang} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-100 text-xs text-gray-700">
                            <Globe className="w-3 h-3 text-gray-400" />{lang}
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
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-semibold text-gray-900">{invitationStats.total}</div>
                    <div className="text-xs text-gray-500 mt-1">Total Invited</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-semibold text-green-600">{invitationStats.completed}</div>
                    <div className="text-xs text-gray-500 mt-1">Completed</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-semibold text-yellow-600">{invitationStats.inProgress}</div>
                    <div className="text-xs text-gray-500 mt-1">In Progress</div>
                  </div>
                </div>
              </SectionCard>

            </div>
          )}


          {/* Recent Activity Tab */}
          {activeTab === 'activity' && (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
              {activityLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : recentActivity.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                  <p className="text-gray-500 mb-2">No candidate activity yet</p>
                  <p className="text-sm text-gray-400">Invite candidates to see their activity here</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentActivity.map((activity) => {
                    const statusIcon = () => {
                      switch (activity.status) {
                        case 'completed': return <CheckCircle className="w-5 h-5 text-green-500" />;
                        case 'in_progress': return <Play className="w-5 h-5 text-yellow-500" />;
                        case 'invited': return <Mail className="w-5 h-5 text-blue-500" />;
                        case 'cancelled': return <XCircle className="w-5 h-5 text-red-500" />;
                        default: return <Mail className="w-5 h-5 text-gray-400" />;
                      }
                    };

                    return (
                      <div
                        key={activity.id}
                        onClick={() => handleCandidateClick(activity.id)}
                        className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
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
                          <ChevronRight className="w-4 h-4 text-gray-400" />
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
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-5 h-5 text-gray-600" />
                  <h3 className="text-sm font-medium text-gray-900">Version History</h3>
                </div>
                <p className="text-sm text-gray-600">Complete timeline of all changes made to this interview</p>
              </div>
              {versionsLoading ? (
                <div className="px-6 py-12 text-center">
                  <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin mx-auto mb-3"></div>
                  <p className="text-gray-600">Loading version history...</p>
                </div>
              ) : versionHistory.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-600 mb-1 text-sm">No version history available</p>
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
                          <div className="w-12 h-12 bg-teal-500 rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-white font-bold text-sm">V{version.version}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-1">
                              <h4 className="text-base font-semibold text-gray-900">
                                Version {version.version} {isFirstVersion ? 'Published' : 'Updated'}
                              </h4>
                              {isCurrentVersion && (
                                <span className="px-2.5 py-1 bg-gray-700 text-white text-xs font-medium rounded w-fit">
                                  Current Version
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-600 mb-3">
                              {isFirstVersion ? 'Initial interview configuration created' : (version.change_summary || 'Interview configuration updated')}
                            </p>
                            <div className="flex items-center gap-2 text-sm text-gray-700 mb-1">
                              <Users className="w-4 h-4 text-gray-500 flex-shrink-0" />
                              <span className="font-medium">{version.changed_by_name || 'Unknown User'}</span>
                              <span className="text-gray-400">•</span>
                              <span className="text-gray-600">Lead Recruiter</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
                              <Calendar className="w-4 h-4 text-gray-500 flex-shrink-0" />
                              <span>Published on {versionDate} IST (UTC+5:30)</span>
                            </div>
                            <div className="bg-gray-100 border border-gray-200 rounded-lg p-4">
                              <div className="text-sm font-medium text-gray-900 mb-3">
                                {version.version === 1 ? 'Initial Configuration:' : 'Updated Configuration:'}
                              </div>
                              <ul className="space-y-2">
                                {version.rounds_config && version.rounds_config.filter((r: any) => r.enabled !== false).length > 0 && (
                                  <li className="text-sm text-gray-700 flex items-start gap-2">
                                    <span className="text-gray-600 mt-0.5">•</span>
                                    <span>Interview rounds: {version.rounds_config.filter((r: any) => r.enabled !== false).map((r: any) => ROUND_LABELS[r.type] || r.type).join(', ')}</span>
                                  </li>
                                )}
                                <li className="text-sm text-gray-700 flex items-start gap-2">
                                  <span className="text-gray-600 mt-0.5">•</span>
                                  <span>Duration set to {version.duration_minutes || config.duration_minutes || 30} min</span>
                                </li>
                                {version.jd_title && (
                                  <li className="text-sm text-gray-700 flex items-start gap-2">
                                    <span className="text-gray-600 mt-0.5">•</span>
                                    <span>Linked to job posting: {version.jd_title}</span>
                                  </li>
                                )}
                                {version.total_questions && (
                                  <li className="text-sm text-gray-700 flex items-start gap-2">
                                    <span className="text-gray-600 mt-0.5">•</span>
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
                junior: 'bg-blue-100 text-blue-700 border-blue-200',
                mid: 'bg-indigo-100 text-indigo-700 border-indigo-200',
                senior: 'bg-purple-100 text-purple-700 border-purple-200',
                lead: 'bg-pink-100 text-pink-700 border-pink-200',
                expert: 'bg-red-100 text-red-700 border-red-200',
              };
              return val ? (map[val] || 'bg-gray-100 text-gray-700 border-gray-200') : 'bg-gray-100 text-gray-700 border-gray-200';
            };
            const mthSkills: string[] = config.jd_must_have_skills || [];
            const nthSkills: string[] = config.jd_nice_to_have_skills || [];
            return (
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
                <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-b border-gray-200">
                  <div className="flex items-center gap-2 mb-1">
                    <Briefcase className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                    <h3 className="text-sm sm:text-base font-medium text-gray-900">AI Interview Info</h3>
                  </div>
                  <p className="text-xs sm:text-sm text-gray-600">Metadata from the job description used to configure this interview</p>
                </div>
                <div className="p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
                  {/* Key Metadata Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {/* Experience Level */}
                    <div className="rounded-lg border border-gray-200 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="p-1.5 bg-gray-100 rounded-lg">
                          <Layers className="w-4 h-4 text-gray-600" />
                        </div>
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Experience Level</span>
                      </div>
                      {config.jd_experience_level ? (
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${expColor(config.jd_experience_level)}`}>
                          {expLabel(config.jd_experience_level) || config.jd_experience_level}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">Not available</span>
                      )}
                    </div>

                    {/* Interview Mode */}
                    <div className="rounded-lg border border-gray-200 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="p-1.5 bg-gray-100 rounded-lg">
                          <Timer className="w-4 h-4 text-gray-600" />
                        </div>
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Interview Mode</span>
                      </div>
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${interviewMode === 'fixed' ? 'bg-gray-100 text-gray-700 border-gray-200' : 'bg-blue-100 text-blue-700 border-blue-200'}`}>
                        {interviewMode === 'fixed' ? `Fixed — ${config.duration_minutes} min` : 'Flexible'}
                      </span>
                    </div>

                    {/* Industry */}
                    <div className="rounded-lg border border-gray-200 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="p-1.5 bg-gray-100 rounded-lg">
                          <Globe className="w-4 h-4 text-gray-600" />
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
                    <div className="rounded-lg border border-gray-200 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="p-1.5 bg-gray-100 rounded-lg">
                          <Video className="w-4 h-4 text-gray-600" />
                        </div>
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Recording</span>
                      </div>
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${config.recording_enabled ? 'bg-green-100 text-green-700 border-green-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                        {config.recording_enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>

                    {/* AI Voice Language */}
                    <div className="rounded-lg border border-gray-200 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="p-1.5 bg-gray-100 rounded-lg">
                          <Globe className="w-4 h-4 text-gray-600" />
                        </div>
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">AI Voice Language</span>
                      </div>
                      <span className="text-sm font-medium text-gray-900">{config.ai_voice_language || 'English (US)'}</span>
                    </div>

                    {/* Candidate Languages */}
                    <div className="rounded-lg border border-gray-200 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="p-1.5 bg-gray-100 rounded-lg">
                          <Globe className="w-4 h-4 text-gray-600" />
                        </div>
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Candidate Languages</span>
                      </div>
                      {languages.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {languages.map((lang, i) => (
                            <span key={i} className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">{lang}</span>
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
                        <Brain className="w-4 h-4 text-purple-600" />
                        <h4 className="text-sm font-medium text-gray-900">Must-Have Skills</h4>
                        <span className="text-xs text-gray-500">({mthSkills.length})</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {mthSkills.map((skill: string) => (
                          <span key={skill} className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-purple-50 text-purple-700 border border-purple-200">{skill}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Nice-to-Have Skills */}
                  {nthSkills.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Sparkles className="w-4 h-4 text-indigo-500" />
                        <h4 className="text-sm font-medium text-gray-900">Nice-to-Have Skills</h4>
                        <span className="text-xs text-gray-500">({nthSkills.length})</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {nthSkills.map((skill: string) => (
                          <span key={skill} className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-indigo-50 text-indigo-700 border border-indigo-200">{skill}</span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{confirmAction.title}</h3>
            <p className="text-sm text-gray-600 mb-6">{confirmAction.message}</p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmAction.onConfirm}
                disabled={actionLoading}
                className={`px-4 py-2 text-sm text-white rounded-md transition-colors disabled:opacity-50 ${
                  confirmAction.type === 'delete' ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-800 hover:bg-gray-900'
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
