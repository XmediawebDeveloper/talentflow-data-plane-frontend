'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import {
  ArrowLeft, ChevronLeft, Video, Clock, Users, Calendar, CheckCircle, Play, Mail,
  XCircle, Copy, Trash2, Archive, ArchiveRestore, GitBranch,
  Loader2, RefreshCw, Briefcase, Globe, ChevronRight, ChevronDown, Check, Brain, Sparkles,
  Layers, Pencil, Zap, Timer, FileText, Settings, CheckCircle2, Download,
  QrCode, AlertCircle, ExternalLink, BarChart, UserRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import { jdService, type JDLineageVersion, type JDResponse } from '@/lib/services/jdService';
import JDIdentityHeader from '@/components/jobs/JDIdentityHeader';
import JDOverviewSections from '@/components/jobs/JDOverviewSections';
import { Button } from '@/components/ui/button';
import type {
  AIInterviewResponse,
  AIInterviewVersionHistoryItem,
  AIInterviewHRQuestion,
} from '@/lib/services/aiInterviewService';
import CandidateResultsView from './CandidateResultsView';
import AIInterviewResults from './AIInterviewResults';
import ShareAIInterviewModal from './ShareAIInterviewModal';
import AIInterviewTrackInvitesModal from '../AIInterviewTrackInvitesModal';
import { QuestionDistributionPopover } from './QuestionDistributionPopover';
import { PROXY_INTEGRITY_VERIFICATION_ENABLED } from '@/lib/constants/featureFlags';
import { formatIST, formatISTDate, formatISTTime, parseIST } from '@/lib/utils/dateUtils';
import { displayInviteScore, inviteResult, ResultBadge } from '@/components/AIInterviewInviteTable';
import { getPriorityLabel } from '@/lib/constants/aiInterviewPriority';
import { modeFromConfig, modeFromDuration } from '@/lib/constants/aiInterviewMode';
import PageBreadcrumb, { type BreadcrumbCrumb } from '@/components/PageBreadcrumb';
import RecordPager from '@/components/RecordPager';
import { Skeleton } from '@/components/ui/skeleton';

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

/* A tab's page heading — the tab's own name and icon, in the same icon-tile +
   title shape the Version History tab already opens with, so every tab's
   page is headed by exactly what its tab says. */
function TabHeading({ icon: Icon, title, description }: { icon: React.ComponentType<{ className?: string }>; title: string; description?: string }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-brand-blue" />
        </div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-slate-50 tracking-tight">{title}</h2>
      </div>
      {description && <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">{description}</p>}
    </div>
  );
}

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
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-semibold uppercase tracking-wide ${
      normalized === 'opening'
        ? 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20'
        : 'bg-success-subtle text-success ring-1 ring-success-line'
    }`}>
      {normalized}
    </span>
  );
}

// Priority labels are imported from lib/constants/aiInterviewPriority (P1-P3 scale).

function PriorityBadge({ p }: { p: number }) {
  const { label, color } = getPriorityLabel(p);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-2xs font-medium rounded-full border ${color}`}>
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
  /**
   * Render ONLY the Interview Details → Configure Details section — no page
   * chrome, header, tabs or background loads. Used by the Send Invite
   * picker's preview popup so a recruiter can check an interview's setup
   * without leaving the dialog.
   */
  configureOnly?: boolean;
  /** Tab to open on — e.g. 'results' when reached from "View Results". */
  initialTab?: 'overview' | 'activity' | 'versions' | 'viewjd' | 'results' | 'invites';
}

export default function AIInterviewDetailsView({ config, onBack, onRefresh, currentIndex, totalCount, onPrev, onNext, breadcrumbItems, configureOnly = false, initialTab }: AIInterviewDetailsViewProps) {
  const router = useRouter();
  const { user, isTenantAdmin } = useAuth();
  const canCreateAIInterviews = isTenantAdmin || !!user?.permissions?.canCreateAIInterviews;
  const canUpdateAIInterviews = isTenantAdmin || !!user?.permissions?.canUpdateAIInterviews;
  const canArchiveAIInterviews = isTenantAdmin || !!user?.permissions?.canArchiveAIInterviews;
  const canDeleteAIInterviews = isTenantAdmin || !!user?.permissions?.canDeleteAIInterviews;
  // Share and Invite are the same action (both open ShareAIInterviewModal to
  // send a candidate their interview link) — checked via the Invite
  // permission so both entry points across the app agree on one gate.
  const canShareAIInterviews = isTenantAdmin || !!user?.permissions?.canInviteAIInterviews;
  const [activeTab, setActiveTab] = useState<'overview' | 'activity' | 'versions' | 'viewjd' | 'results' | 'invites'>(initialTab ?? 'overview');
  // The page stays mounted when the URL moves to another version (Version
  // History's eye icon, from inside this view), so re-apply the requested tab.
  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab, config.id]);
  /* Interview Details' own sub-tabs — Configure Details (what the tab used to
     show outright) and Interview Info (the former standalone "AI Interview
     Info" sidebar item, folded in here since it's the same JD-derived
     metadata about the same interview, just read-only). */
  const [detailsSubTab, setDetailsSubTab] = useState<'configure' | 'info'>('configure');
  const [actionLoading, setActionLoading] = useState(false);
  // Share — a dialog off the header's Share button (Assessment Details'
  // pattern) rather than a tab of its own; ShareAIInterviewModal already
  // supports this as its non-embedded (default) mode.
  const [showShareModal, setShowShareModal] = useState(false);

  // Activity
  const [recentActivity, setRecentActivity] = useState<AIInterviewResponse[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  // Version History
  const [versionHistory, setVersionHistory] = useState<AIInterviewVersionHistoryItem[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);

  /* Header's Job Version dropdown — the Assessment Details header's "Manage
     Jobs · V{n}" pill: the linked JD's own version lineage. A row is only
     clickable when that job version actually has an AI interview config
     (`siblingConfigsByJdId` below) — otherwise there is nothing to open, the
     same rule the Total Jobs tab's View Versions panel applies. */
  const [showJobVersionMenu, setShowJobVersionMenu] = useState(false);
  const jobVersionMenuRef = useRef<HTMLDivElement | null>(null);
  const [jobVersions, setJobVersions] = useState<JDLineageVersion[]>([]);
  const [jobVersionsLoading, setJobVersionsLoading] = useState(false);
  const jobVersionsRequestedFor = useRef<string | null>(null);

  /* Every AI interview config across the tenant, bucketed by the job version
     (`jd_id`) it was authored against — same shape and same two requests
     (paged live + a separate archived fetch) as AllInterviewsTable.tsx's own
     `fetchAll`, because this is the same question that table answers ("every
     interview, regardless of status") asked per job version instead of as a
     flat list. Powers two things: which Job Version rows are clickable, and
     the Interview Version badge's ordinal below (the Nth config authored
     against THIS config's own job version, oldest first — the same rule
     AllInterviewsTable's "Interview Version" column and the Total Jobs
     panel's per-version numbering both use, so this page's number never
     disagrees with those). Loaded once, eagerly, since the badge is static
     and has to be right the moment the page renders — not deferred behind a
     click the way the Job Version list itself can be. */
  const [siblingConfigsByJdId, setSiblingConfigsByJdId] = useState<Map<string, AIInterviewResponse[]>>(new Map());
  const siblingConfigsRequested = useRef(false);

  // Candidate detail
  const [candidateDetail, setCandidateDetail] = useState<AIInterviewResponse | null>(null);
  const [candidateLoading, setCandidateLoading] = useState(false);
  // Ordered candidate ids of the list the detail was opened from (Invites /
  // Results tab), so the inline Candidate Results view can offer Prev/Next
  // between candidates without returning to the list.
  const [candidateNavIds, setCandidateNavIds] = useState<string[]>([]);

  // Confirmation dialog
  const [confirmAction, setConfirmAction] = useState<{ type: string; title: string; message: string; onConfirm: () => void } | null>(null);

  // The full JD record for the View JD tab — same lazy-on-open, cache-per-JD
  // fetch as the Assessment Details page's own View JD tab.
  const [jdFullData, setJdFullData] = useState<JDResponse | null>(null);
  const [jdFullLoading, setJdFullLoading] = useState(false);
  const [jdFullError, setJdFullError] = useState<string | null>(null);

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
    if (configureOnly) return;
    loadActivity();
  }, [loadActivity, configureOnly]);

  useEffect(() => {
    if (activeTab === 'versions') loadVersionHistory();
  }, [activeTab, loadVersionHistory]);

  // Job Version dropdown's list — fetched once, the first time it's opened.
  const ensureJobVersionsLoaded = useCallback(() => {
    if (!config.jd_id) return;
    if (jobVersionsRequestedFor.current === config.jd_id) return;
    jobVersionsRequestedFor.current = config.jd_id;
    setJobVersionsLoading(true);
    jdService.getLineageVersions(config.jd_id)
      .then((versions) => setJobVersions(versions || []))
      .catch(() => setJobVersions([]))
      .finally(() => setJobVersionsLoading(false));
  }, [config.jd_id]);

  // Close the Job Version dropdown on an outside click.
  useEffect(() => {
    if (!showJobVersionMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (jobVersionMenuRef.current && !jobVersionMenuRef.current.contains(e.target as Node)) {
        setShowJobVersionMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showJobVersionMenu]);

  // Every config across the tenant, bucketed by job version — see the state
  // declaration above for why this loads eagerly rather than on demand. Same
  // paged-live + separate-archived fetch AllInterviewsTable.tsx's `fetchAll`
  // uses, deduped the same way.
  useEffect(() => {
    if (configureOnly) return;
    if (siblingConfigsRequested.current) return;
    siblingConfigsRequested.current = true;
    (async () => {
      try {
        const live: AIInterviewResponse[] = [];
        let apiPage = 1;
        for (;;) {
          const batch = await aiInterviewService.listConfigs({ page: apiPage, page_size: 100, compact: true });
          const items = batch.items || [];
          live.push(...items);
          const total = batch.total ?? live.length;
          if (items.length < 100 || live.length >= total) break;
          apiPage += 1;
        }
        const archivedProbe = await aiInterviewService.listConfigs({ status: 'archived', page_size: 1, compact: true });
        const archived = archivedProbe.total > archivedProbe.items.length
          ? (await aiInterviewService.listConfigs({ status: 'archived', page_size: archivedProbe.total, compact: true })).items
          : archivedProbe.items;

        const seen = new Set<string>();
        const byJd = new Map<string, AIInterviewResponse[]>();
        for (const c of [...live, ...archived]) {
          if (seen.has(c.id) || !c.jd_id) continue;
          seen.add(c.id);
          const bucket = byJd.get(c.jd_id);
          if (bucket) bucket.push(c);
          else byJd.set(c.jd_id, [c]);
        }
        setSiblingConfigsByJdId(byJd);
      } catch (error) {
        console.error('Failed to load sibling interview configs:', error);
      }
    })();
  }, []);

  /** The linked interview for a job version row, if one exists — preferring
   *  published, then draft, then any non-archived config, then whatever's
   *  left. Same fallback order the Job Details quick-action handler above
   *  uses to pick "the" config for a job. */
  const linkedConfigForJobVersion = useCallback((jobVersionId: string): AIInterviewResponse | undefined => {
    const bucket = siblingConfigsByJdId.get(jobVersionId);
    if (!bucket || bucket.length === 0) return undefined;
    return bucket.find((c) => c.status === 'published')
      || bucket.find((c) => c.status === 'draft')
      || bucket.find((c) => c.status !== 'archived')
      || bucket[0];
  }, [siblingConfigsByJdId]);

  /** This config's own position among every interview authored against its
   *  job version, oldest first — the "Interview Version" badge's number. */
  const interviewVersionOrdinal = useMemo(() => {
    if (!config.jd_id) return 1;
    const bucket = siblingConfigsByJdId.get(config.jd_id);
    if (!bucket || bucket.length === 0) return 1;
    const sorted = [...bucket].sort(
      (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime(),
    );
    const idx = sorted.findIndex((c) => c.id === config.id);
    return idx >= 0 ? idx + 1 : 1;
  }, [siblingConfigsByJdId, config.jd_id, config.id]);

  // Lazy-fetch the full JD record when the View JD tab is opened — cached
  // per config.jd_id so switching tabs (or back to it) doesn't re-fetch.
  useEffect(() => {
    if (activeTab !== 'viewjd' || !config.jd_id) return;
    if (jdFullData) return;

    let cancelled = false;
    setJdFullLoading(true);
    setJdFullError(null);
    jdService.getById(config.jd_id)
      .then((jd) => {
        if (cancelled) return;
        setJdFullData(jd);
      })
      .catch((error: any) => {
        if (cancelled) return;
        console.error('Failed to fetch JD:', error);
        setJdFullError(error?.message || 'Failed to load job description');
      })
      .finally(() => {
        if (!cancelled) setJdFullLoading(false);
      });

    return () => { cancelled = true; };
  }, [config.jd_id, activeTab, jdFullData]);

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

  // Canonical status → shared Badge variant (same colour for a status everywhere).
  const getStatusVariant = (status: string): 'success' | 'warning' | 'info' | 'destructive' | 'muted' => {
    switch (status) {
      case 'published': return 'success';   // "Active"
      case 'completed': return 'success';
      case 'in_progress': return 'info';
      case 'draft': return 'info';
      case 'invited': return 'info';
      case 'cancelled': return 'destructive';
      case 'archived': return 'muted';
      default: return 'muted';
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

  /* Interview Details → Configure Details, as one value so the Send Invite
     picker's preview (`configureOnly`) can render exactly this section. */
  const configureDetailsContent = (
    <>
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
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ring-1 whitespace-nowrap ${config.environment_verification_enabled ? 'bg-success-subtle text-success ring-success-line' : 'bg-gray-100 text-gray-600 ring-gray-200'}`}>
                    {config.environment_verification_enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </SectionCard>
              )}

              {/* Time Allocation Table (fixed mode only) */}
              {mode === 'fixed' && enabledRounds.length > 0 && (
                <SectionCard title="Time Allocation" icon={Clock}>
                  {/* No .tf-table-shell — a fixed, at-most-3-row table that
                      should size to its content, not the shell's 400px min-height. */}
                  <div className="overflow-hidden rounded-lg border border-gray-100 ring-1 ring-black/[0.02]">
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
                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-brand-cyan text-white text-2xs font-bold flex items-center justify-center mt-0.5 shadow-sm">{idx + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-800">{q.question_text}</p>
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                <span className="text-2xs text-gray-500">{q.answer_type === 'yes_no' ? 'Yes / No' : 'Text answer'}</span>
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
                        <Badge variant="success"><Video className="w-3 h-3" /> Enabled</Badge>
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

    </>
  );

  if (configureOnly) {
    return <div className="space-y-5">{configureDetailsContent}</div>;
  }

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
      <div className="mx-auto w-full max-w-[1600px]">
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
      {/* Header — the Assessment Details summary card
          (`AssessmentDetailsView.tsx`), copied rather than reinvented: white
          card, brand-blue border/ring, a solid ID pill + plain-weight title
          + status on row 1, and a quiet bulleted fact line ending on the
          mode/round/version chips on row 2. */}
      <div className="mb-4">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-brand-blue/30 dark:border-brand-blue/40 ring-1 ring-brand-blue/10 dark:ring-brand-blue/20 shadow-sm shadow-brand-blue/10 p-4 sm:p-5">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {/* Row 1: JD-151  Title  Status. The JD ID leads, in the badge
                  every list uses for it — it replaced the AI-### interview id
                  here, and with it the "Linked to JD-###" fact below. */}
              <div className="flex flex-wrap items-center gap-2 mb-2">
                {config.jd_short_id && (
                  <JobIdBadge className="flex-shrink-0">{config.jd_short_id}</JobIdBadge>
                )}
                <h1 className="font-normal text-gray-900 dark:text-slate-50 text-base sm:text-lg truncate">
                  {config.jd_title || config.position || 'Untitled'}
                </h1>
                <Badge variant={getStatusVariant(config.status)}>{getStatusLabel(config.status)}</Badge>
              </div>

              {/* Row 2: quiet bulleted facts. Experience level and the invite count
                  are not repeated here: the Interview Info panel and the
                  Invitation Status tab carry them. */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-600 dark:text-slate-400">
                {([
                  { key: 'duration', icon: Clock, label: formattedDuration },
                  { key: 'created-at', icon: Calendar, label: config.created_at ? `Created ${formatIST(config.created_at)}` : null },
                  { key: 'created-by', icon: UserRound, label: config.created_by_name ? `By ${config.created_by_name}` : null },
                  { key: 'updated-at', icon: Calendar, label: config.updated_at ? `Last Updated ${formatIST(config.updated_at)}` : null },
                ] as { key: string; icon: typeof Clock | null; label: string | null }[])
                  .filter((fact) => !!fact.label)
                  .map((fact, i) => (
                    <React.Fragment key={fact.key}>
                      {i > 0 && <span aria-hidden className="text-gray-300">&bull;</span>}
                      <div className="flex items-center gap-1.5 min-w-0">
                        {fact.icon && <fact.icon className="w-4 h-4 flex-shrink-0" />}
                        <span className="truncate" title={fact.label ?? undefined}>{fact.label}</span>
                      </div>
                    </React.Fragment>
                  ))}
              </div>

              {/* Row 3: mode/round/version badges, on their own line below the facts. */}
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${
                  interviewMode === 'flexible'
                    ? 'bg-brand-cyan/10 text-brand-cyan ring-brand-cyan/20'
                    : 'bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20'
                }`}>
                  {interviewMode === 'flexible' ? (
                    <><Zap className="w-3 h-3" /> Flexible</>
                  ) : (
                    <><Timer className="w-3 h-3" /> Timed</>
                  )}
                </span>
                {enabledRounds.map((r, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-brand-blue/10 text-brand-blue rounded-full ring-1 ring-brand-blue/20">
                    <Layers className="w-3 h-3" /> {ROUND_LABELS[r.type] || r.type}
                  </span>
                ))}
                {/* Job Version — the Assessment Details header's "Manage
                    Jobs · V{n}" pill. Each row opens the AI interview
                    authored against that job version (same destination the
                    Total Jobs tab's View Versions panel opens), never the
                    Job Description page — so a row with no interview has
                    nowhere to go and is disabled rather than clickable. */}
                {config.jd_id && (
                  <div className="relative" ref={jobVersionMenuRef}>
                    <button
                      type="button"
                      onClick={() => {
                        const opening = !showJobVersionMenu;
                        setShowJobVersionMenu(opening);
                        if (opening) ensureJobVersionsLoaded();
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-600 text-white rounded-full text-xs font-medium hover:bg-purple-700 transition-colors whitespace-nowrap"
                      aria-label={`Job version, currently V${config.jd_version ?? 1}`}
                      aria-haspopup="menu"
                      aria-expanded={showJobVersionMenu}
                      title="View job version history"
                    >
                      Job Version
                      <span aria-hidden className="text-white/50">&middot;</span>
                      V{config.jd_version ?? 1}
                      <ChevronDown className={`w-3 h-3 transition-transform ${showJobVersionMenu ? 'rotate-180' : ''}`} />
                    </button>

                    {showJobVersionMenu && (
                      <div
                        role="menu"
                        aria-label="Job versions"
                        className="absolute left-0 top-full mt-2 w-72 max-w-[calc(100vw-2rem)] bg-white dark:bg-slate-900 rounded-xl shadow-lg shadow-brand-blue/10 border border-gray-200 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] z-50 overflow-hidden">
                        <div className="flex items-baseline justify-between gap-2 px-3 py-2">
                          <span className="text-xs font-semibold text-gray-900 dark:text-slate-100 tracking-tight">Job Versions</span>
                          <span className="text-2xs text-gray-500 dark:text-slate-400">
                            {jobVersions.length} version{jobVersions.length === 1 ? '' : 's'}
                          </span>
                        </div>
                        <div className="border-t border-gray-100 dark:border-slate-700/60" />
                        <div className="max-h-72 overflow-y-auto py-1">
                          {jobVersionsLoading ? (
                            <div className="px-3 py-3 flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
                              <Loader2 className="w-3 h-3 animate-spin text-brand-blue" /> Loading job versions…
                            </div>
                          ) : jobVersions.length === 0 ? (
                            <div className="px-3 py-3 text-xs text-gray-500 dark:text-slate-400">No versions available</div>
                          ) : (
                            jobVersions.map((version) => {
                              const isCurrent = version.id === config.jd_id;
                              const linkedConfig = linkedConfigForJobVersion(version.id);
                              const clickable = isCurrent || !!linkedConfig;
                              return (
                                <button
                                  key={version.id}
                                  type="button"
                                  role="menuitem"
                                  aria-current={isCurrent ? 'true' : undefined}
                                  disabled={!clickable}
                                  onClick={() => {
                                    if (!clickable) return;
                                    setShowJobVersionMenu(false);
                                    if (!isCurrent && linkedConfig) {
                                      router.push(`/recruitment/ai-interviews/${linkedConfig.id}`);
                                    }
                                  }}
                                  title={!clickable ? 'No AI interview has been created for this job version' : undefined}
                                  className={`w-full px-3 py-2 text-left transition-colors ${
                                    !clickable
                                      ? 'opacity-50 cursor-not-allowed'
                                      : isCurrent
                                        ? 'bg-brand-blue/5 hover:bg-brand-blue/10'
                                        : 'hover:bg-brand-blue/5'
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="w-4 flex-shrink-0 flex items-center justify-center">
                                      {isCurrent && <Check className="w-3.5 h-3.5 text-brand-blue" />}
                                    </span>
                                    <span className="text-sm font-semibold text-gray-900 dark:text-slate-100 tabular-nums flex-shrink-0">
                                      V{version.version_number}
                                    </span>
                                    {version.is_latest_version && (
                                      <span className="flex-shrink-0 text-2xs px-1.5 py-0.5 rounded-full font-medium bg-brand-blue/10 text-brand-blue">
                                        Current
                                      </span>
                                    )}
                                    <Badge variant={getStatusVariant(version.status)} className="flex-shrink-0 text-2xs px-1.5 py-0.5">
                                      {getStatusLabel(version.status)}
                                    </Badge>
                                    <span aria-hidden className="ml-auto flex-shrink-0 text-2xs font-medium text-brand-blue">
                                      {isCurrent ? 'Linked' : clickable ? 'View' : 'No interview'}
                                    </span>
                                  </div>
                                  {(version.published_at || version.created_at) && (
                                    <div className="pl-6 mt-0.5 text-2xs text-gray-500 dark:text-slate-400">
                                      {formatIST(version.published_at || version.created_at || '')}
                                    </div>
                                  )}
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Interview Version — static. An AI interview config is one
                    evolving record, not a family of standalone records the
                    way an assessment is, so there is nothing for this badge
                    to switch to; it states the fact (this config's ordinal
                    among every interview authored against its job version)
                    and stops there. */}
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-brand-blue text-white rounded-full text-xs font-medium whitespace-nowrap">
                  Interview Version
                  <span aria-hidden className="text-white/50">&middot;</span>
                  V{interviewVersionOrdinal}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0 self-start flex-wrap">
              {/* Share — a dialog now, not a tab; same slot & styling the
                  Assessment Details header's Share button uses. */}
              {config.status === 'published' && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    if (!canShareAIInterviews) {
                      toast.error('You do not have permission to invite candidates to an AI interview');
                      return;
                    }
                    setShowShareModal(true);
                  }}
                  aria-disabled={!canShareAIInterviews}
                  className={!canShareAIInterviews ? 'opacity-50 cursor-not-allowed' : ''}
                  title={!canShareAIInterviews ? 'You do not have permission to invite candidates to an AI interview' : ''}
                  icon={<Mail className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                >
                  Invite
                </Button>
              )}
              {config.status === 'draft' && config.jd_id && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    if (!canUpdateAIInterviews) {
                      toast.error('You do not have permission to edit AI interviews');
                      return;
                    }
                    const url = `/recruitment/ai-interviews/jd-selection/ai-interview-config?jd_id=${config.jd_id}&config_id=${config.id}`;
                    router.push(url);
                  }}
                  aria-disabled={!canUpdateAIInterviews}
                  title={!canUpdateAIInterviews ? 'You do not have permission to edit AI interviews' : ''}
                  icon={<Pencil className="w-3.5 h-3.5 flex-shrink-0" />}
                  className={`gap-1.5 px-3 sm:px-4 min-h-[40px] text-xs sm:text-sm ${!canUpdateAIInterviews ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <span className="hidden sm:inline">Continue Editing</span>
                  <span className="sm:hidden">Edit</span>
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={handleExportCSV}
                title="Export clusters & HR questions to CSV"
                aria-label="Export to CSV"
                className="px-2 min-w-[40px] min-h-[40px]"
              >
                <Download className="w-4 h-4" />
              </Button>
              {onRefresh && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onRefresh}
                  aria-label="Refresh"
                  className="px-2 min-w-[40px] min-h-[40px]"
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Unified detail layout: vertical navigation on the left, the selected
          tab's content on the right — the same grid, aside chrome and button
          states as the Assessment Details page (`AssessmentDetailsView.tsx`),
          so the two detail pages read as one screen. The strip this replaced
          was horizontal and scrolled sideways (`overflow-x-auto
          scrollbar-hide`), so with seven tabs the last of them was
          off-screen and undiscoverable under a wide desktop. */}
      {/* Below md the nav stacks ABOVE the content as a 2–3 column grid of
          the same buttons — a fixed side column there left a phone's table
          ~150px wide. From md it is the side column again, narrower until xl
          so the Results table keeps its width on laptops. */}
      <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-[200px_minmax(0,1fr)] md:gap-4 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)] xl:gap-6">
        <aside className="md:sticky md:top-20 self-start bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5">
          <nav className="p-2 sm:p-3" aria-label="Interview details sections">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:flex md:flex-col gap-1.5">
              {([
                { key: 'overview', label: 'Interview Details', icon: FileText },
                { key: 'invites', label: 'Invitation Status', icon: Mail },
                { key: 'results', label: 'Results', icon: BarChart },
                { key: 'activity', label: 'Recent Activity', icon: Clock },
                { key: 'viewjd', label: 'View JD', icon: Briefcase },
                { key: 'versions', label: 'Revision History', icon: Layers },
              ] as { key: typeof activeTab; label: string; icon: typeof FileText }[]).map((t) => {
                const isActive = activeTab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setActiveTab(t.key)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full rounded-lg px-3 py-2.5 text-left text-xs sm:text-sm transition-colors flex items-center gap-2 ${
                      isActive
                        ? 'bg-brand-blue/5 text-brand-blue font-medium ring-1 ring-brand-blue/20'
                        : 'text-gray-600 dark:text-slate-400 hover:bg-brand-blue/5 hover:text-brand-blue'
                    }`}
                  >
                    <t.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                    <span className="min-w-0 leading-snug">{t.label}</span>
                  </button>
                );
              })}
            </div>
          </nav>
          {/* Straight through to the job's own page, under the tabs. */}
          {config.jd_id && (
            <div className="border-t border-gray-100 dark:border-slate-700/60 px-2 sm:px-3 py-2.5">
              <button
                type="button"
                onClick={() => router.push(`/recruitment/job-details?id=${config.jd_id}`)}
                className="w-full inline-flex items-center justify-center md:justify-start gap-1.5 rounded-lg px-3 py-2 text-xs sm:text-sm font-medium text-brand-blue hover:text-brand-blue-2 hover:underline underline-offset-2 hover:bg-brand-blue/5 transition-colors"
              >
                Go to JD
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </aside>

        {/* Content — `min-w-0` so a wide table inside a tab scrolls in its own
            box instead of stretching the grid column and pushing the nav off
            the page. */}
        <div className="min-w-0 overflow-x-auto scroll-mt-24 py-4 sm:py-6 space-y-4 sm:space-y-6">

          {/* JD staleness banner — shows when the linked JD was edited after
              this interview config was created. Computed by the single-config
              GET endpoint (see _compute_jd_staleness in the router). */}
          {config.jd_stale && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-xl border border-warning-line bg-warning-subtle px-4 py-3"
            >
              <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-warning text-white text-2xs font-bold">
                !
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-warning-strong">
                  Linked JD has changed since this interview was configured
                </p>
                <p className="mt-0.5 text-xs text-warning-strong">
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
                    className="mt-2 inline-flex items-center gap-1 rounded-md border border-warning-line bg-white px-2.5 py-1 text-xs font-medium text-warning-strong hover:bg-warning-subtle"
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
              <TabHeading icon={FileText} title="Interview Details" />

              {/* Interview Details' own sub-tabs — Configure Details (this
                  tab's original content) and Interview Info (folded in from
                  the sidebar's former "AI Interview Info" item). */}
              <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
                {([
                  { key: 'configure', label: 'Configure Details' },
                  { key: 'info', label: 'Interview Info' },
                ] as const).map((tab) => {
                  const isActive = detailsSubTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => setDetailsSubTab(tab.key)}
                      className={`px-3 py-1.5 min-h-[32px] rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                        isActive
                          ? 'bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/10 ring-1 ring-brand-blue/20 text-brand-blue'
                          : 'text-gray-600 dark:text-slate-400 hover:text-brand-blue'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {detailsSubTab === 'configure' && configureDetailsContent}

              {/* Interview Info sub-tab — formerly the sidebar's own "AI
                  Interview Info" item. */}
              {detailsSubTab === 'info' && (() => {
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
                    expert: 'bg-destructive-subtle text-destructive ring-1 ring-destructive-line',
                  };
                  return val ? (map[val] || 'bg-gray-100 text-gray-700 ring-1 ring-gray-200') : 'bg-gray-100 text-gray-700 ring-1 ring-gray-200';
                };
                const mthSkills: string[] = config.jd_must_have_skills || [];
                const nthSkills: string[] = config.jd_nice_to_have_skills || [];
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
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ring-1 ${config.recording_enabled ? 'bg-success-subtle text-success ring-success-line' : 'bg-gray-100 text-gray-600 ring-gray-200'}`}>
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
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ring-1 ${config.environment_verification_enabled ? 'bg-success-subtle text-success ring-success-line' : 'bg-gray-100 text-gray-600 ring-gray-200'}`}>
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

            </div>
          )}


          {/* Recent Activity Tab */}
          {activeTab === 'activity' && (
            <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-6">
              <TabHeading icon={Clock} title="Recent Activity" />
              {activityLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 p-4 border border-gray-100 ring-1 ring-black/[0.02] rounded-lg">
                      <Skeleton className="w-5 h-5 rounded-full flex-shrink-0" />
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-5 w-20 rounded-full" />
                        </div>
                        <Skeleton className="h-3 w-40" />
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0">
                        <Skeleton className="h-3 w-20" />
                        <Skeleton className="h-4 w-4" />
                      </div>
                    </div>
                  ))}
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
                        case 'completed': return <CheckCircle className="w-5 h-5 text-success" />;
                        case 'in_progress': return <Play className="w-5 h-5 text-brand-orange-deep" />;
                        case 'invited': return <Mail className="w-5 h-5 text-brand-blue" />;
                        case 'cancelled': return <XCircle className="w-5 h-5 text-destructive" />;
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
                            <Badge variant={getStatusVariant(activity.status)}>
                              {getStatusLabel(activity.status)}
                            </Badge>
                          </div>
                          <div className="text-sm text-gray-500 truncate">{activity.candidate_email}</div>
                          {/* Score + Pass/Fail — the same Must-Have % and
                              result the invite tables show; only once scored. */}
                          {(() => {
                            const score = displayInviteScore(activity);
                            if (score == null) return null;
                            return (
                              <div className="flex items-center gap-2 mt-1.5">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-slate-50 ring-1 ring-gray-200 text-gray-600">
                                  Score:
                                  <span className={`font-semibold ${score >= 60 ? 'text-success' : 'text-destructive'}`}>{score}%</span>
                                </span>
                                <ResultBadge result={inviteResult(activity, score)} />
                              </div>
                            );
                          })()}
                        </div>
                        <div className="flex items-center gap-4 flex-shrink-0">
                          {/* Time above the date. */}
                          <div className="text-xs text-gray-400 text-right leading-snug">
                            <div>{formatISTTime(activity.completed_at || activity.started_at || activity.created_at).toLowerCase()}</div>
                            <div>{formatISTDate(activity.completed_at || activity.started_at || activity.created_at)}</div>
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
                    <Layers className="w-4 h-4 text-brand-blue" />
                  </div>
                  <h2 className="text-base font-semibold text-gray-900 tracking-tight">Revision History</h2>
                </div>
                {/* Names the two numbers apart on the one screen that shows
                    both: the header badge is the INTERVIEW VERSION (which
                    interview this is for the job version), these are its
                    REVISIONS (each save of it). */}
                <p className="text-sm text-gray-600">
                  Every change saved to Interview Version V{interviewVersionOrdinal} of this job, newest first
                </p>
              </div>
              {versionsLoading ? (
                <div className="p-6 space-y-6">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-start gap-4">
                      <Skeleton className="w-12 h-12 rounded-full flex-shrink-0" />
                      <div className="flex-1 min-w-0 space-y-2">
                        <Skeleton className="h-5 w-48" />
                        <Skeleton className="h-4 w-64" />
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-4 w-52" />
                        <Skeleton className="h-20 w-full rounded-lg mt-2" />
                      </div>
                    </div>
                  ))}
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
                          {/* R, not V. `AIInterviewVersionHistory.version` counts
                               SAVES of this one config — it reached 11 here while
                               the header's "Interview Version · V1" (the ordinal
                               among configs authored against this job version,
                               the number the results table, invite table and list
                               all print) was still 1. Two different quantities
                               both labelled "Version" on one screen is the whole
                               bug; this timeline owns the revision counter, so it
                               says Revision. */}
                          <div className="w-12 h-12 bg-brand-cyan rounded-full flex items-center justify-center flex-shrink-0 shadow-md shadow-brand-cyan/25 ring-1 ring-white/20">
                            <span className="text-white font-bold text-sm">R{version.version}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-1">
                              <h4 className="text-base font-semibold text-gray-900 tracking-tight">
                                Revision {version.version} {isFirstVersion ? 'Published' : 'Updated'}
                              </h4>
                              {isCurrentVersion && (
                                <span className="px-2.5 py-1 bg-brand-blue text-white text-xs font-medium rounded shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 w-fit">
                                  Current
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
                                {isFirstVersion ? 'Initial Configuration:' : 'Updated Configuration:'}
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

          {/* View JD Tab — the linked job description, read-only, the same
              components (and so the same reading) the Job Details page and
              the Assessment Details page's own View JD tab use. */}
          {activeTab === 'viewjd' && (
            <div className="space-y-4 sm:space-y-5">
              <TabHeading icon={Briefcase} title="View JD" />
              {!config.jd_id ? (
                <div className="bg-white rounded-xl border border-gray-200 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 px-3 sm:px-4 lg:px-6 py-8 text-center">
                  <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No linked job description found</p>
                </div>
              ) : jdFullError ? (
                <div className="bg-white rounded-xl border border-gray-200 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 px-3 sm:px-4 lg:px-6 py-8 text-center">
                  <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
                  <p className="text-sm text-destructive">{jdFullError}</p>
                </div>
              ) : jdFullLoading || !jdFullData ? (
                <div className="bg-white rounded-xl border border-gray-200 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 px-3 sm:px-4 lg:px-6 py-12 flex items-center justify-center tf-loader-center">
                  <Loader2 className="w-6 h-6 text-brand-blue animate-spin" />
                </div>
              ) : (
                <>
                  <JDIdentityHeader jd={jdFullData} versionNumber={config.jd_version ?? undefined} />

                  <JDOverviewSections jd={jdFullData} />

                  {/* The way through to the JD's own page, where everything
                      here is editable. */}
                  <div className="flex justify-end">
                    <button
                      onClick={() => router.push(`/recruitment/job-details?id=${jdFullData.id}`)}
                      className="inline-flex items-center gap-1.5 text-xs sm:text-sm text-brand-blue hover:text-brand-blue-2 transition-colors"
                    >
                      Open full JD page
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Results Tab — embedded candidate results (stats + filters + table) */}
          {activeTab === 'results' && (
            <div>
              <TabHeading icon={BarChart} title="Results" />
              <AIInterviewResults
                embedded
                showStats
                // This page is one interview version — the rows all share it.
                hideVersionDetails
                configId={config.id}
                configTitle={config.position || config.jd_title || 'AI Interview'}
                jdTitle={config.jd_title || ''}
                onBack={onBack}
                onViewCandidate={handleCandidateClick}
                jobVersion={config.jd_version ?? undefined}
                interviewVersion={interviewVersionOrdinal}
              />
            </div>
          )}

          {/* Track Tab — the AI Interview Track Invites popup (the same one
              the AI Interviews list and Job Details open over their own
              pages), embedded here as this page's own view instead of a
              popup over it. */}
          {activeTab === 'invites' && (
            <AIInterviewTrackInvitesModal
              embedded
              isOpen
              onClose={() => {}}
              configId={config.id}
              jdTitle={config.jd_title || config.position || 'Untitled'}
              jdShortId={config.jd_short_id}
              hideVersionDetails
              // Completed rows offer View Result — swap the popup for the
              // same inline candidate result view the Results tab opens.
              onViewResult={(inv) => handleCandidateClick(inv.id)}
            />
          )}

        </div>
      </div>

      {/* Share — a dialog off the header's Share button / Invites tab's
          "Invite More", not embedded in a tab. */}
      {config.status === 'published' && canShareAIInterviews && (
        <ShareAIInterviewModal
          isOpen={showShareModal}
          config={config}
          interviewVersion={interviewVersionOrdinal}
          onClose={() => setShowShareModal(false)}
          onInviteSent={() => { loadActivity(); }}
        />
      )}

      {/* Confirmation Dialog */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-blue/30 backdrop-blur-sm p-4 sm:p-6">
          <div className="bg-white rounded-2xl shadow-2xl shadow-brand-blue/10 border border-gray-100 ring-1 ring-black/[0.02] w-full max-w-[95vw] sm:max-w-md p-5 sm:p-6 max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-2 tracking-tight">{confirmAction.title}</h3>
            <p className="text-sm text-gray-600 mb-6">{confirmAction.message}</p>
            <div className="flex items-center justify-end gap-3">
              <Button variant="secondary" size="md" onClick={() => setConfirmAction(null)}>
                Cancel
              </Button>
              <Button
                variant={confirmAction.type === 'delete' ? 'danger' : 'primary'}
                size="md"
                onClick={confirmAction.onConfirm}
                disabled={actionLoading}
              >
                {actionLoading ? 'Processing...' : 'Confirm'}
              </Button>
            </div>
          </div>
        </div>
      )}
        </div>
      </div>
    </main>
  );
}
