'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import {
  ArrowLeft, ChevronLeft, Video, Clock, Users, Calendar, CheckCircle, Play, Mail,
  XCircle, Copy, Trash2, Archive, ArchiveRestore, GitBranch, Eye,
  Loader2, RefreshCw, Briefcase, Globe, ChevronRight, Brain, Sparkles,
  Layers, Pencil, Zap, Timer, FileText, Settings, CheckCircle2, Download, Send,
  Search, Ban, TrendingUp, X, QrCode,
} from 'lucide-react';
import { toast } from 'sonner';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import { jdService } from '@/lib/services/jdService';
import type {
  AIInterviewResponse,
  AIInterviewVersionHistoryItem,
  AIInterviewHRQuestion,
} from '@/lib/services/aiInterviewService';
import CandidateResultsView from './CandidateResultsView';
import AIInterviewResults from './AIInterviewResults';
import ShareAIInterviewModal from './ShareAIInterviewModal';
import { QuestionDistributionPopover } from './QuestionDistributionPopover';
import { PROXY_INTEGRITY_VERIFICATION_ENABLED } from '@/lib/constants/featureFlags';
import { formatIST, formatISTDate, parseIST } from '@/lib/utils/dateUtils';
import { getPriorityLabel } from '@/lib/constants/aiInterviewPriority';
import { modeFromConfig, modeFromDuration } from '@/lib/constants/aiInterviewMode';
import PageBreadcrumb, { type BreadcrumbCrumb } from '@/components/PageBreadcrumb';
import RecordPager from '@/components/RecordPager';

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

function SectionCard({
  title,
  icon: Icon,
  children,
  titleAfter,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  titleAfter?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-100 bg-gray-50">
        <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
          <Icon className="w-4 h-4 text-brand-blue" />
        </div>
        <h3 className="text-sm font-semibold text-gray-800 tracking-tight">{title}</h3>
        {titleAfter}
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

function HRQuestionStageBadge({ stage }: { stage?: string }) {
  const normalized = stage === 'opening' ? 'opening' : 'closing';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
      normalized === 'opening'
        ? 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20'
        : 'bg-green-100 text-green-700 ring-1 ring-green-200'
    }`}>
      {normalized}
    </span>
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

interface AIInterviewDetailsViewProps {
  config: AIInterviewResponse;
  onBack: () => void;
  onRefresh?: () => void;
  currentIndex?: number;
  totalCount?: number;
  onPrev?: () => void;
  onNext?: () => void;
  /**
   * Overrides the default AI Interviews trail. Set when this page is reached
   * from a JD (Job Details → AI Interview → Create on a job that already has
   * one), so the breadcrumb stays anchored to that job instead of resetting.
   */
  breadcrumbItems?: BreadcrumbCrumb[];
}

export default function AIInterviewDetailsView({ config, onBack, onRefresh, currentIndex, totalCount, onPrev, onNext, breadcrumbItems }: AIInterviewDetailsViewProps) {
  const router = useRouter();
  const { user, isTenantAdmin } = useAuth();
  const canCreateAIInterviews = isTenantAdmin || !!user?.permissions?.canCreateAIInterviews;
  const canUpdateAIInterviews = isTenantAdmin || !!user?.permissions?.canUpdateAIInterviews;
  const canArchiveAIInterviews = isTenantAdmin || !!user?.permissions?.canArchiveAIInterviews;
  const canDeleteAIInterviews = isTenantAdmin || !!user?.permissions?.canDeleteAIInterviews;
  const canShareAIInterviews = isTenantAdmin || !!user?.permissions?.canShareAIInterviews;
  const [activeTab, setActiveTab] = useState<'overview' | 'activity' | 'versions' | 'info' | 'results' | 'invites' | 'share'>('overview');
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
  // Ordered candidate ids of the list the detail was opened from (Invites /
  // Results tab), so the inline Candidate Results view can offer Prev/Next
  // between candidates without returning to the list.
  const [candidateNavIds, setCandidateNavIds] = useState<string[]>([]);

  // Invites tab filters (mirrors the Candidate Invitations modal on the list page)
  const [inviteSearch, setInviteSearch] = useState('');
  const [inviteStatusFilter, setInviteStatusFilter] = useState('all');
  const [inviteDateFrom, setInviteDateFrom] = useState('');
  const [inviteDateTo, setInviteDateTo] = useState('');

  // Confirmation dialog
  const [confirmAction, setConfirmAction] = useState<{ type: string; title: string; message: string; onConfirm: () => void } | null>(null);
  // Controls "Show more / less" toggle on the published JD description card
  // inside the AI Interview Info tab. Default collapsed so long JDs don't push
  // metadata cards below the fold.
  const [jdDescExpanded, setJdDescExpanded] = useState(false);
  // Fallback JD description: fixed-mode configs don't snapshot jd_description
  // at creation time (see AIInterviewConfig.tsx — only flexible mode does).
  // For those, fetch the live JD on demand when the Info tab is opened so the
  // recruiter still sees the description.
  const [fetchedJdDesc, setFetchedJdDesc] = useState<string | null>(null);
  const [fetchedJdLoading, setFetchedJdLoading] = useState(false);

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
  const languages = config.available_languages ?? (config.ai_voice_language ? [config.ai_voice_language] : ['English']);

  const loadActivity = useCallback(async () => {
    setActivityLoading(true);
    try {
      const result = await aiInterviewService.getConfigInvitations(config.id, { page: 1, page_size: 100, compact: true });
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

  // Preload the live JD description on mount when the config's snapshot is
  // empty (fixed-mode case). Firing on mount instead of on Info-tab activation
  // means the description is almost always ready by the time the recruiter
  // navigates to the tab — no visible loading state.
  useEffect(() => {
    if (config.jd_description && config.jd_description.trim()) return;
    if (!config.jd_id) return;
    if (fetchedJdDesc !== null || fetchedJdLoading) return;

    let cancelled = false;
    setFetchedJdLoading(true);
    jdService.getById(config.jd_id)
      .then(jd => {
        if (cancelled) return;
        setFetchedJdDesc((jd?.description ?? '').trim() || '');
      })
      .catch(() => {
        if (cancelled) return;
        setFetchedJdDesc(''); // mark attempted so we don't retry on every render
      })
      .finally(() => {
        if (!cancelled) setFetchedJdLoading(false);
      });

    return () => { cancelled = true; };
  }, [config.jd_id, config.jd_description, fetchedJdDesc, fetchedJdLoading]);

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
    const hrQuestions = hrRound?.hr_questions ?? [];
    if (hrQuestions.length > 0) {
      rows.push(['#', 'Question', 'Answer Type', 'Stage'].map(esc).join(','));
      hrQuestions.forEach((q, i) => {
        rows.push([
          String(i + 1),
          q.question_text ?? '',
          q.answer_type ?? 'text',
          q.stage === 'opening' ? 'opening' : 'closing',
        ].map(esc).join(','));
      });
    } else {
      rows.push(['-', 'No HR questions configured or HR round disabled', '', ''].map(esc).join(','));
    }

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${displayId}-clusters-hr.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported to CSV');
    void aiInterviewService.logConfigExport(config.id);
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

  const handleCandidateClick = useCallback(async (activityId: string, navIds?: string[]) => {
    if (navIds) setCandidateNavIds(navIds);
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
    // Prev/Next between candidates in the list this detail was opened from.
    const navIdx = candidateNavIds.indexOf(candidateDetail.id);
    const prevId = navIdx > 0 ? candidateNavIds[navIdx - 1] : null;
    const nextId = navIdx >= 0 && navIdx < candidateNavIds.length - 1 ? candidateNavIds[navIdx + 1] : null;
    // The interview the candidate belongs to stays in the trail, so it reads
    // … › <interview> › <candidate> rather than dropping the page the recruiter
    // just came from. onClick, not href: this view lives on the interview's own
    // route, so a link couldn't switch the body back to the candidate list.
    const backToInterview = () => setCandidateDetail(null);
    const interviewLabel = config.jd_title || config.position || 'Interview Details';
    const candidateLabel = candidateDetail.candidate_name || 'Candidate Results';
    return (
      <CandidateResultsView
        interview={candidateDetail}
        onBack={backToInterview}
        // A caller-supplied trail (reached from a JD's Job Details page) is
        // anchored somewhere else entirely, so extend that one instead of the
        // AI Interviews trail — its last crumb is this interview.
        {...(breadcrumbItems
          ? {
              breadcrumbItems: [
                ...breadcrumbItems.slice(0, -1),
                { ...breadcrumbItems[breadcrumbItems.length - 1], href: undefined, onClick: backToInterview },
                { label: candidateLabel },
              ],
            }
          : { breadcrumbTrail: [{ label: interviewLabel, onClick: backToInterview }] })}
        currentIndex={navIdx >= 0 ? navIdx : undefined}
        totalCount={candidateNavIds.length || undefined}
        onPrev={prevId ? () => handleCandidateClick(prevId) : undefined}
        onNext={nextId ? () => handleCandidateClick(nextId) : undefined}
      />
    );
  }

  return (
    <main className="flex-1 overflow-x-clip bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full min-h-[calc(100dvh-7rem)] bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl">
          {/* Previous / Next rides inside the breadcrumb bar, as on
              job-details, so it stays reachable while the sticky crumb is
              pinned. Passed as undefined when there's no list to page through,
              which leaves the bar exactly as it was. */}
          <PageBreadcrumb
            className="mb-4 md:mb-6"
            items={breadcrumbItems ?? [
              { label: 'Dashboard', href: '/dashboard' },
              { label: 'AI Interviews', href: '/recruitment/ai-interviews' },
              { label: config.jd_title || config.position || 'Interview Details' },
            ]}
            actions={totalCount != null && totalCount > 0 ? (
              <RecordPager
                currentIndex={currentIndex}
                totalCount={totalCount}
                onPrev={onPrev}
                onNext={onNext}
              />
            ) : undefined}
          />
      {/* Loading overlay for candidate fetch */}
      {candidateLoading && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-white/60">
          <Loader2 className="w-8 h-8 animate-spin text-brand-blue" />
        </div>
      )}
      {/* Header */}
      <div className="bg-brand-blue rounded-xl shadow-sm shadow-brand-blue/20 ring-1 ring-white/10 mb-4">
        <div className="py-2.5 sm:py-3 lg:py-3.5 px-3 sm:px-4 lg:px-5">
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
                      <><Timer className="w-2.5 h-2.5" /> Timed</>
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
      <div className="border-b border-gray-100 z-10 mb-4">
        <div>
          <div className="flex gap-1 sm:gap-4 lg:gap-6 overflow-x-auto scrollbar-hide -mb-px">
            {(() => {
              const tabs: { key: typeof activeTab; label: string }[] = [
                { key: 'overview', label: 'Interview Details' },
                { key: 'activity', label: 'Recent Activity' },
                { key: 'versions', label: 'Version History' },
                { key: 'info', label: 'AI Interview Info' },
                { key: 'results', label: 'Results' },
                { key: 'invites', label: 'Invites' },
              ];
              // Share tab mirrors the list card: only for published interviews
              // and only when the user can share.
              if (config.status === 'published' && canShareAIInterviews) {
                tabs.push({ key: 'share', label: 'Share' });
              }
              return tabs;
            })().map((t) => {
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
      <div className="py-4 sm:py-6 space-y-4 sm:space-y-6">

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
                        <p className="text-sm font-semibold text-gray-900">Timed — {duration} min</p>
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

              {/* Mobile Environment Verification — hidden with the Configure-step
                  toggle while the feature is unapproved, so the client never sees
                  the feature named anywhere. */}
              {PROXY_INTEGRITY_VERIFICATION_ENABLED && (
              <SectionCard title="Mobile Environment Verification" icon={QrCode}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${config.environment_verification_enabled ? 'bg-brand-blue/10 ring-1 ring-brand-blue/20' : 'bg-gray-100 ring-1 ring-gray-200'}`}>
                      <QrCode className={`w-5 h-5 ${config.environment_verification_enabled ? 'text-brand-blue' : 'text-gray-400'}`} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {config.environment_verification_enabled ? 'QR Trigger Enabled' : 'QR Trigger Disabled'}
                      </p>
                      <p className="text-xs text-gray-500">
                        Pauses the interview once, after the first must-have-skills question, to verify the candidate's physical environment via a QR code and their phone's camera.
                      </p>
                    </div>
                  </div>
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ring-1 whitespace-nowrap ${config.environment_verification_enabled ? 'bg-green-100 text-green-700 ring-green-200' : 'bg-gray-100 text-gray-600 ring-gray-200'}`}>
                    {config.environment_verification_enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </SectionCard>
              )}

              {/* Time Allocation Table (fixed mode only) */}
              {mode === 'fixed' && enabledRounds.length > 0 && (
                <SectionCard title="Time Allocation" icon={Clock}>
                  <div className="overflow-hidden rounded-lg border border-gray-100 ring-1 ring-black/[0.02] tf-table-shell">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-left border-b border-gray-100">
                          <th className="px-4 py-2.5 font-medium text-gray-600">Round</th>
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
                <SectionCard
                  title="Skill Clusters"
                  icon={Layers}
                  titleAfter={
                    // Stealth dot — same hidden-affordance pattern as the cluster
                    // editor page. Tiny 1.5×1.5 gray dot, blank aria-label, sits
                    // flush with the header. Click opens the Question Distribution
                    // popover. Timed-mode only; flexible mode has no fixed slot
                    // mapping.
                    mode === 'fixed' && (mthClusters.length > 0 || (nthEnabled && nthClusters.length > 0))
                      ? (() => {
                          // Each secondary carries its own priority so the UI can
                          // render per-skill P1/P2/P3 badges (secondaries may
                          // come from a 0-alloc orphan cluster with a different
                          // priority than the primary's cluster).
                          type DistRow = { q: number; primary: string; secondaries: { name: string; priority: number }[]; cluster: string; priority: number };
                          // Distribute skills across N questions deterministically.
                          // Ported verbatim from AIInterviewClusters.tsx so the
                          // create-page popover and the details-page popover
                          // always show the same per-Q skill mapping.
                          const distribute = (clusters: typeof mthClusters, qCount: number, jdPool: string[] = []): DistRow[] => {
                            if (qCount <= 0 || clusters.length === 0) return [];
                            const _jdPoolSeen = new Set<string>();
                            const jdPoolClean: string[] = [];
                            for (const s of jdPool) {
                              if (typeof s !== 'string') continue;
                              const t = s.trim();
                              if (!t) continue;
                              const k = t.toLowerCase();
                              if (_jdPoolSeen.has(k)) continue;
                              _jdPoolSeen.add(k);
                              jdPoolClean.push(t);
                            }
                            const sorted = [...clusters]
                              .filter(c => (c.skills?.length ?? 0) > 0)
                              .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
                            if (sorted.length === 0) return [];

                            // STEP 1 — per-cluster Q allocation by skill count
                            const skillCounts = sorted.map(c => (c.skills?.length ?? 0));
                            const totalSkills = skillCounts.reduce((s, n) => s + n, 0);
                            const rawAlloc = sorted.map((_, i) =>
                              totalSkills > 0
                                ? (qCount * skillCounts[i]) / totalSkills
                                : 0,
                            );
                            const allocations = rawAlloc.map(r => Math.floor(r));
                            if (qCount < sorted.length) {
                              for (let i = 0; i < allocations.length; i++) {
                                allocations[i] = i < qCount ? 1 : 0;
                              }
                            } else {
                              for (let i = 0; i < allocations.length; i++) {
                                if (allocations[i] === 0 && skillCounts[i] > 0) allocations[i] = 1;
                              }
                            }
                            let diff = qCount - allocations.reduce((a, b) => a + b, 0);
                            while (diff < 0) {
                              let trimIdx = -1;
                              let trimSlack = -1;
                              for (let i = 0; i < allocations.length; i++) {
                                if (allocations[i] > 1) {
                                  const slack = allocations[i] - (qCount < sorted.length ? 1 : 0);
                                  if (slack > trimSlack) { trimSlack = slack; trimIdx = i; }
                                }
                              }
                              if (trimIdx < 0) break;
                              allocations[trimIdx] -= 1;
                              diff += 1;
                            }
                            while (diff > 0) {
                              const fracs = rawAlloc
                                .map((r, i) => ({
                                  frac: r - Math.floor(r),
                                  priority: sorted[i].priority ?? 1,
                                  skillCount: skillCounts[i],
                                  i,
                                }))
                                .filter(({ skillCount }) => skillCount > 0)
                                .sort((a, b) =>
                                  b.frac - a.frac
                                  || b.priority - a.priority
                                  || b.skillCount - a.skillCount,
                                );
                              if (fracs.length === 0) break;
                              allocations[fracs[0].i] += 1;
                              diff -= 1;
                            }

                            // STEP 2 — build per-Q rows
                            const bucketUsedLower = new Set<string>();
                            const out: DistRow[] = [];
                            let qNum = 0;
                            const orphanSkills: { skill: string; cluster: typeof mthClusters[number] }[] = [];
                            for (let ci = 0; ci < sorted.length; ci++) {
                              const cluster = sorted[ci];
                              const alloc = allocations[ci];
                              const skills = (cluster.skills ?? []).filter(
                                s => typeof s === 'string' && s.trim()
                              );
                              if (alloc === 0 || skills.length === 0) {
                                for (const s of skills) orphanSkills.push({ skill: s, cluster });
                                continue;
                              }
                              const primaries: string[] = [];
                              if (alloc <= skills.length) {
                                primaries.push(...skills.slice(0, alloc));
                              } else {
                                primaries.push(...skills);
                                const usedLower = new Set(skills.map(s => s.toLowerCase()));
                                for (const jdSkill of jdPoolClean) {
                                  if (primaries.length >= alloc) break;
                                  if (usedLower.has(jdSkill.toLowerCase())) continue;
                                  primaries.push(jdSkill);
                                  usedLower.add(jdSkill.toLowerCase());
                                }
                                for (let p = primaries.length; p < alloc; p++) {
                                  primaries.push(skills[p % skills.length]);
                                }
                              }
                              for (const p of primaries) bucketUsedLower.add(p.toLowerCase());
                              const leftover = alloc <= skills.length ? skills.slice(alloc) : [];
                              for (let i = 0; i < primaries.length; i++) {
                                qNum += 1;
                                const start = Math.floor((i * leftover.length) / primaries.length);
                                const end = Math.floor(((i + 1) * leftover.length) / primaries.length);
                                let secs: { name: string; priority: number }[];
                                if (leftover.length > 0) {
                                  const slice = leftover.slice(start, end);
                                  for (const s of slice) bucketUsedLower.add(s.toLowerCase());
                                  secs = slice.map(s => ({
                                    name: s,
                                    priority: cluster.priority ?? 1,
                                  }));
                                } else {
                                  const cycled = alloc > skills.length;
                                  const picked: string[] = [];
                                  if (cycled) {
                                    const tryPick = (cand: string) => {
                                      const k = cand.toLowerCase();
                                      if (bucketUsedLower.has(k)) return;
                                      bucketUsedLower.add(k);
                                      picked.push(cand);
                                    };
                                    for (let j = 0; j < jdPoolClean.length && picked.length < 2; j++) {
                                      tryPick(jdPoolClean[j]);
                                    }
                                    if (picked.length < 2) {
                                      for (let j = 0; j < skills.length && picked.length < 2; j++) {
                                        tryPick(skills[j]);
                                      }
                                    }
                                  }
                                  secs = picked.map(s => ({
                                    name: s,
                                    priority: cluster.priority ?? 1,
                                  }));
                                }
                                out.push({
                                  q: qNum,
                                  primary: primaries[i],
                                  secondaries: secs,
                                  cluster: cluster.name ?? '',
                                  priority: cluster.priority ?? 1,
                                });
                              }
                            }

                            // STEP 3 — orphan-cluster skills go to Q with fewest secondaries (no cap)
                            for (const o of orphanSkills) {
                              const target = out
                                .slice()
                                .sort((a, b) => a.secondaries.length - b.secondaries.length)[0];
                              if (!target) break;
                              target.secondaries.push({
                                name: o.skill,
                                priority: o.cluster.priority ?? 1,
                              });
                            }
                            return out;
                          };
                          // JD pool widening — same logic as create page, minus
                          // the mthSkills/nthSkills pool objects which only exist
                          // mid-edit. We still exclude the other bucket's skills
                          // so NTH secondaries can't accidentally pull MTH skills.
                          const _otherBucketLower = (bucket: 'mth' | 'nth') => {
                            const otherClusters = bucket === 'mth' ? nthClusters : mthClusters;
                            return new Set(
                              otherClusters
                                .flatMap(c => c.skills ?? [])
                                .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
                                .map(s => s.toLowerCase()),
                            );
                          };
                          const mthExclude = _otherBucketLower('mth');
                          const nthExclude = _otherBucketLower('nth');
                          const mthJdPool = Array.from(new Set([
                            ...mthClusters.flatMap(c => c.skills),
                            ...(((config as any)?.jd_must_have_skills as string[] | undefined) ?? []),
                          ].filter((s): s is string => typeof s === 'string' && s.trim().length > 0 && !mthExclude.has(s.toLowerCase()))));
                          const nthJdPool = Array.from(new Set([
                            ...nthClusters.flatMap(c => c.skills),
                            ...(((config as any)?.jd_nice_to_have_skills as string[] | undefined) ?? []),
                          ].filter((s): s is string => typeof s === 'string' && s.trim().length > 0 && !nthExclude.has(s.toLowerCase()))));
                          // The saved plan, its precedence rules and the
                          // popover chrome all live in
                          // QuestionDistributionPopover so this page and the
                          // results page can never drift apart. Only the
                          // unsaved-config PREVIEW is local, so it is handed
                          // over as a thunk and runs only when nothing has
                          // been saved yet.
                          return (
                            <QuestionDistributionPopover
                              specialInstructions={(config as any)?.special_instructions}
                              clusters={[...mthClusters, ...nthClusters]}
                              fallback={() => ({
                                mth: distribute(mthClusters, timedAllocation.mthQuestions ?? 0, mthJdPool),
                                nth: nthEnabled
                                  ? distribute(nthClusters, timedAllocation.nthQuestions ?? 0, nthJdPool)
                                  : [],
                              })}
                            />
                          );
                        })()
                      : null
                  }
                >
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
                  {hrRound.hr_questions?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-brand-cyan uppercase tracking-wide mb-2">Selected HR Questions</p>
                      <ol className="space-y-2">
                        {(hrRound.hr_questions as AIInterviewHRQuestion[]).map((q, idx) => (
                          <li key={q.id} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-gradient-to-br from-brand-cyan/5 to-brand-teal/5 border border-gray-100 ring-1 ring-brand-cyan/10">
                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-brand-cyan text-white text-[10px] font-bold flex items-center justify-center mt-0.5 shadow-sm">{idx + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-800">{q.question_text}</p>
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                <span className="text-[10px] text-gray-500">{q.answer_type === 'yes_no' ? 'Yes / No' : 'Text answer'}</span>
                                <HRQuestionStageBadge stage={q.stage} />
                              </div>
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
                <div className="flex items-center justify-center py-12 tf-loader-center tf-loader-center--compact">
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
                        onClick={() => handleCandidateClick(activity.id, recentActivity.map(a => a.id))}
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
            <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 tf-round-edges">
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
            // Render the published-JD card only when the interview was actually
            // wired to a JD (jd_id is the FK; short_id/title may be backfilled
            // even for ad-hoc configs, so we anchor on jd_id).
            const hasPublishedJd = Boolean(config.jd_id);
            // Prefer the snapshot (what the interview was actually configured
            // against), fall back to the live JD description we fetched on
            // demand for fixed-mode configs that didn't snapshot it.
            const jdDesc = ((config.jd_description ?? '').trim()
              || (fetchedJdDesc ?? '').trim());
            // ~280 chars ≈ 4 lines at the rendered font size; long enough to
            // show a useful summary but short enough that we don't dominate the
            // tab when descriptions are huge.
            const DESC_PREVIEW_CHARS = 280;
            const descTruncated = jdDesc.length > DESC_PREVIEW_CHARS;
            return (
              <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 tf-round-edges">
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
                  {/* Published JD card — anchored on jd_id so ad-hoc configs
                      (no linked JD) don't show an empty stub. */}
                  {hasPublishedJd && (
                    <div className="rounded-xl overflow-hidden border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 bg-white">
                      <div className="bg-gradient-to-br from-brand-blue to-brand-blue-2 px-4 sm:px-5 py-3 sm:py-4 ring-1 ring-white/10">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <FileText className="w-4 h-4 text-white/90 flex-shrink-0" />
                            <span className="text-xs font-medium text-white/90 uppercase tracking-wide">Job Description</span>
                            {config.jd_short_id && (
                              <span className="px-2 py-0.5 rounded-full bg-white/15 text-white text-[11px] font-medium ring-1 ring-white/20">
                                {config.jd_short_id}
                              </span>
                            )}
                            {config.jd_version != null && (
                              <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/90 text-[11px] font-medium ring-1 ring-white/15">
                                v{config.jd_version}
                              </span>
                            )}
                          </div>
                          <h4 className="text-base sm:text-lg font-bold text-white tracking-tight truncate">
                            {config.jd_title ?? 'Untitled Job Description'}
                          </h4>
                        </div>
                      </div>
                      <div className="px-4 sm:px-5 py-3 sm:py-4 space-y-3">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          <div>
                            <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-0.5">Experience</p>
                            <p className="text-sm font-medium text-gray-900">
                              {expLabel(config.jd_experience_level) || config.jd_experience_level || '—'}
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-0.5">Industry</p>
                            <p className="text-sm font-medium text-gray-900">{(config as any).jd_industry_type ?? '—'}</p>
                          </div>
                          <div>
                            <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-0.5">Skills</p>
                            <p className="text-sm font-medium text-gray-900">
                              {mthSkills.length + nthSkills.length}
                              <span className="text-xs text-gray-500 ml-1">({mthSkills.length} must / {nthSkills.length} nice)</span>
                            </p>
                          </div>
                        </div>
                        {jdDesc ? (
                          <div className="border-t border-gray-100 pt-3">
                            <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-1.5">Description</p>
                            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                              {descTruncated && !jdDescExpanded
                                ? `${jdDesc.slice(0, DESC_PREVIEW_CHARS).trimEnd()}…`
                                : jdDesc}
                            </p>
                            {descTruncated && (
                              <button
                                type="button"
                                onClick={() => setJdDescExpanded(v => !v)}
                                className="mt-2 text-xs font-medium text-brand-blue hover:text-brand-blue-2 transition-colors"
                              >
                                {jdDescExpanded ? 'Show less' : 'Show more'}
                              </button>
                            )}
                          </div>
                        ) : fetchedJdLoading ? (
                          // Brief no-op while the on-mount preload finishes —
                          // render an empty spacer so the card height doesn't
                          // visibly jump when the description arrives.
                          <div className="border-t border-gray-100 pt-3 h-6" />
                        ) : (
                          <div className="border-t border-gray-100 pt-3">
                            <p className="text-xs text-gray-400 italic">This JD has no description text.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

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
                        {interviewMode === 'fixed' ? `Timed — ${config.duration_minutes} min` : 'Flexible'}
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

                    {/* Mobile Environment Verification */}
                    <div className="rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-4 bg-white">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                          <QrCode className="w-4 h-4 text-brand-blue" />
                        </div>
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Mobile Environment Verification</span>
                      </div>
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ring-1 ${config.environment_verification_enabled ? 'bg-green-100 text-green-700 ring-green-200' : 'bg-gray-100 text-gray-600 ring-gray-200'}`}>
                        {config.environment_verification_enabled ? 'Enabled' : 'Disabled'}
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

          {/* Results Tab — embedded candidate results (stats + filters + table) */}
          {activeTab === 'results' && (
            <AIInterviewResults
              embedded
              configId={config.id}
              configTitle={config.position || config.jd_title || 'AI Interview'}
              jdTitle={config.jd_title || ''}
              onBack={onBack}
              onViewCandidate={handleCandidateClick}
            />
          )}

          {/* Invites Tab — mirrors the Candidate Invitations modal on the list page */}
          {activeTab === 'invites' && (() => {
            // Overview counts derived from the loaded invitations.
            const total = recentActivity.length;
            const completed = recentActivity.filter(a => a.status === 'completed').length;
            const inProgress = recentActivity.filter(a => a.status === 'in_progress').length;
            const terminated = recentActivity.filter(a => a.status === 'terminated').length;
            const cancelled = recentActivity.filter(a => a.status === 'cancelled').length;
            const invited = Math.max(0, total - completed - inProgress - terminated - cancelled);
            const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

            const statCards = [
              { label: 'Total', value: total, icon: Users, tone: 'text-gray-500', num: 'text-gray-900' },
              { label: 'Invited', value: invited, icon: Mail, tone: 'text-brand-blue', num: 'text-brand-blue' },
              { label: 'In Progress', value: inProgress, icon: Play, tone: 'text-brand-orange-deep', num: 'text-brand-orange-deep' },
              { label: 'Completed', value: completed, icon: CheckCircle, tone: 'text-green-600', num: 'text-green-600' },
              { label: 'Terminated', value: terminated, icon: Ban, tone: 'text-red-600', num: 'text-red-600' },
              { label: 'Cancelled', value: cancelled, icon: X, tone: 'text-red-600', num: 'text-red-600' },
              { label: 'Completion', value: `${completionRate}%`, icon: TrendingUp, tone: 'text-brand-cyan', num: 'text-brand-cyan' },
            ];

            const hasActiveFilters =
              inviteSearch.trim() !== '' || inviteStatusFilter !== 'all' || inviteDateFrom !== '' || inviteDateTo !== '';

            const filtered = recentActivity.filter((a) => {
              if (inviteStatusFilter !== 'all' && a.status !== inviteStatusFilter) return false;
              if (inviteSearch.trim()) {
                const q = inviteSearch.toLowerCase();
                if (!(a.candidate_name || '').toLowerCase().includes(q) &&
                    !(a.candidate_email || '').toLowerCase().includes(q)) return false;
              }
              if (inviteDateFrom || inviteDateTo) {
                /* Filter on the same moment the row prints as "Invited" — the
                   last send, falling back to created_at on pre-column rows. */
                const invitedAt = a.invitation_sent_at || a.created_at;
                if (!invitedAt) return false;
                const d = parseIST(invitedAt);
                if (inviteDateFrom && d < new Date(`${inviteDateFrom}T00:00:00`)) return false;
                if (inviteDateTo && d > new Date(`${inviteDateTo}T23:59:59`)) return false;
              }
              return true;
            });

            const clearFilters = () => {
              setInviteSearch(''); setInviteStatusFilter('all'); setInviteDateFrom(''); setInviteDateTo('');
            };

            // Status pill with icon — matches the reference modal.
            const statusPill = (status: string) => {
              switch (status) {
                case 'completed': return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 ring-1 ring-green-200 rounded-full text-xs font-medium"><CheckCircle className="w-3 h-3" /> Completed</span>;
                case 'in_progress': return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20 rounded-full text-xs font-medium"><Play className="w-3 h-3" /> In Progress</span>;
                case 'invited': return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20 rounded-full text-xs font-medium"><Mail className="w-3 h-3" /> Invited</span>;
                case 'terminated': return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 ring-1 ring-red-200 rounded-full text-xs font-medium"><Ban className="w-3 h-3" /> Terminated</span>;
                case 'cancelled': return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-600 ring-1 ring-red-200 rounded-full text-xs font-medium"><X className="w-3 h-3" /> Cancelled</span>;
                case 'expired': return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20 rounded-full text-xs font-medium"><Clock className="w-3 h-3" /> Expired</span>;
                default: return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(status)}`}>{getStatusLabel(status)}</span>;
              }
            };

            const resultsLabel = hasActiveFilters
              ? `${filtered.length} matching candidate${filtered.length === 1 ? '' : 's'}`
              : `${total} candidate${total !== 1 ? 's' : ''} invited`;

            return (
              <div className="space-y-4 sm:space-y-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-brand-blue flex items-center justify-center flex-shrink-0 shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
                      <Users className="w-5 h-5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold text-gray-900 tracking-tight">Candidate Invitations</h3>
                      <p className="text-sm text-gray-500 truncate">{config.jd_title || config.position}</p>
                    </div>
                  </div>
                  {config.status === 'published' && canShareAIInterviews && (
                    <button
                      onClick={() => setActiveTab('share')}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-brand-blue text-white rounded-lg shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 hover:bg-brand-blue-2 transition-colors self-start sm:self-auto"
                    >
                      <Send className="w-4 h-4" /> Invite More
                    </button>
                  )}
                </div>

                {/* Stat cards */}
                <div className="grid grid-cols-3 lg:grid-cols-7 gap-2 sm:gap-3">
                  {statCards.map((s) => {
                    const Icon = s.icon;
                    return (
                      <div key={s.label} className="bg-white rounded-xl p-3 border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5">
                        <div className={`flex items-center gap-1.5 text-[10px] sm:text-xs mb-1 ${s.tone}`}>
                          <Icon className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
                          <span className="truncate">{s.label}</span>
                        </div>
                        <p className={`text-lg sm:text-2xl font-bold tracking-tight ${s.num}`}>{s.value}</p>
                      </div>
                    );
                  })}
                </div>

                {/* Filter bar */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-blue" />
                    <input
                      type="text"
                      value={inviteSearch}
                      onChange={(e) => setInviteSearch(e.target.value)}
                      placeholder="Search by candidate name or email"
                      className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                    />
                  </div>
                  <select
                    value={inviteStatusFilter}
                    onChange={(e) => setInviteStatusFilter(e.target.value)}
                    className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                  >
                    <option value="all">All Statuses</option>
                    <option value="invited">Invited</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="terminated">Terminated</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="expired">Expired</option>
                  </select>
                  <input
                    type="date"
                    value={inviteDateFrom}
                    onChange={(e) => setInviteDateFrom(e.target.value)}
                    className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                  />
                  <input
                    type="date"
                    value={inviteDateTo}
                    onChange={(e) => setInviteDateTo(e.target.value)}
                    className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                  />
                  <button
                    onClick={clearFilters}
                    disabled={!hasActiveFilters}
                    className="px-3 py-2 text-sm text-gray-600 hover:text-brand-blue rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    Clear Filters
                  </button>
                </div>

                {/* Candidate list */}
                {activityLoading ? (
                  <div className="flex items-center justify-center py-12 tf-loader-center tf-loader-center--compact">
                    <Loader2 className="w-6 h-6 animate-spin text-brand-blue" />
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-12 bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02]">
                    <div className="w-20 h-20 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center mx-auto mb-4">
                      <Users className="w-10 h-10 text-brand-blue" />
                    </div>
                    <p className="text-gray-700 font-medium mb-2">
                      {hasActiveFilters ? 'No candidates match the current filters' : 'No candidates invited yet'}
                    </p>
                    <p className="text-sm text-gray-500">
                      {hasActiveFilters ? 'Try adjusting your search or filters' : 'Invite candidates to see them listed here'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filtered.map((a) => {
                      const capScore = (a as any).ai_evaluation?.capability_score;
                      const displayScore = capScore != null ? capScore : a.score;
                      // Requirement: clicking anywhere on the row opens View Details.
                      return (
                        <div
                          key={a.id}
                          onClick={() => handleCandidateClick(a.id, filtered.map(f => f.id))}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 p-3 sm:p-4 border border-gray-100 ring-1 ring-black/[0.02] rounded-xl bg-white cursor-pointer hover:border-brand-blue/30 hover:shadow-md hover:shadow-brand-blue/10 transition-all"
                        >
                          {/* Candidate info */}
                          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
                              <span className="text-xs sm:text-sm font-medium text-brand-blue">
                                {(a.candidate_name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium text-gray-900 text-sm truncate">{a.candidate_name || 'Unknown'}</div>
                              <div className="text-xs text-gray-500 truncate">{a.candidate_email}</div>
                            </div>
                          </div>

                          {/* Status + score + timeline + action */}
                          <div className="flex items-center gap-3 sm:gap-4 flex-wrap pl-11 sm:pl-0">
                            {statusPill(a.status)}

                            {displayScore != null && (() => {
                              // Round to whole number so this matches the detail
                              // page (17.5 → 18). Pass ≥ 60% → green, else red.
                              const rounded = Math.round(Number(displayScore));
                              const scoreColor = rounded >= 60 ? 'text-green-600' : 'text-red-600';
                              return (
                                <div className="text-right">
                                  <div className="text-[10px] text-gray-500">Score</div>
                                  <div className={`text-sm font-semibold ${scoreColor}`}>{rounded}%</div>
                                </div>
                              );
                            })()}

                            <div className="hidden sm:flex items-center gap-3 text-[10px] text-gray-400">
                              {(a.invitation_sent_at || a.created_at) && (
                                <span className="flex items-center gap-1" title="Invited">
                                  <Mail className="w-3 h-3 text-brand-blue" />
                                  {formatIST(a.invitation_sent_at || a.created_at)}
                                </span>
                              )}
                              {a.started_at && (
                                <span className="flex items-center gap-1" title="Started">
                                  <Play className="w-3 h-3 text-brand-orange" />
                                  {formatIST(a.started_at)}
                                </span>
                              )}
                              {a.completed_at && (
                                <span className="flex items-center gap-1" title="Completed">
                                  <CheckCircle className="w-3 h-3 text-green-500" />
                                  {formatIST(a.completed_at)}
                                </span>
                              )}
                            </div>

                            {(a.status === 'completed' || a.status === 'in_progress' || a.status === 'terminated') && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleCandidateClick(a.id, filtered.map(f => f.id)); }}
                                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-gray-200 bg-white text-gray-700 rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors"
                              >
                                <Eye className="w-3 h-3" />
                                View Details
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <div className="pt-1 text-xs sm:text-sm text-gray-500">{resultsLabel}</div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Share Tab — embedded send-invite form */}
          {activeTab === 'share' && config.status === 'published' && canShareAIInterviews && (
            <ShareAIInterviewModal
              embedded
              isOpen
              config={config}
              onClose={() => setActiveTab('overview')}
              onInviteSent={() => { loadActivity(); }}
            />
          )}

      </div>

      {/* Confirmation Dialog */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-blue/30 backdrop-blur-sm p-4 sm:p-6">
          <div className="bg-white rounded-2xl shadow-2xl shadow-brand-blue/10 border border-gray-100 ring-1 ring-black/[0.02] w-full max-w-[95vw] sm:max-w-md p-5 sm:p-6 max-h-[calc(100dvh-2rem)] overflow-y-auto">
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
                  confirmAction.type === 'delete' ? 'bg-red-600 hover:bg-red-700 shadow-md shadow-red-600/25' : 'bg-brand-blue hover:bg-brand-blue-2 shadow-md shadow-brand-blue/25'
                }`}
              >
                {actionLoading ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
        </div>
      </div>
    </main>
  );
}
